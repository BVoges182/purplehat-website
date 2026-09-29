import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Avatar, Card, PageIntro, money, monthLabel } from "../components/ui";

function age(iso) {
  if (!iso) return "waiting";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false;
    async function load(silent) {
      try {
        const next = await api.finances();
        if (stop) return;
        setData(next);
        setLive(true);
        setError("");
      } catch (err) {
        if (stop) return;
        setLive(false);
        if (!silent) setError(err.message);
      }
    }
    load(false);
    const poll = setInterval(() => load(true), 8000);
    const clock = setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const stats = data ? [
    ["Cash", data.cash],
    ["Revenue this month", data.revenue],
    ["Expenses this month", data.expenses],
    ["Receivable", data.receivables],
  ] : [];
  const max = data ? Math.max(1, ...data.months.flatMap((month) => [month.revenue, month.expenses])) : 1;

  return (
    <div>
      <PageIntro title="Dashboard" lede="Realtime financial data for your business. Figures refresh as Purple Hat updates them.">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink" aria-live="polite">
          <span className={live ? "live-dot" : "h-2 w-2 rounded-full bg-rose-400"} />
          {live ? "Live" : "Reconnecting"}
          <span className="font-medium text-mute" data-tick={tick}>· updated {age(data?.updatedAt)}</span>
        </p>
      </PageIntro>

      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="text-mute">Loading figures…</p> : null}

      {data ? (
        <div className="space-y-4">
          {data.source === "sample" ? (
            <Alert tone="ok">Sample figures. Purple Hat replaces these when your books are posted.</Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(([label, value]) => (
              <Card key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{label}</p>
                <p className="mt-3 font-display text-2xl font-extrabold text-ink">{money(value)}</p>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-extrabold text-ink">Six months</h2>
                <p className="text-xs text-mute">Payable {money(data.payables)}</p>
              </div>
              <div className="mt-3 flex gap-4 text-xs font-semibold text-mute">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-plum" /> Revenue</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c4b5fd]" /> Expenses</span>
              </div>
              <div className="mt-6 flex h-44 items-end gap-2">
                {data.months.map((month) => (
                  <div key={month.month} className="flex h-full flex-1 flex-col justify-end">
                    <div className="flex h-36 items-end gap-1">
                      <div className="flex-1 rounded-t-lg bg-plum" style={{ height: `${(month.revenue / max) * 100}%` }} title={`Revenue ${money(month.revenue)}`} />
                      <div className="flex-1 rounded-t-lg bg-[#c4b5fd]" style={{ height: `${(month.expenses / max) * 100}%` }} title={`Expenses ${money(month.expenses)}`} />
                    </div>
                    <p className="mt-2 text-center text-xs text-mute">{monthLabel(month.month)}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <Avatar user={user} className="h-14 w-14 text-lg" />
                <div>
                  <h2 className="font-display text-xl font-extrabold text-ink">{user.businessName || "Business"}</h2>
                  <Link className="text-sm font-semibold text-plum" to="/business">Business photo and details</Link>
                </div>
              </div>
              <h3 className="mt-6 font-display text-sm font-extrabold uppercase tracking-[0.12em] text-mute">Recent movements</h3>
              <ul className="mt-3 space-y-3">
                {data.events.length === 0 ? <li className="text-sm text-mute">No movements yet.</li> : null}
                {data.events.map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-ink">{event.description}</span>
                    <span className={`shrink-0 font-semibold ${event.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(event.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
