/**
 * ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งานนานเกิน CONFIG.idleMinutes (ค่าเริ่มต้น 60 นาที)
 *
 * - นับ "ใช้งาน" จากการขยับเมาส์ พิมพ์ คลิก เลื่อนหน้า แตะจอ
 * - เวลาใช้งานล่าสุดเก็บใน localStorage ใช้ร่วมกันทุกแท็บ — ทำงานอยู่แท็บหนึ่ง อีกแท็บจะไม่เด้งออก
 * - 2 นาทีก่อนครบ ขึ้นแถบเตือนพร้อมนับถอยหลัง กด "ใช้งานต่อ" เพื่อต่อเวลา
 * - ครบเวลาแล้วออกจากระบบ Microsoft ด้วย (ไม่ใช่แค่ปิดหน้าเว็บ)
 *   กันคนอื่นมาใช้เครื่องที่เปิดทิ้งไว้แล้วกดเข้าสู่ระบบต่อได้ทันที
 * - เครื่องพัก (sleep) นานจนเลยเวลา พอเปิดกลับมาจะออกจากระบบทันที
 */
import { CONFIG } from '../core/config.js';
import { signOut } from './auth.js';

const KEY = 'pp-last-active';
export const IDLE_FLAG = 'pp-idle-out';          // บอกหน้าเข้าสู่ระบบว่าออกเพราะไม่ได้ใช้งาน
const WARN_MS = 2 * 60 * 1000;
const CHECK_MS = 15 * 1000;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];

const idleMs = () => (Number(CONFIG.idleMinutes) || 60) * 60 * 1000;
const store = {
  get() { try { return Number(localStorage.getItem(KEY)) || 0; } catch (e) { return mem; } },
  set(v) { mem = v; try { localStorage.setItem(KEY, String(v)); } catch (e) { /* ใช้ค่าในหน่วยความจำแทน */ } },
};
let mem = Date.now();
let lastWrite = 0;
let leaving = false;

function touch() {
  const now = Date.now();
  if (now - lastWrite < 5000) return;      // ไม่ต้องเขียนถี่ทุกครั้งที่ขยับเมาส์
  lastWrite = now;
  store.set(now);
  hideWarn();
}

function hideWarn() {
  const bar = document.getElementById('idle-bar');
  if (bar) bar.remove();
}

function showWarn(leftMs) {
  let bar = document.getElementById('idle-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'idle-bar';
    bar.className = 'idle-bar';
    bar.setAttribute('role', 'alert');
    bar.innerHTML = `<span>ไม่มีการใช้งานนานแล้ว ระบบจะออกจากระบบใน <b id="idle-left"></b>
      · บันทึกงานที่ค้างอยู่ก่อน</span><button type="button">ใช้งานต่อ</button>`;
    bar.querySelector('button').onclick = () => { lastWrite = 0; touch(); };
    document.body.appendChild(bar);
  }
  const s = Math.max(0, Math.ceil(leftMs / 1000));
  bar.querySelector('#idle-left').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} นาที`;
}

async function logout() {
  if (leaving) return;
  leaving = true;
  try { sessionStorage.setItem(IDLE_FLAG, '1'); } catch (e) { /* ไม่มีที่เก็บก็ออกได้ */ }
  try { localStorage.removeItem(KEY); } catch (e) { /* ข้าม */ }
  await signOut();
}

function check() {
  if (leaving) return;
  const idle = Date.now() - store.get();
  const limit = idleMs();
  if (idle >= limit) { logout(); return; }
  if (idle >= limit - WARN_MS) showWarn(limit - idle); else hideWarn();
}

/** เริ่มจับเวลาหลังเข้าสู่ระบบแล้ว */
export function startIdleLogout() {
  // เปิดเว็บใหม่: ถ้าค่าเดิมเก่ากว่ากำหนด (ปิดเครื่องไปนาน) นับใหม่จากตอนนี้
  // เพราะเพิ่งผ่านหน้าเข้าสู่ระบบมา ไม่ควรเด้งออกทันที
  lastWrite = 0;
  touch();
  EVENTS.forEach((e) => addEventListener(e, touch, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, CHECK_MS);
  // นับถอยหลังทุกวินาทีเฉพาะตอนแถบเตือนขึ้นอยู่
  setInterval(() => { if (document.getElementById('idle-bar')) check(); }, 1000);
}
