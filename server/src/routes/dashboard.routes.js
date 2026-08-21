import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Postgres returns COUNT(*) as a bigint, which node-postgres surfaces as a
// string to avoid precision loss -- convert explicitly for the client.
const toCount = (result) => Number(result.rows[0].count);

// Collapses a "group by X, count" result down to the top N rows plus a
// single "Other" bucket for the rest, so a dashboard chart never has to
// render dozens of campaign/ad-set/ad bars.
function topNWithOther(rows, labelKey, n = 8) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const otherCount = rest.reduce((sum, r) => sum + r.count, 0);
  const result = top.map((r) => ({ [labelKey]: r[labelKey], count: r.count }));
  if (otherCount > 0) result.push({ [labelKey]: 'Other', count: otherCount });
  return result;
}

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [
      total,
      byStatus,
      byPriority,
      byEmployee,
      byCampaign,
      byAdset,
      byAdName,
      unassigned,
      followUpsToday,
      followUpsOverdue,
      won,
      lost,
      recurringCount,
      recurringLeads,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM leads'),
      pool.query('SELECT status, COUNT(*) AS count FROM leads GROUP BY status'),
      pool.query('SELECT priority, COUNT(*) AS count FROM leads GROUP BY priority'),
      pool.query(
        `SELECT u.id AS employee_id, u.name AS employee_name, COUNT(leads.id) AS count
         FROM users u
         LEFT JOIN leads ON leads.assigned_user_id = u.id
         WHERE u.role = 'employee'
         GROUP BY u.id, u.name
         ORDER BY u.name`
      ),
      pool.query(
        `SELECT campaign_name, COUNT(*) AS count FROM leads
         WHERE campaign_name IS NOT NULL AND campaign_name != '' GROUP BY campaign_name`
      ),
      pool.query(
        `SELECT adset_name, COUNT(*) AS count FROM leads
         WHERE adset_name IS NOT NULL AND adset_name != '' GROUP BY adset_name`
      ),
      pool.query(
        `SELECT ad_name, COUNT(*) AS count FROM leads
         WHERE ad_name IS NOT NULL AND ad_name != '' GROUP BY ad_name`
      ),
      pool.query('SELECT COUNT(*) AS count FROM leads WHERE assigned_user_id IS NULL'),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE next_follow_up::date = NOW()::date`),
      pool.query(
        `SELECT COUNT(*) AS count FROM leads
         WHERE next_follow_up IS NOT NULL AND next_follow_up::date < NOW()::date AND status != 'Won' AND status != 'Lost'`
      ),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE status = 'Won'`),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE status = 'Lost'`),
      pool.query('SELECT COUNT(*) AS count FROM leads WHERE recur_count > 1'),
      // Same person (unique_key) submitted a lead form again with a
      // different Date -- worth re-targeting, they keep coming back. See
      // upsertLeadFromRow for exactly what counts as a recurrence.
      pool.query(
        `SELECT id, name, mob, city, status, recur_count, date
         FROM leads WHERE recur_count > 1
         ORDER BY recur_count DESC, updated_at DESC
         LIMIT 10`
      ),
    ]);

    res.json({
      total: toCount(total),
      unassigned: toCount(unassigned),
      byStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      byPriority: byPriority.rows.map((r) => ({ priority: r.priority, count: Number(r.count) })),
      byEmployee: byEmployee.rows.map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        count: Number(r.count),
      })),
      byCampaign: topNWithOther(
        byCampaign.rows.map((r) => ({ campaign_name: r.campaign_name, count: Number(r.count) })),
        'campaign_name'
      ),
      byAdset: topNWithOther(
        byAdset.rows.map((r) => ({ adset_name: r.adset_name, count: Number(r.count) })),
        'adset_name'
      ),
      byAdName: topNWithOther(
        byAdName.rows.map((r) => ({ ad_name: r.ad_name, count: Number(r.count) })),
        'ad_name'
      ),
      followUps: { dueToday: toCount(followUpsToday), overdue: toCount(followUpsOverdue) },
      wonVsLost: { won: toCount(won), lost: toCount(lost) },
      recurring: { count: toCount(recurringCount), leads: recurringLeads.rows },
    });
  })
);

const assignmentsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// How many leads were assigned to each employee within a date range, sourced
// from the audit log (every assignment/reassignment/reject is already
// recorded there as an assigned_user_id change) rather than current
// assignment state -- so this answers "who got handed leads this week",
// which is a different question than the live byEmployee breakdown above.
router.get(
  '/assignments',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { from, to } = assignmentsQuerySchema.parse(req.query);
    const fromDate = from || '1970-01-01';
    const toDate = to || new Date().toISOString().slice(0, 10);

    // Filter to assigned_user_id rows in a subquery *before* casting
    // new_value to integer -- other fields' new_value (e.g. a status change
    // to 'Broker') isn't numeric, and a plain WHERE alongside the JOIN
    // doesn't guarantee the cast only runs on already-filtered rows.
    const { rows } = await pool.query(
      `SELECT u.id AS employee_id, u.name AS employee_name, COUNT(*) AS count
       FROM (
         SELECT new_value::integer AS employee_id, created_at
         FROM audit_log
         WHERE field = 'assigned_user_id' AND new_value IS NOT NULL
       ) a
       JOIN users u ON u.id = a.employee_id
       WHERE a.created_at::date BETWEEN $1::date AND $2::date
       GROUP BY u.id, u.name
       ORDER BY count DESC`,
      [fromDate, toDate]
    );

    res.json({
      from: fromDate,
      to: toDate,
      byEmployee: rows.map((r) => ({ employee_id: r.employee_id, employee_name: r.employee_name, count: Number(r.count) })),
    });
  })
);

// The most recently assigned leads, newest first -- sourced from the audit
// log (same reasoning as /assignments: current assignment state alone can't
// say *when* a lead was handed over, or that it was assigned at all if it's
// since been reassigned or rejected).
router.get(
  '/recent-assignments',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.created_at, l.id AS lead_id, l.name AS lead_name, l.mob AS lead_mob, l.city AS lead_city,
              l.status AS lead_status, u.id AS employee_id, u.name AS employee_name
       FROM (
         SELECT lead_id, new_value::integer AS employee_id, created_at
         FROM audit_log
         WHERE field = 'assigned_user_id' AND new_value IS NOT NULL
       ) a
       JOIN leads l ON l.id = a.lead_id
       JOIN users u ON u.id = a.employee_id
       ORDER BY a.created_at DESC
       LIMIT 15`
    );
    res.json({ recentAssignments: rows });
  })
);

