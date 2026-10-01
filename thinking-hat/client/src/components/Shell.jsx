import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { Avatar, Button } from "./ui";

const clientLinks = [
  ["/", "Dashboard"],
  ["/reports", "Management Reports"],
  ["/statements", "Financial Statements"],
  ["/billing", "Billing"],
  ["/request", "Request Build"],
  ["/business", "Business"],
];

const adminLinks = [
  ["/admin", "People"],
  ["/admin/invites", "Invite keys"],
  ["/admin/requests", "Build requests"],
];

function Item({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${isActive ? "bg-white text-plum shadow-card" : "text-mute hover:text-ink"}`}
    >
      {children}
    </NavLink>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const links = user.role === "admin" ? adminLinks : clientLinks;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[rgba(109,40,217,0.08)] bg-[rgba(247,244,255,0.86)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo.png" alt="" className="h-11 w-11 object-contain" />
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-none text-ink">Thinking Hat</p>
                <p className="mt-1 text-xs font-semibold text-plum">Purple Hat</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 sm:flex">
                <Avatar user={user} />
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-semibold text-ink">{user.businessName || user.name}</p>
                  <p className="truncate text-xs text-mute">{user.email}</p>
                </div>
              </div>
              <Button variant="ghost" className="!min-h-10 !px-4" type="button" onClick={logout}>Sign out</Button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1" aria-label="App">
            {links.map(([to, label]) => (
              <Item key={to} to={to} end={to === "/" || to === "/admin"}>{label}</Item>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
