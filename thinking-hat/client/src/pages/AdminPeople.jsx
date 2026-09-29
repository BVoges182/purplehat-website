import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, Avatar, Badge, Button, Card, PageIntro } from "../components/ui";

export default function AdminPeople() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    api.users()
      .then((data) => { if (!stop) setUsers(data.users); })
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
          <Card key={user.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar user={user} />
              <div>
                <p className="font-display text-lg font-extrabold text-ink">{user.name}</p>
                <p className="text-sm text-mute">{user.businessName || "No business name"} · {user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={user.role} />
              <Badge status={user.status} />
              {user.status === "pending" ? <Button type="button" onClick={() => approve(user)}>Approve</Button> : null}
              <Link className="inline-flex min-h-11 items-center justify-center rounded-full border border-[rgba(109,40,217,0.18)] bg-white px-5 font-display text-sm font-extrabold text-[#4c1d95]" to={`/admin/users/${user.id}`}>
                Open
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
