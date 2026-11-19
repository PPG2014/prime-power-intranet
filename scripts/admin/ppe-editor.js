/**
 * หน้าจัดการรายการโครงการ/งานของบริษัทในเครือ (ตัวเลือกพิเศษในช่องโครงการของทุกแบบฟอร์ม)
 *   - 🏠 โครงการ PPE · Prime Power Engineering Pro  (ตั้งค่าระบบ PPEProjects)
 *   - 🏗️ งาน PPC · Prime Power Construction         (ตั้งค่าระบบ PPCJobs — งานที่ไม่ใช่โครงการหลักในทะเบียนโครงการ)
 * - ผู้อนุมัติของบริษัท: เลือกชื่อเจาะจงได้หลายคน (ใช้กับทุกรายการที่ไม่ได้ตั้งผู้อนุมัติเอง)
 * - รายการ: เพิ่ม/เปลี่ยนชื่อ/ซ่อน/ลบ/เลื่อนลำดับ · ตั้งผู้อนุมัติเฉพาะรายการได้ (ไม่บังคับ)
 * ไม่ต้องสร้าง List ใหม่ใน SharePoint
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { clearCaches } from '../utils/dept.js';
import { PPE_PROJECT, PPE_SETTING, ppeConfig, formatPpe } from '../services/ppe.js';
import { PPC_PROJECT, PPC_SETTING, PPC_GROUPS, PPC_GROUP_LABEL, ppcConfig, ppcGroupOf } from '../services/ppc.js';

const clone = (c) => ({ approvers: [...c.approvers], projects: c.projects.map((p) => ({ ...p, approvers: [...p.approvers] })) });
const tidy = (c) => ({
  approvers: c.approvers,
  projects: c.projects.map((p) => ({ ...p, name: String(p.name || '').replace(/\s+/g, ' ').trim() })).filter((p) => p.name),
});

/**
 * o = { key, project, setting, load, head, intro, unit, placeholder, emptyText, noApprover, description }
 * คืน { html, bind, unsaved }
 */
