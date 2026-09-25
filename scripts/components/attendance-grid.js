/**
 * ข้อมูลของผู้ถูกประเมินแต่ละคน กรอกในหน้าต่าง "สร้าง/แก้ไขแบบประเมิน" (จัดการข้อมูล → สร้างแบบประเมิน)
 *   ส่วนที่ 1 : ข้อมูลการทดลองงาน  — วันเริ่มงานและกำหนดประเมินแต่ละครั้ง (เฉพาะแบบผ่านงาน)
 *   ส่วนที่ 2 : บันทึกการมาปฏิบัติงาน — มาสาย ขาดงาน ลา
 *   ผู้ประเมิน · ฝ่ายบุคคลตรวจสอบ · ผู้บริหารอนุมัติ — ใบละ 1 คน พิมพ์ชื่อแล้วเลือกจากรายการ
 * ตารางเปลี่ยนตามรายชื่อที่ติ๊กเลือกทันที ไม่ต้องบันทึกรอบก่อน
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, update } from '../services/data.js';
import { extraOf, clean, ROUND_DAYS, mergeRounds, roundKey, isProbationSet, rolesOf } from '../services/appraisal.js';

/** ผู้รับผิดชอบแต่ละขั้นของใบ — คีย์ในตาราง, หัวคอลัมน์, คำอธิบายเมื่อเว้นว่าง */
const ROLES = [
  ['evaluator', 'ผู้ประเมิน / ผู้บังคับบัญชา', 'ว่าง = ผู้บังคับบัญชาในทะเบียน'],
  ['hr', 'ฝ่ายบุคคลตรวจสอบ', 'ว่าง = ทุกคนในรายชื่อ HR'],
  ['approver', 'ผู้บริหารอนุมัติ', 'ว่าง = ผู้จัดการฝ่ายของฝ่ายนั้น'],
];

const ATT = [
  ['late', 'มาสาย', 'ครั้ง'], ['absent', 'ขาดงาน', 'วัน'], ['personal', 'ลากิจ', 'วัน'],
  ['sick', 'ลาป่วย', 'วัน'], ['other', 'ลาอื่นๆ', 'วัน'],
];
const low = (v) => clean(v).toLowerCase();
/** ครั้งที่ประเมินและ "วันที่ประเมินครั้งนี้" ที่เลือกในฟอร์มตอนนี้ */
const current = () => ({
  key: roundKey(($('#f_Round') || {}).value),
  date: String(($('#f_RoundDate') || {}).value || '').slice(0, 10),
});

let dir = [];
let allSheets = [];
let draft = {};       // ค่าที่พิมพ์ค้างไว้ เก็บไว้ตอนตารางวาดใหม่เมื่อเปลี่ยนรายชื่อ

/** กล่องว่างที่จะเติมตารางลงไป (ใส่ท้ายฟอร์ม) */
export const cycleGridHost = () => '<div class="ap-attpanel" id="ap-cyclegrid"></div>';

/** ผู้ถูกประเมินตามที่เลือกในฟอร์มตอนนี้ */
function people() {
  const scope = ($('#f_Scope') || {}).value || '';
  const staff = dir.filter((p) => p.IsActive !== false && clean(p.Email));
  if (scope !== 'เฉพาะรายชื่อที่ระบุ') return staff;
  const picked = new Set($$('#f_Members input:checked').map((c) => c.value.trim().toLowerCase()));
  return staff.filter((p) => picked.has(low(p.Email)) || picked.has(low(p.Title)));
}

/** เก็บค่าที่กรอกอยู่ในตารางตอนนี้ไว้ใน draft */
function keep() {
  $$('#ap-cyclegrid [data-em]').forEach((el) => {
    const d = (draft[el.dataset.em] = draft[el.dataset.em] || {});
    d[el.dataset.k] = el.value.trim();
  });
}

