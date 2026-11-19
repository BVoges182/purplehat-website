import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import AnnualStatementView from "../components/AnnualStatementView";
import { Alert, PageIntro } from "../components/ui";

export default function AdminAnnualPreview() {
  const { id } = useParams();
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api.adminAnnualStatement(id)
      .then((data) => { if (!stop) setStatement(data.statement); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, [id]);

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const data = await api.publishAnnualStatement(id);
      setStatement(data.statement);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const lede = statement
    ? `${statement.status === "published" ? "Published" : "Draft"} · year ended ${statement.yearEnd} · version ${statement.version}`
    : "Preview the workbook, then publish it for the client.";

  return (
    <div>
      <Link to="/admin/reports" className="text-sm font-semibold text-plum hover:underline">Back to reports</Link>
      <PageIntro title="Annual financial statements" lede={lede} />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {!statement && !error ? <p className="text-mute">Loading…</p> : null}
      {statement?.status === "published" ? <p className="mb-4 text-sm text-mute">This version is what the client sees.</p> : null}
      {statement ? (
        <AnnualStatementView
          statement={statement}
          preview
          busy={busy}
          onPublish={publish}
          files={{
            pdf: `/api/admin/annual-statements/${id}/pdf`,
            xlsx: `/api/admin/annual-statements/${id}/xlsx`,
            pdfName: `annual-financial-statements-${statement.year}.pdf`,
            xlsxName: statement.sourceName,
          }}
        />
      ) : null}
    </div>
  );
}
