import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './testApp.js';

describe('auth', () => {
  let app;

  it('rejects invalid credentials', async () => {
    ({ app } = await buildTestApp('auth'));
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs the seeded admin in and sets an httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'admin-password' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    const cookie = res.headers['set-cookie']?.[0];
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  it('allows access to /api/auth/me once logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.local');
  });

  it('blocks employee endpoints for non-admin roles', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });

    const created = await agent
      .post('/api/employees')
      .send({ name: 'Employee One', email: 'emp1@test.local', password: 'password123' });
    expect(created.status).toBe(201);

    const empAgent = request.agent(app);
    await empAgent.post('/api/auth/login').send({ email: 'emp1@test.local', password: 'password123' });

    const forbidden = await empAgent.get('/api/employees');
    expect(forbidden.status).toBe(403);
  });

  it('rejects login for deactivated employees', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'admin-password' });
    const list = await agent.get('/api/employees');
    const emp = list.body.employees.find((e) => e.email === 'emp1@test.local');
    await agent.patch(`/api/employees/${emp.id}`).send({ active: false });

    const res = await request(app).post('/api/auth/login').send({ email: 'emp1@test.local', password: 'password123' });
    expect(res.status).toBe(401);
  });
});
