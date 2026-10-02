export const SEVERITIES = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'];

export const SEVERITY_RANK = {
  'SEV-1': 1,
  'SEV-2': 2,
  'SEV-3': 3,
  'SEV-4': 4,
};

export function severityForAvailability(criticality) {
  if (criticality === 'critical') return 'SEV-1';
  if (criticality === 'high') return 'SEV-2';
  return 'SEV-3';
}

export function severityForLatency() {
  return 'SEV-4';
}
