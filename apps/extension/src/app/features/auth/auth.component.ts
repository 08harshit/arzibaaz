import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

/** Turns raw Supabase errors into something a person can act on. */
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'Wrong email or password. If you just signed up, confirm your email first (check spam).';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Your email is not confirmed yet. Open the confirmation link we emailed you, then sign in.';
  }
  if (/rate limit|too many|over_email_send_rate_limit/i.test(message)) {
    return 'Too many emails were sent. Wait about an hour before trying again, or sign in if you already have an account.';
  }
  if (/already (been )?registered|already exists/i.test(message)) {
    return 'This email already has an account. Switch to Sign in.';
  }
  if (/password should be at least|weak password/i.test(message)) {
    return 'Choose a longer password (at least 6 characters).';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Cannot reach the server. Check your internet connection and try again.';
  }
  return message;
}

@Component({
  selector: 'ab-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-card">
      <div class="auth-header">
        <div class="logo">✈</div>
        <h2>Welcome to ArziBaaz</h2>
        <p class="subtitle">Your multi-user job application copilot</p>
      </div>

      <div class="auth-tabs">
        <button
          type="button"
          class="tab-btn"
          [class.active]="isLoginMode()"
          (click)="setMode(true)"
        >
          Sign In
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.active]="!isLoginMode()"
          (click)="setMode(false)"
        >
          Register
        </button>
      </div>

      @if (errorMessage()) {
        <div class="error-banner">
          {{ errorMessage() }}
        </div>
      }

      @if (successMessage()) {
        <div class="success-banner">
          {{ successMessage() }}
        </div>
      }

      <form (ngSubmit)="onSubmit()" class="auth-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            [(ngModel)]="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            [(ngModel)]="password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="submit-btn" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner"></span> Processing...
          } @else {
            {{ isLoginMode() ? 'Sign In' : 'Create Account' }}
          }
        </button>
      </form>

      <div class="divider">
        <span>OR</span>
      </div>

      <button
        type="button"
        class="google-btn"
        (click)="onGoogleLogin()"
        [disabled]="loading()"
      >
        <svg class="google-icon" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Continue with Google
      </button>
    </div>
  `,
  styles: [`
    .auth-card {
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .auth-header {
      text-align: center;
    }

    .logo {
      font-size: 32px;
      margin-bottom: 8px;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #202124;
      margin-bottom: 4px;
    }

    .subtitle {
      font-size: 13px;
      color: #5f6368;
    }

    .auth-tabs {
      display: flex;
      border-radius: 8px;
      background: #f1f3f4;
      padding: 4px;
    }

    .tab-btn {
      flex: 1;
      padding: 8px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      color: #5f6368;
      transition: all 150ms ease;
    }

    .tab-btn.active {
      background: #ffffff;
      color: #1a73e8;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .error-banner {
      background: #fce8e6;
      border: 1px solid #fad2cf;
      color: #c5221f;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
    }

    .success-banner {
      background: #e6f4ea;
      border: 1px solid #ceead6;
      color: #137333;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
    }

    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    label {
      font-size: 12px;
      font-weight: 500;
      color: #3c4043;
    }

    input {
      padding: 10px 12px;
      border: 1px solid #dadce0;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      transition: border-color 150ms;
    }

    input:focus {
      border-color: #1a73e8;
    }

    .submit-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
      transition: background 150ms;
    }

    .submit-btn:hover:not(:disabled) {
      background: #1557b0;
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: #80868b;
      font-size: 11px;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #e8eaed;
    }

    .divider span {
      padding: 0 8px;
    }

    .google-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 10px;
      border: 1px solid #dadce0;
      border-radius: 6px;
      background: white;
      font-size: 13px;
      font-weight: 500;
      color: #3c4043;
      cursor: pointer;
      transition: background 150ms;
    }

    .google-btn:hover:not(:disabled) {
      background: #f8f9fa;
    }

    .google-icon {
      width: 18px;
      height: 18px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid white;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 600ms linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class AuthComponent {
  private readonly auth = inject(AuthService);

  readonly isLoginMode = signal<boolean>(true);
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  email = '';
  password = '';

  setMode(login: boolean) {
    this.isLoginMode.set(login);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  async onSubmit() {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.email || !this.password) {
      this.errorMessage.set('Please enter both email and password.');
      return;
    }

    this.loading.set(true);

    try {
      if (this.isLoginMode()) {
        const { error } = await this.auth.signInWithPassword(this.email, this.password);
        if (error) {
          this.errorMessage.set(friendlyAuthError(error.message));
        }
      } else {
        const { error } = await this.auth.signUp(this.email, this.password);
        if (error) {
          this.errorMessage.set(friendlyAuthError(error.message));
        } else {
          this.successMessage.set(
            'Account created. Open the confirmation link we emailed you, then come back and sign in.',
          );
          this.isLoginMode.set(true);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onGoogleLogin() {
    this.errorMessage.set(null);
    this.loading.set(true);
    try {
      const { error } = await this.auth.signInWithGoogle();
      if (error) {
        this.errorMessage.set(friendlyAuthError(error.message));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
