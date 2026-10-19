/**
 * จองรถยนต์บริษัทฯ (แบบฟอร์มที่มีช่อง car_date_from / car_date_to / car_time_from / car_time_to)
 *
 *   - ช่วงเวลาข้ามวันได้ (วันที่เริ่ม + เวลาเริ่ม → วันที่สิ้นสุด + เวลาสิ้นสุด)
 *   - รถมีจำกัด (ตั้งค่าระบบ → CarPlates) ถ้าช่วงเวลาที่ขอมีคำขอค้าง/อนุมัติแล้วครบจำนวนรถ → ห้ามส่ง
 *   - ผู้อนุมัติขั้นสุดท้ายเลือกทะเบียนรถก่อนกดอนุมัติ · เปลี่ยนรถหรือยกเลิกได้ภายหลัง
 *   - ผู้ยื่นกด "คืนรถ" เมื่อใช้งานเสร็จ → บันทึกเวลาคืน และปิดคำขอ (เสร็จสิ้น)
 *
 * ทะเบียนรถ วันเวลาคืน เก็บใน FormData ของคำขอ (car_plate, car_returned_at) ไม่ต้องเพิ่มคอลัมน์
 */
import { list, get, update, clearDataCache } from './data.js';
import { parseLog } from './requests.js';

export const CAR_FIELDS = { dateFrom: 'car_date_from', dateTo: 'car_date_to', timeFrom: 'car_time_from', timeTo: 'car_time_to' };
export const CAR_PLACE = 'destination';
/** ค่าเริ่มต้นถ้ายังไม่ได้ตั้ง CarPlates ในตั้งค่าระบบ */
export const DEFAULT_PLATES = ['1 ขร 5775 (Haval)', '6 ขล 5784 (Toyota Yaris)', '6 ขญ 5785 (Toyota Yaris Cross)'];
export const RETURN_ACTION = 'คืนรถ';
export const CHANGE_ACTION = 'เปลี่ยนรถ';
const DEAD = ['ยกเลิก', 'ไม่อนุมัติ'];

export const isCarForm = (fields = []) => {
  const keys = new Set(fields.map((f) => f.FieldKey));
  return Object.values(CAR_FIELDS).every((k) => keys.has(k));
};
export const isCarRequest = (req) => {
  const d = dataOf(req);
  return !!(d[CAR_FIELDS.dateFrom] && d[CAR_FIELDS.timeFrom]);
};

export function dataOf(req) {
  try { return (typeof req.FormData === 'string' ? JSON.parse(req.FormData || '{}') : req.FormData) || {}; } catch (e) { return {}; }
}