/** ค่าเริ่มต้นของแต่ละคน: ค่าที่พิมพ์ค้าง > ใบประเมินเดิมของรอบนี้ > ทะเบียนบุคลากร */
function valuesOf(p, title) {
  const em = low(p.Email);
  const mine = allSheets.filter((r) => low(r.EmployeeEmail) === em);
  const sheet = mine.find((r) => clean(r.CycleName) === title);
  const x = sheet ? extraOf(sheet) : {};
  const start = x.startDate || (p.StartDate ? String(p.StartDate).slice(0, 10) : '');
  const rounds = x.rounds && x.rounds.length ? x.rounds
    : mergeRounds(start, { Round: ($('#f_Round') || {}).value, RoundDate: ($('#f_RoundDate') || {}).value },
      mine.filter((r) => r !== sheet));
  const base = { start, ...Object.fromEntries(rounds.map((r) => [r.key, r.date || ''])) };
  // วันของครั้งนี้อ้างอิง "วันที่ประเมินครั้งนี้" ในฟอร์มเสมอ
  const cur = current();
  if (cur.key && cur.date) base[cur.key] = cur.date;
  ATT.forEach(([k]) => { base[k] = String((x.attendance || {})[k] ?? ''); });
  // ผู้ประเมิน: ใบเดิม > ผู้บังคับบัญชาในทะเบียน · ฝ่ายบุคคล/ผู้อนุมัติ: ที่กำหนดไว้ในใบเดิม
  const ro = sheet ? rolesOf(sheet) : {};
  base.evaluator = clean(sheet && sheet.EvaluatorName) || clean(p.Manager);
  base.hr = clean(ro.hr && ro.hr.name);
  base.approver = clean(ro.approver && ro.approver.name);
  return { ...base, ...(draft[em] || {}) };
}

function paint(title) {
  const host = $('#ap-cyclegrid');
  if (!host) return;
  keep();
  const rows = people();
  const probation = isProbationSet(($('#f_FormSet') || {}).value);
  if (!rows.length) {
    host.innerHTML = `<div class="panel-head">ข้อมูลผู้ถูกประเมิน</div>
      <div class="empty">ติ๊กเลือกรายชื่อผู้ถูกประเมินด้านบน แล้วกรอกข้อมูลได้ที่นี่ทันที</div>`;
    return;
  }
  const cell = (em, k, v, type = 'number') => `<td class="num"><input type="${type}"
    ${type === 'number' ? 'min="0" step="1" class="ap-attin"' : 'class="ap-datein"'}
    data-em="${esc(em)}" data-k="${k}" value="${esc(v ?? '')}"></td>`;
  const name = (p) => `<td>${esc(clean(p.Title))}<div class="dim">${esc(clean(p.Department))}</div></td>`;
  const vals = new Map(rows.map((p) => [low(p.Email), valuesOf(p, title)]));
  const cur = current();

  const role = (em, k, v) => `<td><input class="ap-rolein" list="ap-people" autocomplete="off"
    data-em="${esc(em)}" data-k="${k}" value="${esc(v || '')}" placeholder="พิมพ์ชื่อ…"></td>`;

  host.innerHTML = `
    <datalist id="ap-people">${dir.filter((p) => p.IsActive !== false && clean(p.Title)).map((p) =>
      `<option value="${esc(clean(p.Title))}">${esc([clean(p.Position), clean(p.Department)].filter(Boolean).join(' · '))}</option>`).join('')}
    </datalist>
    <div class="panel-head">ผู้ประเมินและผู้อนุมัติของแต่ละใบ
      <span class="panel-meta">พิมพ์ชื่อแล้วเลือกจากรายการ · ใบละ 1 คน</span></div>
    <table class="ap-table ap-rolegrid">
      <thead>
        <tr><th>ผู้ถูกประเมิน</th>${ROLES.map(([, label, hint]) =>
          `<th>${esc(label)}<br><span class="dim">${esc(hint)}</span></th>`).join('')}</tr>
        ${rows.length > 1 ? `<tr class="ap-roleall"><td class="dim">ตั้งให้ทุกคน</td>${ROLES.map(([k]) =>
          `<td><input class="ap-rolein" list="ap-people" autocomplete="off" data-all="${k}" placeholder="พิมพ์ชื่อแล้วใช้กับทุกคน"></td>`).join('')}</tr>` : ''}
      </thead>
      <tbody>${rows.map((p) => {
        const em = low(p.Email); const v = vals.get(em);
        return `<tr>${name(p)}${ROLES.map(([k]) => role(em, k, v[k])).join('')}</tr>`;
      }).join('')}</tbody>
    </table>
    <div class="field-error" id="ap-roleerr" hidden></div>

    ${probation ? `<div class="panel-head">ส่วนที่ 1 : ข้อมูลการทดลองงาน
      <span class="panel-meta">ครั้งที่ประเมินรอบนี้ใช้ "วันที่ประเมินครั้งนี้" ด้านบน · ครั้งอื่นกรอกเอง</span></div>
    <div class="ap-pbgrid">${rows.map((p) => {
      const em = low(p.Email); const v = vals.get(em);
      const date = (k, label) => `<label${k === cur.key ? ' class="now"' : ''}>${esc(label)}
        <input type="date" class="ap-datein" data-em="${esc(em)}" data-k="${k}" value="${esc(v[k] || '')}"></label>`;
      return `<div class="ap-pbrow">
        <div class="ap-pbname">${esc(clean(p.Title))} <span class="dim">· ${esc(clean(p.Department))}</span></div>
        <div class="ap-pbdates">${date('start', 'วันเริ่มงาน')}
          ${ROUND_DAYS.map((r) => date(r.key, r.label + (r.key === cur.key ? ' · ครั้งนี้' : ''))).join('')}</div>
      </div>`;
    }).join('')}</div>` : ''}

    <div class="panel-head">${probation ? 'ส่วนที่ 2 : ' : ''}บันทึกการมาปฏิบัติงาน</div>
    <table class="ap-table ap-attgrid">
      <thead><tr><th>ชื่อ</th>
        ${ATT.map(([, label, unit]) => `<th class="num">${label}<br><span class="dim">${unit}</span></th>`).join('')}
      </tr></thead>
      <tbody>${rows.map((p) => {
        const em = low(p.Email); const v = vals.get(em);
        return `<tr>${name(p)}${ATT.map(([k]) => cell(em, k, v[k])).join('')}</tr>`;
      }).join('')}</tbody>
    </table>
    <div class="panel-note">ระบบสร้างใบประเมินให้ทุกคนในรายชื่อเมื่อกดบันทึก · ผู้ประเมินจะเห็นตัวเลขนี้ในแบบประเมินทันที</div>`;

  // ช่อง "ตั้งให้ทุกคน": เลือกชื่อแล้วเติมลงทุกแถวของคอลัมน์นั้น
  $$('#ap-cyclegrid [data-all]').forEach((el) => {
    el.onchange = () => {
      const v = el.value.trim();
      if (!v) return;
      $$(`#ap-cyclegrid [data-em][data-k="${el.dataset.all}"]`).forEach((c) => { c.value = v; recheck(c); });
      keep();
      el.value = '';
    };
  });
  // แก้ชื่อที่ไม่พบแล้ว กรอบแดงหายทันที
  $$('#ap-cyclegrid [data-em].ap-rolein').forEach((el) => { el.addEventListener('change', () => recheck(el)); });
}

