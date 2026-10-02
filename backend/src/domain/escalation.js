export function escalationDecision({ status, currentStep, stepCount }) {
  if (status !== 'OPEN') {
    return { action: 'stop', reason: 'acknowledged_or_closed' };
  }
  const nextStep = (currentStep ?? -1) + 1;
  if (nextStep >= stepCount) {
    return { action: 'stop', reason: 'policy_complete' };
  }
  return { action: 'escalate', stepIndex: nextStep };
}
