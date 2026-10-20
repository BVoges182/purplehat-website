import { useEffect, useState } from "react";
import { api } from "../api";
import { Alert, Badge, Button, Card, Field, PageIntro, formatDate, inputClass } from "../components/ui";

function canResend(invite) {
  return Boolean(invite?.email) && (invite.inviteStatus === "pending" || invite.inviteStatus === "sent");
}

export default function AdminInvites() {
  const [invites, setInvites] = useState([]);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [approveOnUse, setApproveOnUse] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([api.invites(), api.templates()])
      .then(([inviteData, templateData]) => {
        if (stop) return;
        setInvites(inviteData.invites);
        setTemplates(templateData.templates || []);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function showIssued(data) {
    setCreated(data);
    setCopied("");
    if (data.invite) {
      setInvites((current) => {
        const rest = current.filter((item) => item.id !== data.invite.id);
        return [data.invite, ...rest];
      });
    }
    if (data.emailSent) setToast(`Invite emailed to ${data.invite.email}.`);
    if (data.emailError) setError(data.emailError);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setToast("");
    setBusy(true);
    try {
      const data = await api.createInvite({
        label,
        email,
        expiresInDays: expiresInDays === "none" ? "" : Number(expiresInDays),
        approveOnUse,
        sendEmail,
        templateId: templateId === "new" ? "new" : Number(templateId),
      });
      showIssued(data);
      setLabel("");
      setEmail("");
      setTemplateId("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(value, which) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
    } catch {
      setCopied("");
    }
  }

  async function revoke(id) {
    setError("");
    try {
      await api.revokeInvite(id);
      setInvites((current) => current.map((item) => (item.id === id ? { ...item, status: "revoked", inviteStatus: "revoked" } : item)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function resend(invite) {
    setError("");
    setToast("");
    setBusy(true);
    try {
      const data = await api.resendInvite(invite.id);
      showIssued({ ...data, replaced: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro title="Invite keys" lede="Create a key and email it to the client. They need a valid key to register. The key is saved even if the email cannot be sent." />
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <form className="space-y-4" onSubmit={onSubmit}>
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Who's this for?">
              <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} required />
            </Field>
            <Field label="Client template" hint={templateId === "new" ? "No saved pack is copied. This marks the client as needing a new template." : "The new client starts from this template. Later changes to that client stay on their own books."}>
              <select className={inputClass} value={templateId} onChange={(event) => setTemplateId(event.target.value)} required>
                <option value="">Choose a template</option>
                <option value="new">New client template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Lock to an email" hint={sendEmail ? "The key is emailed here, and registration must use this address." : "Optional. Registration must use this address."}>
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required={sendEmail} />
            </Field>
            <label className="flex items-start gap-3 text-sm text-ink">
              <input className="mt-1" type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
              <span>Send email key</span>
            </label>
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
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : (sendEmail ? "Send email key" : "Create key")}</Button>
          </form>
          {created?.code ? (
            <div className="mt-5 rounded-3xl bg-[#f5f0ff] p-4">
              <p className="text-sm font-semibold text-ink">
                {created.emailSent
                  ? `Emailed to ${created.invite.email}. The key is shown once.`
                  : "The key is saved. Copy it or the invite link if the email did not arrive. It is shown once."}
              </p>
              {created.replaced ? <p className="mt-2 text-sm text-ink">This replaces the previous key. The earlier key no longer works.</p> : null}
              <p className="mt-2 break-all font-mono text-2xl font-bold tracking-wide text-plum">{created.code}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" type="button" onClick={() => copy(created.code, "key")}>{copied === "key" ? "Copied" : "Copy key"}</Button>
                <Button variant="ghost" type="button" onClick={() => copy(created.inviteLink, "link")}>{copied === "link" ? "Copied" : "Copy invite link"}</Button>
              </div>
            </div>
          ) : null}
        </Card>
        <div className="space-y-3">
          {invites.length === 0 ? <Card><p>No keys yet.</p></Card> : null}
          {invites.map((invite) => (
            <Card key={invite.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-extrabold text-ink">{invite.label}</p>
                  <p className="font-mono text-sm text-mute">{invite.codeHint}</p>
                  <p className="mt-1 text-xs text-mute">
                    {invite.email || "Any email"} · {invite.templateName || "No template"} · {invite.approveOnUse ? "Signs in after register" : "Needs approval"}
                    {invite.expiresAt ? ` · Expires ${formatDate(invite.expiresAt)}` : ""}
                  </p>
                  {invite.usedByName ? <p className="mt-1 text-xs text-mute">Used by {invite.usedByName}</p> : null}
                  {invite.inviteStatus === "pending" && invite.emailError ? <p className="mt-2 text-sm text-ink">{invite.emailError}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge status={invite.inviteStatus || invite.status} />
                  {canResend(invite) ? <Button variant="quiet" type="button" disabled={busy} onClick={() => resend(invite)}>Resend invite</Button> : null}
                  {invite.inviteStatus === "pending" || invite.inviteStatus === "sent" ? <Button variant="quiet" type="button" onClick={() => revoke(invite.id)}>Revoke</Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {toast ? (
        <p role="status" className="fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-card">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
