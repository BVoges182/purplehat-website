import { downloadAuthorized } from "../api";

function moneyParts(value, dollar) {
  if (value == null || Number.isNaN(Number(value))) return { dollar: "", number: "", paren: "" };
  const rounded = Math.round(Number(value));
  if (rounded === 0) return { dollar: "", number: "—", paren: "" };
  const text = Math.abs(rounded).toLocaleString("en-US");
  return {
    dollar: dollar ? "$" : "",
    number: rounded < 0 ? `(${text}` : text,
    paren: rounded < 0 ? ")" : "",
  };
}

function Money({ value, dollar }) {
  const parts = moneyParts(value, dollar);
  return (
    <span className="afs-money">
      <span className="afs-dollar">{parts.dollar}</span>
      <span className="afs-num">{parts.number}</span>
      <span className="afs-paren">{parts.paren}</span>
    </span>
  );
}

function dollarRows(rows) {
  const marks = [];
  let fresh = true;
  rows.forEach((row, index) => {
    const hasNumber = row.values.some((value) => value != null);
    const show = hasNumber && (fresh || row.bold);
    marks[index] = show;
    if (row.bold && hasNumber) fresh = true;
    else if (hasNumber) fresh = false;
  });
  return marks;
}

function StatementTable({ statement, showNotes = true }) {
  const years = statement.columns.every((column) => /^\d{4}$/.test(column));
  const notes = showNotes && years;
  const dollars = dollarRows(statement.rows);
  return (
    <table className="afs-table">
      <thead>
        {years ? (
          <tr>
            <th />
            {notes ? <th /> : null}
            <th className="afs-date" colSpan={statement.columns.length}>December 31,</th>
          </tr>
        ) : null}
        <tr>
          <th />
          {notes ? <th>Note</th> : null}
          {statement.columns.map((column) => <th key={column}>{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {statement.rows.map((row, index) => (
          <tr key={`${row.label}-${index}`} className={`${index % 2 ? "afs-band" : ""} ${row.bold ? "afs-bold" : ""} ${row.rule === "double" ? "afs-double afs-single" : ""} ${row.rule === "single" ? "afs-single" : ""}`}>
            <th style={{ paddingLeft: `${0.15 * (row.indent || 0)}in` }}>{row.label}</th>
            {notes ? <td className="afs-note">{row.note}</td> : null}
            {row.values.map((value, valueIndex) => (
              <td key={statement.columns[valueIndex] || valueIndex}>
                <Money value={value} dollar={dollars[index]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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

function Page({ id, kicker, title, page, children }) {
  return (
    <article id={id} className="afs-page">
      {kicker ? <p className="afs-kicker">{kicker}</p> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
      {page ? <p className="afs-fpage">{page}</p> : null}
    </article>
  );
}

export default function AnnualStatementView({ statement, preview = false, onPublish, busy = false, files }) {
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
  return (
    <div className="afs-shell">
      <aside className="afs-nav">
        <p>Financial Statements</p>
        {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </aside>
      <div className="afs-main">
        <div className="afs-actions">
          <button type="button" onClick={() => downloadAuthorized(files?.pdf || `/api/me/annual-statements/${year}/pdf`, files?.pdfName || `annual-financial-statements-${year}.pdf`)}>Download PDF</button>
          <button type="button" onClick={() => downloadAuthorized(files?.xlsx || `/api/me/annual-statements/${year}/xlsx`, files?.xlsxName || statement.sourceName || "statements.xlsx")}>Download Excel</button>
          {preview && statement.status !== "published" ? (
            <button type="button" onClick={onPublish} disabled={busy || statement.errors?.length}>Publish</button>
          ) : null}
        </div>
        {statement.errors?.length ? (
          <ul className="afs-errors">
            {statement.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : null}
        <Page id="cover" kicker={entity} title={document.cover.lines[1]?.text || "Financial statements"}>
          {document.cover.lines.slice(2).map((line) => <p key={line.text} className={line.type === "h" || line.text.length < 90 ? "afs-center" : ""}>{line.text}</p>)}
        </Page>
        <Page id="index" kicker={entity} title="INDEX TO FINANCIAL STATEMENTS">
          <ul className="afs-index">
            {document.index.entries.map((entry) => {
              const id = anchorFor(entry.title);
              return (
                <li key={`${entry.title}-${entry.page}`} style={{ paddingLeft: `${0.25 * (entry.indent || 0)}in` }}>
                  {id ? <a href={`#${id}`}>{entry.title}</a> : <span>{entry.title}</span>}
                  <span>{entry.page}</span>
                </li>
              );
            })}
          </ul>
        </Page>
        <Page id="auditor" title="Independent Auditor's Report" page={pages.auditor}>
          {document.auditor.blocks.map((block) => (
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
        {document.notes.map((note) => (
          <Page key={note.number} id={`note-${note.number}`} kicker={entity} title={note.title} page={pages[`note-${note.number}`]}>
            {note.blocks.some((block) => block.type === "table") ? <p className="afs-unit">(in whole dollars)</p> : null}
            {note.blocks.map((block, index) => (
              block.type === "table" ? (
                <StatementTable key={index} statement={{ columns: block.headers, rows: block.rows }} showNotes={false} />
              ) : <p key={index} className={block.type === "h" ? "afs-heading" : ""}>{block.text}</p>
            ))}
          </Page>
        ))}
      </div>
    </div>
  );
}