function makeEditor(o) {
  let draft = { approvers: [], projects: [] };
  let saved = '';
  let people = [];     // ชื่อในทะเบียนบุคลากร (ใช้เลือกผู้อนุมัติ)
  const boxId = `${o.key}-editor`;
  const dlId = `${o.key}-people`;
  const dirty = () => formatPpe(tidy(draft)) !== saved;

  async function html() {
    const [cfg, dir] = await Promise.all([o.load({ fresh: true }), list('directory').catch(() => [])]);
    people = dir.filter((p) => p.IsActive !== false && p.Title).map((p) => String(p.Title).trim()).sort((a, b) => a.localeCompare(b, 'th'));
    draft = clone(cfg);
    saved = formatPpe(tidy(draft));
    return `<div class="panel-head">${o.head}</div>
    <div class="om-intro">${o.intro}</div>
    <datalist id="${dlId}">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="${boxId}" class="ppe-editor"></div>`;
  }

  /** กล่องเลือกชื่อหลายคน: ป้ายชื่อ ✕ + ช่องพิมพ์ค้นหา (เลือกจากทะเบียนบุคลากร) */
  const picker = (who, key, hint) => `<div class="ppe-pick" data-who="${key}">
    ${who.map((n, i) => `<span class="ppe-chip">${esc(n)}<button type="button" data-ppe="unpick" data-k="${key}" data-i="${i}" title="เอาออก">✕</button></span>`).join('')}
    <input class="ppe-add" data-k="${key}" list="${dlId}" placeholder="${esc(hint)}" autocomplete="off">
  </div>`;

  function paint() {
    const box = $(`#${boxId}`);
    if (!box) return;
    const shown = draft.projects.filter((p) => p.on).length;
    const rowHtml = (p, i, first, last) => `<li class="${p.on ? '' : 'off'}">
          <div class="ppe-row">
            <input class="om-iname" data-i="${i}" value="${esc(p.name)}" placeholder="${esc(o.placeholder)}" maxlength="150">
            ${p.on ? '' : '<span class="om-offtag">ซ่อนอยู่</span>'}
            ${o.groups ? `<select class="ppe-grp" data-i="${i}" title="ย้ายไปประเภทอื่น">${o.groups.map((g) =>
              `<option value="${esc(g)}" ${g === o.groupOf(p) ? 'selected' : ''}>${esc(o.groupLabel[g] || g)}</option>`).join('')}</select>` : ''}
            <button class="btn-move" data-ppe="up" data-i="${i}" title="เลื่อนขึ้น" ${first ? 'disabled' : ''}>↑</button>
            <button class="btn-move" data-ppe="down" data-i="${i}" title="เลื่อนลง" ${last ? 'disabled' : ''}>↓</button>
            <button class="btn-mini" data-ppe="toggle" data-i="${i}" title="${p.on ? 'ซ่อนจากแบบฟอร์ม' : 'แสดงในแบบฟอร์ม'}">${p.on ? '👁 แสดง' : '🚫 ซ่อน'}</button>
            <button class="btn-mini danger" data-ppe="del" data-i="${i}" title="ลบรายการนี้">✕</button>
          </div>
          <div class="ppe-sub"><span class="dim">ผู้อนุมัติเฉพาะ${o.unit}นี้ (ว่าง = ${o.noApproverOk && !draft.approvers.length ? 'ผู้บังคับบัญชาของผู้ยื่น' : 'ใช้ของบริษัท'})</span>${picker(p.approvers, 'p' + i, 'เพิ่มชื่อผู้อนุมัติ')}</div>
        </li>`;
    const sections = o.groups
      ? o.groups.map((g, k) => {
        const rows = draft.projects.map((p, i) => [p, i]).filter(([p]) => o.groupOf(p) === g);
        return `<section class="om-group">
      <div class="om-ghead"><b class="om-glabel">${k + 1}. ${esc(o.groupLabel[g] || g)}</b><span class="dim">${rows.length} ${o.unit}</span></div>
      ${o.groupNote && o.groupNote[g] ? `<div class="dim ppe-gnote">${o.groupNote[g]}</div>` : ''}
      <ol class="om-items ppe-items">
        ${rows.map(([p, i], j) => rowHtml(p, i, j === 0, j === rows.length - 1)).join('') || `<div class="empty">${o.emptyText}</div>`}
      </ol>
      <button class="btn-mini om-add" data-ppe="add" data-g="${esc(g)}">＋ เพิ่ม${o.unit}</button>
    </section>`;
      }).join('')
      : `<section class="om-group">
      <div class="om-ghead"><b class="om-glabel">${o.unitTitle}</b><span class="dim">${draft.projects.length} ${o.unit}</span></div>
      <ol class="om-items ppe-items">
        ${draft.projects.map((p, i) => rowHtml(p, i, i === 0, i === draft.projects.length - 1)).join('') || `<div class="empty">${o.emptyText}</div>`}
      </ol>
      <button class="btn-mini om-add" data-ppe="add">＋ เพิ่ม${o.unit}</button>
    </section>`;
    box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${draft.projects.length} ${o.unit} · แสดงในแบบฟอร์ม ${shown} · ผู้อนุมัติของบริษัท ${draft.approvers.length} คน</span>
      <button class="btn-mini" data-ppe="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-ppe="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">${o.coTitle || 'ผู้อนุมัติของบริษัท (เลือกได้หลายคน)'}</b></div>
      ${picker(draft.approvers, 'co', 'พิมพ์ชื่อเพื่อค้นหา แล้วเลือก')}
      ${draft.approvers.length ? '' : `<div class="${o.noApproverOk ? 'ppe-default' : 'om-unsaved'}">${o.noApprover}</div>`}
    </section>
    ${sections}
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${o.setting}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
  }

  const whoOf = (k) => (k === 'co' ? draft.approvers : draft.projects[+k.slice(1)].approvers);
  /** เลื่อนขึ้น/ลง (แยกประเภท: สลับกับรายการก่อน/หลังในประเภทเดียวกัน) */
  const swap = (arr, i, d) => {
    let j = i + d;
    if (o.groups) while (j >= 0 && j < arr.length && o.groupOf(arr[j]) !== o.groupOf(arr[i])) j += d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  async function save(btn) {
    const cfg = tidy(draft);
    const seen = new Set();
    const dup = cfg.projects.find((p) => { const k = p.name.toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
    if (dup) { toast(`ชื่อซ้ำกัน: ${dup.name}`, 'bad'); return; }
    const value = formatPpe(cfg);
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const rows = await list('settings', { fresh: true });
      const row = rows.find((r) => String(r.Title || '').trim() === o.setting);
      if (row) await update('settings', row.id, { Value: value });
      else await create('settings', { Title: o.setting, Value: value, Description: o.description });
      clearCaches();
      const { clearSettings } = await import('../utils/settings.js'); clearSettings();
      draft = clone(cfg); saved = value;
      toast(`✓ บันทึก${o.label}แล้ว — แบบฟอร์มและคำขอใหม่ใช้ข้อมูลนี้ทันที`);
    } catch (e) {
      toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
    }
    paint();
  }

  function bind() {
    const box = $(`#${boxId}`);
    if (!box) return;
    paint();
    const refreshSave = () => {
      const d = dirty();
      box.querySelectorAll('[data-ppe="save"], [data-ppe="reset"]').forEach((b) => { b.disabled = !d; });
    };
    // พิมพ์ชื่อ: แก้ในร่างโดยไม่วาดใหม่ (เคอร์เซอร์ไม่หลุด)
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
    // ย้ายรายการไปประเภทอื่น
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.classList.contains('ppe-grp')) return;
      draft.projects[+t.dataset.i].group = t.value;
      paint();
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
        draft.projects.push({ name: '', on: true, approvers: [], ...(o.groups ? { group: b.dataset.g || o.groups[o.groups.length - 1] } : {}) });
        paint();
        box.querySelector(`.om-iname[data-i="${draft.projects.length - 1}"]`)?.focus();
        return;
      } else if (a === 'up' || a === 'down') swap(draft.projects, i, a === 'up' ? -1 : 1);
      else if (a === 'toggle') draft.projects[i].on = !draft.projects[i].on;
      else if (a === 'del') {
        const n = draft.projects[i].name.trim();
        if (n && !confirm(`ลบ “${n}” ออกจากรายการ?\n\nคำขอเก่าที่เลือก${o.unit}นี้ยังแสดงชื่อเดิม · ถ้าแค่เลิกใช้ กด “ซ่อน” แทนได้`)) return;
        draft.projects.splice(i, 1);
      } else if (a === 'reset') {
        if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
        o.load({ fresh: true }).then((c) => { draft = clone(c); paint(); });
        return;
      }
      paint();
    });
  }

  /** ออกจากหน้านี้ทั้งที่ยังไม่บันทึก → เตือนก่อน */
  const unsaved = () => !!$(`#${boxId}`) && dirty();
  return { html, bind, unsaved };
}

