import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Card, PageIntro } from "../components/ui";
import { reportMonthLabel } from "../reportMoney";

export default function AdminTemplates() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    api.templates()
      .then((data) => { if (!stop) setTemplates(data.templates || []); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  return (
    <div>
      <PageIntro title="Client templates" lede="A template is the report pack and dashboard copied onto a new client. Every new invite has to choose one." />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {!templates && !error ? <p className="text-mute">Loading templates…</p> : null}
      {templates && templates.length === 0 ? <Card><p className="text-sm text-mute">No templates saved yet.</p></Card> : null}
      <div className="space-y-4">
        {(templates || []).map((template) => (
          <Card key={template.id}>
            <h2 className="font-display text-xl font-extrabold text-ink">{template.name}</h2>
            <p className="mt-1 text-sm text-mute">Saved from {template.sourceBusiness || template.name}</p>
            <h3 className="mt-5 font-display text-sm font-extrabold text-ink">Reports</h3>
            {template.reports.length === 0 ? <p className="mt-2 text-sm text-mute">No reports in this template.</p> : (
              <ul className="mt-2 space-y-1">
                {template.reports.map((report) => (
                  <li key={report.month} className="text-sm text-ink">{reportMonthLabel(report.month)}</li>
                ))}
              </ul>
            )}
            <h3 className="mt-5 font-display text-sm font-extrabold text-ink">Dashboard</h3>
            <p className="mt-2 text-sm text-mute">Headline figures and the six-month chart come from these reports.</p>
            {template.movements.length === 0 ? <p className="mt-2 text-sm text-mute">No recent movements saved.</p> : (
              <ul className="mt-2 space-y-1">
                {template.movements.map((movement) => (
                  <li key={movement} className="text-sm text-ink">{movement}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
