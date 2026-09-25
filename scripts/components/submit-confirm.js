/**
 * หน้าต่างสรุปข้อมูลก่อนส่งแบบฟอร์ม ให้ผู้ยื่นตรวจทานแล้วกดยืนยันอีกครั้ง
 * คืน Promise<boolean> — true เมื่อกดยืนยันส่ง
 */
import { esc, $ } from '../core/dom.js';
import { openModal, closeModal } from './modal.js';

/**
 * pairs = [[หัวข้อ, คำตอบ], …] ข้อความถูก escape มาแล้ว (จาก summarizeForm แบบ html)
 * files = รายชื่อไฟล์แนบ
 */
export function confirmSubmit({ formName, pairs, files = [], isEdit = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; closeModal(); resolve(ok); };

    openModal({
      title: `ตรวจทานก่อน${isEdit ? 'ยื่นใหม่' : 'ส่งคำขอ'}`,
      wide: true,
      onClose: () => finish(false),
      body: `
        <p class="sc-lead">ตรวจสอบข้อมูล <b>${esc(formName)}</b> ให้ถูกต้องก่อนส่ง
          ส่งแล้วคำขอจะเข้าสู่ขั้นตอนอนุมัติทันที</p>
        ${pairs.length ? `<table class="sc-table">${pairs.map(([k, v]) => `<tr>
            <th>${k}</th><td>${v}</td></tr>`).join('')}</table>`
          : '<div class="empty">ยังไม่ได้กรอกข้อมูล</div>'}
        ${files.length ? `<div class="sc-files"><b>ไฟล์แนบ ${files.length} ไฟล์</b>
          ${files.map((f) => `<span>📎 ${esc(f.name || f)}</span>`).join('')}</div>` : ''}`,
      footer: `<button class="btn-mini" id="sc-back">← กลับไปแก้ไข</button>
               <button class="btn btn-primary" id="sc-ok">ยืนยันส่งคำขอ</button>`,
    });
    $('#sc-back').onclick = () => finish(false);
    $('#sc-ok').onclick = () => finish(true);
  });
}
