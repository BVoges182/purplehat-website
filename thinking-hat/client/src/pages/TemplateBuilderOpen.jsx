import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import TemplateLayoutBoard from "../components/TemplateLayoutBoard";
import { FrameworkBadge, ReviewFlag } from "../components/templateBuilderUi";
import { Alert, Button, Card, Field, PageIntro, inputClass } from "../components/ui";

const presentationLabel = {
  table: "Default table",
  contacts: "Contacts (table plus pie)",
  aging: "Aging",
  ecommerce: "E-commerce",
};

const kindLabel = { heading: "Heading", line: "Line", total: "Total" };

function Dialog({ title, lede, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-[rgba(42,21,72,0.35)] px-4 py-8" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-editor-dialog"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-[rgba(109,40,217,0.12)] bg-white p-6 shadow-card ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="template-editor-dialog" className="font-display text-2xl font-extrabold text-ink">{title}</h2>
        {lede ? <p className="mt-1 text-sm text-mute">{lede}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
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

function draftFrom(section) {
  return {
    ...section,
    columns: [...(section.columns || [])],
    rows: (section.rows || []).map((row) => ({
      ...row,
      values: [...(row.values || [])],
      formats: [...(row.formats || [])],
    })),
  };
}

function SectionEditor({ section, busy, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(section));
  const contacts = draft.presentation === "contacts";

  function setColumns(columns) {
    setDraft((current) => ({
      ...current,
      columns,
      rows: current.rows.map((row) => ({
        ...row,
        values: columns.map((_, index) => row.values?.[index] ?? null),
        formats: columns.map((_, index) => row.formats?.[index] || ""),
      })),
    }));
  }

  function updateRow(index, patch) {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function moveRow(index, direction) {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.rows.length) return current;
      const rows = current.rows.slice();
      const [row] = rows.splice(index, 1);
      rows.splice(target, 0, row);
      return { ...current, rows };
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const rows = draft.presentation === "ecommerce"
          ? draft.rows.map((row) => ({ ...row, month: row.label }))
          : draft.rows;
        onSave({
          title: draft.title,
          subtitle: draft.subtitle,
          chart: draft.chart,
          hidden: draft.hidden,
          ...(contacts ? {} : { columns: draft.columns }),
          rows,
        });
      }}
    >
      <Field label="Title">
        <input className={inputClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
      </Field>
      <Field label="Subtitle">
        <input className={inputClass} value={draft.subtitle || ""} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
      </Field>
      {contacts ? null : (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Comparison columns</p>
          <div className="space-y-2">
            {draft.columns.map((column, index) => (
              <div key={`column-${index}`} className="flex gap-2">
                <input
                  className={inputClass}
                  aria-label={`Column ${index + 1}`}
                  value={column}
                  onChange={(event) => setColumns(draft.columns.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
                />
                <Button type="button" variant="quiet" onClick={() => setColumns(draft.columns.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setColumns([...draft.columns, ""])}>Add column</Button>
        </div>
      )}
      <label className="flex items-center gap-3 text-sm font-semibold text-ink">
        <input type="checkbox" checked={draft.chart !== false} onChange={(event) => setDraft({ ...draft, chart: event.target.checked })} />
        Show the chart
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold text-ink">
        <input type="checkbox" checked={!draft.hidden} onChange={(event) => setDraft({ ...draft, hidden: !event.target.checked })} />
        Show in the management report
      </label>
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Rows</p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft({
              ...draft,
              rows: [...draft.rows, {
                kind: "line",
                label: "New line",
                indent: 0,
                values: draft.columns.map(() => null),
                formats: draft.columns.map(() => ""),
                ...(contacts ? { value: null } : {}),
              }],
            })}
          >
            Add row
          </Button>
        </div>
        <ul className="space-y-2">
          {draft.rows.map((row, index) => (
            <li key={`row-${index}`} className="grid gap-2 rounded-2xl border border-[rgba(109,40,217,0.1)] p-3 sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]">
              <input
                className={inputClass}
                aria-label={`Row ${index + 1} label`}
                value={row.label || ""}
                onChange={(event) => updateRow(index, { label: event.target.value })}
              />
              <select
                className={inputClass}
                aria-label={`Row ${index + 1} kind`}
                value={row.kind || "line"}
                onChange={(event) => updateRow(index, { kind: event.target.value })}
              >
                {Object.entries(kindLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input
                className={inputClass}
                type="number"
                min="0"
                max="8"
                aria-label={`Row ${index + 1} indent`}
                value={row.indent || 0}
                onChange={(event) => updateRow(index, { indent: Number(event.target.value) })}
              />
              <div className="flex gap-2">
                <Button type="button" variant="quiet" aria-label={`Move row ${index + 1} up`} onClick={() => moveRow(index, -1)}>Up</Button>
                <Button type="button" variant="quiet" aria-label={`Move row ${index + 1} down`} onClick={() => moveRow(index, 1)}>Down</Button>
                <Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, rowIndex) => rowIndex !== index) })}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
        {draft.rows.length ? null : <p className="text-sm text-mute">This section has no rows.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>Save section</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function TemplateBuilderOpen() {
  const { clientId, templateId } = useParams();
  const fileRef = useRef(null);
  const [view, setView] = useState(null);
  const [sections, setSections] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("sections");
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [importing, setImporting] = useState(null);

  useEffect(() => {
    let stop = false;
    api.templateBuilderTemplate(clientId, templateId)
      .then((data) => {
        if (stop) return;
        setView(data);
        setSections(data.sections || []);
        setSectionTypes(data.sectionTypes || []);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [clientId, templateId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyView(data, message) {
    setView(data);
    setSections(data.sections || []);
    if (data.sectionTypes) setSectionTypes(data.sectionTypes);
    setToast(message);
  }

  async function commit(body, message) {
    setBusy(true);
    setError("");
    try {
      const data = await api.saveTemplateSections(clientId, templateId, body);
      applyView(data, message);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setError("Upload an Excel .xlsx or .xls file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api.previewTemplateExcel(clientId, templateId, file);
      const tabs = data.tabs || [];
      if (!tabs.length) {
        setError("That workbook has no tabs.");
        return;
      }
      setImporting({
        file,
        tabs,
        choices: tabs.map((tab) => ({
          index: tab.index,
          type: tab.suggestedType || "",
          skip: Boolean(tab.empty),
        })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!importing) return;
    const missing = importing.choices.some((choice) => !choice.skip && !choice.type);
    if (missing) {
      setError("Choose a section type for each tab, or skip it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api.importTemplateExcel(clientId, templateId, importing.file, importing.choices);
      setImporting(null);
      applyView(data, "Sections imported.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const layout = view?.template?.layout === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech";

  return (
    <div>
      <Link to={`/admin/template-builder?client=${clientId || ""}`} className="text-sm font-semibold text-plum hover:underline">
        Back to Client Template Builder
      </Link>
      <PageIntro
        title={view?.template?.name || "Template"}
        lede="Add sections, import a workbook, and arrange the pages of the management report."
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setPicker(true)} disabled={!view || busy}>+ Add section</Button>
          <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={!view || busy}>Import Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={chooseFile} />
        </div>
      </PageIntro>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {!view && !error ? <p className="text-mute">Loading…</p> : null}
      {view ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold text-ink">{view.client.name}</h2>
              <FrameworkBadge label={view.client.frameworkLabel} />
              {view.template.needsReview ? <ReviewFlag reason={view.template.reviewReason} /> : null}
            </div>
            <p className="mt-2 text-sm text-mute">
              {view.client.currency} · Year end {view.client.yearEndLabel} · {view.template.periodLabel || view.client.periodLabel}
            </p>
            {view.template.needsReview ? <p className="mt-3 text-sm text-amber-800">{view.template.reviewReason}</p> : null}
          </Card>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto" role="tablist" aria-label="Template editor">
            {[["sections", "Sections"], ["layout", "Layout"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                className={`min-h-11 rounded-full px-5 font-display text-sm font-extrabold ${mode === key ? "bg-ink text-white" : "border border-[rgba(109,40,217,0.16)] bg-white text-ink"}`}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "layout" ? (
            <TemplateLayoutBoard
              sections={sections}
              template={layout}
              disabled={busy}
              onEdit={setEditing}
              onDelete={setPendingDelete}
              onReorder={(ids) => {
                const previous = sections;
                const byId = new Map(sections.map((section) => [section.id, section]));
                setSections(ids.map((id) => byId.get(id)).filter(Boolean));
                commit({ action: "reorder", ids }, "Sections saved.").then((ok) => {
                  if (!ok) setSections(previous);
                });
              }}
            />
          ) : (
            <Card>
              <h3 className="font-display text-lg font-extrabold text-ink">Sections</h3>
              {sections.length ? (
                <ol className="mt-4 divide-y divide-[rgba(109,40,217,0.08)]">
                  {sections.map((section, index) => (
                    <li key={section.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{index + 1}. {section.title}</p>
                        <p className="text-sm text-mute">
                          {presentationLabel[section.presentation] || presentationLabel.table}
                          {section.subtitle ? ` · ${section.subtitle}` : ""}
                          {section.hidden ? " · Hidden" : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="quiet" onClick={() => setEditing(section)} disabled={busy}>Edit</Button>
                        <Button type="button" variant="ghost" onClick={() => setPendingDelete(section)} disabled={busy}>Delete</Button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-mute">This template has no sections.</p>
              )}
            </Card>
          )}
        </div>
      ) : null}
      {picker ? (
        <Dialog title="Add a section" lede="Pick a section type. It is added at the end of the template." onClose={() => setPicker(false)}>
          <ul className="space-y-2">
            {sectionTypes.map((type) => (
              <li key={type.key}>
                <button
                  type="button"
                  className="w-full rounded-2xl border border-[rgba(109,40,217,0.12)] px-4 py-3 text-left font-semibold text-ink hover:bg-[#f5f3ff]"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await commit({ action: "add", sectionType: type.key }, "Sections saved.");
                    if (ok) setPicker(false);
                  }}
                >
                  {type.label}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
      {editing ? (
        <Dialog title={`Edit ${editing.title}`} wide onClose={() => setEditing(null)}>
          <SectionEditor
            key={editing.id}
            section={editing}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={async (patch) => {
              const ok = await commit({ action: "update", id: editing.id, patch }, "Sections saved.");
              if (ok) setEditing(null);
            }}
          />
        </Dialog>
      ) : null}
      {pendingDelete ? (
        <Dialog title={`Delete ${pendingDelete.title}?`} lede="This removes the section from the template." onClose={() => setPendingDelete(null)}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await commit({ action: "delete", id: pendingDelete.id }, "Section deleted.");
                if (ok) setPendingDelete(null);
              }}
            >
              Delete section
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          </div>
        </Dialog>
      ) : null}
      {importing ? (
        <Dialog
          title="Import Excel"
          lede="Each tab becomes a section, in tab order. Import replaces the sections in this template."
          wide
          onClose={() => setImporting(null)}
        >
          <ul className="space-y-3">
            {importing.tabs.map((tab) => {
              const choice = importing.choices.find((item) => item.index === tab.index) || { type: "", skip: false };
              return (
                <li key={tab.index} className="rounded-2xl border border-[rgba(109,40,217,0.1)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{tab.name}</p>
                      <p className={`text-sm ${tab.empty ? "text-rose-700" : "text-mute"}`}>
                        {tab.empty ? tab.error || "This tab is empty." : `${tab.rowCount} ${tab.rowCount === 1 ? "row" : "rows"}`}
                      </p>
                    </div>
                    <label className="block min-w-[14rem] flex-1 text-sm font-semibold text-ink">
                      Section type
                      <select
                        className={`${inputClass} mt-1.5`}
                        value={choice.type}
                        disabled={choice.skip}
                        onChange={(event) => {
                          const type = event.target.value;
                          setImporting((current) => ({
                            ...current,
                            choices: current.choices.map((item) => (item.index === tab.index ? { ...item, type } : item)),
                          }));
                        }}
                      >
                        <option value="">Choose a type</option>
                        {sectionTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={choice.skip}
                        onChange={(event) => {
                          const skip = event.target.checked;
                          setImporting((current) => ({
                            ...current,
                            choices: current.choices.map((item) => (item.index === tab.index ? { ...item, skip } : item)),
                          }));
                        }}
                      />
                      Skip
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={confirmImport}>Import sections</Button>
            <Button type="button" variant="ghost" onClick={() => setImporting(null)}>Cancel</Button>
          </div>
        </Dialog>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}
