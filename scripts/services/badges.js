/**
 * ตัวเลขเตือนบนเมนู
 *   ติดตามสถานะ   = คำขอที่ถึงคิวฉันอนุมัติ + คำขอของฉันที่มีความเคลื่อนไหวแต่ยังไม่ได้เปิดอ่าน
 *   ประเมินบุคลากร = ใบประเมินที่รอฉันทำ (ดู appraisalTodo)
 *
 * "เปิดอ่านแล้ว" จำไว้ในเบราว์เซอร์ของผู้ใช้ (localStorage) แยกตามอีเมล
 * เปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ระบบจะเริ่มนับใหม่จากสถานะปัจจุบัน ไม่เด้งเตือนย้อนหลังทั้งหมด
 */
import { list } from './data.js';
import { state, setState } from '../core/state.js';
import { stepsOf, loadResolved, roleOnRequest, parseLog } from './requests.js';
import { activeCycle, sheets, appraisalTodo, clean } from './appraisal.js';

const LIVE = ['รออนุมัติ'];
const low = (v) => String(v || '').trim().toLowerCase();
const plainCode = (v) => String(
  (v && typeof v === 'object') ? (v.LookupValue ?? v.Value ?? v.Title ?? '') : (v ?? '')).trim();
const codeOf = (r) => plainCode(r.FormCode)
  || (String(r.Title || '').match(/^([A-Za-z]+-[A-Za-z]+-\d+)/) || [])[1] || '';

/* ───── จำว่าเปิดอ่านคำขอไหนไปแล้ว ───── */
const seenKey = () => `pp-seen-req:${low(state.user?.email)}`;
function loadSeen() {
  try { return JSON.parse(localStorage.getItem(seenKey()) || 'null'); } catch (e) { return null; }
}
function saveSeen(map) {
  try { localStorage.setItem(seenKey(), JSON.stringify(map)); } catch (e) { /* เขียนไม่ได้ก็ข้าม */ }
}

/** ลายเซ็นความเคลื่อนไหวของคำขอ — เปลี่ยนเมื่อสถานะ ลำดับขั้น หรือประวัติการอนุมัติเปลี่ยน */
export const requestSig = (r) => `${String(r.Status || '').trim()}|${+r.CurrentStep || 1}|${parseLog(r.ApprovalLog).length}`;

/**
 * คำขอของฉันที่มีความเคลื่อนไหวแต่ยังไม่ได้เปิดดู
 * ใบที่ยังไม่เคยเปิดเลย นับเป็นใหม่เฉพาะเมื่อมีคนดำเนินการแล้ว (ไม่ใช่แค่เพิ่งยื่น)
 */
export function isUnread(r, seen = loadSeen()) {
  if (!seen) return false;
  const sig = requestSig(r);
  if (seen[r.id] !== undefined) return seen[r.id] !== sig;
  return !(String(r.Status || '').trim() === 'รออนุมัติ' && (+r.CurrentStep || 1) === 1
    && parseLog(r.ApprovalLog).length <= 1);
}

/** บันทึกว่าเปิดอ่านคำขอนี้แล้ว แล้วอัปเดตตัวเลขบนเมนู */
export function markSeen(r) {
  const seen = loadSeen() || {};
  seen[r.id] = requestSig(r);
  saveSeen(seen);
  refreshBadges({ force: true });
}

/* ───── นับ ───── */
async function myIds() {
  const dir = await list('directory').catch(() => []);
  const email = low(state.user?.email);
  const person = dir.find((p) => low(p.Email) === email) || null;
  return { person, ids: [person && person.Title, state.user?.name, state.user?.email].filter(Boolean) };
}

async function countRequests(ids) {
  const all = await list('requests').catch(() => []);
  const email = low(state.user?.email);

  // ครั้งแรกบนเบราว์เซอร์นี้: ถือว่าทุกใบที่มีอยู่อ่านแล้ว ไม่เด้งเตือนย้อนหลัง
  let seen = loadSeen();
  const mine = all.filter((r) => low(r.RequesterEmail) === email);
  if (!seen) {
    seen = Object.fromEntries(mine.map((r) => [r.id, requestSig(r)]));
    saveSeen(seen);
  }
  const unread = mine.filter((r) => isUnread(r, seen)).length;

  // ถึงคิวฉันอนุมัติ — ดูเฉพาะใบที่ยังเดินอยู่
  const live = all.filter((r) => LIVE.includes(String(r.Status || '').trim()));
  const stepCache = {};
  const byForm = {};
  let approve = 0;
  for (const r of live) {
    const code = codeOf(r);
    // eslint-disable-next-line no-await-in-loop
    if (!(code in stepCache)) stepCache[code] = await stepsOf(code);
    // eslint-disable-next-line no-await-in-loop
    const steps = await loadResolved(stepCache[code].map((x) => ({ ...x })), r);
    if (roleOnRequest({ ...r, FormCode: code }, steps, ids).canActNow) {
      approve += 1;
      byForm[code] = (byForm[code] || 0) + 1;
    }
  }
  return { approve, unread, byForm };
}

async function countAppraisal(person) {
  const cycle = await activeCycle();
  if (!cycle) return 0;
  const rows = await sheets(clean(cycle.Title));
  return appraisalTodo({
    cycle, rows, email: state.user?.email, person, isAdmin: state.isAdmin, isHR: state.isHR,
  }).total;
}

let last = 0;
let running = null;
const MIN_GAP = 20000;    // ไม่นับถี่กว่า 20 วินาที เว้นแต่สั่ง force (เช่นหลังเปิดอ่าน/อนุมัติ)

/** นับใหม่แล้ววาดตัวเลขบนเมนู — ไม่ต้องรอผล ไม่ขวางการเปลี่ยนหน้า */
export function refreshBadges({ force = false } = {}) {
  if (!state.user) return Promise.resolve();
  if (running) return running;
  if (!force && Date.now() - last < MIN_GAP) return Promise.resolve();
  running = (async () => {
    try {
      const { person, ids } = await myIds();
      const [rq, ap] = await Promise.all([
        countRequests(ids).catch(() => ({ approve: 0, unread: 0, byForm: {} })),
        countAppraisal(person).catch(() => 0),
      ]);
      setState({ navBadges: {
        requests: rq.approve + rq.unread, requestsApprove: rq.approve, requestsUnread: rq.unread,
        requestsByForm: rq.byForm, appraisal: ap,
      } }, { silent: true });
      const { renderNav } = await import('../core/render.js');
      renderNav();
    } finally {
      last = Date.now();
      running = null;
    }
  })();
  return running;
}
