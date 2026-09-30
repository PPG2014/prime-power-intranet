/**
 * เส้นทางอนุมัติในหน้าต่าง "เพิ่ม/แก้ไขแบบฟอร์ม" (จัดการข้อมูล → แบบฟอร์ม)
 *
 * เลือกจำนวนขั้น 0–5 แต่ละขั้นเลือกประเภทผู้อนุมัติ · ถ้า "ระบุชื่อเจาะจง" พิมพ์ค้นหาแล้วเลือกได้หลายคน
 * และเลือกเงื่อนไขการผ่าน (ครบทุกคน / คนใดคนหนึ่ง)
 * บันทึกแล้วเขียนลง List ApprovalMatrix ให้เอง (1 ขั้น = 1 แถว) — ไม่ต้องไปตั้งแยกที่เมนูเส้นทางอนุมัติ
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, create, update, remove } from '../services/data.js';
import { EXEC_TYPES } from '../services/requests.js';

export const MAX_STEPS = 5;
const NAMED = 'ระบุชื่อเจาะจง';
const PROJECT = 'ผู้รับผิดชอบหลักของโครงการ';
const BASE_TYPES = [NAMED, 'ผู้บังคับบัญชาของผู้ยื่น', 'ผู้จัดการฝ่ายของผู้ยื่น', PROJECT];
/** ขั้นที่ 1 ใช้ได้แค่ 4 แบบ · ขั้น 2 ขึ้นไปเลือกผู้บริหารตามตำแหน่งได้ด้วย */
const typesFor = (n) => (n === 1 ? BASE_TYPES : [...BASE_TYPES, ...EXEC_TYPES]);
const TYPE_LABEL = { [PROJECT]: 'ผู้รับผิดชอบหลักโครงการ (อ้างอิงหน้าโครงการ)' };
const MODES = ['คนใดคนหนึ่งอนุมัติก็ผ่าน', 'ต้องอนุมัติครบทุกคน'];

const plain = (v) => String((v && typeof v === 'object') ? (v.LookupValue ?? v.Value ?? v.Title ?? '') : (v ?? '')).trim();
const codeOfRow = (s) => {
  if (s.FormCode !== undefined) return plain(s.FormCode);
  const k = Object.keys(s).find((x) => /^FormCode\d*$/i.test(x));
  return k ? plain(s[k]) : '';
};
const isOff = (v) => v === false || /^(no|false|0|ไม่)$/i.test(String(v ?? '').trim());
const names = (v) => (Array.isArray(v) ? v.map(plain) : String(v || '').split(',').map((x) => x.trim())).filter(Boolean);

let staff = [];
let existing = [];      // แถว ApprovalMatrix เดิมของฟอร์มนี้ (ทั้งเปิดและปิดใช้งาน)
let steps = [];         // ค่าที่กำลังแก้ [{ StepName, ApproverType, Approvers[], ApproveMode }]

export const routeHost = () => '<div class="ar-box" id="ar-box"></div>';

