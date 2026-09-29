import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Badge, Button, Card, Field, PageIntro, formatDate, inputClass, invoiceLabel, money } from "../components/ui";

const blankInvoice = () => ({
  number: "",
  description: "",
  amount: "",
  status: "sent",
  issuedOn: new Date().toISOString().slice(0, 10),
  dueOn: "",
});

export default function AdminUser() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [record, setRecord] = useState(null);
  const [details, setDetails] = useState(null);
  const [access, setAccess] = useState(null);
  const [password, setPassword] = useState("");
  const [figures, setFigures] = useState(null);
  const [movement, setMovement] = useState({ kind: "receipt", description: "", amount: "" });
  const [invoice, setInvoice] = useState(blankInvoice);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api.user(id)
      .then((data) => {
        if (stop) return;
        setRecord(data);
        setDetails({
          name: data.user.name,
          email: data.user.email,
          businessName: data.user.businessName,
          phone: data.user.phone,
        });
        setAccess({ role: data.user.role, status: data.user.status });
        setFigures({
          cash: data.finances.cash,
          revenue: data.finances.revenue,
          expenses: data.finances.expenses,
          receivables: data.finances.receivables,
          payables: data.finances.payables,
          months: data.finances.months,
        });
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [id]);

  function note(text) {
    setError("");
    setMessage(text);
  }

  async function saveDetails(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.updateUser(id, { ...details, ...access, password });
      setRecord((current) => ({ ...current, user: data.user }));
      setPassword("");
      note("Details saved.");
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess(next) {
    setBusy(true);
    try {
      const data = await api.updateUser(id, { ...details, ...next });
      setAccess({ role: data.user.role, status: data.user.status });
      setRecord((current) => ({ ...current, user: data.user }));
      note("Access saved.");
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = await api.uploadUserPhoto(id, file);
      setRecord((current) => ({ ...current, user: data.user }));
      note("Photo saved.");
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function saveFigures(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { ...figures };
      if (movement.description && movement.amount !== "") body.event = movement;
      const data = await api.saveFinances(id, body);
      setRecord((current) => ({ ...current, finances: data }));
      setFigures({
        cash: data.cash,
        revenue: data.revenue,
        expenses: data.expenses,
        receivables: data.receivables,
        payables: data.payables,
        months: data.months,
      });
      setMovement({ kind: "receipt", description: "", amount: "" });
      note("Figures saved. The client dashboard will refresh.");
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  function setMonth(index, key, value) {
    setFigures((current) => {
      const months = current.months.map((month, i) => (i === index ? { ...month, [key]: value } : month));
      return { ...current, months };
    });
  }

  async function addInvoice(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.addInvoice(id, invoice);
      setRecord((current) => ({ ...current, invoices: [data.invoice, ...current.invoices] }));
      setInvoice(blankInvoice());
      note("Invoice added.");
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function setInvoiceStatus(invoiceId, status) {
    try {
      const data = await api.updateInvoice(invoiceId, { status });
      setRecord((current) => ({
        ...current,
        invoices: current.invoices.map((item) => (item.id === invoiceId ? data.invoice : item)),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!record || !details || !figures) {
    return error ? <Alert>{error}</Alert> : <p className="text-mute">Loading…</p>;
  }

  const self = Number(me.id) === Number(record.user.id);
  const locked = record.bootstrap || self;

  return (
    <div className="space-y-4">
      <Link className="text-sm font-semibold text-plum" to="/admin">Back to people</Link>
      <PageIntro title={record.user.name} lede={`${record.user.businessName || "No business name"} · ${record.user.email}`}>
        <div className="flex gap-2">
          <Badge status={record.user.role} />
          <Badge status={record.user.status} />
        </div>
      </PageIntro>
      {error ? <Alert>{error}</Alert> : null}
      {message ? <Alert tone="ok">{message}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl font-extrabold text-ink">Details</h2>
          <form className="mt-4 space-y-4" onSubmit={saveDetails}>
            <Field label="Name"><input className={inputClass} value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={details.email} disabled={record.bootstrap} onChange={(event) => setDetails({ ...details, email: event.target.value })} /></Field>
            <Field label="Business"><input className={inputClass} value={details.businessName} onChange={(event) => setDetails({ ...details, businessName: event.target.value })} /></Field>
            <Field label="Phone"><input className={inputClass} value={details.phone} onChange={(event) => setDetails({ ...details, phone: event.target.value })} /></Field>
            <Field label="New password" hint={record.bootstrap ? "Change ADMIN_PASSWORD in server/.env and restart." : "Leave blank to keep the current password."}>
              <input className={inputClass} type="password" value={password} disabled={record.bootstrap} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>Save details</Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-xl font-extrabold text-ink">Access</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <select className={inputClass} value={access.role} disabled={locked} onChange={(event) => setAccess({ ...access, role: event.target.value })}>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={access.status} disabled={locked} onChange={(event) => setAccess({ ...access, status: event.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!locked && access.status !== "active" ? <Button type="button" disabled={busy} onClick={() => saveAccess({ ...access, status: "active" })}>Approve</Button> : null}
              {!locked && access.status === "active" ? <Button variant="quiet" type="button" disabled={busy} onClick={() => saveAccess({ ...access, status: "suspended" })}>Suspend access</Button> : null}
              {!locked ? <Button variant="ghost" type="button" disabled={busy} onClick={() => saveAccess(access)}>Save access</Button> : null}
              {locked ? <p className="text-sm text-mute">This account stays active.</p> : null}
            </div>
          </Card>
          <Card>
            <h2 className="font-display text-xl font-extrabold text-ink">Business photo</h2>
            <div className="mt-4 flex items-center gap-4">
              {record.user.photoUrl ? (
                <img src={record.user.photoUrl} alt="" className="h-24 w-24 rounded-3xl object-cover" />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-3xl bg-[#f5f0ff] font-display text-2xl font-extrabold text-plum">
                  {(record.user.businessName || record.user.name).slice(0, 1).toUpperCase()}
                </div>
              )}
              <Field label="Replace photo" hint="JPG, PNG, or WebP. Under 2 MB.">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="font-display text-xl font-extrabold text-ink">Financial figures</h2>
        <p className="mt-1 text-sm text-mute">Saved figures show on the client dashboard within a few seconds. Amounts are in ZAR.</p>
        <form className="mt-4 space-y-4" onSubmit={saveFigures}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[["cash", "Cash"], ["revenue", "Revenue"], ["expenses", "Expenses"], ["receivables", "Receivable"], ["payables", "Payable"]].map(([key, label]) => (
              <Field key={key} label={label}>
                <input className={inputClass} type="number" min="0" step="0.01" value={figures[key]} onChange={(event) => setFigures({ ...figures, [key]: event.target.value })} />
              </Field>
            ))}
          </div>
          <div className="space-y-2">
            {figures.months.map((month, index) => (
              <div key={month.month} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
                <p className="text-sm font-semibold text-ink">{month.month}</p>
                <input className={inputClass} type="number" min="0" step="0.01" aria-label={`Revenue ${month.month}`} value={month.revenue} onChange={(event) => setMonth(index, "revenue", event.target.value)} />
                <input className={inputClass} type="number" min="0" step="0.01" aria-label={`Expenses ${month.month}`} value={month.expenses} onChange={(event) => setMonth(index, "expenses", event.target.value)} />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Movement">
              <select className={inputClass} value={movement.kind} onChange={(event) => setMovement({ ...movement, kind: event.target.value })}>
                <option value="receipt">Receipt</option>
                <option value="bill">Bill</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </Field>
            <Field label="Description">
              <input className={inputClass} value={movement.description} onChange={(event) => setMovement({ ...movement, description: event.target.value })} />
            </Field>
            <Field label="Amount">
              <input className={inputClass} type="number" step="0.01" value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: event.target.value })} />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>Save figures</Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-display text-xl font-extrabold text-ink">Invoices</h2>
        <div className="mt-4 space-y-3">
          {record.invoices.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-[rgba(109,40,217,0.08)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">{item.number} · {money(item.amount)}</p>
                <p className="text-sm text-mute">{item.description} · Due {formatDate(item.dueOn)}</p>
              </div>
              <select className={`${inputClass} sm:max-w-[10rem]`} value={item.status} aria-label={`Status ${item.number}`} onChange={(event) => setInvoiceStatus(item.id, event.target.value)}>
                {Object.entries(invoiceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={addInvoice}>
          <Field label="Number"><input className={inputClass} value={invoice.number} onChange={(event) => setInvoice({ ...invoice, number: event.target.value })} required /></Field>
          <Field label="Description"><input className={inputClass} value={invoice.description} onChange={(event) => setInvoice({ ...invoice, description: event.target.value })} required /></Field>
          <Field label="Amount"><input className={inputClass} type="number" min="0" step="0.01" value={invoice.amount} onChange={(event) => setInvoice({ ...invoice, amount: event.target.value })} required /></Field>
          <Field label="Status">
            <select className={inputClass} value={invoice.status} onChange={(event) => setInvoice({ ...invoice, status: event.target.value })}>
              {Object.entries(invoiceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Issued"><input className={inputClass} type="date" value={invoice.issuedOn} onChange={(event) => setInvoice({ ...invoice, issuedOn: event.target.value })} required /></Field>
          <Field label="Due"><input className={inputClass} type="date" value={invoice.dueOn} onChange={(event) => setInvoice({ ...invoice, dueOn: event.target.value })} required /></Field>
          <Button type="submit" disabled={busy}>Add invoice</Button>
        </form>
      </Card>
    </div>
  );
}
