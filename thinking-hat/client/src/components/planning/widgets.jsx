import { Button, Card } from "../ui";
import { headroomTone, planMoney, planPct, planPercent, signedClass } from "./format";

const DOT = {
  green: "bg-[var(--rag-green)]",
  amber: "bg-[var(--rag-amber)]",
  red: "bg-[var(--rag-red)]",
};

const PILL = {
  green: "bg-[var(--rag-green-bg)] text-[var(--rag-green)]",
  amber: "bg-[var(--rag-amber-bg)] text-[var(--rag-amber)]",
  red: "bg-[var(--rag-red-bg)] text-[var(--rag-red)]",
};

export function KpiCard({ label, value, detail }) {
  return (
    <Card className="!p-4">
      <p className="font-display text-xs font-semibold tracking-[0.12em] text-heading">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold text-heading">{value}</p>
      <div className="mt-2 text-sm text-mute">{detail}</div>
    </Card>
  );
}

export function RagDot({ rag }) {
  const label = rag === "red" ? "Red" : rag === "amber" ? "Amber" : "Green";
  return <span className={`inline-block h-2.5 w-2.5 ${DOT[rag] || DOT.green}`} style={{ borderRadius: 999 }} role="img" aria-label={label} />;
}

export function TonePill({ tone, children }) {
  return <span className={`inline-flex px-2 py-0.5 text-xs font-semibold ${PILL[tone] || PILL.green}`}>{children}</span>;
}

export function DataChips({ real, illustrative }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mute">
      <span className="bg-band px-2 py-0.5 font-display text-xs font-semibold tracking-[0.08em] text-heading">Real demo data</span>
      <span>{real}</span>
      <span className="bg-[var(--illustrative-bg)] px-2 py-0.5 font-display text-xs font-semibold tracking-[0.08em] text-[var(--illustrative-text)]">Illustrative</span>
      <span>{illustrative}</span>
    </p>
  );
}

function sectionTitle(section) {
  if (section === "revenue") return "Net revenue";
  if (section === "cogs") return "Cost of goods sold";
  if (section === "opex") return "Operating expenses";
  return "";
}

