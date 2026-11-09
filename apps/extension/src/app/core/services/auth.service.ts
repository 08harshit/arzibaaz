import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase: SupabaseClient;

  readonly user = signal<User | null>(null);
  readonly session = signal<Session | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isLoading = signal<boolean>(true);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getSession();
      this.handleSessionUpdate(data.session);

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this.handleSessionUpdate(session);
      });
    } catch (err) {
      console.warn('[ArziBaaz Auth] Could not retrieve session:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  private handleSessionUpdate(session: Session | null): void {
    this.session.set(session);
    this.user.set(session?.user ?? null);

    const token = session?.access_token ?? null;

    // Persist to chrome.storage.session for background worker access
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.set({ authToken: token }).catch(() => {});
    }

    // Notify background worker
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          type: 'AUTH_STATE_CHANGED',
          payload: { isAuthenticated: token !== null },
        })
        .catch(() => {});
    }
  }

  getAccessToken(): string | null {
    return this.session()?.access_token ?? null;
  }

  async signUp(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        // Where the email-confirmation link lands. Must be listed under Supabase Auth > URL Configuration > Redirect URLs.
        options: { emailRedirectTo: `${environment.apiUrl}/auth/confirmed` },
      });
      if (error) return { user: null, error };
      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err as Error };
    }
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ session: Session | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { session: null, error };
      return { session: data.session, error: null };
    } catch (err) {
      return { session: null, error: err as Error };
    }
  }

  async signInWithGoogle(): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof chrome !== 'undefined' && chrome.identity
            ? chrome.identity.getRedirectURL()
            : window.location.origin,
        },
      });
      return { error: error ?? null };
    } catch (err) {
      return { error: err as Error };
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.handleSessionUpdate(null);
    }
  }
}
