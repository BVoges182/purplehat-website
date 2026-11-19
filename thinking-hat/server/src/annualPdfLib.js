import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 72;
const RIGHT = 540;
const TOP = 720;
const BOTTOM = 72;
const CONTENT_W = RIGHT - LEFT;
const BODY = 10;
const TITLE = 12;
const LEADING = 1.3;
const NAVY = rgb(31 / 255, 56 / 255, 100 / 255);
const BLACK = rgb(0, 0, 0);
const BAND = rgb(204 / 255, 238 / 255, 1);

function pdfText(value) {
  return String(value ?? "")
    .replace(/\u2018|\u2019|\u2032/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2022/g, "*")
    .replace(/[^\n\r\t\u0020-\u00FF]/g, "");
}

function isDemoLine(text) {
  return /^illustrative demo\b/i.test(String(text || "").trim());
}

function headerName(entity) {
  const words = String(entity || "").match(/[A-Za-z0-9]+/g) || [];
  return words.map((word) => (/^llc$/i.test(word) ? "LLC" : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join(" ");
}

function wrapLines(text, font, size, width) {
  const clean = pdfText(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const lines = [];
  let line = "";
  const pushWord = (word) => {
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      return;
    }
    let chunk = "";
    for (const char of word) {
      const trial = chunk + char;
      if (chunk && font.widthOfTextAtSize(trial, size) > width) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = trial;
      }
    }
    line = chunk;
  };
  for (const word of clean.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      pushWord(word);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function moneyParts(value, dollar) {
  if (value == null || Number.isNaN(Number(value))) return { dollar: "", amount: "" };
  const rounded = Math.round(Number(value));
  if (rounded === 0) return { dollar: "", amount: "-" };
  const text = Math.abs(rounded).toLocaleString("en-US");
  return {
    dollar: dollar ? "$" : "",
    amount: rounded < 0 ? `(${text})` : text,
  };
}

function lifeText(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `${Math.round(Number(value))} years`;
}

function cellPlan(statement) {
  const columns = statement.columns || [];
  const kinds = statement.kinds?.length === columns.length
    ? statement.kinds
    : columns.map((column) => (/^\d{4}$/.test(String(column)) ? "year" : "money"));
  const money = kinds.filter((kind) => kind !== "life");
  const pairMoney = statement.paired !== false && money.length > 0 && (
    money.every((kind) => kind === "year")
    || (money.length <= 3 && money.every((kind) => kind === "money"))
  );
  return kinds.map((kind, index) => ({
    header: String(columns[index] ?? ""),
    kind,
    paired: kind !== "life" && pairMoney,
  }));
}

function tableWidths(plan, notes) {
  const note = notes ? 0.06 : 0;
  const lives = plan.filter((column) => column.kind === "life").length;
  const pairs = plan.filter((column) => column.paired).length;
  const plain = plan.length - lives - pairs;
  if (pairs && !plain) {
    const life = lives ? 0.14 : 0;
    let dollar = 0.055;
    let amount = 0.125;
    let caption = 1 - note - lives * life - pairs * (dollar + amount);
    if (caption < 0.34) {
      caption = 0.34;
      const pair = (1 - note - lives * life - caption) / Math.max(pairs, 1);
      dollar = pair * (0.055 / 0.18);
      amount = pair - dollar;
    }
    return { caption, note, life, dollar, amount, each: 0 };
  }
  const caption = 0.28;
  const each = (1 - note - caption) / Math.max(plain + lives, 1);
  return { caption, note, life: each, dollar: 0, amount: 0, each };
}

function dollarMarks(rows, plan) {
  const moneyAt = plan.map((column, index) => (column.kind === "life" ? -1 : index)).filter((index) => index >= 0);
  const marks = [];
  let fresh = true;
  rows.forEach((row, index) => {
    const hasNumber = moneyAt.some((slot) => row.values?.[slot] != null);
    marks[index] = hasNumber && (fresh || row.bold);
    if (row.bold && hasNumber) fresh = true;
    else if (hasNumber) fresh = false;
  });
  return marks;
}

function columnBoxes(plan, widths) {
  let x = LEFT;
  const caption = widths.caption * CONTENT_W;
  const note = widths.note * CONTENT_W;
  const boxes = [];
  x += caption;
  if (note) x += note;
  plan.forEach((column, index) => {
    if (column.paired) {
      const dollar = widths.dollar * CONTENT_W;
      const amount = widths.amount * CONTENT_W;
      boxes.push({ index, ...column, x, width: dollar + amount, dollar, amount });
      x += dollar + amount;
    } else {
      const width = (column.kind === "life" ? widths.life : widths.each) * CONTENT_W;
      boxes.push({ index, ...column, x, width, dollar: 0, amount: width });
      x += width;
    }
  });
  return { caption, note, boxes };
}

class Painter {
  constructor(pdf, regular, bold, runningHeader) {
    this.pdf = pdf;
    this.regular = regular;
    this.bold = bold;
    this.runningHeader = runningHeader;
    this.page = null;
    this.y = TOP;
  }

  newPage(chrome) {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = TOP;
    if (!chrome || !this.runningHeader) return;
    const size = BODY;
    const width = this.bold.widthOfTextAtSize(this.runningHeader, size);
    this.page.drawText(this.runningHeader, {
      x: (PAGE_W - width) / 2,
      y: PAGE_H - 40,
      size,
      font: this.bold,
      color: BLACK,
    });
  }

  ensure(height) {
    if (!this.page || this.y - height < BOTTOM) this.newPage(true);
  }

  drawRaw(text, font, size, color, align, x, width) {
    const shown = pdfText(text);
    if (!shown) {
      this.y -= size * LEADING;
      return;
    }
    const textWidth = font.widthOfTextAtSize(shown, size);
    let drawX = x;
    if (align === "center") drawX = x + Math.max(0, (width - textWidth) / 2);
    if (align === "right") drawX = x + width - textWidth;
    this.page.drawText(shown, {
      x: drawX,
      y: this.y - size,
      size,
      font,
      color,
    });
    this.y -= size * LEADING;
  }

  paragraph(text, { bold = false, center = false, size = BODY, gap = 6, color = BLACK } = {}) {
    const font = bold ? this.bold : this.regular;
    const lines = wrapLines(text, font, size, CONTENT_W);
    const box = size * LEADING;
    if (!lines.length) return;
    for (const line of lines) {
      this.ensure(box);
      this.drawRaw(line, font, size, color, center ? "center" : "left", LEFT, CONTENT_W);
    }
    this.y -= gap;
  }

  title(text) {
    const lines = wrapLines(String(text || "").toUpperCase(), this.bold, TITLE, CONTENT_W);
    const box = TITLE * LEADING;
    if (this.y - (lines.length * box + 70) < BOTTOM) this.newPage(true);
    else this.ensure(lines.length * box + 14);
    for (const line of lines) this.drawRaw(line, this.bold, TITLE, NAVY, "center", LEFT, CONTENT_W);
    this.y -= 1;
    this.page.drawLine({
      start: { x: LEFT, y: this.y },
      end: { x: RIGHT, y: this.y },
      thickness: 1.25,
      color: NAVY,
    });
    this.y -= 8;
  }

  heading(text) {
    if (this.y - 48 < BOTTOM) this.newPage(true);
    this.y -= 8;
    this.paragraph(text, { bold: true, gap: 3 });
  }

  rule(x, y, width, thickness, color = BLACK) {
    this.page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness,
      color,
    });
  }

  table(statement, { notes = false } = {}) {
    const rows = statement.rows || [];
    const plan = cellPlan(statement);
    if (!plan.length && !rows.length) return;
    const widths = tableWidths(plan, notes);
    const geometry = columnBoxes(plan, widths);
    const marks = dollarMarks(rows, plan);
    const headerHeight = this.headerHeight(plan, geometry, notes);
    const totalHeight = headerHeight + rows.reduce((sum, row) => sum + this.rowHeight(row, geometry.caption), 0);
    const room = this.y - BOTTOM;
    if (totalHeight + 8 < TOP - BOTTOM && totalHeight > room) this.newPage(true);
    this.paintHeader(plan, geometry, notes);
    rows.forEach((row, index) => {
      const height = this.rowHeight(row, geometry.caption);
      if (this.y - height < BOTTOM) {
        this.newPage(true);
        this.paintHeader(plan, geometry, notes);
      }
      this.paintRow(row, index, geometry, notes, marks[index], height);
    });
    this.y -= 6;
  }

  headerHeight(plan, geometry, notes) {
    const years = plan.some((column) => column.kind === "year");
    let lines = 1;
    for (const box of geometry.boxes) {
      const wrapped = wrapLines(box.header, this.bold, BODY, Math.max(12, box.width - 4));
      lines = Math.max(lines, wrapped.length || 1);
    }
    if (notes) lines = Math.max(lines, 1);
    return (years ? 14 : 0) + lines * BODY * LEADING + 5;
  }

  paintHeader(plan, geometry, notes) {
    const height = this.headerHeight(plan, geometry, notes);
    this.ensure(height + this.rowHeight({ label: "Sample", indent: 0 }, geometry.caption));
    const top = this.y;
    const years = geometry.boxes.filter((box) => box.kind === "year");
    if (years.length) {
      const spanLeft = years[0].x;
      const spanRight = years[years.length - 1].x + years[years.length - 1].width;
      const label = "December 31,";
      const width = this.bold.widthOfTextAtSize(label, BODY);
      this.page.drawText(label, {
        x: spanLeft + (spanRight - spanLeft - width) / 2,
        y: top - BODY,
        size: BODY,
        font: this.bold,
        color: BLACK,
      });
    }
    const headerTop = years.length ? top - 14 : top;
    const drawHeader = (text, x, width, align) => {
      const lines = wrapLines(text, this.bold, BODY, Math.max(12, width - 4));
      lines.forEach((line, lineIndex) => {
        const textWidth = this.bold.widthOfTextAtSize(line, BODY);
        let drawX = x + 2;
        if (align === "center") drawX = x + (width - textWidth) / 2;
        if (align === "right") drawX = x + width - textWidth - 2;
        this.page.drawText(line, {
          x: drawX,
          y: headerTop - BODY - lineIndex * BODY * LEADING,
          size: BODY,
          font: this.bold,
          color: BLACK,
        });
      });
    };
    if (notes) drawHeader("Note", LEFT + geometry.caption, geometry.note, "center");
    for (const box of geometry.boxes) {
      const headerX = box.paired ? box.x + box.dollar : box.x;
      const headerW = box.paired ? box.amount : box.width;
      drawHeader(box.header, headerX, headerW, "center");
    }
    const ruleX = LEFT + geometry.caption;
    this.rule(ruleX, top - height + 2, RIGHT - ruleX, 0.8);
    this.y = top - height;
  }

  rowHeight(row, captionWidth) {
    const indent = 10.8 * (row.indent || 0);
    const lines = wrapLines(row.label, row.bold ? this.bold : this.regular, BODY, Math.max(20, captionWidth - indent - 6));
    return Math.max(lines.length, 1) * BODY * LEADING + 4;
  }

  paintRow(row, index, geometry, notes, dollar, height) {
    const top = this.y;
    if (index % 2 === 1) {
      this.page.drawRectangle({
        x: LEFT,
        y: top - height,
        width: CONTENT_W,
        height,
        color: BAND,
      });
    }
    if (row.rule === "single" || row.rule === "double") this.rule(LEFT, top - 0.4, CONTENT_W, 0.7);
    const font = row.bold ? this.bold : this.regular;
    const indent = 10.8 * (row.indent || 0);
    const lines = wrapLines(row.label, font, BODY, Math.max(20, geometry.caption - indent - 6));
    const baseline = top - height + 3.5;
    lines.forEach((line, lineIndex) => {
      this.page.drawText(line, {
        x: LEFT + 2 + indent,
        y: baseline + (lines.length - 1 - lineIndex) * BODY * LEADING,
        size: BODY,
        font,
        color: BLACK,
      });
    });
    if (notes && row.note) {
      const note = pdfText(row.note);
      const noteWidth = this.regular.widthOfTextAtSize(note, BODY);
      this.page.drawText(note, {
        x: LEFT + geometry.caption + (geometry.note - noteWidth) / 2,
        y: baseline,
        size: BODY,
        font: this.regular,
        color: BLACK,
      });
    }
    for (const box of geometry.boxes) {
      const value = row.values?.[box.index];
      if (box.kind === "life") {
        const life = lifeText(value);
        if (!life) continue;
        const lifeWidth = font.widthOfTextAtSize(life, BODY);
        this.page.drawText(life, {
          x: box.x + (box.width - lifeWidth) / 2,
          y: baseline,
          size: BODY,
          font,
          color: BLACK,
        });
        continue;
      }
      const parts = moneyParts(value, box.paired && dollar);
      if (box.paired && parts.dollar) {
        const dollarWidth = font.widthOfTextAtSize(parts.dollar, BODY);
        this.page.drawText(parts.dollar, {
          x: box.x + box.dollar - dollarWidth - 3,
          y: baseline,
          size: BODY,
          font,
          color: BLACK,
        });
      }
      if (!parts.amount) continue;
      const amountWidth = font.widthOfTextAtSize(parts.amount, BODY);
      const amountX = box.paired ? box.x + box.dollar : box.x;
      const amountW = box.paired ? box.amount : box.width;
      this.page.drawText(parts.amount, {
        x: amountX + amountW - amountWidth - 2,
        y: baseline,
        size: BODY,
        font,
        color: BLACK,
      });
    }
    if (row.rule === "double") {
      this.rule(LEFT, top - height + 1.6, CONTENT_W, 0.6);
      this.rule(LEFT, top - height + 0.4, CONTENT_W, 0.6);
    }
    this.y = top - height;
  }

  stampFooters() {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      if (index === 0) return;
      const label = `F-${index}`;
      const size = 8;
      const width = this.regular.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (PAGE_W - width) / 2,
        y: 36,
        size,
        font: this.regular,
        color: NAVY,
      });
    });
  }
}

