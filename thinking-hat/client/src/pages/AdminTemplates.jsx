import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Alert, Button, Card, Field, PageIntro, WarningList, inputClass } from "../components/ui";
import { reportMonthLabel } from "../reportMoney";
import { reportTemplateName } from "../reportTemplates";

export default function AdminTemplates() {
  const [templates, setTemplates] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [copyName, setCopyName] = useState("");
  const [rename, setRename] = useState("");
  const [file, setFile] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function refresh() {
    const [templateData, people] = await Promise.all([api.templates(), api.users()]);
    const list = templateData.templates || [];
    setTemplates(list);
    setClients((people.users || []).filter((user) => user.role === "client"));
    return list;
  }

  useEffect(() => {
    let stop = false;
    refresh()
      .then((list) => {
        if (stop || !list.length) return;
        setSelectedId(String(list[0].id));
        setSourceId(String(list[0].id));
        setRename(list[0].name);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  const selected = (templates || []).find((item) => String(item.id) === String(selectedId)) || null;
  const using = selected ? clients.filter((client) => client.templateId === selected.id) : [];

  function choose(id) {
    const template = (templates || []).find((item) => String(item.id) === String(id));
    setSelectedId(id);
    setRename(template?.name || "");
    setConfirmDelete(false);
    setError("");
    setNotice("");
  }

  async function onCopy(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.copyTemplate({ sourceId: Number(sourceId), name: copyName });
      await refresh();
      setSelectedId(String(data.template.id));
      setRename(data.template.name);
      setCopyName("");
      setNotice(`${data.template.name} is ready. Choose it when you invite that client.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function fileName(format) {
    const safe = String(selected?.name || "template").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
    return `${safe}-template.${format === "csv" ? "csv" : "txt"}`;
  }

  async function onDownload(format) {
    if (!selected) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.downloadTemplate(selected.id, format, fileName(format));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV or text file.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.uploadTemplate(file);
      await refresh();
      setSelectedId(String(data.template.id));
      setRename(data.template.name);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      const count = data.clientsUpdated || 0;
      const follow = count === 0
        ? "Invite a client with this template when you want them to use it."
        : count === 1
          ? "1 client dashboard and management report now follow this file."
          : `${count} client dashboards and management reports now follow this file.`;
      setNotice(`Uploaded ${data.template.name}. ${follow}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(event) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.renameTemplate(selected.id, { name: rename });
      await refresh();
      setRename(data.template.name);
      setNotice("Name saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    const removed = selected;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.deleteTemplate(removed.id);
      const list = await refresh();
      const next = list.find((item) => item.id !== removed.id) || null;
      setSelectedId(next ? String(next.id) : "");
      setRename(next?.name || "");
      setSourceId((current) => (String(current) === String(removed.id) ? (next ? String(next.id) : "") : current));
      setConfirmDelete(false);
      setNotice(`${removed.name} was deleted. Clients keep the dashboard and reports already on their accounts.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro title="Client templates" lede="Copy a template and name it for the new client. Their invite starts from that copy, and later changes stay on their own books." />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="note">{notice}</Alert></div> : null}
      {!templates && !error ? <p className="text-mute">Loading templates…</p> : null}
      {templates ? (
        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-xl font-extrabold text-ink">Copy a template</h2>
            <form className="mt-4 space-y-4" onSubmit={onCopy}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Copy from" hint="The copy keeps this dashboard and starts with no reports.">
                  <select className={inputClass} value={sourceId} onChange={(event) => setSourceId(event.target.value)} required>
                    <option value="">Choose a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="New template name" hint="Name it for the client you want to add.">
                  <input className={inputClass} value={copyName} onChange={(event) => setCopyName(event.target.value)} maxLength={120} required />
                </Field>
              </div>
              <Button type="submit" disabled={busy || !sourceId}>{busy ? "Working…" : "Copy template"}</Button>
            </form>
          </Card>
          {selected ? (
            <Card>
              <Field label="Client template">
                <select className={inputClass} value={selected.id} onChange={(event) => choose(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </Field>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onRename}>
                <div className="min-w-0 flex-1">
                  <Field label="Template name" hint={selected.copiedFromName ? "Rename this copy. The template you copied from stays as it is." : "This is the name you pick when you invite a client."}>
                    <input className={inputClass} value={rename} onChange={(event) => setRename(event.target.value)} maxLength={120} required />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="quiet" disabled={busy}>Save name</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => { setError(""); setNotice(""); setConfirmDelete(true); }}>Delete</Button>
                </div>
              </form>
              {confirmDelete ? (
                <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <p className="text-sm text-rose-900">
                    Delete {selected.name}? {using.length === 0
                      ? "No clients are using it."
                      : using.length === 1
                        ? `${using[0].businessName || using[0].name} keeps the dashboard and management reports already on the account.`
                        : `${using.map((client) => client.businessName || client.name).join(", ")} keep the dashboard and management reports already on their accounts.`} This removes the template from the list, so it cannot be chosen for a new invite.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" disabled={busy} onClick={onDelete}>Delete template</Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
              <h2 className="mt-6 font-display text-xl font-extrabold text-ink">{selected.name}</h2>
              <p className="mt-1 text-sm text-mute">Dashboard and management reports: {reportTemplateName(selected.reportTemplate)}.</p>
              {selected.reviewWarnings?.length ? (
                <div className="mt-4">
                  <WarningList warnings={selected.reviewWarnings} heading="Review this template before you use it." />
                </div>
              ) : null}
              {selected.copiedFromName ? (
                <p className="mt-1 text-sm text-mute">Copied from {selected.copiedFromName}. This copy is separate from that template.</p>
              ) : selected.sourceBusiness && selected.sourceBusiness !== selected.name ? (
                <p className="mt-1 text-sm text-mute">Saved from {selected.sourceBusiness}.</p>
              ) : null}
              <h3 className="mt-5 font-display text-sm font-extrabold text-ink">Clients using this template</h3>
              {using.length === 0 ? <p className="mt-2 text-sm text-mute">No clients are using this template yet.</p> : (
                <ul className="mt-2 space-y-1">
                  {using.map((client) => (
                    <li key={client.id} className="text-sm text-ink">{client.businessName || client.name}</li>
                  ))}
                </ul>
              )}
              <h3 className="mt-5 font-display text-sm font-extrabold text-ink">Reports</h3>
              {selected.reports.length === 0 ? <p className="mt-2 text-sm text-mute">No reports in this template.</p> : (
                <ul className="mt-2 space-y-1">
                  {selected.reports.map((report) => (
                    <li key={report.month} className="text-sm text-ink">{reportMonthLabel(report.month)}</li>
                  ))}
                </ul>
              )}
              <h3 className="mt-5 font-display text-sm font-extrabold text-ink">Dashboard</h3>
              <p className="mt-2 text-sm text-mute">Headline figures and the six-month chart come from these reports.</p>
              {selected.movements.length === 0 ? <p className="mt-2 text-sm text-mute">No recent movements saved.</p> : (
                <ul className="mt-2 space-y-1">
                  {selected.movements.map((movement) => (
                    <li key={movement} className="text-sm text-ink">{movement}</li>
                  ))}
                </ul>
              )}
              <div className="mt-6 border-t border-[rgba(109,40,217,0.08)] pt-5">
                <h3 className="font-display text-sm font-extrabold text-ink">Template file</h3>
                <p className="mt-1 text-sm text-mute">Download {selected.name} as a CSV or a text file, then upload that file on the live site. Clients using the template get this dashboard and these management reports.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => onDownload("csv")}>Download CSV</Button>
                  <Button type="button" variant="quiet" disabled={busy} onClick={() => onDownload("text")}>Download text</Button>
                </div>
                <form className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={onUpload}>
                  <Field label="Upload a template" hint="CSV or text. A file for an existing template replaces it. A new name adds a template.">
                    <input
                      ref={fileRef}
                      className={inputClass}
                      type="file"
                      accept=".csv,.txt,.json,text/csv,text/plain"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />
                  </Field>
                  <Button type="submit" disabled={busy}>Upload template</Button>
                </form>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
