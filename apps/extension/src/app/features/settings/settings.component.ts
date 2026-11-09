import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { AuthComponent } from '../auth/auth.component';

@Component({
  selector: 'ab-settings',
  standalone: true,
  imports: [FormsModule, AuthComponent],
  template: `
    <div class="page">
      @if (!auth.isAuthenticated()) {
        <ab-auth />
      } @else {
        <h2 class="page-title">Settings</h2>

        <section class="card">
          <h3>Account</h3>
          <p class="row"><span class="muted">Signed in as</span> <strong>{{ auth.user()?.email }}</strong></p>
          <button class="secondary-btn" (click)="signOut()">Sign out</button>
        </section>

        <section class="card">
          <h3>How answers are written</h3>
          <p class="muted">Applies to answers the AI writes. Short fields always get just the value.</p>

          <label class="field">
            Length
            <select [(ngModel)]="length">
              <option value="short">Short (30-50 words)</option>
              <option value="medium">Medium (75-100 words)</option>
              <option value="detailed">Detailed (150-200 words)</option>
            </select>
          </label>

          <label class="field">
            Tone
            <select [(ngModel)]="tone">
              <option value="natural_professional">Natural and professional</option>
              <option value="formal">Formal</option>
              <option value="conversational">Conversational</option>
              <option value="confident">Confident</option>
            </select>
          </label>

          <label class="field">
            Style
            <select [(ngModel)]="style">
              <option value="first_person">First person ("I built...")</option>
              <option value="paragraph">Structured paragraph</option>
              <option value="bullet_points">Bullet points</option>
            </select>
          </label>

          <label class="field">
            Extra instructions (optional)
            <textarea rows="3" maxlength="500" [(ngModel)]="extra" placeholder="e.g. Avoid buzzwords. Mention remote work experience."></textarea>
          </label>

          <button class="primary-btn" (click)="save()" [disabled]="saving()">
            @if (saving()) {
              Saving...
            } @else {
              Save
            }
          </button>
          @if (message()) {
            <p class="msg" [class.error]="isError()">{{ message() }}</p>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
    .page-title { font-size: 16px; font-weight: 600; margin: 0; color: #202124; }
    .card { background: #fff; border: 1px solid #dadce0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    h3 { font-size: 13px; font-weight: 700; margin: 0; color: #202124; }
    .muted { font-size: 11px; color: #5f6368; margin: 0; }
    .row { display: flex; flex-direction: column; gap: 2px; font-size: 12px; margin: 0; word-break: break-all; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #202124; }
    select, textarea { padding: 6px 8px; border: 1px solid #dadce0; border-radius: 4px; font-size: 12px; font-family: inherit; }
    .primary-btn { background: #1a73e8; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-start; }
    .primary-btn:disabled { opacity: 0.6; }
    .secondary-btn { background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; padding: 7px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-start; }
    .msg { font-size: 12px; color: #137333; margin: 0; }
    .msg.error { color: #c5221f; }
  `],
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly isError = signal(false);

  length: 'short' | 'medium' | 'detailed' = 'medium';
  tone: 'natural_professional' | 'formal' | 'conversational' | 'confident' = 'natural_professional';
  style: 'first_person' | 'bullet_points' | 'paragraph' = 'first_person';
  extra = '';

  async ngOnInit() {
    if (!this.auth.isAuthenticated()) return;
    try {
      const prefs = await this.profileApi.getPreferences();
      if (prefs) {
        this.length = prefs.length ?? this.length;
        this.tone = prefs.tone ?? this.tone;
        this.style = prefs.style ?? this.style;
        this.extra = prefs.additionalInstructions ?? '';
      }
    } catch {
      // Defaults are fine if preferences cannot be loaded.
    }
  }

  async save() {
    this.saving.set(true);
    this.message.set(null);
    try {
      await this.profileApi.updatePreferences({
        length: this.length,
        tone: this.tone,
        style: this.style,
        additionalInstructions: this.extra.trim() || undefined,
      });
      this.isError.set(false);
      this.message.set('Saved. New answers will use these settings.');
    } catch {
      this.isError.set(true);
      this.message.set('Could not save. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/application']);
  }
}
