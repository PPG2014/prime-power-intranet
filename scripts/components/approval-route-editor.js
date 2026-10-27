/**
 * เส้นทางอนุมัติในหน้าต่าง "เพิ่ม/แก้ไขแบบฟอร์ม" (จัดการข้อมูล → แบบฟอร์ม)
 *
 * เลือกจำนวนขั้น 0–5 แต่ละขั้นเลือกประเภทผู้อนุมัติ · ถ้า "ระบุชื่อเจาะจง" พิมพ์ค้นหาแล้วเลือกได้หลายคน
 * และเลือกเงื่อนไขการผ่าน (ครบทุกคน / คนใดคนหนึ่ง)
 * บันทึกแล้วเขียนลง List ApprovalMatrix ให้เอง (1 ขั้น = 1 แถว) — ไม่ต้องไปตั้งแยกที่เมนูเส้นทางอนุมัติ
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, create, update, remove } from '../services/data.js';
import { EXEC_TYPES, ROUTE_SETS, ROUTE_SET_FIELD, routeSetOf } from '../services/requests.js';
import { OM_FORMS } from '../services/om.js';

export const MAX_STEPS = 8;
const NAMED = 'ระบุชื่อเจาะจง';
const PROJECT = 'ผู้รับผิดชอบหลักของโครงการ';
const DEPT_TYPES = ['ทุกคนในฝ่ายที่ระบุ', 'ผู้จัดการฝ่ายที่ระบุ'];
const BASE_TYPES = [NAMED, 'ผู้บังคับบัญชาของผู้ยื่น', 'ผู้จัดการฝ่ายของผู้ยื่น', ...DEPT_TYPES,
  PROJECT, 'ผู้จัดการโครงการ', 'ผู้อำนวยการโครงการ'];
/** ขั้นที่ 1 ไม่มีผู้บริหารตามตำแหน่ง · ขั้น 2 ขึ้นไปเลือกผู้บริหารตามตำแหน่งได้ด้วย */
const typesFor = (n) => (n === 1 ? BASE_TYPES : [...BASE_TYPES, ...EXEC_TYPES]);
/** ประเภทที่รวมเพิ่มในลำดับเดียวกันได้ (ไม่รวมระบุชื่อเจาะจง) */
const ALSO_TYPES = [...BASE_TYPES.filter((t) => t !== NAMED), ...EXEC_TYPES];
const yes = (v) => v === true || /^(yes|true|1|ใช่)$/i.test(String(v ?? '').trim());
const splitList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
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
let depts = [];
let existing = [];      // แถว ApprovalMatrix เดิมของฟอร์มนี้ (ทั้งเปิดและปิดใช้งาน)
let steps = [];         // ค่าที่กำลังแก้ [{ StepName, ApproverType, Approvers[], ApproveMode }]
let condFields = [];    // ช่องตัวเลือกของฟอร์มนี้ ใช้ตั้งเงื่อนไข "ใช้ขั้นนี้เฉพาะเมื่อ…" [{ key, title, options[] }]
/**
 * ชุดเส้นทาง: '' = ปกติ · PPE / O&M = เส้นทางแยกทั้งชุด เมื่อผู้ยื่นเลือกโครงการนั้น (0 ขั้น = ใช้เส้นทางปกติ)
 * ชุดแยกเลือกผู้อนุมัติได้ 2 แบบ: ระบุชื่อเจาะจง (หลายคน) หรือ ผู้บังคับบัญชาของผู้ยื่น
 */
let sets = { '': [] };
let formCodeNow = '';
let setKeys = [''];
let curSet = '';
const BOSS = 'ผู้บังคับบัญชาของผู้ยื่น';
const SET_TYPES = [NAMED, BOSS];

export const routeHost = () => '<div class="ar-box" id="ar-box"></div>';

