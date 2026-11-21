import { useEffect, useRef, useState } from "react";

export const inputClass = "w-full border border-hairline bg-surface px-4 py-3 text-ink outline-none transition focus:border-plum";

export function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const attr = root.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") return attr;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };
    setTheme(read());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (!root.hasAttribute("data-theme")) setTheme(read()); };
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);
  function choose(next) {
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ph-theme", next); } catch { /* private mode */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#0B1018" : "#FFFFFF");
    setTheme(next);
  }
  return (
    <div className={`theme-toggle ${className}`} role="group" aria-label="Colour theme">
      <button type="button" aria-pressed={theme === "light"} onClick={() => choose("light")}>Light</button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => choose("dark")}>Dark</button>
    </div>
  );
}

export function money(value) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value) || 0);
}

export function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthLabel(ym) {
  const [y, m] = String(ym).split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-ZA", { month: "short", timeZone: "UTC" });
}

export const accessLabel = { active: "Active", pending: "Pending", suspended: "Suspended" };
export const invoiceLabel = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue" };
export const requestLabel = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
};
export const kindLabel = { website: "Website", integration: "Integration", report: "Report pack", other: "Other" };

export function Badge({ status }) {
  const tones = {
    active: "bg-emerald-50 text-emerald-800",
    paid: "bg-emerald-50 text-emerald-800",
    done: "bg-emerald-50 text-emerald-800",
    pending: "bg-amber-50 text-amber-800",
    submitted: "bg-amber-50 text-amber-800",
    reviewing: "bg-band text-heading",
    sent: "bg-band text-heading",
    in_progress: "bg-band text-heading",
    draft: "bg-slate-100 text-slate-700",
    suspended: "bg-rose-50 text-rose-800",
    overdue: "bg-rose-50 text-rose-800",
    declined: "bg-rose-50 text-rose-800",
    used: "bg-slate-100 text-slate-700",
    accepted: "bg-emerald-50 text-emerald-800",
    expired: "bg-slate-100 text-slate-700",
    revoked: "bg-rose-50 text-rose-800",
    admin: "bg-heading text-[var(--btn-text)]",
    client: "bg-surface text-ink border border-hairline",
  };
  const labels = { ...accessLabel, ...invoiceLabel, ...requestLabel, used: "Used", accepted: "Accepted", expired: "Expired", revoked: "Revoked", admin: "Admin", client: "Client" };
  return (
    <span className={`inline-flex px-2.5 py-1 text-xs font-bold ${tones[status] || "bg-surface text-ink"}`}>
      {labels[status] || status}
    </span>
  );
}

const primaryButton = "border border-[var(--btn-bg)] bg-[var(--btn-bg)] text-[var(--btn-text)] hover:border-[var(--btn-bg-hover)] hover:bg-[var(--btn-bg-hover)] disabled:border-[var(--btn-disabled-bg)] disabled:bg-[var(--btn-disabled-bg)] disabled:text-[var(--btn-disabled-text)]";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: primaryButton,
    navy: primaryButton,
    secondary: "border border-[var(--btn-secondary-border)] bg-transparent text-[var(--btn-secondary-text)] hover:bg-[var(--nav-hover-bg)] disabled:border-[var(--btn-disabled-bg)] disabled:bg-transparent disabled:text-[var(--btn-disabled-text)]",
    ghost: "border border-hairline bg-surface text-heading hover:bg-band",
    quiet: "border border-hairline bg-surface text-ink hover:bg-band",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center px-5 font-display text-sm font-bold tracking-[0.12em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed ${styles[variant] || primaryButton} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function navItemClass(isActive, edge = "bottom") {
  const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  if (edge === "left") {
    return `border-l-[3px] ${focus} ${isActive ? "border-l-[var(--nav-active-bar)] bg-[var(--nav-active-bg)] font-bold text-[var(--nav-active-text)]" : "border-l-transparent text-ink hover:bg-[var(--nav-hover-bg)]"}`;
  }
  return `border-b-[3px] ${focus} ${isActive ? "border-b-[var(--nav-active-bar)] bg-[var(--nav-active-bg)] font-bold text-[var(--nav-active-text)]" : "border-b-transparent text-mute hover:bg-[var(--nav-hover-bg)] hover:text-heading"}`;
}

export function SegmentedPills({ options, value, onChange, label }) {
  const scroller = useRef(null);
  useEffect(() => {
    const track = scroller.current;
    const active = track?.querySelector("[aria-selected='true']");
    if (!active || !track) return;
    const trackBox = track.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    let left = track.scrollLeft;
    if (activeBox.right > trackBox.right - 8) left += activeBox.right - (trackBox.right - 8);
    if (activeBox.left < trackBox.left + 8) left -= (trackBox.left + 8) - activeBox.left;
    track.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      <div ref={scroller} className="overflow-x-auto" role="tablist" aria-label={label}>
        <div className="flex w-full border border-hairline bg-surface">
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`inline-flex min-h-10 flex-1 shrink-0 items-center justify-center border-r border-hairline px-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${active ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]" : "text-mute hover:bg-[var(--nav-hover-bg)]"}`}
                onClick={() => onChange(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-mute">{hint}</span> : null}
    </label>
  );
}

export function Alert({ tone = "error", children }) {
  const cls = tone === "error"
    ? "border-rose-100 bg-rose-50 text-rose-800"
    : "border-hairline bg-band text-ink";
  return <p className={`border px-4 py-3 text-sm ${cls}`}>{children}</p>;
}

export function Card({ className = "", children }) {
  return (
    <section className={`border border-hairline bg-surface p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Avatar({ user, className = "h-10 w-10" }) {
  if (user?.photoUrl) {
    return <img src={user.photoUrl} alt="" className={`${className} rounded-full object-cover`} />;
  }
  const letter = (user?.businessName || user?.name || "?").slice(0, 1).toUpperCase();
  return (
    <span className={`${className} inline-flex items-center justify-center bg-band font-display text-sm font-semibold text-heading`}>
      {letter}
    </span>
  );
}

export function marketingHome() {
  if (typeof window === "undefined") return "/";
  const { hostname, port } = window.location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "5173") return "http://localhost:8787/";
  return "/";
}

export function AuthFrame({ title, lede, children, homeLink = false }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-hairline bg-surface px-12 py-12 text-ink lg:flex">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Purple Hat logo" className="h-14 w-14 object-contain" />
            <div>
              <p className="font-display text-2xl font-semibold leading-none text-heading">Thinking Hat</p>
              <p className="mt-1 text-sm text-mute">Purple Hat</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div>
          <p className="max-w-sm font-display text-4xl font-semibold leading-tight text-heading">Your figures, invoices, and build requests.</p>
          <p className="mt-4 max-w-sm text-mute">Approved clients only. Use the invite key Purple Hat sent you.</p>
        </div>
        <div className="h-5" aria-hidden="true" />
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          {homeLink ? (
            <a className="mb-6 inline-flex text-sm text-mute transition hover:text-plum" href={marketingHome()}>← Back to website</a>
          ) : null}
          <div className="mb-8 flex items-center justify-between gap-3 lg:hidden">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
              <div>
                <p className="font-display text-xl font-semibold leading-none text-heading">Thinking Hat</p>
                <p className="text-xs font-semibold text-mute">Purple Hat</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-heading">{title}</h1>
          {lede ? <p className="mt-2 text-mute">{lede}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function PageIntro({ title, lede, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">{title}</h1>
        {lede ? <p className="mt-2 max-w-2xl text-mute">{lede}</p> : null}
      </div>
      {children}
    </div>
  );
}
