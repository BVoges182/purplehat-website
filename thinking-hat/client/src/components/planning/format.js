const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function planMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const amount = Math.round(Number(value));
  const text = Math.abs(amount).toLocaleString("en-US");
  return amount < 0 ? `(${text})` : text;
}

export function planPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const pct = Number(value) * 100;
  const text = `${Math.abs(pct).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (pct <= -0.05) return `-${text}`;
  return `+${text}`;
}

export function planPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function monthLabel(period) {
  const [year, month] = String(period).split("-");
  return `${MONTHS[Number(month) - 1]} ${String(year).slice(2)}`;
}

export function weekLabel(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function shortMonth(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return MONTHS[date.getUTCMonth()];
}

export function headroomTone(value) {
  const amount = Number(value);
  if (amount < 0) return "red";
  if (amount < 10000) return "amber";
  return "green";
}

export function signedClass(value) {
  return Number(value) < 0 ? "text-[var(--rag-red)]" : "text-ink";
}
