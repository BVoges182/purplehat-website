// Pulls .afs-shell / .afs-page / .afs-table rule blocks so the guard can
// prove the annual statement sheet did not change. .afs-nav is chrome and
// is intentionally left out. .afs-table-scroll is not .afs-table.

const AFS_CLASS = /\.afs-(?:shell|page|table)(?![\w-])/;

function targetsAfs(selector) {
  return selector.split(",").some((part) => AFS_CLASS.test(part));
}

function walk(source, atRule, blocks) {
  const n = source.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(source[i])) i += 1;
    if (i >= n) break;
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    const open = source.indexOf("{", i);
    if (open < 0) break;
    const prelude = source.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (source.startsWith("/*", j)) {
        const end = source.indexOf("*/", j + 2);
        j = end < 0 ? n : end + 2;
        continue;
      }
      const ch = source[j];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      j += 1;
    }
    const body = source.slice(open + 1, j - 1);
    if (/^@(media|supports|layer|container)\b/.test(prelude)) {
      walk(body, prelude, blocks);
    } else if (prelude && !prelude.startsWith("@") && targetsAfs(prelude)) {
      const rule = `${prelude} {${body}}`;
      blocks.push(atRule ? `${atRule} {\n${rule}\n}` : rule);
    }
    i = j;
  }
}

export function extractAfsStatementCss(css) {
  const blocks = [];
  walk(String(css || ""), "", blocks);
  return `${blocks.join("\n")}\n`;
}