const PPE = makeEditor({
  key: 'ppe', setting: PPE_SETTING, load: ppeConfig, label: 'โครงการ PPE',
  head: `🏠 โครงการ PPE · ${esc(PPE_PROJECT)}`,
  intro: `ในช่อง <b>โครงการ</b> ของทุกแบบฟอร์ม ผู้ยื่นเลือก <b>“${esc(PPE_PROJECT)}”</b> แล้วพิมพ์ค้นหาโครงการจากรายการนี้
      หรือพิมพ์ชื่อโครงการใหม่ได้ (ระบบเพิ่มเข้ารายการให้เมื่อส่งคำขอ)
      <ul>
        <li><b>ผู้อนุมัติของบริษัท</b> — เลือกชื่อเจาะจงได้หลายคน ใช้กับลำดับ “ผู้รับผิดชอบหลักของโครงการ / ผู้จัดการโครงการ” ในเส้นทางอนุมัติ (คนใดคนหนึ่งตามที่ตั้งในลำดับนั้น)</li>
        <li>โครงการไหนต้องการผู้อนุมัติต่างจากบริษัท ตั้งในแถวของโครงการนั้นได้ (ว่าง = ใช้ของบริษัท)</li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> ครั้งเดียว — มีผลกับแบบฟอร์มและคำขอใหม่ทันที</li>
      </ul>`,
  unit: 'โครงการ', unitTitle: 'โครงการ', placeholder: 'ชื่อโครงการ เช่น บ้านคุณ… 23.94 kWp',
  emptyText: 'ยังไม่มีโครงการ — ผู้ยื่นยังพิมพ์ชื่อโครงการเองได้',
  noApprover: 'ยังไม่ได้ตั้งผู้อนุมัติ — คำขอโครงการ PPE จะใช้ผู้บังคับบัญชาของผู้ยื่นแทน',
  description: 'โครงการ Prime Power Engineering Pro + ผู้อนุมัติ — แก้ที่ จัดการข้อมูล → 🏠 โครงการ PPE',
});
export const ppeEditorHtml = PPE.html;
export const bindPpeEditor = PPE.bind;
export const ppeHasUnsaved = PPE.unsaved;

