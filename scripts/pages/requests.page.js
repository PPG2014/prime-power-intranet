import { esc } from '../core/dom.js';
// import { list } from '../services/data.js';

export const meta = { route: 'requests', title: 'ติดตามสถานะ', nav: true, order: 4, adminOnly: false };

export async function render(ctx) {
  return `
    <section class="page page-requests">
      <div class="wrap">
        <h1 class="page-title">${esc(meta.title)}</h1>
        <p class="page-lead">คำขอที่ยื่นไปแล้วและคำขอที่รออนุมัติจากคุณ</p>
        <div class="panel placeholder">ย้ายเนื้อหาหน้านี้จากต้นแบบไฟล์เดียวมาไว้ที่นี่</div>
      </div>
    </section>`;
}

export function mount(ctx) {}
