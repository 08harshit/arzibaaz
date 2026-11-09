import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'ab-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="navbar-brand">
        <span class="brand-logo">✈</span>
        <span class="brand-name">ArziBaaz</span>
        <span
          class="auth-dot"
          [class.online]="auth.isAuthenticated()"
          [title]="auth.isAuthenticated() ? 'Logged in as ' + (auth.user()?.email || 'user') : 'Not logged in'"
        ></span>
      </div>
      <div class="navbar-links">
        <a routerLink="/application" routerLinkActive="active" title="Application">
          <span class="nav-icon">📋</span>
        </a>
        <a routerLink="/profile" routerLinkActive="active" title="Profile">
          <span class="nav-icon">👤</span>
        </a>
        <a routerLink="/answer-library" routerLinkActive="active" title="Answer Library">
          <span class="nav-icon">📚</span>
        </a>
        <a routerLink="/application-history" routerLinkActive="active" title="Application History">
          <span class="nav-icon">🕘</span>
        </a>
        <a routerLink="/settings" routerLinkActive="active" title="Settings">
          <span class="nav-icon">⚙️</span>
        </a>
      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #1a73e8;
      color: white;
    }

    .navbar-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-logo {
      font-size: 18px;
    }

    .brand-name {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .auth-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #dadce0;
      transition: background 200ms;
    }

    .auth-dot.online {
      background: #34a853;
      box-shadow: 0 0 6px rgba(52, 168, 83, 0.8);
    }

    .navbar-links {
      display: flex;
      gap: 4px;
    }

    .navbar-links a {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      text-decoration: none;
      transition: background 150ms ease;
      color: white;
      opacity: 0.7;
    }

    .navbar-links a:hover,
    .navbar-links a.active {
      background: rgba(255, 255, 255, 0.2);
      opacity: 1;
    }

    .nav-icon {
      font-size: 16px;
    }
  `],
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
}
