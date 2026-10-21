import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { FrameworkBadge, ReviewFlag, SectionChips } from "../components/templateBuilderUi";
import { Alert, Button, Card, Field, PageIntro, formatDate, inputClass } from "../components/ui";

const emptyClient = {
  name: "",
  framework: "us-gaap",
  currency: "USD",
  yearEnd: "12-31",
  period: "monthly",
};

function preferredClientId(clients, requested) {
  if (requested && clients.some((client) => String(client.id) === String(requested))) return String(requested);
  const demo = clients.find((client) => /purple\s*hat\s*demo/i.test(client.name));
  return String((demo || clients[0] || {}).id || "");
}

function IconOpen() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M11 3h6v6h-2V6.41l-6.3 6.3-1.4-1.42L13.58 5H11V3zM4 5h6v2H6v7h7v-4h2v6H4V5z" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M13.2 2.8a2 2 0 0 1 2.8 2.8l-8.1 8.2-3.5.7.7-3.5 8.1-8.2zM3.5 16h13v1.8h-13V16z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M7.5 2h5l1 2H17v1.8H3V4h3.5l1-2zM5 7h1.8v9H5V7zm4.1 0H11v9H9.1V7zM13.2 7H15v9h-1.8V7zM4.2 6.2h11.6l-.9 11.3H5.1L4.2 6.2z" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M10 2.2v8.1l2.2-2.2 1.3 1.3L10 13.9 6.5 9.4l1.3-1.3L10 10.3V2.2zM3.8 15.2h12.4V17H3.8v-1.8z" />
    </svg>
  );
}

const rowActionClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border bg-white px-3 font-display text-sm font-extrabold transition";
const quietActionClass = `${rowActionClass} border-[rgba(109,40,217,0.12)] text-ink hover:bg-[#f5f3ff]`;
const deleteActionClass = `${rowActionClass} border-rose-600 text-rose-700 hover:bg-rose-50`;

function TemplateActions({ clientId, template, canManage, onEdit, onDownload, onDelete }) {
  return (
    <div className="inline-flex flex-nowrap items-center justify-end gap-2">
      <Link
        to={`/admin/template-builder/${clientId}/templates/${template.id}`}
        className={quietActionClass}
        title="Open template"
        aria-label={`Open ${template.name}`}
      >
        <IconOpen /> Open
      </Link>
      {canManage ? (
        <button type="button" className={quietActionClass} title="Rename template" aria-label={`Rename ${template.name}`} onClick={() => onEdit(template)}>
          <IconEdit /> Edit
        </button>
      ) : null}
      {canManage ? (
        <button type="button" className={quietActionClass} title="Download CSV" aria-label={`Download CSV for ${template.name}`} onClick={() => onDownload(template)}>
          <IconDownload /> Download CSV
        </button>
      ) : null}
      {canManage ? (
        <button type="button" className={deleteActionClass} title="Delete template" aria-label={`Delete ${template.name}`} onClick={() => onDelete(template)}>
          <IconDelete /> Delete
        </button>
      ) : null}
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-card" role="status">
      {message}
    </div>
  );
}

