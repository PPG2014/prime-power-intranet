/**
 * หน้าต่างใบประเมิน KPI ประจำปี (ใช้แทนหน้าต่างแบบผ่านงานเมื่อชุดแบบประเมินเป็น KPI)
 *
 * คนเดียวกันเห็นต่างกันตามบทบาทและขั้นของใบ:
 *   บุคลากร         ประเมินตนเอง (ขั้นประเมินตนเอง) · ลงนามรับทราบ (ขั้นบุคลากรรับทราบ)
 *                   เห็นคะแนนหัวหน้า/ผู้บริหารเมื่อฝ่ายบุคคลส่งผลให้รับทราบแล้วเท่านั้น
 *   ผู้บังคับบัญชา   กำหนดหัวข้อเฉพาะตำแหน่ง (ตัวแดงในไฟล์) · ให้คะแนน + ข้อเสนอแนะ + ลงนาม
 *   ผู้บริหาร (MD)   ให้คะแนน + ข้อเสนอแนะ + ลงนาม (เห็นคะแนนของผู้บังคับบัญชาประกอบ)
 *   ฝ่ายบุคคล       กำหนดหัวข้อแทนได้ · ตรวจผลขั้นสุดท้าย (HR Final Check) แล้วส่งให้บุคลากรรับทราบ
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { signaturePad, bindSignaturePads, readSignature } from './signature-pad.js';
import {
  clean, extraOf, logOf, signsOf, stageOpen, noSelf, canHrReview, canBossApprove, sendBack, acknowledge,
  rolesOf, S_SELF, S_MGR, S_HR, S_BOSS, S_ACK, DONE,
} from '../services/appraisal.js';
import {
  PARTS, SCALE, FORM_LABEL, catsOf, partScore, summarize, kpiGrade, customSlots,
  customProblems, saveCustom, saveScores, hrFinal, kpiSteps, formOfRow, kpiOf, ratingsOf, hasCustom,
  kpiPhase, submitCustom, returnCustom, approveCustom, hrToMd, kpiFcBySelf, kpiFcWho,
  verOf, rubricOf, gradesOf, bonusOf, loadKpiConfig,
} from '../services/kpi.js';
import { drawerHtml, bindRubricDrawer } from './rubric-drawer.js';
import { personRef, bindPersonCards } from './person-card.js';

/** ชุดเกณฑ์ของใบที่เปิดอยู่ (เปิดได้ทีละใบ) */
let VER;
/** ผู้กำหนดหัวข้อเฉพาะตำแหน่งของใบที่เปิดอยู่ (MG = ผู้จัดการกำหนดเอง · GA = หัวหน้างาน) */
let FC_WHO = 'หัวหน้างาน';

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
  const ph = kpiPhase(row);
  const hrOk = open && canHrReview(row, who);
  const r = {
    st, ph, isEmp, isEval,
    self: isEmp && st === S_SELF && ph === 'self' && !noSelf(row) && stageOpen(ctx.cycle, S_SELF).ok,
    sup: isEval && st === S_MGR && stageOpen(ctx.cycle, S_MGR).ok,
    md: open && st === S_BOSS && canBossApprove(row, who),
    hrMid: hrOk && st === S_HR && ph === 'mid',          // ฝ่ายบุคคลตรวจผลหัวหน้า ส่งผู้บริหาร
    hr: hrOk && st === S_HR && ph === 'final',           // ฝ่ายบุคคลลงนาม ส่งบุคลากรรับทราบ
    fcHr: hrOk && st === S_SELF && ph === 'fcHr',        // ฝ่ายบุคคลตรวจหัวข้อ เปิดประเมินตนเอง
    ack: isEmp && st === S_ACK,
  };
  // แก้หัวข้อเฉพาะตำแหน่ง (ขั้นกำหนดหัวข้อ):
  //   แบบ MG → ผู้จัดการ (ผู้ถูกประเมิน) กำหนดเอง ผู้บังคับบัญชาแก้ไม่ได้
  //   แบบ GA → ผู้บังคับบัญชากำหนด
  //   ฝ่ายบุคคลทำแทนได้ทั้งสองแบบ และแก้ได้ตอนตรวจหัวข้อ
  // ใบเก่าที่ข้ามขั้นกำหนดหัวข้อ (แบบ GA) หัวหน้ายังเพิ่มได้ระหว่างประเมิน
  const bySelf = kpiFcBySelf(row);
  r.fcSubmit = open && st === S_SELF && ph === 'fc' && ((bySelf ? isEmp : isEval) || ctx.isHR || ctx.isAdmin);
  r.custom = r.fcSubmit || r.fcHr || (!bySelf && r.sup && !hasCustom(row));
  r.edit = r.self ? 'self' : r.sup ? 'sup' : r.md ? 'md' : null;
  // บุคลากรเห็นผลของหัวหน้า/ผู้บริหารเมื่อฝ่ายบุคคลส่งให้รับทราบแล้ว
  // ใบของตัวเอง: รอฝ่ายบุคคลส่งผลก่อนเสมอ แม้เป็นฝ่ายบุคคล/ผู้ดูแลระบบ
  r.seeOthers = !isEmp || [S_ACK, DONE].includes(st) || isEval || r.md || r.hr || r.hrMid;
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
          <td colspan="${2 + cols.length}">Functional Competency เฉพาะตำแหน่ง — ให้${FC_WHO}กำหนด (น้ำหนักรวมไม่เกิน ${c.budget}) · <i>ยังไม่ได้กำหนด</i></td></tr>` : ''}
        <tr class="kpi-sub"><td></td><td>คะแนนถ่วงน้ำหนักหมวด ${c.no} <span class="dim">(เต็ม ${c.weight})</span></td><td></td>
          ${cols.map((x) => `<td class="num" data-sub="${x}-${c.key}">${f1(sc[x].cats[c.key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr class="kpi-tot"><td></td><td>คะแนนรวม ${esc(label.split(':')[0])} <span class="dim">(เต็ม 100)</span></td><td></td>
        ${cols.map((x) => `<td class="num"><b data-tot="${x}-${part}">${sc[x].rated ? f1(sc[x].score) : '—'}</b>
          <div class="kpi-g" data-gr="${x}-${part}">${sc[x].rated ? kpiGrade(sc[x].score, VER)[1] : ''}</div></td>`).join('')}</tr></tfoot>
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
    return p.rated ? `${f1(p.score)} <b class="kpi-gb">${kpiGrade(p.score, VER)[1]}</b>` : '—';
  };
  const fin = (v) => (v === null ? '—' : `${f1(v)} <b class="kpi-gb">${kpiGrade(v, VER)[1]}</b>`);
  return `<div class="panel kpi-sum" id="kpi-sum">
    <div class="panel-head">สรุปผลการประเมิน <span class="panel-meta">ผู้บังคับบัญชา 50% + ผู้บริหาร 50% · Part 1 50% + Part 2 50% · คะแนนประเมินตนเองไม่นำมาคิด</span></div>
    ${show ? `<div class="kpi-scroll"><table class="ap-table kpi-sumtbl">
      <thead><tr><th>ส่วนการประเมิน</th><th class="num">ตนเอง</th><th class="num">ผู้บังคับบัญชา</th><th class="num">ผู้บริหาร</th><th class="num">ผลสุดท้าย</th><th>เกณฑ์ขั้นต่ำ (โบนัส)</th></tr></thead>
      <tbody>${PARTS.map(([part, label, short]) => `<tr><td>${esc(label.split(':')[0])} ${esc(short)}</td>
        <td class="num">${cell(part, 'self')}</td><td class="num">${cell(part, 'sup')}</td><td class="num">${cell(part, 'md')}</td>
        <td class="num">${fin(sum.parts[part].final)}</td><td>${esc(sum.bonus[part])} ขึ้นไป ทั้งสองผู้ประเมิน</td></tr>`).join('')}
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
      <span>${s.state === 'now' ? 'กำลังดำเนินการ' : s.state === 'done' ? `${s.by ? personRef(s.by) : 'เรียบร้อย'}${s.at ? ` · ${esc(dt(s.at))}` : ''}`
        : s.state === 'na' ? 'ไม่ได้กำหนด' : 'รอดำเนินการ'}</span></div></div>`).join('')}</div>`;
}

function infoHtml(row, person, cycle, mdName = '') {
  const x = extraOf(row);
  const a = x.attendance || {};
  const ro = rolesOf(row);
  const has = KPI_ATT.some(([k]) => String(a[k] ?? '').trim());
  const period = cycle && (cycle.PeriodFrom || cycle.PeriodTo)
    ? `${thDate(cycle.PeriodFrom)} – ${thDate(cycle.PeriodTo)}` : '';
  return `<div class="kpi-info">
    <div><i>ผู้ถูกประเมิน</i><b>${personRef(clean(row.EmployeeName)) || '—'}</b></div>
    <div><i>ตำแหน่ง</i><b>${esc(clean(person.Position) || '—')}</b></div>
    <div><i>ฝ่าย / แผนก</i><b>${esc([clean(row.Department), clean(row.Section)].filter(Boolean).join(' · ') || '—')}</b></div>
    <div><i>แบบประเมิน</i><b>${esc(FORM_LABEL[formOfRow(row)])}</b></div>
    <div><i>ผู้บังคับบัญชา (ผู้ประเมิน)</i><b>${personRef(clean(row.EvaluatorName)) || '<span class="kpi-no-ok">ยังไม่ได้กำหนด</span>'}</b></div>
    <div><i>ผู้บริหาร (MD)</i><b>${mdName ? personRef(mdName) : 'กรรมการผู้จัดการ'}</b></div>
    ${ro.hr && ro.hr.name ? `<div><i>ฝ่ายบุคคลผู้ตรวจ</i><b>${personRef(clean(ro.hr.name))}</b></div>` : ''}
    ${period ? `<div><i>รอบผลงาน</i><b>${esc(period)}</b></div>` : ''}
    ${(x.kpi || {}).selfDue ? `<div><i>ประเมินตนเองภายใน</i><b>${esc(thDate((x.kpi || {}).selfDue))}</b></div>` : ''}
  </div>
  <div class="ap-attbar kpi-att"><span class="dim">สถิติการปฏิบัติงาน${period ? ` (${esc(period)})` : ''}</span>
    ${has ? KPI_ATT.map(([k, label, unit]) => `<span><b>${esc(String(a[k] || 0))}</b> ${label} <i>${unit}</i></span>`).join('')
      : '<span class="dim">ฝ่ายทรัพยากรบุคคลยังไม่ได้กรอก (กรอกที่ จัดการข้อมูล → สร้างแบบประเมิน)</span>'}</div>`;
}

/** กำหนดหัวข้อเฉพาะตำแหน่ง (ข้อตัวแดง) — เพิ่มได้หลายข้อ น้ำหนักรวมไม่เกินที่กำหนด */
function customHtml(form, custom, role = {}) {
  return `<div class="panel kpi-cust" id="kpi-cust">
    <div class="panel-head">✏️ Functional Competency เฉพาะตำแหน่ง <span class="panel-meta">${FC_WHO}กำหนด · เพิ่มได้หลายข้อ น้ำหนักรวมแต่ละหมวดห้ามเกินที่กำหนด</span></div>
    ${customSlots(form, VER).map((s) => {
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
    <div class="ap-actions">
      <button class="btn${role.fcSubmit ? '-mini' : ' btn-primary'}" id="kpi-csave">💾 บันทึก${role.fcSubmit ? 'ร่าง' : 'หัวข้อเฉพาะตำแหน่ง'}</button>
      ${role.fcSubmit ? '<button class="btn btn-primary" id="kpi-csubmit">📤 ส่งให้ฝ่ายบุคคลตรวจสอบ</button>' : ''}
    </div>
    ${role.fcSubmit ? '<div class="dim kpi-cnote">ส่งแล้วฝ่ายบุคคลจะตรวจหัวข้อ และเปิดให้บุคลากรประเมินตนเอง · ไม่มีหัวข้อเพิ่มก็กดส่งได้</div>' : ''}
    ${role.fcHr ? '<div class="dim kpi-cnote">ฝ่ายบุคคลแก้หัวข้อได้ (กดบันทึก) แล้วกด "อนุมัติหัวข้อ · เปิดให้ประเมินตนเอง" ด้านล่าง</div>' : ''}
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

/** แถบเกณฑ์การประเมินด้านซ้าย (ชี้เมาส์ที่แถบแล้วเด้งออก) — ตามชุดเกณฑ์ของใบนี้ */
export function kpiDrawerHtml(ver) {
  const rub = rubricOf(ver);
  const gr = gradesOf(ver);
  const bo = bonusOf(ver);
  const f2 = (n) => (+n).toFixed(2);
  const range = (i) => (i === 0 ? `${f2(gr[0][0])} ขึ้นไป` : gr[i][0] <= 0 ? `ต่ำกว่า ${f2(gr[i - 1][0])}` : `${f2(gr[i][0])} – ${f2(gr[i - 1][0] - 0.01)}`);
  const body = `
    <section class="rb-topic" id="kpirb-tscore"><h4>เกณฑ์ให้คะแนนรายข้อ (0–10 ทีละ 0.5)</h4>
      <table><thead><tr><th>คะแนน</th><td><b>คำอธิบาย</b></td><th>เกรด</th></tr></thead><tbody>
      ${rub.slice().reverse().map(([sc, t, band, g]) => `${band ? `<tr class="rb-band"><td colspan="3">${esc(band)}</td></tr>` : ''}
        <tr><th>${sc}</th><td>${esc(t)}</td><th>${esc(g)}</th></tr>`).join('')}</tbody></table></section>
    <section class="rb-topic" id="kpirb-tgrade"><h4>ช่วงคะแนนและเกรด</h4>
      <table><tbody>${gr.map((g, i) => `<tr><th>${esc(g[1])}</th><td>${range(i)}${g[2] ? ` · ${esc(g[2])}` : ''}</td></tr>`).join('')}</tbody></table></section>
    <section class="rb-topic" id="kpirb-tcalc"><h4>วิธีคิดคะแนนและเกณฑ์โบนัส</h4>
      <table><tbody>
        <tr><th>1</th><td>คะแนนข้อ = คะแนนที่ให้ ÷ 10 × น้ำหนักรายข้อ</td></tr>
        <tr><th>2</th><td>คะแนนหมวด = ผลรวมคะแนนข้อ × น้ำหนักหมวด ÷ น้ำหนักรายข้อรวมของหมวด · รวมทุกหมวดเต็ม 100</td></tr>
        <tr><th>3</th><td>ผลแต่ละ Part = ผู้บังคับบัญชา 50% + ผู้บริหาร 50% (คะแนนประเมินตนเองไม่นำมาคิด)</td></tr>
        <tr><th>4</th><td>คะแนนรวม = Part 1 50% + Part 2 50%</td></tr>
        <tr><th>★</th><td>เกณฑ์พิจารณาโบนัส/ปรับเงินเดือน: Part 1 ได้ <b>${esc(bo.skill)}</b> ขึ้นไป และ Part 2 ได้ <b>${esc(bo.behavior)}</b> ขึ้นไป
          ทั้งจากผู้บังคับบัญชาและผู้บริหาร</td></tr>
      </tbody></table></section>`;
  return drawerHtml({
    id: 'kpirb', title: `เกณฑ์การประเมิน KPI · ชุด ${ver}`, tab: '📋 เกณฑ์การประเมิน',
    jumps: [{ id: 'score', label: 'คะแนน 0–10' }, { id: 'grade', label: 'เกรด' }, { id: 'calc', label: 'วิธีคิด / โบนัส' }],
    body,
  });
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
  await loadKpiConfig();
  VER = verOf(row);
  FC_WHO = kpiFcWho(row);
  const dir = await list('directory').catch(() => []);
  const person = dir.find((p) => low(p.Email) === low(row.EmployeeEmail)) || {};
  const role = kpiRole(row, ctx);
  const form = formOfRow(row);
  const k = kpiOf(row);
  let custom = JSON.parse(JSON.stringify(k.custom || {}));
  /** หัวข้อเฉพาะตำแหน่งที่แก้ในจอแต่ยังไม่ได้บันทึก */
  const customDirty = () => {
    const now = {};
    $$('.kpi-ct').forEach((el) => { (now[el.dataset.slot] = now[el.dataset.slot] || []).push(el.value.trim()); });
    const was = Object.fromEntries(Object.entries(k.custom || {}).map(([kk, a]) => [kk, a.map((x) => x.title)]));
    return JSON.stringify(Object.fromEntries(Object.entries(now).filter(([, a]) => a.some(Boolean))))
      !== JSON.stringify(Object.fromEntries(Object.entries(was).filter(([, a]) => a.length)));
  };
  const sg = signsOf(row);
  const data = { self: { ...ratingsOf(row, 'self') }, sup: { ...ratingsOf(row, 'sup') }, md: { ...ratingsOf(row, 'md') }, rec: k.rec || {} };
  // คอลัมน์ที่เห็น: บุคลากรก่อนรับทราบผลเห็นเฉพาะของตัวเอง · ใบที่ไม่มีขั้นประเมินตนเองไม่ต้องมีคอลัมน์ตนเอง
  const cols = ['self', 'sup', 'md'].filter((c) => (c === 'self' ? !noSelf(row) || Object.keys(data.self).length : role.seeOthers));
  const sum = summarize(row);
  const by = ctx.userName || '';
  const title = `${clean(row.EmployeeName)} · ประเมิน KPI ประจำปี`;

  // ผู้บริหารของใบ: กำหนดไว้ในใบ หรือกรรมการผู้จัดการในทะเบียนบุคลากร
  const mdName = clean((rolesOf(row).approver || {}).name)
    || clean((dir.find((p) => clean(p.Position) === 'กรรมการผู้จัดการ' && p.IsActive !== false) || {}).Title);
  const body = `
    <div class="ap-stats small">
      <div><b>${esc(kpiStatusLabel(role.st, row))}</b><span>สถานะ</span></div>
      <div><b>${role.seeOthers ? f1(sum.parts.skill.final) : '—'}</b><span>Part 1 (สุดท้าย)</span></div>
      <div><b>${role.seeOthers ? f1(sum.parts.behavior.final) : '—'}</b><span>Part 2 (สุดท้าย)</span></div>
      <div><b>${role.seeOthers && sum.final !== null ? `${f1(sum.final)} · ${esc(sum.grade)}` : '—'}</b><span>คะแนน / เกรดสุดท้าย</span></div>
    </div>
    ${infoHtml(row, person, ctx.cycle, mdName)}
    <details class="kpi-steps-in"><summary>ขั้นตอนการประเมิน · ${esc(kpiStatusLabel(role.st, row))}</summary>${kpiTrackHtml(row)}</details>
    ${role.custom ? customHtml(form, custom, role) : ''}
    ${role.fcHr ? `<div class="panel kpi-hrbox"><div class="panel-head">ฝ่ายบุคคลตรวจหัวข้อเฉพาะตำแหน่ง</div>
      <div class="kpi-hrrow">
        <label>ให้บุคลากรประเมินตนเองภายในวันที่ <span class="dim">(ไม่บังคับ)</span>
          <input type="date" id="kpi-selfdue" value="${esc(k.selfDue || (ctx.cycle && String(ctx.cycle.EndDate || '').slice(0, 10)) || '')}"></label>
        <span class="dim">${hasCustom(row) ? `${FC_WHO}กำหนดหัวข้อแล้ว` : `${FC_WHO}ไม่ได้เพิ่มหัวข้อเฉพาะตำแหน่ง`} · ${esc(clean(row.EvaluatorName) || 'ยังไม่มีผู้ประเมิน')}</span>
      </div></div>` : ''}
    ${role.hrMid ? '<div class="panel-note kpi-howto">ตรวจคะแนนและข้อเสนอแนะของผู้บังคับบัญชา แล้วกด <b>ส่งให้ผู้บริหารประเมิน</b> · ต้องแก้ให้กด "ส่งกลับให้ผู้บังคับบัญชา"</div>' : ''}
    ${role.edit ? `<div class="panel-note kpi-howto">ให้คะแนนรายข้อ 0–10 (ทีละ 0.5) ในคอลัมน์ <b>${COL[role.edit]}</b> ตามเกณฑ์ที่แถบ <b>📋 เกณฑ์การประเมิน</b> ด้านซ้ายจอ (ชี้เมาส์ที่แถบเพื่อเปิด) ·
      ระบบคิดคะแนนถ่วงน้ำหนักให้ทันที · กด "บันทึกร่าง" เก็บไว้ทำต่อได้</div>` : ''}
    ${PARTS.map(([part, label]) => partTable(part, label, catsOf(form, part, k.custom || {}, VER), cols, data, role)).join('')}
    <div id="kpi-sumhost">${summaryHtml(sum, role)}</div>
    ${role.edit ? `<label class="ap-comment">ความเห็นเพิ่มเติม (${COL[role.edit]})
      <textarea id="kpi-comment" rows="2">${esc(role.edit === 'self' ? (row.SelfComment || '') : role.edit === 'sup' ? (row.MgrComment || '') : (row.HeadComment || ''))}</textarea></label>` : ''}
    <div class="panel"><div class="panel-head">ลงนาม</div>
      ${role.edit === 'self' ? `<div class="panel-note kpi-howto">ขั้นประเมินตนเอง<b>ยังไม่ต้องลงนาม</b> — กดส่งแบบประเมินได้เลย ·
        บุคลากรลงนามรับทราบผลได้เมื่อผู้บริหารประเมินและลงนามแล้ว และฝ่ายทรัพยากรบุคคลตรวจสอบและส่งผลกลับมาให้</div>` : ''}
      <div class="ap-signs">
        ${signBox('ผู้บังคับบัญชา (Proposed by)', { name: clean(row.EvaluatorName), ...sg.evaluator }, 'evaluator', role.sup, 'ลงนามเมื่อผู้บังคับบัญชาประเมินเสร็จ')}
        ${signBox('ผู้บริหาร (Approved by)', sg.approver || {}, 'approver', role.md, 'ลงนามเมื่อผู้บริหารประเมินเสร็จ')}
        ${signBox('ฝ่ายทรัพยากรบุคคล (HR Final Check)', sg.hr || {}, 'hr', role.hr, 'ลงนามหลังผู้บริหารลงนามแล้ว')}
        ${signBox('บุคลากรรับทราบผล (Staff)', { name: clean(row.EmployeeName), ...sg.employee }, 'employee', role.ack, 'เปิดให้ลงนามเมื่อฝ่ายทรัพยากรบุคคลส่งผลให้รับทราบ')}
      </div></div>
    ${logHtml(row)}`;

  const footer = `
    ${role.sup && !noSelf(row) ? '<button class="btn-mini warn" data-kback="self">↩ ส่งกลับให้บุคลากรแก้</button>' : ''}
    ${role.md ? '<button class="btn-mini warn" data-kback="sup">↩ ส่งกลับให้ผู้บังคับบัญชา</button>' : ''}
    ${role.hr ? '<button class="btn-mini warn" data-kback="md">↩ ส่งกลับให้ผู้บริหาร</button>' : ''}
    ${role.hrMid ? '<button class="btn-mini warn" data-kback="sup">↩ ส่งกลับให้ผู้บังคับบัญชา</button>' : ''}
    ${role.fcHr ? `<button class="btn-mini warn" id="kpi-fcback">↩ ส่งหัวข้อกลับให้${kpiFcBySelf(row) ? 'ผู้จัดการ' : 'หัวหน้า'}แก้</button>` : ''}
    <button class="btn-mini" id="kpi-print">⬇ พิมพ์แบบประเมิน</button>
    <button class="btn-mini" id="kpi-close">ปิด</button>
    ${role.edit ? '<button class="btn-mini" id="kpi-draft">💾 บันทึกร่าง</button>' : ''}
    ${role.self ? '<button class="btn btn-primary" id="kpi-submit">ส่งแบบประเมินตนเอง (ยังไม่ต้องลงนาม)</button>' : ''}
    ${role.sup ? '<button class="btn btn-primary" id="kpi-submit">ลงนามและส่งให้ฝ่ายบุคคลตรวจสอบ</button>' : ''}
    ${role.md ? '<button class="btn btn-primary" id="kpi-submit">ลงนามและส่งให้ฝ่ายบุคคล</button>' : ''}
    ${role.fcHr ? `<button class="btn btn-primary" id="kpi-fcok">✓ อนุมัติหัวข้อ · ${noSelf(row) ? 'ส่งให้ผู้บังคับบัญชาประเมิน' : 'เปิดให้ประเมินตนเอง'}</button>` : ''}
    ${role.hrMid ? '<button class="btn btn-primary" id="kpi-hrmid">ตรวจแล้ว · ส่งให้ผู้บริหารประเมิน</button>' : ''}
    ${role.hr ? '<button class="btn btn-primary" id="kpi-hr">ลงนาม · ส่งให้บุคลากรรับทราบ</button>' : ''}
    ${role.ack ? '<button class="btn btn-primary" id="kpi-ack">✓ ลงนามรับทราบผล</button>' : ''}`;

  const close = openModal({ title, wide: true, body, footer });
  $('.modal')?.classList.add('kpi-modal');
  // กรอบย่อย "ขั้นตอนการประเมิน" อยู่นอกกรอบหลัก ชิดด้านขวา (จอแคบ → แสดงในกรอบหลักแทน)
  {
    const mask = $('#mask'); const modal = $('.modal');
    if (mask && modal) {
      const wrap = document.createElement('div');
      wrap.className = 'kpi-wrap';
      mask.insertBefore(wrap, modal);
      wrap.appendChild(modal);
      wrap.insertAdjacentHTML('beforeend', `<aside class="kpi-side" aria-label="ขั้นตอนการประเมิน">
        <div class="kpi-side-h">ขั้นตอนการประเมิน</div>
        <div class="kpi-side-b">${kpiTrackHtml(row)}</div></aside>`);
    }
  }
  // แถบเกณฑ์อยู่นอกกรอบหน้าต่าง (ลอยชิดขอบจอ) · ปิดหน้าต่าง = แถบหายไปด้วย
  const root = $('#overlay-root');
  root.insertAdjacentHTML('beforeend', kpiDrawerHtml(VER));
  bindRubricDrawer('kpirb');
  bindPersonCards();   // ชี้ชื่อบุคลากร → การ์ดข้อมูล
  new MutationObserver((_, ob) => {
    if (!$('#kpirb-drawer')) { document.body.classList.remove('rb-open'); ob.disconnect(); }
  }).observe(root, { childList: true });
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
    // บุคลากรก่อนได้รับแจ้งผล: เอกสารมีเฉพาะคะแนนของตัวเอง
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
      const cats = catsOf(form, part, k.custom || {}, VER);
      cols.forEach((c) => {
        const s = partScore(cats, rt[c]);
        cats.forEach((cat) => { const el = $(`[data-sub="${c}-${cat.key}"]`); if (el) el.textContent = f1(s.cats[cat.key]); });
        const t = $(`[data-tot="${c}-${part}"]`); if (t) t.textContent = s.rated ? f1(s.score) : '—';
        const g = $(`[data-gr="${c}-${part}"]`); if (g) g.textContent = s.rated ? kpiGrade(s.score, VER)[1] : '';
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
      next.innerHTML = customHtml(form, custom, role);
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
          const key = el.dataset.slot; const slot = customSlots(form, VER).find((s) => s.key === key);
          const used = (custom[key] || []).reduce((t, x) => t + (+x.weight || 0), 0);
          const tag = $(`[data-left="${key}"]`, host);
          if (tag) { tag.textContent = `ใช้ ${used} / ${slot.budget}`; tag.classList.toggle('over', used > slot.budget); }
          const add = $(`[data-cadd="${key}"]`, host); if (add) add.disabled = used >= slot.budget;
        };
      });
      const cleaned = () => {
        keepInputs();
        const clean2 = Object.fromEntries(Object.entries(custom).map(([kk, a]) => [kk, a.filter((x) => String(x.title).trim() || x.weight)
          .map((x) => ({ id: x.id, title: String(x.title).trim(), weight: +x.weight || 0 }))]));
        const bad = customProblems(form, clean2, VER);
        const err = $('#kpi-cerr');
        if (bad.length) { err.hidden = false; err.innerHTML = bad.map(esc).join('<br>'); return null; }
        return clean2;
      };
      $('#kpi-csave').onclick = async () => {
        const clean2 = cleaned(); if (!clean2) return;
        const b = $('#kpi-csave'); const label = b.textContent; b.disabled = true; b.textContent = 'กำลังบันทึก…';
        try { await saveCustom(row, clean2, by); custom = clean2; await reopenAfter(); } catch (e) { b.disabled = false; b.textContent = label; fail(e); }
      };
      const cs = $('#kpi-csubmit');
      if (cs) {
        cs.onclick = async () => {
          const clean2 = cleaned(); if (!clean2) return;
          const n = Object.values(clean2).reduce((t, a) => t + a.length, 0);
          if (!confirm(n ? `ส่งหัวข้อเฉพาะตำแหน่ง ${n} ข้อ ให้ฝ่ายบุคคลตรวจสอบ?` : 'ยังไม่ได้เพิ่มหัวข้อเฉพาะตำแหน่ง — ส่งให้ฝ่ายบุคคลตรวจสอบเลยหรือไม่?')) return;
          cs.disabled = true; cs.textContent = 'กำลังส่ง…';
          try { await submitCustom(row, clean2, by); await done(); } catch (e) { cs.disabled = false; cs.textContent = '📤 ส่งให้ฝ่ายบุคคลตรวจสอบ'; fail(e); }
        };
      }
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
      if (role.edit === 'sup' && customSlots(form, VER).length && !hasCustom(row)
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
  const fcOk = $('#kpi-fcok');
  if (fcOk) {
    fcOk.onclick = async () => {
      if ($('#kpi-csave') && customDirty() && !confirm('มีหัวข้อที่แก้ไว้แต่ยังไม่ได้บันทึก — อนุมัติโดยไม่บันทึกที่แก้?')) return;
      fcOk.disabled = true;
      try { await approveCustom(row, { by, due: ($('#kpi-selfdue') || {}).value || '' }); await done(); } catch (e) { fcOk.disabled = false; fail(e); }
    };
  }
  const fcBack = $('#kpi-fcback');
  if (fcBack) {
    fcBack.onclick = async () => {
      const note = prompt(`เหตุผล / สิ่งที่ให้${FC_WHO}แก้`);
      if (note === null) return;
      fcBack.disabled = true;
      try { await returnCustom(row, note.trim(), by); await done(); } catch (e) { fcBack.disabled = false; fail(e); }
    };
  }
  const hm = $('#kpi-hrmid');
  if (hm) {
    hm.onclick = async () => {
      hm.disabled = true;
      try { await hrToMd(row, { by }); await done(); } catch (e) { hm.disabled = false; fail(e); }
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
      // ส่งกลับให้บุคลากรแก้ → กลับไปขั้นประเมินตนเอง (ไม่ใช่ขั้นกำหนดหัวข้อ)
      const note = prompt(`เหตุผลที่ส่งกลับขั้น "${to}"`);
      if (note === null) return;
      b.disabled = true;
      try { await sendBack(row, to, note.trim(), by); await done(); } catch (e) { b.disabled = false; fail(e); }
    };
  });
}

const LABELS = {
  [S_SELF]: 'ประเมินตนเอง', [S_MGR]: 'ผู้บังคับบัญชาประเมิน', [S_BOSS]: 'ผู้บริหาร (MD) ประเมิน',
  [S_HR]: 'ฝ่ายบุคคลตรวจสอบ', [S_ACK]: 'บุคลากรรับทราบ', [DONE]: 'เสร็จสมบูรณ์',
  fc: 'กำหนดหัวข้อเฉพาะตำแหน่ง', fcHr: 'ฝ่ายบุคคลตรวจหัวข้อ', self: 'ประเมินตนเอง',
  mid: 'ฝ่ายบุคคลตรวจสอบ (ก่อนส่งผู้บริหาร)', final: 'ฝ่ายบุคคลลงนาม',
};
/** ชื่อขั้นของใบ KPI — ส่งใบมาด้วยจะได้ชื่อขั้นย่อย (กำหนดหัวข้อ / ตรวจหัวข้อ / ตรวจก่อนส่งผู้บริหาร / ลงนาม) */
export const kpiStatusLabel = (st, row = null) => (row && LABELS[kpiPhase({ ...row, Status: st })]) || LABELS[clean(st)] || clean(st) || '—';
