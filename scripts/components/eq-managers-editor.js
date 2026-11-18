/**
 * ผู้รับผิดชอบทะเบียนเครื่องมือ — ตั้งในหน้าต่างแก้ไขแบบฟอร์ม FM-PUR-006 / FM-PUR-008 (ก่อนเส้นทางอนุมัติ)
 *
 * คนในรายการนี้ เพิ่ม / แก้ไข / ลบ เครื่องมือในทะเบียนได้ (เพิ่มจากผู้ดูแลระบบและฝ่ายจัดซื้อและคลังสินค้า ซึ่งทำได้อยู่แล้ว)
 * เก็บในตั้งค่าระบบ EquipmentManagers (อีเมล คั่นด้วยจุลภาค) — ใช้ร่วมกันทั้งสองแบบฟอร์ม
 * แสดงเฉพาะเมื่อรหัสฟอร์มเป็น FM-PUR-006 / FM-PUR-008 (เปลี่ยนรหัสในหน้าต่าง → ส่วนนี้แสดง/ซ่อนตาม)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { eqFormKind } from '../services/equipment.js';

export const EQ_MANAGERS_SETTING = 'EquipmentManagers';

const low = (v) => String(v ?? '').trim().toLowerCase();
let people = [];
let picked = [];          // อีเมล
let saved = '';

export const eqManagersHost = () => '<div class="ar-box eqm-box" id="eqm-box" hidden></div>';

const nameOf = (em) => (people.find((p) => low(p.Email) === low(em)) || {}).Title || em;
const value = () => picked.join(', ');

function paint() {
  const box = $('#eqm-box');
  if (!box) return;
  box.innerHTML = `
    <div class="ar-head">🧰 ผู้รับผิดชอบทะเบียนเครื่องมือและอุปกรณ์ <span class="eqm-sub">เพิ่ม · แก้ไข · ลบ เครื่องมือในทะเบียนได้</span></div>
    <div class="eqm-body">
      <div class="ppe-pick">
        ${picked.map((em, i) => `<span class="ppe-chip" title="${esc(em)}">${esc(nameOf(em))}<button type="button" data-eqm-del="${i}" title="เอาออก">✕</button></span>`).join('')}
        <input class="ppe-add" id="eqm-add" list="eqm-people" placeholder="พิมพ์ชื่อบุคลากร แล้วเลือก" autocomplete="off">
      </div>
      <datalist id="eqm-people">${people.filter((p) => p.Email && !picked.some((x) => low(x) === low(p.Email)))
        .map((p) => `<option value="${esc(p.Title)}">${esc([p.Nickname, p.Department].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
      <div class="dim eqm-note">ผู้ดูแลระบบและบุคลากรฝ่ายจัดซื้อและคลังสินค้าแก้ไขได้อยู่แล้ว ไม่ต้องใส่ · คนอื่นดูทะเบียนได้อย่างเดียว ·
        ใช้ร่วมกันทั้งใบยืม-คืน (FM-PUR-006) และบันทึกโอนย้าย (FM-PUR-008) · มีผลเมื่อกดบันทึก</div>
    </div>`;
  box.querySelectorAll('[data-eqm-del]').forEach((b) => { b.onclick = () => { picked.splice(+b.dataset.eqmDel, 1); paint(); }; });
  const inp = $('#eqm-add');
  const add = () => {
    const t = inp.value.trim();
    const p = people.find((x) => low(x.Title) === low(t) || low(x.Email) === low(t));
    if (!p || !p.Email) return false;
    if (!picked.some((x) => low(x) === low(p.Email))) picked.push(String(p.Email).trim());
    paint(); $('#eqm-add')?.focus();
    return true;
  };
  inp.oninput = () => { if (people.some((x) => low(x.Title) === low(inp.value))) add(); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!add() && inp.value.trim()) inp.setCustomValidity('ไม่พบในทะเบียนบุคลากร'); } };
}

/** แสดงส่วนนี้เมื่อรหัสฟอร์มเป็นใบยืม-คืน / ใบโอนย้าย */
export async function bindEqManagers(formCode = '') {
  const box = $('#eqm-box');
  if (!box) return;
  const codeEl = $('#f_FormCode'); const isoEl = $('#f_ISODocNo');
  const sync = () => {
    const on = !!eqFormKind({ FormCode: (codeEl && codeEl.value) || formCode, ISODocNo: isoEl && isoEl.value });
    box.hidden = !on;
  };
  [codeEl, isoEl].forEach((el) => el && el.addEventListener('input', sync));
  sync();
  const { settings } = await import('../utils/settings.js');
  const [dir, cfg] = await Promise.all([list('directory').catch(() => []), settings()]);
  people = dir.filter((p) => p.IsActive !== false && p.Title)
    .sort((a, b) => String(a.Title).localeCompare(String(b.Title), 'th'));
  saved = String(cfg[EQ_MANAGERS_SETTING] || '').split(/[\s,;]+/).filter(Boolean).join(', ');
  picked = saved ? saved.split(', ') : [];
  paint();
}

/** บันทึกเมื่อแก้ (เรียกหลังบันทึกแบบฟอร์ม) · คืนข้อความแจ้งผล */
export async function saveEqManagers() {
  const box = $('#eqm-box');
  if (!box || box.hidden || value() === saved) return [];
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === EQ_MANAGERS_SETTING);
    if (row) await update('settings', row.id, { Value: value() });
    else {
      await create('settings', { Title: EQ_MANAGERS_SETTING, Value: value(),
        Description: 'ผู้รับผิดชอบทะเบียนเครื่องมือ (เพิ่ม/แก้ไข/ลบได้) — ตั้งที่หน้าต่างแก้ไขแบบฟอร์ม FM-PUR-006 / FM-PUR-008' });
    }
    const { clearSettings } = await import('../utils/settings.js'); clearSettings();
    saved = value();
    return [];
  } catch (e) {
    return [`บันทึกผู้รับผิดชอบทะเบียนเครื่องมือไม่สำเร็จ — ${e.message}`];
  }
}
