export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-signal text-bg hover:brightness-110',
    danger: 'bg-danger text-white hover:brightness-110',
    ghost: 'border border-line bg-transparent text-ink hover:bg-panel-2',
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none ring-signal/40 placeholder:text-muted/70 focus:ring-2';

export function Panel({ children, className = '' }) {
  return <section className={`rounded-xl border border-line bg-panel ${className}`}>{children}</section>;
}

export function Banner({ children }) {
  if (!children) return null;
  return <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</div>;
}

export function StatusDot({ status }) {
  const color = {
    healthy: 'bg-signal',
    degraded: 'bg-warn',
    down: 'bg-danger',
    unknown: 'bg-muted',
  }[status] || 'bg-muted';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} aria-hidden="true" />;
}

export function SeverityBadge({ severity }) {
  const styles = {
    'SEV-1': 'bg-danger/15 text-danger',
    'SEV-2': 'bg-warn/15 text-warn',
    'SEV-3': 'bg-info/15 text-info',
    'SEV-4': 'bg-panel-2 text-muted',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${styles[severity] || styles['SEV-4']}`}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <span className="font-mono text-xs tracking-wide text-muted">{status}</span>;
}

export function Empty({ title, body }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
