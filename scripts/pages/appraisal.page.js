import { esc, $, $$, onClick } from '../core/dom.js';
import { state, setState } from '../core/state.js';
import { list } from '../services/data.js';
import { toCsv, downloadText } from '../utils/csv.js';
import {
  STAGES, DONE, activeCycle, criteria, scoreOf, sheets, mineOf, teamOf,
  answersOf, extraOf, logOf, stageOpen, gradeOf, clean, generateSheets, ROUND_DAYS,
  submitSelf, submitManager, approveSheet, sendBack, acknowledge,
} from '../services/appraisal.js';
import { isProbation, renderProbation } from '../templates/probation-fm-hrm-004.js';
import { openPRWindow } from '../templates/pr-fm-pur-004.js';

export const meta = { route: 'appraisal', title: 'ประเมินผลบุคลากร', nav: true, order: 7, adminOnly: false };

let cycle = null;
let secs = [];
let rows = [];
let me = null;          // แถวบุคลากรของผู้ใช้
let myEmail = '';
let scheme = 'มาตรฐาน';   // เกณฑ์เกรดของรอบนี้

const TONE = {
  [STAGES[0]]: 'wait', [STAGES[1]]: 'mgr', [STAGES[2]]: 'head',
  [STAGES[3]]: 'ack', [DONE]: 'done',
};
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

  const mine = mineOf(rows, myEmail);
  const team = teamOf(rows, myEmail);
  const tab = state.apTab || 'me';

  const tabs = [
    ['me', 'การประเมินของฉัน', true],
    ['team', `ทีมของฉัน${team.length ? ` (${team.length})` : ''}`, team.length > 0],
    ['approve', 'อนุมัติผล', canApprove()],
    ['all', 'ภาพรวมทั้งองค์กร', state.isAdmin],
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
           · ขั้นตอนที่เปิดอยู่: ${esc(clean(cycle.Stage) || STAGES[0])}
           · สถานะรอบ: ${esc(clean(cycle.Status) || '—')}`
        : 'ยังไม่ได้เปิดรอบประเมิน'}</p>

      <div class="chips">
        ${tabs.map(([k, label]) => `<button class="chip" data-aptab="${k}"
          aria-pressed="${tab === k}">${esc(label)}</button>`).join('')}
      </div>

      ${cycle ? '' : `<div class="panel"><div class="empty">
        ยังไม่มีรอบประเมินที่เปิดใช้งาน${state.isAdmin
          ? '<br><span class="dim">เปิดรอบใหม่ได้ที่ จัดการข้อมูล → รอบประเมิน</span>' : ''}
      </div></div>`}

      ${body}
    </div>
  </section>`;
}

/* ───────── การประเมินของฉัน ───────── */
function paneMe(mine) {
  if (!cycle) return '';
  if (!mine) {
    return `<div class="panel"><div class="empty">ยังไม่มีใบประเมินของคุณในรอบนี้
      ${state.isAdmin ? '<br><span class="dim">กดสร้างใบประเมินได้ที่แท็บ ภาพรวมทั้งองค์กร</span>'
        : '<br><span class="dim">แจ้งฝ่ายทรัพยากรบุคคลเพื่อสร้างใบประเมิน</span>'}</div></div>`;
  }

  const st = clean(mine.Status);
  const self = answersOf(mine, 'self');
  const mgr = answersOf(mine, 'mgr');
  const g = stageOpen(cycle, STAGES[0]);
  const editable = st === STAGES[0] && g.ok;

  return `
    <div class="ap-stats">
      <div><b>${pill(st)}</b><span>สถานะของฉัน</span></div>
      <div><b>${fix(mine.SelfScore)}</b><span>คะแนนประเมินตนเอง</span></div>
      <div><b>${fix(mine.MgrScore)}</b><span>คะแนนจากหัวหน้า</span></div>
      <div><b>${mine.Grade ? esc(mine.Grade) : '—'}</b><span>เกรดสรุป</span></div>
    </div>

    ${st === STAGES[3] ? `<div class="panel ap-ack">
      <h3>ผลการประเมินรอบนี้</h3>
      <p>คะแนนสรุป <b>${fix(mine.FinalScore)}</b> · เกรด <b>${esc(mine.Grade || '')}</b>
        ${mine.HeadComment ? `<br>ความเห็นผู้บริหาร: ${esc(mine.HeadComment)}` : ''}</p>
      <label>ความเห็นของฉัน (ถ้ามี)
        <textarea id="ap-ack-note" rows="2"></textarea></label>
      <button class="btn btn-primary" id="ap-ack">✓ รับทราบผลการประเมิน</button>
    </div>` : ''}

    ${editable ? '' : `<div class="panel-note ap-note">${st === STAGES[0]
      ? esc(g.why || 'ยังไม่เปิดให้กรอกในขณะนี้')
      : 'ส่งแบบประเมินตนเองแล้ว ดูคะแนนที่กรอกไว้ด้านล่าง'}</div>`}

    ${formTable('self', self, editable, mine, mgr)}

    ${logBox(mine)}`;
}

