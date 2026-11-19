import ExcelJS from "exceljs";

const REQUIRED = [
  "Cover",
  "Index",
  "Auditor's Report",
  "Balance Sheets",
  "Statements of Operations",
  "Member's Equity",
  "Cash Flows",
  "Note 1", "Note 2", "Note 3", "Note 4", "Note 5", "Note 6", "Note 7",
  "Note 8", "Note 9", "Note 10", "Note 11", "Note 12", "Note 13", "Note 14",
  "Workings & Reconciliations",
];

const STATEMENT_SHEETS = [
  ["Balance Sheets", "balance-sheets"],
  ["Statements of Operations", "operations"],
  ["Member's Equity", "equity"],
  ["Cash Flows", "cash-flows"],
];

export function viewerCanReadAnnual(viewer, ownerUserId) {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return Number(viewer.id) === Number(ownerUserId);
}

function normName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sheetAliases(name) {
  const exact = normName(name);
  const plain = exact.replace(/'/g, "");
  return plain === exact ? [exact] : [exact, plain];
}

function sheetsByName(worksheets) {
  const byName = new Map();
  for (const sheet of worksheets) {
    for (const alias of sheetAliases(sheet.name)) {
      if (!byName.has(alias)) byName.set(alias, sheet);
    }
  }
  return byName;
}

function findSheet(byName, name) {
  for (const alias of sheetAliases(name)) {
    if (byName.has(alias)) return byName.get(alias);
  }
  return null;
}

function colNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function colLetters(n) {
  let out = "";
  let value = n;
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function sheetResolver(worksheets) {
  const canonical = new Map();
  for (const sheet of worksheets) {
    const exact = normName(sheet.name);
    canonical.set(exact, exact);
    const plain = exact.replace(/'/g, "");
    if (!canonical.has(plain)) canonical.set(plain, exact);
  }
  return (name) => {
    const exact = normName(name);
    return canonical.get(exact) || canonical.get(exact.replace(/'/g, "")) || exact;
  };
}

function unwrap(value) {
  if (value == null || value === "") return { kind: "blank" };
  if (typeof value === "number" && Number.isFinite(value)) return { kind: "number", value };
  if (typeof value === "boolean") return { kind: "bool", value };
  if (typeof value === "string") return { kind: "string", value };
  if (value instanceof Date) return { kind: "string", value: value.toISOString().slice(0, 10) };
  if (typeof value === "object") {
    if (typeof value.formula === "string") return { kind: "formula", formula: value.formula.replace(/^=/, "") };
    if (Object.prototype.hasOwnProperty.call(value, "result")) return unwrap(value.result);
    if (Array.isArray(value.richText)) return { kind: "string", value: value.richText.map((part) => part.text).join("") };
    if (typeof value.text === "string") return { kind: "string", value: value.text };
  }
  return { kind: "blank" };
}

function parseFormula(input) {
  const s = String(input || "").trim().replace(/^=/, "");
  let i = 0;
  const fail = (message) => {
    const error = new Error(message);
    error.formula = s;
    throw error;
  };
  function skip() {
    while (s[i] === " ") i += 1;
  }
  function parseExpr() {
    return parseCmp();
  }
  function parseCmp() {
    const left = parseAdd();
    skip();
    if (s[i] === "=") {
      i += 1;
      return { type: "eq", left, right: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    skip();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i];
      i += 1;
      left = { type: "bin", op, left, right: parseMul() };
      skip();
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    skip();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i];
      i += 1;
      left = { type: "bin", op, left, right: parseUnary() };
      skip();
    }
    return left;
  }
  function parseUnary() {
    skip();
    if (s[i] === "+") {
      i += 1;
      return parseUnary();
    }
    if (s[i] === "-") {
      i += 1;
      return { type: "neg", value: parseUnary() };
    }
    return parsePrimary();
  }
  function parseSheet() {
    if (s[i] !== "'") return null;
    i += 1;
    let name = "";
    while (i < s.length) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") {
          name += "'";
          i += 2;
          continue;
        }
        i += 1;
        break;
      }
      name += s[i];
      i += 1;
    }
    if (s[i] !== "!") fail("A sheet reference is missing its cell.");
    i += 1;
    return name;
  }
  function parseRef(sheet) {
    skip();
    if (s[i] === "$") i += 1;
    const start = i;
    while (/[A-Za-z]/.test(s[i] || "")) i += 1;
    const letters = s.slice(start, i);
    if (!letters) fail("A cell reference is incomplete.");
    if (s[i] === "$") i += 1;
    const numStart = i;
    while (/[0-9]/.test(s[i] || "")) i += 1;
    if (numStart === i) fail("A cell reference is incomplete.");
    return { sheet, col: colNumber(letters), row: Number(s.slice(numStart, i)) };
  }
  function parsePrimary() {
    skip();
    if (s[i] === "(") {
      i += 1;
      const inner = parseExpr();
      skip();
      if (s[i] !== ")") fail("A formula is missing a closing parenthesis.");
      i += 1;
      return inner;
    }
    if (s[i] === '"') {
      i += 1;
      let text = "";
      while (i < s.length && s[i] !== '"') {
        text += s[i];
        i += 1;
      }
      if (s[i] === '"') i += 1;
      return { type: "string", value: text };
    }
    if (/[0-9.]/.test(s[i] || "")) {
      const start = i;
      while (/[0-9.]/.test(s[i] || "")) i += 1;
      return { type: "number", value: Number(s.slice(start, i)) };
    }
    const sheet = parseSheet();
    skip();
    const identStart = i;
    while (/[A-Za-z]/.test(s[i] || "")) i += 1;
    const ident = s.slice(identStart, i);
    skip();
    if (ident && s[i] === "(") {
      i += 1;
      const args = [];
      skip();
      if (s[i] !== ")") {
        args.push(parseArg(sheet));
        skip();
        while (s[i] === ",") {
          i += 1;
          args.push(parseArg(sheet));
          skip();
        }
      }
      if (s[i] !== ")") fail("A function is missing a closing parenthesis.");
      i += 1;
      return { type: "call", name: ident.toUpperCase(), args };
    }
    i = identStart;
    if (/^(TRUE|FALSE)$/i.test(ident) && !sheet) {
      i += ident.length;
      return { type: "bool", value: ident.toUpperCase() === "TRUE" };
    }
    return { type: "ref", ref: parseRef(sheet) };
  }
  function parseArg(sheet) {
    const mark = i;
    const left = parsePrimary();
    skip();
    if (s[i] === ":" && left.type === "ref") {
      i += 1;
      const right = parsePrimary();
      if (right.type !== "ref") fail("A range is incomplete.");
      return { type: "range", start: left.ref, end: right.ref };
    }
    if (left.type === "ref" || left.type === "call" || left.type === "number") return left;
    i = mark;
    return parseExpr();
  }
  const ast = parseExpr();
  skip();
  if (i < s.length) fail(`Could not read "${s.slice(i, i + 24)}".`);
  return ast;
}

function asNumber(item) {
  if (!item || item.kind === "blank") return 0;
  if (item.kind === "number") return item.value;
  if (item.kind === "bool") return item.value ? 1 : 0;
  return null;
}

function buildEngine(grid, resolveSheet = (name) => normName(name)) {
  const cache = new Map();
  const stack = new Set();
  function evalCell(sheet, row, col) {
    const key = `${resolveSheet(sheet)}|${row}|${col}`;
    if (cache.has(key)) return cache.get(key);
    if (stack.has(key)) return { kind: "error", value: "circular" };
    stack.add(key);
    const raw = grid.get(key) || { kind: "blank" };
    let result = raw;
    if (raw.kind === "formula") {
      try {
        result = evalAst(parseFormula(raw.formula), sheet);
      } catch (error) {
        result = { kind: "error", value: error.message };
      }
    }
    stack.delete(key);
    cache.set(key, result);
    return result;
  }
  function evalAst(ast, sheet) {
    if (ast.type === "number") return { kind: "number", value: ast.value };
    if (ast.type === "string") return { kind: "string", value: ast.value };
    if (ast.type === "bool") return { kind: "bool", value: ast.value };
    if (ast.type === "neg") {
      const inner = evalAst(ast.value, sheet);
      const n = asNumber(inner);
      return n == null ? { kind: "error", value: "number" } : { kind: "number", value: -n };
    }
    if (ast.type === "ref") {
      const target = ast.ref.sheet || sheet;
      return evalCell(target, ast.ref.row, ast.ref.col);
    }
    if (ast.type === "eq") {
      const left = evalAst(ast.left, sheet);
      const right = evalAst(ast.right, sheet);
      if (left.kind === "error" || right.kind === "error") return { kind: "error", value: "compare" };
      if (left.kind === "number" || right.kind === "number" || left.kind === "blank" || right.kind === "blank") {
        return { kind: "bool", value: asNumber(left) === asNumber(right) };
      }
      if (left.kind === "bool" || right.kind === "bool") return { kind: "bool", value: Boolean(left.value) === Boolean(right.value) };
      return { kind: "bool", value: String(left.value || "").toLowerCase() === String(right.value || "").toLowerCase() };
    }
    if (ast.type === "bin") {
      const left = asNumber(evalAst(ast.left, sheet));
      const right = asNumber(evalAst(ast.right, sheet));
      if (left == null || right == null) return { kind: "error", value: "number" };
      if (ast.op === "+") return { kind: "number", value: left + right };
      if (ast.op === "-") return { kind: "number", value: left - right };
      if (ast.op === "*") return { kind: "number", value: left * right };
      if (right === 0) return { kind: "error", value: "divide" };
      return { kind: "number", value: left / right };
    }
    if (ast.type === "call" && ast.name === "SUM") {
      let total = 0;
      for (const arg of ast.args) {
        if (arg.type === "range") {
          const refSheet = arg.start.sheet || arg.end.sheet || sheet;
          const r1 = Math.min(arg.start.row, arg.end.row);
          const r2 = Math.max(arg.start.row, arg.end.row);
          const c1 = Math.min(arg.start.col, arg.end.col);
          const c2 = Math.max(arg.start.col, arg.end.col);
          for (let row = r1; row <= r2; row += 1) {
            for (let col = c1; col <= c2; col += 1) {
              const item = evalCell(refSheet, row, col);
              if (item.kind === "number") total += item.value;
              else if (item.kind === "error") return item;
            }
          }
        } else {
          const item = evalAst(arg, sheet);
          if (item.kind === "error") return item;
          if (item.kind === "number") total += item.value;
        }
      }
      return { kind: "number", value: total };
    }
    return { kind: "error", value: "formula" };
  }
  return { evalCell };
}

function textOf(item) {
  if (!item || item.kind === "blank" || item.kind === "error") return "";
  if (item.kind === "string") return item.value.trim();
  if (item.kind === "number") return String(item.value);
  if (item.kind === "bool") return item.value ? "TRUE" : "FALSE";
  return "";
}

function numberOf(item) {
  if (!item) return null;
  if (item.kind === "number" && Number.isFinite(item.value)) return item.value;
  if (item.kind === "bool") return item.value ? 1 : 0;
  if (item.kind === "string" && /^-?\d+(\.\d+)?$/.test(item.value.trim())) return Number(item.value.trim());
  return null;
}

function readMatrix(sheet, engine) {
  const rows = [];
  const max = Math.max(sheet.columnCount || 1, 4);
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const source = sheet.getRow(r);
    const cells = [];
    for (let c = 1; c <= max; c += 1) {
      const cell = source.getCell(c);
      const item = engine.evalCell(sheet.name, r, c);
      const rawText = textOf(item);
      const indent = Number(cell.alignment?.indent) || (rawText.match(/^ +/) || [""])[0].length;
      const border = cell.border || {};
      cells.push({
        item,
        text: rawText.trim(),
        bold: Boolean(cell.font?.bold),
        indent,
        top: border.top?.style || "",
        bottom: border.bottom?.style || "",
      });
    }
    if (cells.some((cell) => cell.text || numberOf(cell.item) != null)) rows.push({ row: r, cells });
  }
  return rows;
}

