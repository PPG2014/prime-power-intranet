import { esc, $, $$, onClick } from '../core/dom.js';
import { state, setState } from '../core/state.js';
import { list, clearDataCache } from '../services/data.js';
import { toCsv, downloadText } from '../utils/csv.js';
import {
  STAGES, DONE, activeCycle, openCycles, cycleOfSheet, criteria, scoreOf, sheets, mineOf, teamOf,
  answersOf, extraOf, logOf, stageOpen, gradeOf, clean, generateSheets, autoCreate, ROUND_DAYS,
  submitSelf, submitManager, hrReview, hrSign, executiveDecide, sendBack, acknowledge,
  signsOf, empSigned, hrSigned, needsEmpSign,
  S_SELF, S_MGR, S_HR, S_BOSS, S_ACK, isApproverLevel, appraisalTodo, noSelf,
  canHrReview, canBossApprove, inApproveScope, rolesOf,
} from '../services/appraisal.js';
import { signaturePad, bindSignaturePads, readSignature } from '../components/signature-pad.js';
import { isProbation, renderProbation } from '../templates/probation-fm-hrm-004.js';
import { openPRWindow } from '../templates/pr-fm-pur-004.js';
import { PROBATION_RUBRIC } from '../templates/probation-rubric.js';
import { rubricDrawer, bindRubricDrawer } from '../components/rubric-drawer.js';

export const meta = { route: 'appraisal', title: 'ประเมินผลบุคลากร', nav: true, order: 7, adminOnly: false };

let cycle = null;         // รอบหลักที่แสดงหัวหน้า (รอบที่เลือก หรือรอบเปิดรอบแรก)
let liveCycles = [];      // รอบที่แสดงในหน้านี้ — ทุกรอบที่เปิดอยู่ หรือเฉพาะรอบที่ฝ่ายบุคคลเลือกดู
const secsCache = {};
let secs = [];
let rows = [];
let me = null;          // แถวบุคลากรของผู้ใช้
let myEmail = '';
let scheme = 'มาตรฐาน';   // เกณฑ์เกรดของรอบนี้
let autoMade = 0;          // จำนวนใบที่ระบบเพิ่งสร้างให้เอง
let cycles = [];           // ทุกรอบ (ฝ่ายบุคคล/ผู้ดูแล ใช้เลือกดูย้อนหลัง)
let allCycles = [];        // ทุกรอบ ใช้เปิดใบประเมินเก่าของตัวเอง
let myHistory = [];        // ใบประเมินของฉันทุกรอบ (ดูย้อนหลัง)
let shownId = null;        // ใบที่แสดงเป็นหลักด้านบน (ทำเครื่องหมายในตารางประวัติ)

const TONE = {
  [STAGES[0]]: 'wait', [STAGES[1]]: 'mgr', [STAGES[2]]: 'hr',
  [STAGES[3]]: 'head', [STAGES[4]]: 'ack', [DONE]: 'done',
};
const dt = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
/** ชื่อสถานะที่แสดง · ขั้นฝ่ายบุคคลคือช่วงที่พนักงานกับฝ่ายบุคคลลงนามพร้อมกัน */
const LABEL = { [STAGES[2]]: 'พนักงานรับทราบ · ฝ่ายบุคคลตรวจสอบ', [STAGES[3]]: 'รอผู้บริหาร' };
const pill = (s) => `<span class="ap-pill ${TONE[clean(s)] || 'wait'}">${esc(LABEL[clean(s)] || clean(s) || '—')}</span>`;
const fix = (n) => (Number(n) || 0).toFixed(1);
/** คะแนนประเมินตนเอง · ใบที่ไม่มีขั้นประเมินตนเองแสดง — */
const selfFix = (r) => (noSelf(r) ? '—' : fix(r.SelfScore));
/** รอบของใบนี้ (ไม่พบใช้รอบหลัก) */
const cycleOf = (r) => cycleOfSheet(r, liveCycles) || cycleOfSheet(r, allCycles) || cycle;
/** หัวข้อประเมินของรอบ (จำไว้ ไม่โหลดซ้ำ) */
async function criteriaOf(c) {
  const k = clean(c && c.FormSet);
  if (!secsCache[k]) secsCache[k] = await criteria(k);
  return secsCache[k];
}
/** ตั้งรอบ/หัวข้อ/เกณฑ์เกรดให้ตรงกับใบที่กำลังเปิด */
async function focusCycle(r) {
  const c = cycleOf(r);
  if (!c) return;
  cycle = c;
  secs = await criteriaOf(c);
  scheme = isProbation(c.FormSet) ? 'ทดลองงาน' : 'มาตรฐาน';
}

/** ผู้ประเมินส่งผลแล้ว (เลยขั้นหัวหน้าประเมิน) */
const submitted = (r) => [STAGES[2], STAGES[3], STAGES[4], DONE].includes(clean(r && r.Status));
/** เกรดของใบ: ใช้ที่บันทึกไว้ ถ้ายังไม่มี (ขั้นตอนใหม่บันทึกตอนผู้บริหารอนุมัติ) คิดจากคะแนนผู้ประเมิน */
function gradeText(r) {
  if (clean(r.Grade)) return clean(r.Grade);
  const score = +r.FinalScore || +r.MgrScore || 0;
  if (!submitted(r) || !score) return '—';
  return gradeOf(score, isProbation(clean(r.FormSet) || clean(cycle && cycle.FormSet)) ? 'ทดลองงาน' : 'มาตรฐาน')[1];
}

/** ผู้บริหารที่อนุมัติผลได้: ผู้ดูแลระบบ หรือระดับผู้จัดการฝ่ายขึ้นไป */
function canApprove() {
  return state.isAdmin || isApproverLevel(me?.Level);
}
/** ตัวตนของผู้ใช้สำหรับเช็กสิทธิ์รายใบ (ผู้ตรวจ HR / ผู้อนุมัติที่กำหนดไว้ในใบ) */
const who = () => ({ email: myEmail, person: me, isAdmin: state.isAdmin, isHR: state.isHR });

