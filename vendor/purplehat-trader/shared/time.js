const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SAST_OFFSET = 2 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function next4hClose(now = Date.now()) {
  return Math.floor(now / FOUR_HOURS) * FOUR_HOURS + FOUR_HOURS;
}

export function sastParts(ms) {
  const time = Number(ms);
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + SAST_OFFSET);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function clock(part) {
  return `${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
}

export function formatSast(ms, form) {
  if (!form) {
    const text = new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
    return `${text} SAST`;
  }
  const part = sastParts(ms);
  if (!part) return "—";
  const time = clock(part);
  const day = `${part.day} ${MONTHS[part.month - 1]}`;
  if (form === "clock") return time;
  if (form === "day") return `${day} ${time}`;
  if (form === "shortday") return day;
  if (form === "stamp") return `${day} ${time} SAST`;
  if (form === "date") return `${day} ${part.year}`;
  if (form === "month") return `${MONTHS[part.month - 1]} ${part.year}`;
  if (form === "year") return String(part.year);
  return "—";
}

export function formatMonthYear(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return formatSast(value, "month");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatSast(`${value}T00:00:00Z`, "month");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  return formatSast(parsed, "month");
}

export function formatSastClock(ms) {
  const text = formatSast(ms, "clock");
  return text === "—" ? "" : text;
}

export function formatWhen(ms, todayMs = Date.now()) {
  const part = sastParts(ms);
  const today = sastParts(todayMs);
  if (!part || !today) return "—";
  const time = clock(part);
  if (part.year === today.year && part.month === today.month && part.day === today.day) return `Today ${time}`;
  return `${part.day} ${MONTHS[part.month - 1]} ${time}`;
}

export function formatSastStamp(ms) {
  const part = sastParts(ms);
  if (!part) return "—";
  return `${clock(part)} SAST · ${part.day} ${MONTHS[part.month - 1]} ${part.year}`;
}
