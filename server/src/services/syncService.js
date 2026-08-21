import cron from 'node-cron';
import { pool, withTransaction } from '../db/index.js';
import { isSheetsConfigured, env } from '../env.js';
import { SHEET_COLUMNS, LEAD_ENUMS } from '../config/sheetMapping.js';
import { generateLeadKey } from '../utils/keyGen.js';
import { parseGrid } from '../utils/gridParser.js';
import { readSheet, writeRowCells, appendRow } from './sheetsClient.js';
import { logFieldChanges } from './auditService.js';

let syncing = false;
let lastSyncResult = null;

export function getSyncStatus() {
  return { syncing, lastSyncResult, sheetsConfigured: isSheetsConfigured };
}

// Resolves (or generates) a row's unique key and dedupes it against the rest
// of the current import batch. Returns null for a duplicate.
function resolveKey(row, seenKeys) {
  let key = row.values.unique_key;
  if (!key) {
    key = generateLeadKey({ name: row.values.name, city: row.values.city, mob: row.values.mob });
  }
  if (seenKeys.has(key)) return null;
  seenKeys.add(key);
  return key;
}

// Applied once, right after parsing, so every downstream consumer (unique
// key generation included) sees the repaired number rather than each call
// site needing to remember to clean it up separately.
function repairRows(rows) {
  for (const row of rows) {
    row.values.mob = repairPhoneNumber(row.values.mob);
    row.values.last_contacted = repairMonthFirstDate(row.values.last_contacted);
    row.values.next_follow_up = repairMonthFirstDate(row.values.next_follow_up);
    row.values.date = repairMonthFirstDate(row.values.date);
  }
  return rows;
}

// Combines the four ad-attribution columns (platform/campaign/adset/ad) into
// one readable string rather than widening the leads table with four mostly-
// empty columns. Returns null when none of them are present.
function composeLeadSource(values) {
  const parts = [values.platform, values.campaign_name, values.adset_name, values.ad_name].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

const STATUS_LOOKUP = new Map(LEAD_ENUMS.status.map((v) => [v.toLowerCase(), v]));
const PRIORITY_LOOKUP = new Map(LEAD_ENUMS.priority.map((v) => [v.toLowerCase(), v]));

// Historical exports predate the Won/Lost/Not answered/Contacted/Broker and
// P1/P2/P3 schemes -- this is the exact same remapping schema.sql applies to
// existing database rows, applied here too so old spreadsheets with "New" or
// "Follow-Up" or "High" land correctly instead of silently defaulting.
const STATUS_LEGACY_MAP = {
  new: 'Not answered',
  'follow-up': 'Contacted',
  followup: 'Contacted',
  qualified: 'Contacted',
  'site visit': 'Contacted',
};
const PRIORITY_LEGACY_MAP = { high: 'P1', medium: 'P2', low: 'P3' };

// Case-insensitive match against a known enum (so a historical file with
// "won" or "WON" still lands as "Won"), falling back to the legacy map for
// pre-migration labels. A value matching neither falls back to `fallback`
// rather than being passed straight to the INSERT -- a bad status label
// would otherwise fail the table's CHECK constraint and roll back the
// *entire* import batch, not just that one row. The original text comes back
// as `unrecognized` so the caller can tell the admin what got defaulted.
function normalizeEnum(raw, lookup, fallback, legacyMap = null) {
  if (!raw) return { value: fallback, unrecognized: null };
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const match = lookup.get(lower);
  if (match) return { value: match, unrecognized: null };
  if (legacyMap && legacyMap[lower]) return { value: legacyMap[lower], unrecognized: null };
  return { value: fallback, unrecognized: trimmed };
}

// Spreadsheets sometimes store phone numbers as numeric cells, which Excel
// or Google Sheets renders in scientific notation once a column is too
// narrow or formatted as "General" (e.g. "9.1935E+11") -- reading that
// straight in would corrupt the number and break the fallback key (which
// uses the last 2 digits) and click-to-call alike. Detect and repair it back
// to plain digits; anything that isn't in that shape passes through untouched.
function repairPhoneNumber(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d(\.\d+)?E\+\d+$/i.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return String(Math.round(asNumber));
  }
  return trimmed;
}

