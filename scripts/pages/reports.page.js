import { esc } from '../core/dom.js';
// import { list } from '../services/data.js';

export const meta = { route: 'reports', title: 'รายงาน', nav: true, order: 7, adminOnly: false };

export async function render(ctx) {
  return `
    <section class="page page-reports">
      <div class="wrap">
        <h1 class="page-title">${esc(meta.title)}</h1>
        <p class="page-lead">สรุปปริมาณคำขอและระยะเวลาอนุมัติ</p>
        <div class="panel placeholder">ย้ายเนื้อหาหน้านี้จากต้นแบบไฟล์เดียวมาไว้ที่นี่</div>
      </div>
    </section>`;
}

export function mount(ctx) {}
