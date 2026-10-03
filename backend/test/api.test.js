import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app;
let mongod;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = await import('mongoose');
  const { connectDb } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  await connectDb();
  await Promise.all(Object.values(mongoose.default.models).map((model) => model.syncIndexes()));
  app = createApp();
}, 120000);

afterAll(async () => {
  const { disconnectDb } = await import('../src/config/db.js');
  await disconnectDb();
  if (mongod) await mongod.stop();
});

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function register(organizationName = 'Acme') {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const response = await request(app).post('/api/auth/register').send({
    name: 'Rohit',
    email: `rohit-${unique}@example.com`,
    password: 'Password1',
    organizationName: `${organizationName} ${unique}`,
  });
  expect(response.status).toBe(201);
  return response.body.data;
}

describe('authentication and tenancy', () => {
  it('registers an owner and rejects a bad login with a generic error', async () => {
    const session = await register();
    expect(session.user.role).toBe('owner');
    expect(session.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({
      email: session.user.email,
      password: 'wrong-password',
    });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');

    const unknown = await request(app).post('/api/auth/login').send({
      email: 'missing@example.com',
      password: 'Password1',
    });
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });

  it('hides another organization resource and blocks viewers from creating services', async () => {
    const orgA = await register('Org A');
    const orgB = await register('Org B');

    const created = await request(app)
      .post('/api/services')
      .set(authHeader(orgA.token))
      .send({
        name: 'Payment API',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'critical',
        monitoringEnabled: true,
      });
    expect(created.status).toBe(201);

    const leaked = await request(app)
      .get(`/api/services/${created.body.data.id}`)
      .set(authHeader(orgB.token));
    expect(leaked.status).toBe(403);

    const listed = await request(app).get('/api/services').set(authHeader(orgB.token));
    expect(listed.body.data).toEqual([]);

    const member = await request(app)
      .post('/api/members')
      .set(authHeader(orgA.token))
      .send({
        name: 'Viewer',
        email: `viewer-${Date.now()}@example.com`,
        password: 'Password1',
        role: 'viewer',
      });
    expect(member.status).toBe(201);

    const viewerLogin = await request(app).post('/api/auth/login').send({
      email: member.body.data.email,
      password: 'Password1',
    });
    const forbidden = await request(app)
      .post('/api/services')
      .set(authHeader(viewerLogin.body.data.token))
      .send({
        name: 'Should fail',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'low',
        monitoringEnabled: false,
      });
    expect(forbidden.status).toBe(403);
  });
});

describe('incident engine', () => {
  it('creates one incident at the failure threshold and resolves it after recovery', async () => {
    const session = await register('Payments');
    const created = await request(app)
      .post('/api/services')
      .set(authHeader(session.token))
      .send({
        name: 'Payment API',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'critical',
        monitoringEnabled: true,
      });
    const monitorId = created.body.data.monitor.id;
    const { ingestCheck } = await import('../src/services/monitoringService.js');
    const failure = {
      success: false,
      statusCode: 503,
      responseTimeMs: 90,
      error: 'Expected HTTP 200 but received 503',
    };

    await ingestCheck(monitorId, failure);
    await ingestCheck(monitorId, failure);
    await ingestCheck(monitorId, failure);
    await ingestCheck(monitorId, failure);

    const open = await request(app).get('/api/incidents').set(authHeader(session.token));
    expect(open.body.data).toHaveLength(1);
    expect(open.body.data[0].severity).toBe('SEV-1');
    expect(open.body.data[0].status).toBe('OPEN');
    expect(open.body.data[0].number).toMatch(/^INC-/);

    const illegal = await request(app)
      .post(`/api/incidents/${open.body.data[0].id}/transition`)
      .set(authHeader(session.token))
      .send({ status: 'INVESTIGATING' });
    expect(illegal.status).toBe(409);

    const acknowledged = await request(app)
      .post(`/api/incidents/${open.body.data[0].id}/transition`)
      .set(authHeader(session.token))
      .send({ status: 'ACKNOWLEDGED' });
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.data.status).toBe('ACKNOWLEDGED');

    await ingestCheck(monitorId, { success: true, statusCode: 200, responseTimeMs: 80, error: null });
    await ingestCheck(monitorId, { success: true, statusCode: 200, responseTimeMs: 70, error: null });

    const resolved = await request(app)
      .get(`/api/incidents/${open.body.data[0].id}`)
      .set(authHeader(session.token));
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect(resolved.body.data.timeline.some((event) => event.type === 'incident.created')).toBe(true);

    const notifications = await request(app)
      .get('/api/notifications')
      .set(authHeader(session.token));
    expect(notifications.body.data.unreadCount).toBeGreaterThan(0);
  });

  it('enforces the free-plan service limit', async () => {
    const session = await register('Quota');
    for (let index = 0; index < 1; index += 1) {
      const response = await request(app)
        .post('/api/services')
        .set(authHeader(session.token))
        .send({
          name: `Service ${index}`,
          url: 'https://example.com/health',
          environment: 'production',
          criticality: 'low',
          monitoringEnabled: false,
        });
      expect(response.status).toBe(201);
    }

    const overflow = await request(app)
      .post('/api/services')
      .set(authHeader(session.token))
      .send({
        name: 'One too many',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'low',
        monitoringEnabled: false,
      });
    expect(overflow.status).toBe(403);
    expect(overflow.body.error.code).toBe('QUOTA_EXCEEDED');
  });
});
