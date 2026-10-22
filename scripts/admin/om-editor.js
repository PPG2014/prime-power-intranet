/**
 * หน้าจัดการโครงการ O&M (เมนู 🔧 โครงการ O&M ในหน้าจัดการข้อมูล)
 * แก้เป็นกลุ่มลูกค้า → รายชื่อโครงการ · เพิ่ม/เปลี่ยนชื่อ/ซ่อน/ลบ/เลื่อนลำดับ แล้วกดบันทึกครั้งเดียว
 * เก็บในตั้งค่าระบบ OMSites (services/om.js) ไม่ต้องสร้าง List ใหม่ใน SharePoint
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { clearCaches } from '../utils/dept.js';
import { OM_SETTING, OM_PROJECT, omGroupsForEdit, formatOmSites, defaultOmGroups } from '../services/om.js';

let draft = [];      // [{ group, items: [{ name, on }] }]
let saved = '';      // ค่าที่บันทึกล่าสุด ไว้เทียบว่ามีการแก้ที่ยังไม่บันทึกไหม

const clone = (g) => g.map((x) => ({ group: x.group, items: x.items.map((it) => ({ ...it })) }));
const clean = (v) => String(v || '').replace(/[|\r\n]+/g, ' / ').replace(/^#+/, '').trim();
const dirty = () => formatOmSites(tidy(draft)) !== saved;
const tidy = (groups) => groups
  .map((g) => ({ group: clean(g.group), items: g.items.map((it) => ({ name: clean(it.name), on: it.on })).filter((it) => it.name) }))
  .filter((g) => g.group || g.items.length);

export async function omEditorHtml() {
  draft = clone(await omGroupsForEdit());
  saved = formatOmSites(tidy(draft));
  return `<div class="panel-head">🔧 โครงการ O&amp;M</div>
    <div class="om-intro">
      รายการนี้แสดงในช่อง <b>โครงการ</b> เมื่อผู้ยื่นเลือก <b>“${esc(OM_PROJECT)}”</b> ในแบบฟอร์มเบิกเงินและใบขอสั่งซื้อ
      — จัดเป็น <b>กลุ่มลูกค้า</b> แล้วตามด้วย <b>ชื่อโครงการ</b>
      <ul>
        <li><b>＋ เพิ่มโครงการ</b> ในกลุ่มที่ต้องการ แล้วพิมพ์ชื่อ · พิมพ์ทับเพื่อเปลี่ยนชื่อ</li>
        <li><b>👁 / 🚫</b> ซ่อนโครงการที่เลิกใช้ (คำขอเก่ายังแสดงชื่อเดิม) · <b>✕</b> ลบออกจากรายการ</li>
        <li><b>↑ ↓</b> เลื่อนลำดับโครงการหรือกลุ่ม · ย้ายกลุ่มได้ที่ช่อง <b>ย้ายไปกลุ่ม</b></li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> ครั้งเดียว — มีผลกับแบบฟอร์มทันที</li>
      </ul>
    </div>
    <div id="om-editor"></div>`;
}

function paint() {
  const box = $('#om-editor');
  if (!box) return;
  const total = draft.reduce((n, g) => n + g.items.length, 0);
  const shown = draft.reduce((n, g) => n + g.items.filter((it) => it.on).length, 0);
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${draft.length} กลุ่ม · ${total} โครงการ · แสดงในแบบฟอร์ม ${shown}</span>
      <button class="btn-mini" data-om="addgroup">＋ เพิ่มกลุ่มใหม่</button>
      <button class="btn-mini" data-om="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-om="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    ${draft.map((g, gi) => `
      <section class="om-group">
        <div class="om-ghead">
          <label class="om-glabel">กลุ่มลูกค้า
            <input class="om-gname" data-g="${gi}" value="${esc(g.group)}" placeholder="เช่น WHA Group" maxlength="80"></label>
          <span class="dim">${g.items.length} โครงการ</span>
          <span class="om-gbtns">
            <button class="btn-move" data-om="gup" data-g="${gi}" title="เลื่อนกลุ่มขึ้น" ${gi === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-move" data-om="gdown" data-g="${gi}" title="เลื่อนกลุ่มลง" ${gi === draft.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-mini danger" data-om="gdel" data-g="${gi}" title="ลบทั้งกลุ่ม">🗑 ลบกลุ่ม</button>
          </span>
        </div>
        <ol class="om-items">
          ${g.items.map((it, ii) => `<li class="${it.on ? '' : 'off'}">
            <input class="om-iname" data-g="${gi}" data-i="${ii}" value="${esc(it.name)}" placeholder="ชื่อโครงการ เช่น โครงการ ALS" maxlength="150">
            ${it.on ? '' : '<span class="om-offtag">ซ่อนอยู่</span>'}
            <select class="om-move" data-g="${gi}" data-i="${ii}" title="ย้ายไปกลุ่ม" ${draft.length > 1 ? '' : 'disabled'}>${moveOptions(gi)}</select>
            <button class="btn-move" data-om="up" data-g="${gi}" data-i="${ii}" title="เลื่อนขึ้น" ${ii === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-move" data-om="down" data-g="${gi}" data-i="${ii}" title="เลื่อนลง" ${ii === g.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-mini" data-om="toggle" data-g="${gi}" data-i="${ii}" title="${it.on ? 'ซ่อนจากแบบฟอร์ม' : 'แสดงในแบบฟอร์ม'}">${it.on ? '👁 แสดง' : '🚫 ซ่อน'}</button>
            <button class="btn-mini danger" data-om="del" data-g="${gi}" data-i="${ii}" title="ลบโครงการนี้">✕</button>
          </li>`).join('')}
        </ol>
        <button class="btn-mini om-add" data-om="add" data-g="${gi}">＋ เพิ่มโครงการในกลุ่มนี้</button>
      </section>`).join('') || '<div class="empty">ยังไม่มีกลุ่ม กด “＋ เพิ่มกลุ่มใหม่”</div>'}
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${OM_SETTING}</b> (บรรทัดละรายการ กลุ่ม|ชื่อโครงการ · ขึ้นต้น # = ซ่อน) — แก้ที่หน้านี้สะดวกกว่า
      · <button class="link-btn" data-om="defaults">ใช้รายการตั้งต้นของระบบ</button></div>`;
}

/** ตัวเลือก "ย้ายไปกลุ่ม" — ค่าเป็นลำดับกลุ่มใน draft (ชื่อล่าสุดที่พิมพ์) */
const moveOptions = (gi) => '<option value="">ย้ายไปกลุ่ม…</option>' + draft.map((g, k) => (k === gi ? ''
  : `<option value="${k}">${esc(clean(g.group) || '(กลุ่มใหม่ ยังไม่ตั้งชื่อ)')}</option>`)).join('');

