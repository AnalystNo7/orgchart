#!/usr/bin/env node
/**
 * Сборка DOCX реестра требований из harness/REQUIREMENTS.md
 * в оформлении корпоративного образца.
 *
 * Оформление берётся из шаблона-донора scripts/requirements-docx/template/
 * (стили, нумерация, колонтитулы, тема — извлечены из образца заказчика).
 * Скрипт генерирует только word/document.xml + docProps, затем пакует .docx.
 *
 * Запуск:  node scripts/requirements-docx/build.mjs [выходной-файл.docx]
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const TEMPLATE = path.join(HERE, "template");
const SOURCE_MD = path.join(ROOT, "harness/REQUIREMENTS.md");

// --- титульный лист ---------------------------------------------------------
const TITLE = {
  project: "OrgChart Modeler «Цифровой двойник организации»",
  heading: "РЕЕСТР ТРЕБОВАНИЙ",
  revision: "Редакция от 22.08.2026",
  sourceLabel: "Источник требований:",
  sourceValue: "Офис ПРО",
};

// --- разметка: значения совпадают с образцом --------------------------------
const PAGE_PORTRAIT =
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"' +
  ' w:header="708" w:footer="708" w:gutter="0"/>' +
  '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/>';
const PAGE_LANDSCAPE =
  '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
  '<w:pgMar w:top="1701" w:right="1134" w:bottom="850" w:left="1134"' +
  ' w:header="708" w:footer="708" w:gutter="0"/>' +
  '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/>';

const TBL_PR = (widthDxa) =>
  "<w:tblPr>" +
  `<w:tblW w:w="${widthDxa}" w:type="dxa"/>` +
  "<w:tblBorders>" +
  ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
    .join("") +
  "</w:tblBorders>" +
  '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>' +
  '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1"' +
  ' w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
  "</w:tblPr>";
const CELL_MAR =
  '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>' +
  '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>';

// Ширины колонок — как в образце.
const CLASSIFICATION_COLS = [1055, 3776, 4524];
const MATRIX_COLS = [895, 698, 4404, 1055, 1295, 1487, 2173, 2563];

// Заголовки H2: группы требований и подразделы служебной части.
const H2_TITLES = new Set([
  "Бизнес-требования (BR)",
  "Пользовательские требования (UR)",
  "Функциональные требования (FR)",
  "Нефункциональные требования (NFR)",
  "Бизнес-правила (RULE)",
  "Ограничения (CON)",
  "Конфликтующие требования",
  "Открытые вопросы (сводно)",
  "Предположения",
  "Риски",
]);
const CARD_RE = /^(?:BR|UR|FR|NFR|RULE|CON)-\d{3} — /;

// --- утилиты ----------------------------------------------------------------
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Инлайн-разметка: **жирный** и `код` (код — обычным текстом, как в образце). */
function runs(text, extraRpr = "") {
  const clean = text.replace(/`([^`]*)`/g, "$1");
  const out = [];
  for (const part of clean.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    const bold = part.startsWith("**") && part.endsWith("**");
    const body = bold ? part.slice(2, -2) : part;
    const rpr = (bold ? "<w:b/><w:bCs/>" : "") + extraRpr;
    out.push(
      `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}` +
        `<w:t xml:space="preserve">${esc(body)}</w:t></w:r>`
    );
  }
  return out.join("");
}

let bookmarkId = 1;
let tocAnchor = 900000000;
/** H1/H2 — с закладкой, чтобы поле TOC давало рабочие гиперссылки. */
function heading(level, text) {
  const id = bookmarkId++;
  const name = `_Toc${++tocAnchor}`;
  const spacing =
    level === 1
      ? '<w:spacing w:after="120"/>'
      : '<w:spacing w:before="320" w:after="120"/>';
  return (
    `<w:p><w:pPr><w:pStyle w:val="${level}"/>${spacing}</w:pPr>` +
    `<w:bookmarkStart w:id="${id}" w:name="${name}"/>` +
    `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
    `<w:bookmarkEnd w:id="${id}"/></w:p>`
  );
}
/** H3 — заголовок карточки требования; в оглавление (1-2) не попадает. */
const heading3 = (text) =>
  `<w:p><w:pPr><w:pStyle w:val="3"/></w:pPr>` +
  `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/** Поле карточки и строка сводки: отступ 567, выключка по ширине. */
const fieldPara = (text) =>
  `<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="567"/>` +
  `<w:jc w:val="both"/></w:pPr>${runs(text)}</w:p>`;

const bulletPara = (text) =>
  `<w:p><w:pPr><w:pStyle w:val="a4"/>` +
  `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>` +
  `<w:spacing w:after="60"/><w:jc w:val="both"/></w:pPr>${runs(text)}</w:p>`;

const italicPara = (text) =>
  `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>` +
  `<w:r><w:rPr><w:i/><w:iCs/></w:rPr>` +
  `<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

