/**
 * ส่งออกใบยืม-คืนอุปกรณ์ (FM-PUR-006) และบันทึกโอนย้ายเครื่องมืออุปกรณ์ (FM-PUR-008)
 * เป็นไฟล์ Excel ต้นฉบับ ISO (assets/forms/) — กรอกเฉพาะข้อมูล ไม่เปลี่ยนแบบฟอร์ม
 *
 * ชื่อในวงเล็บใต้ช่องลงนาม และวันที่ มาจากประวัติของคำขอ:
 *   FM-PUR-006  ผู้เบิก = ผู้ยื่น · ผู้จ่าย = คนที่อัปเดต "จ่ายอุปกรณ์แล้ว" · ผู้คืน = ผู้ยื่น · ผู้รับคืน = คนที่อัปเดต "คืนครบแล้ว"
 *   FM-PUR-008  ผู้เบิก = ผู้ยื่น · ผู้ตรวจสอบ = ลำดับอนุมัติแรก · ผู้อนุมัติ = ลำดับอนุมัติสุดท้าย
 *               ผู้ส่ง / ผู้รับ = ช่องในแบบฟอร์ม · วันที่ = วันที่อัปเดต "ส่งมอบแล้ว"
 *
 * ลายเซ็น (เฉพาะหน้า PDF): วางรูปบนเส้นจุดของช่องลงนาม — sigs: { เซลล์เส้นจุด: url }
 *   ผู้เบิก = ลายเซ็นผู้ยื่น (_requesterSign) · ผู้จ่าย/ผู้รับคืน/ผู้ตรวจสอบ/ผู้อนุมัติ = ลายเซ็นในประวัติของขั้นนั้น
 */
import { fillXlsxTemplate } from '../utils/xlsx-template.js';
import { eqFormKind, LOAN_ST, MOVE_ST, findEq, equipment, eqCode } from '../services/equipment.js';
import { PURCHASE_ACTION } from '../services/requests.js';

const clean = (v) => (v && typeof v === 'object'
  ? String(v.Title ?? v.LookupValue ?? v.Value ?? '') : String(v ?? '')).replace(/\s+/g, ' ').trim();
const rowsOf = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch (e) { return []; } })());
const valuesOf = (req) => { try { return JSON.parse(req.FormData || '{}') || {}; } catch (e) { return {}; } };
/** วันที่แบบเอกสาร dd/mm/yyyy (พ.ศ.) */
const dmy = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : '';
};
/** ชื่อในวงเล็บ: ความกว้างเท่าต้นฉบับ "(                                          )" */
const paren = (name) => {
  const n = clean(name);
  if (!n) return '(                                          )';
  const pad = Math.max(2, Math.round((40 - n.length) / 2));
  return `(${' '.repeat(pad)}${n}${' '.repeat(pad)})`;
};
/** บันทึกล่าสุดที่อัปเดตเป็นสถานะนี้ */
const statusLog = (log, st) => log.filter((l) => l.action === PURCHASE_ACTION && String(l.note || '').split(' — ')[0].trim() === st).slice(-1)[0] || null;
const num = (v) => (String(v ?? '').trim() !== '' && !isNaN(+v) ? +v : clean(v));
const sigOf = (v) => String((v && v._requesterSign && v._requesterSign.url) || '').trim();
const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, u]) => u));
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; };

/* ───────── FM-PUR-006 ใบยืม - คืนอุปกรณ์ ───────── */
const LOAN_FIRST = 15;
const LOAN_ROWS = 24;           // แถว 15–38

