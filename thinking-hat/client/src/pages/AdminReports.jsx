import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import AdminReportList from "../components/AdminReportList";
import { Alert, Button, Card, Field, PageIntro, inputClass } from "../components/ui";
import { reportMonthLabel } from "../reportMoney";

export default function AdminReports() {
  const [params] = useSearchParams();
  const fileRef = useRef(null);
  const [clients, setClients] = useState(null);
  const [reports, setReports] = useState(null);
  const [userId, setUserId] = useState(params.get("client") || "");
  const [listClient, setListClient] = useState(params.get("client") || "");
  const [month, setMonth] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [replaceAsk, setReplaceAsk] = useState(null);

  useEffect(() => {
    let stop = false;
    Promise.all([api.users(), api.adminReports()])
      .then(([people, reportData]) => {
        if (stop) return;
        const nextClients = (people.users || []).filter((user) => user.role === "client");
        setClients(nextClients);
        setReports(reportData.reports || []);
        const known = (current) => (nextClients.some((user) => String(user.id) === String(current)) ? current : "");
        setUserId(known);
        setListClient(known);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  function clientName(id) {
    const client = (clients || []).find((user) => String(user.id) === String(id));
    return client ? (client.businessName || client.name) : "that client";
  }

  const visibleReports = (reports || []).filter((report) => !listClient || String(report.userId) === String(listClient));
  const listedClient = (clients || []).find((client) => String(client.id) === String(listClient)) || null;

  async function submit(event, replace = false) {
    event?.preventDefault();
    setError("");
    setMessage("");
    const chosenId = replaceAsk?.userId || userId;
    const chosenMonth = replaceAsk?.month || month;
    const chosenFile = replaceAsk?.file || file;
    if (!chosenId) {
      setError("Choose a client.");
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chosenMonth)) {
      setError("Choose a report month.");
      return;
    }
    if (!chosenFile) {
      setError("Choose an Excel file.");
      return;
    }
    setBusy(true);
    try {
      const data = await api.uploadReport(chosenId, chosenMonth, chosenFile, replace);
      setReports((current) => {
        const rest = (current || []).filter((item) => !(String(item.userId) === String(data.report.userId) && item.month === data.report.month));
        return [data.report, ...rest].sort((a, b) => {
          if (a.month !== b.month) return a.month < b.month ? 1 : -1;
          return String(a.businessName || a.name || "").localeCompare(String(b.businessName || b.name || ""));
        });
      });
      setReplaceAsk(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      const savedMonth = reportMonthLabel(data.report.month);
      const savedClient = data.report.businessName || data.report.name;
      setMessage(data.replaced ? `${savedMonth} replaced for ${savedClient}.` : `${savedMonth} saved for ${savedClient}.`);
    } catch (err) {
      if (err.status === 409 && !replace) {
        setReplaceAsk({
          userId: chosenId,
          month: chosenMonth,
          file: chosenFile,
          message: err.message,
        });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro
        title="Management Reports"
        lede="Upload a monthly workbook for a client. Each month is stored on its own."
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {message ? <div className="mb-4"><Alert tone="ok">{message}</Alert></div> : null}
      <Card>
        <h2 className="font-display text-xl font-extrabold text-ink">Upload Excel</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => submit(event, false)}>
          <Field label="Client">
            <select className={inputClass} value={userId} onChange={(event) => { setUserId(event.target.value); setReplaceAsk(null); }} required>
              <option value="">Choose a client</option>
              {(clients || []).map((client) => (
                <option key={client.id} value={client.id}>{client.businessName || client.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Report month" hint={month ? reportMonthLabel(month) : "For example, September 2026 or October 2026."}>
            <input className={inputClass} type="month" value={month} onChange={(event) => { setMonth(event.target.value); setReplaceAsk(null); }} required />
          </Field>
          <Field label="Excel file" hint="Executive summary, with contact tables when the sheet includes them, plus Profit and loss, Balance sheet, and Statement of cash flows.">
            <input
              ref={fileRef}
              className={inputClass}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => { setFile(event.target.files?.[0] || null); setReplaceAsk(null); }}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !clients}>Upload Excel</Button>
          </div>
        </form>
        {replaceAsk ? (
          <div className="mt-4 rounded-2xl border border-[rgba(109,40,217,0.12)] bg-[#f5f0ff] px-4 py-3">
            <p className="text-sm text-ink">{replaceAsk.message || `${clientName(replaceAsk.userId)} already has a report for ${reportMonthLabel(replaceAsk.month)}. Replace it?`}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => submit(null, true)}>Replace report</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setReplaceAsk(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </Card>
      <Card className="mt-4">
        <h2 className="font-display text-xl font-extrabold text-ink">Reports</h2>
        <div className="mt-4 max-w-md">
          <Field label="Client">
            <select
              className={inputClass}
              aria-label="Show reports for"
              value={listClient}
              onChange={(event) => setListClient(event.target.value)}
            >
              <option value="">All clients</option>
              {(clients || []).map((client) => (
                <option key={client.id} value={client.id}>{client.businessName || client.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {listedClient?.templateName ? (
          <p className="mt-3 text-sm font-semibold text-ink">Template: {listedClient.templateName}</p>
        ) : null}
        {reports ? (
          visibleReports.length ? (
            <AdminReportList
              reports={visibleReports}
              showClient={!listClient}
              onDeleted={(report) => {
                setReports((current) => (current || []).filter((item) => !(String(item.userId) === String(report.userId) && item.month === report.month)));
                setMessage(`${reportMonthLabel(report.month)} deleted for ${report.businessName || report.name}.`);
              }}
            />
          ) : (
            <p className="mt-4 text-sm text-mute">{listClient ? `No reports for ${clientName(listClient)} yet.` : "No management reports yet."}</p>
          )
        ) : (
          <p className="mt-4 text-sm text-mute">Loading reports…</p>
        )}
      </Card>
    </div>
  );
}