export async function render(ctx) {
  myEmail = String(state.user?.email || '').toLowerCase();
  // เปิดหน้านี้ทุกครั้งดึงรอบและใบประเมินล่าสุด — รอบที่เพิ่งสร้างขึ้นทันทีไม่ต้องรีเฟรช
  clearDataCache('appraisalCycles');
  clearDataCache('appraisals');
  const dir = await list('directory').catch(() => []);
  me = dir.find((p) => clean(p.Email).toLowerCase() === myEmail) || null;

  // ฝ่ายบุคคล/ผู้ดูแลเลือกดูรอบเก่าได้ · รอบที่ปิดแล้วระบบล็อกทุกขั้น จึงเป็นการดูอย่างเดียว
  const canBrowse = state.isHR || state.isAdmin;
  cycles = canBrowse ? (await list('appraisalCycles').catch(() => []))
    .slice().sort((a, b) => String(b.StartDate || b.Created || '').localeCompare(String(a.StartDate || a.Created || ''))
      || (+b.id || 0) - (+a.id || 0)) : [];
  const picked = canBrowse && state.apCycleId
    ? cycles.find((c) => String(c.id) === String(state.apCycleId)) : null;
  // ไม่ได้เลือกรอบ → แสดงทุกรอบที่เปิดอยู่พร้อมกัน (เช่น ทดลองงานครั้งที่ 1 และครั้งที่ 2 ของคนละคน)
  liveCycles = picked ? [picked] : await openCycles();
  cycle = picked || liveCycles[0] || await activeCycle();
  if (cycle && !liveCycles.length) liveCycles = [cycle];
  secs = await criteriaOf(cycle);
  scheme = isProbation(cycle?.FormSet) ? 'ทดลองงาน' : 'มาตรฐาน';
  const titles = new Set(liveCycles.map((c) => clean(c.Title)));
  const loadRows = async () => (await sheets('')).filter((r) => titles.has(clean(r.CycleName)));
  rows = await loadRows();

  // สร้างใบประเมินที่ยังขาดให้เอง ไม่ต้องรอผู้ดูแลกดปุ่มทุกครั้ง
  // (สร้างเฉพาะใบของตัวเอง — ใบของคนอื่นสร้างตอนบันทึกแบบประเมิน หรือกดปุ่มในแท็บภาพรวม)
  let made = 0;
  for (const c of liveCycles) {
    // eslint-disable-next-line no-await-in-loop
    try { made += await autoCreate(c, { isAdmin: false, email: myEmail }); } catch (e) { /* ข้ามได้ */ }
  }
  if (made) { autoMade = made; rows = await loadRows(); }

  // ใบของฉันที่แสดงเป็นหลัก: ใบที่รอฉันทำก่อน · ไม่มีก็ใบล่าสุด
  const myRows = rows.filter((r) => clean(r.EmployeeEmail).toLowerCase() === myEmail)
    .sort((a, b) => (+b.id || 0) - (+a.id || 0));
  const mineMain = myRows.find((r) => needsEmpSign(r)
    || (clean(r.Status) === S_SELF && !noSelf(r) && stageOpen(cycleOf(r), S_SELF).ok)) || myRows[0] || null;

  // ประวัติการประเมินของฉันทุกรอบ รวมรอบที่แสดงอยู่ด้านบน — เปิดดูและดาวน์โหลดเอกสารย้อนหลังได้ตลอด
  allCycles = await list('appraisalCycles').catch(() => []);
  shownId = mineMain ? mineMain.id : null;
  myHistory = (await sheets('')).filter((r) => clean(r.EmployeeEmail).toLowerCase() === myEmail)
    .sort((a, b) => String(b.Created || '').localeCompare(String(a.Created || '')) || (+b.id || 0) - (+a.id || 0));

  const mine = mineMain;
  if (mine) await focusCycle(mine);
  const team = teamOf(rows, myEmail);
  const tab = state.apTab || 'me';

  // ตัวเลขเตือนบนแถบ: ใบที่รอฉันทำในแต่ละแถบ (นับแบบเดียวกับตัวเลขบนเมนู)
  const todo = appraisalTodo({
    cycles: liveCycles, rows, email: myEmail, person: me, isAdmin: state.isAdmin, isHR: state.isHR,
  });

  const tabs = [
    ['me', 'การประเมินของฉัน', true],
    ['team', `ทีมของฉัน${team.length ? ` (${team.length})` : ''}`, team.length > 0],
    // เห็นแท็บเมื่อเป็นผู้บริหารตามระดับ หรือถูกกำหนดเป็นผู้ตรวจ/ผู้อนุมัติในใบใดใบหนึ่ง
    ['approve', 'อนุมัติผล', canApprove() || rows.some((r) => {
      const ro = rolesOf(r);
      return [ro.hr, ro.approver].some((x) => x && clean(x.email).toLowerCase() === myEmail);
    })],
    ['all', 'ภาพรวมทั้งองค์กร', state.isHR],
  ].filter(([, , show]) => show);

  const body = {
    me: () => paneMe(mine),
    team: () => paneTeam(team),
    approve: () => paneApprove(),
    all: () => paneAll(),
  }[tabs.some((t) => t[0] === tab) ? tab : 'me']();

  return `
  <section class="page page-appraisal">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">${liveCycles.length > 1
        ? `รอบที่เปิดอยู่ ${liveCycles.length} รอบ: ${liveCycles.map((c) => `<b>${esc(clean(c.Title))}</b> (${esc(clean(c.Round) || clean(c.Stage) || '')})`).join(' · ')}`
        : cycle
        ? `รอบ <b>${esc(clean(cycle.Title))}</b>${cycle.FormSet ? ` · แบบประเมิน: ${esc(clean(cycle.FormSet))}` : ''}
           · ขั้นตอนที่เปิดอยู่: ${esc(clean(cycle.Stage) || S_SELF)}
           · สถานะรอบ: ${esc(clean(cycle.Status) || '—')}`
        : 'ยังไม่ได้เปิดรอบประเมิน'}</p>

      ${cycles.length > 1 ? `<label class="ap-cycle">ดูรอบ
        <select id="ap-cycle"><option value="" ${state.apCycleId ? '' : 'selected'}>ทุกรอบที่เปิดอยู่</option>${cycles.map((c) => `<option value="${esc(c.id)}" ${state.apCycleId && String(c.id) === String(state.apCycleId) ? 'selected' : ''}>${
          esc(clean(c.Title))} · ${esc(clean(c.Status) || '—')}${c.IsActive === false ? ' (ซ่อน)' : ''}</option>`).join('')}</select>
        ${cycle && clean(cycle.Status) !== 'เปิด' ? '<span class="dim">ดูข้อมูลย้อนหลัง (แก้ไขไม่ได้ · ส่งออกเอกสารได้)</span>' : ''}
      </label>` : ''}

      <div class="chips">
        ${tabs.map(([k, label]) => `<button class="chip" data-aptab="${k}"
          aria-pressed="${tab === k}">${esc(label)}${todo[k]
            ? `<span class="nav-badge" title="รอคุณดำเนินการ ${todo[k]} ใบ">${todo[k]}</span>` : ''}</button>`).join('')}
      </div>

      ${autoMade ? `<div class="panel-note ap-auto">✓ ระบบสร้างใบประเมินให้อัตโนมัติ ${autoMade} ใบ</div>` : ''}

      ${cycle ? '' : `<div class="panel"><div class="empty">
        ยังไม่มีรอบประเมินที่เปิดใช้งาน${state.isHR
          ? '<br><span class="dim">เปิดรอบใหม่ได้ที่ จัดการข้อมูล → สร้างแบบประเมิน</span>' : ''}
      </div></div>`}

      ${body}
    </div>
    ${isProbation(cycle?.FormSet) ? rubricDrawer(PROBATION_RUBRIC, 'เกณฑ์การให้คะแนนการประเมินทดลองงาน') : ''}
  </section>`;
}

/* ───────── การประเมินของฉัน ───────── */
function paneMe(mine) {
  return paneMeCurrent(mine) + historyPanel();
}

