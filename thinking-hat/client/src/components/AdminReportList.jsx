import { useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadAuthorized } from "../api";
import { Alert, Button } from "./ui";
import { reportMonthLabel, reportPdfName } from "../reportMoney";

export default function AdminReportList({ reports, showClient = false, onDeleted }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");

  async function download(report) {
    setDownloading(`${report.userId}-${report.month}`);
    setError("");
    try {
      await downloadAuthorized(
        `/api/admin/users/${report.userId}/reports/${report.month}/pdf`,
        reportPdfName(report.businessName || report.name, report.month),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteReport(pending.userId, pending.month);
      const removed = pending;
      setPending(null);
      onDeleted(removed);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!reports.length) {
    return <p className="mt-4 text-sm text-mute">No management reports yet.</p>;
  }

  return (
    <div>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      {pending ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
          <p className="text-sm text-rose-900">
            Delete the {reportMonthLabel(pending.month)} report for {pending.businessName || pending.name}? This removes that month only.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={confirmDelete}>Delete report</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      <ul className="mt-2">
        {reports.map((report) => (
          <li key={`${report.userId}-${report.month}`} className="flex flex-col gap-3 border-t border-[rgba(109,40,217,0.08)] py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <Link to={`/admin/users/${report.userId}/reports/${report.month}`} className="min-w-0">
              {showClient ? <p className="text-sm font-semibold text-plum">{report.businessName || report.name}</p> : null}
              <p className="font-display text-lg font-extrabold text-ink">{reportMonthLabel(report.month)}</p>
              <p className="mt-1 text-sm text-mute">{report.periodLabel}</p>
            </Link>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" disabled={downloading === `${report.userId}-${report.month}`} onClick={() => download(report)}>Download PDF</Button>
              <Button type="button" variant="ghost" onClick={() => { setError(""); setPending(report); }}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