function sameAcross(cells) {
  const texts = cells.map((cell) => cell.text).filter(Boolean);
  return texts.length > 1 && texts.every((text) => text === texts[0]);
}

function narrativeBlocks(rows) {
  const blocks = [];
  for (const row of rows) {
    if (sameAcross(row.cells) || (row.cells[0].text && row.cells.slice(1).every((cell) => !cell.text || cell.text === row.cells[0].text))) {
      const text = row.cells.find((cell) => cell.text)?.text || "";
      if (!text) continue;
      blocks.push({ type: row.cells[0].bold ? "h" : "p", text });
    }
  }
  return blocks;
}

function yearColumns(rows) {
  for (const row of rows) {
    const hits = [];
    row.cells.forEach((cell, index) => {
      if (/^(19|20)\d{2}$/.test(cell.text)) hits.push({ index, year: cell.text });
    });
    if (hits.length >= 2) return { header: row, columns: hits };
  }
  for (const row of rows) {
    const hits = [];
    row.cells.forEach((cell, index) => {
      if (index > 0 && cell.text && !/purple hat|statement|whole dollars/i.test(cell.text)) {
        hits.push({ index, year: cell.text });
      }
    });
    if (hits.length >= 2 && hits.some((hit) => /total/i.test(hit.year))) return { header: row, columns: hits };
  }
  return null;
}

