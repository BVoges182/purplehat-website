import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadAuthorized } from "../api";
import { useAuth } from "../auth";
import ManagementReportView from "../components/ManagementReportView";
import { Alert, Button } from "../components/ui";
import { reportPdfName } from "../reportMoney";

export default function ReportDocument() {
  const { id, month } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [reportTemplate, setReportTemplate] = useState("wealth-tech");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = id ? api.userReport(id, month) : api.report(month);
    load
      .then((data) => {
        if (stop) return;
        setReport(data.report);
        setBusinessName(data.businessName || "");
        setReportTemplate(data.reportTemplate === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech");
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [id, month]);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const path = id
        ? `/api/admin/users/${id}/reports/${month}/pdf`
        : `/api/me/reports/${month}/pdf`;
      const name = reportPdfName(businessName || user.businessName, month);
      await downloadAuthorized(path, name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const backTo = id ? `/admin/users/${id}` : "/reports";
  const backLabel = id ? "Back to client" : "Back to Management Reports";

  return (
    <div>
      <Link className="text-sm font-semibold text-plum" to={backTo}>{backLabel}</Link>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      {!report && !error ? <p className="mt-6 text-mute">Loading report…</p> : null}
      {report ? (
        <div className="mt-4">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-neutral-950 sm:text-4xl">{report.title}</h1>
              {report.periodLabel ? <p className="mt-2 max-w-2xl text-neutral-500">{report.periodLabel}</p> : null}
            </div>
            <Button type="button" variant="ghost" disabled={busy} onClick={download}>Download PDF</Button>
          </div>
          {report.entityName ? (
            <p className="-mt-2 mb-6 text-sm text-neutral-500">{report.entityName}</p>
          ) : null}
          <ManagementReportView report={report} template={reportTemplate} />
        </div>
      ) : null}
    </div>
  );
}
