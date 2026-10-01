/**
 * หน้าต่างแนบสลิปการโอนเงิน — เด้งขึ้นเมื่อผู้อนุมัติขั้นสุดท้าย (บัญชีการเงิน) กดอนุมัติ
 * แนบได้ 3 แบบ: เลือกไฟล์ · ลากไฟล์มาวาง · กด Ctrl+V วางรูปที่แคปไว้
 * คืน Promise<{ name, url, kind, sizeText } | null> — null = กดยกเลิก (ยังไม่อนุมัติ)
 */
import { esc } from '../core/dom.js';
import { uploadFile } from '../services/photos.js';

export function pickSlip({ folder = 'แบบฟอร์ม/ไม่ระบุฝ่าย/สลิปโอนเงิน', title = 'แนบสลิปการโอนเงิน' } = {}) {
  return new Promise((resolve) => {
    let slip = null;
    let busy = false;
    const layer = document.createElement('div');
    layer.className = 'eta-mask';
    layer.innerHTML = `
      <div class="eta-box slip-box" role="dialog" aria-modal="true" aria-labelledby="slip-title">
        <div class="eta-head" id="slip-title">🧾 ${esc(title)}</div>
        <div class="eta-body">
          <p>อนุมัติขั้นสุดท้ายแล้วปิดงาน — แนบหลักฐานการโอนเงินก่อน</p>
          <label class="slip-drop" id="slip-drop" tabindex="0">
            <input type="file" id="slip-file" accept="image/*,application/pdf" hidden>
            <div class="slip-preview" id="slip-preview">
              <div class="slip-ico">📎</div>
              <b>คลิกเพื่อเลือกไฟล์ · ลากไฟล์มาวาง · หรือกด <kbd>Ctrl</kbd>+<kbd>V</kbd> วางรูปสลิป</b>
              <span class="dim">รูปภาพ หรือ PDF</span>
            </div>
          </label>
          <div class="slip-status dim" id="slip-status"></div>
        </div>
        <div class="eta-foot">
          <button type="button" class="btn-mini" data-slip="0">ยกเลิก</button>
          <button type="button" class="btn btn-primary" data-slip="1" disabled>✓ ยืนยันอนุมัติและปิดงาน</button>
        </div>
      </div>`;

    const $ = (s) => layer.querySelector(s);
    const ok = $('[data-slip="1"]');
    const status = $('#slip-status');
    const preview = $('#slip-preview');

    const take = async (file) => {
      if (!file || busy) return;
      busy = true;
      ok.disabled = true;
      slip = null;
      preview.innerHTML = file.type.startsWith('image/')
        ? `<img src="${URL.createObjectURL(file)}" alt="ตัวอย่างสลิป">`
        : `<div class="slip-ico">📄</div><b>${esc(file.name)}</b>`;
      status.textContent = 'กำลังอัปโหลด…';
      try {
        slip = await uploadFile(file, folder, (pct) => { status.textContent = `กำลังอัปโหลด ${pct}%`; });
        status.textContent = `✓ แนบแล้ว ${slip.name} · ${slip.sizeText || ''} · กดที่กรอบเพื่อเปลี่ยนไฟล์`;
        ok.disabled = false;
      } catch (e) {
        status.textContent = 'อัปโหลดไม่สำเร็จ — ' + e.message;
      } finally { busy = false; }
    };

    $('#slip-file').onchange = (e) => take(e.target.files[0]);
    const drop = $('#slip-drop');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); };

    // วางรูปจากคลิปบอร์ด (แคปหน้าจอแอปธนาคาร แล้วกด Ctrl+V)
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      const blob = item.getAsFile();
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      take(new File([blob], `slip-${stamp}.${ext}`, { type: blob.type }));
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    const done = (v) => {
      layer.remove();
      document.removeEventListener('paste', onPaste);
      removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    $('[data-slip="0"]').onclick = () => done(null);
    ok.onclick = () => { if (slip) done(slip); };
    document.addEventListener('paste', onPaste);
    addEventListener('keydown', onKey, true);
    document.body.appendChild(layer);
    drop.focus();
  });
}
