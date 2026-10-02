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

export function LandingPage() {
  return (
    <div>
      <PublicNav />
      <main className="mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-8 md:grid-cols-[1.2fr_0.8fr] md:px-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Reliability operations</p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight">
            Failures become incidents before customers do.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            IncidentHub checks your services, waits out the blips, and opens one incident when a failure is real.
            The timeline stays attached from detection to resolution.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/register" className="rounded-md bg-signal px-4 py-2.5 font-semibold text-bg">
              Create an organization
            </Link>
            <Link to="/login" className="rounded-md border border-line px-4 py-2.5">
              Log in
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5 font-mono text-sm leading-7 text-muted">
          <p className="text-ink">02:14:01 health check · HTTP 503</p>
          <p>02:14:08 failure 2 of 3 · still quiet</p>
          <p className="text-danger">02:14:16 threshold reached · INC-1042</p>
          <p>02:14:17 severity SEV-1 · Backend notified</p>
          <p className="text-warn">02:17:14 Rohit acknowledged</p>
          <p>02:20:10 investigating</p>
          <p className="text-signal">02:31:05 recovered · resolved</p>
        </div>
      </main>
    </div>
  );
}

export function PricingPage() {
  const plans = [
    ['Free', 'Available now', ['3 services', '1 team', '3 members', '1 API key', '1 webhook']],
    ['Pro', 'Checkout when Stripe is configured', ['25 services', '10 teams', '50 members', '10 API keys', '10 webhooks']],
    ['Business', 'Checkout when Stripe is configured', ['100 services', '25 teams', '200 members', '25 API keys', '25 webhooks']],
  ];
  return (
    <div>
      <PublicNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-4xl font-semibold">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Free limits apply today. Pro and Business limits apply after the matching Stripe price is connected on the server.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map(([name, note, items]) => (
            <article key={name} className="rounded-xl border border-line bg-panel p-5">
              <h2 className="text-xl font-semibold">{name}</h2>
              <p className="mt-1 font-mono text-xs text-signal">{note}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
