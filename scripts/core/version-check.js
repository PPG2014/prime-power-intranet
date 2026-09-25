/**
 * ตรวจว่ามีโค้ดรุ่นใหม่ขึ้นเซิร์ฟเวอร์แล้วหรือยัง
 *
 * GitHub Pages ให้เบราว์เซอร์เก็บไฟล์ไว้ราว 10 นาที หลังอัปโหลดโค้ดใหม่
 * ผู้ใช้บางคนจึงได้ไฟล์เก่าปนใหม่ แล้วเจอข้อผิดพลาดแปลก ๆ
 * ที่นี่อ่านค่า build ล่าสุดจาก config.js บนเซิร์ฟเวอร์ (ไม่ใช้แคช) เทียบกับรุ่นที่รันอยู่
 * ถ้าไม่ตรง ให้โหลดไฟล์ทุกตัวที่หน้านี้ใช้ใหม่จากเซิร์ฟเวอร์ แล้วรีเฟรชหน้า
 *
 * ต้องเปลี่ยนค่า build ใน config.js ทุกครั้งที่อัปโหลดโค้ดใหม่ ระบบนี้จึงจะรู้ว่ามีรุ่นใหม่
 */
import { CONFIG } from './config.js';

const DONE_KEY = 'pp-refreshed-build';
const EVERY = 30 * 60 * 1000;       // ตรวจซ้ำทุก 30 นาทีระหว่างเปิดเว็บค้างไว้

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ก็ข้าม */ } },
};

/** ค่า build ของโค้ดที่อยู่บนเซิร์ฟเวอร์ตอนนี้ (null = อ่านไม่ได้) */
async function serverBuild() {
  const url = new URL('./config.js', import.meta.url);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const m = (await res.text()).match(/build:\s*'([^']+)'/);
  return m ? m[1] : null;
}

/** โหลดไฟล์ JS/CSS ของเว็บนี้ทุกตัวใหม่จากเซิร์ฟเวอร์ให้แคชเป็นรุ่นล่าสุด แล้วรีเฟรชหน้า */
async function refreshAndReload() {
  const mine = performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u));
  await Promise.all([...new Set(mine)].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.reload();
}

function showBanner() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = `<span>มีเว็บรุ่นใหม่ · บันทึกงานที่ค้างอยู่ก่อน แล้วกดโหลดใหม่</span>
    <button type="button">โหลดรุ่นใหม่</button>`;
  bar.querySelector('button').onclick = (ev) => {
    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'กำลังโหลด…';
    refreshAndReload();
  };
  document.body.appendChild(bar);
}

/**
 * auto = ตอนเปิดเว็บ ยังไม่มีงานค้าง รีเฟรชให้เองได้เลย (ครั้งเดียวต่อรุ่น กันวนไม่รู้จบ)
 * ระหว่างใช้งาน แค่ขึ้นแถบให้ผู้ใช้กดเอง จะได้ไม่ทำฟอร์มที่กรอกค้างหาย
 */
async function check(auto) {
  const latest = await serverBuild().catch(() => null);
  if (!latest || latest === CONFIG.build) return;
  if (auto && store.get(DONE_KEY) !== latest) {
    store.set(DONE_KEY, latest);
    await refreshAndReload();
    return;
  }
  showBanner();
}

export function watchVersion() {
  try { performance.setResourceTimingBufferSize(1000); } catch (e) { /* เบราว์เซอร์เก่าไม่มีก็ข้าม */ }
  check(true);
  setInterval(() => check(false), EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(false); });
}