// The date pickers (and the follow-up countdown) need YYYY-MM-DD. The
// team's spreadsheet writes every date column -- created_time, Last
// Contacted, Next Follow-Up alike -- in the US month-first convention
// (MM/DD/YYYY, sometimes with a trailing time-of-day), matching how Excel's
// cell format renders it and how Meta/Facebook exports created_time.
// Repairs the unambiguous cases to ISO; anything that doesn't look like
// MM/DD (or is already ISO) passes through untouched rather than being
// guessed.
function repairMonthFirstDate(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10); // already ISO, drop any time part
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})/.exec(trimmed);
  if (!m) return trimmed;
  let [, month, day, year] = m;
  if (year.length === 2) year = `20${year}`;
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');
  if (Number(day) > 31 || Number(month) > 12) return trimmed; // doesn't look like MM/DD, leave it
  return `${year}-${month}-${day}`;
}

// Matches an "Assigned" (or "Previously Assigned") column value -- a name or
// email, as written by an employee or exported from the sheet's write-back
// -- to an existing employee. No match (including ambiguous multiple
// matches, which SQL can't tell apart from "found the right one") leaves the
// field unset and reports the text back so the admin can create that
// employee or assign it by hand.
async function resolveAssignee(client, rawName) {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return { id: null, unmatched: null };
  const res = await client.query(
    `SELECT id FROM users WHERE role = 'employee' AND (LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($1))`,
    [trimmed]
  );
  return res.rows.length === 1 ? { id: res.rows[0].id, unmatched: null } : { id: null, unmatched: trimmed };
}