function drawCover(painter, lines) {
  painter.newPage(false);
  const items = lines.map((line, index) => {
    const text = line.text || "";
    const demo = isDemoLine(text);
    const short = text.length < 90 || line.type === "h";
    return {
      text: index === 1 ? text.toUpperCase() : text,
      font: index < 2 || line.type === "h" || demo ? painter.bold : painter.regular,
      size: index < 2 ? TITLE : BODY,
      color: index < 2 ? NAVY : BLACK,
      center: short,
      gap: demo ? 2 : (short ? 3 : 4),
      rule: index === 1,
    };
  });
  let height = 0;
  for (const item of items) {
    const width = item.center ? CONTENT_W : CONTENT_W;
    const wrapped = wrapLines(item.text, item.font, item.size, width);
    height += Math.max(wrapped.length, 1) * item.size * LEADING + item.gap + (item.rule ? 8 : 0);
  }
  painter.y = Math.min(TOP, 396 + height / 2);
  items.forEach((item) => {
    const wrapped = wrapLines(item.text, item.font, item.size, CONTENT_W);
    for (const line of wrapped) {
      painter.drawRaw(line, item.font, item.size, item.color, item.center ? "center" : "left", LEFT, CONTENT_W);
    }
    if (item.rule) {
      painter.y -= 4;
      painter.page.drawLine({
        start: { x: LEFT + 36, y: painter.y },
        end: { x: RIGHT - 36, y: painter.y },
        thickness: 1.25,
        color: NAVY,
      });
      painter.y -= 6;
    }
    painter.y -= item.gap;
  });
}

