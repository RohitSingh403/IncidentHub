import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app;
let mongod;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';
  delete process.env.REDIS_URL;

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

describe('on-call escalation', () => {
  it('pages the current on-call engineer, then the manager, and stops after acknowledgement', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session = await request(app).post('/api/auth/register').send({
      name: 'Owner',
      email: `owner-${unique}@example.com`,
      password: 'Password1',
      organizationName: `Escalation ${unique}`,
    });
    expect(session.status).toBe(201);
    const token = session.body.data.token;

    const engineer = await request(app)
      .post('/api/members')
      .set(authHeader(token))
      .send({
        name: 'Ada',
        email: `ada-${unique}@example.com`,
        password: 'Password1',
        role: 'engineer',
      });
    const manager = await request(app)
      .post('/api/members')
      .set(authHeader(token))
      .send({
        name: 'Grace',
        email: `grace-${unique}@example.com`,
        password: 'Password1',
        role: 'engineer',
      });
    expect(engineer.status).toBe(201);
    expect(manager.status).toBe(201);

    const team = await request(app)
      .post('/api/teams')
      .set(authHeader(token))
      .send({ name: 'Platform', description: '', managerId: manager.body.data.userId });
    expect(team.status).toBe(201);

    const schedule = await request(app)
      .post('/api/on-call/schedules')
      .set(authHeader(token))
      .send({
        teamId: team.body.data.id,
        name: 'Primary',
        timezone: 'UTC',
        rotation: 'daily',
        startDate: new Date().toISOString(),
        handoffMinutes: 0,
        memberIds: [engineer.body.data.userId],
      });
    expect(schedule.status).toBe(201);
    expect(schedule.body.data.current.userId).toBe(engineer.body.data.userId);

    const policy = await request(app)
      .post('/api/escalation-policies')
      .set(authHeader(token))
      .send({
        name: 'Platform policy',
        teamId: team.body.data.id,
        steps: [
          { target: 'on_call', waitMinutes: 5 },
          { target: 'team_manager', waitMinutes: 5 },
        ],
      });
    expect(policy.status).toBe(201);

    const service = await request(app)
      .post('/api/services')
      .set(authHeader(token))
      .send({
        name: 'Checkout',
        url: 'https://example.com/health',
        environment: 'production',
        criticality: 'critical',
        monitoringEnabled: true,
        teamId: team.body.data.id,
      });
    expect(service.status).toBe(201);

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

    const open = await request(app).get('/api/incidents').set(authHeader(token));
    expect(open.body.data).toHaveLength(1);
    expect(open.body.data[0].assignedUser.id).toBe(engineer.body.data.userId);
    expect(open.body.data[0].escalationStep).toBe(0);

    const { advanceEscalation } = await import('../src/services/escalationService.js');
    const advanced = await advanceEscalation(open.body.data[0].id);
    expect(advanced).toMatchObject({ action: 'escalate', stepIndex: 1 });

    const stepped = await request(app)
      .get(`/api/incidents/${open.body.data[0].id}`)
      .set(authHeader(token));
    expect(stepped.body.data.assignedUser.id).toBe(manager.body.data.userId);
    expect(stepped.body.data.escalationStep).toBe(1);
    expect(stepped.body.data.status).toBe('OPEN');

    const acknowledged = await request(app)
      .post(`/api/incidents/${open.body.data[0].id}/transition`)
      .set(authHeader(token))
      .send({ status: 'ACKNOWLEDGED' });
    expect(acknowledged.status).toBe(200);

    const stopped = await advanceEscalation(open.body.data[0].id);
    expect(stopped.action).toBe('stop');

    const after = await request(app)
      .get(`/api/incidents/${open.body.data[0].id}`)
      .set(authHeader(token));
    expect(after.body.data.status).toBe('ACKNOWLEDGED');
    expect(after.body.data.escalationStep).toBe(1);

    const redis = await request(app).get('/api/health/redis');
    expect(redis.status).toBe(200);
    expect(redis.body.data.status).toBe('skipped');
  });
});