export function VarianceTable({ rows }) {
  const revenue = rows.find((row) => row.key === "net_revenue");
  const profit = rows.find((row) => row.key === "gross_profit");
  const body = [];
  let lastSection = "";
  for (const row of rows) {
    if (row.section !== "total" && row.section !== lastSection) {
      lastSection = row.section;
      body.push(
        <tr key={`section-${row.section}`}>
          <td colSpan={6} className="pt-3 font-display text-xs font-bold tracking-[0.08em] text-heading">{sectionTitle(row.section)}</td>
        </tr>,
      );
    }
    const favourable = row.varUsd > 0;
    const tone = favourable ? "text-heading" : "text-[var(--rag-red)]";
    const total = row.rowType === "total";
    body.push(
      <tr key={row.key} className={total ? "bg-[var(--row-total-bg)] font-semibold text-[var(--row-total-text)]" : ""}>
        <td className={total ? "py-2" : "py-2 pl-4"}>{row.label}</td>
        <td className="py-2 text-right tabular-nums">{planMoney(row.actual)}</td>
        <td className="py-2 text-right tabular-nums">{planMoney(row.budget)}</td>
        <td className={`py-2 text-right tabular-nums ${total ? "" : tone}`}>{planMoney(row.varUsd)}</td>
        <td className={`py-2 text-right tabular-nums ${total ? "" : tone}`}>{planPct(row.varPct)}</td>
        <td className="py-2 text-center"><RagDot rag={row.rag} /></td>
      </tr>,
    );
    if (row.key === "gross_profit" && revenue && profit) {
      body.push(
        <tr key="gp-pct" className="bg-band">
          <td className="py-2 pl-4">GP %</td>
          <td className="py-2 text-right tabular-nums">{planPercent(revenue.actual ? profit.actual / revenue.actual : null)}</td>
          <td className="py-2 text-right tabular-nums">{planPercent(revenue.budget ? profit.budget / revenue.budget : null)}</td>
          <td colSpan={3} />
        </tr>,
      );
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline text-right font-display text-xs tracking-[0.08em] text-heading">
            <th className="py-2 text-left font-semibold">Profit and loss</th>
            <th className="py-2 font-semibold">Actual $</th>
            <th className="py-2 font-semibold">Budget $</th>
            <th className="py-2 font-semibold">Variance $</th>
            <th className="py-2 font-semibold">Variance %</th>
            <th className="py-2 text-center font-semibold">Flag</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-mute">
        <span className="inline-flex items-center gap-1"><RagDot rag="green" /> within 2% or under $500</span>
        <span className="inline-flex items-center gap-1"><RagDot rag="amber" /> 2–5%</span>
        <span className="inline-flex items-center gap-1"><RagDot rag="red" /> over 5% and over $1,000</span>
        <span className="text-heading">Positive = favourable</span>
        <span className="text-[var(--rag-red)]">(Negative) = unfavourable</span>
      </div>
    </div>
  );
}

export function CommentaryEditor({
  paragraphs,
  reasons,
  redLines,
  status,
  approvedBy,
  approvedAt,
  busy,
  onParagraph,
  onReason,
  onSave,
  onReset,
  onApprove,
}) {
  const missing = redLines.filter((line) => !String(reasons[line.key] || "").trim());
  return (
    <Card className="border-[var(--chart-ad)] bg-band/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-heading">Variance commentary</h2>
        <span className="text-sm font-semibold text-[var(--chart-ad)]">AI first draft · edit before approving</span>
      </div>
      <div className="space-y-3">
        {paragraphs.map((item, index) => (
          <label key={item.heading} className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">{item.heading}</span>
            <textarea
              className="min-h-24 w-full border border-dashed border-[var(--chart-ad)] bg-surface px-3 py-2 text-sm text-ink"
              value={item.text}
              onChange={(event) => onParagraph(index, event.target.value)}
            />
          </label>
        ))}
      </div>
      {redLines.length ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-ink">Reason for each red line</p>
          {redLines.map((line) => (
            <label key={line.key} className="block">
              <span className="mb-1 flex items-center gap-2 text-sm text-ink"><RagDot rag="red" /> {line.label}</span>
              <input
                className="w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink"
                value={reasons[line.key] || ""}
                onChange={(event) => onReason(line.key, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-mute">
          {status === "approved"
            ? `Approved by ${approvedBy || "the signed-in user"}${approvedAt ? ` · ${approvedAt.slice(0, 16).replace("T", " ")}` : ""}.`
            : "Red lines need a written reason before the pack can be approved."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onReset}>Reset to AI draft</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onSave}>Save</Button>
          <Button type="button" disabled={busy || missing.length > 0} onClick={onApprove}>Approve & add to pack</Button>
        </div>
      </div>
      {missing.length ? <p className="mt-2 text-sm text-[var(--rag-red)]">Add a reason for every red line before this can be approved.</p> : null}
    </Card>
  );
}

export function NoteList({ items }) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.title} className="flex gap-3 border-b border-hairline py-2 last:border-b-0">
          <span
            className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold text-surface ${DOT[item.tone] || DOT.amber}`}
            style={{ borderRadius: 999 }}
            aria-hidden="true"
          >
            {item.tone === "green" ? "↑" : "!"}
          </span>
          <div>
            <p className="font-semibold text-ink">{item.title}</p>
            <p className="text-sm text-mute">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeadroomPill({ value }) {
  return <TonePill tone={headroomTone(value)}>{planMoney(value)}</TonePill>;
}

export function MoneyCells({ values, emphasize = false }) {
  return values.map((value, index) => (
    <td key={index} className={`px-2 py-1.5 text-right tabular-nums ${emphasize ? "font-semibold" : ""} ${signedClass(value)}`}>
      {planMoney(value)}
    </td>
  ));
}

function chartScale(values, minimum) {
  const low = Math.min(...values, minimum);
  const high = Math.max(...values, minimum);
  const yMin = Math.floor((low - 8000) / 10000) * 10000;
  const yMax = Math.ceil((high + 8000) / 10000) * 10000;
  return { yMin, yMax: yMax === yMin ? yMin + 10000 : yMax };
}

export function CashLineChart({ positions, minimum }) {
  const width = 760;
  const height = 280;
  const left = 48;
  const right = 10;
  const top = 16;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const all = ["base", "downside", "upside"].flatMap((key) => positions[key].weeks.map((week) => week.closing));
  const { yMin, yMax } = chartScale(all, minimum);
  const x = (index) => left + (plotW * index) / 12;
  const y = (value) => top + ((yMax - value) / (yMax - yMin)) * plotH;
  const path = (key) => positions[key].weeks.map((week, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(week.closing).toFixed(1)}`).join(" ");
  const ticks = [];
  for (let value = yMin; value <= yMax; value += 10000) ticks.push(value);
  const low = positions.base.low;
  const lowIndex = (low?.week || 1) - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 block w-full" role="img" aria-label="Closing bank balance by week">
      {ticks.map((value) => (
        <g key={value}>
          <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--hairline)" />
          <text x={left - 6} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">{Math.round(value / 1000)}k</text>
        </g>
      ))}
      <rect x={left} y={y(minimum)} width={plotW} height={top + plotH - y(minimum)} fill="var(--rag-red-bg)" opacity="0.7" />
      <line x1={left} x2={width - right} y1={y(minimum)} y2={y(minimum)} stroke="var(--rag-red)" strokeDasharray="5 4" />
      <text x={left + 6} y={y(minimum) - 6} fontSize="11" fill="var(--rag-red)">Minimum cash {planMoney(minimum)}</text>
      <path d={path("upside")} fill="none" stroke="var(--chart-ad)" strokeWidth="2" strokeDasharray="4 3" />
      <path d={path("downside")} fill="none" stroke="var(--chart-exp)" strokeWidth="2" strokeDasharray="4 3" />
      <path d={path("base")} fill="none" stroke="var(--chart-rev)" strokeWidth="3" />
      {positions.base.weeks.map((week, index) => (
        <circle key={week.start} cx={x(index)} cy={y(week.closing)} r="3.5" fill="var(--chart-rev)" />
      ))}
      <circle cx={x(lowIndex)} cy={y(positions.base.weeks[lowIndex].closing)} r="7" fill="none" stroke="var(--rag-amber)" strokeWidth="2" />
      <text x={x(lowIndex)} y={y(positions.base.weeks[lowIndex].closing) + 18} textAnchor="middle" fontSize="11" fill="var(--rag-amber)">Low point {planMoney(low.amount)}</text>
      {positions.base.weeks.map((week, index) => (
        <text key={`label-${week.start}`} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-faint)">W{index + 1}</text>
      ))}
    </svg>
  );
}

