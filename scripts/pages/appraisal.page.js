import { esc, $, $$, onClick } from '../core/dom.js';
import { state, setState } from '../core/state.js';
import { list } from '../services/data.js';
import { toCsv, downloadText } from '../utils/csv.js';
import {
  STAGES, DONE, activeCycle, criteria, scoreOf, sheets, mineOf, teamOf,
  answersOf, extraOf, logOf, stageOpen, gradeOf, clean, generateSheets, autoCreate, ROUND_DAYS,
  submitSelf, submitManager, hrReview, executiveDecide, sendBack, acknowledge,
  S_SELF, S_MGR, S_HR, S_BOSS, S_ACK,
} from '../services/appraisal.js';
import { signaturePad, bindSignaturePads, readSignature } from '../components/signature-pad.js';
import { isProbation, renderProbation } from '../templates/probation-fm-hrm-004.js';
import { openPRWindow } from '../templates/pr-fm-pur-004.js';
import { PROBATION_RUBRIC } from '../templates/probation-rubric.js';
import { rubricDrawer, bindRubricDrawer } from '../components/rubric-drawer.js';

export const meta = { route: 'appraisal', title: 'ประเมินผลบุคลากร', nav: true, order: 7, adminOnly: false };

let cycle = null;
let secs = [];
let rows = [];
let me = null;          // แถวบุคลากรของผู้ใช้
let myEmail = '';
let scheme = 'มาตรฐาน';   // เกณฑ์เกรดของรอบนี้
let autoMade = 0;          // จำนวนใบที่ระบบเพิ่งสร้างให้เอง

const TONE = {
  [STAGES[0]]: 'wait', [STAGES[1]]: 'mgr', [STAGES[2]]: 'hr',
  [STAGES[3]]: 'head', [STAGES[4]]: 'ack', [DONE]: 'done',
};
const dt = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const pill = (s) => `<span class="ap-pill ${TONE[clean(s)] || 'wait'}">${esc(clean(s) || '—')}</span>`;
const fix = (n) => (Number(n) || 0).toFixed(1);

/** ผู้บริหารที่อนุมัติผลได้: ผู้ดูแลระบบ หรือระดับผู้จัดการฝ่ายขึ้นไป */
function canApprove() {
  if (state.isAdmin) return true;
  const lv = String(me?.Level || '');
  return /ผู้อำนวยการ|ผู้บริหารสูงสุด|ผู้จัดการฝ่าย|รองผู้บริหาร/.test(lv);
}