// Inserts a new lead for `key`, or refreshes an existing one's sheet-sourced
// fields (name/mob/email/city/date/interested_in/lead_source) only --
// working fields the CRM owns (status, notes, follow-up, etc.) are never
// overwritten on an existing lead by default. New leads, however, pick up
// Status, Priority, Notes, Last Contacted, Next Follow-Up, Assigned, and
// Previously Assigned from the file if present -- this is what makes a
// one-time historical import work (leads that already have employee-entered
// data and an owner), while an ongoing re-import of already-tracked leads
// still can't clobber anyone's work. The one exception: an *existing* lead
// with no current Assigned/Previously Assigned gets a late-arriving value
// filled in (e.g. you imported before creating that employee account, then
// re-uploaded) -- never overwrites either once set.
// `overwrite` (file-upload imports only) opts into treating the file as the
// source of truth for an *existing* lead's working fields too -- for the
// team's master spreadsheet, re-uploaded periodically with the latest
// Status/Notes/Follow-Up entered by whoever called the lead. Only cells the
// file actually has a value for are applied (a blank cell keeps whatever's
// already in the CRM instead of clearing it), so a
// partial re-upload can never null out data the file simply doesn't cover.
// `sheetRow` is only meaningful for Google Sheets imports: passing it
// updates the row's write-back target; omitting it (file-upload imports)
// leaves an existing lead's sheet_row untouched.
async function upsertLeadFromRow(client, key, row, { source, sheetRow, overwrite = false }) {
  const existingRes = await client.query(
    overwrite
      ? 'SELECT id, assigned_user_id, previous_assigned_user_id, status, priority, date, recur_count FROM leads WHERE unique_key = $1'
      : 'SELECT id, assigned_user_id, previous_assigned_user_id, date, recur_count FROM leads WHERE unique_key = $1',
    [key]
  );
  const existing = existingRes.rows[0];

  const name = row.values.name || null;
  const mob = row.values.mob || null;
  const email = row.values.email || null;
  const city = row.values.city || null;
  const date = row.values.date || null;
  const platform = row.values.platform || null;
  const campaignName = row.values.campaign_name || null;
  const adsetName = row.values.adset_name || null;
  const adName = row.values.ad_name || null;
  const leadSource = composeLeadSource(row.values);
  // Free text, not a fixed CRM taxonomy -- real spreadsheets use this column
  // for plot/scheme names ("Aakar Gap" etc.) that don't fit any short
  // enum, so it's stored as-is rather than validated against one.
  const interestedIn = row.values.interested_in?.trim() || null;

  if (existing) {
    // Same person (same unique_key), but a Date that's actually different
    // from what's already on file means they filled out a lead form again
    // -- not just the same file/row getting re-uploaded, which would carry
    // the exact same Date. Re-uploading a file that never had a Date for
    // this row (blank both times) doesn't count either.
    const isRecurringSubmission = Boolean(date) && Boolean(existing.date) && date !== existing.date;
    const recurCount = existing.recur_count + (isRecurringSubmission ? 1 : 0);

    if (sheetRow !== undefined) {
      await client.query(
        `UPDATE leads SET name=$1, mob=$2, email=$3, city=$4, date=$5, interested_in=$6, lead_source=$7,
           platform=$8, campaign_name=$9, adset_name=$10, ad_name=$11, recur_count=$12, sheet_row=$13, updated_at=NOW()
         WHERE id=$14`,
        [name, mob, email, city, date, interestedIn, leadSource, platform, campaignName, adsetName, adName, recurCount, sheetRow, existing.id]
      );
    } else {
      await client.query(
        `UPDATE leads SET name=$1, mob=$2, email=$3, city=$4, date=$5, interested_in=$6, lead_source=$7,
           platform=$8, campaign_name=$9, adset_name=$10, ad_name=$11, recur_count=$12, updated_at=NOW()
         WHERE id=$13`,
        [name, mob, email, city, date, interestedIn, leadSource, platform, campaignName, adsetName, adName, recurCount, existing.id]
      );
    }

    const unmatchedAssignees = [];
    if (!existing.assigned_user_id && row.values.assigned_display) {
      const assignee = await resolveAssignee(client, row.values.assigned_display);
      if (assignee.id) {
        await client.query('UPDATE leads SET assigned_user_id = $1 WHERE id = $2', [assignee.id, existing.id]);
        // Assignments made this way (matched from the file's "Assigned"
        // column, not chosen in the CRM) still need to show up in
        // "Assignments by date" -- that chart reads the audit log, not
        // live assignment state, so an unlogged import would silently
        // never appear in it.
        await logFieldChanges(
          { userId: null, leadId: existing.id, before: { assigned_user_id: null }, after: { assigned_user_id: assignee.id }, fields: ['assigned_user_id'] },
          client
        );
      } else if (assignee.unmatched) {
        unmatchedAssignees.push(assignee.unmatched);
      }
    }
    if (!existing.previous_assigned_user_id && row.values.previous_assigned_display) {
      const prevAssignee = await resolveAssignee(client, row.values.previous_assigned_display);
      if (prevAssignee.id) {
        await client.query('UPDATE leads SET previous_assigned_user_id = $1 WHERE id = $2', [prevAssignee.id, existing.id]);
      } else if (prevAssignee.unmatched) {
        unmatchedAssignees.push(`${prevAssignee.unmatched} (Previously Assigned)`);
      }
    }

    const unrecognized = [];
    if (overwrite) {
      const statusResult = normalizeEnum(row.values.status, STATUS_LOOKUP, existing.status, STATUS_LEGACY_MAP);
      const priorityResult = normalizeEnum(row.values.priority, PRIORITY_LOOKUP, existing.priority, PRIORITY_LEGACY_MAP);
      await client.query(
        `UPDATE leads SET
           status = $1,
           priority = $2,
           notes = CASE WHEN $3 = '' THEN notes ELSE $3 END,
           last_contacted = CASE WHEN $4 = '' THEN last_contacted ELSE $4 END,
           next_follow_up = CASE WHEN $5 = '' THEN next_follow_up ELSE $5 END
         WHERE id = $6`,
        [statusResult.value, priorityResult.value, row.values.notes || '', row.values.last_contacted || '', row.values.next_follow_up || '', existing.id]
      );
      if (statusResult.unrecognized) unrecognized.push(`status "${statusResult.unrecognized}" on ${name || key}`);
      if (priorityResult.unrecognized) unrecognized.push(`priority "${priorityResult.unrecognized}" on ${name || key}`);
    }

    return { outcome: 'updated', unmatchedAssignees, unrecognized };
  }

  // No fallback to a default status/priority for a brand-new lead -- left
  // blank (null) so it visibly still needs triage rather than silently
  // reading "Not answered" / "P2" as if someone already looked at it. A
  // value the file *does* provide still goes through the legacy remap.
  const statusResult = normalizeEnum(row.values.status, STATUS_LOOKUP, null, STATUS_LEGACY_MAP);
  const priorityResult = normalizeEnum(row.values.priority, PRIORITY_LOOKUP, null, PRIORITY_LEGACY_MAP);
  const assignee = await resolveAssignee(client, row.values.assigned_display);
  const prevAssignee = await resolveAssignee(client, row.values.previous_assigned_display);

  const inserted = await client.query(
    `INSERT INTO leads (
       unique_key, name, mob, email, city, date, interested_in, lead_source,
       platform, campaign_name, adset_name, ad_name, assigned_user_id,
       previous_assigned_user_id, status, priority, notes, last_contacted,
       next_follow_up, source, sheet_row, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
     RETURNING id`,
    [
      key,
      name,
      mob,
      email,
      city,
      date,
      interestedIn,
      leadSource,
      platform,
      campaignName,
      adsetName,
      adName,
      assignee.id,
      prevAssignee.id,
      statusResult.value,
      priorityResult.value,
      row.values.notes || null,
      row.values.last_contacted || null,
      row.values.next_follow_up || null,
      source,
      sheetRow ?? null,
    ]
  );

  if (assignee.id) {
    // Same reasoning as the existing-lead branch above -- a brand-new lead
    // that arrives pre-assigned (the file's "Assigned" column matched an
    // employee) needs an audit trail entry too, or it never shows up as an
    // assignment event in "Assignments by date".
    await logFieldChanges(
      { userId: null, leadId: inserted.rows[0].id, before: { assigned_user_id: null }, after: { assigned_user_id: assignee.id }, fields: ['assigned_user_id'] },
      client
    );
  }

  const unmatchedAssignees = [];
  if (assignee.unmatched) unmatchedAssignees.push(assignee.unmatched);
  if (prevAssignee.unmatched) unmatchedAssignees.push(`${prevAssignee.unmatched} (Previously Assigned)`);

  const unrecognized = [];
  if (statusResult.unrecognized) unrecognized.push(`status "${statusResult.unrecognized}" on ${name || key}`);
  if (priorityResult.unrecognized) unrecognized.push(`priority "${priorityResult.unrecognized}" on ${name || key}`);

  return { outcome: 'created', unmatchedAssignees, unrecognized };
}