export function CashBars({ actuals, forecasts, minimum }) {
  const width = 860;
  const height = 280;
  const left = 44;
  const right = 10;
  const top = 28;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const bars = [
    ...actuals.map((item) => ({ ...item, forecast: false })),
    ...forecasts.map((item) => ({ ...item, forecast: true })),
  ];
  const { yMin, yMax } = chartScale(bars.map((item) => item.value), minimum);
  const y = (value) => top + ((yMax - value) / (yMax - yMin)) * plotH;
  const base = y(Math.max(yMin, 0));
  const slot = plotW / bars.length;
  const ticks = [];
  for (let value = yMin; value <= yMax; value += 20000) ticks.push(value);
  const split = actuals.length * slot;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 block w-full" role="img" aria-label="Month-end bank balance">
      {ticks.map((value) => (
        <g key={value}>
          <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--hairline)" />
          <text x={left - 6} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">{Math.round(value / 1000)}k</text>
        </g>
      ))}
      {bars.map((item, index) => {
        const value = item.value;
        const barTop = y(Math.max(value, 0));
        const barHeight = Math.max(1, Math.abs(y(value) - base));
        const below = value < minimum;
        const fill = !item.forecast ? "var(--chart-rev)" : below ? "var(--rag-red-bg)" : "var(--accent-soft)";
        const x = left + index * slot + slot * 0.2;
        return (
          <g key={`${item.label}-${index}`}>
            <rect x={x} y={barTop} width={slot * 0.6} height={barHeight} fill={fill} stroke={item.forecast ? "var(--chart-rev)" : "none"} strokeDasharray={item.forecast ? "3 2" : ""} />
            <text x={x + slot * 0.3} y={barTop - 4} textAnchor="middle" fontSize="10" fill="var(--heading)">{Math.round(value / 1000)}k</text>
            <text x={x + slot * 0.3} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-faint)">{item.label}</text>
          </g>
        );
      })}
      <line x1={left} x2={width - right} y1={y(minimum)} y2={y(minimum)} stroke="var(--rag-red)" strokeDasharray="5 4" />
      <text x={left + 4} y={y(minimum) - 4} fontSize="11" fill="var(--rag-red)">Min {planMoney(minimum)}</text>
      <line x1={left + split} x2={left + split} y1={top - 8} y2={top + plotH} stroke="var(--chart-exp)" />
    </svg>
  );
}
