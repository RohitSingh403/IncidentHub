import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/domain/incidentTransitions.js';
import { severityForAvailability, severityForLatency } from '../src/domain/severity.js';
import { meanMinutes, percentile, uptimePercent } from '../src/domain/metrics.js';
import { applyCheckResult } from '../src/domain/monitorState.js';
import { classifyResponse } from '../src/domain/classifyResponse.js';
import { hasPermission } from '../src/domain/permissions.js';
import { resolveOnCall } from '../src/domain/onCall.js';
import { escalationDecision } from '../src/domain/escalation.js';
import { canChangePublicStatus, componentAppearance, pageSummary } from '../src/domain/statusPublic.js';

const baseMonitor = {
  failureThreshold: 3,
  recoveryThreshold: 2,
  latencyThresholdMs: 2000,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  consecutiveSlow: 0,
  serviceStatus: 'healthy',
};

function step(state, check) {
  return applyCheckResult({ ...baseMonitor, ...state }, check);
}

describe('incident transitions', () => {
  it('allows acknowledgement and resolution from open', () => {
    expect(canTransition('OPEN', 'ACKNOWLEDGED')).toBe(true);
    expect(canTransition('OPEN', 'RESOLVED')).toBe(true);
  });

  it('rejects skipping from open to investigating', () => {
    expect(canTransition('OPEN', 'INVESTIGATING')).toBe(false);
  });

  it('rejects reopening a resolved incident', () => {
    expect(canTransition('RESOLVED', 'OPEN')).toBe(false);
  });
});

describe('severity', () => {
  it('maps criticality and latency to documented severities', () => {
    expect(severityForAvailability('critical')).toBe('SEV-1');
    expect(severityForAvailability('high')).toBe('SEV-2');
    expect(severityForAvailability('medium')).toBe('SEV-3');
    expect(severityForAvailability('low')).toBe('SEV-3');
    expect(severityForLatency()).toBe('SEV-4');
  });
});

describe('metrics', () => {
  it('calculates uptime, mean minutes, and p95', () => {
    expect(uptimePercent(9990, 10000)).toBeCloseTo(99.9);
    expect(uptimePercent(0, 0)).toBeNull();
    expect(
      meanMinutes([
        { start: '2026-10-03T00:00:00.000Z', end: '2026-10-03T00:10:00.000Z' },
        { start: '2026-10-03T00:00:00.000Z', end: '2026-10-03T00:20:00.000Z' },
      ]),
    ).toBe(15);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });
});

describe('monitor thresholds', () => {
  it('does not open an incident before the failure threshold', () => {
    const first = step({ serviceStatus: 'unknown' }, { success: false, responseTimeMs: 50 });
    const second = step(first, { success: false, responseTimeMs: 50 });
    expect(second.action).toBe('none');
    expect(second.consecutiveFailures).toBe(2);
  });

  it('opens on the third consecutive failure and recovers after two successes', () => {
    let state = step({ serviceStatus: 'healthy' }, { success: false, responseTimeMs: 40 });
    state = step(state, { success: false, responseTimeMs: 40 });
    state = step(state, { success: false, responseTimeMs: 40 });
    expect(state.action).toBe('down');
    expect(state.serviceStatus).toBe('down');

    state = step(state, { success: true, responseTimeMs: 80 });
    expect(state.action).toBe('none');
    expect(state.serviceStatus).toBe('down');

    state = step(state, { success: true, responseTimeMs: 80 });
    expect(state.action).toBe('healthy');
    expect(state.serviceStatus).toBe('healthy');
  });

  it('opens a degradation only after consecutive slow checks', () => {
    let state = step({}, { success: true, responseTimeMs: 4500 });
    expect(state.action).toBe('none');
    state = step(state, { success: true, responseTimeMs: 4500 });
    expect(state.action).toBe('none');
    state = step(state, { success: true, responseTimeMs: 4500 });
    expect(state.action).toBe('degraded');
  });
});

