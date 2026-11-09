import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'mock-jwt-token',
              user: { id: 'usr-123', email: 'user@example.com' },
            },
          },
        }),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: 'new-user', email: 'new@example.com' } },
          error: null,
        }),
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'logged-in-token',
              user: { id: 'usr-123', email: 'user@example.com' },
            },
          },
          error: null,
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    })),
  };
});

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it('initializes and computes authenticated status from session', async () => {
    // Wait for microtask resolution of getSession()
    await new Promise((r) => setTimeout(r, 10));

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getAccessToken()).toBe('mock-jwt-token');
    expect(service.user()?.email).toBe('user@example.com');
  });

  it('signs in with email and password', async () => {
    const result = await service.signInWithPassword('user@example.com', 'password123');
    expect(result.error).toBeNull();
    expect(result.session?.access_token).toBe('logged-in-token');
  });

  it('signs out and clears user session state', async () => {
    await service.signOut();
    expect(service.user()).toBeNull();
    expect(service.getAccessToken()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
