/**
 * หน้าวันหยุดบริษัทฯ (เมนู 📅 วันหยุดบริษัทฯ ในหน้าจัดการข้อมูล)
 * ใช้นับวันทำการ เช่น แบบฟอร์มจองคิวงานติดตั้ง PPE: "ถึงวันที่" = วันเข้าติดตั้ง + 7 วันทำการ
 * (ไม่นับเสาร์-อาทิตย์ และวันหยุดในรายการนี้) · เก็บในตั้งค่าระบบ CompanyHolidays (JSON)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { HOLIDAY_SETTING, holidays, parseHolidays, thDay } from '../services/install.js';

let draft = [];
let saved = '';
const fmt = (rows) => JSON.stringify(parseHolidays(JSON.stringify(rows.filter((r) => r.date))));
const dirty = () => fmt(draft) !== saved;
const TH_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const dow = (day) => { const [y, m, d] = day.split('-').map(Number); return TH_DOW[new Date(y, m - 1, d).getDay()]; };

export async function holidayEditorHtml() {
  draft = (await holidays({ fresh: true })).map((r) => ({ ...r }));
  saved = fmt(draft);
  return `<div class="panel-head">📅 วันหยุดบริษัทฯ</div>
    <div class="om-intro">
      วันหยุดนักขัตฤกษ์และวันหยุดพิเศษของบริษัทฯ — ระบบใช้นับ <b>วันทำการ</b> (ไม่นับเสาร์-อาทิตย์ และวันในรายการนี้)
      <ul>
        <li>แบบฟอร์มจองคิวงานติดตั้ง PPE: "ถึงวันที่" = วันเข้าติดตั้ง + 7 วันทำการ</li>
        <li>เพิ่มทีละวัน หรือวางหลายวันพร้อมกัน (บรรทัดละวัน เช่น <code>2026-12-05 วันพ่อแห่งชาติ</code>)</li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b></li>
      </ul>
    </div>
    <div id="hol-editor"></div>`;
}

function paint() {
  const box = $('#hol-editor');
  if (!box) return;
  const year = new Date().getFullYear();
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${draft.filter((r) => r.date).length} วัน · ปี ${year + 543}: ${draft.filter((r) => r.date.startsWith(String(year))).length} วัน</span>
      <button class="btn-mini" data-hol="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-hol="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    <section class="om-group">
      <ol class="om-items hol-items">
        ${draft.map((r, i) => `<li class="hol-row">
          <input type="date" class="hol-date" data-i="${i}" value="${esc(r.date)}">
          <span class="dim hol-dow">${r.date ? `${esc(dow(r.date))} · ${esc(thDay(r.date))}` : ''}</span>
          <input class="om-iname hol-name" data-i="${i}" value="${esc(r.name)}" placeholder="ชื่อวันหยุด เช่น วันพ่อแห่งชาติ" maxlength="120">
          <button class="btn-mini danger" data-hol="del" data-i="${i}" title="ลบ">✕</button>
        </li>`).join('') || '<div class="empty">ยังไม่มีวันหยุด — นับเฉพาะเสาร์-อาทิตย์เป็นวันหยุด</div>'}
      </ol>
      <button class="btn-mini om-add" data-hol="add">＋ เพิ่มวันหยุด</button>
      <details class="hol-paste"><summary>วางหลายวันพร้อมกัน</summary>
        <textarea id="hol-text" rows="5" placeholder="2026-12-05 วันพ่อแห่งชาติ&#10;2026-12-10 วันรัฐธรรมนูญ&#10;2026-12-31 วันสิ้นปี"></textarea>
        <button class="btn-mini" data-hol="paste">เพิ่มจากข้อความ</button>
      </details>
    </section>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${HOLIDAY_SETTING}</b> (JSON)</div>`;
}

async function save(btn) {
  if (draft.some((r) => !r.date && r.name)) { toast('มีแถวที่ยังไม่ได้เลือกวันที่', 'bad'); return; }
  draft = parseHolidays(JSON.stringify(draft));
  const value = JSON.stringify(draft);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === HOLIDAY_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: HOLIDAY_SETTING, Value: value, Description: 'วันหยุดบริษัทฯ (นับวันทำการ) — แก้ที่ จัดการข้อมูล → 📅 วันหยุดบริษัทฯ' });
    const { clearSettings } = await import('../utils/settings.js'); clearSettings();
    saved = value;
    toast('✓ บันทึกวันหยุดบริษัทฯ แล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

export function bindHolidayEditor() {
  const box = $('#hol-editor');
  if (!box) return;
  paint();
  const refresh = () => box.querySelectorAll('[data-hol="save"], [data-hol="reset"]').forEach((b) => { b.disabled = !dirty(); });
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('hol-name')) { draft[+t.dataset.i].name = t.value; refresh(); }
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList.contains('hol-date')) { draft[+t.dataset.i].date = t.value; paint(); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hol]');
    if (!b || b.disabled) return;
    const a = b.dataset.hol;
    if (a === 'save') { save(b); return; }
    if (a === 'add') { draft.push({ date: '', name: '' }); paint(); box.querySelector(`.hol-date[data-i="${draft.length - 1}"]`)?.focus(); return; }
    if (a === 'del') draft.splice(+b.dataset.i, 1);
    else if (a === 'paste') {
      const add = parseHolidays($('#hol-text').value);
      if (!add.length) { toast('ไม่พบวันที่ — ใช้รูปแบบ 2026-12-05 ชื่อวันหยุด บรรทัดละวัน', 'bad'); return; }
      draft = parseHolidays(JSON.stringify([...draft.filter((r) => r.date), ...add]));
      toast(`เพิ่ม ${add.length} วัน — กด 💾 บันทึก`);
    } else if (a === 'reset') {
      if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
      holidays({ fresh: true }).then((h) => { draft = h.map((r) => ({ ...r })); paint(); });
      return;
    }
    paint();
  });
}

export const holidayHasUnsaved = () => !!$('#hol-editor') && dirty();
