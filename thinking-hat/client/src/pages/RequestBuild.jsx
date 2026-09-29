import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Badge, Button, Card, Field, PageIntro, formatDate, inputClass, kindLabel, requestLabel } from "../components/ui";

const empty = { title: "", kind: "website", details: "", budget: "", neededBy: "" };

export default function RequestBuild() {
  const [form, setForm] = useState(empty);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api.requests()
      .then((data) => { if (!stop) setRequests(data.requests); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  function set(key) {
    return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const data = await api.createRequest(form);
      setRequests((current) => [data.request, ...current]);
      setForm(empty);
      setMessage("Request sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro title="Request a build" lede="Ask Purple Hat for a website, an integration, or a report pack." />
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <form className="space-y-4" onSubmit={onSubmit}>
            {error ? <Alert>{error}</Alert> : null}
            {message ? <Alert tone="ok">{message}</Alert> : null}
            <Field label="Title">
              <input className={inputClass} value={form.title} onChange={set("title")} required />
            </Field>
            <Field label="Type">
              <select className={inputClass} value={form.kind} onChange={set("kind")}>
                {Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Details">
              <textarea className={`${inputClass} min-h-32 resize-y`} value={form.details} onChange={set("details")} required />
            </Field>
            <Field label="Budget" hint="Optional.">
              <input className={inputClass} value={form.budget} onChange={set("budget")} />
            </Field>
            <Field label="Needed by" hint="Optional.">
              <input className={inputClass} type="date" value={form.neededBy} onChange={set("neededBy")} />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
          </form>
        </Card>
        <div className="space-y-3">
          {requests.length === 0 ? <Card><p>No build requests yet.</p></Card> : null}
          {requests.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-extrabold text-ink">{item.title}</h2>
                  <p className="text-sm text-mute">{kindLabel[item.kind]} · {formatDate(item.createdAt)}</p>
                </div>
                <Badge status={item.status} />
              </div>
              <p className="mt-3 text-sm leading-relaxed">{item.details}</p>
              {item.budget ? <p className="mt-2 text-sm text-mute">Budget {item.budget}</p> : null}
              {item.neededBy ? <p className="text-sm text-mute">Needed by {formatDate(item.neededBy)}</p> : null}
              {item.adminNote ? <p className="mt-3 rounded-2xl bg-[#f5f0ff] px-3 py-2 text-sm text-ink">Purple Hat: {item.adminNote}</p> : null}
              <p className="sr-only">{requestLabel[item.status]}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
