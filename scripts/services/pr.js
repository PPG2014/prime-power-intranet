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
