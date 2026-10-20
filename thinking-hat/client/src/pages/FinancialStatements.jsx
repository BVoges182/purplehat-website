import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Card, Field, PageIntro, inputClass } from "../components/ui";
import { isPlasYnGroveFarm, plasYnGroveFinancialPosition, reportFigure, reportMonthLabel, statementCards } from "../reportMoney";

const emptyCard = { column: "", rows: [] };

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
          <p className="text-sm text-mute">These are not a full set of annual financial statements. Xero and QuickBooks stay the system of record.</p>
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
