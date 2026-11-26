import { useEffect, useState } from "react";
import { api } from "../api";
import { planMoney, shortMonth, weekLabel } from "../components/planning/format";
import { CashBars, CashLineChart, DataChips, HeadroomPill, KpiCard, MoneyCells, NoteList } from "../components/planning/widgets";
import { Alert, Button, Card, PageIntro, SegmentedPills } from "../components/ui";

function ageingTotal(ageing) {
  return Object.values(ageing?.rows || {}).reduce((sum, row) => (
    sum + Number(row.current || 0) + Number(row["30"] || 0) + Number(row["60"] || 0) + Number(row["90"] || 0)
  ), 0);
}

export default function CashForecast() {
  const [view, setView] = useState("week");
  const [scenario, setScenario] = useState("base");
  const [week, setWeek] = useState(null);
  const [month, setMonth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    api.planningCashMonth()
      .then((data) => { if (!stop) setMonth(data); })
      .catch((err) => {
        if (!stop) setError(err.status === 404 ? "Cash forecast is on the Purple Hat Demo books only." : err.message);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    api.planningCashWeek(scenario)
      .then((data) => { if (!stop) setWeek(data); })
      .catch((err) => {
        if (!stop) setError(err.status === 404 ? "Cash forecast is on the Purple Hat Demo books only." : err.message);
      });
    return () => {
      stop = true;
    };
  }, [scenario]);

  async function download() {
    setError("");
    try {
      if (view === "week") {
        await api.downloadPlanning("/api/me/planning/cash/13-week/xlsx", "PurpleHatDemo_CashForecast_13Week_2027-01-04.xlsx");
      } else {
        await api.downloadPlanning("/api/me/planning/cash/monthly/2027/xlsx", "PurpleHatDemo_CashForecast_Monthly_FY2027.xlsx");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const position = week?.positions?.[scenario];
  const actuals = month
    ? Object.entries(month.actualClosingCash2026).map(([period, value]) => ({ label: shortMonth(period), value }))
    : [];
  const forecasts = month
    ? month.periods.map((period, index) => ({ label: shortMonth(period), value: month.closing[index] }))
    : [];
  const bridgeRows = month?.rows || [];

  return (
    <div>
      <PageIntro title="Cash forecast" lede="Thirteen weeks from 4 January 2027, and the FY2027 month-end bridge.">
        <Button type="button" variant="secondary" onClick={download}>Download to Excel</Button>
      </PageIntro>
      <DataChips
        real={view === "week"
          ? "31 December 2026 opening bank, receivables, and payables."
          : "July to December 2026 closing cash and the 31 December opening bank."}
        illustrative={view === "week"
          ? "2027 receipts, payments, timing, and the three scenarios."
          : "The FY2027 bridge, working capital, capex, and drawings."}
      />
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      <div className="mt-4 max-w-md">
        <SegmentedPills
          label="Forecast horizon"
          value={view}
          onChange={setView}
          options={[
            { id: "week", label: "13-week" },
            { id: "month", label: "Monthly" },
          ]}
        />
      </div>

      {view === "week" && week && position ? (
        <div className="mt-4 space-y-4">
          <div className="max-w-lg">
            <SegmentedPills
              label="Cash scenario"
              value={scenario}
              onChange={setScenario}
              options={[
                { id: "base", label: "Base" },
                { id: "downside", label: "Downside" },
                { id: "upside", label: "Upside" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Opening cash" value={planMoney(week.openingCash)} detail={`31 December 2026 · minimum ${planMoney(week.minimumCash)}`} />
            <KpiCard label="Week 13 closing" value={planMoney(position.week13Closing)} detail={position.label} />
            <KpiCard label="Low point" value={planMoney(position.low.amount)} detail={`Week ${position.low.week} · ${weekLabel(position.low.start)}`} />
            <KpiCard label="Headroom at the low" value={planMoney(position.low.headroom)} detail={`Against the ${planMoney(week.minimumCash)} minimum`} />
          </div>
          <Card>
            <h2 className="font-display text-xl font-bold text-heading">Closing bank balance</h2>
            <p className="mt-1 text-sm text-mute">Base is the solid line. Downside and upside are dashed. The band under the minimum is the shortfall.</p>
            <CashLineChart positions={week.positions} minimum={week.minimumCash} />
            {week.accuracyLastCycle ? (
              <p className="mt-2 text-sm text-mute">{week.accuracyLastCycle.label}: {week.accuracyLastCycle.pct}% · illustrative</p>
            ) : null}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-display text-xl font-bold text-heading">Risks</h2>
              <NoteList items={week.risks} />
            </Card>
            <Card>
              <h2 className="mb-2 font-display text-xl font-bold text-heading">Opportunities</h2>
              <NoteList items={week.opportunities} />
            </Card>
          </div>
          <Card>
            <h2 className="font-display text-xl font-bold text-heading">Weekly detail · {position.label}</h2>
            <p className="mt-1 text-sm text-mute">
              Opening receivables {planMoney(ageingTotal(week.arAgingOpening))}. Opening payables {planMoney(ageingTotal(week.apAgingOpening))}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-right font-display text-xs tracking-[0.08em] text-heading">
                    <th className="py-2 text-left font-semibold">Line</th>
                    {week.weekStarts.map((start) => <th key={start} className="px-2 py-2 font-semibold">{weekLabel(start)}</th>)}
                    <th className="px-2 py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {week.lines.map((line) => (
                    <tr key={line.key}>
                      <td className="py-1.5">{line.label}</td>
                      <MoneyCells values={line.weekly} />
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{planMoney(line.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--row-total-bg)] font-semibold text-[var(--row-total-text)]">
                    <td className="py-1.5">Closing bank</td>
                    <MoneyCells values={position.weeks.map((item) => item.closing)} emphasize />
                    <td />
                  </tr>
                  <tr>
                    <td className="py-1.5">Headroom</td>
                    {position.weeks.map((item) => (
                      <td key={item.start} className="px-2 py-1.5 text-right"><HeadroomPill value={item.headroom} /></td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {view === "month" && month ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Opening cash" value={planMoney(month.openingCash)} detail="31 December 2026" />
            <KpiCard label="Lowest month-end" value={planMoney(month.low.amount)} detail={month.low.period} />
            <KpiCard label="December 2027 closing" value={planMoney(month.yearEnd)} detail={`Minimum ${planMoney(month.minimumCash)}`} />
            <KpiCard label="FY2027 net income" value={planMoney(month.netIncome)} detail={`On net revenue ${planMoney(month.netRevenue)}`} />
          </div>
          <Card>
            <h2 className="font-display text-xl font-bold text-heading">Month-end bank balance</h2>
            <p className="mt-1 text-sm text-mute">July to December 2026 is actual. FY2027 is the forecast. Bars under the minimum are marked.</p>
            <CashBars actuals={actuals} forecasts={forecasts} minimum={month.minimumCash} />
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-xl font-bold text-heading">What to watch</h2>
            <NoteList items={month.watch} />
          </Card>
          <Card>
            <h2 className="font-display text-xl font-bold text-heading">Cash bridge</h2>
            <p className="mt-1 text-sm text-mute">January, February, and March also show the 13-week month-end so the two forecasts can be tied out. A difference is timing, not a restatement of the books.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-right font-display text-xs tracking-[0.08em] text-heading">
                    <th className="py-2 text-left font-semibold">Line</th>
                    {month.periods.map((period) => <th key={period} className="px-2 py-2 font-semibold">{shortMonth(period)}</th>)}
                    <th className="px-2 py-2 font-semibold">FY</th>
                  </tr>
                </thead>
                <tbody>
                  {bridgeRows.map((row) => (
                    <tr key={row.key} className={row.rowType === "total" ? "bg-[var(--row-total-bg)] font-semibold text-[var(--row-total-text)]" : ""}>
                      <td className="py-1.5">{row.label}</td>
                      <MoneyCells values={row.values} emphasize={row.rowType === "total"} />
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.fy == null ? "" : planMoney(row.fy)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5">13-week forecast</td>
                    {month.periods.map((period) => {
                      const tie = month.tieOut.find((item) => item.period === period);
                      return <td key={period} className="px-2 py-1.5 text-right tabular-nums">{tie ? planMoney(tie.weekForecast) : ""}</td>;
                    })}
                    <td />
                  </tr>
                  <tr>
                    <td className="py-1.5">Tie-out difference</td>
                    {month.periods.map((period) => {
                      const tie = month.tieOut.find((item) => item.period === period);
                      return <td key={period} className="px-2 py-1.5 text-right tabular-nums">{tie ? planMoney(tie.difference) : ""}</td>;
                    })}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
