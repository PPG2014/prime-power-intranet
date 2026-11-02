/**
 * หน้าตั้งค่าค่าพาหนะ (เมนู 🚗 ค่าพาหนะ ในหน้าจัดการข้อมูล)
 * - อัตรารถยนต์ส่วนบุคคลปกติ (6 บาท/กม.) และอัตราลด (3 บาท/กม.)
 * - รายชื่อบุคลากรที่ได้อัตราลด — คนที่ไม่มีชื่อได้อัตราปกติ
 * เก็บในตั้งค่าระบบ MileageRates (services/mileage.js)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { MILEAGE_SETTING, mileageConfig, formatMileage } from '../services/mileage.js';

let draft = { car: 6, reduced: 3, people: [] };
let saved = '';
let people = [];

const dirty = () => formatMileage(draft) !== saved;

export async function mileageEditorHtml() {
  const [cfg, dir] = await Promise.all([mileageConfig({ fresh: true }), list('directory').catch(() => [])]);
  people = dir.filter((p) => p.IsActive !== false && p.Title).map((p) => String(p.Title).trim()).sort((a, b) => a.localeCompare(b, 'th'));
  draft = { ...cfg, people: [...cfg.people] };
  saved = formatMileage(draft);
  return `<div class="panel-head">🚗 ค่าพาหนะ · เบิกค่าใช้จ่ายในการเดินทาง</div>
    <div class="om-intro">
      ช่อง <b>ราคาต่อหน่วย</b> ในแบบฟอร์มเบิกค่าใช้จ่ายในการเดินทาง เมื่อเลือกประเภทพาหนะ <b>รถยนต์ส่วนบุคคล</b>
      ระบบเติมอัตราให้ตามผู้ยื่น
      <ul>
        <li>บุคลากรที่มีชื่อในรายการด้านล่าง → ได้ <b>อัตราลด</b></li>
        <li>คนที่ไม่มีชื่อ → ได้ <b>อัตราปกติ</b></li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> — มีผลกับการกรอกแบบฟอร์มครั้งถัดไปทันที (คำขอที่ส่งไปแล้วไม่เปลี่ยน)</li>
      </ul>
    </div>
    <datalist id="mil-people">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="mil-editor"></div>`;
}

function paint() {
  const box = $('#mil-editor');
  if (!box) return;
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">อัตราลด ${draft.people.length} คน</span>
      <button class="btn-mini" data-mil="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-mil="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">อัตรารถยนต์ส่วนบุคคล (บาท/กม.)</b></div>
      <div class="mil-rates">
        <label>อัตราปกติ <input type="number" min="0" step="0.5" data-rate="car" value="${esc(draft.car)}"> บาท/กม.</label>
        <label>อัตราลด <input type="number" min="0" step="0.5" data-rate="reduced" value="${esc(draft.reduced)}"> บาท/กม.</label>
      </div>
    </section>
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">บุคลากรที่ได้อัตราลด (${esc(draft.reduced)} บาท/กม.)</b><span class="dim">${draft.people.length} คน</span></div>
      <div class="ppe-pick">
        ${draft.people.map((n, i) => `<span class="ppe-chip">${esc(n)}<button type="button" data-mil="unpick" data-i="${i}" title="เอาออก">✕</button></span>`).join('')}
        <input class="ppe-add mil-add" list="mil-people" placeholder="พิมพ์ชื่อเพื่อค้นหา แล้วเลือก" autocomplete="off">
      </div>
      ${draft.people.length ? '' : `<div class="dim" style="margin-top:6px">ยังไม่มีรายชื่อ — ทุกคนได้ ${esc(draft.car)} บาท/กม.</div>`}
    </section>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${MILEAGE_SETTING}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
}

async function save(btn) {
  if (!(+draft.car > 0) || !(+draft.reduced > 0)) { toast('ใส่อัตราเป็นตัวเลขมากกว่า 0', 'bad'); return; }
  const value = formatMileage(draft);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === MILEAGE_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: MILEAGE_SETTING, Value: value, Description: 'อัตราค่าพาหนะรถยนต์ส่วนบุคคล + รายชื่อที่ได้อัตราลด — แก้ที่ จัดการข้อมูล → 🚗 ค่าพาหนะ' });
    const { clearSettings } = await import('../utils/settings.js'); clearSettings();
    saved = value;
    toast('✓ บันทึกค่าพาหนะแล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

export function bindMileageEditor() {
  const box = $('#mil-editor');
  if (!box) return;
  paint();
  const refresh = () => box.querySelectorAll('[data-mil="save"], [data-mil="reset"]').forEach((b) => { b.disabled = !dirty(); });
  const pick = (n) => {
    if (!people.includes(n)) return false;
    if (!draft.people.includes(n)) draft.people.push(n);
    paint();
    box.querySelector('.mil-add')?.focus();
    return true;
  };
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.rate) { draft[t.dataset.rate] = Number(t.value); refresh(); return; }
    if (t.classList.contains('mil-add')) pick(t.value.trim());
  });
  box.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.classList.contains('mil-add') || e.key !== 'Enter') return;
    e.preventDefault();
    const n = t.value.trim();
    if (n && !pick(n)) toast(`ไม่พบ “${n}” ในทะเบียนบุคลากร — เลือกจากรายชื่อที่ขึ้นมา`, 'bad');
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mil]');
    if (!b || b.disabled) return;
    const a = b.dataset.mil;
    if (a === 'save') { save(b); return; }
    if (a === 'unpick') draft.people.splice(+b.dataset.i, 1);
    else if (a === 'reset') {
      if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
      mileageConfig({ fresh: true }).then((c) => { draft = { ...c, people: [...c.people] }; paint(); });
      return;
    }
    paint();
  });
}

export const mileageHasUnsaved = () => !!$('#mil-editor') && dirty();