/** ประวัติการประเมินของฉันในรอบก่อน ๆ พร้อมเปิดดู/ดาวน์โหลดเอกสาร */
function historyPanel() {
  if (!myHistory.length) return '';
  return `
    <div class="panel">
      <div class="panel-head">📚 ประวัติการประเมินของฉัน
        <span class="panel-meta">${myHistory.length} รอบ · เปิดดูและดาวน์โหลดเอกสารได้ตลอด</span></div>
      <table class="ap-table">
        <thead><tr><th>แบบประเมิน</th><th>สถานะ</th><th class="num">คะแนน</th><th>เกรด</th><th></th></tr></thead>
        <tbody>${myHistory.map((r) => `<tr>
          <td>${esc(clean(r.CycleName))}${r.id === shownId ? ' <span class="dim">· แสดงด้านบน</span>' : ''}</td>
          <td>${pill(r.Status)}</td>
          <td class="num">${submitted(r) ? fix(r.FinalScore || r.MgrScore) : '—'}</td>
          <td>${esc(gradeText(r))}</td>
          <td class="num"><button class="btn-mini" data-aphopen="${r.id}">📄 เปิดดู</button>
            ${isProbation(clean(r.FormSet)) && submitted(r) ? `<button class="btn-mini" data-aphexport="${r.id}">⭳ เอกสาร</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function paneMeCurrent(mine) {
  if (!cycle) return '';
  if (!mine) {
    return `<div class="panel"><div class="empty">ยังไม่มีใบประเมินของคุณในรอบนี้
      ${state.isHR ? '<br><span class="dim">กดสร้างใบประเมินได้ที่แท็บ ภาพรวมทั้งองค์กร</span>'
        : '<br><span class="dim">แจ้งฝ่ายทรัพยากรบุคคลเพื่อสร้างใบประเมิน</span>'}</div></div>`;
  }

  const st = clean(mine.Status);
  const self = answersOf(mine, 'self');
  const mgr = answersOf(mine, 'mgr');
  const g = stageOpen(cycleOf(mine), S_SELF);
  const skip = noSelf(mine);     // รอบที่หัวหน้าประเมินอย่างเดียว ไม่มีแบบประเมินตนเอง
  const editable = !skip && st === S_SELF && g.ok;

  return `
    <div class="ap-stats">
      <div><b>${pill(st)}</b><span>สถานะของฉัน</span></div>
      ${skip ? '' : `<div><b>${fix(mine.SelfScore)}</b><span>คะแนนประเมินตนเอง</span></div>`}
      <div><b>${fix(mine.MgrScore)}</b><span>คะแนนจากหัวหน้า</span></div>
      <div><b>${esc(gradeText(mine))}</b><span>เกรดสรุป</span></div>
    </div>

    ${submitted(mine) && !needsEmpSign(mine) ? `<div class="ap-docbar">
      <button class="btn-mini" data-apopen="${mine.id}">📄 เปิดดูใบประเมิน</button>
      ${isProbation(cycleOf(mine)?.FormSet) ? `<button class="btn-mini" data-apexport="${mine.id}">⭳ ดาวน์โหลดเอกสาร</button>` : ''}
    </div>` : ''}

    ${needsEmpSign(mine) ? `<div class="panel ap-ack">
      <h3>ผลการประเมินรอบนี้</h3>
      <p>คะแนน <b>${fix(mine.FinalScore || mine.MgrScore)}</b> · เกรด <b>${esc(gradeText(mine))}</b>
        ${mine.HeadComment ? `<br>ความเห็นผู้บริหาร: ${esc(mine.HeadComment)}` : ''}</p>
      <p class="dim">กดปุ่มด้านล่างเพื่อเปิดใบประเมิน ลงลายเซ็นรับทราบ และดาวน์โหลดเอกสารได้</p>
      <button class="btn btn-primary" data-apopen="${mine.id}">✍ เปิดใบเพื่อลงนามรับทราบ</button>
    </div>` : ''}

    ${statusTrack(mine)}

    ${editable ? '' : `<div class="panel-note ap-note">${skip
      ? 'รอบนี้หัวหน้าเป็นผู้ประเมิน ไม่ต้องประเมินตนเอง · ติดตามสถานะได้จากแถบด้านบน'
      : st === S_SELF
        ? esc(g.why || 'ยังไม่เปิดให้กรอกในขณะนี้')
        : 'ส่งแบบประเมินตนเองแล้ว ดูคะแนนที่กรอกไว้ด้านล่าง'}</div>`}

    ${skip ? '' : formTable('self', self, editable, mine, mgr)}

    ${logBox(mine)}`;
}

/* ───────── ทีมของฉัน ───────── */
function paneTeam(team) {
  if (!cycle) return '';
  // แต่ละใบอาจอยู่คนละรอบ — ดูว่ารอบของใบนั้นเปิดขั้นหัวหน้าประเมินหรือยัง
  const gOf = (r) => stageOpen(cycleOf(r), S_MGR);
  const open = team.filter((r) => clean(r.Status) === S_MGR);
  const blocked = [...new Set(team.filter((r) => clean(r.Status) === S_MGR && !gOf(r).ok).map((r) => gOf(r).why))];

  return `
    <div class="panel">
      <div class="panel-head">ลูกทีมที่ต้องประเมิน
        <span class="panel-meta">${open.length} / ${team.length} รายการรอดำเนินการ</span></div>
      ${blocked.map((w) => `<div class="panel-note">${esc(w)}</div>`).join('')}
      ${team.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>แผนก</th><th>สถานะ</th><th class="num">ตนเอง</th><th class="num">หัวหน้า</th><th></th></tr></thead>
        <tbody>${team.map((r) => `<tr>
          <td>${esc(clean(r.EmployeeName))}${liveCycles.length > 1 ? `<div class="dim">${esc(clean(r.CycleName))}</div>` : ''}</td>
          <td>${esc(clean(r.Section) || clean(r.Department))}</td>
          <td>${pill(r.Status)}${clean(r.Status) === S_SELF && !noSelf(r)
            ? '<div class="ap-wait">รอพนักงานประเมินตนเองก่อน</div>' : ''}</td>
          <td class="num">${selfFix(r)}</td>
          <td class="num">${fix(r.MgrScore)}</td>
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">${
            clean(r.Status) === S_MGR && gOf(r).ok ? 'ประเมิน' : 'ดูรายละเอียด'}</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty">ยังไม่มีลูกทีมในรอบนี้</div>'}
    </div>`;
}

/* ───────── อนุมัติผล ───────── */
function paneApprove() {
  if (!cycle) return '';
  const g = stageOpen(cycle, S_BOSS);
  // ใบที่กำหนดผู้อนุมัติ/ผู้ตรวจไว้ เห็นเฉพาะคนนั้น · ไม่ได้กำหนด ใช้ผู้จัดการฝ่ายของฝ่ายนั้น
  const mine = (r) => inApproveScope(r, who());
  const wait = rows.filter((r) => [S_HR, S_BOSS].includes(clean(r.Status))).filter(mine);
  const done = rows.filter((r) => [S_ACK, DONE].includes(clean(r.Status))).filter(mine);

  return `
    <div class="panel">
      <div class="panel-head">รอการอนุมัติผล
        <span class="panel-meta">${wait.length} รายการ</span></div>
      ${g.ok ? '' : `<div class="panel-note">${esc(g.why)}</div>`}
      ${wait.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>ฝ่าย</th><th class="num">ตนเอง</th><th class="num">หัวหน้า</th><th class="num">เกรด</th><th></th></tr></thead>
        <tbody>${wait.map((r) => {
          const gr = gradeOf(+r.MgrScore || 0, scheme);
          return `<tr>
            <td>${esc(clean(r.EmployeeName))}</td>
            <td>${esc(clean(r.Department))}</td>
            <td class="num">${selfFix(r)}</td>
            <td class="num">${fix(r.MgrScore)}</td>
            <td class="num">${esc(gr[1])}</td>
            <td class="num"><button class="btn-mini" data-apopen="${r.id}">พิจารณา</button></td>
          </tr>`;
        }).join('')}</tbody></table>`
        : '<div class="empty">ไม่มีรายการรออนุมัติ</div>'}
    </div>

    <div class="panel">
      <div class="panel-head">ใบที่ผ่านการอนุมัติแล้ว
        <span class="panel-meta">เปิดดูผลและลายเซ็นทุกฝ่ายได้ตลอด</span></div>
      ${done.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>ฝ่าย</th><th>สถานะ</th><th class="num">สรุป</th><th>เกรด</th><th></th></tr></thead>
        <tbody>${done.map((r) => `<tr>
          <td>${esc(clean(r.EmployeeName))}</td>
          <td>${esc(clean(r.Department))}</td>
          <td>${pill(r.Status)}</td>
          <td class="num">${fix(r.FinalScore)}</td>
          <td>${esc(clean(r.Grade))}</td>
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">เปิด</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty">ยังไม่มีใบที่อนุมัติแล้ว</div>'}
    </div>`;
}

/* ───────── ภาพรวมทั้งองค์กร (ผู้ดูแลระบบ) ───────── */
function paneAll() {
  if (!cycle) return '';
  const byStatus = {};
  rows.forEach((r) => { const s = clean(r.Status); byStatus[s] = (byStatus[s] || 0) + 1; });
  const done = byStatus[DONE] || 0;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  const byDept = {};
  rows.forEach((r) => {
    const d = clean(r.Department) || 'ไม่ระบุ';
    byDept[d] = byDept[d] || { all: 0, done: 0, sum: 0, scored: 0 };
    byDept[d].all += 1;
    if (clean(r.Status) === DONE) byDept[d].done += 1;
    if (+r.FinalScore) { byDept[d].sum += +r.FinalScore; byDept[d].scored += 1; }
  });

  return `
    <div class="ap-stats">
      <div><b>${rows.length}</b><span>ใบประเมินทั้งหมด</span></div>
      <div><b>${pct}%</b><span>เสร็จสมบูรณ์</span></div>
      ${[S_SELF, S_MGR, S_HR, S_BOSS, S_ACK].map((s) =>
        `<div><b>${byStatus[s] || 0}</b><span>${esc(s)}</span></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head">ความคืบหน้าตามฝ่าย
        <span class="panel-meta">
          <button class="btn-mini" id="ap-csv">⭳ ส่งออก CSV</button>
          <button class="btn-mini" id="ap-gen" title="ปกติระบบสร้างให้เองเมื่อเปิดหน้านี้ ปุ่มนี้ใช้เมื่อเพิ่งเพิ่มพนักงานใหม่">↻ ตรวจและสร้างใบที่ยังขาด</button>
        </span></div>
      <table class="ap-table">
        <thead><tr><th>ฝ่าย</th><th class="num">ทั้งหมด</th><th class="num">เสร็จแล้ว</th><th class="num">คะแนนเฉลี่ย</th></tr></thead>
        <tbody>${Object.entries(byDept).sort((a, b) => b[1].all - a[1].all).map(([d, v]) => `<tr>
          <td>${esc(d)}</td><td class="num">${v.all}</td><td class="num">${v.done}</td>
          <td class="num">${v.scored ? (v.sum / v.scored).toFixed(1) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="panel">
      <div class="panel-head">ใบประเมินทั้งหมดในรอบนี้</div>
      ${rows.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>ฝ่าย</th><th>ผู้ประเมิน</th><th>สถานะ</th><th class="num">สรุป</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(clean(r.EmployeeName))}</td>
          <td>${esc(clean(r.Department))}</td>
          <td>${esc(clean(r.EvaluatorName))}</td>
          <td>${pill(r.Status)}</td>
          <td class="num">${fix(r.FinalScore || r.MgrScore || r.SelfScore)}</td>
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">เปิด</button>${isProbation(cycleOf(r)?.FormSet)
            ? ` <button class="btn-mini" data-apexport="${r.id}" title="ส่งออกเอกสาร (พิมพ์ให้เซ็น)">⭳</button>` : ''}</td>
        </tr>`).join('')}</tbody></table>
        <div class="panel-note">กรอกข้อมูลการทดลองงานและวันขาด ลา มาสาย ได้ที่ จัดการข้อมูล → สร้างแบบประเมิน → ✎ แก้ไข</div>`
        : '<div class="empty">ยังไม่มีใบประเมินในรอบนี้</div>'}
    </div>`;
}

/* ───────── ตารางให้คะแนน ───────── */
function formTable(who, answers, editable, row, otherAnswers = null) {
  if (!secs.length) {
    // บอกให้ชัดว่าหาไม่เจอเพราะชุดไหน จะได้ไม่ต้องเดา
    return `<div class="panel"><div class="empty">
      ยังไม่มีหัวข้อประเมินของชุด <b>${esc(clean(cycle?.FormSet) || '(ไม่ได้ระบุชุด)')}</b>
      ${state.isHR ? `<br><span class="dim">ไปที่ จัดการข้อมูล → หัวข้อประเมิน
        แล้วเพิ่มหัวข้อที่ช่อง "ชุดแบบประเมิน" ตรงกับชื่อนี้เป๊ะ</span>` : ''}</div></div>`;
  }
  const s = scoreOf(secs, answers);
  return `
    <div class="panel ap-form" data-who="${who}">
      <div class="panel-head">แบบประเมิน${who === 'self' ? 'ตนเอง' : 'โดยหัวหน้า'}
        <span class="panel-meta">ให้คะแนน 1–${secs[0]?.items[0]?.scale || 5}
          (${secs[0]?.items[0]?.scale === 10 ? '10 = ดีมาก, 1 = ไม่ดี' : '5 = ดีเยี่ยม, 1 = ต้องปรับปรุง'})</span></div>

      ${secs.map((sec) => `
        <h4 class="ap-sec">${esc(sec.name)}${sec.weight ? ` <span class="dim">น้ำหนัก ${sec.weight}%</span>` : ''}</h4>
        <table class="ap-table ap-score">
          <tbody>${sec.items.map((it) => `<tr>
            <td>${esc(it.title)}<br><span class="dim">น้ำหนัก ${it.weight}%</span></td>
            ${otherAnswers ? `<td class="num dim">${otherAnswers[it.id] ? `หัวหน้า ${otherAnswers[it.id]}` : ''}</td>` : ''}
            <td class="ap-scale">${Array.from({ length: it.scale || 5 }, (_, i) => (it.scale || 5) - i).map((v) => `
              <label><input type="radio" name="q_${it.id}" value="${v}"
                ${+answers[it.id] === v ? 'checked' : ''} ${editable ? '' : 'disabled'}> ${v}</label>`).join('')}</td>
          </tr>
          <tr class="ap-noterow"><td colspan="${otherAnswers ? 3 : 2}">
            <input class="ap-itemnote" data-note="${it.id}" placeholder="ความคิดเห็นเพิ่มเติมของหัวข้อนี้ (ไม่บังคับ)"
              value="${esc(answers[it.id + '__note'] || '')}" ${editable ? '' : 'disabled'}>
          </td></tr>`).join('')}</tbody>
        </table>`).join('')}

      <label class="ap-comment">ความเห็นเพิ่มเติม / ผลงานเด่น
        <textarea id="ap-comment" rows="3" ${editable ? '' : 'disabled'}>${
  esc(who === 'self' ? (row.SelfComment || '') : (row.MgrComment || ''))}</textarea></label>

      <div class="ap-total">คะแนนรวมถ่วงน้ำหนัก <b id="ap-score">${fix(s.score)}</b> / 100
        · เกรด <b id="ap-grade">${esc(gradeOf(s.score, scheme)[1])}</b>
        <span class="dim" id="ap-left">${s.complete ? 'ให้คะแนนครบแล้ว' : 'ยังให้คะแนนไม่ครบทุกข้อ'}</span></div>

      ${editable ? `<div class="ap-actions">
        <button class="btn btn-primary" id="ap-submit">ส่งแบบประเมิน</button>
      </div>` : ''}
    </div>`;
}

/**
 * แถบสถานะทุกขั้นตอน พร้อมชื่อและวันเวลาที่ทำ
 * ดูจากลายเซ็นในใบเป็นหลัก (ถูกล้างเมื่อส่งกลับให้แก้) ขั้นที่กำลังรอจะขึ้น "กำลังดำเนินการ"
 */
function statusTrack(row) {
  const hist = logOf(row);
  const at = (re) => (hist.filter((l) => re.test(l.action)).slice(-1)[0] || {});
  const st = clean(row.Status);
  const sg = signsOf(row);
  const fromSign = (x) => (x && x.at ? { by: x.name, at: x.at } : {});
  const steps = [
    ...(noSelf(row) ? [] : [{ label: 'พนักงานประเมินตนเอง', now: st === S_SELF,
      done: st === S_SELF ? {} : at(/ส่งแบบประเมินตนเอง/) }]),
    { label: 'ผู้ประเมินให้คะแนนและลงนาม', now: st === S_MGR,
      done: st === S_MGR ? {} : fromSign(sg.evaluator) },
    { label: 'พนักงานรับทราบและลงนาม', now: needsEmpSign(row), done: fromSign(sg.employee) },
    { label: 'ฝ่ายบุคคลตรวจสอบและลงนาม', now: st === S_HR && !hrSigned(row), done: fromSign(sg.hr) },
    { label: 'ฝ่ายบุคคลส่งให้ผู้บริหาร', now: st === S_HR && empSigned(row) && hrSigned(row),
      done: [S_BOSS, S_ACK, DONE].includes(st) ? at(/ส่งให้ผู้บริหาร/) : {} },
    { label: 'ผู้บริหารรับทราบ / อนุมัติ', now: st === S_BOSS, done: fromSign(sg.approver) },
  ];
  return `<div class="ap-track">
    ${steps.map((x) => {
    const state = x.now ? 'now' : (x.done.at ? 'ok' : (st === DONE ? 'ok' : 'wait'));
    return `<div class="ap-step ${state}">
        <div class="ap-step-dot">${state === 'ok' ? '✓' : ''}</div>
        <div class="ap-step-body">
          <b>${esc(x.label)}</b>
          <span>${x.done.at && !x.now ? `${esc(x.done.by || '')} · ${esc(dt(x.done.at))}`
    : (x.now ? 'กำลังดำเนินการ' : (state === 'ok' ? 'เรียบร้อย' : 'รอดำเนินการ'))}</span>
        </div>
      </div>`;
  }).join('')}
  </div>`;
}

/** ช่องลงนาม 1 ช่อง (แสดงของเดิม และให้เซ็นใหม่ถ้าเป็นคิวของคนนั้น) */
function signBlock(title, data = {}, role, editable, extraHtml = '') {
  return `<div class="ap-signbox">
    <div class="ap-signhead">${esc(title)}${data.at ? `<span class="dim"> · ${esc(dt(data.at))}</span>` : ''}</div>
    ${extraHtml}
    <label>ชื่อผู้ลงนาม<input type="text" id="sg-${role}-name"
      value="${esc(data.name || '')}" ${editable ? '' : 'disabled'}></label>
    <label>บันทึกเพิ่มเติม<textarea id="sg-${role}-note" rows="2"
      ${editable ? '' : 'disabled'}>${esc(data.note || '')}</textarea></label>
    ${signaturePad(role, data.url || '', editable)}
  </div>`;
}

function logBox(row) {
  const items = logOf(row);
  if (!items.length) return '';
  return `<div class="panel">
    <div class="panel-head">ประวัติการดำเนินการ</div>
    <ul class="ap-log">${items.slice().reverse().map((l) => `<li>
      <b>${esc(l.action)}</b> · ${esc(l.by || '')}
      <span class="dim">${esc(new Date(l.at).toLocaleString('th-TH'))}</span>
      ${l.note ? `<div class="dim">${esc(l.note)}</div>` : ''}
    </li>`).join('')}</ul></div>`;
}

/** แถบสรุปข้อมูลที่ฝ่ายบุคคลกรอก (วันเริ่มงาน กำหนดประเมิน วันขาด ลา มาสาย) ให้ผู้ประเมินเห็นทันทีที่เปิดใบ */
function attendanceBar(row) {
  const x = extraOf(row);
  const a = x.attendance || {};
  const dmy = (v) => (v ? new Date(v).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '—');
  const dates = x.startDate || (x.rounds || []).some((r) => r.date)
    ? `<div class="ap-attbar">
        <span><i>วันเริ่มงาน</i> <b>${esc(dmy(x.startDate))}</b></span>
        ${(x.rounds || []).map((r) => `<span><i>${esc(r.label)}</i> <b>${esc(dmy(r.date))}</b></span>`).join('')}
      </div>` : '';
  const has = ['late', 'absent', 'personal', 'sick', 'other'].some((k) => String(a[k] ?? '').trim());
  if (!has) return `${dates}<div class="panel-note">ฝ่ายทรัพยากรบุคคลยังไม่ได้กรอกข้อมูลขาด ลา มาสาย</div>`;
  return `${dates}<div class="ap-attbar">
    ${[['late', 'มาสาย', 'ครั้ง'], ['absent', 'ขาดงาน', 'วัน'], ['personal', 'ลากิจ', 'วัน'],
    ['sick', 'ลาป่วย', 'วัน'], ['other', 'ลาอื่นๆ', 'วัน']].map(([k, label, unit]) => `
      <span><b>${esc(String(a[k] || 0))}</b> ${esc(label)} <i>${esc(unit)}</i></span>`).join('')}
  </div>`;
}

const ROUND_DEFS = ROUND_DAYS;

/** แบบไม่มีลายเซ็น: เอารูปลายเซ็นและวันที่ออก คงชื่อไว้ให้รู้ว่าใครต้องเซ็น */
const stripSigns = (keep, sign) => (keep ? sign : Object.fromEntries(Object.entries(sign)
  .map(([k, v]) => [k, { ...v, sig: '', date: '' }])));


/** เลือกว่าจะส่งออกพร้อมลายเซ็น หรือเว้นช่องไว้ให้เซ็นด้วยปากกา · ยกเลิกคืน null */
function pickSignMode() {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'eta-mask';
    layer.innerHTML = `
      <div class="eta-box" role="dialog" aria-modal="true" aria-labelledby="sm-title">
        <div class="eta-head" id="sm-title">⭳ ส่งออกผลการประเมิน</div>
        <div class="eta-body">
          <label class="pp-item"><input type="radio" name="sm" value="with" checked>
            <span><b>พร้อมลายเซ็น</b> · ใส่ลายเซ็นและวันที่ที่ลงนามในระบบ</span></label>
          <label class="pp-item"><input type="radio" name="sm" value="without">
            <span><b>ไม่มีลายเซ็น</b> · เว้นช่องลายเซ็นและวันที่ไว้ให้เซ็นด้วยปากกา</span></label>
          <p class="pp-hint">คะแนนในเอกสารเป็นคะแนนที่ผู้ประเมินส่งแล้ว แก้ไขไม่ได้ทั้งสองแบบ</p>
        </div>
        <div class="eta-foot">
          <button type="button" class="btn-mini" data-sm="0">ยกเลิก</button>
          <button type="button" class="btn btn-primary" data-sm="1">ส่งออก</button>
        </div>
      </div>`;
    const done = (v) => { layer.remove(); removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    layer.querySelector('[data-sm="0"]').onclick = () => done(null);
    layer.querySelector('[data-sm="1"]').onclick = () =>
      done(layer.querySelector('input[name=sm]:checked').value === 'with');
    addEventListener('keydown', onKey, true);
    document.body.appendChild(layer);
    layer.querySelector('[data-sm="1"]').focus();
  });
}

/** ส่งออกเอกสารตามแบบฟอร์ม FM-HRM-004 (ถามก่อนว่าพร้อมลายเซ็นหรือไม่) */
async function exportProbation(row, useSecs = null) {
  const withSign = await pickSignMode();
  if (withSign === null) return;
  useSecs = useSecs || await criteriaOf(cycleOf(row));
  const dir = await list('directory').catch(() => []);
  const person = dir.find((d) => clean(d.Email).toLowerCase() === clean(row.EmployeeEmail).toLowerCase()) || {};
  const sigOf = (name) => (dir.find((d) => clean(d.Title) === clean(name)) || {}).SignatureUrl || '';
  const x = extraOf(row);
  const ans = Object.keys(answersOf(row, 'mgr')).length ? answersOf(row, 'mgr') : answersOf(row, 'self');
  const total = +row.FinalScore || +row.MgrScore || +row.SelfScore || 0;
  const hist = logOf(row);
  const at = (act) => (hist.filter((l) => l.action.includes(act)).slice(-1)[0] || {}).at || '';

  const html = renderProbation({
    employee: {
      name: clean(row.EmployeeName), position: clean(person.Position),
      section: clean(row.Section), department: clean(row.Department),
      startDate: x.startDate || person.StartDate || '',
    },
    rounds: (x.rounds && x.rounds.length ? x.rounds
      : ROUND_DEFS.map((r) => ({ label: r.label, date: '' }))),
    sections: useSecs, answers: ans,
    notes: Object.fromEntries(Object.entries(ans)
      .filter(([k]) => k.endsWith('__note')).map(([k, v]) => [k.replace('__note', ''), v])),
    total: total ? total.toFixed(1) : '', grade: clean(row.Grade) || gradeOf(total, 'ทดลองงาน')[1],
    attendance: x.attendance || {}, summary: x.summary || {},
    sign: stripSigns(withSign, {
      evaluator: {
        name: (x.sign?.evaluator?.name) || clean(row.EvaluatorName),
        date: (x.sign?.evaluator?.at) || at('ผู้ประเมิน'),
        sig: (x.sign?.evaluator?.url) || sigOf(row.EvaluatorName),
      },
      hr: {
        name: (x.sign?.hr?.name) || '',
        date: (x.sign?.hr?.at) || at('ฝ่ายบุคคล'),
        sig: (x.sign?.hr?.url) || '',
      },
      employee: {
        name: (x.sign?.employee?.name) || clean(row.EmployeeName),
        date: (x.sign?.employee?.at) || row.AckDate || '',
        sig: (x.sign?.employee?.url) || '',
        note: (x.sign?.employee?.note) || '',
      },
      approver: {
        name: (x.sign?.approver?.name) || '',
        date: (x.sign?.approver?.at) || at('ผู้บริหาร'),
        sig: (x.sign?.approver?.url) || '',
        approved: x.sign?.approver?.approved,
      },
    }),
  });

  openPRWindow(html, `แบบประเมินผลระหว่างทดลองงาน — ${clean(row.EmployeeName)}`);
}

/* ───────── เหตุการณ์ ───────── */
/**
 * อัปเดตเองเมื่อข้อมูลเปลี่ยน (มีรอบใหม่ ใบใหม่ หรือสถานะเปลี่ยน) โดยไม่ต้องกดรีเฟรช
 * เช็กทุก 60 วินาที และทุกครั้งที่กลับมาที่แท็บนี้ · ไม่วาดใหม่ระหว่างเปิดหน้าต่างใบประเมินค้างไว้
 */
let watchTimer = null;
let watchCheck = null;
let watchBound = false;
const sigOf = (cs, ss) => JSON.stringify([
  cs.map((c) => [c.id, clean(c.Status), clean(c.Stage), clean(c.Title)]),
  ss.map((r) => [r.id, clean(r.Status), r.Modified || '']),
]);
let lastSig = '';
function startWatch() {
  if (watchTimer) return;
  const check = async () => {
    if (state.route !== 'appraisal') { clearInterval(watchTimer); watchTimer = null; return; }
    if (document.hidden || document.querySelector('#overlay-root .mask, .eta-mask')) return;
    clearDataCache('appraisalCycles'); clearDataCache('appraisals');
    const [cs, ss] = await Promise.all([list('appraisalCycles').catch(() => []), list('appraisals').catch(() => [])]);
    const sig = sigOf(cs, ss);
    if (lastSig && sig !== lastSig) {
      const { render: r } = await import('../core/render.js');
      r();
    }
    lastSig = sig;
  };
  watchTimer = setInterval(check, 60000);
  watchCheck = check;
  if (!watchBound) {
    watchBound = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && watchTimer && watchCheck) watchCheck(); });
  }
  check();
}

export function mount(ctx) {
  startWatch();
  onClick('aptab', (k) => setState({ apTab: k }));
  bindRubricDrawer();

  const rerender = async () => {
    const { render: r } = await import('../core/render.js');
    r();
  };

  // คิดคะแนนสดขณะเลือก
  const recalc = () => {
    const box = $('.ap-form');
    if (!box) return;
    const ans = {};
    $$('input[type=radio]:checked', box).forEach((el) => {
      ans[el.name.replace('q_', '')] = +el.value;
    });
    $$('[data-note]', box).forEach((el) => {
      if (el.value.trim()) ans[el.dataset.note + '__note'] = el.value.trim();
    });
    const s = scoreOf(secs, ans);
    $('#ap-score').textContent = fix(s.score);
    $('#ap-grade').textContent = gradeOf(s.score, scheme)[1];
    $('#ap-left').textContent = s.complete ? 'ให้คะแนนครบแล้ว' : 'ยังให้คะแนนไม่ครบทุกข้อ';
    return { ans, s };
  };
  $$('.ap-form input[type=radio]').forEach((el) => { el.onchange = recalc; });

  // ส่งแบบประเมินตนเอง
  const submit = $('#ap-submit');
  if (submit) {
    submit.onclick = async () => {
      const { ans, s } = recalc();
      if (!s.complete && !confirm('ยังให้คะแนนไม่ครบทุกข้อ ต้องการส่งเลยหรือไม่?')) return;
      const mine = mineOf(rows, myEmail);
      submit.disabled = true;
      try {
        await submitSelf(mine, ans, $('#ap-comment').value.trim(),
          s.score, state.user?.name || '');
        await rerender();
      } catch (e) { submit.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  // เปิดใบประเมินของลูกทีม / รายการรออนุมัติ
  onClick('apopen', (id) => openSheet(rows.find((r) => String(r.id) === String(id)), rerender));
  onClick('apexport', (id) => { const r = rows.find((x) => String(x.id) === String(id)); if (r) exportProbation(r); });
  // ใบของรอบเก่า: ใช้หัวข้อประเมินและสถานะของรอบนั้นชั่วคราว (รอบที่ปิดแล้วเปิดดูอย่างเดียว)
  const withCycleOf = async (r, fn) => {
    const c = allCycles.find((x) => clean(x.Title) === clean(r.CycleName))
      || { Title: clean(r.CycleName), FormSet: clean(r.FormSet), Status: 'ปิด' };
    const saved = { cycle, secs, scheme };
    cycle = c;
    secs = await criteria(clean(c.FormSet) || clean(r.FormSet));
    scheme = isProbation(clean(c.FormSet) || clean(r.FormSet)) ? 'ทดลองงาน' : 'มาตรฐาน';
    try { await fn(); } finally { ({ cycle, secs, scheme } = saved); }
  };
  const hist = (id) => myHistory.find((x) => String(x.id) === String(id));
  onClick('aphopen', (id) => { const r = hist(id); if (r) withCycleOf(r, () => openSheet(r, rerender)); });
  onClick('aphexport', (id) => { const r = hist(id); if (r) withCycleOf(r, () => exportProbation(r)); });
  const cyc = $('#ap-cycle');
  if (cyc) cyc.onchange = () => setState({ apCycleId: cyc.value });

  // ผู้ดูแล: สร้างใบประเมิน + ส่งออก CSV
  const gen = $('#ap-gen');
  if (gen) {
    gen.onclick = async () => {
      const targets = liveCycles.filter((c) => clean(c.Status) === 'เปิด');
      if (!targets.length) { alert('รอบนี้ปิดแล้ว สร้างใบเพิ่มไม่ได้'); return; }
      if (!confirm(`สร้างใบประเมินรอบ ${targets.map((c) => `"${clean(c.Title)}"`).join(', ')} ให้บุคลากรที่ยังไม่มีใบ?`)) return;
      gen.disabled = true;
      const res = { created: 0, skipped: 0, noManager: 0, failed: [] };
      for (const c of targets) {
        // eslint-disable-next-line no-await-in-loop
        const one = await generateSheets(c, (d, t) => { gen.textContent = `${clean(c.Title)} · กำลังสร้าง ${d}/${t}…`; });
        res.created += one.created || 0; res.skipped += one.skipped || 0;
        res.noManager += one.noManager || 0; res.failed.push(...(one.failed || []));
      }
      alert(`สร้างแล้ว ${res.created} ใบ · มีอยู่เดิม ${res.skipped} ใบ`
        + (res.noManager ? `\nมี ${res.noManager} คนที่ยังไม่ได้กำหนดผู้บังคับบัญชา จะไม่มีผู้ประเมิน` : '')
        + (res.failed.length ? `\n\nสร้างไม่สำเร็จ ${res.failed.length} ใบ\n${res.failed.slice(0, 10).join('\n')}` : ''));
      await rerender();
    };
  }
  const csv = $('#ap-csv');
  if (csv) {
    csv.onclick = () => {
      const keys = ['รอบ', 'ชื่อ', 'ฝ่าย', 'แผนก', 'ผู้ประเมิน', 'สถานะ', 'คะแนนตนเอง', 'คะแนนหัวหน้า', 'คะแนนสรุป', 'เกรด'];
      downloadText(`ผลประเมิน-${clean(cycle.Title)}.csv`, toCsv(keys, rows.map((r) => ({
        'รอบ': clean(r.CycleName), 'ชื่อ': clean(r.EmployeeName), 'ฝ่าย': clean(r.Department),
        'แผนก': clean(r.Section), 'ผู้ประเมิน': clean(r.EvaluatorName), 'สถานะ': clean(r.Status),
        'คะแนนตนเอง': r.SelfScore || '', 'คะแนนหัวหน้า': r.MgrScore || '',
        'คะแนนสรุป': r.FinalScore || '', 'เกรด': clean(r.Grade),
      }))));
    };
  }
}

/* ───────── หน้าต่างประเมินลูกทีม / อนุมัติผล ───────── */
async function openSheet(row, rerender) {
  if (!row) return;
  await focusCycle(row);        // ใบของรอบไหน ใช้ขั้นตอนและหัวข้อของรอบนั้น
  const { openModal } = await import('../components/modal.js');
  const st = clean(row.Status);
  const x = extraOf(row);
  const sg = x.sign || {};
  const sum = x.summary || {};

  const isMgrTurn = st === S_MGR && stageOpen(cycle, S_MGR).ok
    && clean(row.EvaluatorEmail).toLowerCase() === myEmail;
  const isHrTurn = st === S_HR && canHrReview(row, who());
  const isBossTurn = st === S_BOSS && canBossApprove(row, who());
  // พนักงานลงนามรับทราบได้ทันทีที่หัวหน้าประเมินเสร็จ พร้อมกับฝ่ายบุคคล
  const isEmpTurn = needsEmpSign(row) && clean(row.EmployeeEmail).toLowerCase() === myEmail;
  const readyForBoss = !!(sg.evaluator && sg.evaluator.at) && empSigned(row);

  const selfAns = answersOf(row, 'self');
  const mgrAns = answersOf(row, 'mgr');
  const editable = isMgrTurn;
  const answers = editable ? mgrAns : (Object.keys(mgrAns).length ? mgrAns : selfAns);
  const score = scoreOf(secs, answers);

  // ผลสรุปมีชุดเดียว ผู้ประเมินกรอกในขั้นของตน ฝ่ายบุคคลแก้ไขได้ทุกขั้น
  const sumEdit = isMgrTurn || state.isHR;
  const resultOpt = (v, label) => `<label><input type="radio" name="sum-result" value="${v}"
    ${sum.result === v ? 'checked' : ''} ${sumEdit ? '' : 'disabled'}> ${label}</label>`;

  openModal({
    title: `${clean(row.EmployeeName)} · ${clean(row.Department)}`,
    wide: true,
    body: `
      <div class="ap-stats small">
        <div><b>${pill(st)}</b><span>สถานะ</span></div>
        ${noSelf(row) ? '' : `<div><b>${fix(row.SelfScore)}</b><span>ตนเอง</span></div>`}
        <div><b>${fix(row.MgrScore)}</b><span>ผู้ประเมิน</span></div>
        <div><b>${esc(gradeText(row))}</b><span>เกรด</span></div>
      </div>

      ${statusTrack(row)}
      ${isEmpTurn ? `<div class="panel ap-empack" id="ap-empack">
        <div class="panel-head">✍ ลงนามรับทราบผลการประเมิน</div>
        <p>คะแนน <b>${fix(row.FinalScore || row.MgrScore)}</b> · เกรด <b>${esc(row.Grade
          || gradeOf(+row.FinalScore || +row.MgrScore || 0, scheme)[1])}</b>
          ${row.HeadComment ? `<br>ความเห็นผู้บริหาร: ${esc(row.HeadComment)}` : ''}</p>
        <p class="dim">อ่านผลการประเมินด้านล่างได้ แล้วลากเมาส์/นิ้วเซ็นในกรอบ หรือกด "อัปโหลดรูป"
          ${me && me.SignatureUrl ? '· ถ้าไม่เซ็นใหม่ ระบบใช้ลายเซ็นในทะเบียนบุคลากร' : ''}</p>
        <label>ชื่อผู้ลงนาม<input type="text" id="sg-employee-name" value="${esc((me && me.Title) || state.user?.name || '')}"></label>
        <label>ความเห็นของฉัน (ถ้ามี)<textarea id="emp-note" rows="2"></textarea></label>
        ${signaturePad('employee', (me && me.SignatureUrl) || '', true)}
        <div class="ap-actions"><button class="btn btn-primary" id="ap-emp-ack2">✓ ลงนามรับทราบ</button></div>
      </div>` : ''}
      ${isProbation(cycle?.FormSet) ? attendanceBar(row) : ''}
      ${row.SelfComment ? `<div class="panel-note">ความเห็นพนักงาน: ${esc(row.SelfComment)}</div>` : ''}
      ${formTable('mgr', answers, editable, row, editable ? selfAns : null)}

      <div class="panel ap-summary">
        <div class="panel-head">สรุปผลการประเมินและลงนาม</div>
        <div class="ap-sum">
          ${resultOpt('บรรจุ', 'เห็นควรบรรจุ')}
          ${resultOpt('ต่อทดลองงาน', 'ทดลองงานต่อ 30 วัน')}
          ${resultOpt('ไม่ผ่าน', 'ไม่ผ่านทดลองงาน (เลิกจ้าง)')}
          ${resultOpt('อื่นๆ', 'อื่นๆ')}
        </div>
        <div class="ap-sum2">
          <label>วันที่มีผล (กรณีบรรจุหรือไม่ผ่าน)
            <input type="date" id="sum-date" value="${esc(sum.confirmDate || sum.lastDate || '')}"
              ${sumEdit ? '' : 'disabled'}></label>
          <label>รายละเอียดอื่นๆ
            <input type="text" id="sum-other" value="${esc(sum.other || '')}" ${sumEdit ? '' : 'disabled'}></label>
        </div>

        <div class="ap-signs">
          ${signBlock('4.1 ผู้ประเมิน', sg.evaluator, 'evaluator', isMgrTurn)}
          ${isEmpTurn ? `<div class="ap-signbox"><div class="ap-signhead">ผู้ถูกประเมินรับทราบ</div>
            <div class="dim">ลงนามได้ที่กล่อง "ลงนามรับทราบผลการประเมิน" ด้านบน</div></div>`
    : signBlock('ผู้ถูกประเมินรับทราบ', sg.employee, 'employee', false,
      sg.employee && sg.employee.at ? `<div class="dim">ลงนามรับทราบแล้ว</div>` : '')}
          ${signBlock('4.2 ฝ่ายทรัพยากรมนุษย์', sg.hr, 'hr', isHrTurn)}
          ${signBlock('4.3 ผู้บริหาร (ลงนามหรือไม่ก็ได้)', sg.approver, 'approver', isBossTurn, isBossTurn
    ? `<div class="ap-sum"><label><input type="radio" name="boss-ok" value="1" checked> อนุมัติ</label>
         <label><input type="radio" name="boss-ok" value="0"> ไม่อนุมัติ</label></div>
       <div class="dim">คะแนนสรุป <b>${fix(row.MgrScore)}</b> · ตามที่ผู้ประเมินส่ง (แก้ไขไม่ได้)</div>`
    : (sg.approver && sg.approver.approved !== undefined
      ? `<div class="dim">ผล: ${sg.approver.approved ? 'อนุมัติ' : 'ไม่อนุมัติ'}</div>` : ''))}
        </div>

      </div>

      ${logBox(row)}`,
    footer: `${(isMgrTurn && !noSelf(row)) || isHrTurn || isBossTurn
      ? '<button class="btn-mini warn" id="ap-back">↩ ส่งกลับให้แก้ไข</button>' : ''}
      ${isProbation(cycle?.FormSet) ? '<button class="btn-mini" id="ap-export">⭳ ส่งออกเอกสาร (พิมพ์ให้เซ็น)</button>' : ''}
      ${state.isHR && !isMgrTurn && !isHrTurn ? '<button class="btn-mini" id="ap-hr-save">💾 บันทึกผลสรุป (HR)</button>' : ''}
      <button class="btn-mini" id="ap-close">ปิด</button>
      ${isMgrTurn ? '<button class="btn btn-primary" id="ap-mgr-save">บันทึกและส่งให้พนักงานรับทราบ / ฝ่ายบุคคล</button>' : ''}
      ${isHrTurn ? `<button class="btn-mini" id="ap-hr-sign">💾 บันทึกลายเซ็นฝ่ายบุคคล</button>
                    <button class="btn btn-primary" id="ap-hr-send" ${readyForBoss ? ''
    : 'disabled title="รอพนักงานลงนามรับทราบก่อน"'}>ส่งให้ผู้บริหาร</button>` : ''}
      ${isBossTurn ? '<button class="btn btn-primary" id="ap-approve">บันทึกผล</button>' : ''}
      ${isEmpTurn ? '<button class="btn btn-primary" id="ap-emp-ack">✓ ลงนามรับทราบ</button>' : ''}`,
  });

  bindSignaturePads();

  const readSummary = () => ({
    result: ($$('input[name=sum-result]:checked')[0] || {}).value || '',
    confirmDate: $('#sum-date') ? $('#sum-date').value : '',
    lastDate: $('#sum-date') ? $('#sum-date').value : '',
    other: $('#sum-other') ? $('#sum-other').value : '',
  });
  const signOf = async (role) => ({
    name: $(`#sg-${role}-name`) ? $(`#sg-${role}-name`).value.trim() : '',
    note: $(`#sg-${role}-note`) ? $(`#sg-${role}-note`).value.trim() : '',
    url: await readSignature(role) || ((extraOf(row).sign || {})[role] || {}).url || '',
  });

  const recalc = () => {
    const ans = {};
    $$('.ap-form input[type=radio]:checked').forEach((el) => { ans[el.name.replace('q_', '')] = +el.value; });
    $$('.ap-form [data-note]').forEach((el) => {
      if (el.value.trim()) ans[el.dataset.note + '__note'] = el.value.trim();
    });
    const sc = scoreOf(secs, ans);
    $('#ap-score').textContent = fix(sc.score);
    $('#ap-grade').textContent = gradeOf(sc.score, scheme)[1];
    return { ans, sc };
  };
  $$('.ap-form input[type=radio]').forEach((el) => { el.onchange = recalc; });

  const close = () => { $('#overlay-root').innerHTML = ''; };
  $('#ap-close').onclick = close;

  const back = $('#ap-back');
  if (back) {
    back.onclick = async () => {
      const note = prompt('เหตุผลที่ส่งกลับให้แก้ไข');
      if (note === null) return;
      await sendBack(row, isBossTurn || isHrTurn ? S_MGR : S_SELF, note, state.user?.name || '');
      close(); await rerender();
    };
  }

  const hrSave = $('#ap-hr-save');
  if (hrSave) {
    hrSave.onclick = async () => {
      hrSave.disabled = true;
      try {
        const { update } = await import('../services/data.js');
        await update('appraisals', row.id, { Extra: JSON.stringify({ ...extraOf(row), summary: readSummary() }) });
        close(); await rerender();
      } catch (e) { hrSave.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  const ex = $('#ap-export');
  const openSecs = secs;        // ใบของรอบเก่าใช้หัวข้อของรอบนั้น แม้ปิดหน้าต่างไปแล้ว
  if (ex) ex.onclick = () => exportProbation(row, openSecs);

  const saveMgr = $('#ap-mgr-save');
  if (saveMgr) {
    saveMgr.onclick = async () => {
      const { ans, sc } = recalc();
      if (!sc.complete && !confirm('ยังให้คะแนนไม่ครบทุกข้อ ต้องการบันทึกเลยหรือไม่?')) return;
      saveMgr.disabled = true;
      try {
        const extra = { ...extraOf(row), summary: readSummary() };
        await submitManager(row, ans, $('#ap-comment').value.trim(), sc.score,
          state.user?.name || '', extra, await signOf('evaluator'));
        close(); await rerender();
      } catch (e) { saveMgr.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  const hrSignNow = async () => {
    const sign = await signOf('hr');
    if (!sign.name && !sign.url) throw new Error('กรอกชื่อผู้ลงนามหรือเซ็นในช่องฝ่ายทรัพยากรมนุษย์ก่อน');
    return sign;
  };
  const hrSave2 = $('#ap-hr-sign');
  if (hrSave2) {
    hrSave2.onclick = async () => {
      hrSave2.disabled = true;
      try {
        await hrSign(row, { sign: await hrSignNow(), by: state.user?.name || '', summary: readSummary() });
        close(); await rerender();
      } catch (e) { hrSave2.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }
  const hrSend = $('#ap-hr-send');
  if (hrSend) {
    hrSend.onclick = async () => {
      hrSend.disabled = true;
      try {
        await hrReview(row, { sign: await hrSignNow(), by: state.user?.name || '', summary: readSummary() });
        close(); await rerender();
      } catch (e) { hrSend.disabled = false; alert('ส่งไม่สำเร็จ — ' + e.message); }
    };
  }

  const ok = $('#ap-approve');
  if (ok) {
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const approved = ($$('input[name=boss-ok]:checked')[0] || {}).value !== '0';
        await executiveDecide(row, {
          // คะแนนล็อกตั้งแต่ผู้ประเมินส่ง — ผู้บริหารอนุมัติตามคะแนนของผู้ประเมิน
          approved, finalScore: +row.MgrScore || 0,
          sign: await signOf('approver'), by: state.user?.name || '',
          note: $('#sg-approver-note') ? $('#sg-approver-note').value.trim() : '', scheme,
        });
        close(); await rerender();
      } catch (e) { ok.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  // ลงนามรับทราบ: ต้องมีลายเซ็น (วาด/อัปโหลดใหม่ หรือลายเซ็นในทะเบียน) · ปุ่มท้ายหน้าต่างกับปุ่มในกล่องทำงานเหมือนกัน
  const ackBtns = ['#ap-emp-ack', '#ap-emp-ack2'].map((id) => $(id)).filter(Boolean);
  const doAck = async () => {
    ackBtns.forEach((b) => { b.disabled = true; });
    try {
      const sig = await readSignature('employee') || (me && me.SignatureUrl) || '';
      if (!sig) {
        ackBtns.forEach((b) => { b.disabled = false; });
        const box = $('#ap-empack');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        alert('กรุณาลงลายเซ็นก่อนกดรับทราบ — ลากเมาส์เซ็นในกรอบ หรือกด "อัปโหลดรูป"');
        return;
      }
      const name = ($('#sg-employee-name') && $('#sg-employee-name').value.trim()) || state.user?.name || '';
      await acknowledge(row, $('#emp-note') ? $('#emp-note').value.trim() : '', name, sig);
      close(); await rerender();
    } catch (e) { ackBtns.forEach((b) => { b.disabled = false; }); alert('บันทึกไม่สำเร็จ — ' + e.message); }
  };
  ackBtns.forEach((b) => { b.onclick = doAck; });
  // เปิดมาเพื่อลงนาม: เลื่อนไปที่กล่องลงนามให้เห็นทันที
  const ackBox = $('#ap-empack');
  if (ackBox) setTimeout(() => ackBox.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}
