/**
 * หน้าจัดการโครงการของ Prime Power Engineering Pro (เมนู 🏠 โครงการ PPE ในหน้าจัดการข้อมูล)
 * - ผู้อนุมัติของบริษัท: เลือกชื่อเจาะจงได้หลายคน (ใช้กับทุกโครงการ PPE ที่ไม่ได้ตั้งผู้อนุมัติเอง)
 * - รายชื่อโครงการ: เพิ่ม/เปลี่ยนชื่อ/ซ่อน/ลบ/เลื่อนลำดับ · ตั้งผู้อนุมัติเฉพาะโครงการได้ (ไม่บังคับ)
 * เก็บในตั้งค่าระบบ PPEProjects (services/ppe.js) ไม่ต้องสร้าง List ใหม่ใน SharePoint
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { clearCaches } from '../utils/dept.js';
import { PPE_PROJECT, PPE_SETTING, ppeConfig, formatPpe } from '../services/ppe.js';

let draft = { approvers: [], projects: [] };
let saved = '';
let people = [];     // ชื่อในทะเบียนบุคลากร (ใช้เลือกผู้อนุมัติ)

const clone = (c) => ({ approvers: [...c.approvers], projects: c.projects.map((p) => ({ ...p, approvers: [...p.approvers] })) });
const tidy = (c) => ({
  approvers: c.approvers,
  projects: c.projects.map((p) => ({ ...p, name: String(p.name || '').replace(/\s+/g, ' ').trim() })).filter((p) => p.name),
});
const dirty = () => formatPpe(tidy(draft)) !== saved;

export async function ppeEditorHtml() {
  const [cfg, dir] = await Promise.all([ppeConfig({ fresh: true }), list('directory').catch(() => [])]);
  people = dir.filter((p) => p.IsActive !== false && p.Title).map((p) => String(p.Title).trim()).sort((a, b) => a.localeCompare(b, 'th'));
  draft = clone(cfg);
  saved = formatPpe(tidy(draft));
  return `<div class="panel-head">🏠 โครงการ PPE · ${esc(PPE_PROJECT)}</div>
    <div class="om-intro">
      ในช่อง <b>โครงการ</b> ของทุกแบบฟอร์ม ผู้ยื่นเลือก <b>“${esc(PPE_PROJECT)}”</b> แล้วเลือกโครงการจากรายการนี้
      หรือกด <b>➕ เพิ่มชื่อโครงการเอง</b> แล้วพิมพ์ชื่อได้
      <ul>
        <li><b>ผู้อนุมัติของบริษัท</b> — เลือกชื่อเจาะจงได้หลายคน ใช้กับลำดับ “ผู้รับผิดชอบหลักของโครงการ / ผู้จัดการโครงการ” ในเส้นทางอนุมัติ (คนใดคนหนึ่งตามที่ตั้งในลำดับนั้น)</li>
        <li>โครงการไหนต้องการผู้อนุมัติต่างจากบริษัท ตั้งในแถวของโครงการนั้นได้ (ว่าง = ใช้ของบริษัท)</li>
        <li>โครงการที่ผู้ยื่นพิมพ์ชื่อเอง ใช้ผู้อนุมัติของบริษัท · ถ้าใช้บ่อย เพิ่มเข้ารายการนี้ได้</li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> ครั้งเดียว — มีผลกับแบบฟอร์มและคำขอใหม่ทันที</li>
      </ul>
    </div>
    <datalist id="ppe-people">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="ppe-editor"></div>`;
}

/** กล่องเลือกชื่อหลายคน: ป้ายชื่อ ✕ + ช่องพิมพ์ค้นหา (เลือกจากทะเบียนบุคลากร) */
const picker = (who, key, hint) => `<div class="ppe-pick" data-who="${key}">
    ${who.map((n, i) => `<span class="ppe-chip">${esc(n)}<button type="button" data-ppe="unpick" data-k="${key}" data-i="${i}" title="เอาออก">✕</button></span>`).join('')}
    <input class="ppe-add" data-k="${key}" list="ppe-people" placeholder="${esc(hint)}" autocomplete="off">
  </div>`;

