import { Alert, Card, PageIntro, money } from "../components/ui";
import { monthHeading, resultOf, useFinances } from "../useFinances";

function amountClass(value, strong) {
  const tone = value < 0 ? "text-rose-700" : "text-ink";
  return strong ? `font-display font-extrabold ${tone}` : `font-semibold ${tone}`;
}

export default function ManagementReports() {
  const { data, error } = useFinances();
  const months = data?.months || [];
  const totals = months.reduce(
    (sum, month) => ({
      revenue: sum.revenue + month.revenue,
      expenses: sum.expenses + month.expenses,
    }),
    { revenue: 0, expenses: 0 },
  );
  const monthResult = data ? resultOf(data.revenue, data.expenses) : 0;

  return (
    <div>
      <PageIntro title="Management Reports" lede="Revenue, expenses, and the monthly result from the figures Purple Hat maintains." />
      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="text-mute">Loading reports…</p> : null}
      {data ? (
        <div className="space-y-4">
          {data.source === "sample" ? (
            <Alert tone="ok">Sample figures. Purple Hat replaces these when your books are posted.</Alert>
          ) : null}
          {data.source === "empty" ? <Alert tone="ok">No figures posted yet.</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Revenue this month", data.revenue],
              ["Expenses this month", data.expenses],
              ["Result this month", monthResult],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{label}</p>
                <p className={`mt-3 text-2xl ${amountClass(value, true)}`}>{money(value)}</p>
              </Card>
            ))}
          </div>
          <Card>
            <h2 className="font-display text-xl font-extrabold text-ink">Months on file</h2>
            {months.length === 0 ? <p className="mt-4 text-sm text-mute">No months posted yet.</p> : null}
            {months.length > 0 ? (
              <>
                <div className="mt-4 hidden sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-bold uppercase tracking-[0.12em] text-mute">
                        <th className="pb-2 font-bold">Month</th>
                        <th className="pb-2 text-right font-bold">Revenue</th>
                        <th className="pb-2 text-right font-bold">Expenses</th>
                        <th className="pb-2 text-right font-bold">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((month) => {
                        const result = resultOf(month.revenue, month.expenses);
                        return (
                          <tr key={month.month} className="border-t border-[rgba(109,40,217,0.08)]">
                            <td className="py-2.5 font-semibold text-ink">{monthHeading(month.month)}</td>
                            <td className="py-2.5 text-right tabular-nums text-ink">{money(month.revenue)}</td>
                            <td className="py-2.5 text-right tabular-nums text-ink">{money(month.expenses)}</td>
                            <td className={`py-2.5 text-right tabular-nums ${amountClass(result)}`}>{money(result)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[rgba(109,40,217,0.16)] font-display font-extrabold text-ink">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right tabular-nums">{money(totals.revenue)}</td>
                        <td className="pt-3 text-right tabular-nums">{money(totals.expenses)}</td>
                        <td className={`pt-3 text-right tabular-nums ${amountClass(resultOf(totals.revenue, totals.expenses), true)}`}>{money(resultOf(totals.revenue, totals.expenses))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <ul className="mt-4 space-y-3 sm:hidden">
                  {months.map((month) => {
                    const result = resultOf(month.revenue, month.expenses);
                    return (
                      <li key={month.month} className="rounded-2xl bg-[#f5f0ff] px-4 py-3">
                        <p className="font-display font-extrabold text-ink">{monthHeading(month.month)}</p>
                        <dl className="mt-2 space-y-1 text-sm">
                          <div className="flex justify-between gap-3"><dt className="text-mute">Revenue</dt><dd className="tabular-nums text-ink">{money(month.revenue)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-mute">Expenses</dt><dd className="tabular-nums text-ink">{money(month.expenses)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-mute">Result</dt><dd className={`tabular-nums ${amountClass(result)}`}>{money(result)}</dd></div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
