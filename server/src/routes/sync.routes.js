import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { importFromSheet, getSyncStatus } from '../services/syncService.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/status', (req, res) => {
  res.json(getSyncStatus());
});

router.post(
  '/now',
  asyncHandler(async (req, res) => {
    const result = await importFromSheet();
    res.json(result);
  })
);

export default router;