const centered = (text, sz, bold) => {
  const rpr =
    (bold ? "<w:b/><w:bCs/>" : "") +
    (sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : "");
  return (
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
    (text
      ? `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}` +
        `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
      : "") +
    "</w:p>"
  );
};

function table(rows, cols, fontSz) {
  const grid = cols.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const total = cols.reduce((a, b) => a + b, 0);
  const body = rows
    .map((cells, ri) => {
      const header = ri === 0;
      const tcs = cells
        .map((cell, ci) => {
          const shd = header
            ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>'
            : "";
          const rpr =
            (header ? "<w:b/><w:bCs/>" : "") +
            `<w:sz w:val="${fontSz}"/><w:szCs w:val="${fontSz}"/>`;
          const jc = header ? '<w:jc w:val="center"/>' : "";
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${cols[ci]}" w:type="dxa"/>${shd}` +
            `${CELL_MAR}<w:vAlign w:val="center"/></w:tcPr>` +
            `<w:p>${jc ? `<w:pPr>${jc}</w:pPr>` : ""}` +
            `${runs(cell, rpr)}</w:p></w:tc>`
          );
        })
        .join("");
      const trPr = header ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      return `<w:tr>${trPr}${tcs}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${TBL_PR(total)}<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const sectPr = (page, footerRid) =>
  "<w:sectPr>" +
  (footerRid ? `<w:footerReference w:type="default" r:id="${footerRid}"/>` : "") +
  page +
  "</w:sectPr>";
/** Разрыв секции = пустой абзац, несущий свойства завершаемой секции. */
const sectionBreak = (page, footerRid) =>
  `<w:p><w:pPr>${sectPr(page, footerRid)}</w:pPr></w:p>`;

// --- разбор markdown --------------------------------------------------------
function parse(md) {
  const text = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|/.test(line.trim()) && /^\|/.test((lines[i + 1] || "").trim())) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (!/^\|[\s\-|:]+\|$/.test(l)) {
          rows.push(
            l
              .replace(/^\||\|$/g, "")
              .split(/(?<!\\)\|/)
              .map((c) => c.trim().replace(/\\\|/g, "|"))
          );
        }
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      const t = line.replace(/^#+\s*/, "").trim();
      blocks.push({ type: "heading", text: t });
    } else if (/^- /.test(line)) {
      blocks.push({ type: "item", text: line.slice(2).trim() });
    } else if (/^_.+_\.?$/.test(line.trim())) {
      blocks.push({
        type: "italic",
        text: line.trim().replace(/^_/, "").replace(/_\.?$/, "") + ".",
      });
    } else if (line.trim() === "---") {
      blocks.push({ type: "rule" });
    } else if (line.trim()) {
      blocks.push({ type: "para", text: line.trim() });
    }
    i++;
  }
  return blocks;
}

// --- сборка document.xml ----------------------------------------------------
function buildDocument(blocks) {
  const out = [];

  // Секция 1 — титульный лист, без колонтитула.
  out.push(centered(""), centered(""), centered(""));
  out.push(centered(TITLE.project, 32, true));
  out.push(centered(""));
  out.push(centered(TITLE.heading, 40, true));
  out.push(centered(""));
  out.push(centered(TITLE.revision));
  out.push(centered(""));
  out.push(centered(TITLE.sourceLabel));
  out.push(centered(TITLE.sourceValue));
  out.push(centered(""));
  out.push(sectionBreak(PAGE_PORTRAIT, null));

  // Оглавление — настоящее поле, обновляется в Word по F9.
  out.push(heading(1, "Оглавление"));
  out.push(
    "<w:sdt><w:sdtPr><w:alias w:val=\"Оглавление\"/><w:id w:val=\"953207291\"/>" +
      "<w:docPartObj><w:docPartGallery w:val=\"Table of Contents\"/><w:docPartUnique/>" +
      "</w:docPartObj></w:sdtPr><w:sdtContent>" +
      '<w:p><w:pPr><w:pStyle w:val="11"/>' +
      '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9345"/></w:tabs>' +
      "<w:rPr><w:noProof/></w:rPr></w:pPr>" +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve">TOC \\h \\o "1-2"</w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      "<w:r><w:t>Обновите оглавление: правый клик → «Обновить поле» (или F9).</w:t></w:r>" +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      "</w:p></w:sdtContent></w:sdt>"
  );

  // Основная часть: до «Матрицы связности».
  let idx = 0;
  const emitUntil = (stopTitle) => {
    while (idx < blocks.length) {
      const b = blocks[idx];
      if (b.type === "heading" && b.text === stopTitle) return;
      idx++;
      if (b.type === "rule") continue;
      if (b.type === "heading") {
        // Заголовок самого документа на титуле уже есть — в тело не выводим.
        if (b.text.startsWith("Требования: ")) continue;
        if (CARD_RE.test(b.text)) out.push(heading3(b.text));
        else if (H2_TITLES.has(b.text)) out.push(heading(2, b.text));
        else out.push(heading(1, b.text));
      } else if (b.type === "table") {
        const cols =
          b.rows[0].length === 3 ? CLASSIFICATION_COLS : MATRIX_COLS;
        out.push(table(b.rows, cols, b.rows[0].length === 3 ? 22 : 18));
      } else if (b.type === "item") {
        // Поля карточек и строки сводки — абзацы, прочие пункты — маркеры.
        out.push(/^\*\*[^*]+:\*\*/.test(b.text) ? fieldPara(b.text) : bulletPara(b.text));
      } else if (b.type === "italic") {
        out.push(italicPara(b.text));
      } else if (b.type === "para") {
        out.push(fieldPara(b.text));
      }
    }
  };

  emitUntil("Матрица связности");
  out.push(sectionBreak(PAGE_PORTRAIT, "rId7"));

  // Секция 3 — матрица, альбомная ориентация.
  emitUntil("Журнал изменений документа");
  out.push(sectionBreak(PAGE_LANDSCAPE, "rId8"));

  // Секция 4 — журнал изменений, портрет.
  emitUntil(null);

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"' +
    ' mc:Ignorable="w14">' +
    "<w:body>" +
    out.join("") +
    sectPr(PAGE_PORTRAIT, "rId9") +
    "</w:body></w:document>"
  );
}

// --- docProps ---------------------------------------------------------------
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const coreXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
  ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
  ' xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  `<dc:title>${esc(TITLE.project)} — ${esc(TITLE.heading)}</dc:title>` +
  `<dc:creator>${esc(TITLE.sourceValue)}</dc:creator>` +
  `<cp:lastModifiedBy>${esc(TITLE.sourceValue)}</cp:lastModifiedBy>` +
  "<cp:revision>1</cp:revision>" +
  `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>` +
  `<dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>` +
  "</cp:coreProperties>";
const appXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"' +
  ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  "<Application>Microsoft Office Word</Application>" +
  "<DocSecurity>0</DocSecurity>" +
  "<ScaleCrop>false</ScaleCrop>" +
  "<LinksUpToDate>false</LinksUpToDate>" +
  "<SharedDoc>false</SharedDoc>" +
  "<HyperlinksChanged>false</HyperlinksChanged>" +
  "<AppVersion>16.0000</AppVersion>" +
  "</Properties>";

// --- минимальный ZIP-писатель ----------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(8, 8); // deflate
    lh.writeUInt32LE(0, 10); // time/date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// --- main -------------------------------------------------------------------
function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory()
      ? walk(full, base)
      : [{ name: path.relative(base, full).split(path.sep).join("/"), data: fs.readFileSync(full) }];
  });
}

const outPath =
  process.argv[2] || path.join(ROOT, "Требования OrgChart Modeler.docx");

const blocks = parse(fs.readFileSync(SOURCE_MD, "utf8"));
const documentXml = buildDocument(blocks);

const entries = [
  // [Content_Types].xml обязан идти первым в архиве.
  ...walk(TEMPLATE).sort((a, b) =>
    a.name === "[Content_Types].xml" ? -1 : b.name === "[Content_Types].xml" ? 1 : 0
  ),
  { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  { name: "docProps/core.xml", data: Buffer.from(coreXml, "utf8") },
  { name: "docProps/app.xml", data: Buffer.from(appXml, "utf8") },
];

fs.writeFileSync(outPath, zip(entries));
console.log(
  `Готово: ${outPath}\n` +
    `  карточек: ${(documentXml.match(/w:val="3"\/>/g) || []).length}` +
    `  таблиц: ${(documentXml.match(/<w:tbl>/g) || []).length}` +
    `  секций: ${(documentXml.match(/<w:sectPr>/g) || []).length}`
);
