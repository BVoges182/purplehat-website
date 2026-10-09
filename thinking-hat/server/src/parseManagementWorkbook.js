import ExcelJS from "exceljs";

function raw(cell) {
  if (!cell) return null;
  let value = cell.value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) value = value.result;
    else if (Array.isArray(value.richText)) value = value.richText.map((part) => part.text).join("");
    else if (typeof value.text === "string") value = value.text;
    else return null;
  }
  if (value && typeof value === "object") return null;
  return value;
}

function textOf(cell) {
  const value = raw(cell);
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberOf(cell) {
  const value = raw(cell);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function cellText(row, col) {
  return textOf(row.getCell(col)).trim();
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && value.result instanceof Date && !Number.isNaN(value.result.getTime())) return value.result;
  return null;
}

function formatHeaderDate(date, numFmt) {
  const day = date.getUTCDate();
  const month = SHORT_MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const fmt = String(numFmt || "").toLowerCase();
  if (/d/.test(fmt) && /m/.test(fmt)) return `${day} ${month} ${year}`;
  return `${month} ${year}`;
}

function headerLabel(cell) {
  const date = excelDate(cell && cell.value);
  if (date) return formatHeaderDate(date, cell.numFmt);
  return textOf(cell).trim();
}

function cellBold(cell) {
  return Boolean(cell && cell.font && cell.font.bold);
}

function isTotal(label) {
  const name = String(label || "").trim();
  return /^total\b/i.test(name)
    || name === "Gross Profit"
    || name === "Net Profit"
    || name === "Net Assets"
    || name === "Net Cash Flows"
    || name.startsWith("Net Cash Flows from");
}

function isCurrencyToken(text) {
  return text === "£" || text === "R" || text === "$" || text === "ZAR" || text === "GBP";
}

function looksLikePeriodHeader(text) {
  if (!text || text.length > 24) return false;
  if (/year to date/i.test(text)) return true;
  if (/^q[1-4]$/i.test(text)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(text)) return true;
  return /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(text);
}

function isContactHeading(text) {
  return /top\s+(expenses|income)\b/i.test(text) || (/contact/i.test(text) && /(expense|income)/i.test(text));
}

function isGroupedNote(text) {
  return /grouped into other/i.test(text);
}

function findSheet(workbook, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return workbook.worksheets.find((sheet) => wanted.has(sheet.name.trim().toLowerCase())) || null;
}

function findQuarterlyProfit(workbook) {
  return findSheet(workbook, [
    "Profit and Loss Q",
    "Profit and loss Q",
    "Profit & Loss Q",
    "Profit and Loss Quarterly",
    "Profit and loss quarterly",
  ]);
}

function readQuarterlyProfit(sheet) {
  if (findPeriodHeader(sheet)) return readModernStatement(sheet, "Profit and loss quarterly");
  return readStatement(sheet, "Profit and loss quarterly", 1, [2, 3, 4, 5]);
}

function findCourtLease(workbook) {
  return workbook.worksheets.find((sheet) => /court\s*lease/i.test(sheet.name)) || null;
}

function readCourtLease(sheet) {
  if (findPeriodHeader(sheet)) return readModernStatement(sheet, "Court lease profit and loss");
  return readStatement(sheet, "Court lease profit and loss", 1, [2, 3, 4, 5]);
}

function valueFormat(cell, modern) {
  const fmt = String(cell.numFmt || "");
  if (fmt.includes("%")) return "percent";
  if (!modern) return undefined;
  if (/0\.0/.test(fmt)) return "money2";
  return "money";
}

function usesLegacyExecutive(sheet) {
  let roles = 0;
  const last = Math.min(sheet.rowCount || 40, 40);
  for (let rowNumber = 1; rowNumber <= last; rowNumber += 1) {
    const role = cellText(sheet.getRow(rowNumber), 1);
    if (role === "Line item" || role === "Heading" || role === "Sub Total" || role === "Month") roles += 1;
  }
  return roles >= 2;
}

function readExecutive(sheet) {
  const rows = [];
  const notes = [];
  let entityName = "";
  let columns = [];
  let recognised = false;
  sheet.eachRow((row) => {
    const role = textOf(row.getCell(1)).trim();
    const label = textOf(row.getCell(2));
    if (role === "Company Name" && label.trim()) {
      entityName = label.trim();
      notes.push(label.trim());
      recognised = true;
    }
    if (role === "Month End" && label.trim()) notes.push(label.trim());
    if (role === "Month") {
      columns = [3, 4, 5].map((col) => textOf(row.getCell(col)).trim()).filter(Boolean);
      recognised = true;
      return;
    }
    if (!label.trim()) return;
    if (role === "Heading") {
      rows.push({ kind: "heading", label });
      recognised = true;
    }
    if (role === "Line item") {
      rows.push({ kind: "line", label, values: [3, 4, 5].map((col) => numberOf(row.getCell(col))) });
      recognised = true;
    }
    if (role === "Sub Total") {
      rows.push({ kind: "total", label, values: [3, 4, 5].map((col) => numberOf(row.getCell(col))) });
      recognised = true;
    }
  });
  if (!recognised || !columns.length || !rows.some((row) => row.values?.some((value) => typeof value === "number"))) {
    throw new Error("The Executive summary sheet does not match the expected layout.");
  }
  return {
    title: "Executive summary",
    note: notes.join(" · "),
    labelHeader: "",
    columns,
    rows,
    entityName,
  };
}

function readStatement(sheet, title, labelCol, valueCols) {
  let headerRow = 0;
  let columns = [];
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const probe = textOf(row.getCell(labelCol)).trim() || textOf(row.getCell(1)).trim();
    if (probe === "Account") {
      headerRow = rowNumber;
      columns = valueCols.map((col) => textOf(row.getCell(col)).trim()).filter(Boolean);
      break;
    }
  }
  if (!headerRow) throw new Error(`The ${title} sheet needs an Account header.`);
  const company = textOf(sheet.getRow(2).getCell(1)).trim();
  const period = textOf(sheet.getRow(3).getCell(1)).trim();
  const rows = [];
  let blanks = 0;
  for (let rowNumber = headerRow + 1; rowNumber <= headerRow + 80; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const label = textOf(row.getCell(labelCol)) || textOf(row.getCell(1));
    if (!label.trim()) {
      blanks += 1;
      if (blanks > 3) break;
      continue;
    }
    blanks = 0;
    const values = valueCols.map((col) => numberOf(row.getCell(col)));
    const hasNumber = values.some((value) => value !== null);
    if (!hasNumber) rows.push({ kind: "heading", label });
    else if (isTotal(label)) rows.push({ kind: "total", label, values });
    else rows.push({ kind: "line", label, values });
  }
  if (!rows.some((row) => Array.isArray(row.values) && row.values.some((value) => typeof value === "number"))) {
    throw new Error(`The ${title} sheet did not contain any figures.`);
  }
  return {
    title,
    note: [company, period].filter(Boolean).join(" · "),
    labelHeader: "Account",
    columns,
    rows,
    entityName: company,
  };
}

