import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import AnnualStatementView from "../components/AnnualStatementView";

export default function AnnualPrint() {
  const { clientId, year } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    window.__AFS_READY__ = false;
    fetch(`/api/print/annual-statements/${clientId}/${year}?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the statements.");
        return data;
      })
      .then((data) => {
        if (!stop) setStatement(data.statement);
      })
      .catch((err) => {
        if (!stop) {
          setError(err.message);
          window.__AFS_READY__ = true;
        }
      });
    return () => { stop = true; };
  }, [clientId, year, token]);

  useEffect(() => {
    if (!statement) return undefined;
    let stop = false;
    document.fonts.ready.then(() => {
      if (!stop) window.__AFS_READY__ = true;
    });
    return () => { stop = true; };
  }, [statement]);

  if (error) return <p className="afs-print">{error}</p>;
  if (!statement) return null;
  return (
    <div className="afs-print">
      <AnnualStatementView statement={statement} printable />
    </div>
  );
}
