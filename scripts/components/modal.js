/** หน้าต่างลอย ใช้ร่วมทุกหน้า — ฟอร์มแก้ไข หน้าต่างอ่านเอกสาร ประกาศเด้ง */
import { $, esc } from '../core/dom.js';

export function openModal({ title, body, footer = '', onClose, wide = false, dismissable = false }) {
  const root = $('#overlay-root');
  root.innerHTML = `
    <div class="mask" id="mask">
      <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">${esc(title)}<button id="modal-x" aria-label="ปิด">✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; onClose?.(); };
  $('#modal-x').onclick = close;
  // ปิดด้วยการคลิกนอกกรอบ/ปุ่ม Esc เฉพาะหน้าต่างที่ตั้ง dismissable ไว้ (หน้าต่างอ่านอย่างเดียว)
  // หน้าต่างกรอก/แก้ไข/อัปเดตข้อมูล ต้องกดกากบาทเท่านั้น กันข้อมูลหายเพราะเผลอคลิกนอกกรอบ
  if (dismissable) {
    $('#mask').onclick = (e) => { if (e.target.id === 'mask') close(); };
    addEventListener('keydown', function esc_(e) {
      if (e.key === 'Escape') { close(); removeEventListener('keydown', esc_); }
    });
  }
  return close;
}

export const closeModal = () => { $('#overlay-root').innerHTML = ''; };
