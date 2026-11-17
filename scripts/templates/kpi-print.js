/**
 * เอกสารแบบประเมิน KPI ประจำปี (พิมพ์ / บันทึกเป็น PDF)
 * หน้า 1 = Part 1 Skill / Functional Competency · หน้า 2 = Part 2 Behavioral Competency + สถิติ + สรุปผล + ลงนาม
 * รูปแบบตามไฟล์ Excel ของฝ่ายบุคคล: คะแนนบุคลากร / ผู้บังคับบัญชา / ผู้บริหาร · คะแนนถ่วงน้ำหนักรายหมวด
 */
import { esc } from '../core/dom.js';
import { clean, extraOf, rolesOf, signsOf } from '../services/appraisal.js';
import { PARTS, FORM_LABEL, catsOf, partScore, summarize, kpiGrade, formOfRow, kpiOf, ratingsOf } from '../services/kpi.js';
import { KPI_ATT } from '../components/kpi-sheet.js';
import { openPRWindow } from './pr-fm-pur-004.js';

const LOGO = 'assets/img/ppc-logo-2024.png';
const f2 = (n) => (n === null || n === undefined ? '' : (+n).toFixed(2));
const v = (x) => (x === undefined || x === null || x === '' ? '' : String(x));
const thDate = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return isNaN(t) ? String(d) : `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear() + 543}`;
};
const REC = [['s', 'สิ่งที่บุคลากรปฏิบัติได้อย่างมีประสิทธิภาพ (Strength)'], ['i', 'สิ่งที่บุคลากรควรปรับปรุง (Areas for Improvement)'],
  ['d', 'สิ่งที่บุคลากรควรได้รับการพัฒนา (Development program)']];

function head(row, person, cycle, part) {
  const period = cycle && (cycle.PeriodFrom || cycle.PeriodTo) ? `${thDate(cycle.PeriodFrom)} – ${thDate(cycle.PeriodTo)}` : '';
  return `<div class="kp-head">
    <img src="${LOGO}" alt="" class="kp-logo">
    <div><div class="kp-title">แบบประเมินผลการทำงาน บริษัท ไพร์ม พาวเวอร์ คอนสตรัคชั่น จำกัด</div>
      <div class="kp-sub">${esc(clean(cycle && cycle.Title) || 'ประเมิน KPI ประจำปี')}${period ? ` · รอบผลงาน ${esc(period)}` : ''} · ${esc(FORM_LABEL[formOfRow(row)])}</div></div>
  </div>
  <table class="kp-who"><tr>
    <td><i>ชื่อ-สกุล</i> ${esc(clean(row.EmployeeName))}</td><td><i>ตำแหน่ง</i> ${esc(clean(person.Position))}</td></tr>
    <tr><td><i>ฝ่าย</i> ${esc(clean(row.Department))}</td><td><i>แผนก</i> ${esc(clean(row.Section))}</td></tr></table>
  <div class="kp-part">${esc(part)}</div>`;
}

function table(cats, rt) {
  const sc = { self: partScore(cats, rt.self), sup: partScore(cats, rt.sup), md: partScore(cats, rt.md) };
  return `<table class="kp-tbl">
    <thead><tr><th style="width:9mm">ข้อ</th><th>KPI / ตัวชี้วัดผลการปฏิบัติงาน</th><th style="width:14mm">น้ำหนัก</th>
      <th style="width:15mm">บุคลากร</th><th style="width:17mm">ผู้บังคับบัญชา</th><th style="width:15mm">ผู้บริหาร</th></tr></thead>
    <tbody>${cats.map((c) => `
      <tr class="kp-cat"><td>${c.no}</td><td colspan="5">${esc(c.name)} <span>(น้ำหนักหมวด ${c.weight})</span></td></tr>
      ${c.items.map((it) => `<tr${it.custom ? ' class="kp-fc"' : ''}><td>${esc(it.code)}</td><td>${esc(it.title)}${
        ['sup', 'md'].map((w) => (rt[w][it.id + '__note'] ? `<div class="kp-note">${w === 'sup' ? 'ผู้บังคับบัญชา' : 'ผู้บริหาร'}: ${esc(rt[w][it.id + '__note'])}</div>` : '')).join('')}</td>
        <td class="n">${it.weight}</td><td class="n">${esc(v(rt.self[it.id]))}</td><td class="n">${esc(v(rt.sup[it.id]))}</td><td class="n">${esc(v(rt.md[it.id]))}</td></tr>`).join('')}
      <tr class="kp-sub"><td></td><td>Weighted คะแนนหมวด ${c.no} (เต็ม ${c.weight})</td><td></td>
        ${['self', 'sup', 'md'].map((w) => `<td class="n">${sc[w].rated ? f2(sc[w].cats[c.key]) : ''}</td>`).join('')}</tr>`).join('')}
    </tbody>
    <tfoot><tr><td></td><td>คะแนนรวมทั้งหมด (100)</td><td></td>
      ${['self', 'sup', 'md'].map((w) => `<td class="n">${sc[w].rated ? `${f2(sc[w].score)}<br>${kpiGrade(sc[w].score)[1]}` : ''}</td>`).join('')}</tr></tfoot>
  </table>`;
}

