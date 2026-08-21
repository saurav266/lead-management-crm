// Test env vars must be set before any app module is imported, since env.js
// and db/index.js read process.env at module-load time. With DATABASE_URL
// left unset and NODE_ENV=test, db/index.js falls back to an in-memory
// Postgres-compatible engine (pg-mem), so no real database is needed.
export async function buildTestApp(dbName) {
  process.env.DATABASE_URL = '';
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_ADMIN_NAME = 'Test Admin';
  process.env.SEED_ADMIN_EMAIL = 'admin@test.local';
  process.env.SEED_ADMIN_PASSWORD = 'admin-password';
  process.env.GOOGLE_SHEET_ID = '';
  process.env.CORS_ORIGIN = '';

  const cacheBuster = `${dbName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { createApp } = await import('../src/app.js?t=' + cacheBuster);
  const app = createApp();

  return { app };
}
