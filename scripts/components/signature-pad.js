/**
 * ช่องลงลายเซ็น ใช้ได้ทั้งวาดด้วยเมาส์/นิ้ว และอัปโหลดรูปลายเซ็น
 * เก็บเป็นไฟล์ในคลังเอกสารของไซต์ แล้วคืน URL ไปเก็บในใบประเมิน
 */
import { esc, $, $$ } from '../core/dom.js';
import { uploadFile } from '../services/photos.js';

/** HTML ของช่องลงนาม (role ใช้แยก id เมื่อมีหลายช่องในหน้าเดียว) */
export function signaturePad(role, current = '', editable = true) {
  return `
    <div class="sig-pad" data-sig="${esc(role)}">
      <div class="sig-head">ลายเซ็น
        <span class="dim">วาดบนกรอบ หรืออัปโหลดรูป PNG/JPG</span></div>
      ${current ? `<div class="sig-current"><img data-photo="${esc(current)}" alt="ลายเซ็นที่บันทึกไว้"></div>` : ''}
      ${editable ? `
        <canvas class="sig-canvas" width="600" height="200"></canvas>
        <div class="sig-actions">
          <label class="btn-mini sig-upload">อัปโหลดรูป
            <input type="file" accept="image/*" hidden></label>
          <button type="button" class="btn-mini sig-clear">ล้างลายเซ็น</button>
          <span class="sig-status dim"></span>
        </div>` : ''}
    </div>`;
}

/** เปิดใช้งานช่องลงนามทั้งหมดในหน้า */
export function bindSignaturePads(folder = 'Appraisals/signatures') {
  $$('.sig-pad').forEach((box) => {
    const canvas = box.querySelector('.sig-canvas');
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = '1';

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#11305a';

    let drawing = false;
    let dirty = false;
    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      return { x: (p.clientX - r.left) * (canvas.width / r.width),
        y: (p.clientY - r.top) * (canvas.height / r.height) };
    };
    const start = (ev) => { drawing = true; dirty = true; ctx.beginPath(); const q = pos(ev); ctx.moveTo(q.x, q.y); ev.preventDefault(); };
    const move = (ev) => { if (!drawing) return; const q = pos(ev); ctx.lineTo(q.x, q.y); ctx.stroke(); ev.preventDefault(); };
    const end = () => { drawing = false; };

    canvas.onmousedown = start; canvas.onmousemove = move;
    canvas.onmouseup = end; canvas.onmouseleave = end;
    canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;

    box.querySelector('.sig-clear').onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      box.dataset.uploaded = '';
      box.querySelector('.sig-status').textContent = '';
    };

    box.querySelector('.sig-upload input').onchange = async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const st = box.querySelector('.sig-status');
      st.textContent = 'กำลังอัปโหลด…';
      try {
        const up = await uploadFile(f, folder);
        box.dataset.uploaded = up.url;
        st.textContent = `✓ ${up.name}`;
        dirty = false;
      } catch (e) { st.textContent = e.message; }
    };

    box.isDirty = () => dirty;
  });
}

/**
 * อ่านลายเซ็นของช่องที่ระบุ แล้วอัปโหลดถ้าเป็นลายที่เพิ่งวาด
 * คืน URL รูป หรือค่าว่างถ้าไม่ได้เซ็นใหม่
 */
export async function readSignature(role, folder = 'Appraisals/signatures') {
  const box = $(`.sig-pad[data-sig="${role}"]`);
  if (!box) return '';
  if (box.dataset.uploaded) return box.dataset.uploaded;

  const canvas = box.querySelector('.sig-canvas');
  if (!canvas || !box.isDirty || !box.isDirty()) return '';

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return '';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const file = new File([blob], `sign-${role}-${stamp}.png`, { type: 'image/png' });
  const up = await uploadFile(file, folder);
  return up.url;
}