function paint() {
  const box = $('#ppe-editor');
  if (!box) return;
  const shown = draft.projects.filter((p) => p.on).length;
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${draft.projects.length} โครงการ · แสดงในแบบฟอร์ม ${shown} · ผู้อนุมัติของบริษัท ${draft.approvers.length} คน</span>
      <button class="btn-mini" data-ppe="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-ppe="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">ผู้อนุมัติของบริษัท (เลือกได้หลายคน)</b></div>
      ${picker(draft.approvers, 'co', 'พิมพ์ชื่อเพื่อค้นหา แล้วเลือก')}
      ${draft.approvers.length ? '' : '<div class="om-unsaved">ยังไม่ได้ตั้งผู้อนุมัติ — คำขอโครงการ PPE จะใช้ผู้บังคับบัญชาของผู้ยื่นแทน</div>'}
    </section>
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">โครงการ</b><span class="dim">${draft.projects.length} โครงการ</span></div>
      <ol class="om-items ppe-items">
        ${draft.projects.map((p, i) => `<li class="${p.on ? '' : 'off'}">
          <div class="ppe-row">
            <input class="om-iname" data-i="${i}" value="${esc(p.name)}" placeholder="ชื่อโครงการ เช่น บ้านคุณ… 23.94 kWp" maxlength="150">
            ${p.on ? '' : '<span class="om-offtag">ซ่อนอยู่</span>'}
            <button class="btn-move" data-ppe="up" data-i="${i}" title="เลื่อนขึ้น" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-move" data-ppe="down" data-i="${i}" title="เลื่อนลง" ${i === draft.projects.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-mini" data-ppe="toggle" data-i="${i}" title="${p.on ? 'ซ่อนจากแบบฟอร์ม' : 'แสดงในแบบฟอร์ม'}">${p.on ? '👁 แสดง' : '🚫 ซ่อน'}</button>
            <button class="btn-mini danger" data-ppe="del" data-i="${i}" title="ลบโครงการนี้">✕</button>
          </div>
          <div class="ppe-sub"><span class="dim">ผู้อนุมัติเฉพาะโครงการ (ว่าง = ใช้ของบริษัท)</span>${picker(p.approvers, 'p' + i, 'เพิ่มชื่อผู้อนุมัติ')}</div>
        </li>`).join('') || '<div class="empty">ยังไม่มีโครงการ — ผู้ยื่นยังพิมพ์ชื่อโครงการเองได้</div>'}
      </ol>
      <button class="btn-mini om-add" data-ppe="add">＋ เพิ่มโครงการ</button>
    </section>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${PPE_SETTING}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
}

const whoOf = (k) => (k === 'co' ? draft.approvers : draft.projects[+k.slice(1)].approvers);
const swap = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

async function save(btn) {
  const cfg = tidy(draft);
  const seen = new Set();
  const dup = cfg.projects.find((p) => { const k = p.name.toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
  if (dup) { toast(`ชื่อโครงการซ้ำกัน: ${dup.name}`, 'bad'); return; }
  const value = formatPpe(cfg);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === PPE_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: PPE_SETTING, Value: value, Description: 'โครงการ Prime Power Engineering Pro + ผู้อนุมัติ — แก้ที่ จัดการข้อมูล → 🏠 โครงการ PPE' });
    clearCaches();
    const { clearSettings } = await import('../utils/settings.js'); clearSettings();
    draft = clone(cfg); saved = value;
    toast('✓ บันทึกโครงการ PPE แล้ว — แบบฟอร์มและคำขอใหม่ใช้ข้อมูลนี้ทันที');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

export function bindPpeEditor() {
  const box = $('#ppe-editor');
  if (!box) return;
  paint();
  const refreshSave = () => {
    const d = dirty();
    box.querySelectorAll('[data-ppe="save"], [data-ppe="reset"]').forEach((b) => { b.disabled = !d; });
  };
  // พิมพ์ชื่อโครงการ: แก้ในร่างโดยไม่วาดใหม่ (เคอร์เซอร์ไม่หลุด)
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('om-iname')) { draft.projects[+t.dataset.i].name = t.value; refreshSave(); return; }
    // เลือกชื่อจากรายการ (ตรงกับทะเบียนบุคลากรพอดี) → เพิ่มเป็นป้ายชื่อทันที
    if (t.classList.contains('ppe-add')) {
      const n = t.value.trim();
      if (!people.includes(n)) return;
      const who = whoOf(t.dataset.k);
      if (!who.includes(n)) who.push(n);
      paint();
      box.querySelector(`.ppe-add[data-k="${t.dataset.k}"]`)?.focus();
    }
  });
  box.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.classList.contains('ppe-add') || e.key !== 'Enter') return;
    e.preventDefault();
    const n = t.value.trim();
    if (!n) return;
    if (!people.includes(n)) { toast(`ไม่พบ “${n}” ในทะเบียนบุคลากร — เลือกจากรายชื่อที่ขึ้นมา`, 'bad'); return; }
    const who = whoOf(t.dataset.k);
    if (!who.includes(n)) who.push(n);
    paint();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ppe]');
    if (!b || b.disabled) return;
    const a = b.dataset.ppe; const i = +b.dataset.i;
    if (a === 'save') { save(b); return; }
    if (a === 'unpick') whoOf(b.dataset.k).splice(i, 1);
    else if (a === 'add') {
      draft.projects.push({ name: '', on: true, approvers: [] });
      paint();
      box.querySelector(`.om-iname[data-i="${draft.projects.length - 1}"]`)?.focus();
      return;
    } else if (a === 'up' || a === 'down') swap(draft.projects, i, a === 'up' ? -1 : 1);
    else if (a === 'toggle') draft.projects[i].on = !draft.projects[i].on;
    else if (a === 'del') {
      const n = draft.projects[i].name.trim();
      if (n && !confirm(`ลบ “${n}” ออกจากรายการ?\n\nคำขอเก่าที่เลือกโครงการนี้ยังแสดงชื่อเดิม · ถ้าแค่เลิกใช้ กด “ซ่อน” แทนได้`)) return;
      draft.projects.splice(i, 1);
    } else if (a === 'reset') {
      if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
      ppeConfig({ fresh: true }).then((c) => { draft = clone(c); paint(); });
      return;
    }
    paint();
  });
}

/** ออกจากหน้านี้ทั้งที่ยังไม่บันทึก → เตือนก่อน */
export const ppeHasUnsaved = () => !!$('#ppe-editor') && dirty();
