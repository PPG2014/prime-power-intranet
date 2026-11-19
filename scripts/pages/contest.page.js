/**
 * แถบฟังก์ชันเสริม "ประกวดปีใหม่" — เปิด/ปิดได้ที่ จัดการข้อมูล → 🧩 ฟังก์ชันเสริม
 * ตัวระบบประกวดอยู่ในโฟลเดอร์ contest/ (หน้าเว็บแยก ใช้ Firebase ส่งคะแนนแบบ realtime)
 * หน้านี้ฝังหน้าเลือกบทบาทของระบบประกวดไว้ · ปิดฟังก์ชันอยู่ → แถบหายและเปิดลิงก์ตรงก็เข้าไม่ได้
 */
import { esc } from '../core/dom.js';
import { CONFIG } from '../core/config.js';
import { contestVisible, loadAddons } from '../services/addons.js';

export const meta = {
  route: 'contest',
  title: 'ประกวด',
  nav: true,
  order: 10.5,
  visible: (st) => contestVisible(st),
  navLabel: (st) => (st.addons && st.addons.contest && st.addons.contest.label) || 'ประกวด',
};

export async function render(ctx) {
  // อ่านค่าล่าสุดทุกครั้งที่เปิดแถบ — ผู้ดูแลเพิ่งปิด/เปิด หรือเพิ่งวางค่า Firebase ก็มีผลทันที
  await loadAddons();
  const st = ctx.state;
  if (!contestVisible(st)) {
    return `<section class="page"><div class="wrap">
      <h1 class="page-title">ประกวด</h1>
      <div class="panel"><div class="empty">ฟังก์ชันนี้ปิดอยู่<br>
        <span class="dim">ผู้ดูแลเปิดได้ที่ จัดการข้อมูล → 🧩 ฟังก์ชันเสริม</span><br><br>
        <a class="btn" href="#/">← กลับหน้าแรก</a></div></div>
    </div></section>`;
  }
  const c = st.addons.contest;
  return `<section class="page page-contest">
    <iframe class="contest-frame" src="contest/index.html?v=${encodeURIComponent(CONFIG.build)}"
      title="${esc(c.label)}" allow="fullscreen; clipboard-write"></iframe>
  </section>`;
}
