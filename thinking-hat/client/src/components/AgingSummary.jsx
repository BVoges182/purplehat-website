import { Card } from "./ui";
import { reportFigure } from "../reportMoney";

const TILES = [
  "bg-[#efe6ff]",
  "bg-[#f5f0ff]",
  "bg-[#f7f3ff]",
  "bg-[#faf8ff]",
];

export default function AgingSummary({ section }) {
  const columns = section?.columns || [];
  const rows = section?.rows || [];
  const total = [...rows].reverse().find((row) => row.kind === "total");
  const tiles = columns
    .map((label, index) => ({ label, value: total?.values?.[index] }))
    .filter((tile) => !/^total$/i.test(tile.label));
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">{section.title}</h2>
      {section.note ? <p className="mt-1 text-sm text-mute">{section.note}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <div key={tile.label} className={`rounded-2xl px-4 py-3 ${TILES[index % TILES.length]}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-mute">{tile.label}</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink">{reportFigure(tile.value, "money")}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3 sm:hidden">
        {rows.map((row, index) => (
          <div key={`${row.label}-stack-${index}`} className={row.kind === "total" ? "rounded-2xl bg-[#f6f3ff] px-3 py-3" : "border-t border-[rgba(109,40,217,0.08)] pt-3"}>
            <p className={row.kind === "total" ? "font-display font-extrabold text-ink" : "text-ink"}>{row.label}</p>
            <dl className="mt-2 space-y-1 text-sm">
              {columns.map((column, columnIndex) => (
                <div key={`${column}-${columnIndex}`} className="flex justify-between gap-3">
                  <dt className="text-mute">{column}</dt>
                  <dd className={`tabular-nums ${row.kind === "total" ? "font-display font-extrabold text-ink" : "text-ink"}`}>
                    {reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex] || "money")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
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
