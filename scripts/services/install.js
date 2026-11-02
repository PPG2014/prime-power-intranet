/**
 * แบบฟอร์มจองคิวงานติดตั้ง Prime Power Engineering Pro (FM-PPE-001)
 *
 *   - ช่องกรอกกำหนดในโค้ด (INSTALL_FIELDS) ไม่ต้องตั้ง FormFields ใน SharePoint · แค่เพิ่มแบบฟอร์มรหัสนี้ในรายการแบบฟอร์ม
 *   - "ถึงวันที่" ตั้งให้เอง = นับต่อจากวันเข้าติดตั้งอีก 7 วันทำการ (ไม่นับเสาร์-อาทิตย์ และวันหยุดบริษัทฯ) · แก้ได้
 *   - ทีมติดตั้งรับได้ครั้งละงาน: ช่วงวันที่ขอชนกับคิวที่มีอยู่ (รออนุมัติ/อนุมัติแล้ว) → ห้ามส่ง ให้เลือกวันใหม่
 *   - ผู้อนุมัติอัปเดตสถานะ: อนุมัติ (กำหนดวันในช่วงที่ขอ) · แก้ไขวันติดตั้ง (กำหนดวันใหม่นอกช่วง)
 *     · ยกเลิกคำขอ (ปิดเป็นยกเลิก) · ติดตั้งเสร็จสิ้น (ปิดเป็นเสร็จสิ้น)
 *   - วันที่ผู้อนุมัติกำหนดเก็บใน FormData (inst_ok_from / inst_ok_to) และใช้เป็นช่วงที่กันคิวแทนวันที่ขอ
 *
 * วันหยุดบริษัทฯ เก็บในตั้งค่าระบบ CompanyHolidays (แก้ที่ จัดการข้อมูล → 📅 วันหยุดบริษัทฯ)
 */
import { list, clearDataCache } from './data.js';
import { localDay, mapLink } from './car.js';
import { parseLog, reqCode, PURCHASE_ACTION } from './requests.js';

export const INSTALL_CODE = 'FM-PPE-001';
export const INSTALL_DAYS = 7;
export const IF = {
  project: 'inst_project', customer: 'inst_customer', tel: 'inst_tel', place: 'inst_place',
  dateFrom: 'inst_date_from', time: 'inst_time', dateTo: 'inst_date_to', note: 'inst_note',
  okFrom: 'inst_ok_from', okTo: 'inst_ok_to',
};
export const INSTALL_STATUS = { approve: 'อนุมัติ', change: 'แก้ไขวันติดตั้ง', cancel: 'ยกเลิกคำขอ', done: 'ติดตั้งเสร็จสิ้น' };

const SEC = 'รายละเอียดงานติดตั้ง';
const f = (FieldKey, Title, FieldType, extra = {}) => ({ FormCode: INSTALL_CODE, FieldKey, Title, FieldType, Section: SEC,
  IsRequired: 'Yes', IsActive: true, Options: '', ShowIf: '', HelpText: '', ColumnWidth: 'half', ...extra });
let order = 0;
const o = (x) => ({ ...x, SortOrder: (order += 1) });
export const INSTALL_FIELDS = [
  o(f(IF.project, 'ชื่อโครงการ', 'text')),
  o(f(IF.customer, 'ชื่อลูกค้า', 'text')),
  o(f(IF.tel, 'เบอร์โทรติดต่อลูกค้า', 'text')),
  o(f(IF.place, 'สถานที่งานติดตั้ง', 'text', { ColumnWidth: 'full',
    HelpText: 'พิมพ์ชื่อสถานที่ หรือวางลิงก์ Google Maps · กด "เปิดในแผนที่" เพื่อตรวจตำแหน่ง' })),
  o(f(IF.dateFrom, 'วันเข้าดำเนินการติดตั้ง', 'date')),
  o(f(IF.time, 'เวลาเข้าดำเนินการติดตั้ง', 'time')),
  o(f(IF.dateTo, 'ถึงวันที่', 'date', {
    HelpText: `ตั้งให้อัตโนมัติ: นับต่ออีก ${INSTALL_DAYS} วันทำการ (ไม่นับเสาร์-อาทิตย์และวันหยุดบริษัทฯ) · แก้ได้` })),
  o(f(IF.note, 'หมายเหตุ', 'textarea', { IsRequired: 'No', ColumnWidth: 'full',
    HelpText: 'เช่น ต้องเข้าติดตั้งวันเสาร์-อาทิตย์ หรือวันที่ลูกค้าต้องการให้เข้าติดตั้ง อื่น ๆ' })),
  o(f('inst_files', 'เอกสารแนบ', 'file', { IsRequired: 'No', ColumnWidth: 'full',
    HelpText: 'ถ้ามี เช่น แบบติดตั้ง ใบเสนอราคา รูปหน้างาน' })),
];

