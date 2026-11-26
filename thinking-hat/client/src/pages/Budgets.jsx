import { useEffect, useState } from "react";
import { api } from "../api";
import { CommentaryEditor, DataChips, KpiCard, VarianceTable } from "../components/planning/widgets";
import { monthLabel, planMoney, planPercent } from "../components/planning/format";
import { Alert, Button, Card, PageIntro, SegmentedPills } from "../components/ui";

const GRID_ROWS = [
  ["net_revenue", "Net revenue", true],
  ["gross_profit", "Gross profit", true],
  ["marketing", "Marketing", false],
  ["wages", "Wages", false],
  ["other_fixed", "Other fixed", false],
  ["net_income", "Net income", true],
];

const OTHER_FIXED = ["software", "warehouse_rent", "insurance", "office"];

function versionStatus(version) {
  const locked = version.locked ? " · locked" : "";
  if (version.status === "approved") return `Approved${locked}`;
  if (version.status === "draft") return `Draft${locked}`;
  return `${version.status}${locked}`;
}

function summarise(values) {
  if (!values) return null;
  const other = OTHER_FIXED.reduce((sum, key) => sum + Number(values[key] || 0), 0);
  return {
    net_revenue: values.net_revenue,
    gross_profit: values.gross_profit,
    marketing: values.marketing,
    wages: values.wages,
    other_fixed: other,
    net_income: values.net_income,
  };
}

function onPlan(actual, budget) {
  if (actual == null || budget == null) return "";
  return Math.abs(actual - budget) <= 0.005 ? "on plan" : "off plan";
}

