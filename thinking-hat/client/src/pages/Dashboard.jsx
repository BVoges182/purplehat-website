import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ClassicDonut, ContactDonutCard, Statement } from "../components/ManagementReportView";
import { Alert, Avatar, Card, PageIntro, money, monthLabel } from "../components/ui";
import AgingSummary from "../components/AgingSummary";
import EcommercePerformance from "../components/EcommercePerformance";
import { ecommerceSeries, reportFigure, yearToDateContacts } from "../reportMoney";

function contactSlices(section) {
  return (section?.slices || []).filter((slice) => !/^other$/i.test(String(slice.label || "").trim()));
}

function ContactHighlight({ section }) {
  const slices = contactSlices(section);
  if (!slices.length) return null;
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">{section.title}</h2>
      <div className="mt-4">
        <ClassicDonut title={section.title} slices={slices} />
      </div>
    </Card>
  );
}

function age(iso) {
  if (!iso) return "waiting";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function useLiveFinances() {
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

  return { data, error, live, tick };
}

function LiveStatus({ live, tick, updatedAt }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-ink" aria-live="polite">
      <span className={live ? "live-dot" : "h-2 w-2 rounded-full bg-rose-400"} />
      {live ? "Live" : "Reconnecting"}
      <span className="font-medium text-mute" data-tick={tick}>· updated {age(updatedAt)}</span>
    </p>
  );
}

