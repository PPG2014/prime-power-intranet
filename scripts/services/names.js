/**
 * ชื่อผู้อนุมัติเป็นภาษาไทยเสมอ
 *
 * อนุมัติผ่านการ์ด Teams → Power Automate บันทึกชื่อจากบัญชี Microsoft 365 (ภาษาอังกฤษ เช่น "Werasak Techakittiroj")
 * อนุมัติในเว็บ → บันทึกชื่อไทยจากทะเบียนบุคลากร · หน้านี้แปลงชื่ออังกฤษกลับเป็นชื่อไทยของคนเดียวกัน
 * จับคู่จาก: ชื่อ-สกุล (อังกฤษ) ในทะเบียน → ชื่อหน้าอีเมล (werasak.te@ = Werasak Te…) เฉพาะกรณีที่ตรงคนเดียว
 * หาไม่เจอคืนชื่อเดิม (ไม่เดา)
 */
import { list } from './data.js';

const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
const hasThai = (s) => /[฀-๿]/.test(s);
let people = [];
let seenLen = -1;
let byEN = new Map();
const memo = new Map();

/** ตั้งทะเบียนบุคลากรที่ใช้แปลงชื่อ (เรียกเมื่อโหลดทะเบียนแล้ว) */
export function setPeople(dir = []) {
  if (dir === people && dir.length === seenLen) return;   // แคชคืนอาร์เรย์เดิม · ถ้าจำนวนเปลี่ยนให้สร้างใหม่
  people = dir;
  seenLen = dir.length;
  byEN = new Map();
  memo.clear();
  dir.forEach((p) => { if (p.NameEN && p.Title) byEN.set(norm(p.NameEN), String(p.Title).trim()); });
}

/** โหลดทะเบียนบุคลากรมาใช้แปลงชื่อ (ไม่ขวางหน้า ถ้าอ่านไม่ได้ก็ใช้ชื่อเดิม) */
export async function ensurePeople() {
  try { setPeople(await list('directory')); } catch (e) { /* ใช้ชื่อเดิม */ }
}

/** ชื่อไทยของคนนี้ ถ้าหาได้ · ไม่ใช่ชื่อคน / เป็นภาษาไทยอยู่แล้ว / หาไม่เจอ คืนค่าเดิม */
export function thaiName(name) {
  const raw = String(name ?? '').trim();
  if (!raw || hasThai(raw) || !people.length) return name;
  if (memo.has(raw)) return memo.get(raw);
  const n = norm(raw);
  let out = byEN.get(n);
  if (!out) {
    const [first, ...rest] = n.split(' ');
    const last = rest.join('');
    const hits = people.filter((p) => {
      const local = norm(p.Email).split('@')[0];
      if (!local) return false;
      const [a, b = ''] = local.split(/[._-]/);
      return a === first && (!b || !last || last.startsWith(b));
    });
    if (hits.length === 1) out = String(hits[0].Title || '').trim();
  }
  out = out || name;
  memo.set(raw, out);
  return out;
}

/** แปลงชื่อในความเห็นแบบ "ชื่อ: ข้อความ | ชื่อ: ข้อความ" (ลำดับที่ต้องอนุมัติครบทุกคน) */
export const thaiNote = (note) => (typeof note === 'string' && note.includes(':') && people.length
  ? note.split(' | ').map((part) => {
    const i = part.indexOf(': ');
    return i > 0 ? thaiName(part.slice(0, i)) + part.slice(i) : part;
  }).join(' | ')
  : note);
