/** ตัวช่วยเล็ก ๆ ที่ใช้ทุกหน้า */

/** กันข้อความจากผู้ใช้ไม่ให้กลายเป็น HTML — ใช้ทุกครั้งที่แทรกค่าลง template */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** ผูก event ให้ทุกปุ่มที่มี data-attribute ตัวเดียวกัน */
export function onClick(attr, handler, root = document) {
  $$(`[data-${attr}]`, root).forEach((el) => {
    el.onclick = (ev) => handler(el.dataset[attr], el, ev);
  });
}
