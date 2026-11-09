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
      width: 380px;
      min-height: 600px;
      overflow: hidden;
    }

    .extension-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
  `],
})
export class AppComponent {}