export const isInstallCode = (code) => String(code || '').trim().toUpperCase() === INSTALL_CODE;
export const isInstallForm = (fields = []) => {
  const keys = new Set(fields.map((x) => x.FieldKey));
  return [IF.dateFrom, IF.dateTo, IF.time].every((k) => keys.has(k));
};
export { mapLink };

/* ───── วันหยุดบริษัทฯ ───── */
export const HOLIDAY_SETTING = 'CompanyHolidays';
/** [{ date: 'YYYY-MM-DD', name }] เรียงตามวันที่ · รับทั้ง JSON และข้อความบรรทัดละวัน "2026-12-05 วันพ่อ" */
export function parseHolidays(raw) {
  const s = String(raw || '').trim();
  let rows = [];
  try { const j = JSON.parse(s || '[]'); rows = Array.isArray(j) ? j : []; } catch (e) {
    rows = s.split(/\r?\n/).map((line) => { const m = line.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); return m ? { date: m[1], name: m[2] } : null; }).filter(Boolean);
  }
  const seen = new Set();
  return rows.map((r) => ({ date: localDay(r && r.date), name: String((r && r.name) || '').trim() }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !seen.has(r.date) && seen.add(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** วันหยุดบริษัทฯ ปี 2569 (ตามประกาศบริษัทฯ) — ใช้เมื่อยังไม่ได้บันทึก CompanyHolidays ในตั้งค่าระบบ */
export const DEFAULT_HOLIDAYS = [
  ['2026-01-01', 'วันขึ้นปีใหม่'],
  ['2026-01-02', 'วันหยุดทำการเพิ่มเป็นกรณีพิเศษ'],
  ['2026-03-03', 'วันมาฆบูชา'],
  ['2026-04-06', 'วันจักรี หรือวันพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราชฯ'],
  ['2026-04-13', 'วันสงกรานต์'],
  ['2026-04-14', 'วันสงกรานต์'],
  ['2026-04-15', 'วันสงกรานต์'],
  ['2026-05-01', 'วันแรงงานแห่งชาติ'],
  ['2026-06-01', 'ชดเชยวันวิสาขบูชา'],
  ['2026-06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสุทิดา พัชรสุธาพิมลลักษณ พระบรมราชินี'],
  ['2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'],
  ['2026-07-29', 'วันอาสาฬหบูชา'],
  ['2026-08-12', 'วันแม่แห่งชาติ'],
  ['2026-10-13', 'วันนวมินทรมหาราช'],
  ['2026-10-23', 'วันปิยมหาราช'],
  ['2026-12-07', 'ชดเชยวันคล้ายวันพระบรมราชสมภพ พระบาทสมเด็จพระบรมชนกาธิเบศรฯ'],
  ['2026-12-10', 'วันรัฐธรรมนูญ'],
  ['2026-12-31', 'วันสิ้นปี'],
].map(([date, name]) => ({ date, name }));

/** วันหยุดที่ใช้นับวันทำการ · ยังไม่เคยบันทึกในตั้งค่าระบบ → ใช้วันหยุดปี 2569 ตั้งต้น */
export async function holidays({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    const raw = (await settings())[HOLIDAY_SETTING];
    return raw == null || !String(raw).trim() ? DEFAULT_HOLIDAYS.map((r) => ({ ...r })) : parseHolidays(raw);
  } catch (e) { return DEFAULT_HOLIDAYS.map((r) => ({ ...r })); }
}
/** บันทึกวันหยุดในตั้งค่าระบบแล้วหรือยัง */
export async function holidaysSaved() {
  try {
    const { settings } = await import('../utils/settings.js');
    return !!String((await settings())[HOLIDAY_SETTING] || '').trim();
  } catch (e) { return false; }
}

const toDate = (day) => { const [y, m, d] = String(day).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
/** วันทำการไหม (ไม่ใช่เสาร์-อาทิตย์ ไม่ใช่วันหยุดบริษัทฯ) */
export const isWorkday = (day, hol = []) => {
  const w = toDate(day).getDay();
  return w !== 0 && w !== 6 && !hol.some((h) => h.date === day);
};
/** นับต่อจากวันเริ่มอีก n วันทำการ → วันที่ (YYYY-MM-DD) */
export function addWorkdays(day, n, hol = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return '';
  const d = toDate(day);
  for (let left = n; left > 0;) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(localDay(d), hol)) left -= 1;
  }
  return localDay(d);
}

/* ───── คิวงานติดตั้ง ───── */
const DEAD = ['ยกเลิก', 'ไม่อนุมัติ'];
const dataOf = (r) => { try { return JSON.parse(r.FormData || '{}') || {}; } catch (e) { return {}; } };
const lastStatus = (r) => {
  const all = Object.values(INSTALL_STATUS);
  const hit = parseLog(r.ApprovalLog).filter((x) => x.action === PURCHASE_ACTION)
    .map((x) => ({ st: String(x.note || '').split(' — ')[0].trim(), at: x.at })).filter((x) => all.includes(x.st));
  return hit.slice(-1)[0] || null;
};

/** ช่วงวันที่ที่คำขอนี้กันคิวไว้: วันที่ผู้อนุมัติกำหนด → ไม่มีใช้วันที่ขอ · ติดตั้งเสร็จก่อนกำหนด ตัดถึงวันที่เสร็จ */
export function spanOfInstall(req) {
  const d = dataOf(req);
  const from = localDay(d[IF.okFrom]) || localDay(d[IF.dateFrom]);
  let to = localDay(d[IF.okTo]) || localDay(d[IF.dateTo]) || from;
  if (!from) return null;
  const st = lastStatus(req);
  if (st && st.st === INSTALL_STATUS.done && st.at) { const end = localDay(st.at); if (end >= from && end < to) to = end; }
  return { from, to: to < from ? from : to, time: String(d[IF.time] || '').trim(), approved: !!localDay(d[IF.okFrom]) };
}

/** คำขอจองคิวติดตั้งทุกใบของฟอร์มนี้ (ทุกสถานะ) พร้อมช่วงวันที่ */
export async function installBookings(code = INSTALL_CODE, { fresh = true } = {}) {
  if (fresh) clearDataCache('requests');
  const rows = await list('requests', { fresh }).catch(() => []);
  return rows.filter((r) => reqCode(r) === String(code || '').trim()).map((r) => {
    const span = spanOfInstall(r);
    if (!span) return null;
    const d = dataOf(r);
    return { req: r, ...span, status: String(r.Status || '').trim(), live: !DEAD.includes(String(r.Status || '').trim()),
      by: d.std_emp_name || r.RequesterName || '', customer: d[IF.customer] || '', place: d[IF.place] || '', project: d[IF.project] || '',
      track: (lastStatus(r) || {}).st || '' };
  }).filter(Boolean);
}

/** คิวที่ชนกับช่วง from–to (ไม่นับใบที่ยกเลิก/ไม่อนุมัติ และใบ excludeId) */
export async function installClashes(code, from, to, excludeId = null) {
  if (!from) return [];
  const end = to && to >= from ? to : from;
  return (await installBookings(code)).filter((b) => b.live && String(b.req.id) !== String(excludeId || '')
    && b.from <= end && b.to >= from);
}

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thDay = (day) => { const d = toDate(day); return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`; };
export const thRange = (a, b) => (a === b || !b ? thDay(a) : `${thDay(a)} – ${thDay(b)}`);
/** ข้อความแจ้งคิวชน */
export const clashText = (hit) => `⚠ ช่วงวันที่นี้มีคิวงานติดตั้งแล้ว ${hit.length} งาน — กรุณาเลือกวันใหม่\n`
  + hit.map((b) => `• ${thRange(b.from, b.to)} · ${b.customer || b.project || b.req.Title} (${b.by}) · ${b.status}`).join('\n');