describe('response classification', () => {
  it('fails when the JSON body does not match', () => {
    const result = classifyResponse({
      statusCode: 200,
      body: { status: 'degraded' },
      elapsedMs: 120,
      monitor: { expectedStatus: 200, expectedJsonPath: 'status', expectedJsonValue: 'healthy' },
    });
    expect(result.success).toBe(false);
  });
});

describe('public status', () => {
  it('keeps a separate state machine from the internal incident', () => {
    expect(canChangePublicStatus('investigating', 'identified')).toBe(true);
    expect(canChangePublicStatus('investigating', 'investigating')).toBe(false);
    expect(canChangePublicStatus('resolved', 'monitoring')).toBe(false);
    expect(componentAppearance('down', 'investigating')).toBe('investigating');
    expect(componentAppearance('healthy', 'resolved')).toBe('operational');
  });

  it('rolls components up to a page summary', () => {
    expect(pageSummary(['operational', 'operational'])).toBe('All systems operational');
    expect(pageSummary(['operational', 'investigating'])).toBe('Partial outage');
    expect(pageSummary(['outage'])).toBe('Major outage');
    expect(pageSummary(['operational', 'degraded'])).toBe('Degraded performance');
  });
});

describe('on-call rotation', () => {
  const members = ['ada', 'grace', 'linus'];
  const startDate = '2026-01-01T00:00:00.000Z';

  it('picks the member for the current calendar day', () => {
    const result = resolveOnCall({
      memberIds: members,
      startDate,
      rotation: 'daily',
      timeZone: 'UTC',
      now: '2026-01-03T12:00:00.000Z',
    });
    expect(result).toMatchObject({ userId: 'linus', source: 'rotation', slot: 2 });
  });

  it('clamps a date before the rotation starts to the first member', () => {
    const result = resolveOnCall({
      memberIds: members,
      startDate,
      rotation: 'daily',
      timeZone: 'UTC',
      now: '2025-12-30T12:00:00.000Z',
    });
    expect(result.userId).toBe('ada');
  });

  it('uses weekly slots and lets an override win', () => {
    const weekly = resolveOnCall({
      memberIds: members,
      startDate,
      rotation: 'weekly',
      timeZone: 'UTC',
      now: '2026-01-09T12:00:00.000Z',
    });
    expect(weekly.userId).toBe('grace');

    const override = resolveOnCall({
      memberIds: members,
      startDate,
      rotation: 'daily',
      timeZone: 'UTC',
      now: '2026-01-03T12:00:00.000Z',
      overrides: [{
        userId: 'ops',
        startsAt: '2026-01-03T00:00:00.000Z',
        endsAt: '2026-01-04T00:00:00.000Z',
      }],
    });
    expect(override).toMatchObject({ userId: 'ops', source: 'override' });
  });

  it('holds the previous shift until the handoff minute', () => {
    const result = resolveOnCall({
      memberIds: members,
      startDate,
      rotation: 'daily',
      timeZone: 'UTC',
      handoffMinutes: 9 * 60,
      now: '2026-01-02T08:30:00.000Z',
    });
    expect(result.userId).toBe('ada');
  });
});

describe('escalation decisions', () => {
  it('advances only while the incident is open and steps remain', () => {
    expect(escalationDecision({ status: 'OPEN', currentStep: 0, stepCount: 2 })).toEqual({
      action: 'escalate',
      stepIndex: 1,
    });
    expect(escalationDecision({ status: 'ACKNOWLEDGED', currentStep: 0, stepCount: 2 })).toEqual({
      action: 'stop',
      reason: 'acknowledged_or_closed',
    });
    expect(escalationDecision({ status: 'OPEN', currentStep: 1, stepCount: 2 })).toEqual({
      action: 'stop',
      reason: 'policy_complete',
    });
  });
});

describe('permissions', () => {
  it('lets viewers read and blocks them from writing services', () => {
    expect(hasPermission('viewer', 'service:read')).toBe(true);
    expect(hasPermission('viewer', 'service:write')).toBe(false);
    expect(hasPermission('engineer', 'incident:transition')).toBe(true);
    expect(hasPermission('engineer', 'incident:create')).toBe(false);
  });
});