/** วันที่ท้องถิ่น YYYY-MM-DD (ช่องวันที่เก็บเป็น ISO เที่ยงคืนเวลาไทย → ถ้าตัด 10 ตัวแรกจะได้วันก่อนหน้า) */
export function localDay(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const at = (day, time) => {
  const [y, m, d] = String(day).split('-').map(Number);
  const [h, mi] = String(time || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0);
};

/** ช่วงเวลาจองของคำขอ { start, end, dayFrom, dayTo, from, to } */
export function spanOf(values) {
  const dayFrom = localDay(values[CAR_FIELDS.dateFrom]);
  const dayTo = localDay(values[CAR_FIELDS.dateTo]) || dayFrom;
  const from = String(values[CAR_FIELDS.timeFrom] || '').trim();
  const to = String(values[CAR_FIELDS.timeTo] || '').trim();
  if (!dayFrom || !from || !to) return null;
  return { dayFrom, dayTo, from, to, start: at(dayFrom, from), end: at(dayTo, to) };
}

/** รายชื่อรถจากตั้งค่าระบบ CarPlates (คั่นด้วยจุลภาค) */
export async function carPlates() {
  try {
    const { settings } = await import('../utils/settings.js');
    const raw = String((await settings()).CarPlates || '').trim();
    const arr = raw.split(',').map((x) => x.trim()).filter(Boolean);
    return arr.length ? arr : DEFAULT_PLATES;
  } catch (e) { return DEFAULT_PLATES; }
}

/**
 * คำขอใช้รถทั้งหมดของฟอร์มนี้ที่ยังกันรถอยู่ (ไม่ยกเลิก/ไม่อนุมัติ)
 * ถ้าคืนรถก่อนเวลา นับถึงเวลาที่คืนจริง
 */
export async function carBookings(formCode, { fresh = false } = {}) {
  if (fresh) clearDataCache('requests');
  const rows = await list('requests').catch(() => []);
  return rows
    .filter((r) => String(r.FormCode || '').trim() === String(formCode || '').trim())
    .filter((r) => !DEAD.includes(String(r.Status || '').trim()))
    .map((r) => {
      const d = dataOf(r);
      const sp = spanOf(d);
      if (!sp) return null;
      const returned = d.car_returned_at ? new Date(d.car_returned_at) : null;
      return { req: r, ...sp, end: returned && returned < sp.end ? returned : sp.end, returned,
        plate: String(d.car_plate || '').trim(), by: d.car_user || r.RequesterName || '',
        place: d[CAR_PLACE] || '', status: String(r.Status || '').trim() };
    })
    .filter(Boolean);
}

/** คำขอที่ช่วงเวลาเหลื่อมกับช่วงที่ขอ */
export async function carOverlaps(formCode, span, excludeId = null, opts) {
  const all = await carBookings(formCode, opts);
  return all.filter((b) => String(b.req.id) !== String(excludeId) && b.start < span.end && b.end > span.start)
    .sort((a, b) => a.start - b.start);
}

const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dm = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
export const spanText = (b) => (localDay(b.start) === localDay(b.end)
  ? `${dm(b.start)} ${hm(b.start)}–${hm(b.end)}` : `${dm(b.start)} ${hm(b.start)} – ${dm(b.end)} ${hm(b.end)}`);

/**
 * ตรวจก่อนส่งคำขอ: เวลาถูกต้อง + รถยังว่างพอ
 * คืนข้อความ (HTML-safe ข้อความล้วน คั่นบรรทัดด้วย \n) · ว่าง = ผ่าน
 */
export async function carProblem(formCode, values, excludeId = null) {
  const sp = spanOf(values);
  if (!sp) return '';
  if (sp.dayTo < sp.dayFrom) return 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
  if (sp.end <= sp.start) return 'เวลาสิ้นสุดต้องหลังเวลาเริ่มใช้งาน';
  const [plates, hit] = await Promise.all([carPlates(), carOverlaps(formCode, sp, excludeId, { fresh: true })]);
  if (hit.length < plates.length) return '';
  return `⛔ ช่วงเวลานี้มีการจองรถครบ ${plates.length} คันแล้ว (${hit.length} คำขอ)\n`
    + 'กรุณาติดต่อผู้ดูแลรถ ฝ่ายประสานงานและอำนวยการ โดยตรง หรือเลือกช่วงเวลาอื่น\n\n'
    + hit.map((b) => `• ${spanText(b)} ${b.by}${b.plate ? ` · ${b.plate}` : ''} (${b.status})`).join('\n');
}

/** รถคันนี้ถูกใช้ในช่วงเวลาที่ทับกันอยู่แล้วไหม (ใบที่อนุมัติแล้วและยังไม่คืน) */
export async function plateClash(req, plate) {
  const sp = spanOf(dataOf(req));
  if (!sp || !plate) return [];
  const hit = await carOverlaps(req.FormCode, sp, req.id, { fresh: true });
  return hit.filter((b) => b.plate && b.plate === plate);
}

/** บันทึกการเปลี่ยนแปลงลงคำขอ (อ่านข้อมูลสดก่อน กันทับของคนอื่น) */
async function patchCar(req, { action, by, note = '', data = {}, status = '' }) {
  const fresh = (await get('requests', req.id).catch(() => null)) || req;
  const log = parseLog(fresh.ApprovalLog);
  log.push({ step: 999, action, by, note, at: new Date().toISOString() });
  const patch = { ApprovalLog: JSON.stringify(log), FormData: JSON.stringify({ ...dataOf(fresh), ...data }) };
  if (status) { patch.Status = status; patch.PAState = 'DONE'; }
  await update('requests', req.id, patch);
  clearDataCache('requests');
  return { ...fresh, ...patch };
}

export const changePlate = (req, by, plate, note = '') =>
  patchCar(req, { action: CHANGE_ACTION, by, note: note ? `${plate} — ${note}` : plate, data: { car_plate: plate } });
export const cancelCar = (req, by, note) =>
  patchCar(req, { action: 'ยกเลิก', by, note, status: 'ยกเลิก' });
export const returnCar = (req, by, note = '') => {
  const now = new Date();
  return patchCar(req, { action: RETURN_ACTION, by, note: [`คืนรถ ${dm(now)} ${hm(now)} น.`, note].filter(Boolean).join(' — '),
    data: { car_returned_at: now.toISOString() }, status: 'เสร็จสิ้น' });
};

/** ลิงก์ค้นหาสถานที่ใน Google Maps (ถ้าผู้ยื่นวางลิงก์แผนที่มาเอง ใช้ลิงก์นั้น) */
export function mapLink(place) {
  const p = String(place || '').trim();
  if (!p) return '';
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(p)) return p;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`;
}