function stepHtml(s, i) {
  const n = i + 1;
  const inSet = !!curSet;
  const types = inSet ? SET_TYPES : typesFor(n);
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
        </div>` : `<div class="ar-auto dim">${esc(hintFor(s.ApproverType))}</div>
        <div class="ar-people ar-extra">
          <div class="ar-extra-h">+ ชื่อบุคคลที่อนุมัติขั้นนี้ได้ด้วย <span class="dim">(ทางเลือก — นอกเหนือจากที่ระบบหาเอง)</span></div>
          <div class="ar-chips">${s.Extra.map((p) => `<span class="ar-chip">${esc(p)}
            <button type="button" data-xrm="${esc(p)}" aria-label="เอา ${esc(p)} ออก">×</button></span>`).join('')}</div>
          <input class="ar-xq" list="ar-staff" placeholder="พิมพ์ชื่อเพื่อค้นหา แล้วเลือก (เลือกได้หลายคน)" autocomplete="off">
        </div>`}
      ${!inSet && [s.ApproverType, ...s.AlsoTypes].some((t) => DEPT_TYPES.includes(t)) ? `
        <label class="ar-dept">ฝ่ายที่ระบุ
          <select data-k="ApproverDept"><option value="">— เลือกฝ่าย —</option>${depts.map((d) =>
            `<option ${d === s.ApproverDept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>` : ''}
      ${inSet ? '' : `<details class="ar-also"${s.AlsoTypes.length ? ' open' : ''}>
        <summary>ให้คนจากประเภทอื่นอนุมัติขั้นนี้ได้ด้วย${s.AlsoTypes.length ? ` (${s.AlsoTypes.length})` : ''}</summary>
        <div class="ar-also-list">${ALSO_TYPES.filter((t) => t !== s.ApproverType).map((t) => `
          <label><input type="checkbox" data-also value="${esc(t)}" ${s.AlsoTypes.includes(t) ? 'checked' : ''}> ${esc(TYPE_LABEL[t] || t)}</label>`).join('')}</div>
      </details>`}
      <label class="ar-opt"><input type="checkbox" data-opt ${s.Optional ? 'checked' : ''}>
        ขั้นนี้ไม่บังคับ — ผู้อนุมัติกด "ข้ามขั้นนี้" ได้ · หาผู้อนุมัติไม่เจอ ระบบข้ามให้อัตโนมัติ</label>
      ${inSet ? '' : condHtml(s)}
      ${n > 1 ? `<label class="ar-opt"><input type="checkbox" data-early ${s.NotifyAtSubmit ? 'checked' : ''}>
        แจ้งผู้อนุมัติขั้นนี้ให้ทราบตั้งแต่มีคำขอเข้ามา (ดูได้อย่างเดียว) แล้วแจ้งอีกครั้งเมื่อถึงคิว</label>` : ''}
    </div>
  </div>`;
}

/** เงื่อนไขของขั้น: ใช้ขั้นนี้เฉพาะเมื่อช่องตัวเลือกในฟอร์มเป็นค่าที่ติ๊กไว้ (เช่น ประเภทงานซ่อม = อาคาร-สถานที่) */
function condHtml(s) {
  const fields = condFields.some((f) => f.key === s.ConditionField) || !s.ConditionField ? condFields
    : [...condFields, { key: s.ConditionField, title: `${s.ConditionField} (ไม่พบช่องนี้ในฟอร์มแล้ว)`, options: s.ConditionValues }];
  if (!fields.length) return '';
  const f = fields.find((x) => x.key === s.ConditionField);
  const opts = f ? [...new Set([...f.options, ...s.ConditionValues])] : [];
  return `<details class="ar-also ar-cond"${s.ConditionField ? ' open' : ''}>
    <summary>ใช้ขั้นนี้เฉพาะเมื่อ…${s.ConditionField && s.ConditionValues.length
      ? ` <b>${esc(f ? f.title : s.ConditionField)} = ${esc(s.ConditionValues.join(' / '))}</b>` : ''}</summary>
    <label class="ar-dept">ช่องในฟอร์ม
      <select data-k="ConditionField" data-condfield><option value="">— ทุกคำขอ (ไม่มีเงื่อนไข) —</option>${fields.map((x) =>
        `<option value="${esc(x.key)}" ${x.key === s.ConditionField ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>
    ${f ? `<div class="ar-also-list">${opts.map((o) => `
      <label><input type="checkbox" data-cond value="${esc(o)}" ${s.ConditionValues.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>
      <div class="dim ar-cond-hint">ผู้ยื่นเลือกค่าที่ติ๊กไว้ → คำขอมาที่ขั้นนี้ · ไม่ตรง → ข้ามขั้นนี้ไปเลย (ไม่แสดงในเส้นทาง)</div>` : ''}
  </details>`;
}

function hintFor(type) {
  if (type === 'ผู้บังคับบัญชาของผู้ยื่น') return 'ระบบใช้ผู้บังคับบัญชาของคนที่ยื่นคำขอ (ช่อง Manager ในทะเบียนบุคลากร)';
  if (type === 'ผู้จัดการฝ่ายของผู้ยื่น') return 'ระบบใช้ผู้จัดการฝ่ายของฝ่ายที่ผู้ยื่นสังกัด';
  if (type === PROJECT) return 'ระบบใช้ผู้รับผิดชอบหลักของโครงการที่เลือกในคำขอ (ตามหน้าโครงการ)';
  if (type === 'ผู้จัดการโครงการ') return 'ระบบใช้คนในทีมโครงการที่เลือกในคำขอ ที่มีตำแหน่ง "ผู้จัดการโครงการ"';
  if (type === 'ผู้อำนวยการโครงการ') return 'ระบบใช้คนในทีมโครงการที่เลือกในคำขอ ที่มีตำแหน่ง "ผู้อำนวยการโครงการ"';
  if (type === 'ทุกคนในฝ่ายที่ระบุ') return 'ทุกคนในฝ่ายที่เลือกด้านล่าง อนุมัติได้';
  if (type === 'ผู้จัดการฝ่ายที่ระบุ') return 'ผู้จัดการ/หัวหน้าของฝ่ายที่เลือกด้านล่าง';
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
          `<option value="${k}" ${k === steps.length ? 'selected' : ''}>${k ? `${k} ขั้น` : curSet ? 'ใช้เส้นทางปกติ' : 'ไม่ต้องอนุมัติ'}</option>`).join('')}</select></label>
    </div>
    ${setKeys.length > 1 ? `<div class="ar-sets" role="tablist">${setKeys.map((k) => {
      const meta = ROUTE_SETS.find((x) => x.key === k) || { label: k };
      const n = (k === curSet ? steps : sets[k] || []).length;
      return `<button type="button" role="tab" data-set="${esc(k)}" aria-selected="${k === curSet}">${esc(meta.label)}
        <b>${k && !n ? 'ใช้ปกติ' : `${n} ขั้น`}</b></button>`;
    }).join('')}</div>
    ${curSet ? `<div class="ar-set-hint">เส้นทางนี้ใช้<b>แทนเส้นทางปกติทั้งชุด</b> เมื่อผู้ยื่นเลือกโครงการ
      <b>${esc((ROUTE_SETS.find((x) => x.key === curSet) || {}).project || curSet)}</b>
      · แต่ละขั้นเลือก <b>ระบุชื่อเจาะจง</b> (หลายคนได้) หรือ <b>ผู้บังคับบัญชาของผู้ยื่น</b>
      · ตั้ง 0 ขั้น = ใช้เส้นทางปกติ${/^FM-PUR-004$/i.test(formCodeNow) ? ' · ใบขอสั่งซื้อ: ตั้งชื่อขั้นของฝ่ายจัดซื้อให้มีคำว่า "จัดซื้อ" เพื่อใช้ปุ่มอัปเดตสถานะจัดซื้อ' : ''}</div>` : ''}` : ''}
    ${steps.length ? steps.map(stepHtml).join('') : `<div class="ar-none">${curSet ? 'ยังไม่ได้ตั้งเส้นทางแยก — คำขอโครงการนี้ใช้เส้นทางปกติ' : 'ฟอร์มนี้ส่งแล้วไม่ต้องผ่านผู้อนุมัติ'}</div>`}
    <div class="field-error" id="ar-err" hidden></div>`;
  bind();
}

function read() {
  $$('#ar-box .ar-step').forEach((el) => {
    const s = steps[+el.dataset.step];
    $$('[data-k]', el).forEach((c) => { s[c.dataset.k] = c.value.trim(); });
    if (el.querySelector('[data-also]')) s.AlsoTypes = $$('[data-also]', el).filter((c) => c.checked).map((c) => c.value);
    const opt = el.querySelector('[data-opt]');
    if (opt) s.Optional = opt.checked;
    const early = el.querySelector('[data-early]');
    s.NotifyAtSubmit = !!(early && early.checked);
    if (el.querySelector('[data-condfield]')) s.ConditionValues = s.ConditionField ? $$('[data-cond]', el).filter((c) => c.checked).map((c) => c.value) : [];
  });
}

function bind() {
  $$('#ar-box [data-set]').forEach((b) => {
    b.onclick = () => {
      read();
      sets[curSet] = steps;
      curSet = b.dataset.set;
      steps = sets[curSet] || (sets[curSet] = []);
      paint();
    };
  });
  $('#ar-count').onchange = (e) => {
    read();
    const n = +e.target.value;
    while (steps.length < n) steps.push({ StepName: '', ApproverType: NAMED, Approvers: [], ApproveMode: MODES[0],
      ApproverDept: '', AlsoTypes: [], Optional: false, NotifyAtSubmit: false, ConditionField: '', ConditionValues: [], Extra: [] });
    steps.length = n;
    paint();
  };
  $$('#ar-box .ar-step').forEach((el) => {
    const i = +el.dataset.step;
    // เปลี่ยนประเภท → ล้างชื่อขั้นเดิม ให้ใช้ชื่อตามประเภทใหม่ (แก้เองได้อีกทีในช่องชื่อขั้น)
    el.querySelector('[data-k="ApproverType"]').onchange = () => { read(); steps[i].StepName = ''; paint(); };
    // ติ๊กประเภทแบบ "ฝ่ายที่ระบุ" → วาดใหม่ให้ช่องเลือกฝ่ายโผล่
    $$('[data-also]', el).forEach((c) => { c.onchange = () => { read(); paint(); }; });
    // เปลี่ยนช่องเงื่อนไข → ล้างค่าที่ติ๊กไว้ แล้ววาดตัวเลือกของช่องใหม่
    const cf = el.querySelector('[data-condfield]');
    if (cf) cf.onchange = () => { read(); steps[i].ConditionValues = []; paint(); };
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
    // ชื่อบุคคลที่ระบุเพิ่ม (ขั้นแบบตามตำแหน่ง/ฝ่าย/โครงการ)
    const xq = el.querySelector('.ar-xq');
    if (xq) {
      const addX = () => {
        const v = xq.value.trim();
        if (!staff.find((p) => plain(p.Title) === v)) return;
        read();
        if (!steps[i].Extra.includes(v)) steps[i].Extra.push(v);
        paint();
        const again = $(`#ar-box .ar-step[data-step="${i}"] .ar-xq`);
        if (again) again.focus();
      };
      xq.onchange = addX;
      xq.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addX(); } };
    }
    $$('[data-xrm]', el).forEach((b) => {
      b.onclick = () => { read(); steps[i].Extra = steps[i].Extra.filter((x) => x !== b.dataset.xrm); paint(); };
    });
    $$('[data-rm]', el).forEach((b) => {
      b.onclick = () => { read(); steps[i].Approvers = steps[i].Approvers.filter((x) => x !== b.dataset.rm); paint(); };
    });
  });
}

/** โหลดเส้นทางเดิมของฟอร์ม แล้ววาดลงกล่อง (เรียกหลังเปิดหน้าต่าง) */
export async function bindRouteEditor(formCode) {
  const [dir, matrix, deptRows, ffRows] = await Promise.all([
    list('directory').catch(() => []), list('approvalMatrix').catch(() => []), list('departments').catch(() => []),
    list('formFields').catch(() => []),
  ]);
  staff = dir;
  depts = deptRows.filter((d) => d.IsActive !== false).map((d) => plain(d.Title)).filter(Boolean);
  const code = plain(formCode);
  condFields = ffRows.filter((f) => codeOfRow(f) === code && !isOff(f.IsActive)
      && ['choice', 'multichoice', 'yesno'].includes(plain(f.FieldType)))
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0))
    .map((f) => ({ key: plain(f.FieldKey), title: plain(f.Title) || plain(f.FieldKey),
      options: plain(f.FieldType) === 'yesno' ? ['true', 'false']
        : String(f.Options || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) }))
    .filter((f) => f.key);
  existing = code ? matrix.filter((s) => codeOfRow(s) === code)
    .sort((a, b) => (+a.StepOrder || 0) - (+b.StepOrder || 0)) : [];
  const toStep = (s) => ({
    StepName: plain(s.StepName),
    ApproverType: plain(s.ApproverType) || NAMED,
    // ขั้นแบบระบุชื่อที่นำเข้าจาก CSV ใส่ชื่อไว้ใน ExtraApprovers (ช่อง Approvers เป็น Lookup นำเข้าตรง ๆ ไม่ได้) → รวมเป็นผู้อนุมัติ
    Approvers: (plain(s.ApproverType) || NAMED) === NAMED
      ? [...new Set([...names(s.Approvers), ...splitList(s.ExtraApprovers)])] : names(s.Approvers),
    ApproveMode: MODES.includes(plain(s.ApproveMode)) ? plain(s.ApproveMode) : MODES[0],
    ApproverDept: plain(s.ApproverDept),
    AlsoTypes: splitList(s.AlsoTypes),
    Optional: yes(s.Optional),
    NotifyAtSubmit: yes(s.NotifyAtSubmit),
    ConditionField: routeSetOf(s) ? '' : plain(s.ConditionField),
    ConditionValues: routeSetOf(s) ? [] : splitList(s.ConditionValues),
    Extra: splitList(s.ExtraApprovers),
  });
  // ชุดเส้นทาง: ปกติเสมอ · PPE เมื่อฟอร์มมีช่องโครงการ · O&M เมื่อฟอร์มมีตัวเลือกงาน O&M · รวมชุดที่เคยตั้งไว้แล้ว
  formCodeNow = code;
  const hasProject = ffRows.some((f) => codeOfRow(f) === code && !isOff(f.IsActive)
    && plain(f.FieldType) === 'lookup' && plain(f.Options) === 'projects');
  const present = [...new Set(existing.map(routeSetOf).filter(Boolean))];
  setKeys = ROUTE_SETS.map((x) => x.key).filter((k) => k === ''
    || present.includes(k) || (hasProject && (k === 'PPE' || (k === 'O&M' && OM_FORMS.includes(code)))));
  sets = {};
  setKeys.forEach((k) => {
    sets[k] = existing.filter((r) => routeSetOf(r) === k && !isOff(r.IsActive)).slice(0, MAX_STEPS).map(toStep);
  });
  curSet = '';
  steps = sets[''];
  paint();
}

