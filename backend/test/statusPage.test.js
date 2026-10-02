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

describe('public status page', () => {
  it('publishes a customer state that is separate from the internal incident', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session = await request(app).post('/api/auth/register').send({
      name: 'Owner',
      email: `owner-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Status ${unique}`,
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
        criticality: 'critical',
        monitoringEnabled: true,
      });
    expect(service.status).toBe(201);

    const page = await request(app)
      .post('/api/status-pages')
      .set(authHeader(token))
      .send({ name: 'Acme Status', description: 'Customer view' });
    expect(page.status).toBe(201);

    const second = await request(app)
      .post('/api/status-pages')
      .set(authHeader(token))
      .send({ name: 'Another page' });
    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe('QUOTA_EXCEEDED');

    const withComponent = await request(app)
      .post(`/api/status-pages/${page.body.data.id}/components`)
      .set(authHeader(token))
      .send({ serviceId: service.body.data.id });
    expect(withComponent.status).toBe(201);

    const leaked = await request(app)
      .post(`/api/status-pages/${page.body.data.id}/components`)
      .set(authHeader(other.body.data.token))
      .send({ serviceId: service.body.data.id });
    expect(leaked.status).toBe(403);

    const { ingestCheck } = await import('../src/services/monitoringService.js');
    const failure = {
      success: false,
      statusCode: 503,
      responseTimeMs: 40,
      error: 'Expected HTTP 200 but received 503',
    };
    await ingestCheck(service.body.data.monitor.id, failure);
    await ingestCheck(service.body.data.monitor.id, failure);
    await ingestCheck(service.body.data.monitor.id, failure);

    const published = await request(app).get(`/api/public/status/${page.body.data.slug}`);
    expect(published.status).toBe(200);
    expect(published.body.data.summary).toBe('Major outage');
    expect(published.body.data.components[0].status).toBe('investigating');
    expect(published.body.data.active[0].label).toBe('Investigating');
    const publicBody = JSON.stringify(published.body);
    expect(publicBody).not.toContain('SEV-1');
    expect(publicBody).not.toContain('OPEN');
    expect(publicBody).not.toContain('organizationId');

    const identified = await request(app)
      .post(`/api/status-pages/incidents/${published.body.data.active[0].id}/updates`)
      .set(authHeader(token))
      .send({ publicStatus: 'identified', message: 'The payment database is failing over.' });
    expect(identified.status).toBe(200);
    expect(identified.body.data.active[0].status).toBe('identified');

    const backward = await request(app)
      .post(`/api/status-pages/incidents/${published.body.data.active[0].id}/updates`)
      .set(authHeader(token))
      .send({ publicStatus: 'investigating', message: 'Going backwards.' });
    expect(backward.status).toBe(409);

    await ingestCheck(service.body.data.monitor.id, { success: true, statusCode: 200, responseTimeMs: 30, error: null });
    await ingestCheck(service.body.data.monitor.id, { success: true, statusCode: 200, responseTimeMs: 28, error: null });

    const recovered = await request(app).get(`/api/public/status/${page.body.data.slug}`);
    expect(recovered.body.data.summary).toBe('All systems operational');
    expect(recovered.body.data.active).toEqual([]);
    expect(recovered.body.data.history[0].status).toBe('resolved');
    expect(recovered.body.data.components[0].status).toBe('operational');
  });
});