// An employee's own dashboard: their current workload by status/priority
// (the pie chart), their own follow-up load, and their most recently
// assigned leads -- everything scoped to req.user.id rather than the whole
// team the way the admin dashboard above is. Any authenticated user can hit
// this (an admin previewing their own empty view is harmless), not just
// employees.
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [total, byStatus, byPriority, followUpsToday, followUpsOverdue, won, lost, recent] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM leads WHERE assigned_user_id = $1', [userId]),
      pool.query('SELECT status, COUNT(*) AS count FROM leads WHERE assigned_user_id = $1 GROUP BY status', [userId]),
      pool.query('SELECT priority, COUNT(*) AS count FROM leads WHERE assigned_user_id = $1 GROUP BY priority', [userId]),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE assigned_user_id = $1 AND next_follow_up::date = NOW()::date`, [userId]),
      pool.query(
        `SELECT COUNT(*) AS count FROM leads
         WHERE assigned_user_id = $1 AND next_follow_up IS NOT NULL AND next_follow_up::date < NOW()::date
           AND status != 'Won' AND status != 'Lost'`,
        [userId]
      ),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE assigned_user_id = $1 AND status = 'Won'`, [userId]),
      pool.query(`SELECT COUNT(*) AS count FROM leads WHERE assigned_user_id = $1 AND status = 'Lost'`, [userId]),
      pool.query(
        `SELECT a.created_at, l.id AS lead_id, l.name AS lead_name, l.mob AS lead_mob, l.city AS lead_city, l.status AS lead_status
         FROM (
           SELECT lead_id, new_value::integer AS employee_id, created_at
           FROM audit_log
           WHERE field = 'assigned_user_id' AND new_value IS NOT NULL
         ) a
         JOIN leads l ON l.id = a.lead_id
         WHERE a.employee_id = $1
         ORDER BY a.created_at DESC
         LIMIT 8`,
        [userId]
      ),
    ]);

    res.json({
      total: toCount(total),
      byStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      byPriority: byPriority.rows.map((r) => ({ priority: r.priority, count: Number(r.count) })),
      followUps: { dueToday: toCount(followUpsToday), overdue: toCount(followUpsOverdue) },
      wonVsLost: { won: toCount(won), lost: toCount(lost) },
      recentlyAssigned: recent.rows,
    });
  })
);

export default router;
