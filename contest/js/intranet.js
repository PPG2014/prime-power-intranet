// ============================================================
//  ตัวเชื่อมกับเว็บภายใน Prime Power
//  เว็บภายในเขียนค่าไว้ใน localStorage "pp-contest" ทุกครั้งที่ผู้ใช้ล็อกอิน (scripts/services/addons.js)
//    { on, title, fb, email, name, manager, people: [{ n, e }] }
//  - on: false หรือไม่มีค่า (ไม่เคยเข้าเว็บภายในในเบราว์เซอร์นี้) → หน้าประกวดทุกหน้าไม่เปิดให้ใช้
//  - email/name: ผู้ใช้ที่ล็อกอินเว็บภายใน → จับคู่กรรมการ และใช้เป็นสิทธิ์โหวตขวัญใจ 1 คน 1 สิทธิ์
// ============================================================
export const CTX_KEY = 'pp-contest';

export const intranet = (() => {
  try { return JSON.parse(localStorage.getItem(CTX_KEY)) || null; } catch { return null; }
})();

export const contestOn = () => !!(intranet && intranet.on);
export const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();

/** รหัสแทนอีเมล (SHA-256 ตัดเหลือ 24 ตัว) — เก็บใน Firebase แทนอีเมลจริง คนนอกอ่านแล้วไม่รู้ว่าเป็นใคร */
export async function emailKey(email) {
  const s = String(email || '').trim().toLowerCase();
  if (!s) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pp-contest:' + s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ชื่องาน: ตั้งในหน้าควบคุมการประกวดแล้วใช้ค่านั้น · ยังเป็นค่าตั้งต้น → ใช้ชื่อที่ตั้งในเว็บภายใน */
export const DEFAULT_TITLE = 'การประกวดปีใหม่';
export const titleOf = (ev) => ((ev && ev.title && ev.title !== DEFAULT_TITLE) ? ev.title : '') || (intranet && intranet.title) || (ev && ev.title) || DEFAULT_TITLE;

/** รหัสของผู้ใช้ที่ล็อกอินเว็บภายในอยู่ */
export const myKey = () => emailKey(intranet && intranet.email);

/** รายชื่อบุคลากร (ชื่อ ↔ รหัสอีเมล) สำหรับเลือกกรรมการ — คำนวณครั้งเดียว */
let peopleKeys = null;
export async function peopleWithKeys() {
  if (peopleKeys) return peopleKeys;
  const ppl = (intranet && Array.isArray(intranet.people)) ? intranet.people : [];
  peopleKeys = await Promise.all(ppl.map(async (p) => ({ name: p.n, email: p.e, key: await emailKey(p.e) })));
  return peopleKeys;
}

/** หน้าแจ้งว่าปิดใช้งาน (ปิดสวิตช์ในเว็บภายใน หรือเปิดลิงก์ตรงโดยไม่ผ่านเว็บภายใน) */
export function closedScreen() {
  const never = !intranet;
  document.querySelector('.loading')?.remove();
  document.body.innerHTML = `<div class="bg-fx"></div><main class="landing" style="text-align:center">
    <div style="font-size:3rem">🔒</div>
    <h1 style="font-size:2rem">ระบบประกวดปิดอยู่</h1>
    <p class="lead" style="margin:0 auto 24px">${never
      ? 'เปิดผ่านเว็บภายใน Prime Power (ล็อกอินก่อน) แล้วเลือกแถบประกวด'
      : 'ผู้ดูแลปิดฟังก์ชันนี้ไว้ในหน้าจัดการข้อมูล ถ้าเพิ่งเปิดใหม่ ให้เข้าเว็บภายในอีกครั้งแล้วลองใหม่'}</p>
    <a class="btn btn-primary" href="../" target="_top">ไปเว็บภายใน</a></main>`;
}

/** ลิงก์ "← กลับ" เมื่อเปิดในแถบประกวดของเว็บภายใน */
export function backLink(label = '← เลือกบทบาท') {
  if (!inFrame) return '';
  return `<a class="btn btn-ghost btn-sm pp-back" href="index.html">${label}</a>`;
}