function ruleFor(cell, label) {
  const name = String(label || "");
  const grand = /^(total assets)$/i.test(name)
    || /^total liabilities and /i.test(name)
    || /^cash and cash equivalents, end of year$/i.test(name)
    || /^balance, december 31,/i.test(name)
    || (/^net income$/i.test(name) && cell?.bold);
  if (cell?.bottom === "double" || grand) return "double";
  if (cell?.top === "thin" || cell?.top === "medium" || cell?.bottom === "thin" || cell?.bottom === "medium") return "single";
  if (cell?.bold && numberOf(cell.item) != null) return "single";
  return "";
}

function statementFrom(rows, fallbackTitle) {
  const located = yearColumns(rows);
  const banner = [];
  const body = [];
  const columns = located ? located.columns : [];
  for (const row of rows) {
    if (located && row.row < located.header.row) {
      const text = row.cells.find((cell) => cell.text)?.text;
      if (text && !banner.includes(text)) banner.push(text);
      continue;
    }
    if (located && row.row === located.header.row) continue;
    const label = row.cells[0]?.text || "";
    const values = columns.map((column) => numberOf(row.cells[column.index]?.item));
    const hasNumber = values.some((value) => value != null);
    if (!label && !hasNumber) continue;
    if (!hasNumber && sameAcross(row.cells)) continue;
    const noteCell = columns.length ? row.cells[columns[0].index - 1] : null;
    const note = noteCell && /^\d{1,2}$/.test(noteCell.text) ? noteCell.text : "";
    const sample = columns.length ? row.cells[columns[0].index] : row.cells[0];
    body.push({
      label,
      note,
      indent: row.cells[0]?.indent || (row.cells[0]?.bold ? 0 : 1),
      bold: Boolean(row.cells[0]?.bold || sample?.bold),
      rule: ruleFor(sample || row.cells[0], label),
      values,
    });
  }
  return {
    title: banner[1] || banner[0] || fallbackTitle,
    banner,
    columns: columns.map((column) => column.year),
    rows: body,
  };
}

