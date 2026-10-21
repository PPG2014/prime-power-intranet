/**
 * ใบขอสั่งซื้อ (FM-PUR-004): เลข PR · วันที่ออก PR · ตรวจเลขซ้ำ · แถวสำหรับทะเบียน/Excel
 *
 * เลข PR และวันที่ออก PR เก็บใน FormData ของคำขอ (pr_no, pr_date)
 * ไม่ต้องเพิ่มคอลัมน์ใน SharePoint · ฝ่ายจัดซื้อกรอกตอนอัปเดตสถานะ
 */
import { list, clearDataCache } from './data.js';
import { isPR } from '../templates/pr-fm-pur-004.js';
import { purchaseStatusOf } from './requests.js';

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? v.Value ?? '') : String(v ?? '')).trim();

/** คำขอนี้เป็นใบขอสั่งซื้อไหม (FormCode อาจว่างถ้าคอลัมน์เป็น Lookup → ดูจากเลขที่เอกสาร) */
export const isPRRequest = (r) => !!r && (isPR(clean(r.FormCode)) || /^FM-PUR-004-/i.test(clean(r.Title)));

/** คำตอบในฟอร์ม */
export function prValues(r) {
  try { return JSON.parse((r && r.FormData) || '{}') || {}; } catch (e) { return {}; }
}

/** เทียบเลข PR: ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง */
export const normPR = (s) => clean(s).toUpperCase().replace(/\s+/g, '');

/** วันที่วันนี้แบบ yyyy-mm-dd (ใช้กับช่อง <input type="date">) */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * เลข PR อัตโนมัติ: PR + ปี ค.ศ. 2 หลัก + เดือน 2 หลัก + ลำดับ 3 หลัก เช่น PR2610175
 * ลำดับเริ่ม 001 ใหม่ทุกเดือน · เดือนที่เปิดใช้ระบบเริ่มต่อจากเลขเดิมของฝ่ายจัดซื้อ (PR_START)
 * ตั้งค่าแทนได้ที่ ตั้งค่าระบบ → PRNoStart (เช่น PR2611050)
 */
export const PR_START = 'PR2610175';
export const prPeriod = (d = new Date()) =>
  `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;

/** เลข PR ถัดไปของเดือนนี้ จากใบขอสั่งซื้อที่มีอยู่ · start = เลขเริ่มต้นที่ตั้งไว้ */
export function nextPRNo(rows, { date = new Date(), start = PR_START, excludeId = null } = {}) {
  const per = prPeriod(date);
  const re = new RegExp(`^PR${per}(\\d{3,})$`);
  let max = 0;
  rows.filter((r) => isPRRequest(r) && String(r.id) !== String(excludeId)).forEach((r) => {
    const m = normPR(prValues(r).pr_no).match(re);
    if (m) max = Math.max(max, +m[1]);
  });
  const sm = normPR(start).match(/^PR(\d{4})(\d{3,})$/);
  if (sm && sm[1] === per) max = Math.max(max, +sm[2] - 1);
  return `PR${per}${String(max + 1).padStart(3, '0')}`;
}

/** เลขเริ่มต้นจากตั้งค่าระบบ (PRNoStart) ถ้าไม่ได้ตั้งใช้ PR_START */
export async function prStart() {
  try {
    const { settings } = await import('../utils/settings.js');
    return String((await settings()).PRNoStart || '').trim() || PR_START;
  } catch (e) { return PR_START; }
}

/**
 * ออกเลข PR ให้ใบขอสั่งซื้อที่เพิ่งยื่น (id) แล้วตรวจซ้ำหลังบันทึก
 * ถ้าชนกับใบที่บันทึกก่อน (id น้อยกว่า) ขยับเป็นเลขถัดไป · คืนเลขที่ได้
 */
export async function assignPRNo(id, { tries = 4 } = {}) {
  const { get, update } = await import('./data.js');
  const start = await prStart();
  for (let i = 0; i < tries; i++) {
    clearDataCache('requests');
    const all = await list('requests');
    const me = all.find((r) => String(r.id) === String(id)) || await get('requests', id);
    const v = prValues(me);
    let no = normPR(v.pr_no);
    const clash = no && all.some((r) => isPRRequest(r) && String(r.id) !== String(id)
      && normPR(prValues(r).pr_no) === no && +r.id < +id);
    if (no && !clash) return no;
    no = nextPRNo(all, { start, excludeId: id });
    await update('requests', id, { FormData: JSON.stringify({ ...v, pr_no: no, pr_date: v.pr_date || todayISO() }) });
  }
  clearDataCache('requests');
  return normPR(prValues(await get('requests', id)).pr_no);
}

/** "อื่น ๆ" → ข้อความที่ผู้ขอระบุ */
const withOther = (main, other) => (/^อื่น/.test(clean(main)) && clean(other) ? clean(other) : clean(main));

/**
 * หาใบขอสั่งซื้อใบอื่นที่ใช้เลข PR นี้แล้ว · อ่านข้อมูลสดจาก SharePoint ทุกครั้ง
 * คืน null = ไม่ซ้ำ
 */
export async function findDuplicatePR(prNo, selfId) {
  const key = normPR(prNo);
  if (!key) return null;
  clearDataCache('requests');
  const all = await list('requests');
  const hit = all.find((r) => isPRRequest(r) && String(r.id) !== String(selfId)
    && normPR(prValues(r).pr_no) === key);
  if (!hit) return null;
  const v = prValues(hit);
  return {
    req: hit,
    no: clean(hit.Title),
    subject: clean(v.std_subject || v.subject || v.reason),
    project: clean(v.project),
    requester: clean(hit.RequesterName),
    status: clean(hit.Status),
  };
}

/** ข้อความแจ้งเตือนเลข PR ซ้ำ */
export const duplicateMessage = (prNo, d) => [
  `เลข PR "${clean(prNo)}" ซ้ำกับใบขอสั่งซื้อที่มีอยู่แล้ว`,
  `• เลขที่คำขอ: ${d.no}`,
  d.subject && `• เรื่อง: ${d.subject}`,
  d.project && `• โครงการ: ${d.project}`,
  d.requester && `• ผู้ขอ: ${d.requester}`,
  d.status && `• สถานะ: ${d.status}`,
].filter(Boolean).join('\n');

/** สถานะที่แสดงในทะเบียน: สถานะจัดซื้อล่าสุด ถ้ายังไม่มีใช้สถานะคำขอ */
export function prStatus(r) {
  const p = purchaseStatusOf(r);
  return p && p !== '-' ? p : clean(r.Status);
}

/** ข้อมูลหัวของใบขอสั่งซื้อ (หนึ่งใบ) */
export function prHeader(r) {
  const v = prValues(r);
  return {
    id: r.id,
    reqNo: clean(r.Title),
    prNo: clean(v.pr_no),
    prDate: clean(v.pr_date),
    submitted: r.SubmittedDate || '',
    needDate: clean(v.need_date),
    project: clean(v.project),
    workType: withOther(v.work_type, v.work_type_other),
    category: withOther(v.category, v.category_other),
    dept: clean(r.RequesterDept),
    requester: clean(r.RequesterName),
    phone: clean(v.phone),
    subject: clean(v.std_subject || v.subject),
    status: prStatus(r),
    items: (Array.isArray(v.items) ? v.items : [])
      .filter((x) => x && Object.values(x).some((y) => clean(y)))
      .map((x) => ({ detail: clean(x.detail), qty: clean(x.qty), unit: clean(x.unit), remark: clean(x.remark) })),
  };
}