function stepHtml(s, i) {
  const n = i + 1;
  const types = typesFor(n);
  const list_ = types.includes(s.ApproverType) || !s.ApproverType ? types : [...types, s.ApproverType];
  return `
  <div class="ar-step" data-step="${i}">
    <div class="ar-no">${n}</div>
    <div class="ar-body">
      <div class="ar-row">
        <label>ผู้อนุมัติอันดับที่ ${n}
          <select data-k="ApproverType">${list_.map((t) => `<option value="${esc(t)}" ${t === s.ApproverType ? 'selected' : ''}>${
            esc(TYPE_LABEL[t] || t)}</option>`).join('')}</select></label>
        <label title="ชื่อที่แสดงในคำขอ เช่น รอ: ผู้บังคับบัญชา · เว้นว่างใช้ชื่อตามประเภท">ชื่อขั้น
          <input data-k="StepName" value="${esc(s.StepName || '')}" placeholder="${esc(TYPE_LABEL[s.ApproverType] || s.ApproverType || '')}"></label>
        <label>เงื่อนไขการผ่าน
          <select data-k="ApproveMode">${MODES.map((m) => `<option ${m === s.ApproveMode ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      </div>
      ${s.ApproverType === NAMED ? `
        <div class="ar-people">
          <div class="ar-chips">${s.Approvers.map((p) => `<span class="ar-chip">${esc(p)}
            <button type="button" data-rm="${esc(p)}" aria-label="เอา ${esc(p)} ออก">×</button></span>`).join('')
            || '<span class="dim">ยังไม่ได้เลือกผู้อนุมัติ</span>'}</div>
          <input class="ar-q" list="ar-staff" placeholder="พิมพ์ชื่อเพื่อค้นหา แล้วเลือก (เลือกได้หลายคน)" autocomplete="off">
        </div>` : `<div class="ar-auto dim">${esc(hintFor(s.ApproverType))}</div>`}
    </div>
  </div>`;
}

function hintFor(type) {
  if (type === 'ผู้บังคับบัญชาของผู้ยื่น') return 'ระบบใช้ผู้บังคับบัญชาของคนที่ยื่นคำขอ (ช่อง Manager ในทะเบียนบุคลากร)';
  if (type === 'ผู้จัดการฝ่ายของผู้ยื่น') return 'ระบบใช้ผู้จัดการฝ่ายของฝ่ายที่ผู้ยื่นสังกัด';
  if (type === PROJECT) return 'ระบบใช้ผู้รับผิดชอบหลักของโครงการที่เลือกในคำขอ (ตามหน้าโครงการ)';
  if (EXEC_TYPES.includes(type)) {
    const who = staff.filter((p) => p.IsActive !== false && plain(p.Position) === type).map((p) => plain(p.Title));
    return who.length ? `ปัจจุบันคือ ${who.join(', ')} (ดูจากตำแหน่งในทะเบียนบุคลากร)`
      : `⚠ ยังไม่พบใครมีตำแหน่ง "${type}" ในทะเบียนบุคลากร`;
  }
  return '';
}

function paint() {
  const box = $('#ar-box');
  if (!box) return;
  box.innerHTML = `
    <datalist id="ar-staff">${staff.filter((p) => p.IsActive !== false && plain(p.Title)).map((p) =>
      `<option value="${esc(plain(p.Title))}">${esc([plain(p.Position), plain(p.Department)].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
    <div class="ar-head">✔️ เส้นทางอนุมัติของแบบฟอร์มนี้
      <label class="ar-count">จำนวนขั้นอนุมัติ
        <select id="ar-count">${Array.from({ length: MAX_STEPS + 1 }, (_, k) =>
          `<option value="${k}" ${k === steps.length ? 'selected' : ''}>${k ? `${k} ขั้น` : 'ไม่ต้องอนุมัติ'}</option>`).join('')}</select></label>
    </div>
    ${steps.length ? steps.map(stepHtml).join('') : '<div class="ar-none">ฟอร์มนี้ส่งแล้วไม่ต้องผ่านผู้อนุมัติ</div>'}
    <div class="field-error" id="ar-err" hidden></div>`;
  bind();
}

function read() {
  $$('#ar-box .ar-step').forEach((el) => {
    const s = steps[+el.dataset.step];
    $$('[data-k]', el).forEach((c) => { s[c.dataset.k] = c.value.trim(); });
  });
}

function bind() {
  $('#ar-count').onchange = (e) => {
    read();
    const n = +e.target.value;
    while (steps.length < n) steps.push({ StepName: '', ApproverType: NAMED, Approvers: [], ApproveMode: MODES[0] });
    steps.length = n;
    paint();
  };
  $$('#ar-box .ar-step').forEach((el) => {
    const i = +el.dataset.step;
    // เปลี่ยนประเภท → ล้างชื่อขั้นเดิม ให้ใช้ชื่อตามประเภทใหม่ (แก้เองได้อีกทีในช่องชื่อขั้น)
    el.querySelector('[data-k="ApproverType"]').onchange = () => { read(); steps[i].StepName = ''; paint(); };
    const q = el.querySelector('.ar-q');
    if (q) {
      const add = () => {
        const v = q.value.trim();
        const hit = staff.find((p) => plain(p.Title) === v);
        if (!hit) return;
        read();
        if (!steps[i].Approvers.includes(v)) steps[i].Approvers.push(v);
        paint();
        const again = $(`#ar-box .ar-step[data-step="${i}"] .ar-q`);
        if (again) again.focus();
      };
      q.onchange = add;
      q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    }
    $$('[data-rm]', el).forEach((b) => {
      b.onclick = () => { read(); steps[i].Approvers = steps[i].Approvers.filter((x) => x !== b.dataset.rm); paint(); };
    });
  });
}

/** โหลดเส้นทางเดิมของฟอร์ม แล้ววาดลงกล่อง (เรียกหลังเปิดหน้าต่าง) */
export async function bindRouteEditor(formCode) {
  const [dir, matrix] = await Promise.all([
    list('directory').catch(() => []), list('approvalMatrix').catch(() => []),
  ]);
  staff = dir;
  const code = plain(formCode);
  existing = code ? matrix.filter((s) => codeOfRow(s) === code)
    .sort((a, b) => (+a.StepOrder || 0) - (+b.StepOrder || 0)) : [];
  steps = existing.filter((s) => !isOff(s.IsActive)).slice(0, MAX_STEPS).map((s) => ({
    StepName: plain(s.StepName),
    ApproverType: plain(s.ApproverType) || NAMED,
    Approvers: names(s.Approvers),
    ApproveMode: MODES.includes(plain(s.ApproveMode)) ? plain(s.ApproveMode) : MODES[0],
  }));
  paint();
}

/** ตรวจก่อนบันทึก คืนข้อความผิดพลาด (ว่าง = ผ่าน) */
export function routeProblems() {
  if (!$('#ar-box')) return '';
  read();
  const bad = steps.map((s, i) => (s.ApproverType === NAMED && !s.Approvers.length ? i + 1 : 0)).filter(Boolean);
  const msg = bad.length ? `ขั้นที่ ${bad.join(', ')} เลือก "ระบุชื่อเจาะจง" แต่ยังไม่ได้เลือกผู้อนุมัติ` : '';
  const err = $('#ar-err');
  if (err) { err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  return msg;
}

/**
 * เขียนเส้นทางลง ApprovalMatrix: แถวเดิมใช้ซ้ำตามลำดับ ขาดเพิ่ม เกินลบ
 * คืนรายการคำเตือน (เช่น SharePoint ไม่รับค่าประเภทใหม่ในคอลัมน์ Choice)
 */
export async function saveRoute(formCode) {
  if (!$('#ar-box')) return [];
  read();
  const code = plain(formCode);
  const notes = [];
  const rows = steps.map((s, i) => ({
    Title: `${code} · ลำดับ ${i + 1}`,
    FormCode: code,
    StepOrder: i + 1,
    StepName: s.StepName || TYPE_LABEL[s.ApproverType] || s.ApproverType,
    ApproverType: s.ApproverType,
    ...(s.ApproverType === NAMED ? { Approvers: s.Approvers } : {}),
    ApproveMode: s.ApproveMode,
    SortOrder: i + 1,
    IsActive: true,
  }));
  const keep = (res) => {
    const skipped = [...((res && res.skipped) || []), ...((res && res.dropped) || [])];
    if (skipped.length) notes.push(...skipped);
  };
  for (let i = 0; i < rows.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    keep(existing[i] ? await update('approvalMatrix', existing[i].id, rows[i]) : await create('approvalMatrix', rows[i]));
  }
  for (const old of existing.slice(rows.length)) {
    // eslint-disable-next-line no-await-in-loop
    await remove('approvalMatrix', old.id);
  }
  return [...new Set(notes)];
}
