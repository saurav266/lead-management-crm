import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const publicColumns = 'id, name, email, role, phone, active, created_at';

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${publicColumns} FROM users WHERE role = 'employee' ORDER BY name`);
    res.json({ employees: rows });
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  password: z.string().min(6),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) throw new HttpError(409, 'A user with this email already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone, active) VALUES ($1, $2, $3, 'employee', $4, TRUE) RETURNING id`,
      [data.name, email, passwordHash, data.phone || null]
    );

    const { rows } = await pool.query(`SELECT ${publicColumns} FROM users WHERE id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ employee: rows[0] });
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'employee'`, [id]);
    if (!existing.rows[0]) throw new HttpError(404, 'Employee not found');

    const data = updateSchema.parse(req.body);

    if (data.name !== undefined) await pool.query('UPDATE users SET name = $1 WHERE id = $2', [data.name, id]);
    if (data.phone !== undefined) await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [data.phone, id]);
    if (data.active !== undefined) await pool.query('UPDATE users SET active = $1 WHERE id = $2', [data.active, id]);
    if (data.password) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    }

    const { rows } = await pool.query(`SELECT ${publicColumns} FROM users WHERE id = $1`, [id]);
    res.json({ employee: rows[0] });
  })
);

// Permanent delete. Any leads currently assigned to this employee become
// unassigned rather than being deleted themselves (assigned_user_id has
// ON DELETE SET NULL), and their audit_log history keeps its old_value /
// new_value text either way -- only the user_id "who did it" link on rows
// they authored goes null. For a reversible alternative, use PATCH with
// { active: false } instead (the "Deactivate" action) -- that keeps the
// account and its history intact and just blocks login.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'employee'`, [id]);
    if (!existing.rows[0]) throw new HttpError(404, 'Employee not found');

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  })
);

export default router;
