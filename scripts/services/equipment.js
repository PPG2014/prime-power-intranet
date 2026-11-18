/**
 * ทะเบียนเครื่องมือและอุปกรณ์ + ใบยืม-คืนอุปกรณ์ (FM-PUR-006) + บันทึกโอนย้ายเครื่องมืออุปกรณ์ (FM-PUR-008)
 *
 * ทะเบียนเก็บใน List Equipment ของ SharePoint (นำเข้าจากไฟล์ Excel ได้ที่หน้าทะเบียนเครื่องมือ)
 *   ไม่มีข้อมูลเครื่องมือจริงในโค้ด (repo สาธารณะ)
 *
 * แบบฟอร์มทั้งสองกำหนดช่องในโค้ด — แค่เพิ่มแบบฟอร์มรหัส FM-PUR-006 / FM-PUR-008 ในรายการแบบฟอร์ม
 * (หรือใส่เลขที่เอกสาร ISO เป็นรหัสนี้) แล้วตั้งเส้นทางอนุมัติตามปกติ
 *
 * ทะเบียนอัปเดตเองจากสถานะงานของแบบฟอร์ม (ฝ่ายจัดซื้อกด "อัปเดตสถานะ" ในหน้าติดตามสถานะ)
 *   ใบยืม-คืน:  จ่ายอุปกรณ์แล้ว → อยู่ระหว่างใช้งาน · ผู้ใช้งาน = ผู้ยืม · โครงการ · เลขที่ใบยืม · วันที่ยืม
 *               คืนครบแล้ว      → พร้อมใช้งาน · ล้างผู้ใช้งาน · วันที่คืน
 *   ใบโอนย้าย:  ส่งมอบแล้ว       → ผู้ใช้งาน = ผู้รับเครื่องมือ · โครงการ = ปลายทาง
 */
import { list, update, clearDataCache } from './data.js';

export const EQ_LIST = 'equipment';
export const LOAN_CODE = 'FM-PUR-006';
export const MOVE_CODE = 'FM-PUR-008';

export const EQ_READY = 'พร้อมใช้งาน';
export const EQ_INUSE = 'อยู่ระหว่างใช้งาน';
export const EQ_STATUS = [EQ_INUSE, EQ_READY, 'ส่งซ่อม', 'เสีย', 'ส่ง Calibration', 'จำหน่าย / ตัดออก'];

/** สถานะงานของแบบฟอร์ม (ใช้กับ TRACK_STATUS ใน services/requests.js) */
export const LOAN_ST = { out: 'จ่ายอุปกรณ์แล้ว', back: 'คืนครบแล้ว', cancel: 'ยกเลิก' };
export const MOVE_ST = { done: 'ส่งมอบแล้ว', cancel: 'ยกเลิก' };

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? v.Value ?? '') : String(v ?? '')).replace(/\s+/g, ' ').trim();
const low = (v) => clean(v).toLowerCase();
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** แบบฟอร์มนี้เป็นใบยืม-คืน / ใบโอนย้าย (ดูทั้งรหัสฟอร์มและเลขที่เอกสาร ISO) · คืน 'loan' | 'move' | '' */
export function eqFormKind(formOrCode) {
  const codes = typeof formOrCode === 'object' && formOrCode
    ? [formOrCode.FormCode, formOrCode.ISODocNo] : [formOrCode];
  const s = codes.map((c) => clean(c).toUpperCase());
  if (s.some((c) => c === LOAN_CODE)) return 'loan';
  if (s.some((c) => c === MOVE_CODE)) return 'move';
  return '';
}

/* ───────── เลขที่ใบยืม (Delivered No) ───────── */

/**
 * BR + ปี ค.ศ. 4 หลัก + เดือน 2 หลัก + ลำดับ 3 หลัก เช่น BR202611001 (รูปแบบเดียวกับเลข PR)
 * ลำดับเริ่ม 001 ใหม่ทุกเดือน · เริ่มใช้ระบบที่ BR_START · ตั้งค่าแทนได้ที่ตั้งค่าระบบ BRNoStart
 */