function findPeriodHeader(sheet) {
  const last = Math.min(sheet.rowCount || 15, 15);
  for (let rowNumber = 1; rowNumber <= last; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const found = [];
    for (let col = 1; col <= 12; col += 1) {
      const text = headerLabel(row.getCell(col));
      if (looksLikePeriodHeader(text)) found.push({ col, label: text });
    }
    if (found.length >= 2) return { headerRow: rowNumber, columns: found };
  }
  return null;
}

function readCurrencyUnits(sheet, headerRow, columns) {
  const row = sheet.getRow(headerRow + 1);
  const tokens = columns.map(({ col }) => {
    const text = cellText(row, col);
    if (!text) return "";
    return isCurrencyToken(text) ? text : null;
  });
  if (tokens.some((token) => token === null)) return null;
  if (!tokens.some(Boolean)) return null;
  const inherited = tokens.find(Boolean);
  return tokens.map((token) => token || inherited);
}

function prefaceLines(sheet, headerRow) {
  const lines = [];
  for (let rowNumber = 1; rowNumber < headerRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let col = 1; col <= 3; col += 1) {
      const text = cellText(row, col);
      if (text) {
        lines.push(text);
        break;
      }
    }
  }
  return lines;
}

function isDocumentTitle(text) {
  return /^(executive summary|trading and profit and loss account|profit and loss|balance sheet|statement of cash flows)(\s+master)?$/i.test(String(text || "").trim());
}

