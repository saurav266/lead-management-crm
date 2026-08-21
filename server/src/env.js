import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || null,

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '30d',

  seedAdminName: process.env.SEED_ADMIN_NAME || 'Admin',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'change-me-now',

  // PostgreSQL connection string. Left empty in test mode, where db/index.js
  // falls back to an in-memory Postgres-compatible engine (pg-mem) so tests
  // need no real database running.
  databaseUrl: process.env.DATABASE_URL || '',

  googleSheetId: process.env.GOOGLE_SHEET_ID || '',
  googleSheetTab: process.env.GOOGLE_SHEET_TAB || 'Leads',
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '',
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',

  sheetSyncIntervalMinutes: Number(process.env.SHEET_SYNC_INTERVAL_MINUTES ?? 2),
};

export const isSheetsConfigured =
  !!env.googleSheetId && (!!env.googleServiceAccountFile || !!env.googleServiceAccountJson);
