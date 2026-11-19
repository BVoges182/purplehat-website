import { useEffect, useState } from "react";
import { api, downloadAuthorized } from "../api";
import { useAuth } from "../auth";
import AnnualStatementView from "../components/AnnualStatementView";
import { Alert, Button, Card, Field, PageIntro, inputClass } from "../components/ui";
import { isPlasYnGroveFarm, plasYnGroveFinancialPosition, reportFigure, reportMonthLabel, statementCards } from "../reportMoney";

const emptyCard = { column: "", rows: [] };

function yearEndedLabel(yearEnd) {
  const iso = String(yearEnd || "").slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function StatementLines({ rows }) {
  return (
    <dl className="mt-4">
      {rows.map((row) => (
        <div
          key={row.key}
          className={`flex items-baseline justify-between gap-4 px-2 py-2.5 ${row.strong ? "bg-neutral-100" : "border-t border-neutral-200 first:border-t-0"}`}
        >
          <dt className={row.heading || row.strong ? "font-display font-extrabold text-neutral-950" : "text-sm text-neutral-950"} style={{ paddingLeft: row.indent ? "1.25rem" : undefined }}>{row.label}</dt>
          {row.heading ? null : (
            <dd className={`shrink-0 tabular-nums text-neutral-950 ${row.strong ? "font-display font-extrabold" : "text-sm"}`}>
              {reportFigure(row.value, row.format)}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function StatementCard({ title, card }) {
  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold text-ink">{title}</h2>
      {card.column ? <p className="mt-1 text-xs text-mute">{card.column}</p> : null}
      {card.rows.length ? <StatementLines rows={card.rows} /> : null}
      {card.note ? <p className="mt-3 text-sm font-semibold text-rose-800">{card.note}</p> : null}
    </Card>
  );
}

function cardsForReport(report, plas) {
  const cards = statementCards(report);
  if (!plas) return cards;
  return { ...cards, position: plasYnGroveFinancialPosition(report) };
}

export default function FinancialStatements() {
  const { user } = useAuth();
  const plas = isPlasYnGroveFarm(user);
  const [months, setMonths] = useState([]);
  const [month, setMonth] = useState("");
  const [cards, setCards] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [annualYears, setAnnualYears] = useState(null);
  const [annualYear, setAnnualYear] = useState("");
  const [annual, setAnnual] = useState(null);

  useEffect(() => {
    let stop = false;
    api.annualStatements()
      .then((payload) => {
        if (stop) return;
        const list = payload.years || [];
        setAnnualYears(list);
        setAnnualYear((current) => current || list[0]?.year || "");
      })
      .catch(() => { if (!stop) setAnnualYears([]); });
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    if (!annualYear) return undefined;
    let stop = false;
    api.annualStatement(annualYear)
      .then((payload) => { if (!stop) setAnnual(payload.statement); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [annualYear]);

  useEffect(() => {
    if (plas) return undefined;
    let stop = false;
    api.reports()
      .then(async (payload) => {
        const latest = payload.reports?.[0];
        if (!latest) return null;
        const detail = await api.report(latest.month);
        return statementCards(detail.report);
      })
      .then((next) => {
        if (stop) return;
        setCards(next);
        setError("");
      })
      .catch((err) => {
        if (stop) return;
        setCards(null);
        setError(err.message);
      })
      .finally(() => {
        if (!stop) setReady(true);
      });
    return () => { stop = true; };
  }, [plas]);

  useEffect(() => {
    if (!plas) return undefined;
    let stop = false;
    api.reports()
      .then((payload) => {
        if (stop) return;
        const list = payload.reports || [];
        setMonths(list);
        setMonth((current) => current || list[0]?.month || "");
        if (!list.length) setReady(true);
      })
      .catch((err) => {
        if (stop) return;
        setError(err.message);
        setReady(true);
      });
    return () => { stop = true; };
  }, [plas]);

  useEffect(() => {
    if (!plas || !month) return undefined;
    let stop = false;
    api.report(month)
      .then((detail) => {
        if (stop) return;
        setCards(cardsForReport(detail.report, true));
        setError("");
      })
      .catch((err) => {
        if (stop) return;
        setCards(null);
        setError(err.message);
      })
      .finally(() => {
        if (!stop) setReady(true);
      });
    return () => { stop = true; };
  }, [plas, month]);

  async function downloadAnnual(path, filename) {
    setError("");
    try {
      await downloadAuthorized(path, filename);
    } catch (err) {
      setError(err.message || "Could not download the file.");
    }
  }

  if (annualYears?.length) {
    return (
      <div>
        <PageIntro title="Financial Statements" lede="Audited annual financial statements." />
        {error ? <Alert>{error}</Alert> : null}
        {annualYears.length > 1 ? (
          <div className="mb-4 max-w-xs">
            <Field label="Year">
              <select className={inputClass} value={annualYear} onChange={(event) => setAnnualYear(event.target.value)}>
                {annualYears.map((item) => <option key={item.yearEnd} value={item.year}>FY{item.year}</option>)}
              </select>
            </Field>
          </div>
        ) : null}
        {annual ? (
          <>
            <Card className="mb-4">
              <h2 className="font-display text-xl font-extrabold text-ink">Financial Statements</h2>
              <div className="mt-2 flex flex-col gap-3 border-t border-[rgba(109,40,217,0.08)] py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-lg font-extrabold text-ink">Annual financial statements</p>
                  <p className="mt-1 text-sm text-mute">Year ended {yearEndedLabel(annual.yearEnd)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="navy" onClick={() => downloadAnnual(`/api/me/annual-statements/${annual.year}/pdf`, `annual-financial-statements-${annual.year}.pdf`)}>Download PDF</Button>
                  <Button type="button" variant="navy" onClick={() => downloadAnnual(`/api/me/annual-statements/${annual.year}/xlsx`, annual.sourceName || "statements.xlsx")}>Download Excel</Button>
                </div>
              </div>
            </Card>
            <AnnualStatementView statement={annual} actions={false} />
          </>
        ) : <p className="text-mute">Loading statements…</p>}
      </div>
    );
  }

  const profit = cards?.profit || emptyCard;
  const position = cards?.position || emptyCard;
  const cash = cards?.cash || emptyCard;

  return (
    <div>
      <PageIntro title="Financial Statements" lede="Profit and loss, financial position, and cash movements from the figures Purple Hat maintains." />
      {error ? <Alert>{error}</Alert> : null}
      {!ready && !error ? <p className="text-mute">Loading statements…</p> : null}
      {ready ? (
        <div className="space-y-4">
          <p className="text-sm text-mute">These are not a full set of annual financial statements.</p>
          {plas && months.length > 0 ? (
            <div className="max-w-xs">
              <Field label="Month">
                <select className={inputClass} aria-label="Statement month" value={month} onChange={(event) => setMonth(event.target.value)}>
                  {months.map((item) => (
                    <option key={item.month} value={item.month}>{reportMonthLabel(item.month)}</option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <StatementCard title="Profit and loss" card={profit} />
            <StatementCard title={plas ? "Statement of financial position" : "Financial position"} card={position} />
          </div>
          <StatementCard title="Statement of cash flows" card={cash} />
        </div>
      ) : null}
    </div>
  );
}
