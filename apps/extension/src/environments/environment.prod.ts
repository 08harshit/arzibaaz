// Production build configuration. Replace every REPLACE_WITH_ value before releasing;
// `npm run build` fails while any placeholder remains (see scripts/build-extension.mjs).
export const environment = {
  production: true,
  apiUrl: 'REPLACE_WITH_PRODUCTION_API_URL', // e.g. https://api.example.com/api/v1
  // Public Supabase values only. NEVER put the service-role key in the extension.
  supabaseUrl: 'https://uynwtnwlzskkafizyhne.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5bnd0bndsenNra2FmaXp5aG5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxOTg0ODUsImV4cCI6MjEwOTc3NDQ4NX0.9Ux_e-l10c95TTl3m2GjjU7IACWG3xLGLc8YexPtYJE',
};