function drawProse(painter, blocks) {
  for (const block of blocks) {
    if (!block?.text || isDemoLine(block.text)) continue;
    if (block.type === "h") painter.heading(block.text);
    else painter.paragraph(block.text, { gap: 6 });
  }
}

export async function renderAnnualPdfLib(statement) {
  const document = statement?.document;
  if (!document?.cover?.lines) throw new Error("The statement has no pages to print.");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const entity = document.cover.lines[0]?.text || "";
  const painter = new Painter(pdf, regular, bold, headerName(entity));
  pdf.setTitle(`${headerName(entity)} Audited Financial Statements FY${statement.year || ""}`.trim());
  pdf.setAuthor(headerName(entity));

  drawCover(painter, document.cover.lines);
  painter.newPage(true);
  painter.title("Index to Financial Statements");
  for (const [index, entry] of (document.index?.entries || []).entries()) {
    const rowH = 16;
    painter.ensure(rowH);
    const top = painter.y;
    if (index % 2 === 1) {
      painter.page.drawRectangle({
        x: LEFT,
        y: top - rowH,
        width: CONTENT_W,
        height: rowH,
        color: BAND,
      });
    }
    const indent = entry.indent ? 18 : 0;
    const label = pdfText(entry.title);
    const pageLabel = pdfText(entry.page);
    const baseline = top - 12;
    painter.page.drawText(label, {
      x: LEFT + 3 + indent,
      y: baseline,
      size: BODY,
      font: painter.regular,
      color: BLACK,
    });
    const pageWidth = painter.regular.widthOfTextAtSize(pageLabel, BODY);
    painter.page.drawText(pageLabel, {
      x: RIGHT - 3 - pageWidth,
      y: baseline,
      size: BODY,
      font: painter.regular,
      color: BLACK,
    });
    painter.y = top - rowH;
  }

  painter.newPage(true);
  painter.title("Independent Auditor's Report");
  drawProse(painter, (document.auditor?.blocks || []).filter((block) => {
    return String(block.text || "").trim().toLowerCase() !== "independent auditor's report";
  }));

  for (const item of document.statements || []) {
    painter.newPage(true);
    painter.title(item.title || "Financial statement");
    painter.paragraph("(in whole dollars)", { center: true, gap: 4 });
    painter.table(item, { notes: true });
    painter.paragraph("See accompanying notes to the financial statements.", { size: 8, gap: 0 });
  }

  let notePage = false;
  for (const note of document.notes || []) {
    if (!notePage) {
      painter.newPage(true);
      notePage = true;
    } else if (painter.y < TOP - 8) {
      painter.y -= 12;
    }
    painter.title(note.title || `Note ${note.number}`);
    if ((note.blocks || []).some((block) => block.type === "table")) {
      painter.paragraph("(in whole dollars)", { center: true, gap: 4 });
    }
    for (const block of note.blocks || []) {
      if (block.type === "table") {
        painter.table({
          columns: block.headers,
          rows: block.rows,
          paired: block.paired,
          kinds: block.kinds,
        }, { notes: false });
      } else if (block.type === "h") painter.heading(block.text);
      else if (!isDemoLine(block.text)) painter.paragraph(block.text, { gap: 6 });
    }
  }

  painter.stampFooters();
  return Buffer.from(await pdf.save());
}