function loanPages(req, log) {
  const v = valuesOf(req);
  const out = statusLog(log, LOAN_ST.out);
  const back = statusLog(log, LOAN_ST.back);
  const items = rowsOf(v.br_items);
  const br = clean(v.br_no);
  const addr = clean(v.br_address).split(/\r?\n/);
  const pages = chunk(items, LOAN_ROWS);
  return pages.map((part, p) => {
    const cells = {
      D2: br, L2: dmy(v.std_date || req.SubmittedDate), D3: clean(v.br_ref), L3: clean(v.br_doc_contact),
      C6: clean(v.br_project), C7: clean(v.br_owner), C8: addr[0] || '', C9: addr.slice(1).join(' '), C10: clean(v.br_system),
      L6: clean(v.br_contact), L7: clean(v.br_tel), L8: clean(v.br_contact_address), L10: clean(v.br_location),
      L11: dmy(v.br_delivery_date),
      B39: `Note : ${clean(v.br_note)}${pages.length > 1 ? `  (หน้า ${p + 1}/${pages.length})` : ''}`,
      F43: clean(v.br_ship), F44: clean(v.br_truck), F45: clean(v.br_driver), F46: clean(v.br_driver_tel),
      B51: paren(req.RequesterName), B52: `วันที่ : ${dmy(req.SubmittedDate)}`,
      H51: paren(out && out.by), H52: `วันที่ : ${dmy(out && out.at)}`,
      B57: paren(back ? req.RequesterName : ''), B58: `วันที่ ${back ? `: ${dmy(back.at)}` : ''}`,
      H57: paren(back && back.by), H58: `วันที่ : ${dmy(back && back.at)}`,
    };
    part.forEach((it, i) => {
      const r = LOAN_FIRST + i;
      const code = clean(it.code).split(' · ')[0];
      cells[`A${r}`] = p * LOAN_ROWS + i + 1;
      cells[`B${r}`] = [code, clean(it.desc)].filter(Boolean).join(' : ');
      cells[`I${r}`] = num(it.qty); cells[`L${r}`] = clean(it.unit);
      cells[`O${r}`] = clean(it.status); cells[`P${r}`] = clean(it.remark);
    });
    const sigs = pick({ B50: sigOf(v), H50: out && out.sig, H56: back && back.sig });
    return { name: p ? `${br || 'BR'} (${p + 1})` : (br || 'BR'), cells, sigs };
  });
}

/* ───────── FM-PUR-008 บันทึกโอนย้ายเครื่องมืออุปกรณ์ ───────── */
const MOVE_FIRST = 5;
const MOVE_BLOCK = 5;           // 1 รายการ = 5 แถว (ชื่อ ยี่ห้อ รุ่น + 2 บรรทัดว่าง)
const MOVE_ITEMS = 5;           // แถว 5–29

function movePages(req, log, steps, eqRows) {
  const v = valuesOf(req);
  const done = statusLog(log, MOVE_ST.done);
  const orders = steps.map((s) => +s.StepOrder).sort((a, b) => a - b);
  const actOf = (n) => log.filter((l) => l.step === n && l.action === 'อนุมัติ').slice(-1)[0] || null;
  const check = orders.length ? actOf(orders[0]) : null;
  const approve = orders.length > 1 ? actOf(orders[orders.length - 1]) : null;
  const items = rowsOf(v.mv_items);
  const pages = chunk(items, MOVE_ITEMS);
  return pages.map((part, p) => {
    const cells = {
      B2: clean(v.mv_project), H2: dmy(v.std_date || req.SubmittedDate), B3: clean(v.mv_from), H3: clean(v.mv_to),
      A34: paren(req.RequesterName), A35: `Date : ${dmy(req.SubmittedDate)}`,
      E34: paren(check && check.by), E35: `Date : ${dmy(check && check.at)}`,
      I34: paren(approve && approve.by), I35: `Date : ${dmy(approve && approve.at)}`,
      E39: paren(v.mv_sender), E40: `Date : ${dmy(done && done.at)}`,
      I39: paren(v.mv_receiver), I40: `Date : ${dmy(done && done.at)}`,
    };
    part.forEach((it, i) => {
      const r = MOVE_FIRST + i * MOVE_BLOCK;
      const e = findEq(eqRows, it.code);
      const code = e ? eqCode(e) : clean(it.code).split(' · ')[0];
      cells[`A${r}`] = p * MOVE_ITEMS + i + 1;
      cells[`B${r}`] = code;
      cells[`E${r}`] = `ชื่อ : ${clean(it.name)}`;
      cells[`E${r + 1}`] = `ยี่ห้อ : ${clean(it.brand)}`;
      cells[`E${r + 2}`] = `รุ่น : ${clean(it.model)}`;
      if (e && clean(e.SerialNo)) cells[`E${r + 3}`] = `S/N : ${clean(e.SerialNo)}`;
      cells[`I${r}`] = num(it.qty); cells[`J${r}`] = clean(it.unit); cells[`K${r}`] = clean(it.remark);
    });
    const sigs = pick({ A33: sigOf(v), E33: check && check.sig, I33: approve && approve.sig });
    return { name: p ? `Template (${p + 1})` : 'Template', cells, sigs };
  });
}

