import fs from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { env } from '../env.js';

const { Pool } = pg;

async function createPool() {
  if (env.databaseUrl) {
    return new Pool({
      connectionString: env.databaseUrl,
      // Render (and most managed Postgres hosts) require SSL but use certs
      // that aren't in Node's default trust store.
      ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  if (env.nodeEnv === 'test') {
    // No DATABASE_URL in test mode: use an in-memory Postgres-compatible
    // engine so the test suite needs no real database running.
    const { newDb } = await import('pg-mem');
    const mem = newDb();
    return new (mem.adapters.createPg().Pool)();
  }

  throw new Error('DATABASE_URL is not set. Point it at a PostgreSQL database (see server/.env.example).');
}

export const pool = await createPool();

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function seedAdmin() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (rows.length > 0) return;

  const passwordHash = await bcrypt.hash(env.seedAdminPassword, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, active) VALUES ($1, $2, $3, 'admin', TRUE)`,
    [env.seedAdminName, env.seedAdminEmail.toLowerCase(), passwordHash]
  );
  console.log(`Seeded admin account: ${env.seedAdminEmail}`);
}

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8');
await pool.query(schema);
await seedAdmin();