/** ตรวจชื่อช่องเดียว แล้วซ่อนข้อความเตือนเมื่อไม่มีช่องผิดเหลือ */
function recheck(el) {
  const v = el.value.trim();
  el.classList.toggle('bad', !!v && !personByName(v));
  const box = $('#ap-roleerr');
  if (box && !$('#ap-cyclegrid .ap-rolein.bad')) box.hidden = true;
}

/** หาบุคลากรจากชื่อที่พิมพ์ (ต้องตรงกับชื่อในทะเบียน) */
const personByName = (n) => dir.find((p) => clean(p.Title) === clean(n) && clean(p.Email));

/**
 * ชื่อผู้ประเมิน/ผู้ตรวจ/ผู้อนุมัติที่พิมพ์แล้วไม่ตรงกับทะเบียนบุคลากร
 * แสดงใต้ตารางและคืนรายการ เพื่อให้หน้าต่างหยุดบันทึก
 */
export function gridProblems() {
  if (!$('#ap-cyclegrid')) return [];
  const bad = [];
  $$('#ap-cyclegrid [data-em].ap-rolein').forEach((el) => {
    const v = el.value.trim();
    el.classList.toggle('bad', !!v && !personByName(v));
    if (v && !personByName(v)) bad.push(v);
  });
  const box = $('#ap-roleerr');
  if (box) {
    box.hidden = !bad.length;
    box.textContent = bad.length
      ? `ไม่พบชื่อในทะเบียนบุคลากร (หรือไม่มีอีเมล): ${[...new Set(bad)].join(', ')} — เลือกชื่อจากรายการที่ขึ้นมา` : '';
    if (bad.length) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return [...new Set(bad)];
}

/** เปิดตารางในฟอร์ม และวาดใหม่ทุกครั้งที่เปลี่ยนรายชื่อ ขอบเขต หรือชุดแบบประเมิน */
export async function bindCycleGrid(record = {}) {
  draft = {};
  [dir, allSheets] = await Promise.all([
    list('directory').catch(() => []), list('appraisals').catch(() => []),
  ]);
  const title = clean(record.Title);
  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(() => paint(title), 0); };
  const box = $('#f_Members');
  if (box) { box.addEventListener('change', later); box.addEventListener('click', later); }

  // เปลี่ยนครั้งที่หรือวันที่ประเมินครั้งนี้ → ใส่วันนั้นลงช่องของครั้งนี้ให้ทุกคน
  let prev = current();
  const sync = () => {
    const cur = current();
    $$('#ap-cyclegrid .ap-datein').forEach((el) => {
      const k = el.dataset.k;
      if (prev.key && prev.key !== cur.key && k === prev.key && el.value === prev.date) el.value = '';
      if (cur.key && cur.date && k === cur.key) el.value = cur.date;
    });
    keep();
    prev = cur;
    later();
  };
  ['#f_Round', '#f_RoundDate'].forEach((s) => {
    const el = $(s);
    if (el) el.addEventListener('change', sync);
  });
  ['#f_Scope', '#f_FormSet'].forEach((s) => {
    const el = $(s);
    if (el) el.addEventListener('change', later);
  });
  paint(title);
}