/* ───────── ทีมของฉัน ───────── */
function paneTeam(team) {
  if (!cycle) return '';
  const g = stageOpen(cycle, STAGES[1]);
  const open = team.filter((r) => clean(r.Status) === STAGES[1]);

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
            clean(r.Status) === STAGES[1] && g.ok ? 'ประเมิน' : 'ดูรายละเอียด'}</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty">ยังไม่มีลูกทีมในรอบนี้</div>'}
    </div>`;
}

/* ───────── อนุมัติผล ───────── */
function paneApprove() {
  if (!cycle) return '';
  const g = stageOpen(cycle, STAGES[2]);
  const wait = rows.filter((r) => clean(r.Status) === STAGES[2])
    .filter((r) => state.isAdmin || clean(r.Department) === clean(me?.Department));

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
      ${[STAGES[0], STAGES[1], STAGES[2]].map((s) =>
        `<div><b>${byStatus[s] || 0}</b><span>${esc(s)}</span></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head">ความคืบหน้าตามฝ่าย
        <span class="panel-meta">
          <button class="btn-mini" id="ap-csv">⭳ ส่งออก CSV</button>
          <button class="btn-mini" id="ap-gen">+ สร้างใบประเมินให้ผู้ที่ยังไม่มี</button>
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
      <div class="panel-head">ใบประเมินทั้งหมดในรอบนี้
        <span class="panel-meta">กดเปิดเพื่อกรอกวันลา วันที่ประเมิน หรือดูคะแนน</span></div>
      ${rows.length ? `<table class="ap-table">
        <thead><tr><th>ชื่อ</th><th>ฝ่าย</th><th>ผู้ประเมิน</th><th>สถานะ</th><th class="num">สรุป</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(clean(r.EmployeeName))}</td>
          <td>${esc(clean(r.Department))}</td>
          <td>${esc(clean(r.EvaluatorName))}</td>
          <td>${pill(r.Status)}</td>
          <td class="num">${fix(r.FinalScore || r.MgrScore || r.SelfScore)}</td>
          <td class="num"><button class="btn-mini" data-apopen="${r.id}">เปิด</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">ยังไม่มีใบประเมินในรอบนี้</div>'}
    </div>`;
}

