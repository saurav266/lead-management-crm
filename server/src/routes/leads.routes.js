import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { logFieldChanges } from '../services/auditService.js';
import { writeBackLead, importFromGrid } from '../services/syncService.js';
import { generateLeadKey } from '../utils/keyGen.js';
import {
  LEAD_ENUMS,
  EMPLOYEE_EDITABLE_FIELDS,
  ADMIN_EDITABLE_FIELDS,
  WRITEBACK_FIELDS,
} from '../config/sheetMapping.js';

const router = Router();
router.use(requireAuth);

const LEAD_SELECT = `
  SELECT leads.*, u.name AS assigned_name, u.email AS assigned_email,
         p.name AS previous_assigned_name, p.email AS previous_assigned_email
  FROM leads
  LEFT JOIN users u ON u.id = leads.assigned_user_id
  LEFT JOIN users p ON p.id = leads.previous_assigned_user_id
`;

// Builds a WHERE clause + positional ($1, $2, ...) values array from query filters.
function buildFilters(req) {
  const where = [];
  const values = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (req.user.role === 'employee') {
    where.push(`leads.assigned_user_id = ${bind(req.user.id)}`);
  } else if (req.query.assigned === 'unassigned') {
    where.push('leads.assigned_user_id IS NULL');
  } else if (req.query.assigned === 'rejected') {
    // Pending reassignment: was assigned, got rejected, hasn't been handed
    // to anyone since. A later reassignment naturally drops a lead out of
    // this view because assigned_user_id is set again.
    where.push('leads.assigned_user_id IS NULL AND leads.previous_assigned_user_id IS NOT NULL');
  } else if (req.query.assigned) {
    where.push(`leads.assigned_user_id = ${bind(Number(req.query.assigned))}`);
  }

  // Independent of the current-assignment filter above -- "who had this
  // lead before" is a different question than "who has it now", and an
  // admin reviewing reassignment history wants to filter by either one.
  if (req.query.previouslyAssigned) {
    where.push(`leads.previous_assigned_user_id = ${bind(Number(req.query.previouslyAssigned))}`);
  }

  // Same person (unique_key) submitted a lead form more than once, with a
  // genuinely different Date each time -- see upsertLeadFromRow. Worth
  // re-targeting: they keep coming back.
  if (req.query.recurring === 'true') where.push('leads.recur_count > 1');

  if (req.query.status) where.push(`leads.status = ${bind(req.query.status)}`);
  if (req.query.priority) where.push(`leads.priority = ${bind(req.query.priority)}`);
  if (req.query.city) where.push(`leads.city ILIKE ${bind(`%${req.query.city}%`)}`);
  if (req.query.dateFrom) where.push(`leads.date >= ${bind(req.query.dateFrom)}`);
  if (req.query.dateTo) where.push(`leads.date <= ${bind(req.query.dateTo)}`);
  if (req.query.search) {
    const placeholder = bind(`%${req.query.search}%`);
    where.push(
      `(leads.name ILIKE ${placeholder} OR leads.mob ILIKE ${placeholder} OR leads.email ILIKE ${placeholder} OR leads.city ILIKE ${placeholder})`
    );
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

// Page sizes the leads list will accept from ?limit= -- anything else (or
// missing) falls back to DEFAULT_PAGE_SIZE, so a stale/hand-edited URL never
// accidentally requests an arbitrarily large page.
const PAGE_SIZE_OPTIONS = [10, 50, 100, 500];
const DEFAULT_PAGE_SIZE = 50;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { whereSql, values } = buildFilters(req);
    const limit = PAGE_SIZE_OPTIONS.includes(Number(req.query.limit)) ? Number(req.query.limit) : DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
    const offset = (page - 1) * limit;

    const totalRes = await pool.query(`SELECT COUNT(*) AS count FROM leads ${whereSql}`, values);
    const total = Number(totalRes.rows[0].count);

    // Newest lead date first (the "Date" column -- created_time from the ad
    // or import) rather than most-recently-touched, so a fresh batch of
    // leads lands at the top of the table instead of getting buried under
    // older leads someone happened to edit today. `(date IS NULL) ASC`
    // pushes leads with no date to the bottom regardless of sort direction
    // -- more portable than NULLS LAST, which not every Postgres-compatible
    // engine supports. updated_at is the tiebreak for same-day leads.
    const { rows } = await pool.query(
      `${LEAD_SELECT} ${whereSql}
       ORDER BY (leads.date IS NULL) ASC, leads.date DESC, leads.updated_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    res.json({ leads: rows, total, page, limit, pageCount: Math.max(1, Math.ceil(total / limit)) });
  })
);

router.get(
  '/follow-ups-due',
  asyncHandler(async (req, res) => {
    const where = ['leads.next_follow_up IS NOT NULL', `leads.next_follow_up::date <= NOW()::date`];
    const values = [];
    if (req.user.role === 'employee') {
      values.push(req.user.id);
      where.push(`leads.assigned_user_id = $${values.length}`);
    } else if (req.query.assigned) {
      values.push(Number(req.query.assigned));
      where.push(`leads.assigned_user_id = $${values.length}`);
    }
    const { rows } = await pool.query(
      `${LEAD_SELECT} WHERE ${where.join(' AND ')} ORDER BY leads.next_follow_up ASC`,
      values
    );
    res.json({ leads: rows });
  })
);


// Follow-up Center: all scheduled and completed follow-ups.
// Employees only see their own leads; admins can filter by employee.
router.get(
  '/follow-ups',
  asyncHandler(async (req, res) => {
    const where = [
      `(NULLIF(leads.next_follow_up, '') IS NOT NULL OR leads.next_follow_up_status = 'Done')`,
    ];
    const values = [];

    const bind = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (req.user.role === 'employee') {
      where.push(`leads.assigned_user_id = ${bind(req.user.id)}`);
    } else if (req.query.assigned) {
      const assignedId = Number(req.query.assigned);
      if (!Number.isInteger(assignedId) || assignedId <= 0) {
        throw new HttpError(400, 'Invalid employee ID');
      }
      where.push(`leads.assigned_user_id = ${bind(assignedId)}`);
    }

    if (req.query.search) {
      const search = bind(`%${req.query.search}%`);
      where.push(
        `(leads.name ILIKE ${search} OR leads.mob ILIKE ${search} OR leads.email ILIKE ${search})`
      );
    }

    const { rows } = await pool.query(
      `${LEAD_SELECT}
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE
           WHEN leads.next_follow_up_status = 'Done' THEN 4
           WHEN leads.next_follow_up ~ '^\\d{4}-\\d{2}-\\d{2}$'
                AND leads.next_follow_up::date < CURRENT_DATE THEN 1
           WHEN leads.next_follow_up ~ '^\\d{4}-\\d{2}-\\d{2}$'
                AND leads.next_follow_up::date = CURRENT_DATE THEN 2
           ELSE 3
         END,
         leads.next_follow_up ASC NULLS LAST`,
      values
    );

    const today = new Date().toISOString().slice(0, 10);

    const counts = {
      today: 0,
      overdue: 0,
      upcoming: 0,
      completed: 0,
    };

    const leads = rows.map((lead) => {
      let bucket = 'upcoming';

      if (lead.next_follow_up_status === 'Done') {
        bucket = 'completed';
      } else if (lead.next_follow_up) {
        if (lead.next_follow_up < today) bucket = 'overdue';
        else if (lead.next_follow_up === today) bucket = 'today';
      }

      counts[bucket]++;

      return { ...lead, follow_up_bucket: bucket };
    });

    res.json({ leads, counts });
  })
);

// Kanban pipeline: returns all leads visible to the current user.
// Employees can only see their own assigned leads.
router.get(
  '/pipeline',
  asyncHandler(async (req, res) => {
    const values = [];
    let where = `WHERE (
      leads.status IS NULL
      OR leads.status IN ('Won', 'Lost', 'Not answered', 'Contacted', 'Broker')
    )`;

    if (req.user.role === 'employee') {
      values.push(req.user.id);
      where += ` AND leads.assigned_user_id = $${values.length}`;
    }

    const { rows } = await pool.query(
      `${LEAD_SELECT}
       ${where}
       ORDER BY leads.updated_at DESC`,
      values
    );

    res.json({ leads: rows });
  })
);


const activitySchema = z.object({
  activity_type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
  description: z.string().trim().min(1).max(5000),
});

// Create a new follow-up activity.
const followUpCreateSchema = z.object({
  activity_type: z.enum(['Call', 'Email', 'Meeting', 'Other']),

  scheduled_at: z.string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Invalid date and time'
    )
    .nullable()
    .optional(),

  status: z.enum([
    'Scheduled',
    'Completed',
    'Missed',
    'Cancelled',
    'No Response',
  ]).optional(),

  outcome: z.string().max(50).nullable().optional(),

  notes: z.string().max(5000).nullable().optional(),
});

// Update an existing follow-up activity.
const followUpActivityUpdateSchema = z.object({
  scheduled_at: z.string()
    .refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Invalid date and time'
    )
    .nullable()
    .optional(),

  status: z.enum([
    'Scheduled',
    'Completed',
    'Missed',
    'Cancelled',
    'No Response',
  ]).optional(),

  outcome: z.string().max(50).nullable().optional(),

  notes: z.string().max(5000).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one field is required'
);


// Get the lead's activity timeline.
// Includes both manually recorded activities and existing audit history.
router.get(
  '/:id/activities',
  asyncHandler(async (req, res) => {
    const leadId = Number(req.params.id);

    const leadResult = await pool.query(
      'SELECT id, assigned_user_id FROM leads WHERE id = $1',
      [leadId]
    );

    const lead = leadResult.rows[0];

    if (!lead) throw new HttpError(404, 'Lead not found');

    if (
      req.user.role === 'employee' &&
      lead.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    const { rows } = await pool.query(
      `SELECT *
       FROM (
         SELECT
           a.id,
           a.activity_type AS type,
           a.description,
           a.created_at,
           u.name AS user_name,
           'activity' AS record_type
         FROM lead_activities a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.lead_id = $1

         UNION ALL

         SELECT
           al.id,
           'system' AS type,
           CONCAT(
             al.field,
             ': ',
             COALESCE(al.old_value, 'empty'),
             ' → ',
             COALESCE(al.new_value, 'empty')
           ) AS description,
           al.created_at,
           u.name AS user_name,
           'audit' AS record_type
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.lead_id = $1
       ) timeline
       ORDER BY created_at DESC
       LIMIT 200`,
      [leadId]
    );

    res.json({ activities: rows });
  })
);

// Record a call, email, meeting, note or other interaction.
router.post(
  '/:id/activities',
  asyncHandler(async (req, res) => {
    const leadId = Number(req.params.id);
    const data = activitySchema.parse(req.body);

    const leadResult = await pool.query(
      'SELECT id, assigned_user_id FROM leads WHERE id = $1',
      [leadId]
    );

    const lead = leadResult.rows[0];

    if (!lead) throw new HttpError(404, 'Lead not found');

    if (
      req.user.role === 'employee' &&
      lead.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    const { rows } = await pool.query(
      `INSERT INTO lead_activities
        (lead_id, user_id, activity_type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lead_id, user_id, activity_type, description, created_at`,
      [leadId, req.user.id, data.activity_type, data.description]
    );

    res.status(201).json({ activity: rows[0] });
  })
);

// Every column the export can produce -- `key` is what a caller passes in
// ?columns=a,b,c to pick a subset (order in the file follows this array's
// order, not the caller's), `header` is the column's text in row 1 (kept
// matching SHEET_COLUMNS' import headers for the sheet-sourced fields, so a
// full export can be edited and re-uploaded through the importer without
// remapping), and `get` reads the value off a lead row.
const EXPORT_COLUMNS = [
  { key: 'key', header: 'Key', get: (l) => l.unique_key },
  { key: 'name', header: 'full_name', get: (l) => l.name },
  { key: 'mob', header: 'phone_number', get: (l) => l.mob },
  { key: 'email', header: 'email', get: (l) => l.email },
  { key: 'city', header: 'city', get: (l) => l.city },
  { key: 'date', header: 'created_time', get: (l) => l.date },
  { key: 'platform', header: 'platform', get: (l) => l.platform },
  { key: 'campaign_name', header: 'campaign_name', get: (l) => l.campaign_name },
  { key: 'adset_name', header: 'adset_name', get: (l) => l.adset_name },
  { key: 'ad_name', header: 'ad_name', get: (l) => l.ad_name },
  { key: 'interested_in', header: 'Interested In', get: (l) => l.interested_in },
  { key: 'assigned', header: 'Assigned', get: (l) => l.assigned_name },
  { key: 'status', header: 'Status', get: (l) => l.status },
  { key: 'priority', header: 'Priority', get: (l) => l.priority },
  { key: 'notes', header: 'Notes', get: (l) => l.notes },
  { key: 'last_contacted', header: 'Last Contacted', get: (l) => l.last_contacted },
  { key: 'next_follow_up', header: 'Next Follow-Up', get: (l) => l.next_follow_up },
  { key: 'previously_assigned', header: 'Previously Assigned', get: (l) => l.previous_assigned_name },
  { key: 'recur_count', header: 'Recurring Count', get: (l) => l.recur_count },
  { key: 'source', header: 'Source', get: (l) => l.source },
  { key: 'created_at', header: 'Created At', get: (l) => (l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : '') },
  { key: 'updated_at', header: 'Updated At', get: (l) => (l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : '') },
];

// Exports whatever the current filters/scope would show as a spreadsheet --
// same buildFilters() as the list endpoint above, so an employee gets only
// their own leads and an admin gets whatever the Leads page's filter bar
// currently has applied (e.g. the "Rejected — pending reassignment" filter
// exports just rejected leads; no filters exports everything). Must come
// before GET /:id below, or Express would try to parse "export" as a lead
// id. `?columns=key,name,status,...` (see EXPORT_COLUMNS above for the
// full key list) picks a subset and their order in the file follows
// EXPORT_COLUMNS' order; omitted or all-unrecognized falls back to every
// column, same as before this was selectable.
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { whereSql, values } = buildFilters(req);
    const { rows } = await pool.query(`${LEAD_SELECT} ${whereSql} ORDER BY leads.updated_at DESC`, values);

    const requestedKeys = typeof req.query.columns === 'string' ? req.query.columns.split(',').filter(Boolean) : [];
    const selected = requestedKeys.length
      ? EXPORT_COLUMNS.filter((c) => requestedKeys.includes(c.key))
      : EXPORT_COLUMNS;
    const columns = selected.length ? selected : EXPORT_COLUMNS;

    const headers = columns.map((c) => c.header);
    const dataRows = rows.map((lead) => columns.map((c) => c.get(lead)));

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

router.post(
  '/:id/follow-ups',
  asyncHandler(async (req, res) => {
    const leadId = Number(req.params.id);

    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new HttpError(400, 'Invalid lead ID');
    }

    const data = followUpCreateSchema.parse(req.body);

    const leadResult = await pool.query(
      'SELECT id, assigned_user_id FROM leads WHERE id = $1',
      [leadId]
    );

    const lead = leadResult.rows[0];

    if (!lead) throw new HttpError(404, 'Lead not found');

    if (
      req.user.role === 'employee' &&
      lead.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    const status = data.status || 'Scheduled';

    const { rows } = await pool.query(
      `INSERT INTO follow_up_activities
        (
          lead_id,
          user_id,
          activity_type,
          scheduled_at,
          status,
          outcome,
          notes,
          completed_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $5::varchar = 'Completed' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [
        leadId,
        req.user.id,
        data.activity_type,
        data.scheduled_at ?? null,
        status,
        data.outcome ?? null,
        data.notes ?? null,
      ]
    );

    res.status(201).json({ followUp: rows[0] });
  })
);

router.get(
  '/:id/follow-ups',
  asyncHandler(async (req, res) => {
    const leadId = Number(req.params.id);

    const leadResult = await pool.query(
      'SELECT id, assigned_user_id FROM leads WHERE id = $1',
      [leadId]
    );

    const lead = leadResult.rows[0];

    if (!lead) throw new HttpError(404, 'Lead not found');

    if (
      req.user.role === 'employee' &&
      lead.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    const { rows } = await pool.query(
      `SELECT
         f.*,
         u.name AS employee_name
       FROM follow_up_activities f
       LEFT JOIN users u ON u.id = f.user_id
       WHERE f.lead_id = $1
       ORDER BY f.created_at DESC, f.id DESC`,
      [leadId]
    );

    res.json({ followUps: rows });
  })
);
// Update an existing follow-up activity.
// URL: PATCH /:leadId/follow-ups/:followUpId
router.patch(
  '/:leadId/follow-ups/:followUpId',

  asyncHandler(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const followUpId = Number(req.params.followUpId);

    // Validate lead ID.
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new HttpError(400, 'Invalid lead ID');
    }

    // Validate follow-up ID.
    if (!Number.isInteger(followUpId) || followUpId <= 0) {
      throw new HttpError(400, 'Invalid follow-up ID');
    }

    // Validate request body.
    const data = followUpActivityUpdateSchema.parse(req.body);

    // Find follow-up and verify that it belongs to this lead.
    const existingResult = await pool.query(
      `SELECT
         f.*,
         l.assigned_user_id
       FROM follow_up_activities f
       JOIN leads l ON l.id = f.lead_id
       WHERE f.id = $1
         AND l.id = $2`,
      [followUpId, leadId]
    );

    const existing = existingResult.rows[0];

    if (!existing) {
      throw new HttpError(404, 'Follow-up not found');
    }

    // Employees can only update follow-ups for their own assigned leads.
    if (
      req.user.role === 'employee' &&
      existing.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    // Build update query dynamically using validated fields only.
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${values.length + 1}`);
      values.push(value);
    }

    // Maintain completion timestamp.
    if (data.status === 'Completed') {
      fields.push('completed_at = NOW()');
    } else if (data.status !== undefined) {
      fields.push('completed_at = NULL');
    }

    // Update modification timestamp.
    fields.push('updated_at = NOW()');

    values.push(followUpId);

    const { rows } = await pool.query(
      `UPDATE follow_up_activities
       SET ${fields.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    res.json({
      message: 'Follow-up updated successfully',
      followUp: rows[0],
    });
  })
);
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${LEAD_SELECT} WHERE leads.id = $1`, [Number(req.params.id)]);
    const lead = rows[0];
    if (!lead) throw new HttpError(404, 'Lead not found');
    if (req.user.role === 'employee' && lead.assigned_user_id !== req.user.id) {
      throw new HttpError(403, 'Forbidden');
    }
    res.json({ lead });
  })
);



const createSchema = z.object({
  name: z.string().min(1),
  mob: z.string().min(1),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  city: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  interested_in: z.string().optional().nullable(),
});

// Admins and employees can both add a lead by hand. An admin-added lead
// starts unassigned (same as today, assign it via the usual flow); an
// employee-added lead is their own -- it's auto-assigned to them so it shows
// up in "My Leads" immediately, since the whole point is a personal lead
// they already own.
router.post(
  '/',
  requireRole('admin', 'employee'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const uniqueKey = generateLeadKey({ name: data.name, city: data.city, mob: data.mob });

    const existing = await pool.query('SELECT id FROM leads WHERE unique_key = $1', [uniqueKey]);
    if (existing.rows[0]) throw new HttpError(409, `A lead with key "${uniqueKey}" already exists`);

    const assignedUserId = req.user.role === 'employee' ? req.user.id : null;

    const inserted = await pool.query(
      `INSERT INTO leads (unique_key, name, mob, email, city, date, interested_in, assigned_user_id, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', NOW()) RETURNING id`,
      [
        uniqueKey,
        data.name,
        data.mob,
        data.email || null,
        data.city || null,
        data.date || null,
        data.interested_in || null,
        assignedUserId,
      ]
    );

    const { rows } = await pool.query(`${LEAD_SELECT} WHERE leads.id = $1`, [inserted.rows[0].id]);
    const lead = rows[0];
    res.status(201).json({ lead });

    if (assignedUserId) {
      // A self-added personal lead auto-assigns to the employee who created
      // it -- needs its own audit trail entry (like the import paths do) so
      // it shows up as an assignment event, not just live assignment state.
      await logFieldChanges(
        { userId: req.user.id, leadId: lead.id, before: { assigned_user_id: null }, after: { assigned_user_id: assignedUserId }, fields: ['assigned_user_id'] }
      );
    }

    writeBackLead(lead.id).catch((err) => console.error('Sheet write-back failed:', err.message));
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname)) {
      return cb(new HttpError(400, 'Only .xlsx, .xls, or .csv files are supported'));
    }
    cb(null, true);
  },
});