/** อ่านค่าในตารางทั้งหมด (เรียกก่อนปิดหน้าต่าง) คืน { อีเมล: { startDate, rounds, attendance } } */
export function readCycleGrid() {
  if (!$('#ap-cyclegrid')) return null;
  keep();
  const probation = isProbationSet(($('#f_FormSet') || {}).value);
  const out = {};
  people().forEach((p) => {
    const em = low(p.Email);
    const v = draft[em] || {};
    const item = { attendance: Object.fromEntries(ATT.map(([k]) => [k, v[k] ?? ''])) };
    // ผู้รับผิดชอบแต่ละขั้น — เก็บทั้งชื่อและอีเมล (สิทธิ์ในใบประเมินเทียบด้วยอีเมล)
    const pick = (n) => { const q = personByName(n); return q ? { name: clean(q.Title), email: low(q.Email) } : null; };
    if (v.evaluator !== undefined) item.evaluator = pick(v.evaluator);
    item.roles = {};
    ['hr', 'approver'].forEach((k) => { const q = pick(v[k]); if (q) item.roles[k] = q; });
    if (probation) {
      item.startDate = v.start || '';
      item.rounds = ROUND_DAYS.map((r) => ({ key: r.key, label: r.label, date: v[r.key] || '' }));
    }
    out[em] = item;
  });
  return out;
}

/** บันทึกลงใบประเมินของรอบ เฉพาะใบที่ค่าเปลี่ยน คืนจำนวนใบที่บันทึก */
export async function saveCycleGrid(sheetRows, data, onProgress = () => {}) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const jobs = [];
  sheetRows.forEach((r) => {
    let item = data[low(r.EmployeeEmail)];
    if (!item) return;
    const x = extraOf(r);
    // ผู้ประเมินเก็บในคอลัมน์ของใบ (ใช้กับแท็บทีมของฉันและการแจ้งเตือน) ส่วนอื่นเก็บใน Extra
    const patch = {};
    if (item.evaluator && low(item.evaluator.email) !== low(r.EvaluatorEmail)) {
      patch.EvaluatorName = item.evaluator.name;
      patch.EvaluatorEmail = item.evaluator.email;
    }
    item = { ...item };
    delete item.evaluator;
    if (!x.roles && !Object.keys(item.roles || {}).length) delete item.roles;
    // ไม่ได้กรอกวันลาเลยและใบเดิมก็ยังไม่มี ไม่ต้องเขียนช่องว่างลงไป
    if (!x.attendance && Object.values(item.attendance || {}).every((v) => v === '')) {
      item = { ...item };
      delete item.attendance;
    }
    const changed = Object.keys(item).some((k) => !same(x[k], item[k]));
    if (changed) patch.Extra = JSON.stringify({ ...x, ...item });
    if (Object.keys(patch).length) jobs.push([r, patch]);
  });
  let done = 0;
  for (const [r, patch] of jobs) {
    // eslint-disable-next-line no-await-in-loop
    await update('appraisals', r.id, patch);
    done += 1;
    onProgress(done, jobs.length);
  }
  return done;
}
