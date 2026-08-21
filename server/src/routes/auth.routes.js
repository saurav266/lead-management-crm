import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AUTH_COOKIE, signToken, expiresInToMs, requireAuth } from '../middleware/auth.js';
import { env } from '../env.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
}

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token, expiresIn } = signToken(user, !!rememberMe);
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: expiresInToMs(expiresIn),
    });

    res.json({ user: toPublicUser(user) });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

export default router;
