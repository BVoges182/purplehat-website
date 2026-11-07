const FOUR_HOURS = 4 * 60 * 60 * 1000;

export function next4hClose(now = Date.now()) {
  return Math.floor(now / FOUR_HOURS) * FOUR_HOURS + FOUR_HOURS;
}

export function formatSast(ms) {
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
