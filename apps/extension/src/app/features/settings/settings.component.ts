import { Component } from '@angular/core';

@Component({
  selector: 'ab-settings',
  standalone: true,
  template: `
    <div class="page">
      <h2 class="page-title">Settings</h2>
      <div class="empty-state">
        <p class="empty-icon">⚙️</p>
        <p class="empty-text">Settings coming in a later milestone.</p>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 8px 0; }
    .page-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #202124; }
    .empty-state { text-align: center; padding: 40px 16px; color: #5f6368; }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .empty-text { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
  `],
})
export class SettingsComponent {}
