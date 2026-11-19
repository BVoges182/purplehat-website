import { useState } from "react";
import { downloadAuthorized } from "../api";
import { Alert, Button } from "./ui";

function moneyParts(value, dollar) {
  if (value == null || Number.isNaN(Number(value))) return { dollar: "", amount: "" };
  const rounded = Math.round(Number(value));
  if (rounded === 0) return { dollar: "", amount: "\u2014" };
  const text = Math.abs(rounded).toLocaleString("en-US");
  return {
    dollar: dollar ? "$" : "",
    amount: rounded < 0 ? `(${text})` : text,
  };
}

function AmountCells({ value, dollar }) {
  const parts = moneyParts(value, dollar);
  return (
    <>
      <td className="afs-dollar">{parts.dollar}</td>
      <td className="afs-amt">{parts.amount}</td>
    </>
  );
}

function lifeText(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `${Math.round(Number(value))} years`;
}

function cellPlan(statement) {
  const columns = statement.columns || [];
  const kinds = statement.kinds?.length === columns.length
    ? statement.kinds
    : columns.map((column) => (/^\d{4}$/.test(String(column)) ? "year" : "money"));
  const money = kinds.filter((kind) => kind !== "life");
  const pairMoney = statement.paired !== false && money.length > 0 && (
    money.every((kind) => kind === "year")
    || (money.length <= 3 && money.every((kind) => kind === "money"))
  );
  return kinds.map((kind, index) => ({
    header: columns[index],
    kind,
    paired: kind !== "life" && pairMoney,
  }));
}

function dollarRows(rows, plan) {
  const moneyAt = plan.map((column, index) => (column.kind === "life" ? -1 : index)).filter((index) => index >= 0);
  const marks = [];
  let fresh = true;
  rows.forEach((row, index) => {
    const hasNumber = moneyAt.some((slot) => row.values[slot] != null);
    marks[index] = hasNumber && (fresh || row.bold);
    if (row.bold && hasNumber) fresh = true;
    else if (hasNumber) fresh = false;
  });
  return marks;
}

function tableWidths(plan, notes) {
  const note = notes ? 6 : 0;
  const lives = plan.filter((column) => column.kind === "life").length;
  const pairs = plan.filter((column) => column.paired).length;
  const plain = plan.length - lives - pairs;
  if (pairs && !plain) {
    const life = lives ? 14 : 0;
    const dollar = 3;
    const amount = 15;
    const caption = 100 - note - lives * life - pairs * (dollar + amount);
    if (caption >= 34) return { caption, note, life, dollar, amount, each: 0 };
    const pair = (100 - note - lives * life - 34) / Math.max(pairs, 1);
    const scaledDollar = pair * (3 / 18);
    return { caption: 34, note, life, dollar: scaledDollar, amount: pair - scaledDollar, each: 0 };
  }
  const caption = 28;
  const each = (100 - note - caption) / Math.max(plain + lives, 1);
  return { caption, note, life: each, dollar: 0, amount: 0, each };
}

