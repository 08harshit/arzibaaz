/**
 * ArziBaaz Background Service Worker
 *
 * Responsibilities:
 * - Extension lifecycle management (install, update)
 * - Message routing between content scripts and side panel
 * - Side panel activation on toolbar click
 * - Authentication token coordination
 *
 * IMPORTANT: Chrome may suspend and restart this service worker at any time.
 * Never rely on global variables for durable state.
 * Use chrome.storage.session for ephemeral state within a browser session.
 */

import { isExtensionMessage } from '@arzi-baaz/contracts';

// Open the side panel when the user clicks the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[ArziBaaz SW] Failed to set panel behavior:', err));

// Lifecycle events
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ArziBaaz SW] Installed:', details.reason);
});

/**
 * Message router.
 * Routes typed messages between content scripts and the side panel.
 * All messages must conform to ExtensionMessage from @arzi-baaz/contracts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    console.warn('[ArziBaaz SW] Received unknown message shape', message);
    return false;
  }

  console.log('[ArziBaaz SW] Routing message:', message.type, 'from tab:', sender.tab?.id);

  switch (message.type) {
    case 'SCAN_FORM': {
      // Forward scan request to the active tab's content script
      forwardToActiveTab(message).catch(console.error);
      return false;
    }

    case 'FORM_SCAN_RESULT':
    case 'JOB_DESCRIPTION_RESULT':
    case 'FIELD_FILL_RESULT':
    case 'FILL_RESULTS': {
      // Content scripts' runtime.sendMessage already reaches the side panel directly;
      // re-broadcasting from here would deliver duplicates.
      return false;
    }

    case 'FILL_FIELD':
    case 'FILL_APPROVED_FIELDS':
    case 'HIGHLIGHT_FIELDS':
    case 'CLEAR_HIGHLIGHTS': {
      // Forward fill instructions to the active tab
      forwardToActiveTab(message).catch(console.error);
      return false;
    }

    case 'GET_AUTH_TOKEN': {
      // Retrieve stored auth token and respond
      chrome.storage.session.get(['authToken'], (result) => {
        sendResponse({ type: 'AUTH_TOKEN_RESULT', payload: { token: result['authToken'] ?? null } });
      });
      return true; // Keep channel open for async response
    }

    default:
      return false;
  }
});

async function forwardToActiveTab(message: unknown): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    console.warn('[ArziBaaz SW] No active tab found');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Tabs opened before the extension was installed/reloaded have no content script yet.
    // Inject it into every frame (activeTab grants access after the user opens the panel) and retry once.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, message);
  }
}