export default function Budgets() {
  const [view, setView] = useState("setup");
  const [column, setColumn] = useState("month");
  const [versionId, setVersionId] = useState("fy2027-v1");
  const [budget, setBudget] = useState(null);
  const [variance, setVariance] = useState(null);
  const [commentary, setCommentary] = useState(null);
  const [paragraphs, setParagraphs] = useState([]);
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([api.planningBudgets(), api.planningVariance(), api.planningCommentary()])
      .then(([budgetData, varianceData, commentaryData]) => {
        if (stop) return;
        setBudget(budgetData);
        setVariance(varianceData);
        setCommentary(commentaryData);
        setParagraphs(commentaryData.paragraphs.map((item) => ({ ...item })));
        setReasons({ ...commentaryData.lineReasons });
      })
      .catch((err) => {
        if (!stop) setError(err.status === 404 ? "Budgets are on the Purple Hat Demo books only." : err.message);
      });
    return () => {
      stop = true;
    };
  }, []);

  async function download(path, filename) {
    setError("");
    try {
      await api.downloadPlanning(path, filename);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await api.savePlanningCommentary({ paragraphs, lineReasons: reasons });
      setCommentary(saved);
      setParagraphs(saved.paragraphs.map((item) => ({ ...item })));
      setReasons({ ...saved.lineReasons });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetDraft() {
    if (!commentary) return;
    const nextParagraphs = commentary.seedParagraphs.map((item) => ({ ...item }));
    const nextReasons = { ...commentary.seedLineReasons };
    setParagraphs(nextParagraphs);
    setReasons(nextReasons);
    setBusy(true);
    setError("");
    try {
      const saved = await api.savePlanningCommentary({ paragraphs: nextParagraphs, lineReasons: nextReasons });
      setCommentary(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const saved = await api.approvePlanningCommentary();
      setCommentary(saved);
      setParagraphs(saved.paragraphs.map((item) => ({ ...item })));
      setReasons({ ...saved.lineReasons });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selected = budget?.detail?.find((version) => version.id === versionId) || budget?.detail?.[0];
  const months = selected
    ? budget.periods.map((period) => summarise(selected.monthly[period]))
    : [];
  const fy = summarise(selected?.fyTotal);
  const slice = variance?.[column];
  const drivers = budget?.drivers;

  return (
    <div>
      <PageIntro title="Budgets" lede="FY2027 plan for Purple Hat Demo, with December 2026 against the approved budget.">
        <Button
          type="button"
          variant="secondary"
          onClick={() => download(
            view === "setup" ? "/api/me/planning/budgets/2027/xlsx" : "/api/me/planning/budget-vs-actual/2026-12/xlsx",
            view === "setup" ? "PurpleHatDemo_Budget_FY2027.xlsx" : "PurpleHatDemo_BudgetVsActual_2026-12.xlsx",
          )}
        >
          Download to Excel
        </Button>
      </PageIntro>
      <DataChips
        real="December 2026 actuals and the FY2026 year-to-date result."
        illustrative="The FY2027 budget, the Q1 reforecast, and the commentary draft."
      />
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      <div className="mt-4 max-w-xl">
        <SegmentedPills
          label="Budget view"
          value={view}
          onChange={setView}
          options={[
            { id: "setup", label: "Setup & approval" },
            { id: "actual", label: "Budget vs actual" },
          ]}
        />
      </div>

      {!budget || !variance || !commentary ? null : view === "setup" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {budget.versions.map((version) => (
              <Card key={version.id} className="!p-4">
                <p className="font-display text-xs font-semibold tracking-[0.12em] text-heading">{version.label}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{versionStatus(version)}</p>
                <p className="mt-3 text-sm text-mute">Net revenue {planMoney(version.netRevenue)}</p>
                <p className="text-sm text-mute">Net income {planMoney(version.netIncome)}</p>
                {version.note ? <p className="mt-2 text-sm text-mute">{version.note}</p> : null}
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-display text-xl font-bold text-heading">Drivers</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-mute">Revenue growth</dt><dd>{drivers.revenueGrowthPct}%</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Seasonality</dt><dd className="text-right">{drivers.seasonality}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Gross margin, FY2026</dt><dd>{drivers.fy2026Actual.grossMarginPct}%</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Product cost</dt><dd>{drivers.productCostPctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Fulfilment</dt><dd>{drivers.fulfilmentPctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Card fees</dt><dd>{drivers.cardFeesPctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Packaging</dt><dd>{drivers.packagingPctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Shipping income</dt><dd>{drivers.shippingIncomePctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Returns</dt><dd>{drivers.returnsPctOfSales}% of sales</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Marketing</dt><dd>{drivers.marketingPctOfRevenue}% of revenue · ROAS {drivers.targetROAS}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Wages</dt><dd>{planMoney(drivers.wagesMonthly)} · Oct–Dec {planMoney(drivers.wagesMonthlyOctDec)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Rent, software, office</dt><dd>{planMoney(drivers.warehouseRentMonthly)} · {planMoney(drivers.softwareMonthly)} · {planMoney(drivers.officeMonthly)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">Insurance</dt><dd>{planMoney(drivers.insuranceQuarterly)} a quarter</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-mute">FY2026 actual</dt><dd>{planMoney(drivers.fy2026Actual.netRevenue)} revenue · {planMoney(drivers.fy2026Actual.netIncome)} income</dd></div>
              </dl>
            </Card>
            <Card>
              <h2 className="font-display text-xl font-bold text-heading">Approval trail</h2>
              <div className="mt-3 space-y-4 text-sm">
                {budget.versions.map((version) => (
                  <div key={version.id}>
                    <p className="font-semibold text-ink">{version.label} · {versionStatus(version)}</p>
                    {version.preparedBy ? <p className="text-mute">Prepared by {version.preparedBy}{version.preparedAt ? ` · ${version.preparedAt}` : ""}</p> : null}
                    {version.reviewedBy ? <p className="text-mute">Reviewed by {version.reviewedBy}{version.reviewedAt ? ` · ${version.reviewedAt}` : ""}</p> : null}
                    {version.approvedBy ? <p className="text-mute">Approved by {version.approvedBy}{version.approvedAt ? ` · ${version.approvedAt}` : ""}</p> : null}
                    {!version.preparedBy && version.approvedAt ? <p className="text-mute">Approved {version.approvedAt}</p> : null}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-xl font-bold text-heading">Monthly budget</h2>
              <div className="w-full sm:max-w-md">
                <SegmentedPills
                  label="Budget version"
                  value={versionId}
                  onChange={setVersionId}
                  options={budget.detail.map((version) => ({ id: version.id, label: version.label }))}
                />
              </div>
            </div>
            <p className="mb-3 text-sm text-mute">Other fixed is software, warehouse rent, insurance, and office. Totals are recalculated from the input lines.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-right font-display text-xs tracking-[0.08em] text-heading">
                    <th className="py-2 text-left font-semibold">Line</th>
                    {budget.periods.map((period) => <th key={period} className="px-2 py-2 font-semibold">{monthLabel(period)}</th>)}
                    <th className="px-2 py-2 font-semibold">FY</th>
                  </tr>
                </thead>
                <tbody>
                  {GRID_ROWS.map(([key, label, strong]) => (
                    <tr key={key} className={strong ? "bg-[var(--row-total-bg)] font-semibold text-[var(--row-total-text)]" : ""}>
                      <td className="py-1.5">{label}</td>
                      {months.map((month, index) => (
                        <td key={budget.periods[index]} className="px-2 py-1.5 text-right tabular-nums">{planMoney(month?.[key])}</td>
                      ))}
                      <td className="px-2 py-1.5 text-right tabular-nums">{planMoney(fy?.[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="max-w-md">
            <SegmentedPills
              label="Actual period"
              value={column}
              onChange={setColumn}
              options={[
                { id: "month", label: "Month" },
                { id: "ytd", label: "YTD" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Net revenue"
              value={planMoney(slice.kpis.netRevenue.actual)}
              detail={`Budget ${planMoney(slice.kpis.netRevenue.budget)}`}
            />
            <KpiCard
              label="Gross margin"
              value={planPercent(slice.kpis.grossMargin.actual)}
              detail={`${planPercent(slice.kpis.grossMargin.budget)} budget · ${onPlan(slice.kpis.grossMargin.actual, slice.kpis.grossMargin.budget)}`}
            />
            <KpiCard
              label="Net income"
              value={planMoney(slice.kpis.netIncome.actual)}
              detail={`Budget ${planMoney(slice.kpis.netIncome.budget)}`}
            />
            <KpiCard
              label="Lines flagged red"
              value={String(variance.month.kpis.redCount)}
              detail={variance.month.kpis.redLines.map((line) => line.label).join(", ") || "None"}
            />
          </div>
          <Card>
            <h2 className="mb-3 font-display text-xl font-bold text-heading">
              {column === "month" ? "December 2026" : "Year to date, December 2026"} · {variance.budgetVersion.label}
            </h2>
            <VarianceTable rows={slice.rows} />
          </Card>
          <CommentaryEditor
            paragraphs={paragraphs}
            reasons={reasons}
            redLines={variance.month.kpis.redLines}
            status={commentary.status}
            approvedBy={commentary.approvedBy}
            approvedAt={commentary.approvedAt}
            busy={busy}
            onParagraph={(index, text) => setParagraphs((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, text } : item)))}
            onReason={(key, text) => setReasons((current) => ({ ...current, [key]: text }))}
            onSave={save}
            onReset={resetDraft}
            onApprove={approve}
          />
          <Card>
            <h2 className="font-display text-xl font-bold text-heading">Review trail</h2>
            <p className="mt-2 text-sm text-mute">December 2026 actuals come from the demo management-report pack. The comparison budget is {variance.budgetVersion.label}, {versionStatus(variance.budgetVersion)}. This screen does not read a live ledger.</p>
            <p className="mt-2 text-sm text-mute">Commentary started as {commentary.draftedBy}. {commentary.status === "approved" ? `Approved by ${commentary.approvedBy}.` : "It is still a draft until you approve it."}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