// Bulk-import leads from an uploaded spreadsheet. Uses the exact same column
// mapping, key generation, and dedup rules as the Google Sheets sync (see
// config/sheetMapping.js) -- expects the same header row. New leads land
// unassigned, ready for the admin to assign via the existing endpoints.
router.post(
  '/import',
  requireRole('admin'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded');

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch {
      throw new HttpError(400, 'Could not read this file — make sure it is a valid .xlsx, .xls, or .csv export');
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new HttpError(400, 'The file has no sheets');

    // `raw: false` renders each cell the way Excel would display it, which is
    // what makes dates come through as "24/08/2026" instead of a serial
    // number -- but for a large plain number (e.g. a 12-digit phone number
    // with no thousands separators), Excel's own "General" display format
    // switches to scientific notation and keeps only ~6 significant digits
    // (e.g. "9.19351E+11"), permanently losing the rest before it ever
    // reaches our code. Recover those specific cells from the raw (`raw:
    // true`) pass, where SheetJS hands back the exact underlying number
    // instead of the lossy formatted text -- doubles hold a 12-digit integer
    // exactly, so nothing is lost. Cells that already read as ordinary text
    // (dates, names, etc.) never match the scientific-notation shape and are
    // left untouched.
    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    const rawGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const scientificNotation = /^\d(\.\d+)?E\+\d+$/i;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (typeof cell === 'string' && scientificNotation.test(cell.trim())) {
          const rawValue = rawGrid[r]?.[c];
          if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            grid[r][c] = String(Math.round(rawValue));
          }
        }
      }
    }

    const overwrite = req.body.overwrite === 'true';
    const result = await importFromGrid(grid, { overwrite });
    res.json(result);
  })
);

