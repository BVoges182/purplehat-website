import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Badge, Button, Card, Field, PageIntro, formatDate, inputClass } from "../components/ui";

export default function AdminInvites() {
  const [invites, setInvites] = useState([]);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [approveOnUse, setApproveOnUse] = useState(true);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api.invites()
      .then((data) => { if (!stop) setInvites(data.invites); })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      const data = await api.createInvite({
        label,
        email,
        expiresInDays: expiresInDays === "none" ? "" : Number(expiresInDays),
        approveOnUse,
      });
      setCreated(data);
      setInvites((current) => [data.invite, ...current]);
      setLabel("");
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(id) {
    setError("");
    try {
      await api.revokeInvite(id);
      setInvites((current) => current.map((item) => (item.id === id ? { ...item, status: "revoked" } : item)));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageIntro title="Invite keys" lede="Create a key and email it to the client. They need a valid key to register." />
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <form className="space-y-4" onSubmit={onSubmit}>
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Who is this for?">
              <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} required />
            </Field>
            <Field label="Lock to an email" hint="Optional. Registration must use this address.">
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Expires">
              <select className={inputClass} value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="none">No expiry</option>
              </select>
            </Field>
            <label className="flex items-start gap-3 text-sm text-ink">
              <input className="mt-1" type="checkbox" checked={approveOnUse} onChange={(event) => setApproveOnUse(event.target.checked)} />
              <span>Approve access when they register. Leave this off if you want to approve them after signup.</span>
            </label>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create key"}</Button>
          </form>
          {created ? (
            <div className="mt-5 rounded-3xl bg-[#f5f0ff] p-4">
              <p className="text-sm font-semibold text-ink">Email this key. It is shown once.</p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-plum">{created.code}</p>
              <Button className="mt-3" variant="ghost" type="button" onClick={copy}>{copied ? "Copied" : "Copy key"}</Button>
            </div>
          ) : null}
        </Card>
        <div className="space-y-3">
          {invites.length === 0 ? <Card><p>No keys yet.</p></Card> : null}
          {invites.map((invite) => (
            <Card key={invite.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-extrabold text-ink">{invite.label}</p>
                  <p className="font-mono text-sm text-mute">{invite.codeHint}</p>
                  <p className="mt-1 text-xs text-mute">
                    {invite.email || "Any email"} · {invite.approveOnUse ? "Signs in after register" : "Needs approval"}
                    {invite.expiresAt ? ` · Expires ${formatDate(invite.expiresAt)}` : ""}
                  </p>
                  {invite.usedByName ? <p className="mt-1 text-xs text-mute">Used by {invite.usedByName}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={invite.status} />
                  {invite.status === "active" ? <Button variant="quiet" type="button" onClick={() => revoke(invite.id)}>Revoke</Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
