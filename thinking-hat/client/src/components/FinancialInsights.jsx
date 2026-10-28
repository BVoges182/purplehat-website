import { reportFigure } from "../reportMoney";
import { Card } from "./ui";

const CURRENCY_SYMBOL = { USD: "$", GBP: "£", EUR: "€", ZAR: "R" };

function publicCopy(value) {
  return String(value || "")
    .replaceAll("John McEnroe's insights", "Purple Hat insights")
    .replaceAll("John McEnroe", "Purple Hat");
}

function formatUpdated(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function moneyLabel(value, currency) {
  if (value == null || value === "") return "n/a";
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  const text = reportFigure(number, "money");
  const symbol = CURRENCY_SYMBOL[String(currency || "").toUpperCase()] || "";
  if (!symbol) return text;
  if (text.startsWith("(") && text.endsWith(")")) return `(${symbol}${text.slice(1, -1)})`;
  return `${symbol}${text}`;
}

function SideTile({ label, side, tone, currency }) {
  return (
    <div className={`rounded-2xl px-3 py-3 ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-2 text-xs text-mute">Total</p>
      <p className="font-display text-xl font-extrabold text-ink">{moneyLabel(side?.total, currency)}</p>
      <p className="mt-2 text-xs text-mute">Overdue</p>
      <p className="font-display text-lg font-extrabold text-ink">{moneyLabel(side?.overdue, currency)}</p>
      {side?.note ? <p className="mt-2 text-xs leading-5 text-mute">{publicCopy(side.note)}</p> : null}
    </div>
  );
}

function BulletList({ label, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-5 text-ink">{publicCopy(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function Brief({ financial, currency }) {
  const updated = formatUpdated(financial.updated);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">Financial insights</p>
          {financial.period ? <p className="mt-1 text-sm font-semibold text-ink">{financial.period}</p> : null}
        </div>
        {updated ? <p className="shrink-0 text-xs text-mute">Updated {updated}</p> : null}
      </div>
      {financial.headline ? (
        <h3 className="mt-2 font-display text-lg font-normal leading-snug text-ink">{publicCopy(financial.headline)}</h3>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SideTile label="Receivables" side={financial.receivables} tone="bg-[#efe6ff]" currency={currency} />
        <SideTile label="Payables" side={financial.payables} tone="bg-[#f5f0ff]" currency={currency} />
      </div>
      <div className="mt-4 space-y-4">
        <BulletList label="This month" items={financial.currentMonth} />
        <BulletList label="Trends" items={financial.trends} />
        <BulletList label="Actions" items={financial.actions} />
      </div>
    </>
  );
}

function EmptyBrief({ error }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">Financial insights</p>
      <h3 className="mt-2 font-display text-lg font-extrabold text-ink">{error ? "Couldn't load insights" : "No brief here yet"}</h3>
    </div>
  );
}

export default function FinancialInsights({ status = "loading", financial = null, currency = "", error = "" }) {
  const showBrief = status === "ready" && financial && !error;
  return (
    <Card className="flex h-full flex-col">
      {status === "loading" ? <p className="text-sm text-mute">Loading the brief…</p> : null}
      {showBrief ? <Brief financial={financial} currency={currency} /> : null}
      {status === "ready" && !showBrief ? <EmptyBrief error={error} /> : null}
    </Card>
  );
}
