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

describe('postmortems', () => {
  it('can be written only after resolution and tracks an action item', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session = await request(app).post('/api/auth/register').send({
      name: 'Owner',
      email: `owner-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Postmortem ${unique}`,
    });
    const other = await request(app).post('/api/auth/register').send({
      name: 'Other',
      email: `other-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Other ${unique}`,
    });
    const token = session.body.data.token;

    const service = await request(app)
      .post('/api/services')
      .set(authHeader(token))
      .send({
        name: 'Payment API',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'high',
        monitoringEnabled: false,
      });
    const created = await request(app)
      .post('/api/incidents')
      .set(authHeader(token))
      .send({ title: 'Checkout failed', serviceId: service.body.data.id, severity: 'SEV-2' });
    expect(created.status).toBe(201);

    const tooSoon = await request(app)
      .post(`/api/incidents/${created.body.data.id}/postmortem`)
      .set(authHeader(token));
    expect(tooSoon.status).toBe(409);

    const resolved = await request(app)
      .post(`/api/incidents/${created.body.data.id}/transition`)
      .set(authHeader(token))
      .send({ status: 'RESOLVED' });
    expect(resolved.status).toBe(200);

    const postmortem = await request(app)
      .post(`/api/incidents/${created.body.data.id}/postmortem`)
      .set(authHeader(token));
    expect(postmortem.status).toBe(201);
    expect(postmortem.body.data.timeline).toContain('Incident created manually');
    expect(postmortem.body.data.incidentNumber).toMatch(/^INC-/);

    const duplicate = await request(app)
      .post(`/api/incidents/${created.body.data.id}/postmortem`)
      .set(authHeader(token));
    expect(duplicate.status).toBe(409);

    const saved = await request(app)
      .patch(`/api/postmortems/${postmortem.body.data.id}`)
      .set(authHeader(token))
      .send({
        summary: 'Checkout returned errors for four minutes.',
        rootCause: 'The connection pool was exhausted.',
        lessonsLearned: 'Page the database owner sooner.',
      });
    expect(saved.status).toBe(200);
    expect(saved.body.data.rootCause).toContain('connection pool');

    const withAction = await request(app)
      .post(`/api/postmortems/${postmortem.body.data.id}/actions`)
      .set(authHeader(token))
      .send({ title: 'Increase the connection pool', ownerId: session.body.data.user.id });
    expect(withAction.status).toBe(201);
    expect(withAction.body.data.actions[0].status).toBe('pending');
    expect(withAction.body.data.actions[0].ownerName).toBe('Owner');

    const done = await request(app)
      .patch(`/api/postmortems/${postmortem.body.data.id}/actions/${withAction.body.data.actions[0].id}`)
      .set(authHeader(token))
      .send({ status: 'done' });
    expect(done.body.data.actions[0].status).toBe('done');

    const hidden = await request(app)
      .get(`/api/postmortems/${postmortem.body.data.id}`)
      .set(authHeader(other.body.data.token));
    expect(hidden.status).toBe(403);
  });
});
