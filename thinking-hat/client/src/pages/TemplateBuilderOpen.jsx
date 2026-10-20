import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { FrameworkBadge, ReviewFlag } from "../components/templateBuilderUi";
import { Alert, Card, PageIntro } from "../components/ui";

const presentationLabel = {
  table: "Default table",
  contacts: "Contacts (table plus pie)",
  aging: "Aging",
  ecommerce: "E-commerce",
};

export default function TemplateBuilderOpen() {
  const { clientId, templateId } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    api.templateBuilderTemplate(clientId, templateId)
      .then((data) => { if (!stop) setView(data); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [clientId, templateId]);

  return (
    <div>
      <Link to={`/admin/template-builder?client=${clientId || ""}`} className="text-sm font-semibold text-plum hover:underline">
        Back to Client Template Builder
      </Link>
      <PageIntro
        title={view?.template?.name || "Template"}
        lede="This is a placeholder. The drag-and-drop builder comes in a later phase."
      />
      {error ? <Alert>{error}</Alert> : null}
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
            {view.template.needsReview ? (
              <p className="mt-3 text-sm text-amber-800">{view.template.reviewReason}</p>
            ) : null}
          </Card>
          <Card>
            <h3 className="font-display text-lg font-extrabold text-ink">Sections</h3>
            {view.template.sections?.length ? (
              <ol className="mt-4 divide-y divide-[rgba(109,40,217,0.08)]">
                {view.template.sections.map((section, index) => (
                  <li key={`${section.title}-${index}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold text-ink">{index + 1}. {section.title}</span>
                    <span className="text-sm text-mute">{presentationLabel[section.presentation] || presentationLabel.table}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-mute">This template has no sections yet.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