/** ตรวจก่อนบันทึก คืนข้อความผิดพลาด (ว่าง = ผ่าน) */
export function routeProblems() {
  if (!$('#ar-box')) return '';
  read();
  sets[curSet] = steps;
  // ชุดแยกที่มีปัญหา: แจ้งชื่อชุดแล้วพาไปที่แท็บนั้น
  for (const k of setKeys.filter((x) => x && x !== curSet)) {
    const bad = (sets[k] || []).map((x, i) => (x.ApproverType === NAMED && !x.Approvers.length ? i + 1 : 0)).filter(Boolean);
    if (bad.length) {
      const label = (ROUTE_SETS.find((x) => x.key === k) || {}).label || k;
      curSet = k; steps = sets[k]; paint();
      const err = $('#ar-err');
      const msg = `เส้นทาง ${label}: ขั้นที่ ${bad.join(', ')} เลือก "ระบุชื่อเจาะจง" แต่ยังไม่ได้เลือกผู้อนุมัติ`;
      if (err) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return msg;
    }
  }
  const bad = steps.map((s, i) => (s.ApproverType === NAMED && !s.Approvers.length ? i + 1 : 0)).filter(Boolean);
  const noDept = steps.map((s, i) => ([s.ApproverType, ...s.AlsoTypes].some((t) => DEPT_TYPES.includes(t)) && !s.ApproverDept ? i + 1 : 0)).filter(Boolean);
  const noCond = steps.map((s, i) => (s.ConditionField && !s.ConditionValues.length ? i + 1 : 0)).filter(Boolean);
  const msg = bad.length ? `ขั้นที่ ${bad.join(', ')} เลือก "ระบุชื่อเจาะจง" แต่ยังไม่ได้เลือกผู้อนุมัติ`
    : noDept.length ? `ขั้นที่ ${noDept.join(', ')} ใช้ประเภท "ฝ่ายที่ระบุ" แต่ยังไม่ได้เลือกฝ่าย`
    : noCond.length ? `ขั้นที่ ${noCond.join(', ')} ตั้งเงื่อนไขแล้วแต่ยังไม่ได้ติ๊กค่า — ติ๊กค่าที่ต้องการ หรือเลือก "ทุกคำขอ"` : '';
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
  sets[curSet] = steps;
  const code = plain(formCode);
  const notes = [];
  const keep = (res) => {
    const skipped = [...((res && res.skipped) || []), ...((res && res.dropped) || [])];
    if (skipped.length) notes.push(...skipped);
  };
  // เขียนทีละชุด: แถวเดิมของชุดนั้นใช้ซ้ำตามลำดับ ขาดเพิ่ม เกินลบ (ชุดอื่นไม่แตะ)
  const keys = [...new Set([...setKeys, ...existing.map(routeSetOf)])];
  for (const k of keys) {
    const mine = existing.filter((r) => routeSetOf(r) === k);
    const rows = (sets[k] || []).map((s, i) => ({
      Title: `${code}${k ? ` · ${k}` : ''} · ลำดับ ${i + 1}`,
      FormCode: code,
      StepOrder: i + 1,
      StepName: s.StepName || TYPE_LABEL[s.ApproverType] || s.ApproverType,
      ApproverType: s.ApproverType,
      ...(s.ApproverType === NAMED ? { Approvers: s.Approvers } : {}),
      ApproveMode: s.ApproveMode,
      ApproverDept: k ? '' : (s.ApproverDept || ''),
      AlsoTypes: k ? '' : s.AlsoTypes.join(', '),
      Optional: !!s.Optional,
      NotifyAtSubmit: !!s.NotifyAtSubmit,
      // ขั้นแบบระบุชื่อเจาะจงใช้ช่อง Approvers อยู่แล้ว ไม่ต้องมีชื่อเพิ่ม
      ExtraApprovers: s.ApproverType === NAMED ? '' : (s.Extra || []).join(', '),
      // ชุดแยก: ConditionField = __set · ConditionValues = ชื่อชุด
      ConditionField: k ? ROUTE_SET_FIELD : (s.ConditionField || ''),
      ConditionValues: k ? k : (s.ConditionValues || []).join(', '),
      SortOrder: i + 1,
      IsActive: true,
    }));
    for (let i = 0; i < rows.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      keep(mine[i] ? await update('approvalMatrix', mine[i].id, rows[i]) : await create('approvalMatrix', rows[i]));
    }
    for (const old of mine.slice(rows.length)) {
      // eslint-disable-next-line no-await-in-loop
      await remove('approvalMatrix', old.id);
    }
  }
  return [...new Set(notes)];
}
