export const inputClass = "w-full rounded-2xl border border-[rgba(109,40,217,0.16)] bg-white px-4 py-3 text-ink outline-none transition focus:border-plum";

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
    reviewing: "bg-[#f5f0ff] text-plum",
    sent: "bg-[#f5f0ff] text-plum",
    in_progress: "bg-[#f5f0ff] text-plum",
    draft: "bg-slate-100 text-slate-700",
    suspended: "bg-rose-50 text-rose-800",
    overdue: "bg-rose-50 text-rose-800",
    declined: "bg-rose-50 text-rose-800",
    used: "bg-slate-100 text-slate-700",
    revoked: "bg-rose-50 text-rose-800",
    admin: "bg-[#2a1548] text-white",
    client: "bg-white text-ink border border-[rgba(109,40,217,0.12)]",
  };
  const labels = { ...accessLabel, ...invoiceLabel, ...requestLabel, used: "Used", revoked: "Revoked", admin: "Admin", client: "Client" };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[status] || "bg-white text-ink"}`}>
      {labels[status] || status}
    </span>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-gradient-to-b from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_10px_24px_rgba(109,40,217,0.28)] hover:-translate-y-0.5",
    ghost: "border border-[rgba(109,40,217,0.18)] bg-white text-[#4c1d95] hover:bg-[#f5f3ff]",
    quiet: "bg-white text-ink border border-[rgba(109,40,217,0.12)] hover:bg-[#f5f3ff]",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 font-display text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
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
    : "border-[rgba(109,40,217,0.12)] bg-[#f5f0ff] text-ink";
  return <p className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>{children}</p>;
}

export function Card({ className = "", children }) {
  return (
    <section className={`rounded-3xl border border-[rgba(109,40,217,0.08)] bg-white/90 p-6 shadow-card ${className}`}>
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
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-[#f5f0ff] font-display text-sm font-extrabold text-plum`}>
      {letter}
    </span>
  );
}

export function AuthFrame({ title, lede, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-[#6d28d9] to-[#4c1d95] px-12 py-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-14 w-14 object-contain" />
          <div>
            <p className="font-display text-2xl font-extrabold leading-none">Thinking Hat</p>
            <p className="mt-1 text-sm text-[#ddd6fe]">Purple Hat</p>
          </div>
        </div>
        <div>
          <p className="max-w-sm font-display text-4xl font-extrabold leading-tight">Your figures, invoices, and build requests.</p>
          <p className="mt-4 max-w-sm text-[#ede9fe]">Approved clients only. Use the invite key Purple Hat sent you.</p>
        </div>
        <p className="text-sm text-[#ddd6fe]">Xero and QuickBooks stay the system of record.</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
            <div>
              <p className="font-display text-xl font-extrabold leading-none text-ink">Thinking Hat</p>
              <p className="text-xs font-semibold text-plum">Purple Hat</p>
            </div>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-ink">{title}</h1>
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
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {lede ? <p className="mt-2 max-w-2xl text-mute">{lede}</p> : null}
      </div>
      {children}
    </div>
  );
}
