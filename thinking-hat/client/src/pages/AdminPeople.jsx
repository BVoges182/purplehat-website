import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, Avatar, Badge, Button, Card, PageIntro } from "../components/ui";
import { reportTemplateName } from "../reportTemplates";

export default function AdminPeople() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([api.users(), api.templates()])
      .then(([people, templateData]) => {
        if (stop) return;
        setUsers(people.users);
        setTemplates(templateData.templates || []);
      })
      .catch((err) => { if (!stop) setError(err.message); });
    return () => { stop = true; };
  }, []);

  const waiting = (users || []).filter((user) => user.status === "pending").length;

  async function approve(user) {
    setError("");
    try {
      const data = await api.updateUser(user.id, { ...user, status: "active" });
      setUsers((current) => current.map((item) => (item.id === user.id ? data.user : item)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function chooseTemplate(user, templateId) {
    if (!templateId || Number(templateId) === Number(user.templateId)) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.assignUserTemplate(user.id, Number(templateId));
      setUsers((current) => current.map((item) => (item.id === user.id ? data.user : item)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(user) {
    setBusy(true);
    setError("");
    try {
      await api.deleteUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setPendingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro title="People" lede={waiting ? `${waiting} waiting for approval.` : "Approved clients, pending signups, and access."}>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] px-5 font-display text-sm font-extrabold text-white" to="/admin/invites">
          New invite key
        </Link>
      </PageIntro>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="space-y-3">
        {(users || []).map((user) => (
          <Card key={user.id} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar user={user} />
                <div>
                  <p className="font-display text-lg font-extrabold text-ink">{user.name}</p>
                  <p className="text-sm text-mute">{user.businessName || "No business name"} · {user.email}</p>
                  {user.role === "client" ? (
                    <p className="mt-1 text-sm font-semibold text-ink">Template: {user.templateName || reportTemplateName(user.reportTemplate)}</p>
                  ) : null}
                  {user.needsTemplate ? <p className="text-xs font-semibold text-plum">New template to build</p> : null}
                  {user.role === "client" ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-mute">
                      Invite
                      {user.invite ? <Badge status={user.invite.inviteStatus} /> : <span>None</span>}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge status={user.role} />
                <Badge status={user.status} />
                {user.status === "pending" ? <Button type="button" onClick={() => approve(user)}>Approve</Button> : null}
                {user.role === "client" ? (
                  <select
                    className="max-w-full rounded-2xl border border-[rgba(109,40,217,0.16)] bg-white px-4 py-2 text-sm text-ink outline-none transition focus:border-plum sm:max-w-[14rem]"
                    aria-label={`Template for ${user.name}`}
                    value={user.templateId || ""}
                    disabled={busy || !templates.length}
                    onChange={(event) => chooseTemplate(user, event.target.value)}
                  >
                    {!user.templateId ? <option value="">Choose a template</option> : null}
                    {user.templateId && !templates.some((template) => template.id === user.templateId) ? (
                      <option value={user.templateId}>{user.templateName || "Current template"}</option>
                    ) : null}
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                ) : null}
                <Link className="inline-flex min-h-11 items-center justify-center rounded-full border border-[rgba(109,40,217,0.18)] bg-white px-5 font-display text-sm font-extrabold text-[#4c1d95]" to={`/admin/users/${user.id}`}>
                  Open
                </Link>
                {user.role === "client" ? (
                  <Button type="button" variant="ghost" onClick={() => { setError(""); setPendingId(user.id); }}>Delete</Button>
                ) : null}
              </div>
            </div>
            {pendingId === user.id ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-sm text-rose-900">Delete {user.name}? This removes the account, reports, and invoices.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => confirmDelete(user)}>Delete account</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setPendingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
