import { useState } from "react";
import { Card, SegmentedPills } from "./ui";
import { reportFigure } from "../reportMoney";

const TILES = [
  "bg-[#efe6ff]",
  "bg-[#f5f0ff]",
  "bg-[#f7f3ff]",
  "bg-[#faf8ff]",
];

function shownFigure(value, format) {
  return reportFigure(value, format || "money");
}

function bucketShown(value, format) {
  const text = shownFigure(value, format);
  return text !== "—" && text !== "0" && text !== "0.00";
}

function bucketPillLabel(label) {
  const text = String(label || "").trim();
  if (/^90\b/i.test(text) || /90\+/i.test(text)) return "90+ days";
  return text;
}

export default function AgingSummary({ section }) {
  const columns = section?.columns || [];
  const rows = section?.rows || [];
  const total = [...rows].reverse().find((row) => row.kind === "total");
  const totalIndex = columns.findIndex((column) => /^total$/i.test(String(column || "")));
  const amountIndex = totalIndex >= 0 ? totalIndex : Math.max(0, columns.length - 1);
  const buckets = columns
    .map((label, index) => ({ label, index }))
    .filter((column) => column.index !== totalIndex);
  const tiles = buckets.map((column) => ({ label: column.label, value: total?.values?.[column.index] }));
  const contacts = rows.filter((row) => row.kind !== "total");
  const options = [
    { id: "total", label: "Total", index: amountIndex },
    ...buckets.map((column) => ({ id: `b${column.index}`, label: bucketPillLabel(column.label), index: column.index })),
  ];
  const [bucketId, setBucketId] = useState("total");
  const [showAll, setShowAll] = useState(false);
  const selected = options.find((option) => option.id === bucketId) || options[0];
  const ranked = contacts
    .map((row) => ({ row, value: Number(row.values?.[selected.index]) }))
    .filter((item) => bucketShown(item.value, item.row.formats?.[selected.index]))
    .sort((a, b) => b.value - a.value || a.row.label.localeCompare(b.row.label));
  const visible = showAll ? ranked : ranked.slice(0, 5);
  function chooseBucket(id) {
    setBucketId(id);
    setShowAll(false);
  }
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">{section.title}</h2>
      {section.subtitle ? <p className="mt-1 text-sm text-mute">{section.subtitle}</p> : null}
      {section.note ? <p className="mt-1 text-sm text-mute">{section.note}</p> : null}
      <div className="mt-5 hidden grid-cols-2 gap-3 md:grid xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <div key={tile.label} className={`rounded-2xl px-4 py-3 ${TILES[index % TILES.length]}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-mute">{tile.label}</p>
            <p className="mt-2 whitespace-nowrap font-display text-2xl font-extrabold text-ink">{reportFigure(tile.value, "money")}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 md:hidden">
        {tiles.map((tile, index) => {
          const active = selected.id === `b${buckets[index].index}`;
          return (
            <button
              key={tile.label}
              type="button"
              className={`min-h-11 rounded-2xl border-0 px-3 py-2 text-left ${TILES[index % TILES.length]} ${active ? "ring-2 ring-plum" : ""}`}
              onClick={() => chooseBucket(`b${buckets[index].index}`)}
            >
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-mute">{tile.label}</p>
              <p className="mt-1 whitespace-nowrap font-display text-xl font-extrabold text-ink">{reportFigure(tile.value, "money")}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-4 md:hidden">
        <SegmentedPills label={`${section.title} bucket`} options={options} value={selected.id} onChange={chooseBucket} />
        <div key={selected.id} className="app-switch-in mt-2">
          {visible.length ? visible.map((item, index) => (
            <div key={`${item.row.label}-${index}`} className="flex items-baseline justify-between gap-3 border-t border-[rgba(109,40,217,0.08)] py-2.5">
              <p className="min-w-0 text-sm text-ink">{item.row.label}</p>
              <p className="whitespace-nowrap text-right text-sm tabular-nums text-ink">{shownFigure(item.value, item.row.formats?.[selected.index])}</p>
            </div>
          )) : <p className="border-t border-[rgba(109,40,217,0.08)] py-3 text-sm text-mute">Nothing outstanding</p>}
          {ranked.length > 5 && !showAll ? (
            <button type="button" className="flex min-h-11 w-full items-center justify-center text-sm font-semibold text-plum underline" onClick={() => setShowAll(true)}>
              Show all
            </button>
          ) : null}
          {ranked.length ? (
            <div className="mt-1 flex items-baseline justify-between gap-3 rounded-xl bg-neutral-100 px-3 py-3">
              <p className="font-display font-extrabold text-ink">{total?.label || "Total"}</p>
              <p className="whitespace-nowrap text-right font-display font-extrabold tabular-nums text-ink">{shownFigure(total?.values?.[selected.index], total?.formats?.[selected.index])}</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-mute">
              <th className="pb-2 pr-3 text-left font-bold">{section.labelHeader || "Contact"}</th>
              {columns.map((column) => (
                <th key={column} className="pb-2 pl-3 text-right font-bold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`} className={row.kind === "total" ? "" : "border-t border-[rgba(109,40,217,0.08)]"}>
                <td className={`py-2.5 pr-3 ${row.kind === "total" ? "font-display font-extrabold text-ink" : "text-ink"}`}>{row.label}</td>
                {columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`} className={`py-2.5 pl-3 text-right tabular-nums ${row.kind === "total" ? "font-display font-extrabold text-ink" : "text-ink"}`}>
                    {reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex] || "money")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
