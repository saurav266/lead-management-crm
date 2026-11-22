import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { pool } from '../db/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const AUTH_COOKIE = 'crm_token';

export function signToken(user, rememberMe) {
  const expiresIn = rememberMe ? env.jwtRememberExpiresIn : env.jwtExpiresIn;
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn });
  return { token, expiresIn };
}

export function expiresInToMs(expiresIn) {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return 12 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2]];
  return value * unit;
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    res.clearCookie(AUTH_COOKIE, {
  httpOnly: true,
  sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  secure: env.nodeEnv === 'production',
  path: '/',
});
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || !user.active) {
    res.clearCookie(AUTH_COOKIE, {
  httpOnly: true,
  sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  secure: env.nodeEnv === 'production',
  path: '/',
});
    return res.status(401).json({ error: 'Account not found or deactivated' });
  }

  req.user = user;
  next();
});

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
