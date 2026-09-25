/**
 * ข้อมูลของผู้ถูกประเมินแต่ละคน กรอกในหน้าต่าง "สร้าง/แก้ไขแบบประเมิน" (จัดการข้อมูล → รอบประเมินผล)
 *   ส่วนที่ 1 : ข้อมูลการทดลองงาน  — วันเริ่มงานและกำหนดประเมินแต่ละครั้ง (เฉพาะแบบผ่านงาน)
 *   ส่วนที่ 2 : บันทึกการมาปฏิบัติงาน — มาสาย ขาดงาน ลา
 * ตารางเปลี่ยนตามรายชื่อที่ติ๊กเลือกทันที ไม่ต้องบันทึกรอบก่อน
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, update } from '../services/data.js';
import { extraOf, clean, ROUND_DAYS, mergeRounds, isProbationSet } from '../services/appraisal.js';

const ATT = [
  ['late', 'มาสาย', 'ครั้ง'], ['absent', 'ขาดงาน', 'วัน'], ['personal', 'ลากิจ', 'วัน'],
  ['sick', 'ลาป่วย', 'วัน'], ['other', 'ลาอื่นๆ', 'วัน'],
];
const low = (v) => clean(v).toLowerCase();
const addDays = (iso, n) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

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
  ATT.forEach(([k]) => { base[k] = String((x.attendance || {})[k] ?? ''); });
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

  host.innerHTML = `
    ${probation ? `<div class="panel-head">ส่วนที่ 1 : ข้อมูลการทดลองงาน
      <span class="panel-meta">ใส่วันเริ่มงาน ระบบเติมวันครบกำหนดให้</span></div>
    <table class="ap-table ap-attgrid">
      <thead><tr><th>ชื่อ</th><th>วันเริ่มงาน</th>
        ${ROUND_DAYS.map((r) => `<th>${esc(r.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((p) => {
        const em = low(p.Email); const v = vals.get(em);
        return `<tr>${name(p)}${cell(em, 'start', v.start, 'date')}
          ${ROUND_DAYS.map((r) => cell(em, r.key, v[r.key], 'date')).join('')}</tr>`;
      }).join('')}</tbody>
    </table>` : ''}

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

  // ใส่วันเริ่มงานแล้วเติมกำหนดประเมินให้
  $$('#ap-cyclegrid [data-k=start]').forEach((el) => {
    el.onchange = () => {
      if (!el.value) return;
      ROUND_DAYS.forEach((r) => {
        const t = $(`#ap-cyclegrid [data-em="${el.dataset.em}"][data-k="${r.key}"]`);
        if (t) t.value = addDays(el.value, r.days);
      });
    };
  });
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
  ['#f_Scope', '#f_FormSet', '#f_Round', '#f_RoundDate'].forEach((s) => {
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
    // ไม่ได้กรอกวันลาเลยและใบเดิมก็ยังไม่มี ไม่ต้องเขียนช่องว่างลงไป
    if (!x.attendance && Object.values(item.attendance || {}).every((v) => v === '')) {
      item = { ...item };
      delete item.attendance;
    }
    const changed = Object.keys(item).some((k) => !same(x[k], item[k]));
    if (changed) jobs.push([r, { ...x, ...item }]);
  });
  let done = 0;
  for (const [r, extra] of jobs) {
    // eslint-disable-next-line no-await-in-loop
    await update('appraisals', r.id, { Extra: JSON.stringify(extra) });
    done += 1;
    onProgress(done, jobs.length);
  }
  return done;
}
