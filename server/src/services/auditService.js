import { pool } from '../db/index.js';

// `executor` defaults to the pool but accepts a transaction client so this
// can participate in a caller's transaction (e.g. bulk assign).
export async function logFieldChanges({ userId, leadId, before, after, fields }, executor = pool) {
  for (const field of fields) {
    const oldValue = before[field] ?? null;
    const newValue = after[field] ?? null;
    if (String(oldValue ?? '') === String(newValue ?? '')) continue;
    await executor.query(
      `INSERT INTO audit_log (user_id, lead_id, field, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
      [userId ?? null, leadId, field, oldValue === null ? null : String(oldValue), newValue === null ? null : String(newValue)]
    );
  }
}
