export const PUBLIC_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];

const TRANSITIONS = {
  investigating: ['identified', 'monitoring', 'resolved'],
  identified: ['monitoring', 'resolved'],
  monitoring: ['resolved'],
  resolved: [],
};

const SERVICE_APPEARANCE = {
  healthy: 'operational',
  degraded: 'degraded',
  down: 'outage',
  unknown: 'unknown',
};

export function canChangePublicStatus(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function componentAppearance(serviceStatus, publicStatus) {
  if (publicStatus && publicStatus !== 'resolved') return publicStatus;
  return SERVICE_APPEARANCE[serviceStatus] || 'unknown';
}

export function pageSummary(appearances) {
  const severe = appearances.some((status) => ['outage', 'investigating', 'identified'].includes(status));
  const degraded = appearances.some((status) => ['degraded', 'monitoring'].includes(status));
  const calm = appearances.some((status) => ['operational', 'unknown', 'degraded', 'monitoring'].includes(status));
  if (severe && calm) return 'Partial outage';
  if (severe) return 'Major outage';
  if (degraded) return 'Degraded performance';
  return 'All systems operational';
}
