import { useState } from "react";
import AgingSummary from "./AgingSummary";
import EcommercePerformance from "./EcommercePerformance";
import { Card, SegmentedPills } from "./ui";
import { ecommerceSeries, reportFigure } from "../reportMoney";
import { lineChange, periodPill, prepareStatementRows, quarterlyNote, usesPeriodTabs } from "../statementMobile";

function amountClass(value, strong) {
  if (typeof value !== "number") return "text-mute";
  return strong ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink";
}

function mobileFigure(value, format, unit) {
  const text = reportFigure(value, format);
  const symbol = format === "percent" || format === "percent2" || format === "number" || format === "number2" ? "" : String(unit || "");
  if (!symbol || text === "—") return text;
  if (text.startsWith("(") && text.endsWith(")")) return `(${symbol}${text.slice(1, -1)})`;
  return `${symbol}${text}`;
}

function subtitleLine(section) {
  if (!section?.subtitle) return null;
  return <p className="mt-1 text-sm text-mute">{section.subtitle}</p>;
}

function cashFlowFollowsBalance(sections) {
  const items = [...(sections || [])];
  const cashIndex = items.findIndex((section) => /cash flow/i.test(String(section.title || "")));
  if (cashIndex < 0) return items;
  const [cash] = items.splice(cashIndex, 1);
  const balanceIndex = items.findIndex((section) => /balance sheet/i.test(String(section.title || "")));
  items.splice(balanceIndex < 0 ? cashIndex : balanceIndex + 1, 0, cash);
  return items;
}

function emphasizedRow(row) {
  if (row?.kind !== "total") return false;
  return !/^(warehouse equipment|retained earnings|member drawings)$/i.test(String(row.label || "").trim());
}

function visibleNote(note) {
  return String(note || "").split(" · ").filter((part) => !/grouped into other/i.test(part)).join(" · ");
}

function columnHeading(column, unit, hideUnitBelowMd = false) {
  return (
    <div className="ml-auto w-max text-center">
      <div>{column}</div>
      {unit ? <div className={`mt-0.5 normal-case tracking-normal text-mute${hideUnitBelowMd ? " max-md:hidden" : ""}`}>{unit}</div> : null}
    </div>
  );
}

function isOtherLabel(label) {
  return /^other$/i.test(String(label || "").trim());
}

function summarySubtotal(label) {
  return /^(cash surplus \(deficit\)|gross profit \(loss\)|net profit \(loss\))$/i.test(String(label || "").trim());
}