function indexEntries(rows) {
  const entries = [];
  for (const row of rows) {
    const title = row.cells[0]?.text || "";
    const page = row.cells[1]?.text || row.cells.find((cell) => /^F-\d+$/i.test(cell.text))?.text || "";
    if (!title || title.toLowerCase() === "page") continue;
    if (/^purple hat demo/i.test(title) || /index to financial statements/i.test(title)) continue;
    entries.push({ title, page, indent: row.cells[0]?.indent || 0 });
  }
  return entries;
}

function isDemoLine(text) {
  return /^illustrative demo\b/i.test(String(text || "").trim());
}

function bannerText(row) {
  const texts = row.cells.map((cell) => cell.text).filter(Boolean);
  if (texts.length > 1 && texts.every((text) => text === texts[0])) return texts[0];
  return "";
}

function orderColumns(columns) {
  const over = columns.filter((column) => /over\s*60/i.test(column.header));
  const total = columns.filter((column) => /^total$/i.test(column.header.trim()));
  const rest = columns.filter((column) => !over.includes(column) && !total.includes(column));
  return [...rest, ...over, ...total];
}

function tableColumns(row) {
  const banner = bannerText(row);
  if (banner) return null;
  const hits = [];
  row.cells.forEach((cell, index) => {
    const text = String(cell.text || "").replace(/\u2013|\u2014/g, "-").trim();
    if (!text || text.length > 48) return;
    if (/^purple hat demo/i.test(text) || /^\(in whole dollars\)$/i.test(text)) return;
    hits.push({ index, header: text });
  });
  const years = hits.filter((hit) => /^(19|20)\d{2}$/.test(hit.header));
  if (years.length >= 2 && hits.every((hit) => years.includes(hit) || /december 31/i.test(hit.header))) return years;
  const buckets = hits.filter((hit) => !/^(19|20)\d{2}$/.test(hit.header) && !/december 31/i.test(hit.header));
  if (buckets.length >= 2 && buckets.some((hit) => /total|current|days|amount|cost|net/i.test(hit.header))) {
    return orderColumns(buckets);
  }
  return null;
}

