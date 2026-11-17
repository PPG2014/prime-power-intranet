/**
 * ภาพรวมการประเมิน KPI ประจำปี (แท็บ "ภาพรวมทั้งองค์กร" ของฝ่ายบุคคล)
 * แทนชีท 01_Dashboard · 02_Employee Master · 03_Supervisor Mapping · 04_Position Master · 05_Tracker ในไฟล์ Excel
 * ข้อมูลทั้งหมดดึงจากใบประเมินในระบบและทะเบียนบุคลากร ไม่ต้องกรอกซ้ำ
 */
import { esc, $ } from '../core/dom.js';
import { toCsv, downloadText } from '../utils/csv.js';
import { clean, noSelf, afterCutoff, isKpiSet, sheetIsKpi, rolesOf, S_SELF, S_HR } from '../services/appraisal.js';
import { summarize, kpiSteps, formOfRow, hasCustom, kpiPhase, approveCustom, hrToMd } from '../services/kpi.js';
import { kpiStatusLabel } from './kpi-sheet.js';

const low = (v) => clean(v).toLowerCase();
const STEP_COLS = [['fc', 'หัวหน้ากำหนด FC'], ['fcHr', 'HR ตรวจหัวข้อ'], ['self', 'พนักงานประเมิน'], ['sup', 'หัวหน้างานประเมิน'],
  ['hrMid', 'HR ตรวจ · ส่ง MD'], ['md', 'MD ประเมิน'], ['hr', 'HR ลงนาม'], ['ack', 'ลงนามรับทราบ']];
const STATE_TH = { done: 'เสร็จสิ้น', now: 'กำลังดำเนินการ', wait: 'ยังไม่เริ่ม', na: 'N/A' };
const mark = (s) => ({ done: '<span class="kpi-ok">✓</span>', now: '<span class="kpi-now">●</span>', wait: '<span class="dim">○</span>', na: '<span class="dim">—</span>' }[s] || '');

/** ข้อมูลรายใบสำหรับตาราง Tracker */
function trackOf(r, dirByEmail) {
  const p = dirByEmail.get(low(r.EmployeeEmail)) || {};
  const steps = Object.fromEntries(kpiSteps(r, { noSelf: noSelf(r) }).map((s) => [s.key, s.state]));
  if (!steps.self) steps.self = 'na';
  const sum = summarize(r);
  const issues = [];
  if (!clean(r.EvaluatorEmail)) issues.push('ยังไม่มีผู้ประเมิน');
  else if (low(r.EvaluatorEmail) === low(r.EmployeeEmail)) issues.push('ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน');
  if (!hasCustom(r) && steps.fc !== 'done') issues.push('ยังไม่กำหนด FC เฉพาะตำแหน่ง');
  return { r, p, steps, sum, issues };
}

/** ใบที่รอฝ่ายบุคคลแยกตามขั้น (hrCan = ฝ่ายบุคคลคนนี้ตรวจใบนั้นได้) */
const hrQueue = (rows, hrCan = () => true) => {
  const k = rows.filter((r) => sheetIsKpi(r));
  const at = (st, ph) => k.filter((r) => clean(r.Status) === st && kpiPhase(r) === ph);
  return {
    fc: at(S_SELF, 'fc'),
    fcHr: at(S_SELF, 'fcHr').filter(hrCan),
    mid: at(S_HR, 'mid').filter(hrCan),
    final: at(S_HR, 'final').filter(hrCan),
  };
};
const names = (list) => list.map((r) => clean(r.EmployeeName)).slice(0, 8).join(', ') + (list.length > 8 ? ` และอีก ${list.length - 8} คน` : '');

/** งานรอฝ่ายบุคคล + ปุ่มทำทีละหลายใบ */
function hrQueueHtml(q, cycle) {
  const due = cycle && String(cycle.EndDate || '').slice(0, 10);
  return `<div class="kpi-hrq">
    <h4 class="ap-sec">งานรอฝ่ายบุคคล</h4>
    <div class="kpi-hrq-grid">
      <div class="kpi-hrq-box"><b>${q.fc.length}</b><span>รอหัวหน้ากำหนดหัวข้อ</span>
        ${q.fc.length ? `<details><summary class="dim">ดูรายชื่อ</summary><div class="dim">${esc(names(q.fc))}</div></details>` : ''}</div>
      <div class="kpi-hrq-box${q.fcHr.length ? ' on' : ''}"><b>${q.fcHr.length}</b><span>รอฝ่ายบุคคลตรวจหัวข้อ</span>
        ${q.fcHr.length ? `<label class="dim">ประเมินตนเองภายใน <input type="date" id="kpi-bulkdue" value="${esc(due || '')}"></label>
          <button class="btn-mini" id="kpi-bulkfc">✓ อนุมัติหัวข้อทั้งหมด · เปิดประเมินตนเอง</button>` : ''}</div>
      <div class="kpi-hrq-box${q.mid.length ? ' on' : ''}"><b>${q.mid.length}</b><span>หัวหน้าประเมินแล้ว · รอส่งผู้บริหาร</span>
        ${q.mid.length ? '<button class="btn-mini" id="kpi-bulkmd">➜ ส่งให้ผู้บริหารประเมินทั้งหมด</button>' : ''}</div>
      <div class="kpi-hrq-box${q.final.length ? ' on' : ''}"><b>${q.final.length}</b><span>ผู้บริหารประเมินแล้ว · รอฝ่ายบุคคลลงนาม</span>
        ${q.final.length ? '<span class="dim">เปิดใบเพื่อลงนามทีละใบ (ใช้ลายเซ็น)</span>' : ''}</div>
    </div>
    <div class="dim">ตรวจทีละใบได้จากปุ่ม "เปิด" ในตาราง Tracker ด้านล่าง · ปุ่มทั้งหมดทำเฉพาะใบที่คุณมีสิทธิ์ตรวจ</div>
  </div>`;
}