/** ปุ่มนี้ใช้กับคำขอนี้ได้ไหม */
export const hasEqXlsx = (req) => !!eqFormKind(clean(req && req.FormCode))
  || /^FM-PUR-00[68]-/i.test(clean(req && req.Title));

/** ส่งออกไฟล์ Excel ต้นฉบับของคำขอนี้ */
export async function exportEqXlsx(req, opts = {}) {
  const s = await sheetsOf(req, opts);
  return fillXlsxTemplate(s.url, s.pages, `${s.name}.xlsx`);
}

/** ข้อมูลหน้า Excel ของคำขอนี้ { url, pages, name } */
async function sheetsOf(req, { steps = [], log = [] } = {}) {
  const kind = eqFormKind(clean(req.FormCode)) || (/^FM-PUR-006-/i.test(clean(req.Title)) ? 'loan' : 'move');
  const v = valuesOf(req);
  if (kind === 'loan') {
    return { url: 'assets/forms/FM-PUR-006.xlsx', pages: loanPages(req, log),
      name: `FM-PUR-006 ใบยืม-คืนอุปกรณ์ ${clean(v.br_no) || clean(req.Title) || '(แบบฟอร์ม)'}` };
  }
  return { url: 'assets/forms/FM-PUR-008.xlsx', pages: movePages(req, log, steps, await equipment().catch(() => [])),
    name: `FM-PUR-008 บันทึกโอนย้ายเครื่องมืออุปกรณ์ ${clean(req.Title) || '(แบบฟอร์ม)'}` };
}

/**
 * PDF หน้าตาตามต้นฉบับ ISO: กรอกไฟล์ Excel ต้นฉบับแล้วแสดงเป็นหน้า A4 (utils/xlsx-html.js)
 * → หน้าต่างพิมพ์ / บันทึกเป็น PDF
 */
export async function openEqPdf(req, opts = {}) {
  const s = await sheetsOf(req, opts);
  const blob = await fillXlsxTemplate(s.url, s.pages);
  const { xlsxToHtml } = await import('../utils/xlsx-html.js');
  const { html } = await xlsxToHtml(blob, { overlays: s.pages.map((pg) => pg.sigs || {}) });
  const { openPRWindow } = await import('./pr-fm-pur-004.js');
  await openPRWindow(html, opts.title || s.name);
  // ปุ่มดาวน์โหลดไฟล์ Excel ต้นฉบับ (ไฟล์เดียวกับที่แสดง) ข้างปุ่มพิมพ์
  const pr = document.getElementById('pr-print');
  if (pr) {
    pr.insertAdjacentHTML('beforebegin', '<button class="btn-mini" id="pr-xlsx">⬇ Excel ต้นฉบับ ISO</button>');
    document.getElementById('pr-xlsx').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${s.name}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
  }
}
/** เอกสารต้นฉบับ ISO (แสดง + พิมพ์ PDF + ดาวน์โหลด Excel) */
export const openEqDoc = openEqPdf;

export { loanPages, movePages };
