import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/domain/incidentTransitions.js';
import { severityForAvailability, severityForLatency } from '../src/domain/severity.js';
import { meanMinutes, percentile, uptimePercent } from '../src/domain/metrics.js';
import { applyCheckResult } from '../src/domain/monitorState.js';
import { classifyResponse } from '../src/domain/classifyResponse.js';
import { hasPermission } from '../src/domain/permissions.js';

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

describe('permissions', () => {
  it('lets viewers read and blocks them from writing services', () => {
    expect(hasPermission('viewer', 'service:read')).toBe(true);
    expect(hasPermission('viewer', 'service:write')).toBe(false);
    expect(hasPermission('engineer', 'incident:transition')).toBe(true);
    expect(hasPermission('engineer', 'incident:create')).toBe(false);
  });
});