function noteDocument(rows, fallback) {
  const blocks = [];
  let table = null;
  function closeTable() {
    if (table && table.rows.length) blocks.push(table);
    table = null;
  }
  const heading = rows.find((row) => /^\d+\.\s+/.test(row.cells[0]?.text || ""))?.cells[0]?.text || fallback;
  rows.forEach((row, rowIndex) => {
    const banner = bannerText(row);
    const label = banner || row.cells[0]?.text || "";
    if (isDemoLine(label) || isDemoLine(banner)) return;
    const columns = tableColumns(row);
    const next = rows[rowIndex + 1];
    const nextHasNumbers = columns && next && columns.some((column) => numberOf(next.cells[column.index]?.item) != null);
    if (columns && nextHasNumbers) {
      closeTable();
      table = {
        type: "table",
        headers: columns.map((column) => column.header),
        indexes: columns.map((column) => column.index),
        paired: columns.every((column) => /^(19|20)\d{2}$/.test(column.header)) || columns.length <= 3,
        rows: [],
      };
      return;
    }
    if (table) {
      const values = table.indexes.map((index) => numberOf(row.cells[index]?.item));
      const numeric = values.some((value) => value != null);
      const prose = Boolean(banner) || label.length > 90 || (!numeric && Boolean(row.cells[0]?.bold));
      if (!prose && (label || numeric)) {
        const labelIndex = table.indexes.includes(0) ? row.cells.findIndex((cell, index) => !table.indexes.includes(index) && cell.text) : 0;
        table.rows.push({
          label: row.cells[labelIndex]?.text || label,
          indent: row.cells[labelIndex]?.indent || row.cells[0]?.indent || 0,
          bold: Boolean(row.cells[0]?.bold),
          rule: ruleFor(row.cells[table.indexes[0]] || row.cells[0], label),
          values,
        });
        return;
      }
      closeTable();
    }
    if (!label) return;
    if (/^purple hat demo llc$/i.test(label) || /^\(in whole dollars\)$/i.test(label)) return;
    if (label === heading) return;
    const title = label.length <= 90 && (row.cells[0]?.bold || banner);
    blocks.push({ type: title ? "h" : "p", text: label });
  });
  closeTable();
  const number = Number((heading.match(/^(\d+)\./) || [])[1] || fallback.replace(/\D/g, ""));
  return { number, title: heading, blocks };
}

function amount(statement, pattern) {
  const row = statement.rows.find((item) => pattern.test(item.label));
  return row ? row.values : null;
}

function near(left, right) {
  return left != null && right != null && Math.abs(Number(left) - Number(right)) < 0.5;
}