export function kpiDashboardHtml(rows, { dir = [], cycle = null, hrCan = () => true } = {}) {
  const kpiRows = rows.filter((r) => sheetIsKpi(r));
  if (!kpiRows.length) return '';
  const dirByEmail = new Map(dir.map((p) => [low(p.Email), p]));
  const t = kpiRows.map((r) => trackOf(r, dirByEmail));
  const cut = cycle ? dir.filter((p) => p.IsActive !== false && clean(p.Email) && afterCutoff(p, cycle)) : [];

  // ความคืบหน้าแต่ละขั้น
  const prog = STEP_COLS.map(([k, label]) => {
    const c = { done: 0, now: 0, wait: 0, na: 0 };
    t.forEach((x) => { c[x.steps[k] || 'na'] += 1; });
    return { label, ...c };
  });
  // แยกตามฝ่าย
  const dept = {};
  t.forEach((x) => {
    const d = clean(x.r.Department) || '(ไม่ระบุฝ่าย)';
    const o = (dept[d] = dept[d] || { all: 0, done: 0, elig: 0, sum: 0, n: 0, mg: 0 });
    o.all += 1;
    if (x.steps.ack === 'done') o.done += 1;
    if (x.sum.eligible) o.elig += 1;
    if (x.sum.final !== null) { o.sum += x.sum.final; o.n += 1; }
    if (formOfRow(x.r) === 'MG') o.mg += 1;
  });
  // ตำแหน่ง (Position Master)
  const pos = {};
  t.forEach((x) => {
    const k = clean(x.p.Position) || '(ไม่ระบุตำแหน่ง)';
    const o = (pos[k] = pos[k] || { n: 0, form: new Set(), fc: 0, dept: new Set() });
    o.n += 1; o.form.add(formOfRow(x.r)); if (hasCustom(x.r)) o.fc += 1; if (clean(x.r.Department)) o.dept.add(clean(x.r.Department));
  });
  const issues = t.filter((x) => x.issues.some((i) => !/FC/.test(i)));
  const grades = {};
  t.forEach((x) => { if (x.sum.grade) grades[x.sum.grade] = (grades[x.sum.grade] || 0) + 1; });

  return `
  <div class="panel kpi-dash">
    <div class="panel-head">📊 Dashboard ประเมิน KPI ประจำปี
      <span class="panel-meta"><button class="btn-mini" id="kpi-csv">⬇ ส่งออก Tracker (CSV)</button></span></div>
    <div class="ap-stats">
      <div><b>${kpiRows.length}</b><span>ใบประเมิน KPI</span></div>
      <div><b>${t.filter((x) => formOfRow(x.r) === 'MG').length} / ${t.filter((x) => formOfRow(x.r) === 'GA').length}</b><span>แบบ MG / GA</span></div>
      <div><b>${cut.length}</b><span>ไม่ประเมิน (เริ่มงานหลังวันตัดรอบ)</span></div>
      <div><b>${t.filter((x) => x.steps.ack === 'done').length}</b><span>ปิดเคส (ลงนามรับทราบแล้ว)</span></div>
      <div><b>${t.filter((x) => x.sum.eligible).length}</b><span>ผ่านเกณฑ์พิจารณาโบนัส</span></div>
    </div>
    ${Object.keys(grades).length ? `<div class="kpi-grades">${['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'].filter((g) => grades[g])
      .map((g) => `<span><b>${g}</b> ${grades[g]} คน</span>`).join('')}</div>` : ''}

    ${hrQueueHtml(hrQueue(kpiRows, hrCan), cycle)}

    <h4 class="ap-sec">Progress Tracking</h4>
    <div class="kpi-scroll"><table class="ap-table">
      <thead><tr><th>ขั้นตอน</th><th class="num">ยังไม่เริ่ม</th><th class="num">กำลังดำเนินการ</th><th class="num">เสร็จสิ้น</th><th class="num">N/A</th></tr></thead>
      <tbody>${prog.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.wait}</td><td class="num">${s.now}</td><td class="num"><b>${s.done}</b></td><td class="num dim">${s.na}</td></tr>`).join('')}</tbody>
    </table></div>

    <h4 class="ap-sec">แยกตามฝ่าย</h4>
    <div class="kpi-scroll"><table class="ap-table">
      <thead><tr><th>ฝ่าย</th><th class="num">ใบประเมิน</th><th class="num">แบบ MG</th><th class="num">ปิดเคสแล้ว</th><th class="num">คะแนนเฉลี่ย</th><th class="num">ผ่านเกณฑ์โบนัส</th></tr></thead>
      <tbody>${Object.entries(dept).sort((a, b) => b[1].all - a[1].all).map(([d, o]) => `<tr>
        <td>${esc(d)}</td><td class="num">${o.all}</td><td class="num">${o.mg}</td><td class="num">${o.done}</td>
        <td class="num">${o.n ? (o.sum / o.n).toFixed(2) : '—'}</td><td class="num">${o.elig}</td></tr>`).join('')}</tbody>
    </table></div>

    <h4 class="ap-sec">ตรวจผู้บังคับบัญชา (Supervisor Mapping)</h4>
    ${issues.length ? `<div class="panel-note kpi-warn">ใบที่ต้องแก้ ${issues.length} ใบ — กำหนดผู้ประเมินได้ที่ จัดการข้อมูล → สร้างแบบประเมิน → ✎ แก้ไข (ตาราง "ผู้ประเมินและผู้อนุมัติของแต่ละใบ")</div>
      <details${issues.length <= 10 ? ' open' : ''}><summary class="dim">ดูรายชื่อ ${issues.length} ใบ</summary>
      <div class="kpi-scroll"><table class="ap-table"><thead><tr><th>ชื่อ</th><th>ฝ่าย</th><th>ผู้ประเมินปัจจุบัน</th><th>ปัญหา</th><th></th></tr></thead>
      <tbody>${issues.map((x) => `<tr><td>${esc(clean(x.r.EmployeeName))}</td><td>${esc(clean(x.r.Department))}</td>
        <td>${esc(clean(x.r.EvaluatorName)) || '—'}</td><td class="kpi-no-ok">${esc(x.issues.filter((i) => !/FC/.test(i)).join(' · '))}</td>
        <td class="num"><button class="btn-mini" data-apopen="${x.r.id}">เปิด</button></td></tr>`).join('')}</tbody></table></div></details>`
      : '<div class="panel-note">✓ ทุกใบมีผู้ประเมิน และไม่มีใครเป็นผู้ประเมินตัวเอง</div>'}

    <details class="kpi-posm"><summary class="ap-sec">ตำแหน่ง (Position Master) · ${Object.keys(pos).length} ตำแหน่ง</summary>
      <div class="kpi-scroll"><table class="ap-table"><thead><tr><th>ตำแหน่ง</th><th>ฝ่าย</th><th class="num">จำนวน</th><th>แบบ</th><th class="num">กำหนด FC แล้ว</th></tr></thead>
      <tbody>${Object.entries(pos).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr><td>${esc(k)}</td><td>${esc([...o.dept].join(', '))}</td>
        <td class="num">${o.n}</td><td>${[...o.form].join(' / ')}</td><td class="num">${o.fc} / ${o.n}</td></tr>`).join('')}</tbody></table></div>
    </details>

    <h4 class="ap-sec">Tracker รายบุคคล</h4>
    <div class="kpi-scroll"><table class="ap-table kpi-tracker">
      <thead><tr><th>ชื่อ-สกุล</th><th>ฝ่าย</th><th>ผู้บังคับบัญชา</th><th>แบบ</th>
        ${STEP_COLS.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}
        <th class="num">Skill<br>MS / MD</th><th class="num">Behavior<br>MS / MD</th><th class="num">Grade</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${t.map((x) => `<tr>
        <td>${esc(clean(x.r.EmployeeName))}${x.issues.length ? ` <span class="kpi-no-ok" title="${esc(x.issues.join(' · '))}">⚠</span>` : ''}</td>
        <td>${esc(clean(x.r.Department))}</td><td>${esc(clean(x.r.EvaluatorName)) || '—'}</td><td>${formOfRow(x.r)}</td>
        ${STEP_COLS.map(([k]) => `<td class="num" title="${STATE_TH[x.steps[k] || 'na']}">${mark(x.steps[k] || 'na')}</td>`).join('')}
        <td class="num">${x.sum.grades.skill.sup || '—'} / ${x.sum.grades.skill.md || '—'}</td>
        <td class="num">${x.sum.grades.behavior.sup || '—'} / ${x.sum.grades.behavior.md || '—'}</td>
        <td class="num"><b>${esc(x.sum.grade || '—')}</b></td>
        <td>${esc(kpiStatusLabel(x.r.Status, x.r))}</td>
        <td class="num"><button class="btn-mini" data-apopen="${x.r.id}">เปิด</button></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="panel-note">เกณฑ์พิจารณาโบนัส/ปรับเงินเดือน: Skill/Functional ≥ C+ และ Behavioral ≥ B ทั้งจากผู้บังคับบัญชาและผู้บริหาร ·
      ✓ เสร็จสิ้น · ● กำลังดำเนินการ · ○ ยังไม่เริ่ม · — ไม่มีขั้นนี้</div>
  </div>`;
}

export function bindKpiDashboard(rows, { dir = [], cycle = null, hrCan = () => true, by = '', rerender = null } = {}) {
  const b = $('#kpi-csv');
  if (!b) return;
  // ทำทีละหลายใบ
  const bulk = async (btn, list, what, fn) => {
    if (!list.length || !confirm(`${what} ${list.length} ใบ?\n${names(list)}`)) return;
    btn.disabled = true;
    const bad = [];
    let n = 0;
    for (const r of list) {
      // eslint-disable-next-line no-await-in-loop
      try { await fn(r); } catch (e) { bad.push(`${clean(r.EmployeeName)} — ${e.message}`); }
      n += 1; btn.textContent = `กำลังทำ ${n}/${list.length}…`;
    }
    alert(`เรียบร้อย ${list.length - bad.length} ใบ${bad.length ? `\n\nไม่สำเร็จ ${bad.length} ใบ\n${bad.slice(0, 10).join('\n')}` : ''}`);
    if (rerender) await rerender();
  };
  const q = hrQueue(rows, hrCan);
  const bf = $('#kpi-bulkfc');
  if (bf) bf.onclick = () => bulk(bf, q.fcHr, 'อนุมัติหัวข้อเฉพาะตำแหน่งและเปิดให้ประเมินตนเอง',
    (r) => approveCustom(r, { by, due: ($('#kpi-bulkdue') || {}).value || '' }));
  const bm = $('#kpi-bulkmd');
  if (bm) bm.onclick = () => bulk(bm, q.mid, 'ส่งให้ผู้บริหาร (MD) ประเมิน', (r) => hrToMd(r, { by }));
  b.onclick = () => {
    const dirByEmail = new Map(dir.map((p) => [low(p.Email), p]));
    const t = rows.filter((r) => sheetIsKpi(r)).map((r) => trackOf(r, dirByEmail));
    const keys = ['ชื่อ-สกุล', 'อีเมล', 'ฝ่าย', 'แผนก', 'ตำแหน่ง', 'แบบ', 'ผู้บังคับบัญชา', 'ผู้บริหาร (MD)',
      ...STEP_COLS.map(([, l]) => l), 'Grade (Skill MS)', 'Grade (Skill MD)', 'Grade (Behavior MS)', 'Grade (Behavior MD)',
      'คะแนนสุดท้าย', 'Grade', 'ผ่านเกณฑ์โบนัส', 'สถานะ', 'หมายเหตุ'];
    downloadText(`KPI-Tracker-${clean(cycle && cycle.Title) || 'ประจำปี'}.csv`, toCsv(keys, t.map((x) => ({
      'ชื่อ-สกุล': clean(x.r.EmployeeName), 'อีเมล': clean(x.r.EmployeeEmail), 'ฝ่าย': clean(x.r.Department),
      'แผนก': clean(x.r.Section), 'ตำแหน่ง': clean(x.p.Position), 'แบบ': formOfRow(x.r),
      'ผู้บังคับบัญชา': clean(x.r.EvaluatorName), 'ผู้บริหาร (MD)': clean((rolesOf(x.r).approver || {}).name) || 'กรรมการผู้จัดการ',
      ...Object.fromEntries(STEP_COLS.map(([k, l]) => [l, STATE_TH[x.steps[k] || 'na']])),
      'Grade (Skill MS)': x.sum.grades.skill.sup, 'Grade (Skill MD)': x.sum.grades.skill.md,
      'Grade (Behavior MS)': x.sum.grades.behavior.sup, 'Grade (Behavior MD)': x.sum.grades.behavior.md,
      'คะแนนสุดท้าย': x.sum.final ?? '', 'Grade': x.sum.grade,
      'ผ่านเกณฑ์โบนัส': x.sum.eligible === null ? '' : x.sum.eligible ? 'ผ่าน' : 'ไม่ผ่าน',
      'สถานะ': kpiStatusLabel(x.r.Status, x.r), 'หมายเหตุ': x.issues.join(' · '),
    }))));
  };
}