/* ───────── ตารางให้คะแนน ───────── */
function formTable(who, answers, editable, row, otherAnswers = null) {
  if (!secs.length) {
    // บอกให้ชัดว่าหาไม่เจอเพราะชุดไหน จะได้ไม่ต้องเดา
    return `<div class="panel"><div class="empty">
      ยังไม่มีหัวข้อประเมินของชุด <b>${esc(clean(cycle?.FormSet) || '(ไม่ได้ระบุชุด)')}</b>
      ${state.isAdmin ? `<br><span class="dim">ไปที่ จัดการข้อมูล → หัวข้อประเมิน
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

/* ───────── ส่วนที่ 3–4 ของแบบทดลองงาน ───────── */
function probationBox(row, editable, person = {}) {
  const x = extraOf(row);
  const a = x.attendance || {};
  const sm = x.summary || {};
  const rd = Object.fromEntries((x.rounds || []).map((r) => [r.key, r.date]));
  const start = x.startDate || person.StartDate || '';
  const dis = editable ? '' : 'disabled';
  const opt = (v, label) => `<label><input type="radio" name="pb-result" value="${v}"
    ${sm.result === v ? 'checked' : ''} ${dis}> ${label}</label>`;

  return `
    <div class="panel ap-pb">
      <div class="panel-head">ส่วนที่ 1 : ข้อมูลการทดลองงาน
        <span class="panel-meta">${editable ? 'ใส่วันเริ่มงานแล้วกดคำนวณ ระบบเติมวันครบกำหนดให้' : ''}</span></div>
      <div class="ap-sum2">
        <label>วันเริ่มงาน<input type="date" id="pb-start" value="${esc(start)}" ${dis}></label>
        ${ROUND_DEFS.map((r) => `<label>${r.label}
          <input type="date" id="pb-${r.key}" value="${esc(rd[r.key] || '')}" ${dis}></label>`).join('')}
      </div>
      ${editable ? '<button class="btn-mini" id="pb-calc">⟳ คำนวณวันครบกำหนดจากวันเริ่มงาน</button>' : ''}

      <div class="panel-head">ส่วนที่ 3 : บันทึกการมาปฏิบัติงาน</div>
      <div class="ap-att">
        ${[['late', 'มาสาย (ครั้ง)'], ['absent', 'ขาดงาน (วัน)'], ['personal', 'ลากิจ (วัน)'],
    ['sick', 'ลาป่วย (วัน)'], ['other', 'ลาอื่นๆ (วัน)']].map(([k, label]) => `
          <label>${label}<input type="number" min="0" step="1" id="pb-${k}"
            value="${esc(a[k] ?? '')}" ${dis}></label>`).join('')}
      </div>

      <div class="panel-head">ส่วนที่ 4 : สรุปผลการประเมิน</div>
      <div class="ap-sum">
        ${opt('บรรจุ', 'เห็นควรบรรจุ')}
        ${opt('ต่อทดลองงาน', 'ทดลองงานต่อ 30 วัน')}
        ${opt('ไม่ผ่าน', 'ไม่ผ่านทดลองงาน')}
        ${opt('อื่นๆ', 'อื่นๆ')}
      </div>
      <div class="ap-sum2">
        <label>บรรจุตั้งแต่วันที่<input type="date" id="pb-confirm" value="${esc(sm.confirmDate || '')}" ${dis}></label>
        <label>วันปฏิบัติงานวันสุดท้าย<input type="date" id="pb-last" value="${esc(sm.lastDate || '')}" ${dis}></label>
        <label>อื่นๆ (ระบุ)<input type="text" id="pb-other" value="${esc(sm.other || '')}" ${dis}></label>
      </div>
    </div>`;
}

const ROUND_DEFS = ROUND_DAYS;
const addDays = (iso, n) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

const readProbation = () => ({
  startDate: $('#pb-start') ? $('#pb-start').value : '',
  rounds: ROUND_DEFS.map((r) => ({
    key: r.key, label: r.label, date: $('#pb-' + r.key) ? $('#pb-' + r.key).value : '',
  })),
  attendance: Object.fromEntries(['late', 'absent', 'personal', 'sick', 'other']
    .map((k) => [k, $('#pb-' + k) ? $('#pb-' + k).value : ''])),
  summary: {
    result: ($$('input[name=pb-result]:checked')[0] || {}).value || '',
    confirmDate: $('#pb-confirm') ? $('#pb-confirm').value : '',
    lastDate: $('#pb-last') ? $('#pb-last').value : '',
    other: $('#pb-other') ? $('#pb-other').value : '',
  },
});

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
      evaluator: { name: clean(row.EvaluatorName), date: at('หัวหน้าประเมิน'), sig: sigOf(row.EvaluatorName) },
      hr: { name: '', date: '' },
      approver: { name: '', date: at('อนุมัติ'),
        approved: clean(row.Status) === STAGES[3] || clean(row.Status) === DONE ? true : undefined },
    },
  });
  openPRWindow(html, `แบบประเมินผลระหว่างทดลองงาน — ${clean(row.EmployeeName)}`);
}

