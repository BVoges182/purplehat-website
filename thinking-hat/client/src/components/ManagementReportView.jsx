import { Card } from "./ui";
import { DONUT_COLOURS, reportFigure } from "../reportMoney";

function amountClass(value, strong) {
  if (typeof value !== "number") return "text-neutral-500";
  return strong ? "font-display font-extrabold text-neutral-950" : "font-semibold text-neutral-950";
}

function visibleNote(note) {
  return String(note || "").split(" · ").filter((part) => !/grouped into other/i.test(part)).join(" · ");
}

function columnHeading(column, unit) {
  return (
    <div className="ml-auto w-max text-center">
      <div>{column}</div>
      {unit ? <div className="mt-0.5 normal-case tracking-normal text-neutral-800">{unit}</div> : null}
    </div>
  );
}

function isOtherLabel(label) {
  return /^other$/i.test(String(label || "").trim());
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

function Statement({ section }) {
  const columns = section.columns || [];
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-neutral-950">{displayTitle(section)}</h2>
      {visibleNote(section.note) ? <p className="mt-1 text-sm text-neutral-500">{visibleNote(section.note)}</p> : null}
      <div className="mt-4 hidden sm:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">
              <th className="w-[34%] pb-2 pr-4 text-left font-bold">{section.labelHeader || ""}</th>
              {columns.map((column, columnIndex) => (
                <th key={`${column}-${columnIndex}`} className="pb-2 align-bottom font-bold">
                  {columnHeading(column, section.units?.[columnIndex])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(section.rows || []).map((row, index) => (
              <tr
                key={`${row.kind}-${row.label}-${index}`}
                className={row.kind === "total" ? "bg-neutral-100" : "border-t border-neutral-200"}
              >
                <td className={`whitespace-pre-wrap py-2.5 pr-4 ${row.kind === "heading" || row.kind === "total" ? "font-display font-extrabold text-neutral-950" : "text-neutral-950"}`}>
                  {row.label}
                </td>
                {columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`} className={`py-2.5 pl-3 text-right tabular-nums ${row.kind === "heading" ? "" : amountClass(row.values?.[columnIndex], row.kind === "total")}`}>
                    {row.kind === "heading" ? "" : reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-3 sm:hidden">
        {(section.rows || []).map((row, index) => {
          if (row.kind === "heading") {
            return <p key={`${row.label}-${index}`} className="pt-1 font-display text-sm font-extrabold text-neutral-950">{row.label}</p>;
          }
          return (
            <div key={`${row.label}-${index}`} className={row.kind === "total" ? "rounded-2xl bg-neutral-100 px-3 py-3" : "border-t border-neutral-200 pt-3"}>
              <p className={`whitespace-pre-wrap ${row.kind === "total" ? "font-display font-extrabold text-neutral-950" : "font-semibold text-neutral-950"}`}>{row.label}</p>
              <dl className="mt-2 space-y-1 text-sm">
                {columns.map((column, columnIndex) => (
                  <div key={`${column}-${columnIndex}`} className="flex justify-between gap-3">
                    <dt className="text-neutral-500">
                      <span className="block w-max text-center">{column}</span>
                      {section.units?.[columnIndex] ? <span className="block text-center tracking-normal text-neutral-800">{section.units[columnIndex]}</span> : null}
                    </dt>
                    <dd className={`tabular-nums ${amountClass(row.values?.[columnIndex], row.kind === "total")}`}>{reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex])}</dd>
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

function donutColour(slices, index) {
  const rank = slices
    .map((slice, sliceIndex) => ({ sliceIndex, amount: Math.abs(Number(slice.value) || 0) }))
    .sort((a, b) => b.amount - a.amount || a.sliceIndex - b.sliceIndex)
    .findIndex((item) => item.sliceIndex === index);
  return DONUT_COLOURS[(DONUT_COLOURS.length - 1 - rank + DONUT_COLOURS.length) % DONUT_COLOURS.length];
}

function Donut({ title, slices }) {
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
      colour: donutColour(items, index),
      slice,
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
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: donutColour(items, index) }} />
              <span className="font-semibold" style={{ color: donutColour(items, index) }}>{slice.label}</span>
            </span>
            <span className={`shrink-0 tabular-nums ${amountClass(slice.value, false)}`}>{reportFigure(slice.value, "money")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactSection({ section }) {
  const rows = (section.rows || []).filter((row) => row.kind === "total" || !isOtherLabel(row.label));
  const slices = (section.slices || []).filter((slice) => !isOtherLabel(slice.label));
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-neutral-950">{displayTitle(section)}</h2>
      {visibleNote(section.note) ? <p className="mt-1 text-sm text-neutral-500">{visibleNote(section.note)}</p> : null}
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">
              <th className="pb-2 pr-3 text-left font-bold">Contact</th>
              <th className="w-28 pb-2 align-bottom font-bold">{columnHeading(section.amountHeader || "Amount", section.currency || "£")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className={row.kind === "total" ? "bg-neutral-100" : "border-t border-neutral-200"}
              >
                <td className={`py-2.5 pr-3 ${row.kind === "total" ? "font-display font-extrabold text-neutral-950" : "text-neutral-950"}`}>{row.label}</td>
                <td className={`py-2.5 text-right tabular-nums ${amountClass(row.value, row.kind === "total")}`}>{reportFigure(row.value, "money")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Donut title={displayTitle(section)} slices={slices} />
      </div>
    </Card>
  );
}

export default function ManagementReportView({ report }) {
  return (
    <div className="space-y-4">
      {(report.sections || []).map((section, index) => (
        section.presentation === "contacts"
          ? <ContactSection key={`${section.title}-${index}`} section={section} />
          : <Statement key={`${section.title}-${index}`} section={section} />
      ))}
    </div>
  );
}