const employeeUpdateSchema = z.object({
  status: z.enum(LEAD_ENUMS.status).optional(),
  priority: z.enum(LEAD_ENUMS.priority).optional(),
  notes: z.string().optional().nullable(),
  last_contacted: z.string().optional().nullable(),
  next_follow_up: z.string().optional().nullable(),
});

const adminUpdateSchema = employeeUpdateSchema.extend({
  name: z.string().min(1).optional(),
  mob: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  city: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  interested_in: z.string().optional().nullable(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
});

async function applyLeadUpdate(req, res, { requireOwnership }) {
  const id = Number(req.params.id);
  const beforeRes = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
  const before = beforeRes.rows[0];
  if (!before) throw new HttpError(404, 'Lead not found');
  if (requireOwnership && before.assigned_user_id !== req.user.id) {
    throw new HttpError(403, 'Forbidden');
  }

  const isAdmin = req.user.role === 'admin';
  const schema = isAdmin ? adminUpdateSchema : employeeUpdateSchema;
  const allowedFields = isAdmin ? ADMIN_EDITABLE_FIELDS : EMPLOYEE_EDITABLE_FIELDS;
  const data = schema.parse(req.body);

  const updates = Object.fromEntries(
    Object.entries(data).filter(([field, value]) => allowedFields.includes(field) && value !== undefined)
  );

  // A cleared <input> submits '' rather than null -- normalize so date
  // columns never hold an empty string (breaks ::date casts, e.g. in the
  // dashboard and follow-ups-due queries) and a cleared email stores as null.
  for (const field of ['date', 'last_contacted', 'next_follow_up', 'email']) {
    if (updates[field] === '') updates[field] = null;
  }

  if (updates.assigned_user_id) {
    const empRes = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'employee' AND active = TRUE`,
      [updates.assigned_user_id]
    );
    if (!empRes.rows[0]) throw new HttpError(400, 'Assigned employee not found or inactive');
  }

  const fields = Object.keys(updates);
  if (fields.length === 0) {
    const { rows } = await pool.query(`${LEAD_SELECT} WHERE leads.id = $1`, [id]);
    return res.json({ lead: rows[0] });
  }

  const setClauses = fields.map((field, idx) => `${field} = $${idx + 1}`);
  const values = fields.map((field) => updates[field]);
  values.push(id);
  await pool.query(`UPDATE leads SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);

  await logFieldChanges({ userId: req.user.id, leadId: id, before, after: updates, fields });

  const { rows } = await pool.query(`${LEAD_SELECT} WHERE leads.id = $1`, [id]);
  const lead = rows[0];
  res.json({ lead });

  const touchesWriteback = fields.some((f) => WRITEBACK_FIELDS.includes(f) || f === 'assigned_user_id');
  if (touchesWriteback) {
    writeBackLead(id).catch((err) => console.error('Sheet write-back failed:', err.message));
  }
}


// Schedule, reschedule, or update the status of a follow-up.
const followUpUpdateSchema = z.object({
  next_follow_up: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable()
    .optional(),
  next_follow_up_status: z
    .enum(['Scheduled', 'Done', 'Missed', 'No Response'])
    .nullable()
    .optional(),
}).refine(
  (data) =>
    data.next_follow_up !== undefined ||
    data.next_follow_up_status !== undefined,
  { message: 'Provide a follow-up date or status' }
);

router.patch(
  '/follow-ups/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid lead ID');
    }

    const data = followUpUpdateSchema.parse(req.body);

    const beforeRes = await pool.query(
      'SELECT * FROM leads WHERE id = $1',
      [id]
    );

    const before = beforeRes.rows[0];

    if (!before) throw new HttpError(404, 'Lead not found');

    if (
      req.user.role === 'employee' &&
      before.assigned_user_id !== req.user.id
    ) {
      throw new HttpError(403, 'Forbidden');
    }

    const updates = {};

    if (data.next_follow_up !== undefined) {
      updates.next_follow_up = data.next_follow_up;
    }

    if (data.next_follow_up_status !== undefined) {
      updates.next_follow_up_status = data.next_follow_up_status;
    }

    const fields = Object.keys(updates);
    const values = fields.map((field) => updates[field]);
    const setClauses = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    values.push(id);

    await pool.query(
      `UPDATE leads
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );

    await logFieldChanges({
      userId: req.user.id,
      leadId: id,
      before,
      after: updates,
      fields,
    });

    const { rows } = await pool.query(
      `${LEAD_SELECT} WHERE leads.id = $1`,
      [id]
    );

    res.json({ lead: rows[0] });
  })
);

router.patch(
  '/:id',
  asyncHandler((req, res) => applyLeadUpdate(req, res, { requireOwnership: req.user.role === 'employee' }))
);

// Lets an employee give up a lead they don't want to work -- it goes back to
// unassigned, but unlike a lead that was never assigned, it's tagged with
// who had it and when so it shows up in the "Rejected -- pending
// reassignment" filter with that context, letting the admin make an
// informed call on who to hand it to next (see GET / with
// ?assigned=rejected, and previous_assigned_name on the returned lead).
router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const beforeRes = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    const before = beforeRes.rows[0];
    if (!before) throw new HttpError(404, 'Lead not found');
    if (req.user.role === 'employee' && before.assigned_user_id !== req.user.id) {
      throw new HttpError(403, 'Forbidden');
    }
    if (!before.assigned_user_id) throw new HttpError(400, 'Lead is not currently assigned');

    await pool.query(
      `UPDATE leads SET assigned_user_id = NULL, previous_assigned_user_id = $1, rejected_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [before.assigned_user_id, id]
    );
    await logFieldChanges({
      userId: req.user.id,
      leadId: id,
      before,
      after: { assigned_user_id: null },
      fields: ['assigned_user_id'],
    });

    const { rows } = await pool.query(`${LEAD_SELECT} WHERE leads.id = $1`, [id]);
    res.json({ lead: rows[0] });

    writeBackLead(id).catch((err) => console.error('Sheet write-back failed:', err.message));
  })
);

const assignSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
  employeeId: z.number().int().positive(),
  notify: z.boolean().optional(),
});

router.post(
  '/assign',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { leadIds, employeeId, notify } = assignSchema.parse(req.body);

    const empRes = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND role = 'employee' AND active = TRUE`,
      [employeeId]
    );
    const employee = empRes.rows[0];
    if (!employee) throw new HttpError(400, 'Assigned employee not found or inactive');

    const updatedIds = await withTransaction(async (client) => {
      const ids = [];
      for (const leadId of leadIds) {
        const beforeRes = await client.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        const before = beforeRes.rows[0];
        if (!before) continue;

        await client.query('UPDATE leads SET assigned_user_id = $1, updated_at = NOW() WHERE id = $2', [
          employeeId,
          leadId,
        ]);
        await logFieldChanges(
          { userId: req.user.id, leadId, before, after: { assigned_user_id: employeeId }, fields: ['assigned_user_id'] },
          client
        );
        ids.push(leadId);
      }
      return ids;
    });

    res.json({ updated: updatedIds.length, employee: { id: employee.id, name: employee.name } });

    // Notification hook: wire up email/SMS here if desired. For now this just
    // logs when the admin opts in, since no notification provider
    // credentials were supplied.
    if (notify) {
      console.log(`Notify: ${updatedIds.length} lead(s) assigned to ${employee.name} (${employee.email})`);
    }

    for (const leadId of updatedIds) {
      writeBackLead(leadId).catch((err) => console.error('Sheet write-back failed:', err.message));
    }
  })
);

const deleteSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
});

// Permanent delete (admin only). Doesn't touch the Google Sheet row, if one
// exists -- only removes the lead from the CRM. audit_log rows for these
// leads are removed automatically (ON DELETE CASCADE).
router.post(
  '/delete',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { leadIds } = deleteSchema.parse(req.body);
    const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(`DELETE FROM leads WHERE id IN (${placeholders})`, leadIds);
    res.json({ deleted: result.rowCount });
  })
);

export default router;