export const BR_START = 'BR202611001';
export const normBR = (s) => clean(s).toUpperCase().replace(/\s+/g, '');
const brPeriod = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}`;
const formValues = (r) => { try { return JSON.parse((r && r.FormData) || '{}') || {}; } catch (e) { return {}; } };

export function nextBRNo(rows, { date = new Date(), start = BR_START, excludeId = null } = {}) {
  const per = brPeriod(date);
  const re = new RegExp(`^BR${per}(\\d{3,})$`);
  let max = 0;
  rows.filter((r) => String(r.id) !== String(excludeId)).forEach((r) => {
    const m = normBR(formValues(r).br_no).match(re);
    if (m) max = Math.max(max, +m[1]);
  });
  const sm = normBR(start).match(/^BR(\d{6})(\d{3,})$/);
  if (sm && sm[1] === per) max = Math.max(max, +sm[2] - 1);
  return `BR${per}${pad(max + 1, 3)}`;
}

export async function brStart() {
  try {
    const { settings } = await import('../utils/settings.js');
    return String((await settings()).BRNoStart || '').trim() || BR_START;
  } catch (e) { return BR_START; }
}

/** ออกเลขให้ใบยืมที่เพิ่งยื่น (id) แล้วตรวจซ้ำหลังบันทึก · ชนกับใบที่บันทึกก่อน → ขยับเลขถัดไป */
export async function assignBRNo(id, { tries = 4 } = {}) {
  const { get } = await import('./data.js');
  const start = await brStart();
  for (let i = 0; i < tries; i++) {
    clearDataCache('requests');
    const all = await list('requests');
    const me = all.find((r) => String(r.id) === String(id)) || await get('requests', id);
    const v = formValues(me);
    let no = normBR(v.br_no);
    const clash = no && all.some((r) => String(r.id) !== String(id) && normBR(formValues(r).br_no) === no && +r.id < +id);
    if (no && !clash) return no;
    no = nextBRNo(all, { start, excludeId: id });
    await update('requests', id, { FormData: JSON.stringify({ ...v, br_no: no }) });
  }
  clearDataCache('requests');
  return normBR(formValues(await get('requests', id)).br_no);
}

/* ───────── ช่องกรอกของแบบฟอร์ม (กำหนดในโค้ด ตามต้นฉบับ ISO) ───────── */

let order = 0;
const fld = (code, Section, FieldKey, Title, FieldType, extra = {}) => ({
  FormCode: code, FieldKey, Title, FieldType, Section, IsRequired: 'No', IsActive: true, Options: '', ShowIf: '',
  HelpText: '', ColumnWidth: 'half', DefaultValue: '', SortOrder: (order += 1), ...extra,
});

/** คอลัมน์ตารางรายการ: code = เลือกจากทะเบียนเครื่องมือ (เติมชื่อ/ยี่ห้อ/รุ่น/หน่วยให้) */
const LOAN_COLS = ['code|รหัสเครื่องมือ|equipment', 'desc|DESCRIPTION (รายการสินค้า)|text', "qty|Q'TY (จำนวน)|number",
  'unit|Unit (หน่วย)|text', 'status|Status (สถานะ)|choice:ยืม;คืน;เบิกใช้', 'remark|Remark (หมายเหตุ)|text'].join('\n');
const MOVE_COLS = ['code|รหัสเครื่องมือ|equipment', 'name|ชื่อ|text', 'brand|ยี่ห้อ|text', 'model|รุ่น|text',
  'qty|จำนวน|number', 'unit|หน่วย|text', 'remark|หมายเหตุ|text'].join('\n');

export function loanFields(code = LOAN_CODE) {
  order = 0;
  const D = 'DOCUMENT DESCRIPTION'; const P = 'PROJECT DESCRIPTION'; const C = 'CONTACT PERSON';
  const I = 'รายการอุปกรณ์'; const S = 'DELIVERY DESCRIPTIONS';
  return [
    fld(code, D, 'br_ref', 'Ref', 'text'),
    fld(code, D, 'br_doc_contact', 'Contact', 'text'),
    fld(code, P, 'br_project', 'Project (โครงการ)', 'lookup', { Options: 'projects', IsRequired: 'Yes' }),
    fld(code, P, 'br_owner', 'Owner', 'text'),
    fld(code, P, 'br_address', 'Address', 'textarea', { ColumnWidth: 'full' }),
    fld(code, P, 'br_system', 'System', 'text'),
    fld(code, C, 'br_contact', 'Contact', 'text', { HelpText: 'ผู้ติดต่อ / ผู้รับอุปกรณ์ที่หน้างาน' }),
    fld(code, C, 'br_tel', 'Tel', 'text'),
    fld(code, C, 'br_contact_address', 'Address', 'text'),
    fld(code, C, 'br_location', 'Location', 'text'),
    fld(code, C, 'br_delivery_date', 'Delivery Date', 'date', { IsRequired: 'Yes' }),
    fld(code, I, 'br_items', 'รายการอุปกรณ์ที่ยืม', 'lineitems', { IsRequired: 'Yes', ColumnWidth: 'full', Options: LOAN_COLS,
      HelpText: 'พิมพ์รหัสหรือชื่อเครื่องมือ แล้วเลือกจากทะเบียน ระบบเติมรายการและหน่วยให้ · ของที่ไม่มีในทะเบียนพิมพ์เองได้' }),
    fld(code, I, 'br_note', 'Note', 'textarea', { ColumnWidth: 'full' }),
    fld(code, S, 'br_ship', 'SHIPPING TYPE', 'text', { HelpText: 'เช่น รับเอง · รถบริษัท · ขนส่งเอกชน' }),
    fld(code, S, 'br_truck', 'Truck License', 'text'),
    fld(code, S, 'br_driver', 'Driver Name', 'text'),
    fld(code, S, 'br_driver_tel', 'Tel', 'text'),
  ];
}

export function moveFields(code = MOVE_CODE) {
  order = 0;
  const H = 'ข้อมูลการโอนย้าย'; const I = 'รายการ เครื่องมือ/วัสดุ/อุปกรณ์';
  return [
    fld(code, H, 'mv_project', 'โครงการ', 'lookup', { Options: 'projects', IsRequired: 'Yes' }),
    fld(code, H, 'mv_from', 'ขนย้ายจาก', 'text', { IsRequired: 'Yes', HelpText: 'โครงการ/สถานที่ต้นทาง' }),
    fld(code, H, 'mv_to', 'ไปที่', 'text', { IsRequired: 'Yes', HelpText: 'โครงการ/สถานที่ปลายทาง' }),
    fld(code, H, 'mv_receiver', 'ผู้รับเครื่องมือ อุปกรณ์', 'person', { IsRequired: 'Yes',
      HelpText: 'เมื่อส่งมอบแล้ว ทะเบียนเครื่องมือจะเปลี่ยนผู้ใช้งานเป็นคนนี้' }),
    fld(code, H, 'mv_sender', 'ผู้ส่งเครื่องมือ อุปกรณ์', 'person'),
    fld(code, I, 'mv_items', 'รายการเครื่องมือที่โอนย้าย', 'lineitems', { IsRequired: 'Yes', ColumnWidth: 'full', Options: MOVE_COLS,
      HelpText: 'พิมพ์รหัสหรือชื่อเครื่องมือ แล้วเลือกจากทะเบียน ระบบเติมชื่อ ยี่ห้อ รุ่น และหน่วยให้' }),
  ];
}

/** ช่องของแบบฟอร์มนี้ (ไม่ใช่ใบยืม/โอนย้ายคืน null) */
export const eqFieldsFor = (form) => {
  const k = eqFormKind(form);
  return k === 'loan' ? loanFields(form.FormCode) : k === 'move' ? moveFields(form.FormCode) : null;
};

/* ───────── ทะเบียน ───────── */

export async function equipment({ fresh = false } = {}) {
  return (await list(EQ_LIST, fresh ? { fresh: true } : undefined).catch(() => []))
    .filter((r) => r.IsActive !== false && r.IsActive !== 'No');
}

/** รหัสเครื่องมือ (Title) */
export const eqCode = (e) => clean(e && (e.Title || e.Code));
export const eqLabel = (e) => [clean(e.ItemName), clean(e.Brand), clean(e.Model)].filter(Boolean).join(' · ');
/** ชื่อผู้ใช้งาน: คนในทะเบียนบุคลากร หรือข้อความเดิมจากไฟล์ (เช่น Office) */
export const holderOf = (e) => clean(e && (e.HolderName || e.HolderText));

/** หาเครื่องมือจากข้อความที่พิมพ์ในตาราง ("MT-PG-001 · เกจวัด…" หรือรหัสอย่างเดียว) */
export function findEq(rows, text) {
  const code = clean(String(text || '').split(' · ')[0]).toUpperCase();
  return code ? rows.find((e) => eqCode(e).toUpperCase() === code) || null : null;
}

/** เครื่องมือที่คนนี้ถือ (ตามอีเมล หรือชื่อ) */
export function heldBy(rows, person) {
  const em = low(person && person.Email); const nm = low(person && person.Title);
  return rows.filter((e) => (em && low(e.HolderEmail) === em) || (nm && low(e.HolderName) === nm));
}

/**
 * จับคู่ชื่อในไฟล์ (เช่น "K.นัท", "คุณบูม", "สมชาย") กับทะเบียนบุคลากร
 * ดูชื่อเล่น · ชื่อจริง · ชื่ออังกฤษ · ชื่อ-นามสกุลเต็ม — ได้คนเดียวเท่านั้นจึงจับคู่ (ซ้ำหลายคน = ให้เลือกเอง)
 */
export function matchPerson(dir, text) {
  const t = clean(text).replace(/^(k\.|k\s|คุณ|พี่|น้อง)\s*/i, '').trim();
  if (!t) return null;
  const k = t.toLowerCase();
  const people = dir.filter((p) => p.IsActive !== false && clean(p.Title));
  const tries = [
    (p) => low(p.Title) === k,
    (p) => low(p.Nickname) === k,
    (p) => low(p.Title).split(' ')[0] === k,
    (p) => low(p.NameEN).split(' ')[0] === k,
  ];
  for (const ok of tries) {
    const hit = people.filter(ok);
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) return null;
  }
  return null;
}

/* ───────── อัปเดตทะเบียนจากสถานะงานของแบบฟอร์ม ───────── */

const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lineRows = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch (e) { return []; } })());

/**
 * ฝ่ายจัดซื้ออัปเดตสถานะใบยืม-คืน / ใบโอนย้าย → ปรับทะเบียนเครื่องมือที่อยู่ในใบ
 * คืน { updated: [รหัส], missing: [รหัสที่ไม่พบในทะเบียน] }
 */
export async function applyEqStatus(req, status) {
  const kind = eqFormKind(clean(req.FormCode)) || (/^FM-PUR-006-/i.test(clean(req.Title)) ? 'loan'
    : /^FM-PUR-008-/i.test(clean(req.Title)) ? 'move' : '');
  if (!kind) return { updated: [], missing: [] };
  const v = formValues(req);
  const items = lineRows(kind === 'loan' ? v.br_items : v.mv_items);
  const rows = await equipment({ fresh: true });
  const dir = await list('directory').catch(() => []);
  const person = (name, email) => dir.find((p) => (email && low(p.Email) === low(email)) || (name && low(p.Title) === low(name))) || null;

  let patchFor = null;
  if (kind === 'loan' && status === LOAN_ST.out) {
    const who = person(clean(req.RequesterName), clean(req.RequesterEmail));
    patchFor = () => ({ Status: EQ_INUSE, HolderName: who ? clean(who.Title) : clean(req.RequesterName),
      HolderEmail: who ? clean(who.Email) : clean(req.RequesterEmail), HolderText: '',
      Project: clean(v.br_project), LoanNo: normBR(v.br_no), LoanDate: isoDay(), ReturnDate: null });
  } else if (kind === 'loan' && status === LOAN_ST.back) {
    patchFor = () => ({ Status: EQ_READY, HolderName: '', HolderEmail: '', HolderText: '', ReturnDate: isoDay() });
  } else if (kind === 'move' && status === MOVE_ST.done) {
    const rc = v.mv_receiver;
    const name = clean(rc && typeof rc === 'object' ? (rc.Title || rc.LookupValue) : rc);
    const who = person(name, rc && rc.Email);
    // โอนย้าย: เปลี่ยนผู้ใช้งาน/โครงการ · สถานะเปลี่ยนเฉพาะของที่พร้อมใช้งาน (ของที่ส่งซ่อม/Calibration คงสถานะเดิม)
    patchFor = (e) => ({ Status: clean(e.Status) === EQ_READY || !clean(e.Status) ? EQ_INUSE : clean(e.Status),
      HolderName: who ? clean(who.Title) : name, HolderEmail: who ? clean(who.Email) : '',
      HolderText: '', Project: clean(v.mv_to) || clean(v.mv_project) });
  }
  if (!patchFor) return { updated: [], missing: [] };

  const updated = []; const missing = [];
  for (const it of items) {
    const e = findEq(rows, it.code);
    if (!e) { if (clean(it.code)) missing.push(clean(it.code)); continue; }
    // eslint-disable-next-line no-await-in-loop
    await update(EQ_LIST, e.id, patchFor(e));
    updated.push(eqCode(e));
  }
  clearDataCache(EQ_LIST);
  return { updated, missing };
}

/* ───────── นำเข้าจากไฟล์ Excel (ทะเบียนเครื่องมือและอุปกรณ์) ───────── */

/** หัวคอลัมน์ในไฟล์ → ช่องใน List Equipment */
export const IMPORT_COLS = [
  [/^ลำดับ/, 'SeqNo', 'num'], [/วันที่รับเข้า/, 'ReceivedDate', 'date'], [/^รหัสเครื่อง$/, 'Title'],
  [/รหัสเครื่องจักร/, 'MachineCode'], [/^รายการ/, 'ItemName'], [/ยี่ห้อ/, 'Brand'], [/รุ่น/, 'Model'],
  [/serial/i, 'SerialNo'], [/จำนวน/, 'Qty', 'num'], [/หน่วย/, 'Unit'], [/status|สถานะ/i, 'Status'],
  [/ผู้ใช้งาน/, 'HolderText'], [/โครงการ/, 'Project'], [/เลขที่ใบยืม/, 'LoanNo'], [/วันที่ยืม/, 'LoanDate', 'date'],
  [/วันที่คืน/, 'ReturnDate', 'date'], [/cert/i, 'CertDate', 'date'], [/หมายเหตุ/, 'Remark'],
];

/**
 * แถวจากไฟล์ → รายการพร้อมบันทึก (จับคู่ผู้ใช้งานกับทะเบียนบุคลากรด้วย)
 * table = { header: [..], rows: [[..]] } · คืน [{ data, holderMatch, holderText }]
 */
export function importRows(table, dir) {
  const map = table.header.map((h) => IMPORT_COLS.find(([re]) => re.test(clean(h))) || null);
  const used = new Set();
  const cols = map.map((m) => { if (!m || used.has(m[1])) return null; used.add(m[1]); return m; });
  return table.rows.map((r) => {
    const data = {};
    cols.forEach((m, i) => {
      if (!m) return;
      let v = r[i];
      if (m[2] === 'num') v = v === '' || v == null || isNaN(+v) ? null : +v;
      else if (m[2] === 'date') v = v instanceof Date && !isNaN(v) ? isoDay(v) : null;
      else v = clean(v);
      if (v !== null && v !== '' && v !== '-') data[m[1]] = v;
    });
    const holderText = clean(data.HolderText);
    const p = holderText ? matchPerson(dir, holderText) : null;
    // ไฟล์คือข้อมูลล่าสุด: ไม่มีผู้ใช้งาน / จับคู่ไม่ได้ → ล้างชื่อบุคลากรเดิมในทะเบียน
    Object.assign(data, p ? { HolderName: clean(p.Title), HolderEmail: clean(p.Email), HolderText: holderText }
      : { HolderName: '', HolderEmail: '', HolderText: holderText });
    if (data.Status && !EQ_STATUS.includes(data.Status)) data.Remark = [data.Remark, `สถานะเดิม: ${data.Status}`].filter(Boolean).join(' · ');
    return { data, holderText, holderMatch: p };
  }).filter((x) => Object.keys(x.data).some((k) => !['SeqNo'].includes(k)));
}
