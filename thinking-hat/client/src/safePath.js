const blocked = /https?:|javascript:|\\/i;

export function sameSitePath(value) {
  if (typeof value !== "string") return "";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (blocked.test(path)) return "";
  return path;
}