function readModernExecutive(sheet) {
  const header = findPeriodHeader(sheet);
  if (!header) throw new Error("The Executive summary sheet does not match the expected layout.");
  const units = readCurrencyUnits(sheet, header.headerRow, header.columns);
  const lines = prefaceLines(sheet, header.headerRow);
  const titled = isDocumentTitle(lines[0]);
  const entityName = titled ? (lines[1] || "") : (lines[0] || "");
  const note = (titled ? lines.slice(1) : lines).filter(Boolean).join(" · ");
  const dataStart = units ? header.headerRow + 2 : header.headerRow + 1;
  const rows = [];
  const last = Math.min(sheet.rowCount || 120, 160);
  for (let rowNumber = dataStart; rowNumber <= last; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const label = cellText(row, 1);
    if (isContactHeading(label) || isContactHeading(cellText(row, 2))) break;
    const values = header.columns.map(({ col }) => numberOf(row.getCell(col)));
    const formats = header.columns.map(({ col }) => valueFormat(row.getCell(col), true));
    const hasNumber = values.some((value) => value !== null);
    if (!label && !hasNumber) continue;
    const bold = cellBold(row.getCell(1)) || header.columns.some(({ col }) => cellBold(row.getCell(col)));
    if (!hasNumber) rows.push({ kind: "heading", label });
    else if (!label || bold || isTotal(label)) rows.push({ kind: "total", label, values, formats });
    else rows.push({ kind: "line", label, values, formats });
  }
  if (!rows.some((row) => row.values?.some((value) => typeof value === "number"))) {
    throw new Error("The Executive summary sheet does not match the expected layout.");
  }
  return {
    entityName,
    symbol: (units || []).find(Boolean) || "£",
    section: {
      title: "Executive summary",
      note,
      labelHeader: "",
      columns: header.columns.map((column) => column.label),
      units: units || header.columns.map(() => "£"),
      rows,
    },
  };
}

function describeContact(heading) {
  return String(heading || "").replace(/\s+by\s+contact\b/gi, "").replace(/\s+/g, " ").trim();
}

function contactSortKey(section) {
  const title = section.title.toLowerCase();
  const period = /year to date/.test(title) || /april\s*[–—-]/.test(title);
  return (title.includes("expense") ? 0 : 2) + (period ? 1 : 0);
}

function headerMap(row) {
  const map = {};
  for (let col = 1; col <= 8; col += 1) {
    const text = cellText(row, col).toLowerCase();
    if (text === "rank") map.rank = col;
    else if (text === "contact") map.contact = col;
    else if (text === "spend" || text === "amount" || text === "received") map.amount = col;
  }
  if (!map.contact || !map.amount) return null;
  return map;
}

function readContactBlocks(sheet, symbol) {
  const blocks = [];
  const last = Math.min(sheet.rowCount || 200, 200);
  let rowNumber = 1;
  while (rowNumber <= last) {
    const row = sheet.getRow(rowNumber);
    const heading = cellText(row, 1) || cellText(row, 2);
    if (!isContactHeading(heading)) {
      rowNumber += 1;
      continue;
    }
    let headerRow = 0;
    for (let probe = rowNumber + 1; probe <= Math.min(rowNumber + 3, last); probe += 1) {
      if (headerMap(sheet.getRow(probe))) {
        headerRow = probe;
        break;
      }
    }
    if (!headerRow) {
      rowNumber += 1;
      continue;
    }
    const map = headerMap(sheet.getRow(headerRow));
    const rows = [];
    const notes = [];
    let cursor = headerRow + 1;
    let blanks = 0;
    for (; cursor <= last; cursor += 1) {
      const current = sheet.getRow(cursor);
      const lead = cellText(current, 1) || cellText(current, 2);
      if (isContactHeading(lead)) break;
      const rankText = map.rank ? cellText(current, map.rank) : "";
      const contact = cellText(current, map.contact);
      const amount = numberOf(current.getCell(map.amount));
      if (!rankText && !contact && amount === null) {
        blanks += 1;
        if (blanks > 15 && rows.length) {
          cursor += 1;
          break;
        }
        continue;
      }
      blanks = 0;
      if ((contact && amount === null) || (rankText && amount === null && isGroupedNote(rankText))) {
        if (contact && !isGroupedNote(contact)) notes.push(contact);
        continue;
      }
      if (!contact || amount === null || isGroupedNote(contact)) continue;
      const total = /^total\b/i.test(contact);
      rows.push({
        kind: total ? "total" : "line",
        label: contact,
        value: amount,
      });
    }
    if (rows.some((item) => typeof item.value === "number")) {
      blocks.push({
        title: describeContact(heading),
        note: notes.join(" · "),
        presentation: "contacts",
        amountHeader: cellText(sheet.getRow(headerRow), map.amount) || "Amount",
        currency: symbol || "£",
        rows,
        slices: rows.filter((item) => item.kind === "line").map((item) => ({ label: item.label, value: item.value })),
      });
    }
    rowNumber = cursor;
  }
  return blocks.sort((a, b) => contactSortKey(a) - contactSortKey(b));
}

