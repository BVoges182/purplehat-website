import zlib from "node:zlib";

function stripVolatile(text) {
  return text
    .replace(/\/CreationDate\s*\([^)]*\)/g, "/CreationDate (normalized)")
    .replace(/\/ModDate\s*\([^)]*\)/g, "/ModDate (normalized)")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID [normalized]")
    .replace(/\/Length\s+\d+/g, "/Length 0");
}

// Dates live in a compressed object stream, so a raw-byte replace still changes
// once the clock ticks. Hash the inflated streams with those fields removed.
export function normalizePdf(buffer) {
  const raw = Buffer.from(buffer).toString("latin1");
  const text = raw.replace(/stream\r?\n([\s\S]*?)\r?\nendstream/g, (full, body) => {
    try {
      const inflated = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1");
      return `stream\n${stripVolatile(inflated)}\nendstream`;
    } catch {
      return full;
    }
  });
  return Buffer.from(stripVolatile(text), "latin1");
}
