import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Button, Card, Field, PageIntro, formatDate, inputClass, kindLabel, requestLabel } from "../components/ui";

export default function AdminRequests() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    let stop = false;
    api.adminRequests()
      .then((data) => {
        if (stop) return;
        setRequests(data.requests);
        const next = {};
        data.requests.forEach((item) => {
          next[item.id] = { status: item.status, adminNote: item.adminNote };
        });
        setDrafts(next);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  function setDraft(id, key, value) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  async function save(id) {
    setError("");
    try {
      const data = await api.updateRequest(id, drafts[id]);
      setRequests((current) => current.map((item) => (item.id === id ? data.request : item)));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageIntro title="Build requests" lede="Requests from clients. Update the status and leave a note." />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {requests && requests.length === 0 ? <Card><p>No requests yet.</p></Card> : null}
      <div className="space-y-3">
        {(requests || []).map((item) => (
          <Card key={item.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-lg font-extrabold text-ink">{item.title}</h2>
                <p className="text-sm text-mute">{item.businessName || item.name} · {item.email} · {kindLabel[item.kind]} · {formatDate(item.createdAt)}</p>
                <p className="mt-3 text-sm leading-relaxed">{item.details}</p>
                {item.budget ? <p className="mt-2 text-sm text-mute">Budget {item.budget}</p> : null}
                {item.neededBy ? <p className="text-sm text-mute">Needed by {formatDate(item.neededBy)}</p> : null}
              </div>
              <div className="w-full space-y-3 lg:max-w-sm">
                <Field label="Status">
                  <select className={inputClass} value={drafts[item.id]?.status || item.status} onChange={(event) => setDraft(item.id, "status", event.target.value)}>
                    {Object.entries(requestLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Note to the client">
                  <textarea className={`${inputClass} min-h-24`} value={drafts[item.id]?.adminNote || ""} onChange={(event) => setDraft(item.id, "adminNote", event.target.value)} />
                </Field>
                <Button type="button" onClick={() => save(item.id)}>Save</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
