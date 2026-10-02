import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app;
let mongod;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';
  delete process.env.SMTP_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.AI_API_KEY;

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

describe('operations', () => {
  it('records audit, issues an API key, and keeps billing unconnected', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session = await request(app).post('/api/auth/register').send({
      name: 'Owner',
      email: `ops-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Ops ${unique}`,
    });
    const other = await request(app).post('/api/auth/register').send({
      name: 'Other',
      email: `ops-other-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Other ${unique}`,
    });
    const token = session.body.data.token;

    const service = await request(app)
      .post('/api/services')
      .set(authHeader(token))
      .send({
        name: 'Billing API',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'high',
        monitoringEnabled: false,
      });
    const dependency = await request(app)
      .post('/api/services')
      .set(authHeader(token))
      .send({
        name: 'Ledger',
        url: 'https://example.com/ledger',
        environment: 'production',
        criticality: 'medium',
        monitoringEnabled: false,
      });

    const linked = await request(app)
      .put('/api/operations/dependencies')
      .set(authHeader(token))
      .send({ serviceId: service.body.data.id, dependsOn: [dependency.body.data.id] });
    expect(linked.status).toBe(200);

    const incident = await request(app)
      .post('/api/incidents')
      .set(authHeader(token))
      .send({ title: 'Ledger timeout', serviceId: service.body.data.id, severity: 'SEV-3' });
    expect(incident.status).toBe(201);

    const audit = await request(app).get('/api/audit').set(authHeader(token));
    expect(audit.status).toBe(200);
    expect(audit.body.data.some((event) => event.action === 'incident.opened')).toBe(true);
    const hidden = await request(app).get('/api/audit').set(authHeader(other.body.data.token));
    expect(hidden.body.data).toEqual([]);

    const brief = await request(app).post(`/api/incidents/${incident.body.data.id}/brief`).set(authHeader(token));
    expect(brief.status).toBe(200);
    expect(brief.body.data.source).toBe('timeline');

    const key = await request(app).post('/api/operations/api-keys').set(authHeader(token)).send({ name: 'CI' });
    expect(key.status).toBe(201);
    expect(key.body.data.key.startsWith('ih_')).toBe(true);
    const viaKey = await request(app).get('/api/operations').set(authHeader(key.body.data.key));
    expect(viaKey.status).toBe(200);

    const second = await request(app).post('/api/operations/api-keys').set(authHeader(token)).send({ name: 'Extra' });
    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe('QUOTA_EXCEEDED');

    const checkout = await request(app).post('/api/operations/checkout').set(authHeader(token));
    expect(checkout.status).toBe(503);
    expect(checkout.body.error.code).toBe('BILLING_UNAVAILABLE');

    const window = await request(app)
      .post('/api/operations/maintenance')
      .set(authHeader(token))
      .send({
        serviceId: service.body.data.id,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: 'Deploy',
      });
    expect(window.status).toBe(201);
    const denied = await request(app)
      .delete(`/api/operations/maintenance/${window.body.data.id}`)
      .set(authHeader(other.body.data.token));
    expect(denied.status).toBe(403);
  });
});