function applyRowResult(result, { outcome, unmatchedAssignees, unrecognized }) {
  result[outcome]++;
  for (const name of unmatchedAssignees) {
    if (!result.unmatchedAssignees.includes(name)) result.unmatchedAssignees.push(name);
  }
  result.unrecognizedValues.push(...unrecognized);
}

// Pull rows from the Google Sheet into the leads table (scheduled + "Sync now").
export async function importFromSheet() {
  if (!isSheetsConfigured) return { skipped: true, reason: 'Google Sheets is not configured' };
  if (syncing) return { skipped: true, reason: 'A sync is already in progress' };

  syncing = true;
  const result = {
    created: 0,
    updated: 0,
    skippedDuplicate: 0,
    skippedBlank: 0,
    unmatchedAssignees: [],
    unrecognizedValues: [],
    errors: [],
    startedAt: new Date().toISOString(),
  };

  try {
    const { rows, blankSkipped } = await readSheet({ columns: SHEET_COLUMNS });
    repairRows(rows);
    result.skippedBlank = blankSkipped;
    const seenKeys = new Set();

    await withTransaction(async (client) => {
      for (const row of rows) {
        const key = resolveKey(row, seenKeys);
        if (!key) {
          result.skippedDuplicate++;
          continue;
        }
        const rowResult = await upsertLeadFromRow(client, key, row, { source: 'sheet', sheetRow: row.rowNumber });
        applyRowResult(result, rowResult);
      }
    });

    result.finishedAt = new Date().toISOString();
    lastSyncResult = result;
    return result;
  } catch (err) {
    result.errors.push({ message: err.message });
    result.finishedAt = new Date().toISOString();
    lastSyncResult = result;
    throw err;
  } finally {
    syncing = false;
  }
}

