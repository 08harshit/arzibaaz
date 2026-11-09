import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './core/navbar/navbar.component';

@Component({
  selector: 'ab-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="extension-shell">
      <ab-navbar />
      <main class="extension-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .extension-shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }

    .extension-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
    }
  `],
})
export class AppComponent {}
