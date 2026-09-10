/**
 * แม่แบบสำหรับสร้างหน้าใหม่
 *
 * วิธีเพิ่มหน้า
 *   1. คัดลอกไฟล์นี้เป็น <ชื่อหน้า>.page.js
 *   2. แก้ meta ให้ครบ
 *   3. เพิ่มหนึ่งบรรทัดใน pages/index.js
 *   4. ถ้ามีสไตล์เฉพาะหน้า สร้าง styles/pages/<ชื่อหน้า>.css แล้ว @import ใน styles/main.css
 *
 * ทุกหน้าต้องส่งออกสามอย่างนี้เท่านั้น ห้ามยุ่งกับหน้าอื่น
 */

export const meta = {
  route: 'template',       // ใช้เป็น #/template
  title: 'ชื่อหน้า',        // แสดงบนเมนูและชื่อแท็บ
  nav: false,              // true = ขึ้นบนเมนูหลัก
  order: 99,               // ลำดับบนเมนู
  adminOnly: false,        // true = เห็นเฉพาะผู้ดูแลระบบ
};

/** คืนค่าเป็นสตริง HTML — ห้ามแตะ DOM ในฟังก์ชันนี้ */
export async function render(ctx) {
  return `
    <section class="page">
      <div class="wrap">
        <h1 class="page-title">${meta.title}</h1>
      </div>
    </section>`;
}

/** ผูก event หลังจาก HTML ขึ้นจอแล้ว — ไม่มีก็ลบทิ้งได้ */
export function mount(ctx) {}
