import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'application',
    pathMatch: 'full',
  },
  {
    path: 'application',
    loadComponent: () =>
      import('./features/application/application.component').then(
        (m) => m.ApplicationComponent,
      ),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.component').then(
        (m) => m.ProfileComponent,
      ),
  },
  {
    path: 'answer-review',
    loadComponent: () =>
      import('./features/answer-review/answer-review.component').then(
        (m) => m.AnswerReviewComponent,
      ),
  },
  {
    path: 'answer-library',
    loadComponent: () =>
      import('./features/answer-library/answer-library.component').then(
        (m) => m.AnswerLibraryComponent,
      ),
  },
  {
    path: 'application-history',
    loadComponent: () =>
      import('./features/application-history/application-history.component').then(
        (m) => m.ApplicationHistoryComponent,
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent,
      ),
  },
];
