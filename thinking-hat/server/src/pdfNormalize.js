import zlib from "node:zlib";

function stripVolatile(text) {
  return text
    .replace(/\/CreationDate\s*\([^)]*\)/g, "/CreationDate (normalized)")
    .replace(/\/ModDate\s*\([^)]*\)/g, "/ModDate (normalized)")
    .replace(/\(D:\d{14}(?:Z|[+\-]\d{2}'\d{2}')?\)/g, "(D:normalized)")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID [normalized]")
    .replace(/\/Length\s+\d+/g, "/Length 0")
    .replace(/startxref\s+\d+/g, "startxref 0");
}

function streamAt(latin, from) {
  let search = from;
  while (search < latin.length) {
    const at = latin.indexOf("stream", search);
    if (at < 0) return null;
    const before = at > 0 ? latin[at - 1] : "";
    const after = latin.slice(at + 6, at + 8);
    const eol = after.startsWith("\r\n") ? 2 : after.startsWith("\n") || after.startsWith("\r") ? 1 : 0;
    const dictEnd = latin.lastIndexOf(">>", at);
    const dictStart = dictEnd >= 0 ? latin.lastIndexOf("<<", dictEnd) : -1;
    const dict = dictStart >= 0 ? latin.slice(dictStart, dictEnd + 2) : "";
    const lengthMatch = /\/Length\s+(\d+)/.exec(dict);
    if (/\s/.test(before) && eol && lengthMatch && dictEnd < at && dictEnd > dictStart) {
      const dataStart = at + 6 + eol;
      const dataEnd = dataStart + Number(lengthMatch[1]);
      if (dataEnd <= latin.length && /^\r?\n?endstream/.test(latin.slice(dataEnd, dataEnd + 12))) {
        return { at, dict, dataStart, dataEnd };
      }
    }
    search = at + 6;
  }
  return null;
}

// Dates live in a compressed object stream. A shorter or longer compressed
// timestamp also moves the cross-reference offsets, so read each stream by
// its /Length, drop the xref stream, and hash the inflated text.
export function normalizePdf(buffer) {
  const raw = Buffer.from(buffer);
  const latin = raw.toString("latin1");
  let out = "";
  let cursor = 0;
  for (let found = streamAt(latin, 0); found; found = streamAt(latin, cursor)) {
    const isXref = /\/Type\s*\/XRef/.test(found.dict);
    let inflated = "xref";
    if (!isXref) {
      try {
        inflated = zlib.inflateSync(raw.subarray(found.dataStart, found.dataEnd)).toString("latin1");
      } catch {
        inflated = raw.subarray(found.dataStart, found.dataEnd).toString("latin1");
      }
    }
    out += latin.slice(cursor, found.at);
    out += `stream\n${inflated}\nendstream`;
    const end = latin.indexOf("endstream", found.dataEnd);
    cursor = end < 0 ? found.dataEnd : end + "endstream".length;
  }
  out += latin.slice(cursor);
  return Buffer.from(stripVolatile(out), "latin1");
}
