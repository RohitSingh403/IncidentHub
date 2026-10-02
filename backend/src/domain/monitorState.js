export function applyCheckResult(monitor, check) {
  const failureThreshold = monitor.failureThreshold;
  const recoveryThreshold = monitor.recoveryThreshold;
  const previous = monitor.serviceStatus || 'unknown';

  let consecutiveFailures = monitor.consecutiveFailures || 0;
  let consecutiveSuccesses = monitor.consecutiveSuccesses || 0;
  let consecutiveSlow = monitor.consecutiveSlow || 0;

  const slow = Boolean(
    check.success &&
      monitor.latencyThresholdMs &&
      check.responseTimeMs > monitor.latencyThresholdMs,
  );

  if (!check.success) {
    consecutiveFailures += 1;
    consecutiveSuccesses = 0;
    consecutiveSlow = 0;
  } else {
    consecutiveFailures = 0;
    consecutiveSuccesses += 1;
    consecutiveSlow = slow ? consecutiveSlow + 1 : 0;
  }

  const recoveredAvailability =
    consecutiveFailures === 0 && consecutiveSuccesses >= recoveryThreshold;

  let action = 'none';
  let serviceStatus = previous;

  if (consecutiveFailures >= failureThreshold) {
    action = 'down';
    serviceStatus = 'down';
  } else if (previous === 'down' && !recoveredAvailability) {
    action = 'none';
    serviceStatus = 'down';
  } else if (consecutiveSlow >= failureThreshold) {
    action = 'degraded';
    serviceStatus = 'degraded';
  } else if (
    previous === 'degraded' &&
    !(consecutiveSlow === 0 && consecutiveSuccesses >= recoveryThreshold)
  ) {
    action = 'none';
    serviceStatus = 'degraded';
  } else if (check.success && !slow) {
    action = previous === 'down' || previous === 'degraded' ? 'healthy' : 'none';
    serviceStatus = 'healthy';
  } else if (check.success && slow && recoveredAvailability && previous === 'down') {
    action = 'healthy';
    serviceStatus = 'healthy';
  }

  return {
    consecutiveFailures,
    consecutiveSuccesses,
    consecutiveSlow,
    action,
    serviceStatus,
  };
}
