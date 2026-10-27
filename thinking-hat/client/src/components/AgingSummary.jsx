import { useState } from "react";
import { Card } from "./ui";
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
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? contacts : contacts.slice(0, 5);
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">{section.title}</h2>
      {section.subtitle ? <p className="mt-1 text-sm text-mute">{section.subtitle}</p> : null}
      {section.note ? <p className="mt-1 text-sm text-mute">{section.note}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <div key={tile.label} className={`rounded-2xl px-3 py-2 md:px-4 md:py-3 ${TILES[index % TILES.length]}`}>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-mute md:tracking-[0.14em]">{tile.label}</p>
            <p className="mt-1 whitespace-nowrap font-display text-xl font-extrabold text-ink md:mt-2 md:text-2xl">{reportFigure(tile.value, "money")}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 sm:hidden">
        {visible.map((row, index) => {
          const filled = buckets.filter((column) => bucketShown(row.values?.[column.index], row.formats?.[column.index]));
          return (
            <div key={`${row.label}-stack-${index}`} className="border-t border-[rgba(109,40,217,0.08)] py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-sm text-ink">{row.label}</p>
                <p className="whitespace-nowrap text-right text-sm tabular-nums text-ink">{shownFigure(row.values?.[amountIndex], row.formats?.[amountIndex])}</p>
              </div>
              {filled.length ? (
                <p className="mt-0.5 text-sm text-mute">
                  {filled.map((column) => `${column.label} ${shownFigure(row.values?.[column.index], row.formats?.[column.index])}`).join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}
        {contacts.length > 5 && !showAll ? (
          <button
            type="button"
            className="mt-1 flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-plum"
            onClick={() => setShowAll(true)}
          >
            Show all
          </button>
        ) : null}
        {total ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-[rgba(109,40,217,0.08)] py-3">
            <p className="font-display font-extrabold text-ink">{total.label || "Total"}</p>
            <p className="whitespace-nowrap text-right font-display font-extrabold tabular-nums text-ink">{shownFigure(total.values?.[amountIndex], total.formats?.[amountIndex])}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-6 hidden overflow-x-auto sm:block">
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
