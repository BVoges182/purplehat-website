import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadAuthorized } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, PageIntro, money } from "../components/ui";
import { reportMonthLabel, reportPdfName } from "../reportMoney";
import { monthHeading, resultOf, useFinances } from "../useFinances";

function amountClass(value, strong) {
  const tone = value < 0 ? "text-rose-700" : "text-ink";
  return strong ? `font-display font-extrabold ${tone}` : `font-semibold ${tone}`;
}

function usesDollars(user) {
  if (user?.reportTemplate === "purple-hat-demo") return true;
  if (user?.reportTemplate === "wealth-tech") return false;
  return /purple\s*hat\s*demo/i.test(String(user?.businessName || ""));
}

function wholeDollars(value) {
  const number = Number(value);
  const amount = Number.isFinite(number) ? number : 0;
  const negative = amount < 0;
  const body = new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(amount)));
  return `${negative ? "-" : ""}$ ${body}`;
}

export default function ManagementReports() {
  const { user } = useAuth();
  const { data, error } = useFinances();
  const [reports, setReports] = useState([]);
  const [reportError, setReportError] = useState("");
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    let stop = false;
    api.reports()
      .then((payload) => { if (!stop) setReports(payload.reports || []); })
      .catch((err) => { if (!stop) setReportError(err.message); });
    return () => { stop = true; };
  }, []);

  async function download(report) {
    setDownloading(report.month);
    setReportError("");
    try {
      await downloadAuthorized(
        `/api/me/reports/${report.month}/pdf`,
        reportPdfName(user.businessName, report.month),
      );
    } catch (err) {
      setReportError(err.message);
    } finally {
      setDownloading("");
    }
  }
  const months = (data?.months || []).filter((month) => typeof month.revenue === "number" || typeof month.expenses === "number");
  const totals = months.reduce(
    (sum, month) => ({
      revenue: sum.revenue + month.revenue,
      expenses: sum.expenses + month.expenses,
    }),
    { revenue: 0, expenses: 0 },
  );
  const monthResult = data ? resultOf(data.revenue, data.expenses) : 0;
  const figure = usesDollars(user) ? wholeDollars : money;

  return (
    <div>
      <PageIntro title="Management Reports" lede="Revenue, expenses, and the monthly result from the figures Purple Hat maintains." />
      {error ? <Alert>{error}</Alert> : null}
      {reportError ? <div className="mb-4"><Alert>{reportError}</Alert></div> : null}
      {reports.length > 0 ? (
        <Card className="mb-4">
          <h2 className="font-display text-xl font-extrabold text-ink">Reports</h2>
          <ul className="mt-2">
            {reports.map((report) => (
              <li key={report.month} className="flex flex-col gap-3 border-t border-[rgba(109,40,217,0.08)] py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/reports/${report.month}`} className="min-w-0">
                  <p className="font-display text-lg font-extrabold text-ink">{reportMonthLabel(report.month)}</p>
                  <p className="mt-1 text-sm text-mute">{report.periodLabel}</p>
                </Link>
                <Button type="button" variant="ghost" disabled={downloading === report.month} onClick={() => download(report)}>Download PDF</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
                <p className={`mt-3 text-2xl ${amountClass(value, true)}`}>{figure(value)}</p>
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
                            <td className="py-2.5 text-right tabular-nums text-ink">{figure(month.revenue)}</td>
                            <td className="py-2.5 text-right tabular-nums text-ink">{figure(month.expenses)}</td>
                            <td className={`py-2.5 text-right tabular-nums ${amountClass(result)}`}>{figure(result)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[rgba(109,40,217,0.16)] font-display font-extrabold text-ink">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right tabular-nums">{figure(totals.revenue)}</td>
                        <td className="pt-3 text-right tabular-nums">{figure(totals.expenses)}</td>
                        <td className={`pt-3 text-right tabular-nums ${amountClass(resultOf(totals.revenue, totals.expenses), true)}`}>{figure(resultOf(totals.revenue, totals.expenses))}</td>
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
                          <div className="flex justify-between gap-3"><dt className="text-mute">Revenue</dt><dd className="tabular-nums text-ink">{figure(month.revenue)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-mute">Expenses</dt><dd className="tabular-nums text-ink">{figure(month.expenses)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-mute">Result</dt><dd className={`tabular-nums ${amountClass(result)}`}>{figure(result)}</dd></div>
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
