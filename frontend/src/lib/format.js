export function formatMinutes(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value < 1) return '<1 min';
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

export function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export function formatWhen(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
}

export const TRANSITION_LABELS = {
  ACKNOWLEDGED: 'Acknowledge',
  INVESTIGATING: 'Start investigating',
  MITIGATED: 'Mark mitigated',
  RESOLVED: 'Resolve',
};

export function can(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}
