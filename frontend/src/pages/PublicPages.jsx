import { Link } from 'react-router-dom';

export function PublicNav() {
  return (
    <header className="flex items-center justify-between px-6 py-5 md:px-10">
      <Link to="/" className="font-mono text-sm tracking-[0.16em] text-signal">
        INCIDENTHUB
      </Link>
      <nav className="flex items-center gap-5 text-sm">
        <Link to="/pricing" className="text-muted hover:text-ink">
          Pricing
        </Link>
        <Link to="/login" className="text-muted hover:text-ink">
          Log in
        </Link>
        <Link to="/register" className="rounded-md bg-signal px-3 py-2 font-semibold text-bg">
          Start free
        </Link>
      </nav>
    </header>
  );
}

const loop = [
  'Monitor',
  'Detect',
  'Incident',
  'Notify',
  'On-call',
  'Escalate',
  'Investigate',
  'Resolve',
  'Postmortem',
  'Analytics',
];

const boardStats = [
  ['Services', '12'],
  ['Open incidents', '2'],
  ['Uptime, 24h', '99.4%'],
  ['MTTR, 30d', '18m'],
];

const services = [
  ['Payment API', 'down', 'INC-1042'],
  ['Checkout', 'degraded', 'INC-1043'],
  ['Auth API', 'healthy', '—'],
  ['Status page', 'healthy', '—'],
];

const modules = [
  ['Services', 'HTTP checks on an interval. Three failures open an incident. Two successes close the loop.'],
  ['Incidents', 'One timeline from OPEN through acknowledged, investigating, mitigated, and resolved.'],
  ['On-call', 'A schedule per team, with handoff times and overrides that win over the rotation.'],
  ['Escalation', 'The first step is notified immediately. Later steps wait, then advance only while the incident is still open.'],
  ['Status pages', 'Customers see investigating, identified, monitoring, or resolved. Internal severity stays inside.'],
  ['Postmortems', 'Written after resolve: impact, timeline, root cause, lessons, and action items with an owner.'],
  ['Graph', 'Dependencies and open incidents that share a cause, grouped on the dashboard.'],
  ['Operations', 'Audit log, SLOs, maintenance windows, runbooks, API keys, and signed webhooks.'],
];

const dot = {
  healthy: 'bg-signal',
  degraded: 'bg-warn',
  down: 'bg-danger',
};

