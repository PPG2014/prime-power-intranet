/**
 * หน้าต่างเลือกหน้าที่จะบันทึกเป็นรูป — ติ๊กทีละหน้า หรือ "เลือกทั้งหมด"
 * ขึ้นเป็นชั้นแยกเหนือหน้าต่างรายงาน (ไม่แทนที่ #overlay-root)
 * คืน Promise<number[]> = ลำดับหน้าที่เลือก (เริ่ม 0) · กดยกเลิกคืน []
 */
import { esc } from '../core/dom.js';

export function pickPages(items, { title = 'เลือกหน้าที่จะบันทึกเป็นรูป', fmt = 'PNG' } = {}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'eta-mask';
    layer.innerHTML = `
      <div class="eta-box pp-box" role="dialog" aria-modal="true" aria-labelledby="pp-title">
        <div class="eta-head" id="pp-title">🖼 ${esc(title)} · ${esc(fmt)} 1920×1080</div>
        <div class="eta-body">
          <label class="pp-all"><input type="checkbox" id="pp-all" checked> <b>เลือกทั้งหมด (${items.length} หน้า)</b></label>
          <div class="pp-list">${items.map((label, i) => `
            <label class="pp-item"><input type="checkbox" data-pp="${i}" checked>
              <span><b>หน้า ${i + 1}</b> · ${esc(label)}</span></label>`).join('')}
          </div>
          <p class="pp-hint">เลือก 1 หน้า = ได้ไฟล์รูปเดียว · เลือกหลายหน้า = รวมเป็นไฟล์ ZIP ไฟล์เดียว</p>
        </div>
        <div class="eta-foot">
          <button type="button" class="btn-mini" data-pp-cancel>ยกเลิก</button>
          <button type="button" class="btn btn-primary" data-pp-ok></button>
        </div>
      </div>`;

    const boxes = [...layer.querySelectorAll('[data-pp]')];
    const all = layer.querySelector('#pp-all');
    const ok = layer.querySelector('[data-pp-ok]');
    const chosen = () => boxes.filter((b) => b.checked).map((b) => +b.dataset.pp);
    const refresh = () => {
      const n = chosen().length;
      all.checked = n === boxes.length;
      all.indeterminate = n > 0 && n < boxes.length;
      ok.disabled = !n;
      ok.textContent = !n ? 'เลือกอย่างน้อย 1 หน้า' : n === 1 ? 'บันทึก 1 รูป' : `บันทึก ${n} รูป (ZIP)`;
    };
    all.onchange = () => { boxes.forEach((b) => { b.checked = all.checked; }); refresh(); };
    boxes.forEach((b) => { b.onchange = refresh; });

    const done = (v) => {
      layer.remove();
      removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done([]); } };
    layer.querySelector('[data-pp-cancel]').onclick = () => done([]);
    ok.onclick = () => done(chosen());
    addEventListener('keydown', onKey, true);
    refresh();
    document.body.appendChild(layer);
    ok.focus();
  });
}
