/**
 * หน้าต่างใบประเมิน KPI ประจำปี (ใช้แทนหน้าต่างแบบผ่านงานเมื่อชุดแบบประเมินเป็น KPI)
 *
 * คนเดียวกันเห็นต่างกันตามบทบาทและขั้นของใบ:
 *   พนักงาน         ประเมินตนเอง (ขั้นประเมินตนเอง) · ลงนามรับทราบ (ขั้นพนักงานรับทราบ)
 *                   เห็นคะแนนหัวหน้า/ผู้บริหารเมื่อฝ่ายบุคคลส่งผลให้รับทราบแล้วเท่านั้น
 *   ผู้บังคับบัญชา   กำหนดหัวข้อเฉพาะตำแหน่ง (ตัวแดงในไฟล์) · ให้คะแนน + ข้อเสนอแนะ + ลงนาม
 *   ผู้บริหาร (MD)   ให้คะแนน + ข้อเสนอแนะ + ลงนาม (เห็นคะแนนของผู้บังคับบัญชาประกอบ)
 *   ฝ่ายบุคคล       กำหนดหัวข้อแทนได้ · ตรวจผลขั้นสุดท้าย (HR Final Check) แล้วส่งให้พนักงานรับทราบ
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { signaturePad, bindSignaturePads, readSignature } from './signature-pad.js';
import {
  clean, extraOf, logOf, signsOf, stageOpen, noSelf, canHrReview, canBossApprove, sendBack, acknowledge,
  rolesOf, S_SELF, S_MGR, S_HR, S_BOSS, S_ACK, DONE,
} from '../services/appraisal.js';
import {
  PARTS, SCALE, KPI_RUBRIC, FORM_LABEL, BONUS_RULE, catsOf, partScore, summarize, kpiGrade, customSlots,
  customProblems, saveCustom, saveScores, hrFinal, kpiSteps, formOfRow, kpiOf, ratingsOf, hasCustom,
} from '../services/kpi.js';

const COL = { self: 'บุคลากร', sup: 'ผู้บังคับบัญชา', md: 'ผู้บริหาร' };
const REC = [['s', '1. สิ่งที่บุคลากรปฏิบัติได้อย่างมีประสิทธิภาพ (Strength)'],
  ['i', '2. สิ่งที่บุคลากรควรปรับปรุง (Areas for Improvement)'],
  ['d', '3. สิ่งที่บุคลากรควรได้รับการพัฒนา (Development program)']];
export const KPI_ATT = [['sick', 'ลาป่วย', 'วัน'], ['personal', 'ลากิจ', 'วัน'], ['late', 'สาย', 'ครั้ง'],
  ['noclock', 'ไม่ลงเวลา', 'ครั้ง'], ['absent', 'ขาดงาน', 'วัน'], ['other', 'ลาอื่นๆ', 'วัน']];
const low = (v) => clean(v).toLowerCase();
const f1 = (n) => (n === null || n === undefined || n === '' ? '—' : (+n).toFixed(2));
const thDate = (v) => (v ? new Date(v).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '');
const dt = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** บทบาทของผู้ใช้ต่อใบนี้ */
export function kpiRole(row, ctx) {
  const st = clean(row.Status);
  const who = { email: ctx.myEmail, person: ctx.me, isAdmin: !!ctx.isAdmin, isHR: !!ctx.isHR };
  const isEmp = low(row.EmployeeEmail) === low(ctx.myEmail);
  const isEval = !!clean(row.EvaluatorEmail) && low(row.EvaluatorEmail) === low(ctx.myEmail);
  const open = !!ctx.cycle && clean(ctx.cycle.Status) === 'เปิด';
  const r = {
    st, isEmp, isEval,
    self: isEmp && st === S_SELF && !noSelf(row) && stageOpen(ctx.cycle, S_SELF).ok,
    sup: isEval && st === S_MGR && stageOpen(ctx.cycle, S_MGR).ok,
    md: open && st === S_BOSS && canBossApprove(row, who),
    hr: open && st === S_HR && canHrReview(row, who),
    ack: isEmp && st === S_ACK,
    custom: open && [S_SELF, S_MGR].includes(st) && (isEval || ctx.isHR || ctx.isAdmin),
  };
  r.edit = r.self ? 'self' : r.sup ? 'sup' : r.md ? 'md' : null;
  // พนักงานเห็นผลของหัวหน้า/ผู้บริหารเมื่อฝ่ายบุคคลส่งให้รับทราบแล้ว
  // ใบของตัวเอง: รอฝ่ายบุคคลส่งผลก่อนเสมอ แม้เป็นฝ่ายบุคคล/ผู้ดูแลระบบ
  r.seeOthers = !isEmp || [S_ACK, DONE].includes(st) || isEval || r.md || r.hr;
  return r;
}