function StatementTable({ statement, showNotes = true }) {
  const plan = cellPlan(statement);
  const years = plan.some((column) => column.kind === "year");
  const notes = showNotes && years;
  const dollars = dollarRows(statement.rows, plan);
  const widths = tableWidths(plan, notes);
  const flowing = statement.rows.length > 14;
  const firstYear = plan.findIndex((column) => column.kind === "year");
  const lastYear = plan.findLastIndex((column) => column.kind === "year");
  const yearSpan = plan.reduce((sum, column) => sum + (column.kind === "year" ? (column.paired ? 2 : 1) : 0), 0);
  return (
    <div className="afs-table-scroll">
    <table className={`afs-table${flowing ? " afs-table-flow" : ""}`}>
      <colgroup>
        <col style={{ width: `${widths.caption}%` }} />
        {notes ? <col style={{ width: `${widths.note}%` }} /> : null}
        {plan.flatMap((column, index) => (
          column.paired
            ? [
              <col key={`${index}-dollar`} style={{ width: `${widths.dollar}%` }} />,
              <col key={`${index}-amount`} style={{ width: `${widths.amount}%` }} />,
            ]
            : [<col key={`${index}-plain`} style={{ width: `${column.kind === "life" ? widths.life : widths.each}%` }} />]
        ))}
      </colgroup>
      <thead>
        {yearSpan ? (
          <tr>
            <th />
            {notes ? <th /> : null}
            {plan.slice(0, firstYear).map((column, index) => <th key={`lead-${index}`} colSpan={column.paired ? 2 : 1} />)}
            <th className="afs-date" colSpan={yearSpan}>December 31,</th>
            {plan.slice(lastYear + 1).map((column, index) => <th key={`tail-${index}`} colSpan={column.paired ? 2 : 1} />)}
          </tr>
        ) : null}
        <tr>
          <th />
          {notes ? <th className="afs-note">Note</th> : null}
          {plan.map((column, index) => (
            <th key={`${column.header}-${index}`} colSpan={column.paired ? 2 : 1} className={column.kind === "life" ? "afs-life" : ""}><span className="afs-head">{column.header}</span></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {statement.rows.map((row, index) => (
          <tr key={`${row.label}-${index}`} className={`${index % 2 ? "afs-band" : ""} ${row.bold ? "afs-bold" : ""} ${row.rule === "double" ? "afs-double afs-single" : ""} ${row.rule === "single" ? "afs-single" : ""}`}>
            <th className="afs-label" style={{ paddingLeft: `${0.15 * (row.indent || 0)}in`, "--afs-indent": row.indent || 0 }}><span className="afs-label-text">{row.label}</span></th>
            {notes ? <td className="afs-note">{row.note}</td> : null}
            {plan.map((column, valueIndex) => {
              const value = row.values[valueIndex];
              if (column.kind === "life") return <td key={`${valueIndex}-life`} className="afs-life">{lifeText(value)}</td>;
              if (column.paired) return <AmountCells key={`${column.header}-${valueIndex}`} value={value} dollar={dollars[index]} />;
              return <td key={`${valueIndex}-amt`} className="afs-amt">{moneyParts(value, false).amount}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
    <span className="afs-scroll-hint" aria-hidden="true" />
    </div>
  );
}

function anchorFor(title) {
  const text = String(title || "").toLowerCase();
  if (/auditor/.test(text)) return "auditor";
  if (/balance sheet/.test(text)) return "balance-sheets";
  if (/operation/.test(text)) return "operations";
  if (/equity/.test(text)) return "equity";
  if (/cash flow/.test(text)) return "cash-flows";
  const note = text.match(/\bnote\s+(\d{1,2})\b/) || text.match(/^(\d{1,2})\./);
  if (note) return `note-${Number(note[1])}`;
  return "";
}

function Page({ id, kicker, title, page, part = "section", children }) {
  return (
    <article id={id} className={`afs-page afs-part-${part}`}>
      {kicker ? <p className="afs-kicker">{kicker}</p> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
      {page ? <p className="afs-fpage">{page}</p> : null}
    </article>
  );
}

export default function AnnualStatementView({ statement, preview = false, onPublish, busy = false, files, printable = false, actions = true }) {
  const [downloadError, setDownloadError] = useState("");
  async function downloadFile(path, filename) {
    setDownloadError("");
    try {
      await downloadAuthorized(path, filename);
    } catch (err) {
      setDownloadError(err.message || "Could not download the file.");
    }
  }
  const document = statement?.document;
  if (!document) return null;
  const entity = document.cover.lines[0]?.text || "";
  const nav = [
    ["cover", "Cover"],
    ["index", "Index"],
    ["auditor", "Auditor's report"],
    ...document.statements.map((item) => [item.key, item.title]),
    ...document.notes.map((note) => [`note-${note.number}`, note.title]),
  ];
  const year = statement.year;
  const pages = {};
  for (const entry of document.index.entries) {
    const id = anchorFor(entry.title);
    if (id && entry.page && !pages[id]) pages[id] = entry.page;
  }
  const statementBody = (
    <div className="afs-shell">
      <div className="afs-main">
        {printable || !actions ? null : <div className="afs-actions">
          {downloadError ? <Alert>{downloadError}</Alert> : null}
          <Button type="button" variant="navy" onClick={() => downloadFile(files?.pdf || `/api/me/annual-statements/${year}/pdf`, files?.pdfName || `annual-financial-statements-${year}.pdf`)}>Download PDF</Button>
          <Button type="button" variant="navy" onClick={() => downloadFile(files?.xlsx || `/api/me/annual-statements/${year}/xlsx`, files?.xlsxName || statement.sourceName || "statements.xlsx")}>Download Excel</Button>
          {preview && statement.status !== "published" ? (
            <Button type="button" variant="navy" onClick={onPublish} disabled={busy || Boolean(statement.errors?.length)}>Publish</Button>
          ) : null}
        </div>}
        {statement.errors?.length ? (
          <ul className="afs-errors">
            {statement.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : null}
        <Page id="cover" part="cover" kicker={entity} title={document.cover.lines[1]?.text || "Financial statements"}>
          {document.cover.lines.slice(2).map((line) => <p key={line.text} className={line.type === "h" || line.text.length < 90 ? "afs-center" : ""}>{line.text}</p>)}
        </Page>
        <Page id="index" kicker={entity} title="INDEX TO FINANCIAL STATEMENTS">
          <ul className="afs-index">
            {document.index.entries.map((entry) => {
              const id = anchorFor(entry.title);
              return (
                <li key={`${entry.title}-${entry.page}`} className={entry.indent ? "afs-index-note" : ""}>
                  {id ? <a href={`#${id}`}>{entry.title}</a> : <span>{entry.title}</span>}
                  <span className="afs-index-page">{entry.page}</span>
                </li>
              );
            })}
          </ul>
        </Page>
        <Page id="auditor" title="Independent Auditor's Report" page={pages.auditor}>
          {document.auditor.blocks.filter((block) => block.text.trim().toLowerCase() !== "independent auditor's report").map((block) => (
            <p key={block.text.slice(0, 48)} className={block.type === "h" ? "afs-heading" : ""}>{block.text}</p>
          ))}
        </Page>
        {document.statements.map((item) => (
          <Page key={item.key} id={item.key} kicker={entity} title={item.title} page={pages[item.key]}>
            <p className="afs-unit">(in whole dollars)</p>
            <StatementTable statement={item} />
            <p className="afs-footer">See accompanying notes to the financial statements.</p>
          </Page>
        ))}
        {document.notes.map((note, noteIndex) => (
          <Page key={note.number} id={`note-${note.number}`} part={noteIndex === 0 ? "notes" : "flow"} kicker={entity} title={note.title} page={pages[`note-${note.number}`]}>
            {note.blocks.some((block) => block.type === "table") ? <p className="afs-unit">(in whole dollars)</p> : null}
            {note.blocks.map((block, index) => (
              block.type === "table" ? (
                <StatementTable key={index} statement={{ columns: block.headers, rows: block.rows, paired: block.paired, kinds: block.kinds }} showNotes={false} />
              ) : <p key={index} className={block.type === "h" ? "afs-heading" : ""}>{block.text}</p>
            ))}
          </Page>
        ))}
      </div>
    </div>
  );
  if (printable) return statementBody;
  return (
    <div className="afs-layout">
      <aside className="afs-nav">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </aside>
      {statementBody}
    </div>
  );
}