export async function render(ctx) {
  myEmail = String(state.user?.email || '').toLowerCase();
  const dir = await list('directory').catch(() => []);
  me = dir.find((p) => clean(p.Email).toLowerCase() === myEmail) || null;

  cycle = await activeCycle();
  secs = await criteria(clean(cycle?.FormSet));
  scheme = isProbation(cycle?.FormSet) ? 'ทดลองงาน' : 'มาตรฐาน';
  rows = cycle ? await sheets(clean(cycle.Title)) : [];

  // สร้างใบประเมินที่ยังขาดให้เอง ไม่ต้องรอผู้ดูแลกดปุ่มทุกครั้ง
  if (cycle) {
    try {
      // สร้างเฉพาะใบของตัวเอง — ใบของคนอื่นสร้างตอนบันทึกแบบประเมิน หรือกดปุ่มในแท็บภาพรวม
      // (เดิมผู้ดูแลเปิดหน้านี้ทีไรระบบไล่สร้างให้ทุกคน ทำให้ช้าและเสี่ยงได้ใบซ้ำเมื่อเปิดพร้อมกัน)
      const made = await autoCreate(cycle, { isAdmin: false, email: myEmail });
      if (made) { autoMade = made; rows = await sheets(clean(cycle.Title)); }
    } catch (e) { /* สร้างไม่ได้ก็ใช้งานส่วนอื่นต่อได้ */ }
  }

  const mine = mineOf(rows, myEmail);
  const team = teamOf(rows, myEmail);
  const tab = state.apTab || 'me';

  const tabs = [
    ['me', 'การประเมินของฉัน', true],
    ['team', `ทีมของฉัน${team.length ? ` (${team.length})` : ''}`, team.length > 0],
    ['approve', 'อนุมัติผล', canApprove()],
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
      <p class="page-lead">${cycle
        ? `รอบ <b>${esc(clean(cycle.Title))}</b>${cycle.FormSet ? ` · แบบประเมิน: ${esc(clean(cycle.FormSet))}` : ''}
           · ขั้นตอนที่เปิดอยู่: ${esc(clean(cycle.Stage) || S_SELF)}
           · สถานะรอบ: ${esc(clean(cycle.Status) || '—')}`
        : 'ยังไม่ได้เปิดรอบประเมิน'}</p>

      <div class="chips">
        ${tabs.map(([k, label]) => `<button class="chip" data-aptab="${k}"
          aria-pressed="${tab === k}">${esc(label)}</button>`).join('')}
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
  if (!cycle) return '';
  if (!mine) {
    return `<div class="panel"><div class="empty">ยังไม่มีใบประเมินของคุณในรอบนี้
      ${state.isHR ? '<br><span class="dim">กดสร้างใบประเมินได้ที่แท็บ ภาพรวมทั้งองค์กร</span>'
        : '<br><span class="dim">แจ้งฝ่ายทรัพยากรบุคคลเพื่อสร้างใบประเมิน</span>'}</div></div>`;
  }

  const st = clean(mine.Status);
  const self = answersOf(mine, 'self');
  const mgr = answersOf(mine, 'mgr');
  const g = stageOpen(cycle, S_SELF);
  const editable = st === S_SELF && g.ok;

  return `
    <div class="ap-stats">
      <div><b>${pill(st)}</b><span>สถานะของฉัน</span></div>
      <div><b>${fix(mine.SelfScore)}</b><span>คะแนนประเมินตนเอง</span></div>
      <div><b>${fix(mine.MgrScore)}</b><span>คะแนนจากหัวหน้า</span></div>
      <div><b>${mine.Grade ? esc(mine.Grade) : '—'}</b><span>เกรดสรุป</span></div>
    </div>

    ${st === S_ACK ? `<div class="panel ap-ack">
      <h3>ผลการประเมินรอบนี้</h3>
      <p>คะแนนสรุป <b>${fix(mine.FinalScore)}</b> · เกรด <b>${esc(mine.Grade || '')}</b>
        ${mine.HeadComment ? `<br>ความเห็นผู้บริหาร: ${esc(mine.HeadComment)}` : ''}</p>
      <p class="dim">กดปุ่มด้านล่างเพื่อเปิดใบประเมิน ลงลายเซ็นรับทราบ และดาวน์โหลดเอกสารได้</p>
      <button class="btn btn-primary" data-apopen="${mine.id}">✍ เปิดใบเพื่อลงนามรับทราบ</button>
    </div>` : ''}

    ${statusTrack(mine)}

    ${editable ? '' : `<div class="panel-note ap-note">${st === S_SELF
      ? esc(g.why || 'ยังไม่เปิดให้กรอกในขณะนี้')
      : 'ส่งแบบประเมินตนเองแล้ว ดูคะแนนที่กรอกไว้ด้านล่าง'}</div>`}

    ${formTable('self', self, editable, mine, mgr)}

    ${logBox(mine)}`;
}

/* ───────── ทีมของฉัน ───────── */
function paneTeam(team) {
  if (!cycle) return '';
  const g = stageOpen(cycle, S_MGR);
  const open = team.filter((r) => clean(r.Status) === S_MGR);

  return `
    <div class="panel">
      <div class="panel-head">ลูกทีมที่ต้องประเมิน
        <span class="panel-meta">${open.length} / ${team.length} รายการรอดำเนินการ</span></div>
      ${g.ok ? '' : `<div class="panel-note">${esc(g.why)}</div>`}
      ${team.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>แผนก</th><th>สถานะ</th><th class="num">ตนเอง</th><th class="num">หัวหน้า</th><th></th></tr></thead>
        <tbody>${team.map((r) => `<tr>
          <td>${esc(clean(r.EmployeeName))}</td>
          <td>${esc(clean(r.Section) || clean(r.Department))}</td>
          <td>${pill(r.Status)}</td>
          <td class="num">${fix(r.SelfScore)}</td>
          <td class="num">${fix(r.MgrScore)}</td>
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">${
            clean(r.Status) === S_MGR && g.ok ? 'ประเมิน' : 'ดูรายละเอียด'}</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty">ยังไม่มีลูกทีมในรอบนี้</div>'}
    </div>`;
}

/* ───────── อนุมัติผล ───────── */
function paneApprove() {
  if (!cycle) return '';
  const g = stageOpen(cycle, S_BOSS);
  const mine = (r) => state.isAdmin || clean(r.Department) === clean(me?.Department);
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
            <td class="num">${fix(r.SelfScore)}</td>
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
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">เปิด</button></td>
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

/** แถบสถานะทุกขั้นตอน พร้อมวันเวลาที่ทำ */
function statusTrack(row) {
  const hist = logOf(row);
  const at = (re) => (hist.filter((l) => re.test(l.action)).slice(-1)[0] || {});
  const st = clean(row.Status);
  const order = [...STAGES, DONE];
  const steps = [
    { name: S_SELF, label: 'พนักงานประเมินตนเอง', done: at(/ส่งแบบประเมินตนเอง/) },
    { name: S_MGR, label: 'ผู้ประเมินให้คะแนนและลงนาม', done: at(/ผู้ประเมินสรุปผล|หัวหน้าประเมิน/) },
    { name: S_HR, label: 'ฝ่ายบุคคลตรวจสอบ', done: at(/ฝ่ายบุคคลตรวจสอบ/) },
    { name: S_BOSS, label: 'ผู้บริหารอนุมัติ', done: at(/ผู้บริหาร/) },
    { name: S_ACK, label: 'พนักงานรับทราบผล', done: at(/รับทราบ/) },
  ];
  const curIdx = order.indexOf(st);
  return `<div class="ap-track">
    ${steps.map((x) => {
    const idx = order.indexOf(x.name);
    const state = x.done.at ? 'ok' : (st === x.name ? 'now' : (curIdx > idx ? 'ok' : 'wait'));
    return `<div class="ap-step ${state}">
        <div class="ap-step-dot">${state === 'ok' ? '✓' : ''}</div>
        <div class="ap-step-body">
          <b>${esc(x.label)}</b>
          <span>${x.done.at ? `${esc(x.done.by || '')} · ${esc(dt(x.done.at))}`
    : (st === x.name ? 'กำลังดำเนินการ' : 'รอดำเนินการ')}</span>
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


/** ส่งออกเอกสารตามแบบฟอร์ม FM-HRM-004 */
async function exportProbation(row) {
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
    sections: secs, answers: ans,
    notes: Object.fromEntries(Object.entries(ans)
      .filter(([k]) => k.endsWith('__note')).map(([k, v]) => [k.replace('__note', ''), v])),
    total: total ? total.toFixed(1) : '', grade: clean(row.Grade) || gradeOf(total, 'ทดลองงาน')[1],
    attendance: x.attendance || {}, summary: x.summary || {},
    sign: {
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
    },
  });

  openPRWindow(html, `แบบประเมินผลระหว่างทดลองงาน — ${clean(row.EmployeeName)}`);
}

/* ───────── เหตุการณ์ ───────── */
export function mount(ctx) {
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

  // ผู้ดูแล: สร้างใบประเมิน + ส่งออก CSV
  const gen = $('#ap-gen');
  if (gen) {
    gen.onclick = async () => {
      if (!confirm(`สร้างใบประเมินรอบ "${clean(cycle.Title)}" ให้บุคลากรที่ยังไม่มีใบ?`)) return;
      gen.disabled = true;
      const res = await generateSheets(cycle, (d, t) => { gen.textContent = `กำลังสร้าง ${d}/${t}…`; });
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
  const { openModal } = await import('../components/modal.js');
  const st = clean(row.Status);
  const x = extraOf(row);
  const sg = x.sign || {};
  const sum = x.summary || {};

  const isMgrTurn = st === S_MGR && stageOpen(cycle, S_MGR).ok
    && clean(row.EvaluatorEmail).toLowerCase() === myEmail;
  const isHrTurn = st === S_HR && state.isHR;
  const isBossTurn = st === S_BOSS && canApprove();
  const isEmpTurn = st === S_ACK && clean(row.EmployeeEmail).toLowerCase() === myEmail;

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
        <div><b>${fix(row.SelfScore)}</b><span>ตนเอง</span></div>
        <div><b>${fix(row.MgrScore)}</b><span>ผู้ประเมิน</span></div>
        <div><b>${row.Grade ? esc(row.Grade) : '—'}</b><span>เกรด</span></div>
      </div>

      ${statusTrack(row)}
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
          ${signBlock('4.2 ฝ่ายทรัพยากรมนุษย์', sg.hr, 'hr', isHrTurn)}
          ${signBlock('ผู้ถูกประเมินรับทราบ', sg.employee, 'employee', isEmpTurn,
    sg.employee && sg.employee.at ? `<div class="dim">ลงนามรับทราบแล้ว</div>` : '')}
          ${signBlock('4.3 ผู้อนุมัติ', sg.approver, 'approver', isBossTurn, isBossTurn
    ? `<div class="ap-sum"><label><input type="radio" name="boss-ok" value="1" checked> อนุมัติ</label>
         <label><input type="radio" name="boss-ok" value="0"> ไม่อนุมัติ</label></div>
       <label>คะแนนสรุป (ปรับได้)<input type="number" id="ap-final" step="0.1" min="0" max="100"
         value="${fix(row.MgrScore)}"></label>`
    : (sg.approver && sg.approver.approved !== undefined
      ? `<div class="dim">ผล: ${sg.approver.approved ? 'อนุมัติ' : 'ไม่อนุมัติ'}</div>` : ''))}
        </div>

        ${isEmpTurn ? `<div class="ap-empack">
          <div class="panel-head">พนักงานรับทราบผลการประเมิน</div>
          <p>คะแนนสรุป <b>${fix(row.FinalScore || row.MgrScore)}</b> · เกรด <b>${esc(row.Grade || '')}</b>
            ${row.HeadComment ? `<br>ความเห็นผู้บริหาร: ${esc(row.HeadComment)}` : ''}</p>
          <label>ความเห็นของฉัน<textarea id="emp-note" rows="2"></textarea></label>
          <div class="dim">ลงลายเซ็นได้ที่ช่อง "ผู้ถูกประเมินรับทราบ" ด้านบน</div>
        </div>` : ''}
      </div>

      ${logBox(row)}`,
    footer: `${isMgrTurn || isHrTurn || isBossTurn
      ? '<button class="btn-mini warn" id="ap-back">↩ ส่งกลับให้แก้ไข</button>' : ''}
      ${isProbation(cycle?.FormSet) ? '<button class="btn-mini" id="ap-export">⭳ ส่งออกเอกสาร (พิมพ์ให้เซ็น)</button>' : ''}
      ${state.isHR && !isMgrTurn ? '<button class="btn-mini" id="ap-hr-save">💾 บันทึกผลสรุป (HR)</button>' : ''}
      <button class="btn-mini" id="ap-close">ปิด</button>
      ${isMgrTurn ? '<button class="btn btn-primary" id="ap-mgr-save">บันทึกและส่งให้ฝ่ายบุคคล</button>' : ''}
      ${isHrTurn ? `<button class="btn-mini" id="ap-hr-toemp">ส่งให้พนักงานรับทราบ (ข้ามผู้บริหาร)</button>
                    <button class="btn btn-primary" id="ap-hr-send">ส่งให้ผู้บริหารอนุมัติ</button>` : ''}
      ${isBossTurn ? '<button class="btn btn-primary" id="ap-approve">บันทึกผลการอนุมัติ</button>' : ''}
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
    const fin = $('#ap-final');
    if (fin && !fin.dataset.touched) fin.value = fix(sc.score);
    return { ans, sc };
  };
  $$('.ap-form input[type=radio]').forEach((el) => { el.onchange = recalc; });
  const fin = $('#ap-final');
  if (fin) fin.oninput = () => { fin.dataset.touched = '1'; };

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
  if (ex) ex.onclick = () => exportProbation(row);

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

  const hrGo = async (to, btn) => {
    btn.disabled = true;
    try {
      await hrReview(row, { sign: await signOf('hr'), to, by: state.user?.name || '' });
      close(); await rerender();
    } catch (e) { btn.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
  };
  const hrSend = $('#ap-hr-send');
  if (hrSend) hrSend.onclick = () => hrGo(S_BOSS, hrSend);
  const hrToEmp = $('#ap-hr-toemp');
  if (hrToEmp) {
    hrToEmp.onclick = () => {
      if (!confirm('ส่งให้พนักงานเซ็นรับทราบเลย โดยข้ามขั้นผู้บริหาร?')) return;
      hrGo(S_ACK, hrToEmp);
    };
  }

  const ok = $('#ap-approve');
  if (ok) {
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const approved = ($$('input[name=boss-ok]:checked')[0] || {}).value !== '0';
        await executiveDecide(row, {
          approved, finalScore: +$('#ap-final').value || 0,
          sign: await signOf('approver'), by: state.user?.name || '',
          note: $('#sg-approver-note') ? $('#sg-approver-note').value.trim() : '', scheme,
        });
        close(); await rerender();
      } catch (e) { ok.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  const empAck = $('#ap-emp-ack');
  if (empAck) {
    empAck.onclick = async () => {
      empAck.disabled = true;
      try {
        await acknowledge(row, $('#emp-note') ? $('#emp-note').value.trim() : '',
          state.user?.name || '', await readSignature('employee'));
        close(); await rerender();
      } catch (e) { empAck.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }
}
