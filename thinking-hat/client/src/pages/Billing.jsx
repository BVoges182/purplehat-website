import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Badge, Card, PageIntro, formatDate, money } from "../components/ui";

export default function Billing() {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    api.invoices()
      .then((data) => { if (!stop) setInvoices(data.invoices); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  return (
    <div>
      <PageIntro title="Billing" lede="Invoices for review. Payment is arranged with Purple Hat. No card payment is taken here." />
      {error ? <Alert>{error}</Alert> : null}
      {invoices && invoices.length === 0 ? <Card><p>No invoices yet.</p></Card> : null}
      <div className="space-y-3">
        {(invoices || []).map((invoice) => (
          <Card key={invoice.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-extrabold text-ink">{invoice.number}</p>
              <p className="text-sm text-mute">{invoice.description}</p>
              <p className="mt-1 text-xs text-mute">Issued {formatDate(invoice.issuedOn)} · Due {formatDate(invoice.dueOn)}</p>
            </div>
            <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
              <p className="font-display text-xl font-extrabold text-ink">{money(invoice.amount)}</p>
              <Badge status={invoice.status} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