// Import leads from an uploaded spreadsheet (.xlsx/.xls/.csv), already parsed
// into a 2D grid by the route handler. Uses the same column mapping, key
// generation, and dedup rules as the Google Sheets import -- the only
// differences are the `source` tag and that uploaded rows have no sheet row
// to write back to. This is also the path for a one-time historical import:
// include Status/Priority/Notes/Last Contacted/Next Follow-Up/Assigned
// columns and they'll be picked up for any row that's new to the CRM (see
// upsertLeadFromRow for exactly what does and doesn't get overwritten on a
// re-upload of already-tracked leads -- `overwrite` opts an already-tracked
// row into it too).
export async function importFromGrid(grid, { overwrite = false } = {}) {
  const { rows, blankSkipped } = parseGrid(grid, SHEET_COLUMNS);
  repairRows(rows);
  const result = {
    created: 0,
    updated: 0,
    skippedDuplicate: 0,
    skippedBlank: blankSkipped,
    unmatchedAssignees: [],
    unrecognizedValues: [],
    errors: [],
  };
  const seenKeys = new Set();

  try {
    await withTransaction(async (client) => {
      for (const row of rows) {
        const key = resolveKey(row, seenKeys);
        if (!key) {
          result.skippedDuplicate++;
          continue;
        }
        const rowResult = await upsertLeadFromRow(client, key, row, { source: 'manual', overwrite });
        applyRowResult(result, rowResult);
      }
    });
  } catch (err) {
    result.errors.push({ message: err.message });
    result.finishedAt = new Date().toISOString();
    throw err;
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

// Push a single lead's CRM-owned fields back to its row in the sheet.
// If the lead has no sheet_row yet (created manually or via file upload), a
// new row is appended and the row number is recorded for future write-backs.
export async function writeBackLead(leadId) {
  if (!isSheetsConfigured) return { skipped: true };

  const leadRes = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
  const lead = leadRes.rows[0];
  if (!lead) return { skipped: true, reason: 'Lead not found' };

  let assignedUser = null;
  if (lead.assigned_user_id) {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [lead.assigned_user_id]);
    assignedUser = userRes.rows[0] || null;
  }

  const fieldValues = {
    assigned_display: assignedUser ? assignedUser.name : '',
    status: lead.status || '',
    priority: lead.priority || '',
    notes: lead.notes || '',
    last_contacted: lead.last_contacted || '',
    next_follow_up: lead.next_follow_up || '',
  };

  const { headerMap, headerRow } = await readSheet({ columns: SHEET_COLUMNS });

  if (lead.sheet_row) {
    await writeRowCells({ columns: SHEET_COLUMNS, headerMap, rowNumber: lead.sheet_row, fieldValues });
  } else {
    const newRowNumber = await appendRow({
      columns: SHEET_COLUMNS,
      headerRow,
      fieldValues: {
        ...fieldValues,
        unique_key: lead.unique_key,
        name: lead.name,
        mob: lead.mob,
        city: lead.city,
        date: lead.date,
        interested_in: lead.interested_in,
      },
    });
    if (newRowNumber) await pool.query('UPDATE leads SET sheet_row = $1 WHERE id = $2', [newRowNumber, lead.id]);
  }

  return { skipped: false };
}

export function startScheduledSync() {
  if (!isSheetsConfigured || env.sheetSyncIntervalMinutes <= 0) {
    console.log('Scheduled sheet sync disabled (not configured or interval <= 0)');
    return;
  }
  const minutes = Math.min(59, Math.max(1, Math.round(env.sheetSyncIntervalMinutes)));
  cron.schedule(`*/${minutes} * * * *`, () => {
    importFromSheet().catch((err) => console.error('Scheduled sheet sync failed:', err.message));
  });
  console.log(`Scheduled sheet sync every ${minutes} minute(s)`);
}