function recs(rec, part) {
  const val = (w, k) => (((rec[w] || {})[part] || {})[k] || '');
  if (!['sup', 'md'].some((w) => REC.some(([k]) => val(w, k)))) return '';
  return `<table class="kp-rec"><thead><tr><th>ข้อเสนอแนะเพิ่มเติม</th><th>ผู้บังคับบัญชา</th><th>ผู้บริหาร</th></tr></thead>
    <tbody>${REC.map(([k, t]) => `<tr><td>${esc(t)}</td><td>${esc(val('sup', k))}</td><td>${esc(val('md', k))}</td></tr>`).join('')}</tbody></table>`;
}

function signLine(title, s = {}, fallback = '') {
  return `<div class="kp-sign"><div class="kp-sigimg">${s.url ? `<img data-photo="${esc(s.url)}" alt="">` : ''}</div>
    <div class="kp-line">(${esc(s.name || fallback || '..................................................')})</div>
    <div>${esc(title)}</div><div>วันที่ ${s.at ? esc(thDate(s.at)) : '......../......../........'}</div></div>`;
}

export function renderKpi(row, { person = {}, cycle = null, ratings = null, hideOthers = false } = {}) {
  const form = formOfRow(row);
  const k = kpiOf(row);
  const x = extraOf(row);
  // คะแนนที่กำลังกรอกในหน้าต่าง (ยังไม่บันทึก) หรือคะแนนที่บันทึกในใบ
  const R = {
    self: (ratings && ratings.self) || ratingsOf(row, 'self'),
    sup: (ratings && ratings.sup) || ratingsOf(row, 'sup'),
    md: (ratings && ratings.md) || ratingsOf(row, 'md'),
  };
  const sum = summarize(row, { ratings: R });
  const att = x.attendance || {};
  const sg = signsOf(row);
  const ro = rolesOf(row);
  const pages = PARTS.map(([part, label], i) => `<div class="kp-page">
    ${head(row, person, cycle, label)}
    ${table(catsOf(form, part, k.custom || {}), R)}
    ${hideOthers ? '' : recs(k.rec || {}, part)}
    ${i === 1 ? `
      <table class="kp-sum"><thead><tr><th>สรุปผลการประเมิน</th><th>ผู้บังคับบัญชา</th><th>ผู้บริหาร</th><th>ผลสุดท้าย (50 : 50)</th></tr></thead>
        <tbody>${PARTS.map(([p, l, short]) => {
          const s = sum.parts[p];
          const g = (o) => (o.rated ? `${f2(o.score)} (${kpiGrade(o.score)[1]})` : '');
          return `<tr><td>${esc(l.split(':')[0])} ${esc(short)}</td><td class="n">${g(s.sup)}</td><td class="n">${g(s.md)}</td>
            <td class="n">${s.final === null ? '' : `${f2(s.final)} (${kpiGrade(s.final)[1]})`}</td></tr>`;
        }).join('')}
        <tr class="kp-final"><td>คะแนนรวม / เกรดสุดท้าย</td><td class="n">${f2(sum.total.sup)}</td><td class="n">${f2(sum.total.md)}</td>
          <td class="n">${sum.final === null ? '' : `${f2(sum.final)} · ${esc(sum.grade)}`}</td></tr></tbody></table>
      <div class="kp-att"><b>สถิติการปฏิบัติงาน</b> ${KPI_ATT.map(([kk, l, u]) => `${l} ${esc(String(att[kk] || 0))} ${u}`).join(' · ')}</div>
      <div class="kp-signs">
        ${signLine("Staff's name (บุคลากรรับทราบ)", sg.employee || {}, clean(row.EmployeeName))}
        ${signLine('Proposed by (ผู้บังคับบัญชา)', sg.evaluator || {}, clean(row.EvaluatorName))}
        ${signLine('Approved by (ผู้บริหาร)', sg.approver || {}, clean(ro.approver && ro.approver.name))}
        ${signLine('ฝ่ายทรัพยากรบุคคล', sg.hr || {})}
      </div>` : ''}
  </div>`).join('');
  return `<div class="pr-doc kp-doc">${pages}</div>`;
}

export function printKpi(row, opts = {}) {
  openPRWindow(renderKpi(row, opts), `แบบประเมิน KPI — ${clean(row.EmployeeName)}`);
}