function chooseLabelColumn(sheet, startRow, firstValueCol) {
  let first = 0;
  let second = 0;
  const last = startRow + 40;
  for (let rowNumber = startRow; rowNumber <= last; rowNumber += 1) {
    if (cellText(sheet.getRow(rowNumber), 1)) first += 1;
    if (firstValueCol > 2 && cellText(sheet.getRow(rowNumber), 2)) second += 1;
  }
  return second > first ? 2 : 1;
}

function readModernStatement(sheet, title) {
  const header = findPeriodHeader(sheet);
  if (!header) throw new Error(`The ${title} sheet does not match the expected layout.`);
  const units = readCurrencyUnits(sheet, header.headerRow, header.columns);
  const lines = prefaceLines(sheet, header.headerRow);
  const entityName = lines.length >= 3 ? lines[1] : (lines[0] || "");
  const period = lines.length >= 3 ? lines[2] : (lines[1] || "");
  const note = [entityName, period].filter(Boolean).join(" · ");
  const dataStart = units ? header.headerRow + 2 : header.headerRow + 1;
  const labelCol = chooseLabelColumn(sheet, dataStart, header.columns[0].col);
  const rows = [];
  let blanks = 0;
  for (let rowNumber = dataStart; rowNumber <= dataStart + 80; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let label = cellText(row, labelCol);
    if (!label && labelCol === 2) label = cellText(row, 1);
    const values = header.columns.map(({ col }) => numberOf(row.getCell(col)));
    const formats = header.columns.map(({ col }) => valueFormat(row.getCell(col), true));
    const hasNumber = values.some((value) => value !== null);
    if (!label && !hasNumber) {
      blanks += 1;
      if (blanks > 2) break;
      continue;
    }
    blanks = 0;
    const bold = cellBold(row.getCell(labelCol)) || header.columns.some(({ col }) => cellBold(row.getCell(col)));
    if (!hasNumber) rows.push({ kind: "heading", label });
    else if (!label || bold || isTotal(label)) rows.push({ kind: "total", label, values, formats });
    else rows.push({ kind: "line", label, values, formats });
  }
  if (!rows.some((row) => row.values?.some((value) => typeof value === "number"))) {
    throw new Error(`The ${title} sheet did not contain any figures.`);
  }
  return {
    title,
    note,
    labelHeader: "",
    columns: header.columns.map((column) => column.label),
    units: units || header.columns.map(() => "£"),
    rows,
    entityName,
  };
}

export async function parseManagementWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("Could not read that Excel file.");
  }
  const executive = findSheet(workbook, [
    "Executive Summary",
    "Executive summary",
    "Executive Summary MASTER",
    "Executive summary master",
  ]);
  const profit = findSheet(workbook, ["Profit and Loss", "Profit and loss", "Profit & Loss"]);
  const balance = findSheet(workbook, ["Balance Sheet", "Balance sheet"]);
  const cash = findSheet(workbook, ["Statement of Cash Flows", "Statement of cash flows"]);
  if (!executive || !profit || !balance || !cash) {
    throw new Error("The workbook needs four sheets: Executive summary, Profit and loss, Balance sheet, and Statement of cash flows.");
  }
  const quarterly = findQuarterlyProfit(workbook);
  const quarterlySection = quarterly ? readQuarterlyProfit(quarterly) : null;
  const court = findCourtLease(workbook);
  const courtSection = court ? readCourtLease(court) : null;
  if (usesLegacyExecutive(executive)) {
    const executiveSection = readExecutive(executive);
    const sections = [
      executiveSection,
      readStatement(profit, "Profit and loss", 1, [2, 3, 4, 5]),
      ...(quarterlySection ? [quarterlySection] : []),
      ...(courtSection ? [courtSection] : []),
      readStatement(balance, "Balance sheet", 2, [3, 4, 5]),
      readStatement(cash, "Statement of cash flows", 1, [2, 3, 4]),
    ].map(({ entityName, ...section }) => section);
    const entityName = executiveSection.entityName || "";
    return { entityName, sections };
  }
  const summary = readModernExecutive(executive);
  const contacts = readContactBlocks(executive, summary.symbol);
  const profitSection = readModernStatement(profit, "Profit and loss");
  const balanceSection = readModernStatement(balance, "Balance sheet");
  const cashSection = readModernStatement(cash, "Statement of cash flows");
  const sections = [
    summary.section,
    ...contacts,
    profitSection,
    ...(quarterlySection ? [quarterlySection] : []),
    ...(courtSection ? [courtSection] : []),
    balanceSection,
    cashSection,
  ].map(({ entityName, ...section }) => section);
  const entityName = summary.entityName || profitSection.entityName || "";
  return { entityName, sections };
}
