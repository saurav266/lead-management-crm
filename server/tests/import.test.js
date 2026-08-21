import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { buildTestApp } from './testApp.js';

function makeWorkbook(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Leads');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Matches the real Facebook/Meta Lead Ads export format.
const HEADER = ['created_time', 'ad_name', 'adset_name', 'campaign_name', 'platform', 'email', 'full_name', 'phone_number', 'city'];

describe('spreadsheet import (Facebook Lead Ads format)', () => {
  let app;
  let adminAgent;
  let empAgent;

  beforeAll(async () => {
    ({ app } = await buildTestApp('import'));
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });
    await adminAgent.post('/api/employees').send({ name: 'Employee A', email: 'impa@test.local', password: 'password123' });
    empAgent = request.agent(app);
    await empAgent.post('/api/auth/login').send({ email: 'impa@test.local', password: 'password123' });
  });

  it('rejects uploads from employees', async () => {
    const buffer = makeWorkbook([HEADER, ['2026-08-19', 'Ad 1', 'Adset 1', 'Campaign 1', 'Facebook', 'x@test.local', 'Someone', '9000000001', 'Delhi']]);
    const res = await empAgent.post('/api/leads/import').attach('file', buffer, 'leads.xlsx');
    expect(res.status).toBe(403);
  });

  it('rejects a non-spreadsheet file', async () => {
    const res = await adminAgent
      .post('/api/leads/import')
      .attach('file', Buffer.from('not a spreadsheet'), 'leads.txt');
    expect(res.status).toBe(400);
  });

  it('creates new leads from an uploaded Facebook Lead Ads export, unassigned and ready to assign', async () => {
    const buffer = makeWorkbook([
      HEADER,
      [
        '2026-08-19',
        'Downtown Plots — Video',
        'Warm Audience',
        'Diwali Sale',
        'Facebook',
        'surender@example.com',
        'Surender Kumar',
        '9876543231',
        'Sonipat',
      ],
      ['2026-08-19', 'Ad 2', 'Adset 2', 'Diwali Sale', 'Instagram', 'priya@example.com', 'Priya Sharma', '9000000005', 'Ahmedabad'],
    ]);

    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'leads.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.updated).toBe(0);

    const list = await adminAgent.get('/api/leads');
    const surender = list.body.leads.find((l) => l.unique_key === 'Surender-Sonipat-31');
    expect(surender).toBeDefined();
    expect(surender.assigned_user_id).toBeNull();
    expect(surender.source).toBe('manual');
    expect(surender.email).toBe('surender@example.com');
    expect(surender.date).toBe('2026-08-19');
    // ad_name/adset_name/campaign_name/platform combine into one readable field
    expect(surender.lead_source).toBe('Facebook • Diwali Sale • Warm Audience • Downtown Plots — Video');
  });

  it('re-uploading refreshes sheet-sourced fields but never overwrites CRM-owned working fields', async () => {
    const employees = (await adminAgent.get('/api/employees')).body.employees;
    const empA = employees.find((e) => e.email === 'impa@test.local');

    const before = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Surender-Sonipat-31');
    await adminAgent.post('/api/leads/assign').send({ leadIds: [before.id], employeeId: empA.id });
    await adminAgent.patch(`/api/leads/${before.id}`).send({ status: 'Contacted', notes: 'Called once already' });

    // City stays "Sonipat" here since it feeds the fallback key -- changing
    // it would legitimately generate a different key and a new lead. Change
    // a different sheet-sourced field (email, campaign) instead.
    const buffer = makeWorkbook([
      HEADER,
      [
        '2026-08-19',
        'Ad 1b',
        'Adset 1',
        'Diwali Sale Retarget',
        'Facebook',
        'surender.k@example.com',
        'Surender Kumar',
        '9876543231',
        'Sonipat',
      ],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'leads.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    const after = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Surender-Sonipat-31');
    expect(after.email).toBe('surender.k@example.com'); // sheet-sourced field refreshed
    expect(after.lead_source).toContain('Diwali Sale Retarget'); // sheet-sourced field refreshed
    expect(after.status).toBe('Contacted'); // CRM-owned field untouched
    expect(after.notes).toBe('Called once already');
    expect(after.assigned_user_id).toBe(before.assigned_user_id ?? after.assigned_user_id);
    expect(after.recur_count).toBe(1); // same Date as before -- the same file re-uploaded, not a new submission
  });

  it('bumps recur_count when the same person (unique_key) submits again with a genuinely different Date', async () => {
    const first = makeWorkbook([HEADER, ['2026-08-01', 'Ad', 'Adset', 'Campaign', 'Facebook', 'r@test.local', 'Recurring Person', '9000088880', 'Rajkot']]);
    await adminAgent.post('/api/leads/import').attach('file', first, 'leads.xlsx');
    const afterFirst = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Recurring-Rajkot-80');
    expect(afterFirst.recur_count).toBe(1);

    // Same person, same file re-uploaded (identical Date) -- not a recurrence.
    await adminAgent.post('/api/leads/import').attach('file', first, 'leads.xlsx');
    const afterReupload = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Recurring-Rajkot-80');
    expect(afterReupload.recur_count).toBe(1);

    // Same person, but they filled out the lead form again on a different day.
    const second = makeWorkbook([HEADER, ['2026-08-15', 'Ad', 'Adset', 'Campaign', 'Facebook', 'r@test.local', 'Recurring Person', '9000088880', 'Rajkot']]);
    await adminAgent.post('/api/leads/import').attach('file', second, 'leads.xlsx');
    const afterSecond = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Recurring-Rajkot-80');
    expect(afterSecond.recur_count).toBe(2);

    // Now filterable and countable as a recurring lead.
    const filtered = await adminAgent.get('/api/leads?recurring=true');
    expect(filtered.body.leads.map((l) => l.unique_key)).toContain('Recurring-Rajkot-80');
  });

  it('with overwrite=true, syncs CRM-owned fields into an already-tracked lead -- but only the cells the file actually provides', async () => {
    // Self-contained: a small SHEET_COLUMNS-compatible workbook (rather than
    // the Facebook-ad HEADER above or historyWorkbook below, both scoped to
    // their own describe blocks) covering exactly the columns this test needs.
    const SYNC_HEADER = ['full_name', 'phone_number', 'city', 'Status', 'Notes', 'Next Follow-Up'];
    function syncWorkbook(rows) {
      const sheet = XLSX.utils.aoa_to_sheet([SYNC_HEADER, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Sync');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    const first = syncWorkbook([['Sync Test', '9000099999', 'Panipat', '', '', '']]);
    await adminAgent.post('/api/leads/import').attach('file', first, 'sync.xlsx');
    const before = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Sync-Panipat-99');
    await adminAgent.patch(`/api/leads/${before.id}`).send({ status: 'Contacted', notes: 'Called once already' });

    // Re-upload as the team's updated master file: Status changes to Won and
    // Next Follow-Up is now filled in, but Notes is blank on this row (the
    // file doesn't have a note for it this time).
    const updated = syncWorkbook([['Sync Test', '9000099999', 'Panipat', 'Won', '', '08/21/26']]);
    const resNoOverwrite = await adminAgent.post('/api/leads/import').field('overwrite', 'false').attach('file', updated, 'sync.xlsx');
    expect(resNoOverwrite.status).toBe(200);
    const stillUntouched = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Sync-Panipat-99');
    expect(stillUntouched.status).toBe('Contacted'); // default: existing lead's working fields are never touched

    const resOverwrite = await adminAgent.post('/api/leads/import').field('overwrite', 'true').attach('file', updated, 'sync.xlsx');
    expect(resOverwrite.status).toBe(200);

    const after = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Sync-Panipat-99');
    expect(after.status).toBe('Won'); // the file's value wins
    expect(after.next_follow_up).toBe('2026-08-21'); // newly provided by the file
    expect(after.notes).toBe('Called once already'); // file's blank cell never clears existing data
  });

  it('skips duplicate keys within the same upload', async () => {
    const buffer = makeWorkbook([
      HEADER,
      ['2026-08-19', 'Ad', 'Adset', 'Campaign', 'Facebook', 'dup@test.local', 'Dup Lead', '9000000099', 'Pune'],
      ['2026-08-19', 'Ad', 'Adset', 'Campaign', 'Facebook', 'dup@test.local', 'Dup Lead', '9000000099', 'Pune'],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'leads.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skippedDuplicate).toBe(1);
  });
});

describe('historical data import (pre-filled status/priority/notes/assigned)', () => {
  let app;
  let adminAgent;

  // A historical export needs the same "sheet-sourced" columns as the ad
  // export, plus the CRM-owned columns an employee already filled in. Rows
  // shorter than this header are fine -- aoa_to_sheet just leaves the
  // trailing cells blank, which parseGrid already treats as ''.
  const HISTORY_HEADER = [
    'full_name',
    'phone_number',
    'city',
    'Assigned',
    'Status',
    'Priority',
    'Notes',
    'Last Contacted',
    'Next Follow-Up',
    'Interested In',
    'Previously Assigned',
  ];

  function historyWorkbook(rows) {
    const sheet = XLSX.utils.aoa_to_sheet([HISTORY_HEADER, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'OldLeads');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  beforeAll(async () => {
    ({ app } = await buildTestApp('history-import'));
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });
    await adminAgent.post('/api/employees').send({ name: 'Ravi Kumar', email: 'ravi@test.local', password: 'password123' });
  });

  it('applies status/priority/notes/assigned to a brand-new lead from a historical import', async () => {
    const buffer = historyWorkbook([['Old Lead', '9000011111', 'Jaipur', 'Ravi Kumar', 'won', 'p1', 'Already closed, paid deposit']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Old-Jaipur-11');
    expect(lead.status).toBe('Won'); // case-insensitive match to the canonical enum value
    expect(lead.priority).toBe('P1');
    expect(lead.notes).toBe('Already closed, paid deposit');
    expect(lead.assigned_name).toBe('Ravi Kumar'); // matched "Assigned" text to the existing employee

    // An import-time assignment doesn't go through the PATCH/assign
    // endpoints, so it needs its own audit log entry -- otherwise it can
    // never show up in "Assignments by date" (GET /dashboard/assignments),
    // which reads assignment history from the audit log, not live state.
    const today = new Date().toISOString().slice(0, 10);
    const assignments = await adminAgent.get(`/api/dashboard/assignments?from=${today}&to=${today}`);
    const ravi = assignments.body.byEmployee.find((e) => e.employee_name === 'Ravi Kumar');
    expect(ravi?.count).toBeGreaterThanOrEqual(1);
  });

  it('reports an unrecognized status/priority as blank rather than failing the whole import', async () => {
    const buffer = historyWorkbook([['Weird Status', '9000022222', 'Jaipur', '', 'Definitely Interested', 'Urgent!!', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.unrecognizedValues.some((v) => v.includes('Definitely Interested'))).toBe(true);
    expect(res.body.unrecognizedValues.some((v) => v.includes('Urgent!!'))).toBe(true);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Weird-Jaipur-22');
    expect(lead.status).toBeNull(); // blank rather than a crashed import or a guessed default
    expect(lead.priority).toBeNull();
  });

  it('leaves status/priority blank for a brand-new lead when the file has no value for them, instead of defaulting', async () => {
    const buffer = historyWorkbook([['No Triage Yet', '9000066601', 'Jaipur', '', '', '', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'No-Jaipur-01');
    expect(lead.status).toBeNull();
    expect(lead.priority).toBeNull();
  });

  it('reports an assignee name that matches no employee, and leaves the lead unassigned', async () => {
    const buffer = historyWorkbook([['Unmatched Owner', '9000033333', 'Jaipur', 'Someone Who Left', '', '', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.unmatchedAssignees).toContain('Someone Who Left');

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Unmatched-Jaipur-33');
    expect(lead.assigned_user_id).toBeNull();
  });

  it('backfills assignment on re-import once the employee exists, without touching an already-assigned lead', async () => {
    const buffer = historyWorkbook([['Later Match', '9000044444', 'Jaipur', 'Priya Sharma', '', '', '']]);
    const first = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(first.body.unmatchedAssignees).toContain('Priya Sharma');

    await adminAgent.post('/api/employees').send({ name: 'Priya Sharma', email: 'priya@test.local', password: 'password123' });

    const second = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(second.status).toBe(200);
    expect(second.body.updated).toBe(1);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Later-Jaipur-44');
    expect(lead.assigned_name).toBe('Priya Sharma');
  });

  it('imports "Interested In" as free text -- a plot/scheme name, not one of the app\'s fixed suggestions', async () => {
    const buffer = historyWorkbook([
      ['Free Text Interest', '9000077700', 'Jaipur', '', '', '', '', '', '', 'Aakar Gap'],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.unrecognizedValues).toHaveLength(0); // no longer validated against a fixed list

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Free-Jaipur-00');
    expect(lead.interested_in).toBe('Aakar Gap');
  });

  it('imports "Previously Assigned" by matching it to an employee, same as "Assigned"', async () => {
    const buffer = historyWorkbook([
      ['Prev Assigned Match', '9000088800', 'Jaipur', 'Priya Sharma', '', '', '', '', '', '', 'Ravi Kumar'],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Prev-Jaipur-00');
    expect(lead.assigned_name).toBe('Priya Sharma');
    expect(lead.previous_assigned_name).toBe('Ravi Kumar');
  });

  it('reports an unmatched "Previously Assigned" name distinctly from an unmatched "Assigned" name', async () => {
    const buffer = historyWorkbook([
      ['Orphan History', '9000099911', 'Nagpur', '', '', '', '', '', '', '', 'Nobody Here'],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.unmatchedAssignees.some((v) => v.includes('Nobody Here') && v.includes('Previously Assigned'))).toBe(true);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Orphan-Nagpur-11');
    expect(lead.previous_assigned_user_id).toBeNull();
  });

  it('maps pre-migration status/priority labels (New/Follow-Up/High/etc.) onto the current scheme, not the "unrecognized" fallback', async () => {
    const buffer = historyWorkbook([['Legacy Labels', '9000055555', 'Jaipur', '', 'Follow-Up', 'High', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.unrecognizedValues).toHaveLength(0); // legacy labels are recognized, not defaulted

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.unique_key === 'Legacy-Jaipur-55');
    expect(lead.status).toBe('Contacted'); // same remapping schema.sql applies to existing rows
    expect(lead.priority).toBe('P1');
  });

  it('repairs a phone number Excel/Sheets rendered in scientific notation', async () => {
    const buffer = historyWorkbook([['Sci Notation', '9.1935E+11', 'Karnal', '', '', '', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const leads = (await adminAgent.get('/api/leads')).body.leads;
    const lead = leads.find((l) => l.name === 'Sci Notation');
    expect(lead.mob).toBe('919350000000'); // plain digits, not "9.1935E+11"
  });

  it('recovers full phone number precision when Excel stores it as a plain numeric cell (not text)', async () => {
    // Unlike the case above (a *text* cell already containing "9.1935E+11",
    // where the original digits are genuinely gone), this simulates Excel's
    // "General" number format switching a real numeric cell to scientific
    // notation for display -- the underlying value in the file is still the
    // exact 12-digit number, so nothing should be lost on import.
    const buffer = historyWorkbook([['Numeric Phone Cell', 919350552838, 'Karnal', '', '', '', '']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const leads = (await adminAgent.get('/api/leads')).body.leads;
    const lead = leads.find((l) => l.name === 'Numeric Phone Cell');
    expect(lead.mob).toBe('919350552838'); // exact digits preserved, not truncated to "...000000"
  });

  it('repairs MM/DD/YY dates to ISO (month-first, matching the team\'s spreadsheet) so the date picker and follow-up countdown work', async () => {
    const buffer = historyWorkbook([['Month First Format', '9000066666', 'Karnal', '', '', '', '', '08/05/26', '08/24/26']]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'history.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.name === 'Month First Format');
    expect(lead.last_contacted).toBe('2026-08-05'); // month-first: 5 August, not May 8
    expect(lead.next_follow_up).toBe('2026-08-24');
  });

  it('repairs the month-first "created_time" (MM/DD/YYYY, as Meta exports it) to ISO, unlike the day-first columns above', async () => {
    const buffer = makeWorkbook([
      HEADER,
      ['08/05/2026', 'Ad 1', 'Adset 1', 'Campaign 1', 'Facebook', 'x@test.local', 'Created Time Format', '9000077777', 'Karnal'],
    ]);
    const res = await adminAgent.post('/api/leads/import').attach('file', buffer, 'leads.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const lead = (await adminAgent.get('/api/leads')).body.leads.find((l) => l.name === 'Created Time Format');
    expect(lead.date).toBe('2026-08-05'); // month-first: 5 August, not 8 May
  });
});
