import { useEffect, useRef } from "react";
import demo from "../demoReportStatements.json";
import { reportFigure } from "../reportMoney";
import { threeMonthComparison } from "../statementComparison";

const MONTHS = [
  ["December", "Dec"],
  ["November", "Nov"],
  ["October", "Oct"],
  ["September", "Sep"],
  ["August", "Aug"],
  ["July", "Jul"],
  ["June", "Jun"],
  ["May", "May"],
  ["April", "Apr"],
  ["March", "Mar"],
  ["February", "Feb"],
  ["January", "Jan"],
];

function shortMonth(column) {
  const text = String(column);
  const year = text.match(/\d{4}/)?.[0] || "";
  for (const [name, short] of MONTHS) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) return `${short} ${year}`.trim();
  }
  const abbreviated = MONTHS.find(([, short]) => new RegExp(`\\b${short}\\b`, "i").test(text));
  if (abbreviated) return `${abbreviated[1]} ${year}`.trim();
  return text;
}

function present(section) {
  return {
    ...section,
    columns: section.columns.map((column, index, all) => (
      index === all.length - 1 ? "Change ($)" : shortMonth(column)
    )),
  };
}

const income = present(threeMonthComparison(demo.profit, "Income statement"));
const balance = present(threeMonthComparison(demo.balance, "Balance sheet"));

function emphasized(row) {
  if (row?.kind !== "total") return false;
  return !/^(warehouse equipment|retained earnings|member drawings)$/i.test(String(row.label || "").trim());
}

function StatementCard({ section, compact }) {
  return (
    <section className={compact ? "statement-card is-compact" : "statement-card"}>
      <h2>{section.title}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col"></th>
            {section.columns.map((column) => <th key={column} scope="col">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, index) => (
            <tr
              key={`${row.kind}-${row.label}-${index}`}
              className={row.kind === "heading" ? "is-heading" : emphasized(row) ? "is-total" : "is-line"}
            >
              <th scope="row" style={row.indent ? { paddingLeft: compact ? "0.45rem" : "0.85rem" } : undefined}>{row.label}</th>
              {section.columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`}>
                  {row.kind === "heading" ? "" : reportFigure(row.values?.[columnIndex], row.formats?.[columnIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function HomepageStatements({ fit = false }) {
  const frameRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    if (!fit) return undefined;
    const frame = frameRef.current;
    const board = boardRef.current;
    if (!frame || !board) return undefined;
    const desktop = window.matchMedia("(min-width: 768px)");
    let lastKey = "";
    const apply = () => {
      if (!desktop.matches) {
        board.style.zoom = "1";
        lastKey = "";
        return;
      }
      const key = `${frame.clientWidth}x${frame.clientHeight}`;
      if (!frame.clientHeight || key === lastKey) return;
      lastKey = key;
      board.style.zoom = "1";
      const needed = board.offsetHeight;
      const scale = needed > 0 ? Math.min(1, (frame.clientHeight - 2) / needed) : 1;
      board.style.zoom = String(scale);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    desktop.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", apply);
    };
  }, [fit]);

  return (
    <div className={fit ? "statements-frame is-fit" : "statements-frame"} ref={frameRef}>
      <div className="statements-board" ref={boardRef}>
        <StatementCard section={income} compact={fit} />
        <StatementCard section={balance} compact={fit} />
      </div>
    </div>
  );
}