export function LandingPage() {
  return (
    <div>
      <PublicNav />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-8 pt-6 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:pt-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Reliability operations</p>
            <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight">
              Failures become incidents before customers do.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              IncidentHub checks your services, waits out the blips, and opens one incident when a failure is real.
              The same record follows on-call, escalation, the public status page, and the postmortem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="rounded-md bg-signal px-4 py-2.5 font-semibold text-bg">
                Create an organization
              </Link>
              <Link to="/pricing" className="rounded-md border border-line px-4 py-2.5">
                See plan limits
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5 font-mono text-sm leading-7">
            <p className="mb-2 font-sans text-xs uppercase tracking-[0.16em] text-muted">INC-1042 · Payment API</p>
            <p className="text-ink">02:14:01 health check · HTTP 503</p>
            <p className="text-muted">02:14:08 failure 2 of 3 · still quiet</p>
            <p className="text-danger">02:14:16 threshold reached · incident opened</p>
            <p className="text-muted">02:14:17 severity SEV-1 · on-call notified</p>
            <p className="text-warn">02:17:14 acknowledged</p>
            <p className="text-muted">02:20:10 investigating</p>
            <p className="text-signal">02:31:05 recovered · resolved</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-6 md:px-10">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {loop.map((step, index) => (
              <li key={step} className="rounded-lg border border-line bg-panel px-3 py-3">
                <p className="font-mono text-[10px] text-signal">{String(index + 1).padStart(2, '0')}</p>
                <p className="mt-1 text-sm font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-6 py-6 md:grid-cols-[1.15fr_0.85fr] md:px-10">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">The board after a real failure</h2>
              <p className="font-mono text-xs text-muted">Asia/Kolkata</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {boardStats.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-bg px-3 py-3">
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-1 font-mono text-2xl">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-line">
              {services.map(([name, status, incident]) => (
                <div key={name} className="flex items-center justify-between border-b border-line px-3 py-2.5 last:border-0">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot[status]}`} />
                    {name}
                  </span>
                  <span className="font-mono text-xs text-muted">{incident}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-signal">Public status</p>
              <h2 className="mt-3 text-2xl font-semibold">Customers never see SEV-1.</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                The internal incident stays OPEN, ACKNOWLEDGED, or INVESTIGATING. The public page uses its own words:
                investigating, identified, monitoring, resolved.
              </p>
            </div>
            <div className="mt-6 space-y-2 rounded-lg border border-line bg-bg p-4 font-mono text-sm">
              <p className="text-warn">investigating · Payment API</p>
              <p className="text-muted">identified · Checkout</p>
              <p className="text-signal">operational · Auth API</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8 md:px-10">
          <h2 className="text-2xl font-semibold">What you get after you create an organization</h2>
          <p className="mt-2 max-w-2xl text-muted">
            One company is one tenant. Checks, incidents, and the public page stay inside that organization.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(([title, body]) => (
              <article key={title} className="rounded-xl border border-line bg-panel p-4">
                <h3 className="font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 md:flex-row md:items-center md:px-10">
          <div>
            <h2 className="text-2xl font-semibold">Start with a small free workspace.</h2>
            <p className="mt-2 text-muted">One service, five incidents, and a taste of each feature. Pro keeps the full history.</p>
          </div>
          <Link to="/register" className="rounded-md bg-signal px-4 py-2.5 font-semibold text-bg">
            Create an organization
          </Link>
        </section>
      </main>
      <footer className="border-t border-line px-6 py-6 text-sm text-muted md:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs tracking-[0.16em] text-signal">INCIDENTHUB</p>
          <div className="flex gap-5">
            <Link to="/pricing" className="hover:text-ink">Pricing</Link>
            <Link to="/login" className="hover:text-ink">Log in</Link>
            <Link to="/register" className="hover:text-ink">Start free</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: '₹0',
      note: 'Try each part of the product',
      items: [
        '1 service, checked every 60 seconds',
        '1 team and 3 members',
        '5 incidents kept',
        '1 status page and 1 postmortem',
        '1 escalation policy and 1 on-call schedule',
        '1 API key and 1 webhook',
        '100 health checks and 25 audit events stored',
        'Incident brief from the timeline',
      ],
      action: { to: '/register', label: 'Start free' },
    },
    {
      name: 'Pro',
      price: '₹499',
      note: 'After payment in Operations',
      items: [
        '25 services, checks from every 15 seconds',
        '10 teams and 50 members',
        '500 incidents kept',
        '5 status pages and 100 postmortems',
        'Model-written incident briefs',
        '10 API keys and 10 webhooks',
        '20,000 health checks and 2,000 audit events stored',
        'Slack and GitHub on the full workspace',
      ],
      action: { to: '/register', label: 'Create account, then upgrade' },
    },
    {
      name: 'Business',
      price: '₹1,499',
      note: 'After payment in Operations',
      items: [
        '100 services',
        '25 teams and 200 members',
        '5,000 incidents kept',
        '20 status pages',
        '25 API keys and 25 webhooks',
        '100,000 health checks stored',
      ],
      action: { to: '/register', label: 'Create account, then upgrade' },
    },
  ];
  return (
    <div>
      <PublicNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-4xl font-semibold">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Free is a small workspace so a new account can see every feature without filling the database.
          Pro and Business keep the history, the faster checks, and the model-written brief after payment.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className="flex flex-col rounded-xl border border-line bg-panel p-5">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 font-mono text-2xl">{plan.price}</p>
              <p className="mt-1 font-mono text-xs text-signal">{plan.note}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link to={plan.action.to} className="mt-6 inline-flex justify-center rounded-md bg-signal px-3 py-2 text-sm font-semibold text-bg">
                {plan.action.label}
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