const PPC = makeEditor({
  key: 'ppc', setting: PPC_SETTING, load: ppcConfig, label: 'งาน PPC',
  head: `🏗️ งาน PPC · ${esc(PPC_PROJECT)}`,
  groups: PPC_GROUPS, groupLabel: PPC_GROUP_LABEL, groupOf: ppcGroupOf,
  groupNote: { [PPC_GROUPS[1]]: 'ผู้ยื่นเลือก “อื่นๆ (ระบุ)” แล้วค้นหาได้ทั้งรายการนี้และโครงการหลักในทะเบียนโครงการ' },
  intro: `ในช่อง <b>โครงการ</b> ของทุกแบบฟอร์ม ผู้ยื่นเลือก <b>“${esc(PPC_PROJECT)}”</b> → เลือกประเภท
      <b>1. ${esc(PPC_GROUP_LABEL[PPC_GROUPS[0]])}</b> หรือ <b>2. ${esc(PPC_GROUP_LABEL[PPC_GROUPS[1]])}</b>
      → แล้วเลือกโครงการที่มีอยู่แล้ว หรือพิมพ์ชื่อใหม่ (ระบบเพิ่มเข้ารายการของประเภทนั้นให้เมื่อส่งคำขอ)
      <ul>
        <li>ประเภท อื่นๆ ค้นหา<b>โครงการหลัก</b>ได้ด้วย → เลือกแล้วคำขอใช้โครงการนั้นตามปกติ (ผู้รับผิดชอบ/ทีมโครงการอนุมัติ) · แก้โครงการหลักที่ <b>ทะเบียนโครงการ</b></li>
        <li><b>ผู้อนุมัติขั้นต้น</b> ตั้งต้นเป็น <b>ผู้บังคับบัญชาของผู้ยื่น</b> (ลำดับ “ผู้บังคับบัญชา / ผู้รับผิดชอบหลักของโครงการ / ผู้จัดการโครงการ” ในเส้นทางอนุมัติ)</li>
        <li>โครงการไหนต้องการผู้อนุมัติเฉพาะ ใส่ชื่อในแถวของโครงการนั้นได้ (ว่าง = ใช้ค่าตั้งต้น)</li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> ครั้งเดียว — มีผลกับแบบฟอร์มและคำขอใหม่ทันที</li>
      </ul>`,
  unit: 'โครงการ', unitTitle: 'โครงการ', placeholder: 'ชื่อโครงการ / งาน',
  emptyText: 'ยังไม่มีรายการ — ผู้ยื่นพิมพ์ชื่อเองได้ ระบบจะเพิ่มเข้ารายการนี้ให้',
  coTitle: 'ผู้อนุมัติขั้นต้น (ค่าตั้งต้น = ผู้บังคับบัญชาของผู้ยื่น)', noApproverOk: true,
  noApprover: '✓ ค่าตั้งต้น: <b>ผู้บังคับบัญชาของผู้ยื่น</b> เป็นผู้อนุมัติขั้นต้น — ใส่ชื่อที่นี่เฉพาะเมื่อต้องการให้คนอื่นอนุมัติแทนทุกโครงการ',
  description: 'งานของ Prime Power Construction ที่ไม่ใช่โครงการหลัก + ผู้อนุมัติ — แก้ที่ จัดการข้อมูล → 🏗️ งาน PPC',
});
export const ppcEditorHtml = PPC.html;
export const bindPpcEditor = PPC.bind;
export const ppcHasUnsaved = PPC.unsaved;
