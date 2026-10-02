export const INCIDENT_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'INVESTIGATING',
  'MITIGATED',
  'RESOLVED',
];

export const OPEN_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED'];

export const TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'RESOLVED'],
  ACKNOWLEDGED: ['INVESTIGATING', 'RESOLVED'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED'],
  MITIGATED: ['RESOLVED'],
  RESOLVED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function allowedTransitions(from) {
  return [...(TRANSITIONS[from] || [])];
}