/* ───────── ส่วนประกอบ HTML ───────── */

function scaleSelect(col, id, v, editable) {
  if (!editable) return `<b>${v === undefined || v === '' || v === null ? '—' : esc(String(v))}</b>`;
  return `<select class="kpi-in" data-col="${col}" data-id="${esc(id)}" aria-label="คะแนน 0–10">
    <option value="">—</option>${SCALE.map((s) => `<option value="${s}" ${v !== '' && v !== undefined && v !== null && +v === s ? 'selected' : ''}>${s.toFixed(1)}</option>`).join('')}
  </select>`;
}

function partTable(part, label, cats, cols, data, role) {
  const sc = Object.fromEntries(cols.map((c) => [c, partScore(cats, data[c])]));
  return `
  <div class="panel kpi-part" data-part="${part}">
    <div class="panel-head">${esc(label)} <span class="panel-meta">น้ำหนัก 50% ของคะแนนรวม</span></div>
    <div class="kpi-scroll"><table class="ap-table kpi-tbl">
      <thead><tr><th class="kpi-no">ข้อ</th><th>KPI / ตัวชี้วัดผลการปฏิบัติงาน</th><th class="num">น้ำหนัก<br>รายข้อ</th>
        ${cols.map((c) => `<th class="num kpi-col${c === role.edit ? ' kpi-active' : ''}">${COL[c]}<br><span class="dim">0–10</span></th>`).join('')}</tr></thead>
      <tbody>${cats.map((c) => `
        <tr class="kpi-cat"><td>${c.no}</td><td colspan="${2 + cols.length}">${esc(c.name)}
          <span class="dim">· น้ำหนักหมวด ${c.weight}</span></td></tr>
        ${c.items.map((it) => `<tr class="${it.custom ? 'kpi-custom' : ''}">
          <td class="kpi-no">${esc(it.code)}</td>
          <td>${esc(it.title)}${it.custom ? ' <span class="kpi-fc">เฉพาะตำแหน่ง</span>' : ''}
            ${cols.filter((x) => x !== role.edit && data[x][it.id + '__note']).map((x) =>
              `<div class="kpi-note-ro">💬 ${COL[x]}: ${esc(data[x][it.id + '__note'])}</div>`).join('')}
            ${role.edit ? `<input class="kpi-note" data-col="${role.edit}" data-id="${esc(it.id)}" maxlength="300"
              placeholder="ความคิดเห็น${COL[role.edit]} (ไม่บังคับ)" value="${esc(data[role.edit][it.id + '__note'] || '')}">` : ''}</td>
          <td class="num">${it.weight}</td>
          ${cols.map((x) => `<td class="num kpi-col${x === role.edit ? ' kpi-active' : ''}">${scaleSelect(x, it.id, data[x][it.id], x === role.edit)}</td>`).join('')}
        </tr>`).join('')}
        ${c.budget && !c.items.some((it) => it.custom) ? `<tr class="kpi-custom kpi-missing"><td class="kpi-no">${c.no}.${c.items.length + 1}</td>
          <td colspan="${2 + cols.length}">Functional Competency เฉพาะตำแหน่ง — ให้หัวหน้างานกำหนด (น้ำหนักรวมไม่เกิน ${c.budget}) · <i>ยังไม่ได้กำหนด</i></td></tr>` : ''}
        <tr class="kpi-sub"><td></td><td>คะแนนถ่วงน้ำหนักหมวด ${c.no} <span class="dim">(เต็ม ${c.weight})</span></td><td></td>
          ${cols.map((x) => `<td class="num" data-sub="${x}-${c.key}">${f1(sc[x].cats[c.key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr class="kpi-tot"><td></td><td>คะแนนรวม ${esc(label.split(':')[0])} <span class="dim">(เต็ม 100)</span></td><td></td>
        ${cols.map((x) => `<td class="num"><b data-tot="${x}-${part}">${sc[x].rated ? f1(sc[x].score) : '—'}</b>
          <div class="kpi-g" data-gr="${x}-${part}">${sc[x].rated ? kpiGrade(sc[x].score)[1] : ''}</div></td>`).join('')}</tr></tfoot>
    </table></div>
    ${recBlock(part, cols, role, data.rec)}
  </div>`;
}

/** ข้อเสนอแนะเพิ่มเติม (Recommendations) ของผู้บังคับบัญชาและผู้บริหาร แยกตาม Part */
function recBlock(part, cols, role, rec = {}) {
  const who = cols.filter((c) => c !== 'self');
  if (!who.length) return '';
  const val = (w, k) => (((rec[w] || {})[part] || {})[k] || '');
  const any = who.some((w) => role.edit === w || REC.some(([k]) => val(w, k)));
  if (!any) return '';
  return `<details class="kpi-rec"${role.edit && role.edit !== 'self' ? ' open' : ''}>
    <summary>ข้อเสนอแนะเพิ่มเติม (Recommendations)</summary>
    ${REC.map(([k, title]) => `<div class="kpi-recrow"><b>${esc(title)}</b>
      <div class="kpi-rec2">${who.map((w) => `<label>${COL[w]}
        ${role.edit === w ? `<textarea rows="2" class="kpi-recin" data-part="${part}" data-k="${k}">${esc(val(w, k))}</textarea>`
          : `<div class="kpi-recro">${esc(val(w, k)) || '<span class="dim">—</span>'}</div>`}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}

/** ตารางสรุปผล: Part 1 / Part 2 × ผู้บังคับบัญชา / ผู้บริหาร / ผลสุดท้าย + สิทธิ์โบนัส */
function summaryHtml(sum, role) {
  const show = role.seeOthers;
  const cell = (part, w) => {
    const p = sum.parts[part][w];
    return p.rated ? `${f1(p.score)} <b class="kpi-gb">${kpiGrade(p.score)[1]}</b>` : '—';
  };
  const fin = (v) => (v === null ? '—' : `${f1(v)} <b class="kpi-gb">${kpiGrade(v)[1]}</b>`);
  return `<div class="panel kpi-sum" id="kpi-sum">
    <div class="panel-head">สรุปผลการประเมิน <span class="panel-meta">ผู้บังคับบัญชา 50% + ผู้บริหาร 50% · Part 1 50% + Part 2 50% · คะแนนประเมินตนเองไม่นำมาคิด</span></div>
    ${show ? `<div class="kpi-scroll"><table class="ap-table kpi-sumtbl">
      <thead><tr><th>ส่วนการประเมิน</th><th class="num">ตนเอง</th><th class="num">ผู้บังคับบัญชา</th><th class="num">ผู้บริหาร</th><th class="num">ผลสุดท้าย</th><th>เกณฑ์ขั้นต่ำ (โบนัส)</th></tr></thead>
      <tbody>${PARTS.map(([part, label, short]) => `<tr><td>${esc(label.split(':')[0])} ${esc(short)}</td>
        <td class="num">${cell(part, 'self')}</td><td class="num">${cell(part, 'sup')}</td><td class="num">${cell(part, 'md')}</td>
        <td class="num">${fin(sum.parts[part].final)}</td><td>${BONUS_RULE[part]} ขึ้นไป ทั้งสองผู้ประเมิน</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td><b>คะแนนรวม</b></td><td class="num">${f1(sum.total.self)}</td><td class="num">${f1(sum.total.sup)}</td>
        <td class="num">${f1(sum.total.md)}</td><td class="num"><b class="kpi-final">${fin(sum.final)}</b></td>
        <td>${sum.eligible === null ? '<span class="dim">รอผลครบทั้งสองผู้ประเมิน</span>'
          : sum.eligible ? '<span class="kpi-ok">✓ ผ่านเกณฑ์พิจารณาโบนัส/ปรับเงินเดือน</span>'
            : '<span class="kpi-no-ok">✗ ไม่ผ่านเกณฑ์ขั้นต่ำ</span>'}</td></tr></tfoot>
    </table></div>` : `<div class="panel-note">ผลจากผู้บังคับบัญชาและผู้บริหารจะแสดงเมื่อฝ่ายบุคคลส่งผลให้รับทราบ · คะแนนประเมินตนเอง ${f1(sum.total.self)}</div>`}
  </div>`;
}

export function kpiTrackHtml(row) {
  const steps = kpiSteps(row, { noSelf: noSelf(row) });
  return `<div class="ap-track kpi-track">${steps.map((s) => `<div class="ap-step ${s.state === 'done' ? 'ok' : s.state === 'now' ? 'now' : 'wait'}">
    <div class="ap-step-dot">${s.state === 'done' ? '✓' : ''}</div>
    <div class="ap-step-body"><b>${esc(s.label)}</b>
      <span>${s.state === 'now' ? 'กำลังดำเนินการ' : s.state === 'done' ? `${esc(s.by || 'เรียบร้อย')}${s.at ? ` · ${esc(dt(s.at))}` : ''}`
        : s.state === 'na' ? 'ไม่ได้กำหนด' : 'รอดำเนินการ'}</span></div></div>`).join('')}</div>`;
}

function infoHtml(row, person, cycle) {
  const x = extraOf(row);
  const a = x.attendance || {};
  const ro = rolesOf(row);
  const has = KPI_ATT.some(([k]) => String(a[k] ?? '').trim());
  const period = cycle && (cycle.PeriodFrom || cycle.PeriodTo)
    ? `${thDate(cycle.PeriodFrom)} – ${thDate(cycle.PeriodTo)}` : '';
  return `<div class="kpi-info">
    <div><i>ตำแหน่ง</i><b>${esc(clean(person.Position) || '—')}</b></div>
    <div><i>ฝ่าย / แผนก</i><b>${esc([clean(row.Department), clean(row.Section)].filter(Boolean).join(' · ') || '—')}</b></div>
    <div><i>แบบประเมิน</i><b>${esc(FORM_LABEL[formOfRow(row)])}</b></div>
    <div><i>ผู้บังคับบัญชา (ผู้ประเมิน)</i><b>${esc(clean(row.EvaluatorName)) || '<span class="kpi-no-ok">ยังไม่ได้กำหนด</span>'}</b></div>
    <div><i>ผู้บริหาร (MD)</i><b>${esc(clean(ro.approver && ro.approver.name)) || 'กรรมการผู้จัดการ'}</b></div>
    ${period ? `<div><i>รอบผลงาน</i><b>${esc(period)}</b></div>` : ''}
  </div>
  <div class="ap-attbar kpi-att"><span class="dim">สถิติการปฏิบัติงาน${period ? ` (${esc(period)})` : ''}</span>
    ${has ? KPI_ATT.map(([k, label, unit]) => `<span><b>${esc(String(a[k] || 0))}</b> ${label} <i>${unit}</i></span>`).join('')
      : '<span class="dim">ฝ่ายทรัพยากรบุคคลยังไม่ได้กรอก (กรอกที่ จัดการข้อมูล → สร้างแบบประเมิน)</span>'}</div>`;
}

/** หัวหน้ากำหนดหัวข้อเฉพาะตำแหน่ง (ข้อตัวแดง) — เพิ่มได้หลายข้อ น้ำหนักรวมไม่เกินที่กำหนด */
function customHtml(form, custom) {
  return `<div class="panel kpi-cust" id="kpi-cust">
    <div class="panel-head">✏️ Functional Competency เฉพาะตำแหน่ง <span class="panel-meta">หัวหน้างานกำหนด · เพิ่มได้หลายข้อ น้ำหนักรวมแต่ละหมวดห้ามเกินที่กำหนด</span></div>
    ${customSlots(form).map((s) => {
      const rows = custom[s.key] || [];
      const used = rows.reduce((t, x) => t + (+x.weight || 0), 0);
      return `<div class="kpi-slot" data-slot="${s.key}">
        <div class="kpi-slot-h"><b>ข้อ ${s.no}. ${esc(s.name)}</b>
          <span class="kpi-budget${used > s.budget ? ' over' : ''}" data-left="${s.key}">ใช้ ${used} / ${s.budget}</span></div>
        ${rows.map((x, i) => `<div class="kpi-slot-row">
          <input class="kpi-ct" data-slot="${s.key}" data-i="${i}" value="${esc(x.title)}" maxlength="200" placeholder="หัวข้อ/ตัวชี้วัดเฉพาะตำแหน่ง">
          <input class="kpi-cw" type="number" min="0.5" step="0.5" max="${s.budget}" data-slot="${s.key}" data-i="${i}" value="${esc(String(x.weight ?? ''))}"
            title="น้ำหนักรายข้อ" placeholder="เหลือ ${Math.max(0, s.budget - used)}">
          <button type="button" class="btn-mini danger" data-cdel="${s.key}" data-i="${i}" title="ลบข้อนี้">✕</button></div>`).join('')}
        <button type="button" class="btn-mini" data-cadd="${s.key}" ${used >= s.budget ? 'disabled' : ''}>＋ เพิ่มหัวข้อ</button>
      </div>`;
    }).join('')}
    <div class="field-error" id="kpi-cerr" hidden></div>
    <div class="ap-actions"><button class="btn btn-primary" id="kpi-csave">💾 บันทึกหัวข้อเฉพาะตำแหน่ง</button></div>
  </div>`;
}

function signBox(title, data = {}, role, editable, wait = '') {
  return `<div class="ap-signbox${!editable && !data.at ? ' kpi-signwait' : ''}">
    <div class="ap-signhead">${esc(title)}${data.at ? `<span class="dim"> · ${esc(dt(data.at))}</span>` : ''}</div>
    ${!editable && !data.at && wait ? `<div class="kpi-waitnote">🔒 ${esc(wait)}</div>` : ''}
    <label>ชื่อผู้ลงนาม<input type="text" id="sg-${role}-name" value="${esc(data.name || '')}" ${editable ? '' : 'disabled'}></label>
    <label>บันทึกเพิ่มเติม<textarea id="sg-${role}-note" rows="2" ${editable ? '' : 'disabled'}>${esc(data.note || '')}</textarea></label>
    ${signaturePad(role, data.url || '', editable)}
  </div>`;
}

function rubricHtml() {
  return `<details class="kpi-rubric"><summary>📋 เกณฑ์การให้คะแนนรายข้อ (0–10)</summary>
    <table class="ap-table"><tbody>${KPI_RUBRIC.map(([s, t, band, g]) => `<tr${band ? ' class="kpi-band"' : ''}>
      <th class="num">${s}</th><td>${band ? `<b>${esc(band)}</b> · ` : ''}${esc(t)}</td><td class="num">${esc(g)}</td></tr>`).join('')}</tbody></table>
    <div class="dim">เกรด: A 92–100 · B+ 85.50–91.99 · B 75–85.49 · C+ 64.50–74.99 · C 55–64.49 · D+ 45.50–54.99 · D 40–45.49 · F ต่ำกว่า 40</div>
  </details>`;
}

function logHtml(row) {
  const items = logOf(row);
  if (!items.length) return '';
  return `<details class="panel kpi-log"><summary class="panel-head">ประวัติการดำเนินการ (${items.length})</summary>
    <ul class="ap-log">${items.slice().reverse().map((l) => `<li><b>${esc(l.action)}</b> · ${esc(l.by || '')}
      <span class="dim">${esc(dt(l.at))}</span>${l.note ? `<div class="dim">${esc(l.note)}</div>` : ''}</li>`).join('')}</ul></details>`;
}

/* ───────── หน้าต่างใบประเมิน ───────── */

/**
 * เปิดใบ KPI · ctx = { me, myEmail, isHR, isAdmin, cycle, userName, rerender }
 */
export async function openKpiSheet(row, ctx) {
  if (!row) return;
  const { openModal } = await import('./modal.js');
  const dir = await list('directory').catch(() => []);
  const person = dir.find((p) => low(p.Email) === low(row.EmployeeEmail)) || {};
  const role = kpiRole(row, ctx);
  const form = formOfRow(row);
  const k = kpiOf(row);
  let custom = JSON.parse(JSON.stringify(k.custom || {}));
  const sg = signsOf(row);
  const data = { self: { ...ratingsOf(row, 'self') }, sup: { ...ratingsOf(row, 'sup') }, md: { ...ratingsOf(row, 'md') }, rec: k.rec || {} };
  // คอลัมน์ที่เห็น: พนักงานก่อนรับทราบผลเห็นเฉพาะของตัวเอง · ใบที่ไม่มีขั้นประเมินตนเองไม่ต้องมีคอลัมน์ตนเอง
  const cols = ['self', 'sup', 'md'].filter((c) => (c === 'self' ? !noSelf(row) || Object.keys(data.self).length : role.seeOthers));
  const sum = summarize(row);
  const by = ctx.userName || '';
  const title = `${clean(row.EmployeeName)} · ประเมิน KPI ประจำปี`;

  const body = `
    <div class="ap-stats small">
      <div><b>${esc(LABELS[role.st] || role.st)}</b><span>สถานะ</span></div>
      <div><b>${role.seeOthers ? f1(sum.parts.skill.final) : '—'}</b><span>Part 1 (สุดท้าย)</span></div>
      <div><b>${role.seeOthers ? f1(sum.parts.behavior.final) : '—'}</b><span>Part 2 (สุดท้าย)</span></div>
      <div><b>${role.seeOthers && sum.final !== null ? `${f1(sum.final)} · ${esc(sum.grade)}` : '—'}</b><span>คะแนน / เกรดสุดท้าย</span></div>
    </div>
    ${kpiTrackHtml(row)}
    ${infoHtml(row, person, ctx.cycle)}
    ${role.custom ? customHtml(form, custom) : ''}
    ${role.edit ? `<div class="panel-note kpi-howto">ให้คะแนนรายข้อ 0–10 (ทีละ 0.5) ในคอลัมน์ <b>${COL[role.edit]}</b> ตามเกณฑ์ด้านล่าง ·
      ระบบคิดคะแนนถ่วงน้ำหนักให้ทันที · กด "บันทึกร่าง" เก็บไว้ทำต่อได้</div>` : ''}
    ${rubricHtml()}
    ${PARTS.map(([part, label]) => partTable(part, label, catsOf(form, part, k.custom || {}), cols, data, role)).join('')}
    <div id="kpi-sumhost">${summaryHtml(sum, role)}</div>
    ${role.edit ? `<label class="ap-comment">ความเห็นเพิ่มเติม (${COL[role.edit]})
      <textarea id="kpi-comment" rows="2">${esc(role.edit === 'self' ? (row.SelfComment || '') : role.edit === 'sup' ? (row.MgrComment || '') : (row.HeadComment || ''))}</textarea></label>` : ''}
    <div class="panel"><div class="panel-head">ลงนาม</div>
      ${role.edit === 'self' ? `<div class="panel-note kpi-howto">ขั้นประเมินตนเอง<b>ยังไม่ต้องลงนาม</b> — กดส่งแบบประเมินได้เลย ·
        พนักงานลงนามรับทราบผลได้เมื่อผู้บริหารประเมินและลงนามแล้ว และฝ่ายทรัพยากรบุคคลตรวจสอบและส่งผลกลับมาให้</div>` : ''}
      <div class="ap-signs">
        ${signBox('ผู้บังคับบัญชา (Proposed by)', { name: clean(row.EvaluatorName), ...sg.evaluator }, 'evaluator', role.sup, 'ลงนามเมื่อผู้บังคับบัญชาประเมินเสร็จ')}
        ${signBox('ผู้บริหาร (Approved by)', sg.approver || {}, 'approver', role.md, 'ลงนามเมื่อผู้บริหารประเมินเสร็จ')}
        ${signBox('ฝ่ายทรัพยากรบุคคล (HR Final Check)', sg.hr || {}, 'hr', role.hr, 'ลงนามหลังผู้บริหารลงนามแล้ว')}
        ${signBox('บุคลากรรับทราบผล (Staff)', { name: clean(row.EmployeeName), ...sg.employee }, 'employee', role.ack, 'เปิดให้ลงนามเมื่อฝ่ายทรัพยากรบุคคลส่งผลให้รับทราบ')}
      </div></div>
    ${logHtml(row)}`;

  const footer = `
    ${role.sup && !noSelf(row) ? '<button class="btn-mini warn" data-kback="self">↩ ส่งกลับให้พนักงานแก้</button>' : ''}
    ${role.md ? '<button class="btn-mini warn" data-kback="sup">↩ ส่งกลับให้ผู้บังคับบัญชา</button>' : ''}
    ${role.hr ? '<button class="btn-mini warn" data-kback="md">↩ ส่งกลับให้ผู้บริหาร</button>' : ''}
    <button class="btn-mini" id="kpi-print">⬇ พิมพ์แบบประเมิน</button>
    <button class="btn-mini" id="kpi-close">ปิด</button>
    ${role.edit ? '<button class="btn-mini" id="kpi-draft">💾 บันทึกร่าง</button>' : ''}
    ${role.self ? '<button class="btn btn-primary" id="kpi-submit">ส่งแบบประเมินตนเอง (ยังไม่ต้องลงนาม)</button>' : ''}
    ${role.sup ? '<button class="btn btn-primary" id="kpi-submit">ลงนามและส่งให้ผู้บริหาร</button>' : ''}
    ${role.md ? '<button class="btn btn-primary" id="kpi-submit">ลงนามและส่งให้ฝ่ายบุคคล</button>' : ''}
    ${role.hr ? '<button class="btn btn-primary" id="kpi-hr">ตรวจแล้ว · ส่งให้พนักงานรับทราบ</button>' : ''}
    ${role.ack ? '<button class="btn btn-primary" id="kpi-ack">✓ ลงนามรับทราบผล</button>' : ''}`;

  const close = openModal({ title, wide: true, body, footer });
  $('.modal')?.classList.add('kpi-modal');
  bindSignaturePads();
  const reopen = async () => {
    const { list: l } = await import('../services/data.js');
    const fresh = (await l('appraisals', { fresh: true }).catch(() => [])).find((r) => String(r.id) === String(row.id));
    if (ctx.rerender) await ctx.rerender();
    if (fresh) openKpiSheet(fresh, ctx);
  };
  const done = async () => { close(); if (ctx.rerender) await ctx.rerender(); };
  const fail = (e) => alert('บันทึกไม่สำเร็จ — ' + (e && e.message ? e.message : e));
  $('#kpi-close').onclick = close;
  $('#kpi-print').onclick = async () => {
    const { printKpi } = await import('../templates/kpi-print.js');
    const rt = collect();
    // พนักงานก่อนได้รับแจ้งผล: เอกสารมีเฉพาะคะแนนของตัวเอง
    if (!role.seeOthers) { rt.sup = {}; rt.md = {}; }
    printKpi(row, { person, cycle: ctx.cycle, ratings: rt, hideOthers: !role.seeOthers });
  };

  /* คะแนนที่กำลังกรอก (คอลัมน์ของผู้ใช้) */
  function collect() {
    const out = { self: { ...data.self }, sup: { ...data.sup }, md: { ...data.md } };
    if (!role.edit) return out;
    const r = out[role.edit];
    $$('.kpi-in').forEach((el) => { if (el.value === '') delete r[el.dataset.id]; else r[el.dataset.id] = +el.value; });
    $$('.kpi-note').forEach((el) => { const v = el.value.trim(); if (v) r[el.dataset.id + '__note'] = v; else delete r[el.dataset.id + '__note']; });
    return out;
  }
  const recOf = () => {
    const rec = {};
    $$('.kpi-recin').forEach((el) => { (rec[el.dataset.part] = rec[el.dataset.part] || {})[el.dataset.k] = el.value.trim(); });
    return rec;
  };
  /* คิดคะแนนใหม่ทันทีที่เลือก */
  const recalc = () => {
    const rt = collect();
    PARTS.forEach(([part]) => {
      const cats = catsOf(form, part, k.custom || {});
      cols.forEach((c) => {
        const s = partScore(cats, rt[c]);
        cats.forEach((cat) => { const el = $(`[data-sub="${c}-${cat.key}"]`); if (el) el.textContent = f1(s.cats[cat.key]); });
        const t = $(`[data-tot="${c}-${part}"]`); if (t) t.textContent = s.rated ? f1(s.score) : '—';
        const g = $(`[data-gr="${c}-${part}"]`); if (g) g.textContent = s.rated ? kpiGrade(s.score)[1] : '';
      });
    });
    $('#kpi-sumhost').innerHTML = summaryHtml(summarize(row, { ratings: rt }), role);
    return rt;
  };
  $$('.kpi-in').forEach((el) => { el.onchange = recalc; });

  /* หัวข้อเฉพาะตำแหน่ง */
  if (role.custom) {
    const host = $('#kpi-cust');
    const keepInputs = () => {
      $$('.kpi-ct', host).forEach((el) => { custom[el.dataset.slot][+el.dataset.i].title = el.value; });
      $$('.kpi-cw', host).forEach((el) => { custom[el.dataset.slot][+el.dataset.i].weight = el.value === '' ? '' : +el.value; });
    };
    const repaint = () => {
      const next = document.createElement('div');
      next.innerHTML = customHtml(form, custom);
      host.innerHTML = next.firstElementChild.innerHTML;
      bindCustom();
    };
    const bindCustom = () => {
      $$('[data-cadd]', host).forEach((b) => {
        b.onclick = () => {
          keepInputs();
          const key = b.dataset.cadd;
          (custom[key] = custom[key] || []).push({ id: `${key}_c${Date.now().toString(36)}${custom[key].length}`, title: '', weight: '' });
          repaint();
          const ins = $$(`.kpi-ct[data-slot="${key}"]`, host); if (ins.length) ins[ins.length - 1].focus();
        };
      });
      $$('[data-cdel]', host).forEach((b) => {
        b.onclick = () => { keepInputs(); custom[b.dataset.cdel].splice(+b.dataset.i, 1); repaint(); };
      });
      $$('.kpi-cw', host).forEach((el) => {
        el.oninput = () => {
          keepInputs();
          const key = el.dataset.slot; const slot = customSlots(form).find((s) => s.key === key);
          const used = (custom[key] || []).reduce((t, x) => t + (+x.weight || 0), 0);
          const tag = $(`[data-left="${key}"]`, host);
          if (tag) { tag.textContent = `ใช้ ${used} / ${slot.budget}`; tag.classList.toggle('over', used > slot.budget); }
          const add = $(`[data-cadd="${key}"]`, host); if (add) add.disabled = used >= slot.budget;
        };
      });
      $('#kpi-csave').onclick = async () => {
        keepInputs();
        const clean2 = Object.fromEntries(Object.entries(custom).map(([kk, a]) => [kk, a.filter((x) => String(x.title).trim() || x.weight)
          .map((x) => ({ id: x.id, title: String(x.title).trim(), weight: +x.weight || 0 }))]));
        const bad = customProblems(form, clean2);
        const err = $('#kpi-cerr');
        if (bad.length) { err.hidden = false; err.innerHTML = bad.map(esc).join('<br>'); return; }
        const b = $('#kpi-csave'); b.disabled = true; b.textContent = 'กำลังบันทึก…';
        try { await saveCustom(row, clean2, by); custom = clean2; await reopenAfter(); } catch (e) { b.disabled = false; b.textContent = '💾 บันทึกหัวข้อเฉพาะตำแหน่ง'; fail(e); }
      };
    };
    bindCustom();
  }
  async function reopenAfter() { close(); await reopen(); }

  /* บันทึกร่าง / ส่ง */
  const signOf = async (r) => ({
    name: ($(`#sg-${r}-name`) || {}).value?.trim() || '',
    note: ($(`#sg-${r}-note`) || {}).value?.trim() || '',
    url: await readSignature(r),
  });
  const save = async (submit, btn) => {
    const rt = recalc();
    const mine = rt[role.edit];
    const s = summarize(row, { ratings: rt });
    if (submit) {
      const incomplete = PARTS.filter(([p]) => !s.parts[p][role.edit].complete).map(([, l]) => l.split(':')[0]);
      if (incomplete.length && !confirm(`ยังให้คะแนนไม่ครบทุกข้อใน ${incomplete.join(' และ ')}\nข้อที่ไม่ได้ให้คะแนนจะไม่ถูกนับ ต้องการส่งเลยหรือไม่?`)) return;
      if (role.edit === 'sup' && customSlots(form).length && !hasCustom(row)
        && !confirm('ยังไม่ได้กำหนด Functional Competency เฉพาะตำแหน่ง ส่งต่อเลยหรือไม่?')) return;
    }
    let sign = null;
    if (submit && role.edit !== 'self') {
      const r = role.edit === 'sup' ? 'evaluator' : 'approver';
      sign = await signOf(r);
      if (!sign.name && !sign.url) { alert('กรอกชื่อผู้ลงนาม หรือเซ็นในช่องลงนามก่อนส่ง'); return; }
    }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'กำลังบันทึก…';
    try {
      await saveScores(row, role.edit, { ratings: mine, rec: role.edit === 'self' ? null : recOf(), comment: ($('#kpi-comment') || {}).value?.trim() || '', sign }, by, submit);
      if (submit) await done(); else { close(); await reopen(); }
    } catch (e) { btn.disabled = false; btn.textContent = label; fail(e); }
  };
  const dr = $('#kpi-draft'); if (dr) dr.onclick = () => save(false, dr);
  const sb = $('#kpi-submit'); if (sb) sb.onclick = () => save(true, sb);

  const hb = $('#kpi-hr');
  if (hb) {
    hb.onclick = async () => {
      const sign = await signOf('hr');
      if (!sign.name && !sign.url) { alert('กรอกชื่อผู้ลงนามหรือเซ็นในช่องฝ่ายทรัพยากรบุคคลก่อน'); return; }
      hb.disabled = true;
      try { await hrFinal(row, { sign, by }); await done(); } catch (e) { hb.disabled = false; fail(e); }
    };
  }
  const ab = $('#kpi-ack');
  if (ab) {
    ab.onclick = async () => {
      const sign = await signOf('employee');
      if (!sign.url && !(ctx.me && ctx.me.SignatureUrl)) { alert('กรุณาเซ็นชื่อในช่อง "บุคลากรรับทราบผล" หรือกด "อัปโหลดรูป"'); return; }
      ab.disabled = true;
      try { await acknowledge(row, sign.note, sign.name || clean(row.EmployeeName), sign.url || ctx.me.SignatureUrl); await done(); }
      catch (e) { ab.disabled = false; fail(e); }
    };
  }
  $$('[data-kback]').forEach((b) => {
    b.onclick = async () => {
      const to = { self: S_SELF, sup: S_MGR, md: S_BOSS }[b.dataset.kback];
      const note = prompt(`เหตุผลที่ส่งกลับขั้น "${to}"`);
      if (note === null) return;
      b.disabled = true;
      try { await sendBack(row, to, note.trim(), by); await done(); } catch (e) { b.disabled = false; fail(e); }
    };
  });
}

const LABELS = {
  [S_SELF]: 'ประเมินตนเอง', [S_MGR]: 'ผู้บังคับบัญชาประเมิน', [S_BOSS]: 'ผู้บริหาร (MD) ประเมิน',
  [S_HR]: 'ฝ่ายบุคคลตรวจสอบ', [S_ACK]: 'พนักงานรับทราบ', [DONE]: 'เสร็จสมบูรณ์',
};
export const kpiStatusLabel = (st) => LABELS[clean(st)] || clean(st) || '—';
