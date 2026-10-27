import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Alert, Avatar, Button } from "./ui";

const clientLinks = [
  ["/dashboard", "Dashboard"],
  ["/reports", "Management Reports"],
  ["/statements", "Financial Statements"],
  ["/billing", "Billing"],
  ["/request", "Request Build"],
  ["/business", "Business"],
];

const adminLinks = [
  ["/admin", "People"],
  ["/admin/reports", "Management Reports"],
  ["/admin/templates", "Client templates"],
  ["/admin/template-builder", "Client Template Builder"],
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

function MenuIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M3 5h14M3 10h14M3 15h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mailWarning, setMailWarning] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelTop, setPanelTop] = useState(76);
  const menuRef = useRef(null);
  const panelRef = useRef(null);
  const headerRef = useRef(null);
  const links = user.role === "admin" ? adminLinks : clientLinks;
  const wide = location.pathname.startsWith("/admin/template-builder");
  const frame = wide ? "max-w-[90rem]" : "max-w-6xl";

  useEffect(() => {
    if (user.role !== "admin") return undefined;
    let stop = false;
    api.mailStatus()
      .then((data) => { if (!stop && data.warning) setMailWarning(data.warning); })
      .catch(() => {});
    return () => { stop = true; };
  }, [user.role]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointer(event) {
      const target = event.target;
      if (menuRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="app-shell min-h-screen overflow-x-clip">
      <header ref={headerRef} className="sticky top-0 z-20 border-b border-[rgba(109,40,217,0.08)] bg-[rgba(247,244,255,0.86)] backdrop-blur-md">
        <div className={`mx-auto flex ${frame} flex-col gap-3 px-4 py-3 sm:px-8`}>
          <div className="flex flex-nowrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-extrabold leading-none text-ink">Thinking Hat</p>
                <p className="mt-1 truncate text-xs font-semibold text-plum">Purple Hat</p>
              </div>
            </div>
            <div ref={menuRef} className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-2 md:flex">
                <Avatar user={user} />
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-semibold text-ink">{user.businessName || user.name}</p>
                  <p className="truncate text-xs text-mute">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(109,40,217,0.18)] bg-white text-ink md:hidden"
                aria-expanded={menuOpen}
                aria-controls="app-menu"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => {
                  if (headerRef.current) setPanelTop(headerRef.current.getBoundingClientRect().bottom + 8);
                  setMenuOpen((open) => !open);
                }}
              >
                <MenuIcon open={menuOpen} />
              </button>
              <Button variant="ghost" className="!min-h-11 !px-3 md:!min-h-10 md:!px-4" type="button" onClick={logout}>Sign out</Button>
            </div>
          </div>
          <nav className="hidden flex-wrap gap-1 md:flex" aria-label="App">
            {links.map(([to, label]) => (
              <Item key={to} to={to} end={to === "/" || to === "/dashboard" || to === "/admin"}>{label}</Item>
            ))}
          </nav>
        </div>
      </header>
      {menuOpen ? (
        <nav
          ref={panelRef}
          id="app-menu"
          className="app-menu-panel fixed inset-x-4 z-40 sm:inset-x-8 md:hidden"
          style={{ top: panelTop }}
          aria-label="App"
        >
          <div className="flex flex-col gap-1 rounded-2xl border border-[rgba(109,40,217,0.12)] bg-white p-2 shadow-card">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/" || to === "/dashboard" || to === "/admin"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${isActive ? "bg-[#f5f0ff] text-plum" : "text-ink"}`}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
      <main className={`mx-auto ${frame} px-4 py-8 sm:px-8`}>
        {mailWarning ? <div className="mb-4"><Alert>{mailWarning}</Alert></div> : null}
        <Outlet />
      </main>
    </div>
  );
}
