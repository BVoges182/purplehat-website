import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientForm, setClientForm] = useState(null);
  const [templateForm, setTemplateForm] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState("");
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

  const clients = catalog?.clients || [];
  const options = catalog?.options;
  const selectedId = preferredClientId(clients, requested);
  const selected = clients.find((client) => String(client.id) === selectedId) || null;
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
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={openTemplateForm} disabled={busy}>+ New template</Button>
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
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-sm text-mute">{formatDate(template.updatedAt)}</span>
                        <Link
                          to={`/admin/template-builder/${selected.id}/templates/${template.id}`}
                          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[rgba(109,40,217,0.12)] bg-white px-4 font-display text-sm font-extrabold text-ink hover:bg-[#f5f3ff]"
                        >
                          Open
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 hidden max-w-full overflow-x-auto md:block [contain:inline-size]">
                  <table className="w-full min-w-[52rem] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[rgba(109,40,217,0.1)] text-xs font-bold uppercase tracking-wide text-mute">
                        <th className="px-3 py-3 font-bold">Template</th>
                        <th className="px-3 py-3 font-bold">Framework</th>
                        <th className="px-3 py-3 font-bold">Period</th>
                        <th className="px-3 py-3 font-bold">Sections</th>
                        <th className="px-3 py-3 font-bold">Updated</th>
                        <th className="px-3 py-3 font-bold"><span className="sr-only">Open</span></th>
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
                          <td className="px-3 py-4 text-right">
                            <Link
                              to={`/admin/template-builder/${selected.id}/templates/${template.id}`}
                              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[rgba(109,40,217,0.12)] bg-white px-4 font-display text-sm font-extrabold text-ink hover:bg-[#f5f3ff]"
                            >
                              Open
                            </Link>
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
    </div>
  );
}
