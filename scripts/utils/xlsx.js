/**
 * เขียนไฟล์ Excel (.xlsx) จริง โดยไม่ใช้ไลบรารีภายนอก (CSP อนุญาตเฉพาะสคริปต์ของเว็บเอง)
 *
 * รองรับ: ข้อความ (ภาษาไทย) · ตัวเลข · วันที่ (แสดงเป็น พ.ศ. ตัวเลขอารบิก)
 *         หัวตารางตัวหนา · ความกว้างคอลัมน์ · ตรึงแถวหัว · ปุ่มกรองของ Excel
 *
 *   downloadXlsx('ทะเบียน PR.xlsx', {
 *     sheet: 'PR', columns: [{ title: 'PR No.', width: 14 }, { title: 'วันที่', width: 12, type: 'date' }],
 *     rows: [['6901-001', new Date()]],
 *   });
 */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // อักขระควบคุมทำให้ Excel แจ้งว่าไฟล์เสีย
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** เลขคอลัมน์ → ตัวอักษร (0 → A, 26 → AA) */
const colName = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** วันที่ → เลขลำดับวันของ Excel (ตามเวลาท้องถิ่น ไม่เลื่อนวันจากเขตเวลา) */
const excelDate = (d) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;

// สไตล์: 0 ปกติ · 1 หัวตาราง · 2 วันที่ พ.ศ. · 3 ข้อความตัดบรรทัด · 4 ตัวเลข
const STYLES = XML_HEAD + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="[$-1070000]dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B3B7A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFC9D3DF"/></left><right style="thin"><color rgb="FFC9D3DF"/></right><top style="thin"><color rgb="FFC9D3DF"/></top><bottom style="thin"><color rgb="FFC9D3DF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="right" vertical="top"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function cellXml(ref, v, type) {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${type === 'date' ? 2 : 0}"/>`;
  if (type === 'date') {
    const d = v instanceof Date ? v : new Date(v);
    if (!isNaN(d)) return `<c r="${ref}" s="2"><v>${excelDate(d)}</v></c>`;
  }
  if (type === 'number' && v !== '' && !isNaN(Number(v))) return `<c r="${ref}" s="4"><v>${Number(v)}</v></c>`;
  return `<c r="${ref}" s="${type === 'wrap' ? 3 : 0}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

function sheetXml(columns, rows) {
  const last = colName(columns.length - 1);
  const head = `<row r="1" ht="24" customHeight="1">${columns.map((c, i) =>
    `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.title)}</t></is></c>`).join('')}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, i) =>
    cellXml(`${colName(i)}${ri + 2}`, r[i], c.type)).join('')}</row>`).join('');
  return XML_HEAD + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${head}${body}</sheetData>
${rows.length ? `<autoFilter ref="A1:${last}${rows.length + 1}"/>` : ''}
<pageSetup orientation="landscape" paperSize="9"/>
</worksheet>`;
}

/* ───── ZIP แบบไม่บีบอัด (STORE) ───── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  files.forEach(({ name, data }) => {
    const nameB = enc.encode(name); const body = enc.encode(data); const crc = crc32(body);
    // ตั้งบิต 11 = ชื่อไฟล์เป็น UTF-8
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(nameB.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...common]);
    parts.push(local, nameB, body);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
    offset += local.length + nameB.length + body.length;
  });
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** สร้างไฟล์ .xlsx (Blob) */
export function buildXlsx({ sheet = 'Sheet1', columns, rows }) {
  const name = xmlEsc(String(sheet).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  return zip([
    { name: '[Content_Types].xml', data: XML_HEAD + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: XML_HEAD + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
${rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name}'!$A$1:$${colName(columns.length - 1)}$${rows.length + 1}</definedName></definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(columns, rows) },
  ]);
}

/** สร้างแล้วสั่งดาวน์โหลดทันที */
export function downloadXlsx(filename, spec) {
  const url = URL.createObjectURL(buildXlsx(spec));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
