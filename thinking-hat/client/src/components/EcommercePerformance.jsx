import { Card } from "./ui";
import { ecommerceInsight, insightMonthName, reportFigure } from "../reportMoney";

const PURPLE = "#6d28d9";
const GREEN = "#059669";

function shortMonth(label) {
  const name = insightMonthName(label);
  return name ? name.slice(0, 3) : String(label || "");
}

function percentChange(current, prior) {
  if (typeof current !== "number" || typeof prior !== "number" || !Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function formatChange(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const text = `${Math.abs(pct).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (pct >= 0.05) return `+${text}`;
  if (pct <= -0.05) return `−${text}`;
  return "0.0%";
}

function toneClass(value, lowerIsBetter) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.0005) return "text-mute";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? "text-emerald-700" : "text-rose-700";
}

function usd(value, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
}

function domain(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return { min: 0, max: 1 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.16;
  return { min: min - pad, max: max + pad };
}

function ticksFrom(min, max, count) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => max - step * index);
}

function yOf(value, min, max) {
  if (max === min) return 50;
  const pad = 8;
  return pad + ((max - value) / (max - min)) * (100 - pad * 2);
}

function xOf(index, count) {
  if (count <= 1) return 50;
  const pad = 3;
  return pad + (index / (count - 1)) * (100 - pad * 2);
}

function ChangeLine({ value, priorLabel, lowerIsBetter = false }) {
  if (value === null) return <p className="mt-2 text-sm font-semibold text-mute">No prior month</p>;
  const arrow = value > 0.0005 ? "↑" : value < -0.0005 ? "↓" : "";
  return (
    <p className={`mt-2 text-sm font-semibold ${toneClass(value, lowerIsBetter)}`}>
      {arrow ? `${arrow} ` : ""}{formatChange(value)} vs {priorLabel}
    </p>
  );
}

function LineChart({ points }) {
  const plotW = 500;
  const plotH = 220;
  const roasDomain = domain(points.map((point) => point.roas));
  const conversionDomain = domain(points.map((point) => (typeof point.conversion === "number" ? point.conversion * 100 : null)));
  const roasTicks = ticksFrom(roasDomain.min, roasDomain.max, 3);
  const conversionTicks = ticksFrom(conversionDomain.min, conversionDomain.max, 3);
  const px = (index) => (xOf(index, points.length) / 100) * plotW;
  const py = (value, min, max) => (yOf(value, min, max) / 100) * plotH;
  const line = (key, min, max, scale = 1) => points
    .map((point, index) => (typeof point[key] === "number" ? `${px(index)},${py(point[key] * scale, min, max)}` : null))
    .filter(Boolean)
    .join(" ");
  const roasLine = line("roas", roasDomain.min, roasDomain.max);
  const conversionLine = line("conversion", conversionDomain.min, conversionDomain.max, 100);
  const latest = points[points.length - 1];
  const summary = `ROAS and conversion rate by month. Latest ROAS ${reportFigure(latest?.roas, "number2")}, conversion ${reportFigure(latest?.conversion, "percent2")}.`;
  return (
    <div>
      <div className="grid grid-cols-[2.25rem_1fr_2.5rem] gap-1">
        <div className="relative">
          {roasTicks.map((tick) => (
            <span key={`roas-${tick.toFixed(2)}`} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-mute" style={{ top: `${yOf(tick, roasDomain.min, roasDomain.max)}%` }}>
              {tick.toFixed(1)}
            </span>
          ))}
        </div>
        <div className="relative aspect-[25/11] overflow-hidden">
          <svg className="h-full w-full" viewBox={`0 0 ${plotW} ${plotH}`} role="img" aria-label={summary}>
            {roasTicks.map((tick) => (
              <line key={tick.toFixed(2)} x1="0" x2={plotW} y1={py(tick, roasDomain.min, roasDomain.max)} y2={py(tick, roasDomain.min, roasDomain.max)} stroke="#ede9fe" strokeWidth="1" />
            ))}
            {conversionLine ? <polyline points={conversionLine} fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {roasLine ? <polyline points={roasLine} fill="none" stroke={PURPLE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
          </svg>
          {points.map((point, index) => (
            <span key={point.month}>
              {typeof point.roas === "number" ? (
                <span
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-plum"
                  style={{ left: `${xOf(index, points.length)}%`, top: `${yOf(point.roas, roasDomain.min, roasDomain.max)}%` }}
                  title={`${point.month} ROAS ${reportFigure(point.roas, "number2")}`}
                />
              ) : null}
              {typeof point.conversion === "number" ? (
                <span
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600"
                  style={{ left: `${xOf(index, points.length)}%`, top: `${yOf(point.conversion * 100, conversionDomain.min, conversionDomain.max)}%` }}
                  title={`${point.month} conversion ${reportFigure(point.conversion, "percent2")}`}
                />
              ) : null}
            </span>
          ))}
        </div>
        <div className="relative">
          {conversionTicks.map((tick) => (
            <span key={`conv-${tick.toFixed(2)}`} className="absolute left-0 -translate-y-1/2 text-[10px] tabular-nums text-mute" style={{ top: `${yOf(tick, conversionDomain.min, conversionDomain.max)}%` }}>
              {tick.toFixed(1)}%
            </span>
          ))}
        </div>
      </div>
      <div className="relative mt-2 h-4 pl-10 pr-11 text-[10px] text-mute">
        <div className="relative h-full">
          {points.map((point, index) => (
            <span key={point.month} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${xOf(index, points.length)}%` }}>
              <span className="sm:hidden">{shortMonth(point.month).slice(0, 1)}</span>
              <span className="hidden sm:inline">{shortMonth(point.month)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarChart({ points }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.spend || 0, point.revenue || 0]));
  const latest = points[points.length - 1];
  const summary = `Ad spend and paid revenue by month. Latest spend ${usd(latest?.spend, 0)}, revenue ${usd(latest?.revenue, 0)}.`;
  return (
    <div>
      <div className="flex gap-2" role="img" aria-label={summary}>
        <div className="flex h-40 w-9 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums leading-none text-mute">
          <span>{compactUsd(max)}</span>
          <span>{compactUsd(max / 2)}</span>
          <span>$0</span>
        </div>
        <div className="flex h-40 flex-1 items-end gap-1 border-b border-[rgba(109,40,217,0.14)]">
          {points.map((point) => (
            <div key={point.month} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${point.month}: spend ${usd(point.spend, 0)}, revenue ${usd(point.revenue, 0)}`}>
              <div className="w-[42%] max-w-3 rounded-t bg-plum" style={{ height: `${((point.spend || 0) / max) * 100}%` }} />
              <div className="w-[42%] max-w-3 rounded-t bg-emerald-600" style={{ height: `${((point.revenue || 0) / max) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-11 text-[10px] text-mute">
        {points.map((point) => (
          <span key={point.month} className="w-0 flex-1 text-center">{shortMonth(point.month)}</span>
        ))}
      </div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-mute">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.swatch}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function EcommercePerformance({ points }) {
  if (!points?.length) return null;
  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : null;
  const priorLabel = prior ? shortMonth(prior.month) : "";
  const roasChange = prior ? percentChange(latest.roas, prior.roas) : null;
  const cpaChange = prior ? percentChange(latest.cpa, prior.cpa) : null;
  const revenueChange = prior ? percentChange(latest.revenue, prior.revenue) : null;
  const latestName = insightMonthName(latest.month) || "Latest";
  const insight = ecommerceInsight(points);
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">E-commerce Performance Overview</h2>
      <p className="mt-1 text-sm text-mute">Trend-focused insights</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">Current month highlights</p>
          <p className="mt-1 text-sm text-mute">{latest.month}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f6f3ff] px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">ROAS</p>
              <p className="mt-2 font-display text-4xl font-extrabold text-ink">{reportFigure(latest.roas, "number2")}</p>
              <ChangeLine value={roasChange} priorLabel={priorLabel} />
            </div>
            <div className="rounded-2xl bg-[#f6f3ff] px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">CPA</p>
              <p className="mt-2 font-display text-4xl font-extrabold text-ink">{usd(latest.cpa, 2)}</p>
              <ChangeLine value={cpaChange} priorLabel={priorLabel} lowerIsBetter />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[rgba(109,40,217,0.1)] bg-white px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">Growth vs prior period</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-mute">ROAS</p>
              <p className={`mt-1 font-display text-3xl font-extrabold ${toneClass(roasChange, false)}`}>{formatChange(roasChange)}</p>
              <p className="mt-1 text-xs text-mute">{priorLabel ? `vs ${priorLabel}` : "No prior month"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-mute">Revenue</p>
              <p className={`mt-1 font-display text-3xl font-extrabold ${toneClass(revenueChange, false)}`}>{formatChange(revenueChange)}</p>
              <p className="mt-1 text-xs text-mute">{priorLabel ? `vs ${priorLabel}` : "No prior month"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(109,40,217,0.08)] px-3 py-4 sm:px-4">
          <h3 className="font-display text-base font-extrabold text-ink">ROAS & Conversion Rate Trend</h3>
          <Legend items={[{ label: "ROAS", swatch: "bg-plum" }, { label: "Conversion rate", swatch: "bg-emerald-600" }]} />
          <div className="mt-4">
            <LineChart points={points} />
          </div>
        </div>
        <div className="rounded-2xl border border-[rgba(109,40,217,0.08)] px-3 py-4 sm:px-4">
          <h3 className="font-display text-base font-extrabold text-ink">Ad Spend vs Revenue</h3>
          <Legend items={[{ label: "Ad spend", swatch: "bg-plum" }, { label: "Revenue", swatch: "bg-emerald-600" }]} />
          <div className="mt-4">
            <BarChart points={points} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[#f6f3ff] p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm leading-6 text-ink">{insight}</p>
        <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-plum">{latestName} ROAS</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-ink">{reportFigure(latest.roas, "number2")}</p>
        </div>
      </div>
    </Card>
  );
}