export function validateAnnualDocument(document) {
  const errors = [...(document.errors || [])];
  const balance = document.statements.find((item) => item.key === "balance-sheets");
  const cash = document.statements.find((item) => item.key === "cash-flows");
  const equity = document.statements.find((item) => item.key === "equity");
  if (balance) {
    const assets = amount(balance, /^total assets$/i);
    const claims = amount(balance, /^total liabilities and /i);
    if (!assets || !claims) errors.push("The balance sheet is missing total assets or total liabilities and equity.");
    else assets.forEach((value, index) => {
      if (!near(value, claims[index])) errors.push(`The balance sheet does not balance for ${balance.columns[index] || "a year"}.`);
    });
  }
  if (cash) {
    const begin = amount(cash, /beginning/i);
    const change = amount(cash, /net (increase|decrease|change)/i);
    const end = amount(cash, /end of year|at end|cash and cash equivalents$/i);
    if (!begin || !change || !end) errors.push("The cash flow statement is missing the cash rollforward.");
    else begin.forEach((value, index) => {
      if (!near(Number(value) + Number(change[index]), end[index])) {
        errors.push(`The cash flow statement does not tie for ${cash.columns[index] || "a year"}.`);
      }
    });
  }
  if (balance && equity) {
    const sheetEquity = amount(balance, /total (member|members)'?s equity|total equity/i);
    const totalIndex = equity.columns.findIndex((column) => /total/i.test(column));
    const endRows = balance.columns.map((year) => equity.rows.find((row) => new RegExp(`december 31, ${year}`, "i").test(row.label)));
    if (!sheetEquity || totalIndex < 0 || endRows.some((row) => !row)) {
      errors.push("The equity rollforward could not be tied to the balance sheet.");
    } else {
      sheetEquity.forEach((value, index) => {
        if (!near(value, endRows[index].values[totalIndex])) {
          errors.push(`The equity rollforward does not tie for ${balance.columns[index] || "a year"}.`);
        }
      });
    }
  }
  const failed = (document.checks || []).filter((check) => check.ok !== true);
  if (failed.length) errors.push(`${failed.length} workings ${failed.length === 1 ? "check does" : "checks do"} not read TRUE.`);
  return errors;
}

function checksFrom(rows) {
  const checks = [];
  let armed = false;
  for (const row of rows) {
    const label = row.cells.map((cell) => cell.text).find(Boolean) || "";
    if (/tie checks/i.test(label)) armed = true;
    if (!armed) continue;
    const bools = row.cells.filter((cell) => cell.item?.kind === "bool");
    if (!bools.length) continue;
    checks.push({
      label: label || "Check",
      ok: bools.every((cell) => cell.item.value === true),
    });
  }
  return checks;
}

export async function parseAnnualWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const resolveSheet = sheetResolver(workbook.worksheets);
  const grid = new Map();
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        grid.set(`${resolveSheet(sheet.name)}|${rowNumber}|${col}`, unwrap(cell.value));
      });
    });
  }
  const engine = buildEngine(grid, resolveSheet);
  const byName = sheetsByName(workbook.worksheets);
  const errors = [];
  for (const name of REQUIRED) {
    if (!findSheet(byName, name)) errors.push(`Missing tab ${name}.`);
  }
  const sheetRows = (name) => {
    const sheet = findSheet(byName, name);
    return sheet ? readMatrix(sheet, engine) : [];
  };
  const statements = STATEMENT_SHEETS.map(([name, key]) => ({
    key,
    ...statementFrom(sheetRows(name), name),
  }));
  const notes = [];
  for (let n = 1; n <= 14; n += 1) {
    const rows = sheetRows(`Note ${n}`);
    if (rows.length) notes.push(noteDocument(rows, `Note ${n}`));
  }
  const document = {
    cover: { lines: narrativeBlocks(sheetRows("Cover")) },
    index: { entries: indexEntries(sheetRows("Index")) },
    auditor: { blocks: narrativeBlocks(sheetRows("Auditor's Report")).filter((block) => !isDemoLine(block.text)) },
    statements,
    notes,
    checks: checksFrom(sheetRows("Workings & Reconciliations")),
    errors,
  };
  document.errors = validateAnnualDocument(document);
  return document;
}

export function annualSectionTitles(document) {
  return [
    document.cover.lines[1]?.text || document.cover.lines[0]?.text || "Cover",
    "INDEX TO FINANCIAL STATEMENTS",
    "Independent Auditor's Report",
    ...document.statements.map((statement) => statement.title),
    ...document.notes.map((note) => note.title),
  ];
}

export { colNumber, colLetters };