function summaryGroups(rows) {
  const groups = [];
  let current = null;
  for (const row of rows || []) {
    if (row.kind === "heading") {
      current = { label: row.label, rows: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { label: "", rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

function ChangeMark({ change }) {
  return (
    <span className={`text-xs font-semibold ${change.favourable ? "text-heading" : "text-mute"}`}>
      {change.up ? "▲" : "▼"} {change.text}
    </span>
  );
}

function StatementMobile({ section, withSymbol }) {
  const columns = section.columns || [];
  const rows = prepareStatementRows(section);
  const periods = columns.map((column, index) => ({
    id: String(index),
    index,
    label: periodPill(column),
    ytd: /year to date|^ytd$/i.test(String(column || "").trim()),
  }));
  const latest = periods.find((period) => !period.ytd) || periods[0];
  const [selected, setSelected] = useState(latest?.id || "0");
  const period = periods.find((item) => item.id === selected) || latest;
  const earlier = period && !period.ytd
    ? periods.find((item) => !item.ytd && item.index > period.index) || null
    : null;
  const groups = summaryGroups(rows);
  if (!period) return null;
  return (
    <div className="mt-4 md:hidden">
      <SegmentedPills label="Period" options={periods} value={period.id} onChange={setSelected} />
      <div key={period.id} className="app-switch-in mt-2">
        {groups.map((group) => (
          <div key={group.label || "lines"}>
            {group.label ? <p className="pt-4 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-heading">{group.label}</p> : null}
            {group.rows.map((row, index) => {
              const band = emphasizedRow(row) || summarySubtotal(row.label);
              const change = earlier ? lineChange(row.values?.[period.index], row.values?.[earlier.index], row) : null;
              const figure = withSymbol
                ? mobileFigure(row.values?.[period.index], row.formats?.[period.index], section.units?.[period.index])
                : reportFigure(row.values?.[period.index], row.formats?.[period.index]);
              return (
                <div key={`${row.label}-${index}`} className={band ? "mt-1 bg-[var(--row-total-bg)] px-3 text-[var(--row-total-text)]" : "border-t border-hairline"}>
                  <div className="flex items-baseline justify-between gap-3 py-2.5">
                    <p className={`min-w-0 ${band ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink"}`}>{row.label}</p>
                    <p className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
                      <span className={`tabular-nums ${band ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink"}`}>{figure}</span>
                      {change ? <ChangeMark change={change} /> : null}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function displayTitle(section) {
  const title = String(section.title || "").replace(/\s+by\s+contact\b/gi, "").replace(/\s+/g, " ").trim();
  if (section.presentation !== "contacts") return String(section.title || "");
  if (/[—–]\s*top\s+(expenses|income)\s*$/i.test(title)) return title;
  const kind = /income/i.test(title) ? "income" : /expense/i.test(title) ? "expenses" : "";
  if (!kind) return title;
  const range = title.match(/April\s*[–—-]\s*[A-Za-z]+(?:\s+\d{4})?/i);
  if (range || /year to date/i.test(title)) {
    let period = range ? range[0].replace(/\s*[–—-]\s*/, "–") : "";
    if (period && !/\d{4}/.test(period)) {
      const year = title.match(/\d{4}/);
      if (year) period = `${period} ${year[0]}`;
    }
    return period ? `${period} — Top ${kind}` : `Top ${kind}`;
  }
  const month = title.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i);
  if (month) {
    const formatted = month[0].charAt(0).toUpperCase() + month[0].slice(1);
    return `${formatted} — Top ${kind}`;
  }
  return title;
}

export function Statement({ section }) {
  const columns = section.columns || [];
  const tabbed = usesPeriodTabs(section.title);
  const note = quarterlyNote(section.title, visibleNote(section.note));
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-heading">{displayTitle(section)}</h2>
      {subtitleLine(section)}
      {note ? <p className="mt-1 text-sm text-mute">{note}</p> : null}
      <div className={`mt-4 hidden ${tabbed ? "md:block" : "sm:block"}`}>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-mute">
              <th className="w-[34%] pb-2 pr-4 text-left font-bold">{section.labelHeader || ""}</th>
              {columns.map((column, columnIndex) => (
                <th key={`${column}-${columnIndex}`} className="pb-2 align-bottom font-bold">
                  {columnHeading(column, section.units?.[columnIndex], tabbed)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(section.rows || []).map((row, index) => (
              <tr
                key={`${row.kind}-${row.label}-${index}`}
                className={emphasizedRow(row) ? "bg-[var(--row-total-bg)] text-[var(--row-total-text)]" : "border-t border-hairline"}
              >
                <td
                  className={`whitespace-pre-wrap py-2.5 pr-4 ${row.kind === "heading" ? "font-display font-extrabold text-heading" : emphasizedRow(row) ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink"}`}
                  style={{ paddingLeft: row.indent ? `${row.indent * 1.25}rem` : undefined }}
                >
                  {row.label}
                </td>
                {columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`} className={`py-2.5 pl-3 text-right tabular-nums ${row.kind === "heading" ? "" : amountClass(row.values?.[columnIndex], emphasizedRow(row))}`}>
                    {row.kind === "heading" ? "" : reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabbed ? <StatementMobile section={section} withSymbol={!/^executive summary/i.test(String(section.title || ""))} /> : null}
      <div className={`mt-4 space-y-3 sm:hidden ${tabbed ? "hidden" : ""}`}>
        {(section.rows || []).map((row, index) => {
          if (row.kind === "heading") {
            return <p key={`${row.label}-${index}`} className="pt-1 font-display text-sm font-extrabold text-heading" style={{ paddingLeft: row.indent ? `${row.indent * 1.25}rem` : undefined }}>{row.label}</p>;
          }
          return (
            <div key={`${row.label}-${index}`} className={emphasizedRow(row) ? "bg-[var(--row-total-bg)] px-3 py-3 text-[var(--row-total-text)]" : "border-t border-hairline pt-3"}>
              <p className={`whitespace-pre-wrap ${emphasizedRow(row) ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink"}`} style={{ paddingLeft: row.indent ? `${row.indent * 1.25}rem` : undefined }}>{row.label}</p>
              <dl className="mt-2 space-y-1 text-sm">
                {columns.map((column, columnIndex) => (
                  <div key={`${column}-${columnIndex}`} className="flex items-baseline justify-between gap-3">
                    <dt className="text-mute">{column}</dt>
                    <dd className={`whitespace-nowrap text-right tabular-nums ${amountClass(row.values?.[columnIndex], emphasizedRow(row))}`}>{mobileFigure(row.values?.[columnIndex], row.formats?.[columnIndex], section.units?.[columnIndex])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function donutPath(cx, cy, outer, inner, start, end) {
  const sweep = end - start;
  if (sweep >= Math.PI * 2 - 0.0001) {
    return `M ${cx + outer} ${cy} A ${outer} ${outer} 0 1 1 ${cx - outer} ${cy} A ${outer} ${outer} 0 1 1 ${cx + outer} ${cy} M ${cx + inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`;
  }
  const large = sweep > Math.PI ? 1 : 0;
  const point = (radius, angle) => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  const [x0, y0] = point(outer, start);
  const [x1, y1] = point(outer, end);
  const [x2, y2] = point(inner, end);
  const [x3, y3] = point(inner, start);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}

const DEMO_DONUT_COLOURS = [
  "#1F3864",
  "#2C4A73",
  "#3E5C86",
  "#4A5A70",
  "#6A7A90",
  "#8B95A3",
  "#9AA3B0",
  "#B7C0CC",
  "#C5CED8",
  "#D5D8DE",
  "#1A2B42",
  "#0E1A2E",
];

function demoDonutColour(count, index) {
  const last = DEMO_DONUT_COLOURS.length - 1;
  if (count <= 1) return DEMO_DONUT_COLOURS[0];
  const slot = Math.round((Math.max(0, index) / (count - 1)) * last);
  return DEMO_DONUT_COLOURS[Math.min(last, slot)];
}

function donutInk(colour) {
  const hex = String(colour || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luma > 0.55 ? "#0B0B0B" : "#ffffff";
}

function contactMoney(value) {
  return reportFigure(value, "money");
}

export function Donut({ title, slices }) {
  const items = slices || [];
  const amounts = items.map((slice) => Math.abs(Number(slice.value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  const outer = 90;
  const inner = 56;
  let angle = -Math.PI / 2;
  const paths = items.map((slice, index) => {
    const portion = total ? Math.abs(Number(slice.value) || 0) / total : 0;
    const start = angle;
    const end = angle + portion * Math.PI * 2;
    angle = end;
    const colour = demoDonutColour(items.length, index);
    const mid = portion > 0.98 ? -Math.PI / 2 : (start + end) / 2;
    const radius = portion > 0.98 ? 0 : (outer + inner) / 2;
    const percent = Math.round(portion * 100);
    return {
      key: `${slice.label}-${index}`,
      d: portion ? donutPath(100, 100, outer, inner, start, end) : "",
      colour,
      percent: percent > 0 && portion >= 0.04 ? `${percent}%` : "",
      ink: donutInk(colour),
      x: 100 + Math.cos(mid) * radius,
      y: 100 + Math.sin(mid) * radius,
    };
  });
  return (
    <svg className="mx-auto h-auto w-full max-w-64 md:h-72 md:w-72 md:max-w-none" viewBox="0 0 200 200" role="img" aria-label={title}>
      {paths.filter((path) => path.d).map((path) => (
        <path key={path.key} d={path.d} fill={path.colour} stroke="var(--surface)" strokeWidth="2.5" />
      ))}
      {paths.filter((path) => path.percent).map((path) => (
        <text key={`${path.key}-label`} x={path.x} y={path.y} textAnchor="middle" dominantBaseline="central" fill={path.ink} fontSize="11" fontWeight="700" fontFamily="Barlow, sans-serif">
          {path.percent}
        </text>
      ))}
    </svg>
  );
}

function topContactRows(section) {
  const rows = section?.rows || [];
  const total = [...rows].reverse().find((row) => row.kind === "total");
  const lines = rows.filter((row) => row.kind !== "total");
  const other = lines.find((row) => isOtherLabel(row.label));
  const named = lines.filter((row) => !isOtherLabel(row.label)).slice(0, 5);
  const shown = other ? [...named, other] : named;
  return {
    lines: shown,
    slices: shown.map((row) => ({ label: row.label, value: row.value })),
    total,
  };
}

export function ContactDonutCard({ section }) {
  const { lines, slices, total } = topContactRows(section);
  if (!slices.length) return null;
  const title = displayTitle(section);
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-heading">{title}</h2>
      {subtitleLine(section)}
      {visibleNote(section.note) ? <p className="mt-1 text-sm text-mute">{visibleNote(section.note)}</p> : null}
      <div className={`mt-6 flex flex-col gap-8 ${section.chart === false ? "" : "lg:flex-row lg:items-center"}`}>
        <ol className="min-w-0 flex-1">
          {lines.map((row, index) => {
            const colour = demoDonutColour(lines.length, index);
            return (
              <li key={`${row.label}-${index}`} className="grid grid-cols-[1.75rem_0.75rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-2.5">
                <span className="text-sm tabular-nums text-mute">{index + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
                <span className="truncate text-sm text-ink">{row.label}</span>
                <span className="text-sm tabular-nums text-ink">{contactMoney(row.value)}</span>
              </li>
            );
          })}
          {total ? (
            <li className="grid grid-cols-[1.75rem_0.75rem_minmax(0,1fr)_auto] items-center gap-3 bg-[var(--row-total-bg)] px-2 py-3 text-[var(--row-total-text)]">
              <span />
              <span />
              <span className="whitespace-nowrap font-display text-base font-extrabold text-[var(--row-total-text)]">{total.label || "Total"}</span>
              <span className="font-display text-base font-extrabold tabular-nums text-[var(--row-total-text)]">{contactMoney(total.value)}</span>
            </li>
          ) : null}
        </ol>
        {section.chart === false ? null : (
          <div className="shrink-0">
            <Donut title={title} slices={slices} />
          </div>
        )}
      </div>
    </Card>
  );
}

function ContactSection({ section }) {
  return <ContactDonutCard section={section} />;
}

const CLASSIC_DONUT_COLOURS = [
  "#D5D8DE",
  "#C5CED8",
  "#B7C0CC",
  "#9AA3B0",
  "#8B95A3",
  "#6A7A90",
  "#4A5A70",
  "#3E5C86",
  "#2C4A73",
  "#1F3864",
  "#1A2B42",
  "#0E1A2E",
];

function classicDonutColour(slices, index) {
  const rank = slices
    .map((slice, sliceIndex) => ({ sliceIndex, amount: Math.abs(Number(slice.value) || 0) }))
    .sort((a, b) => b.amount - a.amount || a.sliceIndex - b.sliceIndex)
    .findIndex((item) => item.sliceIndex === index);
  return CLASSIC_DONUT_COLOURS[(CLASSIC_DONUT_COLOURS.length - 1 - Math.max(0, rank) + CLASSIC_DONUT_COLOURS.length) % CLASSIC_DONUT_COLOURS.length];
}

export function ClassicDonut({ title, slices }) {
  const items = slices || [];
  const amounts = items.map((slice) => Math.abs(Number(slice.value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  let angle = -Math.PI / 2;
  const paths = items.map((slice, index) => {
    const portion = total ? Math.abs(Number(slice.value) || 0) / total : 0;
    const start = angle;
    const end = angle + portion * Math.PI * 2;
    angle = end;
    return {
      key: `${slice.label}-${index}`,
      d: portion ? donutPath(100, 100, 78, 48, start, end) : "",
      colour: classicDonutColour(items, index),
    };
  });
  return (
    <div>
      <svg className="mx-auto h-52 w-52" viewBox="0 0 200 200" aria-hidden="true">
        <title>{title}</title>
        {paths.filter((path) => path.d).map((path) => (
          <path key={path.key} d={path.d} fill={path.colour} />
        ))}
      </svg>
      <ul className="mt-3 space-y-1.5">
        {items.map((slice, index) => (
          <li key={`${slice.label}-${index}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classicDonutColour(items, index) }} />
              <span className="font-semibold" style={{ color: classicDonutColour(items, index) }}>{slice.label}</span>
            </span>
            <span className={`shrink-0 tabular-nums ${amountClass(slice.value, false)}`}>{reportFigure(slice.value, "money")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassicContactSection({ section }) {
  const rows = (section.rows || []).filter((row) => row.kind === "total" || !isOtherLabel(row.label));
  const slices = (section.slices || []).filter((slice) => !isOtherLabel(slice.label));
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-heading">{displayTitle(section)}</h2>
      {subtitleLine(section)}
      {visibleNote(section.note) ? <p className="mt-1 text-sm text-mute">{visibleNote(section.note)}</p> : null}
      <div className={`mt-4 grid items-start gap-6 ${section.chart === false ? "" : "lg:grid-cols-[minmax(0,1fr)_17rem]"}`}>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-mute">
              <th className="pb-2 pr-3 text-left font-bold">Contact</th>
              <th className="w-28 pb-2 align-bottom font-bold">{columnHeading(section.amountHeader || "Amount", section.currency || "£")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className={row.kind === "total" ? "bg-[var(--row-total-bg)] text-[var(--row-total-text)]" : "border-t border-hairline"}
              >
                <td className={`py-2.5 pr-3 ${row.kind === "total" ? "font-display font-extrabold text-[var(--row-total-text)]" : "text-ink"}`}>{row.label}</td>
                <td className={`py-2.5 text-right tabular-nums ${amountClass(row.value, row.kind === "total")}`}>{reportFigure(row.value, "money")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {section.chart === false ? null : <ClassicDonut title={displayTitle(section)} slices={slices} />}
      </div>
    </Card>
  );
}

function EcommerceReport({ section }) {
  const rows = section.rows || [];
  const points = section.chart === false ? null : ecommerceSeries([section]);
  return (
    <div className="space-y-4">
      {points ? <EcommercePerformance points={points} /> : null}
      <Card>
      <h2 className="font-display text-xl font-extrabold text-heading">{section.title}</h2>
      {subtitleLine(section)}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-mute">
              <th className="pb-2 pr-3 text-left font-bold">Month</th>
              {(section.columns || []).map((column) => (
                <th key={column} className="pb-2 pl-3 text-right font-bold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-hairline">
                <td className="py-2.5 pr-3 text-ink">{row.month}</td>
                {(row.values || []).map((value, index) => (
                  <td key={`${row.month}-${index}`} className="py-2.5 pl-3 text-right tabular-nums text-ink">
                    {reportFigure(value, row.formats?.[index])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {section.notes?.length ? (
        <ul className="mt-4 space-y-1 text-xs text-mute">
          {section.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
      </Card>
    </div>
  );
}

function orderedSections(report) {
  const sections = (Array.isArray(report?.sections) ? report.sections : []).filter((section) => !section?.hidden);
  return report?.customOrder ? sections : cashFlowFollowsBalance(sections);
}

export default function ManagementReportView({ report, template = "wealth-tech" }) {
  const demo = template === "purple-hat-demo";
  return (
    <div className="space-y-4">
      {orderedSections(report).map((section, index) => {
        const key = `${section.title}-${index}`;
        if (section.presentation === "contacts") {
          return demo
            ? <ContactSection key={key} section={section} />
            : <ClassicContactSection key={key} section={section} />;
        }
        if (!demo && (section.presentation === "ecommerce" || section.presentation === "aging")) return null;
        if (section.presentation === "ecommerce") return <EcommerceReport key={key} section={section} />;
        if (section.presentation === "aging") return <AgingSummary key={key} section={section} />;
        return <Statement key={key} section={section} />;
      })}
    </div>
  );
}