function Modal({ title, lede, onClose, children }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-[rgba(42,21,72,0.35)] px-4 py-8" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[rgba(109,40,217,0.12)] bg-white p-6 shadow-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="builder-dialog-title" className="font-display text-2xl font-extrabold text-ink">{title}</h2>
        {lede ? <p className="mt-1 text-sm text-mute">{lede}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminTemplateBuilder() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientForm, setClientForm] = useState(null);
  const [templateForm, setTemplateForm] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [confirmClient, setConfirmClient] = useState(false);
  const [botsOpen, setBotsOpen] = useState(false);
  const [botForm, setBotForm] = useState({ id: null, name: "", fileId: "" });
  const [botError, setBotError] = useState("");
  const [botToRemove, setBotToRemove] = useState(null);
  const fileRef = useRef(null);

  const requested = searchParams.get("client") || "";

  async function refresh() {
    const data = await api.templateBuilder();
    setCatalog(data);
    return data;
  }

  useEffect(() => {
    let stop = false;
    refresh()
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const clients = catalog?.clients || [];
  const bots = catalog?.bots || [];
  const options = catalog?.options;
  const selectedId = preferredClientId(clients, requested);
  const selected = clients.find((client) => String(client.id) === selectedId) || null;
  const assignedBot = bots.find((bot) => bot.id === selected?.grokBotId) || null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) => client.name.toLowerCase().includes(needle));
  }, [clients, query]);

  function choose(id) {
    const next = new URLSearchParams(searchParams);
    next.set("client", String(id));
    setSearchParams(next, { replace: true });
    setError("");
    setNotice("");
  }

  function openClientForm() {
    setClientForm({ ...emptyClient });
    setError("");
  }

  function openTemplateForm() {
    if (!selected) return;
    setTemplateForm({
      name: "",
      framework: selected.framework,
      period: selected.period,
    });
    setError("");
  }

  async function onCreateClient(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.createBuilderClient(clientForm);
      await refresh();
      setClientForm(null);
      choose(data.client.id);
      setNotice(`${data.client.name} is ready. Add a template when you want to build their pack.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateTemplate(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.createBuilderTemplate(selected.id, templateForm);
      await refresh();
      setTemplateForm(null);
      const review = data.template.needsReview ? " It needs review before use." : "";
      setNotice(`${data.template.name} was added.${review}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openCopy() {
    const first = clients
      .filter((client) => String(client.id) !== String(selected?.id))
      .flatMap((client) => client.templates)[0];
    setCopySource(first ? String(first.id) : "");
    setCopyOpen(true);
    setError("");
  }

  async function onCopy(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.copyBuilderTemplate(selected.id, Number(copySource));
      await refresh();
      setCopyOpen(false);
      setNotice(`${data.template.name} was copied and flagged for review.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openRename(template) {
    setRenameTarget(template);
    setRenameName(template.name);
    setRenameError("");
    setError("");
  }

  async function onRename(event) {
    event.preventDefault();
    if (!selected || !renameTarget) return;
    setBusy(true);
    setRenameError("");
    try {
      await api.renameBuilderTemplate(selected.id, renameTarget.id, renameName);
      await refresh();
      setRenameTarget(null);
      setToast("Template renamed");
    } catch (err) {
      setRenameError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadCsv(template) {
    setError("");
    const safe = String(template?.name || "template").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
    try {
      await api.downloadTemplate(template.id, "csv", `${safe}-template.csv`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDelete(template) {
    if (!selected) return;
    setDeleteTarget(template);
    setUsage(null);
    setDeleteError("");
    setUsageLoading(true);
    setError("");
    try {
      const data = await api.builderTemplateUsage(selected.id, template.id);
      setUsage(data);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setUsageLoading(false);
    }
  }

  async function onDeleteClient() {
    if (!selected) return;
    const removedId = selected.id;
    setBusy(true);
    setError("");
    try {
      await api.deleteBuilderClient(removedId);
      await refresh();
      const next = new URLSearchParams(searchParams);
      if (next.get("client") === String(removedId)) next.delete("client");
      setSearchParams(next, { replace: true });
      setConfirmClient(false);
      setToast("Client deleted");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!selected || !deleteTarget) return;
    setBusy(true);
    setDeleteError("");
    try {
      await api.archiveBuilderTemplate(selected.id, deleteTarget.id);
      await refresh();
      setDeleteTarget(null);
      setToast("Template deleted");
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function botName(client) {
    return bots.find((bot) => bot.id === client.grokBotId)?.name || "";
  }

  function openBots() {
    setBotForm({ id: null, name: "", fileId: "" });
    setBotError("");
    setBotToRemove(null);
    setBotsOpen(true);
  }

  async function onAssignBot(value) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.assignBuilderBot(selected.id, value ? Number(value) : null);
      await refresh();
      setToast(value ? "Grok bot assigned" : "No Grok bot assigned");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveBot(event) {
    event.preventDefault();
    setBusy(true);
    setBotError("");
    try {
      if (botForm.id) await api.updateGrokBot(botForm.id, { name: botForm.name, fileId: botForm.fileId });
      else await api.createGrokBot({ name: botForm.name, fileId: botForm.fileId });
      await refresh();
      setBotForm({ id: null, name: "", fileId: "" });
      setToast(botForm.id ? "Bot updated" : "Bot added");
    } catch (err) {
      setBotError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveBot() {
    if (!botToRemove) return;
    setBusy(true);
    setBotError("");
    try {
      await api.deleteGrokBot(botToRemove.id);
      await refresh();
      if (botForm.id === botToRemove.id) setBotForm({ id: null, name: "", fileId: "" });
      setBotToRemove(null);
      setToast("Bot removed");
    } catch (err) {
      setBotError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api.importBuilderTemplate(selected.id, file);
      await refresh();
      const review = data.template.needsReview ? " It is flagged for review." : "";
      setNotice(`Imported ${data.template.name}.${review}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const copyChoices = clients
    .filter((client) => String(client.id) !== String(selected?.id))
    .flatMap((client) => client.templates.map((template) => ({ client, template })));

  return (
    <div>
      <PageIntro
        title="Client Template Builder"
        lede="Choose a client, then open or start a report template. The drag-and-drop builder comes later."
      />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="ok">{notice}</Alert></div> : null}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold text-ink">Clients</h2>
            <Button type="button" className="!min-h-10 !px-4" onClick={openClientForm}>+ New client</Button>
          </div>
          <label className="mb-3 block">
            <span className="sr-only">Search clients</span>
            <input
              className={inputClass}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients"
              autoComplete="off"
            />
          </label>
          {!catalog ? <p className="px-1 py-6 text-sm text-mute">Loading clients…</p> : null}
          {catalog && clients.length === 0 ? (
            <p className="rounded-2xl bg-[#f5f0ff] px-4 py-6 text-sm text-ink">No clients yet. Create one to start a template.</p>
          ) : null}
          {catalog && clients.length > 0 && shown.length === 0 ? (
            <p className="rounded-2xl bg-[#f5f0ff] px-4 py-6 text-sm text-ink">No clients match that search.</p>
          ) : null}
          <ul className="max-h-80 space-y-2 overflow-y-auto lg:max-h-[calc(100vh-22rem)]">
            {shown.map((client) => {
              const on = String(client.id) === selectedId;
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => choose(client.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${on ? "border-plum bg-[#f5f0ff]" : "border-[rgba(109,40,217,0.1)] bg-white hover:bg-[#fbfaff]"}`}
                    aria-current={on ? "true" : undefined}
                  >
                    <span className="block font-semibold text-ink">{client.name}</span>
                    <span className="mt-1 block text-xs text-mute">{botName(client) || "No Grok bot"}</span>
                    <span className="mt-2 inline-flex"><FrameworkBadge label={client.frameworkLabel} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={openClientForm}
            className="mt-3 w-full rounded-2xl border border-dashed border-[rgba(109,40,217,0.35)] bg-[#fbfaff] px-4 py-4 text-left hover:bg-[#f5f0ff]"
          >
            <span className="block font-display text-base font-extrabold text-plum">+ Create new client</span>
            <span className="mt-1 block text-sm text-mute">Add a business and its reporting setup.</span>
          </button>
        </Card>

        <Card className="min-w-0 max-w-full overflow-hidden">
          {!catalog ? (
            <p className="py-10 text-center text-mute">Loading templates…</p>
          ) : !selected ? (
            <div className="py-10 text-center">
              <h2 className="font-display text-2xl font-extrabold text-ink">No client selected</h2>
              <p className="mx-auto mt-2 max-w-md text-mute">Create a client to see their templates here.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">{selected.name}</h2>
                    <FrameworkBadge label={selected.frameworkLabel} />
                  </div>
                  <p className="mt-2 text-sm text-mute">
                    {selected.currency} · Year end {selected.yearEndLabel} · {selected.periodLabel}
                  </p>
                  <div className="mt-4 max-w-md">
                    <Field label="Grok bot assigned" hint="One bot for this client, or none. That bot's file feeds both dashboard cards.">
                      <select
                        className={inputClass}
                        value={selected.grokBotId ? String(selected.grokBotId) : ""}
                        disabled={!canManage || busy}
                        onChange={(event) => onAssignBot(event.target.value)}
                      >
                        <option value="">None</option>
                        {bots.map((bot) => <option key={bot.id} value={String(bot.id)}>{bot.name}</option>)}
                      </select>
                    </Field>
                    {assignedBot?.fileId ? (
                      <p className="mt-2 break-all text-xs text-mute">Insights file: {assignedBot.fileId}</p>
                    ) : null}
                    {canManage ? (
                      <button type="button" className="mt-3 text-sm font-semibold text-plum" onClick={openBots}>
                        Add, edit, or remove bots
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={openTemplateForm} disabled={busy}>+ New template</Button>
                  {canManage ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-600 bg-white px-5 font-display text-sm font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Delete client"
                      disabled={busy}
                      onClick={() => { setError(""); setConfirmClient(true); }}
                    >
                      Delete client
                    </button>
                  ) : null}
                  <Button type="button" variant="ghost" onClick={openCopy} disabled={busy}>Copy existing</Button>
                  <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Import CSV</Button>
                  <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,.json" className="hidden" onChange={onImport} />
                </div>
              </div>
              {selected.templates.length === 0 ? (
                <div className="mt-8 rounded-2xl bg-[#f5f0ff] px-5 py-10 text-center">
                  <p className="font-display text-xl font-extrabold text-ink">No templates yet</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-mute">
                    This client has no templates. Create one, copy another client’s template, or import a CSV.
                  </p>
                </div>
              ) : (
                <>
                <ul className="mt-6 space-y-3 md:hidden">
                  {selected.templates.map((template) => (
                    <li key={template.id} className="rounded-2xl border border-[rgba(109,40,217,0.1)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{template.name}</span>
                        {template.needsReview ? <ReviewFlag reason={template.reviewReason} /> : null}
                      </div>
                      {template.needsReview ? <p className="mt-1 text-xs text-amber-800">{template.reviewReason}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <FrameworkBadge label={template.frameworkLabel} />
                        <span className="text-sm text-mute">{template.periodLabel}</span>
                      </div>
                      <div className="mt-3"><SectionChips chips={template.chips} /></div>
                      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                        <span className="text-sm text-mute">{formatDate(template.updatedAt)}</span>
                        <div className="overflow-x-auto">
                          <TemplateActions
                            clientId={selected.id}
                            template={template}
                            canManage={canManage}
                            onEdit={openRename}
                            onDownload={onDownloadCsv}
                            onDelete={openDelete}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 hidden max-w-full overflow-x-auto md:block">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[rgba(109,40,217,0.1)] text-xs font-bold uppercase tracking-wide text-mute">
                        <th className="px-3 py-3 font-bold">Template</th>
                        <th className="px-3 py-3 font-bold">Framework</th>
                        <th className="px-3 py-3 font-bold">Period</th>
                        <th className="px-3 py-3 font-bold">Sections</th>
                        <th className="px-3 py-3 font-bold">Updated</th>
                        <th className="sticky right-0 bg-white px-3 py-3 text-right font-bold"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.templates.map((template) => (
                        <tr key={template.id} className="border-b border-[rgba(109,40,217,0.08)] align-top">
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="whitespace-nowrap font-semibold text-ink">{template.name}</span>
                              {template.needsReview ? <ReviewFlag reason={template.reviewReason} /> : null}
                            </div>
                            {template.needsReview ? (
                              <p className="mt-1 max-w-xs text-xs text-amber-800">{template.reviewReason}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-4"><FrameworkBadge label={template.frameworkLabel} /></td>
                          <td className="px-3 py-4 text-sm text-ink">{template.periodLabel}</td>
                          <td className="px-3 py-4"><SectionChips chips={template.chips} /></td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-mute">{formatDate(template.updatedAt)}</td>
                          <td className="sticky right-0 whitespace-nowrap bg-white px-3 py-4 text-right">
                            <TemplateActions
                              clientId={selected.id}
                              template={template}
                              canManage={canManage}
                              onEdit={openRename}
                              onDownload={onDownloadCsv}
                              onDelete={openDelete}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </>
          )}
        </Card>
      </div>

      {clientForm ? (
        <Modal title="New client" lede="The client can exist here before they have a login." onClose={() => setClientForm(null)}>
          <form className="space-y-4" onSubmit={onCreateClient}>
            <Field label="Name">
              <input className={inputClass} value={clientForm.name} onChange={(event) => setClientForm({ ...clientForm, name: event.target.value })} required />
            </Field>
            <Field label="Accounting framework">
              <select className={inputClass} value={clientForm.framework} onChange={(event) => setClientForm({ ...clientForm, framework: event.target.value })}>
                {(options?.frameworks || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <select className={inputClass} value={clientForm.currency} onChange={(event) => setClientForm({ ...clientForm, currency: event.target.value })}>
                {(options?.currencies || []).map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Financial year end">
              <select className={inputClass} value={clientForm.yearEnd} onChange={(event) => setClientForm({ ...clientForm, yearEnd: event.target.value })}>
                {(options?.yearEnds || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Reporting period">
              <select className={inputClass} value={clientForm.period} onChange={(event) => setClientForm({ ...clientForm, period: event.target.value })}>
                {(options?.periods || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setClientForm(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Create client</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {templateForm ? (
        <Modal title="New template" lede={`For ${selected?.name || "this client"}. Currency and year end stay on the client.`} onClose={() => setTemplateForm(null)}>
          <form className="space-y-4" onSubmit={onCreateTemplate}>
            <Field label="Template name">
              <input className={inputClass} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} required />
            </Field>
            <Field label="Accounting framework">
              <select className={inputClass} value={templateForm.framework} onChange={(event) => setTemplateForm({ ...templateForm, framework: event.target.value })}>
                {(options?.frameworks || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Reporting period">
              <select className={inputClass} value={templateForm.period} onChange={(event) => setTemplateForm({ ...templateForm, period: event.target.value })}>
                {(options?.periods || []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setTemplateForm(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Create template</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmClient && selected ? (
        <Modal title="Delete client" onClose={() => { if (!busy) setConfirmClient(false); }}>
          <div className="space-y-4">
            <p className="text-sm text-ink">Delete client '{selected.name}'? This will also delete this client's templates. This can't be undone.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmClient(false)}>Cancel</Button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-600 bg-white px-5 font-display text-sm font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={onDeleteClient}
              >
                Delete client
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {renameTarget ? (
        <Modal title="Rename template" lede="Only the name changes. The template key and sections stay the same." onClose={() => setRenameTarget(null)}>
          <form className="space-y-4" onSubmit={onRename}>
            <Field label="Template name" hint="Required, up to 100 characters, and unique for this client.">
              <input
                className={inputClass}
                value={renameName}
                maxLength={100}
                autoFocus
                onChange={(event) => setRenameName(event.target.value)}
              />
            </Field>
            {renameError ? <Alert>{renameError}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Save</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal title="Delete template" onClose={() => { if (!busy) setDeleteTarget(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-ink">Delete template '{deleteTarget.name}'? This can't be undone.</p>
            {usageLoading ? <p className="text-sm text-mute">Checking management reports…</p> : null}
            {usage?.warning ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {usage.warning} Existing reports will still display.
              </p>
            ) : null}
            {deleteError ? <Alert>{deleteError}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-600 bg-white px-5 font-display text-sm font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy || usageLoading || Boolean(deleteError)}
                onClick={onDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {copyOpen ? (
        <Modal title="Copy existing" lede="The copy keeps the other client’s section layout and is flagged for review. Figures are not copied onto this client’s books." onClose={() => setCopyOpen(false)}>
          <form className="space-y-4" onSubmit={onCopy}>
            {copyChoices.length === 0 ? (
              <p className="text-sm text-mute">No other clients have a template to copy yet.</p>
            ) : (
              <Field label="Template">
                <select className={inputClass} value={copySource} onChange={(event) => setCopySource(event.target.value)}>
                  {copyChoices.map(({ client, template }) => (
                    <option key={template.id} value={template.id}>{client.name} — {template.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !copySource}>Copy template</Button>
            </div>
          </form>
        </Modal>
      ) : null}
      {botsOpen ? (
        <Modal title="Grok bots" lede="Each bot has a name and the Google Drive file that holds its weekly JSON." onClose={() => setBotsOpen(false)}>
          <form className="space-y-4" onSubmit={onSaveBot}>
            <Field label="Name">
              <input className={inputClass} value={botForm.name} onChange={(event) => setBotForm({ ...botForm, name: event.target.value })} required />
            </Field>
            <Field label="Insights file ID" hint="Google Drive file ID for this bot's weekly JSON.">
              <input className={inputClass} value={botForm.fileId} spellCheck={false} onChange={(event) => setBotForm({ ...botForm, fileId: event.target.value })} required />
            </Field>
            {botError ? <Alert>{botError}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              {botForm.id ? (
                <Button type="button" variant="ghost" onClick={() => setBotForm({ id: null, name: "", fileId: "" })}>Cancel edit</Button>
              ) : null}
              <Button type="submit" disabled={busy}>{botForm.id ? "Save bot" : "Add bot"}</Button>
            </div>
          </form>
          <ul className="mt-5 space-y-3">
            {bots.length === 0 ? <li className="text-sm text-mute">No bots yet.</li> : null}
            {bots.map((bot) => (
              <li key={bot.id} className="rounded-2xl border border-[rgba(109,40,217,0.1)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{bot.name}</p>
                    <p className="mt-1 break-all text-xs text-mute">{bot.fileId}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-sm font-semibold text-plum"
                      onClick={() => {
                        setBotToRemove(null);
                        setBotError("");
                        setBotForm({ id: bot.id, name: bot.name, fileId: bot.fileId });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="text-sm font-semibold text-rose-700" onClick={() => { setBotError(""); setBotToRemove(bot); }}>
                      Remove
                    </button>
                  </div>
                </div>
                {botToRemove?.id === bot.id ? (
                  <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-3">
                    <p className="text-sm text-rose-800">Remove {bot.name}? Clients using this bot will have none assigned.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" onClick={() => setBotToRemove(null)}>Keep</Button>
                      <button type="button" className={deleteActionClass} disabled={busy} onClick={onRemoveBot}>Remove bot</button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}
