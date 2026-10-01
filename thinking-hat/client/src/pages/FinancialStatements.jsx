import { Alert, Card, PageIntro, money } from "../components/ui";
import { resultOf, useFinances } from "../useFinances";

function Lines({ rows }) {
  return (
    <dl className="mt-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-4 py-2.5 ${row.strong ? "border-t border-[rgba(109,40,217,0.16)]" : "border-t border-[rgba(109,40,217,0.06)] first:border-t-0"}`}
        >
          <dt className={row.strong ? "font-display font-extrabold text-ink" : "text-sm text-mute"}>{row.label}</dt>
          <dd className={`tabular-nums ${row.strong ? "font-display text-lg font-extrabold" : "text-sm font-semibold"} ${row.value < 0 ? "text-rose-700" : "text-ink"}`}>
            {money(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function FinancialStatements() {
  const { data, error } = useFinances();
  const months = data?.months || [];
  const revenue = months.length ? months.reduce((sum, month) => sum + month.revenue, 0) : (data?.revenue || 0);
  const expenses = months.length ? months.reduce((sum, month) => sum + month.expenses, 0) : (data?.expenses || 0);
  const assets = data ? data.cash + data.receivables : 0;
  const net = data ? assets - data.payables : 0;

  return (
    <div>
      <PageIntro title="Financial Statements" lede="Profit and loss, financial position, and cash movements from the figures Purple Hat maintains." />
      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="text-mute">Loading statements…</p> : null}
      {data ? (
        <div className="space-y-4">
          {data.source === "sample" ? (
            <Alert tone="ok">Sample figures. Purple Hat replaces these when your books are posted.</Alert>
          ) : null}
          {data.source === "empty" ? <Alert tone="ok">No figures posted yet.</Alert> : null}
          <p className="text-sm text-mute">These are not a full set of annual financial statements. Xero and QuickBooks stay the system of record.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-display text-xl font-extrabold text-ink">Profit and loss</h2>
              <p className="mt-1 text-xs text-mute">{months.length ? "Months on file" : "This month"}</p>
              <Lines rows={[
                { label: "Revenue", value: revenue },
                { label: "Expenses", value: expenses },
                { label: "Result", value: resultOf(revenue, expenses), strong: true },
              ]} />
            </Card>
            <Card>
              <h2 className="font-display text-xl font-extrabold text-ink">Financial position</h2>
              <p className="mt-1 text-xs text-mute">Figures on file</p>
              <Lines rows={[
                { label: "Cash", value: data.cash },
                { label: "Receivables", value: data.receivables },
                { label: "Assets", value: assets, strong: true },
                { label: "Payables", value: data.payables },
                { label: "Net assets", value: net, strong: true },
              ]} />
            </Card>
          </div>
          <Card>
            <h2 className="font-display text-xl font-extrabold text-ink">Cash movements</h2>
            <ul className="mt-4 space-y-3">
              {data.events.length === 0 ? <li className="text-sm text-mute">No cash movements posted yet.</li> : null}
              {data.events.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 border-t border-[rgba(109,40,217,0.06)] pt-3 text-sm first:border-t-0 first:pt-0">
                  <span className="text-ink">{event.description}</span>
                  <span className={`shrink-0 tabular-nums font-semibold ${event.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(event.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