/** ย้ายแถว i ไปตำแหน่ง i+d ใน arr */
const swap = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

async function save(btn) {
  const groups = tidy(draft);
  const noName = groups.filter((g) => !g.group);
  if (noName.length) { toast('มีกลุ่มที่ยังไม่ได้ตั้งชื่อ — ตั้งชื่อกลุ่มลูกค้าก่อนบันทึก', 'bad'); return; }
  const names = groups.map((g) => g.group.toLowerCase());
  const dupG = names.find((n, i) => names.indexOf(n) !== i);
  if (dupG) { toast(`ชื่อกลุ่มซ้ำกัน: ${dupG} — รวมเป็นกลุ่มเดียว หรือเปลี่ยนชื่อ`, 'bad'); return; }
  for (const g of groups) {
    const seen = new Set();
    g.items = g.items.filter((it) => { const k = it.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const value = formatOmSites(groups);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === OM_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: OM_SETTING, Value: value, Description: 'รายการโครงการ O&M — แก้ที่ จัดการข้อมูล → 🔧 โครงการ O&M' });
    clearCaches();
    draft = clone(groups); saved = value;
    toast('✓ บันทึกโครงการ O&M แล้ว — แบบฟอร์มใช้รายการใหม่ทันที');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

export function bindOmEditor() {
  const box = $('#om-editor');
  if (!box) return;
  paint();
  // พิมพ์ชื่อ: แก้ในร่างโดยไม่วาดใหม่ (เคอร์เซอร์ไม่หลุด) แค่อัปเดตปุ่มบันทึก
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('om-gname')) draft[+t.dataset.g].group = t.value;
    else if (t.classList.contains('om-iname')) draft[+t.dataset.g].items[+t.dataset.i].name = t.value;
    else return;
    const d = dirty();
    box.querySelectorAll('[data-om="save"], [data-om="reset"]').forEach((b) => { b.disabled = !d; });
    const warn = box.querySelector('.om-unsaved');
    if (d && !warn) box.querySelector('.om-bar').insertAdjacentHTML('afterend', '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>');
    if (!d && warn) warn.remove();
  });
  // เปิดรายการย้ายกลุ่ม → สร้างตัวเลือกใหม่ให้ตรงกับชื่อกลุ่มที่เพิ่งพิมพ์
  box.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('om-move')) e.target.innerHTML = moveOptions(+e.target.dataset.g);
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.classList.contains('om-move') || t.value === '') return;
    const gi = +t.dataset.g; const ii = +t.dataset.i;
    const [it] = draft[gi].items.splice(ii, 1);
    draft[+t.value].items.push(it);
    paint();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-om]');
    if (!b || b.disabled) return;
    const a = b.dataset.om; const gi = +b.dataset.g; const ii = +b.dataset.i;
    const g = draft[gi];
    if (a === 'save') { save(b); return; }
    if (a === 'add') { g.items.push({ name: '', on: true }); paint(); box.querySelector(`.om-iname[data-g="${gi}"][data-i="${g.items.length - 1}"]`)?.focus(); return; }
    if (a === 'addgroup') { draft.push({ group: '', items: [{ name: '', on: true }] }); paint(); box.querySelector(`.om-gname[data-g="${draft.length - 1}"]`)?.focus(); return; }
    if (a === 'up' || a === 'down') swap(g.items, ii, a === 'up' ? -1 : 1);
    else if (a === 'gup' || a === 'gdown') swap(draft, gi, a === 'gup' ? -1 : 1);
    else if (a === 'toggle') g.items[ii].on = !g.items[ii].on;
    else if (a === 'del') {
      const n = g.items[ii].name.trim();
      if (n && !confirm(`ลบ “${n}” ออกจากรายการ?\n\nคำขอเก่าที่เลือกโครงการนี้ยังแสดงชื่อเดิม · ถ้าแค่เลิกใช้ กด “ซ่อน” แทนได้`)) return;
      g.items.splice(ii, 1);
    } else if (a === 'gdel') {
      if (g.items.some((it) => it.name.trim()) && !confirm(`ลบกลุ่ม “${g.group || '(ไม่มีชื่อ)'}” พร้อมโครงการทั้ง ${g.items.length} รายการ?`)) return;
      draft.splice(gi, 1);
    } else if (a === 'reset') {
      if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นรายการที่บันทึกล่าสุด?')) return;
      omGroupsForEdit().then((x) => { draft = clone(x); paint(); });
      return;
    } else if (a === 'defaults') {
      if (!confirm('แทนที่รายการในหน้าจอด้วยรายการตั้งต้นของระบบ (WHA Group / Gulf Solar)?\n\nยังไม่บันทึกจนกว่าจะกด 💾 บันทึก')) return;
      draft = defaultOmGroups();
    }
    paint();
  });
}

/** ออกจากหน้านี้ทั้งที่ยังไม่บันทึก → เตือนก่อน */
export const omHasUnsaved = () => !!$('#om-editor') && dirty();