function ProfileCard({ user, events }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar user={user} className="h-14 w-14 text-lg" />
        <div>
          <h2 className="font-display text-xl font-extrabold text-ink">{user.businessName || "Business"}</h2>
          <Link className="text-sm font-semibold text-plum" to="/business">Business photo and details</Link>
        </div>
      </div>
      <h3 className="mt-6 font-display text-sm font-extrabold text-mute">Recent movements (Under development)</h3>
      <ul className="mt-3 space-y-3">
        {events.length === 0 ? <li className="text-sm text-mute">No movements yet.</li> : null}
        {events.map((event) => (
          <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-ink">{event.description}</span>
            <span className={`shrink-0 font-semibold ${event.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(event.amount)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MonthChart({ months, max }) {
  return (
    <div className="mt-6 flex h-44 items-end gap-2">
      {months.map((month) => (
        <div key={month.month} className="flex h-full flex-1 flex-col justify-end">
          <div className="flex h-36 items-end gap-1">
            {typeof month.revenue === "number" ? (
              <div className="flex-1 rounded-t-lg bg-plum" style={{ height: `${(month.revenue / max) * 100}%` }} title={`Revenue ${reportFigure(month.revenue, "money")}`} />
            ) : <div className="flex-1" />}
            {typeof month.expenses === "number" ? (
              <div className="flex-1 rounded-t-lg bg-[#c4b5fd]" style={{ height: `${(month.expenses / max) * 100}%` }} title={`Expenses ${reportFigure(month.expenses, "money")}`} />
            ) : <div className="flex-1" />}
          </div>
          <p className="mt-2 text-center text-xs text-mute">{monthLabel(month.month)}</p>
        </div>
      ))}
    </div>
  );
}

function chartMax(data) {
  const plotted = data.months.flatMap((month) => [month.revenue, month.expenses].filter((value) => typeof value === "number"));
  return plotted.length ? Math.max(1, ...plotted) : 1;
}

function ClassicDashboard({ user }) {
  const { data, error, live, tick } = useLiveFinances();
  const [highlights, setHighlights] = useState(null);

  useEffect(() => {
    let stop = false;
    api.reports()
      .then(async (payload) => {
        const latest = payload.reports?.[0];
        if (!latest) return null;
        const detail = await api.report(latest.month);
        return yearToDateContacts(detail.report?.sections);
      })
      .then((next) => { if (!stop) setHighlights(next); })
      .catch(() => { if (!stop) setHighlights(null); });
    return () => { stop = true; };
  }, []);

  const stats = data ? [
    ["Cash", data.cash],
    ["Revenue for the month", data.revenue],
    ["Expenses for the month", data.expenses],
    ["Receivable", data.receivables],
  ] : [];

  return (
    <div>
      <PageIntro title="Dashboard" lede="Realtime financial data for your business. Figures refresh as Purple Hat updates them.">
        <LiveStatus live={live} tick={tick} updatedAt={data?.updatedAt} />
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
                <p className="mt-3 font-display text-2xl font-extrabold text-ink">{reportFigure(value, "money")}</p>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-extrabold text-ink">Six months</h2>
                <p className="text-xs text-mute">Payable {reportFigure(data.payables, "money")}</p>
              </div>
              <div className="mt-3 flex gap-4 text-xs font-semibold text-mute">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-plum" /> Revenue</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c4b5fd]" /> Expenses</span>
              </div>
              <MonthChart months={data.months} max={chartMax(data)} />
            </Card>
            <ProfileCard user={user} events={data.events} />
          </div>
          {highlights && (contactSlices(highlights.expenses).length || contactSlices(highlights.income).length) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ContactHighlight section={highlights.expenses} />
              <ContactHighlight section={highlights.income} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function executiveSummary(sections) {
  return (sections || []).find((section) => /executive summary/i.test(String(section.title || ""))) || null;
}

function DemoDashboard({ user }) {
  const { data, error, live, tick } = useLiveFinances();
  const [highlights, setHighlights] = useState(null);
  const [commerce, setCommerce] = useState(null);
  const [summary, setSummary] = useState(null);
  const [aging, setAging] = useState([]);

  useEffect(() => {
    let stop = false;
    api.reports()
      .then(async (payload) => {
        const latest = payload.reports?.[0];
        if (!latest) return null;
        const detail = await api.report(latest.month);
        const sections = detail.report?.sections;
        return {
          highlights: yearToDateContacts(sections),
          commerce: ecommerceSeries(sections),
          summary: executiveSummary(sections),
          aging: (sections || []).filter((section) => section.presentation === "aging"),
        };
      })
      .then((next) => {
        if (stop) return;
        setHighlights(next?.highlights || null);
        setCommerce(next?.commerce || null);
        setSummary(next?.summary || null);
        setAging(next?.aging || []);
      })
      .catch(() => {
        if (stop) return;
        setHighlights(null);
        setCommerce(null);
        setSummary(null);
        setAging([]);
      });
    return () => { stop = true; };
  }, []);

  const stats = data ? [
    ["Cash", data.cash],
    ["Revenue for the month", data.revenue],
    ["Expenses for the month", data.expenses],
    ["Receivable", data.receivables],
    ["Payable", data.payables],
  ] : [];

  return (
    <div>
      <PageIntro title="Dashboard" lede="Realtime financial data for your business. Figures refresh as Purple Hat updates them.">
        <LiveStatus live={live} tick={tick} updatedAt={data?.updatedAt} />
      </PageIntro>
      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="text-mute">Loading figures…</p> : null}
      {data ? (
        <div className="space-y-4">
          {data.source === "sample" ? (
            <Alert tone="ok">Sample figures. Purple Hat replaces these when your books are posted.</Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map(([label, value]) => (
              <Card key={label} className="flex flex-col">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{label}</p>
                <p className="mt-3 font-display text-2xl font-extrabold text-ink xl:mt-auto xl:pt-3">{reportFigure(value, "money")}</p>
              </Card>
            ))}
          </div>
          {summary ? <Statement section={summary} /> : null}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <Card>
              <h2 className="font-display text-xl font-extrabold text-ink">Six months</h2>
              <div className="mt-3 flex gap-4 text-xs font-semibold text-mute">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-plum" /> Revenue</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c4b5fd]" /> Expenses</span>
              </div>
              <MonthChart months={data.months} max={chartMax(data)} />
            </Card>
            <ProfileCard user={user} events={data.events} />
          </div>
          {commerce ? <EcommercePerformance points={commerce} /> : null}
          {aging.length ? (
            <div className="grid gap-4">
              {aging.map((section) => <AgingSummary key={section.title} section={section} />)}
            </div>
          ) : null}
          {highlights ? (
            <div className="grid gap-4">
              <ContactDonutCard section={highlights.expenses} />
              <ContactDonutCard section={highlights.income} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function demoTemplate(user) {
  if (user?.reportTemplate === "purple-hat-demo") return true;
  if (user?.reportTemplate === "wealth-tech") return false;
  return /purple\s*hat\s*demo/i.test(String(user?.businessName || ""));
}

export default function Dashboard() {
  const { user } = useAuth();
  if (demoTemplate(user)) return <DemoDashboard user={user} />;
  return <ClassicDashboard user={user} />;
}
