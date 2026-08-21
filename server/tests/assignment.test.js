import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { buildTestApp } from './testApp.js';

// supertest/superagent doesn't know how to parse an .xlsx content-type, so
// force it to hand back the raw bytes instead of mangling them as text.
function bufferParser(res, cb) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function readExportRows(res) {
  const workbook = XLSX.read(res.body, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
}

describe('lead assignment & scoping', () => {
  let app;
  let adminAgent;
  let empAAgent;
  let empBAgent;
  let leadForA;
  let leadUnassigned;

  beforeAll(async () => {
    ({ app } = await buildTestApp('assign'));
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });

    await adminAgent.post('/api/employees').send({ name: 'Employee A', email: 'a@test.local', password: 'password123' });
    await adminAgent.post('/api/employees').send({ name: 'Employee B', email: 'b@test.local', password: 'password123' });

    const leadRes1 = await adminAgent
      .post('/api/leads')
      .send({ name: 'Surender', mob: '9999999931', city: 'Sonipat' });
    const leadRes2 = await adminAgent
      .post('/api/leads')
      .send({ name: 'Priya', mob: '8888888822', city: 'Ahmedabad' });
    leadForA = leadRes1.body.lead;
    leadUnassigned = leadRes2.body.lead;

    const employees = (await adminAgent.get('/api/employees')).body.employees;
    const empA = employees.find((e) => e.email === 'a@test.local');

    await adminAgent.post('/api/leads/assign').send({ leadIds: [leadForA.id], employeeId: empA.id });

    empAAgent = request.agent(app);
    await empAAgent.post('/api/auth/login').send({ email: 'a@test.local', password: 'password123' });
    empBAgent = request.agent(app);
    await empBAgent.post('/api/auth/login').send({ email: 'b@test.local', password: 'password123' });
  });

  it('generates a fallback unique key as FirstName-City-lastTwoDigits', () => {
    expect(leadForA.unique_key).toBe('Surender-Sonipat-31');
  });

  it('lets an employee see only their own assigned leads', async () => {
    const res = await empAAgent.get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.leads[0].id).toBe(leadForA.id);
  });

  it('hides leads assigned to other employees', async () => {
    const res = await empBAgent.get('/api/leads');
    expect(res.body.leads).toHaveLength(0);
  });

  it('blocks an employee from fetching a lead that is not theirs', async () => {
    const res = await empBAgent.get(`/api/leads/${leadForA.id}`);
    expect(res.status).toBe(403);
  });

  it('lets an employee update only the allowed working fields on their own lead', async () => {
    const res = await empAAgent.patch(`/api/leads/${leadForA.id}`).send({
      status: 'Contacted',
      priority: 'P1',
      notes: 'Called, interested in site visit',
      name: 'Should Not Change', // not an allowed employee field
    });
    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe('Contacted');
    expect(res.body.lead.priority).toBe('P1');
    expect(res.body.lead.name).toBe('Surender'); // unchanged, admin-only field ignored
  });

  it('blocks an employee from editing a lead assigned to someone else', async () => {
    const res = await empBAgent.patch(`/api/leads/${leadForA.id}`).send({ status: 'Won' });
    expect(res.status).toBe(403);
  });

  it('rejects invalid enum values', async () => {
    const res = await empAAgent.patch(`/api/leads/${leadForA.id}`).send({ status: 'NotARealStatus' });
    expect(res.status).toBe(400);
  });

  it('accepts P5 as a valid priority', async () => {
    const res = await empAAgent.patch(`/api/leads/${leadForA.id}`).send({ priority: 'P5' });
    expect(res.status).toBe(200);
    expect(res.body.lead.priority).toBe('P5');
    await empAAgent.patch(`/api/leads/${leadForA.id}`).send({ priority: 'P1' }); // restore for later tests
  });

  it('blocks employees from the assign endpoint', async () => {
    const res = await empAAgent.post('/api/leads/assign').send({ leadIds: [leadUnassigned.id], employeeId: 1 });
    expect(res.status).toBe(403);
  });

  it('lets admin bulk-assign leads', async () => {
    const employees = (await adminAgent.get('/api/employees')).body.employees;
    const empB = employees.find((e) => e.email === 'b@test.local');
    const res = await adminAgent.post('/api/leads/assign').send({ leadIds: [leadUnassigned.id], employeeId: empB.id });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    const check = await empBAgent.get('/api/leads');
    expect(check.body.leads.map((l) => l.id)).toContain(leadUnassigned.id);
  });

  it('lets an employee add their own personal lead, auto-assigned to themselves', async () => {
    const res = await empAAgent.post('/api/leads').send({ name: 'Manoj', mob: '7777777744', city: 'Jaipur' });
    expect(res.status).toBe(201);
    expect(res.body.lead.assigned_user_id).not.toBeNull();

    const mine = await empAAgent.get('/api/leads');
    expect(mine.body.leads.map((l) => l.id)).toContain(res.body.lead.id);

    // Not visible to a different employee.
    const notMine = await empBAgent.get('/api/leads');
    expect(notMine.body.leads.map((l) => l.id)).not.toContain(res.body.lead.id);

    // Status/priority start blank -- not "Not answered"/"P2" -- so an
    // unreviewed lead is never mistaken for one someone already triaged.
    expect(res.body.lead.status).toBeNull();
    expect(res.body.lead.priority).toBeNull();
  });

  it('leaves an admin-added lead unassigned, unlike an employee-added one', async () => {
    const res = await adminAgent.post('/api/leads').send({ name: 'Kavita', mob: '6666666655', city: 'Indore' });
    expect(res.status).toBe(201);
    expect(res.body.lead.assigned_user_id).toBeNull();
  });

  it('lets an employee reject their own lead, sending it back to unassigned', async () => {
    const created = await empAAgent.post('/api/leads').send({ name: 'Reject Me', mob: '5555500011', city: 'Delhi' });
    const leadId = created.body.lead.id;

    const res = await empAAgent.post(`/api/leads/${leadId}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.lead.assigned_user_id).toBeNull();

    // Gone from the employee's own list, but visible to admin as unassigned.
    const mine = await empAAgent.get('/api/leads');
    expect(mine.body.leads.map((l) => l.id)).not.toContain(leadId);
    const unassigned = await adminAgent.get('/api/leads?assigned=unassigned');
    expect(unassigned.body.leads.map((l) => l.id)).toContain(leadId);
  });

  it('surfaces a rejected lead in the ?assigned=rejected filter with who had it, but not a never-assigned lead', async () => {
    const created = await empAAgent.post('/api/leads').send({ name: 'Reject Filter', mob: '5555500066', city: 'Delhi' });
    const leadId = created.body.lead.id;
    await empAAgent.post(`/api/leads/${leadId}/reject`);

    const rejected = await adminAgent.get('/api/leads?assigned=rejected');
    const found = rejected.body.leads.find((l) => l.id === leadId);
    expect(found).toBeDefined();
    expect(found.previous_assigned_name).toBe('Employee A');

    // A lead that was simply never assigned shouldn't show up as "rejected".
    const neverAssigned = await adminAgent.post('/api/leads').send({ name: 'Never Rejected', mob: '5555500077', city: 'Delhi' });
    const stillRejectedOnly = await adminAgent.get('/api/leads?assigned=rejected');
    expect(stillRejectedOnly.body.leads.map((l) => l.id)).not.toContain(neverAssigned.body.lead.id);

    // Reassigning it takes it out of the rejected pool.
    const employees = (await adminAgent.get('/api/employees')).body.employees;
    const empB = employees.find((e) => e.email === 'b@test.local');
    await adminAgent.post('/api/leads/assign').send({ leadIds: [leadId], employeeId: empB.id });
    const afterReassign = await adminAgent.get('/api/leads?assigned=rejected');
    expect(afterReassign.body.leads.map((l) => l.id)).not.toContain(leadId);

    // ?previouslyAssigned is independent of current assignment -- unlike
    // ?assigned=rejected, it still finds this lead now that it's been
    // reassigned to Employee B, because Employee A previously had it.
    const employees2 = (await adminAgent.get('/api/employees')).body.employees;
    const empA = employees2.find((e) => e.email === 'a@test.local');
    const byPreviouslyAssigned = await adminAgent.get(`/api/leads?previouslyAssigned=${empA.id}`);
    expect(byPreviouslyAssigned.body.leads.map((l) => l.id)).toContain(leadId);
    expect(byPreviouslyAssigned.body.leads.every((l) => l.previous_assigned_name === 'Employee A')).toBe(true);
  });

  it('blocks an employee from rejecting a lead assigned to someone else', async () => {
    const created = await empAAgent.post('/api/leads').send({ name: 'Not Yours', mob: '5555500022', city: 'Delhi' });
    const res = await empBAgent.post(`/api/leads/${created.body.lead.id}/reject`);
    expect(res.status).toBe(403);
  });

  it('rejects a reject on a lead that is not currently assigned', async () => {
    const created = await adminAgent.post('/api/leads').send({ name: 'Never Assigned', mob: '5555500033', city: 'Delhi' });
    const res = await adminAgent.post(`/api/leads/${created.body.lead.id}/reject`);
    expect(res.status).toBe(400);
  });

  it('lets admin permanently delete leads, and blocks employees from doing it', async () => {
    const created = await adminAgent.post('/api/leads').send({ name: 'Delete Me', mob: '5555500044', city: 'Pune' });
    const leadId = created.body.lead.id;

    const blocked = await empAAgent.post('/api/leads/delete').send({ leadIds: [leadId] });
    expect(blocked.status).toBe(403);

    const res = await adminAgent.post('/api/leads/delete').send({ leadIds: [leadId] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);

    const fetchAfter = await adminAgent.get(`/api/leads/${leadId}`);
    expect(fetchAfter.status).toBe(404);
  });

  it('lets admin reset an employee password, and the employee can log in with the new one', async () => {
    const employees = (await adminAgent.get('/api/employees')).body.employees;
    const empA = employees.find((e) => e.email === 'a@test.local');

    const reset = await adminAgent.patch(`/api/employees/${empA.id}`).send({ password: 'brand-new-pass' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'a@test.local', password: 'password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: 'a@test.local', password: 'brand-new-pass' });
    expect(newLogin.status).toBe(200);
  });

  it('lets admin permanently delete an employee, unassigning their leads rather than deleting them', async () => {
    const created = await adminAgent.post('/api/employees').send({ name: 'Temp Employee', email: 'temp@test.local', password: 'password123' });
    const tempId = created.body.employee.id;

    const tempAgent = request.agent(app);
    await tempAgent.post('/api/auth/login').send({ email: 'temp@test.local', password: 'password123' });
    const lead = await adminAgent.post('/api/leads').send({ name: 'Orphan Lead', mob: '5555500055', city: 'Nagpur' });
    await adminAgent.post('/api/leads/assign').send({ leadIds: [lead.body.lead.id], employeeId: tempId });

    const blocked = await tempAgent.delete(`/api/employees/${tempId}`);
    expect(blocked.status).toBe(403);

    const res = await adminAgent.delete(`/api/employees/${tempId}`);
    expect(res.status).toBe(200);

    const afterLead = await adminAgent.get(`/api/leads/${lead.body.lead.id}`);
    expect(afterLead.body.lead.assigned_user_id).toBeNull(); // unassigned, not deleted

    const stillThere = await adminAgent.get('/api/employees');
    expect(stillThere.body.employees.map((e) => e.id)).not.toContain(tempId);

    const loginAfterDelete = await request(app).post('/api/auth/login').send({ email: 'temp@test.local', password: 'password123' });
    expect(loginAfterDelete.status).toBe(401);
  });

  it("lets an employee see their own dashboard, scoped to only their own leads", async () => {
    const mine = await empAAgent.get('/api/dashboard/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBeGreaterThanOrEqual(1);
    // leadForA was set to status "Contacted" earlier in this file.
    expect(mine.body.byStatus.some((s) => s.status === 'Contacted' && s.count >= 1)).toBe(true);
    // Both the bulk-assign (leadForA, in beforeAll) and the self-added
    // personal lead (Manoj) leave an audit trail, so both show up here.
    expect(mine.body.recentlyAssigned.length).toBeGreaterThanOrEqual(2);
    expect(mine.body.recentlyAssigned.every((r) => r.lead_id)).toBe(true);
  });

  it('blocks a non-admin from the team-wide dashboard endpoints', async () => {
    expect((await empAAgent.get('/api/dashboard')).status).toBe(403);
    expect((await empAAgent.get('/api/dashboard/recent-assignments')).status).toBe(403);
  });

  it('lists recent assignments for the admin, newest first, across employees', async () => {
    const res = await adminAgent.get('/api/dashboard/recent-assignments');
    expect(res.status).toBe(200);
    expect(res.body.recentAssignments.length).toBeGreaterThanOrEqual(2);
    expect(res.body.recentAssignments.some((r) => r.employee_name === 'Employee A')).toBe(true);
    expect(res.body.recentAssignments.some((r) => r.employee_name === 'Employee B')).toBe(true);
    // Newest first.
    const times = res.body.recentAssignments.map((r) => new Date(r.created_at).getTime());
    expect([...times]).toEqual([...times].sort((a, b) => b - a));
  });

  it('sorts the leads list by newest lead date first, not most-recently-edited', async () => {
    const older = await adminAgent.post('/api/leads').send({ name: 'Older Dated', mob: '9000012201', city: 'OrderTestCity', date: '2026-01-01' });
    const newer = await adminAgent.post('/api/leads').send({ name: 'Newer Dated', mob: '9000012202', city: 'OrderTestCity', date: '2026-06-01' });
    const noDate = await adminAgent.post('/api/leads').send({ name: 'No Date', mob: '9000012203', city: 'OrderTestCity' });

    // Touch the oldest-dated lead last, so if sorting were still by
    // updated_at it would (wrongly) land first.
    await adminAgent.patch(`/api/leads/${older.body.lead.id}`).send({ notes: 'edited just now' });

    const res = await adminAgent.get('/api/leads?city=OrderTestCity');
    const ids = res.body.leads.map((l) => l.id);
    expect(ids.indexOf(newer.body.lead.id)).toBeLessThan(ids.indexOf(older.body.lead.id));
    expect(ids.indexOf(older.body.lead.id)).toBeLessThan(ids.indexOf(noDate.body.lead.id)); // undated sinks to the bottom
  });

  it('paginates the leads list with a chosen page size, and rejects an arbitrary limit', async () => {
    for (let i = 0; i < 12; i++) {
      await adminAgent.post('/api/leads').send({ name: `Page Test ${i}`, mob: `900002${String(i).padStart(4, '0')}`, city: 'PaginationTestCity' });
    }

    const page1 = await adminAgent.get('/api/leads?city=PaginationTestCity&limit=10&page=1');
    expect(page1.status).toBe(200);
    expect(page1.body.leads).toHaveLength(10);
    expect(page1.body.total).toBe(12);
    expect(page1.body.limit).toBe(10);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageCount).toBe(2);

    const page2 = await adminAgent.get('/api/leads?city=PaginationTestCity&limit=10&page=2');
    expect(page2.body.leads).toHaveLength(2);
    expect(page2.body.page).toBe(2);

    // No overlap between the two pages.
    const page1Ids = new Set(page1.body.leads.map((l) => l.id));
    expect(page2.body.leads.every((l) => !page1Ids.has(l.id))).toBe(true);

    // An unsupported page size (not one of 10/50/100/500) silently falls
    // back to the default rather than honoring an arbitrary value.
    const badLimit = await adminAgent.get('/api/leads?city=PaginationTestCity&limit=999999');
    expect(badLimit.body.limit).toBe(50);
    expect(badLimit.body.leads).toHaveLength(12); // all 12 fit comfortably under the default of 50
  });

  it('lets admin export all leads as a spreadsheet, with headers matching the importer', async () => {
    const res = await adminAgent.get('/api/leads/export').buffer(true).parse(bufferParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('attachment');

    const rows = readExportRows(res);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(rows[0])).toEqual(
      expect.arrayContaining(['Key', 'full_name', 'phone_number', 'Status', 'Priority', 'Last Contacted', 'Next Follow-Up'])
    );
    expect(rows.some((r) => r.Key === leadForA.unique_key)).toBe(true);
  });

  it('lets the export pick a subset of columns via ?columns=, in a fixed order regardless of the query order', async () => {
    const res = await adminAgent.get('/api/leads/export?columns=status,name,mob').buffer(true).parse(bufferParser);
    expect(res.status).toBe(200);
    const rows = readExportRows(res);
    expect(Object.keys(rows[0])).toEqual(['full_name', 'phone_number', 'Status']); // EXPORT_COLUMNS order, not query order
  });

  it('falls back to every column when ?columns= has no recognized keys', async () => {
    const res = await adminAgent.get('/api/leads/export?columns=not,a,real,column').buffer(true).parse(bufferParser);
    expect(res.status).toBe(200);
    const rows = readExportRows(res);
    expect(Object.keys(rows[0])).toContain('Key');
    expect(Object.keys(rows[0])).toContain('Status');
  });

  it('exports just rejected leads by combining ?assigned=rejected with a column selection', async () => {
    const created = await empAAgent.post('/api/leads').send({ name: 'Export Reject Test', mob: '5555511122', city: 'Pune' });
    const leadId = created.body.lead.id;
    await empAAgent.post(`/api/leads/${leadId}/reject`);

    const res = await adminAgent
      .get('/api/leads/export?assigned=rejected&columns=name,previously_assigned')
      .buffer(true)
      .parse(bufferParser);
    expect(res.status).toBe(200);
    const rows = readExportRows(res);
    expect(Object.keys(rows[0])).toEqual(['full_name', 'Previously Assigned']);
    const row = rows.find((r) => r.full_name === 'Export Reject Test');
    expect(row).toBeDefined();
    expect(row['Previously Assigned']).toBe('Employee A');
  });

  it("scopes an employee's export to only their own leads, same as their leads list", async () => {
    const res = await empAAgent.get('/api/leads/export').buffer(true).parse(bufferParser);
    expect(res.status).toBe(200);
    const rows = readExportRows(res);
    expect(rows.every((r) => r.Assigned === 'Employee A')).toBe(true);
    expect(rows.some((r) => r.Key === leadForA.unique_key)).toBe(true);
  });

  it('respects the same filters as the leads list, e.g. ?status=', async () => {
    const res = await adminAgent.get('/api/leads/export?status=Contacted').buffer(true).parse(bufferParser);
    expect(res.status).toBe(200);
    const rows = readExportRows(res);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.Status === 'Contacted')).toBe(true);
  });
});