/* ───────── เหตุการณ์ ───────── */
export function mount(ctx) {
  onClick('aptab', (k) => setState({ apTab: k }));

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

  // พนักงานรับทราบผล
  const ack = $('#ap-ack');
  if (ack) {
    ack.onclick = async () => {
      const mine = mineOf(rows, myEmail);
      ack.disabled = true;
      try {
        await acknowledge(mine, $('#ap-ack-note').value.trim(), state.user?.name || '');
        await rerender();
      } catch (e) { ack.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
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
        + (res.noManager ? `\nมี ${res.noManager} คนที่ยังไม่ได้กำหนดผู้บังคับบัญชา จะไม่มีผู้ประเมิน` : ''));
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
  const dirAll = await list('directory').catch(() => []);
  const person = dirAll.find((d) => clean(d.Email).toLowerCase()
    === clean(row.EmployeeEmail).toLowerCase()) || {};
  const { openModal } = await import('../components/modal.js');
  const st = clean(row.Status);
  const isMgrTurn = st === STAGES[1] && stageOpen(cycle, STAGES[1]).ok
    && clean(row.EvaluatorEmail).toLowerCase() === myEmail;
  const isHeadTurn = st === STAGES[2] && stageOpen(cycle, STAGES[2]).ok && canApprove();

  const selfAns = answersOf(row, 'self');
  const mgrAns = answersOf(row, 'mgr');
  const editable = isMgrTurn;
  const answers = editable ? mgrAns : (Object.keys(mgrAns).length ? mgrAns : selfAns);
  const s = scoreOf(secs, answers);

  openModal({
    title: `${clean(row.EmployeeName)} · ${clean(row.Department)}`,
    wide: true,
    body: `
      <div class="ap-stats small">
        <div><b>${pill(st)}</b><span>สถานะ</span></div>
        <div><b>${fix(row.SelfScore)}</b><span>ตนเอง</span></div>
        <div><b>${fix(row.MgrScore)}</b><span>หัวหน้า</span></div>
        <div><b>${row.Grade ? esc(row.Grade) : '—'}</b><span>เกรด</span></div>
      </div>
      ${row.SelfComment ? `<div class="panel-note">ความเห็นพนักงาน: ${esc(row.SelfComment)}</div>` : ''}
      ${formTable('mgr', answers, editable, row, editable ? selfAns : null)}
      ${isProbation(cycle?.FormSet) ? probationBox(row, editable || state.isAdmin, person) : ''}
      ${isHeadTurn ? `<div class="ap-head-box">
        <label>คะแนนสรุป (ปรับได้)
          <input type="number" id="ap-final" min="0" max="100" step="0.1" value="${fix(row.MgrScore)}"></label>
        <label>ความเห็นผู้บริหาร
          <textarea id="ap-head-note" rows="2"></textarea></label>
      </div>` : ''}
      ${logBox(row)}`,
    footer: `${isMgrTurn || isHeadTurn
      ? '<button class="btn-mini warn" id="ap-back">↩ ส่งกลับให้แก้ไข</button>' : ''}
      ${isProbation(cycle?.FormSet) && state.isAdmin && !isMgrTurn
        ? '<button class="btn-mini" id="ap-hr-save">💾 บันทึกข้อมูลวันลา / วันที่ประเมิน</button>' : ''}
      ${isProbation(cycle?.FormSet) ? '<button class="btn-mini" id="ap-export">⭳ ส่งออกแบบฟอร์ม FM-HRM-004</button>' : ''}
      <button class="btn-mini" id="ap-close">ปิด</button>
      ${isMgrTurn ? '<button class="btn btn-primary" id="ap-mgr-save">บันทึกผลประเมิน</button>' : ''}
      ${isHeadTurn ? '<button class="btn btn-primary" id="ap-approve">✓ อนุมัติผล</button>' : ''}`,
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
      await sendBack(row, isHeadTurn ? STAGES[1] : STAGES[0], note, state.user?.name || '');
      close(); await rerender();
    };
  }

  const calc = $('#pb-calc');
  if (calc) {
    calc.onclick = () => {
      const st = $('#pb-start').value;
      if (!st) { alert('กรุณาใส่วันเริ่มงานก่อน'); return; }
      ROUND_DEFS.forEach((r) => { const el = $('#pb-' + r.key); if (el) el.value = addDays(st, r.days); });
    };
  }

  const hrSave = $('#ap-hr-save');
  if (hrSave) {
    hrSave.onclick = async () => {
      hrSave.disabled = true;
      try {
        const { update } = await import('../services/data.js');
        await update('appraisals', row.id, { Extra: JSON.stringify({ ...extraOf(row), ...readProbation() }) });
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
        await submitManager(row, ans, $('#ap-comment').value.trim(), sc.score, state.user?.name || '',
          isProbation(cycle?.FormSet) ? { ...extraOf(row), ...readProbation() } : null);
        close(); await rerender();
      } catch (e) { saveMgr.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }

  const ok = $('#ap-approve');
  if (ok) {
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        await approveSheet(row, +$('#ap-final').value || 0,
          $('#ap-head-note').value.trim(), state.user?.name || '');
        close(); await rerender();
      } catch (e) { ok.disabled = false; alert('บันทึกไม่สำเร็จ — ' + e.message); }
    };
  }
}
