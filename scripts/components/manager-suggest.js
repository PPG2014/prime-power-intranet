/**
 * แนะนำ "ผู้บังคับบัญชา (หัวหน้าโดยตรง)" ในหน้าต่างเพิ่ม/แก้ไขบุคลากร
 *
 *   ติ๊กโครงการไว้ → ผู้รับผิดชอบหลักของโครงการแรกที่ติ๊ก (ตามหน้าโครงการ)
 *   ไม่มีโครงการ  → คนที่อยู่ระดับสูงกว่าใกล้ที่สุดในฝ่ายเดียวกัน (แผนกเดียวกันก่อน)
 *                  ไม่มีในฝ่าย → ผู้อำนวยการที่ดูแลฝ่ายนี้ → กรรมการผู้จัดการ
 *
 * เติมให้เฉพาะตอนช่องว่าง หรือยังเป็นค่าที่ระบบเติมไว้เอง — ถ้าผู้ใช้พิมพ์เลือกเอง จะไม่ทับ
 * แค่ขึ้นปุ่ม "ใช้คนนี้" ให้กดเองได้
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { levelOf, SECRETARY_TIER } from '../pages/directory.page.js';

const plain = (v) => String((v && typeof v === 'object') ? (v.LookupValue ?? v.Title ?? '') : (v ?? '')).trim();
const arr = (v) => (Array.isArray(v) ? v.map(plain) : String(v || '').split(/[,\n]/).map((x) => x.trim())).filter(Boolean);

let staff = [];
let projects = [];
let autoValue = '';          // ค่าที่ระบบเติมล่าสุด ใช้แยกว่าช่องนี้ผู้ใช้แก้เองหรือยัง

/** ระดับที่เลือกในฟอร์มตอนนี้ (1 = ผู้บริหาร … 8 = บุคลากรในแผนก) */
const formPosition = () => {
  const v = ($('#f_Position') || {}).value || '';
  return v === '__custom' ? (($('#f_Position_custom') || {}).value || '') : v;
};
const formLevel = () => levelOf({ Level: ($('#f_Level') || {}).value || '', Position: formPosition() });

function suggest() {
  const self = plain(($('#f_Title') || {}).value);
  const others = staff.filter((p) => p.IsActive !== false && plain(p.Title) && plain(p.Title) !== self);

  // 1) โครงการ
  const proj = $$('#f_Project input:checked').map((c) => c.value);
  for (const name of proj) {
    const pj = projects.find((x) => plain(x.Title) === name || plain(x.ProjectCode) === name);
    const owner = pj && plain(pj.Owner);
    if (owner && owner !== self) return { name: owner, why: `ผู้รับผิดชอบหลักโครงการ ${name}` };
  }

  // 2) ฝ่าย + ระดับ
  const dept = plain(($('#f_Department') || {}).value);
  if (!dept) return null;
  const sec = plain(($('#f_Section') || {}).value);
  const lv = formLevel();
  const inDept = (p) => plain(p.Department) === dept || arr(p.Oversees).includes(dept);
  // เลขานุการอยู่ชั้นสูงในผัง แต่ไม่ใช่หัวหน้าของใคร จึงไม่นับเป็นผู้บังคับบัญชา
  const above = others.filter((p) => inDept(p) && levelOf(p) < lv && levelOf(p) !== SECRETARY_TIER);
  if (above.length) {
    // ใกล้ที่สุดก่อน (ระดับสูงกว่าเพียงขั้นเดียวดีที่สุด) · ระดับเท่ากันเลือกคนแผนกเดียวกัน
    above.sort((a, b) => (levelOf(b) - levelOf(a))
      || ((sec && plain(b.Section) === sec) - (sec && plain(a.Section) === sec)));
    const best = above[0];
    return { name: plain(best.Title), why: `${plain(best.Position) || 'ระดับสูงกว่า'} · ${dept}` };
  }
  // 3) หัวฝ่ายเอง → ผู้บริหารที่ดูแลฝ่ายนี้ หรือกรรมการผู้จัดการ
  const exec = others.find((p) => arr(p.Oversees).includes(dept) && levelOf(p) <= lv && levelOf(p) !== SECRETARY_TIER)
    || others.find((p) => plain(p.Position) === 'กรรมการผู้จัดการ');
  return exec ? { name: plain(exec.Title), why: plain(exec.Position) || 'ผู้บริหาร' } : null;
}

function apply() {
  const input = $('#f_Manager');
  const hint = $('#mgr-hint');
  if (!input || !hint) return;
  const s = suggest();
  const cur = input.value.trim();
  if (!s) { hint.innerHTML = ''; return; }

  if (!cur || cur === autoValue) {
    input.value = s.name;
    autoValue = s.name;
    hint.innerHTML = `💡 ระบบเลือกให้: <b>${esc(s.name)}</b> <span class="dim">(${esc(s.why)})</span> · แก้เองได้`;
    return;
  }
  hint.innerHTML = cur === s.name
    ? `✓ ตรงกับที่ระบบแนะนำ <span class="dim">(${esc(s.why)})</span>`
    : `💡 ระบบแนะนำ: <b>${esc(s.name)}</b> <span class="dim">(${esc(s.why)})</span>
       <button type="button" class="btn-mini" id="mgr-use">ใช้คนนี้</button>`;
  const use = $('#mgr-use');
  if (use) use.onclick = () => { input.value = s.name; autoValue = s.name; apply(); };
}

/** เรียกหลังเปิดหน้าต่างบุคลากร */
export async function bindManagerSuggest() {
  const field = $('[data-field="Manager"]');
  if (!field) return;
  if (!$('#mgr-hint')) field.insertAdjacentHTML('beforeend', '<div class="mgr-hint" id="mgr-hint"></div>');
  [staff, projects] = await Promise.all([
    list('directory').catch(() => []), list('projects').catch(() => []),
  ]);
  autoValue = '';
  const later = () => setTimeout(apply, 0);    // ให้ช่องที่ขึ้นกับฝ่าย (แผนก/โครงการ) วาดใหม่เสร็จก่อน
  ['#f_Department', '#f_Section', '#f_Level', '#f_Title', '#f_Position', '#f_Position_custom'].forEach((s) => {
    const el = $(s);
    if (el) el.addEventListener('change', later);
  });
  // รายการโครงการถูกวาดใหม่เมื่อเปลี่ยนฝ่าย จึงดักที่กรอบนอก
  const pj = $('[data-field="Project"]');
  if (pj) pj.addEventListener('change', later);
  const input = $('#f_Manager');
  if (input) input.addEventListener('change', later);
  apply();
}
