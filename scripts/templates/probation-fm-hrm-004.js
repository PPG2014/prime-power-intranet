/**
 * แม่แบบเอกสาร FM-HRM-004 Rev.02 แบบประเมินผลระหว่างทดลองงาน (หน้า 1/4)
 *
 * ข้อความตายตัวบนฟอร์มคงไว้ตามต้นฉบับทุกตัวอักษร ทั้งหัวข้อ ส่วนที่ 1–4
 * เกณฑ์เกรด และท้ายกระดาษ · ข้อมูลจากระบบจะถูกเติมลงช่องว่างเท่านั้น
 * เกณฑ์การให้คะแนนหน้า 2–3 เป็นเอกสารอ้างอิง ให้แนบเป็นไฟล์แยกในทะเบียนแบบฟอร์ม
 */
import { esc } from '../core/dom.js';

export const PROBATION_SET = /ทดลองงาน|ผ่านงาน/;
export const isProbation = (formSet) => PROBATION_SET.test(String(formSet || ''));

const LOGO = 'assets/img/ppc-logo-2024.png';
const SCALE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const thDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
};
const line = (v, w) => `<span class="pb-fill" style="min-width:${w}mm">${esc(v || '')}</span>`;
const box = (on) => `( <span class="pb-tick">${on ? '✓' : '&nbsp;'}</span> )`;

/**
 * @param p.employee  { name, position, section, department, startDate }
 * @param p.rounds    [{ label, date }] ครั้งที่ 1–4 และวันครบทดลองงาน
 * @param p.sections  [{ name, items:[{ id, title }] }]
 * @param p.answers   { [id]: 1–10 }
 * @param p.notes     { [id]: ความคิดเห็นเพิ่มเติมรายข้อ }
 * @param p.total     คะแนนรวม · p.grade เกรด
 * @param p.attendance{ late, absent, personal, sick, other }
 * @param p.summary   { result, confirmDate, lastDate, other }
 * @param p.sign      { evaluator, hr, approver } แต่ละช่อง { name, date, sig, approved }
 */
export function renderProbation(p = {}) {
  const emp = p.employee || {};
  const ans = p.answers || {};
  const notes = p.notes || {};
  const att = p.attendance || {};
  const sum = p.summary || {};
  const sg = p.sign || {};
  const rounds = p.rounds || [];

  let n = 0;
  const itemRows = (p.sections || []).map((sec) => `
    <tr class="pb-group"><td class="pb-topic">${esc(sec.name)}</td>
      ${SCALE.map(() => '<td></td>').join('')}<td></td></tr>
    ${sec.items.map((it) => {
    n += 1;
    const v = +ans[it.id];
    return `<tr>
        <td class="pb-topic pb-item">${n}. ${esc(it.title)}</td>
        ${SCALE.map((s) => `<td class="pb-sc">${v === s ? '✓' : ''}</td>`).join('')}
        <td class="pb-note">${esc(notes[it.id] || '')}</td>
      </tr>`;
  }).join('')}`).join('');

  const sigCell = (s = {}, extra = '') => `
    ${extra}
    <div class="pb-sigline">${s.sig ? `<img data-photo="${esc(s.sig)}" alt="">` : ''}</div>
    <div class="pb-sigline"></div>
    <div class="pb-signame">( ${esc(s.name || '')} )</div>
    <div class="pb-sigdate">วันที่ ${esc(thDate(s.date))}</div>`;

  return `
  <div class="pb-doc"><div class="pb-page">
    <div class="pb-head">
      <img class="pb-logo" src="${LOGO}" alt="Prime Power Construction">
      <div class="pb-title">แบบประเมินผลระหว่างทดลองงาน</div>
    </div>

    <table class="pb-tb">
      <colgroup><col style="width:43%"><col style="width:57%"></colgroup>
      <tr><td class="pb-band" colspan="2"><u>ส่วนที่ 1</u> : ข้อมูลพนักงานใหม่</td></tr>
      <tr>
        <td class="pb-s1l">
          ${[['ชื่อ - สกุล', emp.name], ['ตำแหน่ง', emp.position], ['แผนก', emp.section],
    ['ฝ่าย', emp.department], ['วันเริ่มงาน', thDate(emp.startDate)]]
    .map(([k, v]) => `<div class="pb-row"><span class="pb-k">${k}</span>${line(v, 42)}</div>`).join('')}
        </td>
        <td class="pb-s1r">
          ${rounds.map((r) => `<div class="pb-row">
            <span class="pb-k2">${esc(r.label)}</span>
            <span class="pb-k3">วันที่</span>${line(thDate(r.date), 34)}</div>`).join('')}
        </td>
      </tr>
    </table>

    <table class="pb-tb pb-scoretb">
      <colgroup>
        <col style="width:72mm">
        ${SCALE.map(() => '<col style="width:6.87mm">').join('')}
        <col style="width:29mm">
      </colgroup>
      <tr><td class="pb-band" colspan="12"><u>ส่วนที่ 2</u> : รายละเอียดการประเมิน</td></tr>
      <tr class="pb-h1">
        <td rowspan="3" class="pb-topic pb-center">หัวข้อการประเมิน</td>
        <td colspan="10" class="pb-center">ระดับผลการประเมิน</td>
        <td rowspan="3" class="pb-center pb-note">ความคิดเห็นเพิ่มเติม</td>
      </tr>
      <tr class="pb-h2"><td colspan="10" class="pb-arrow"><span>ดีมาก</span><i></i><span>ไม่ดี</span></td></tr>
      <tr class="pb-h3">${SCALE.map((s) => `<td class="pb-center">${s}</td>`).join('')}</tr>
      ${itemRows}
      <tr><td class="pb-topic"></td>${SCALE.map(() => '<td></td>').join('')}<td></td></tr>
      <tr class="pb-total">
        <td class="pb-topic pb-right">รวมคะแนนที่ได้</td>
        <td colspan="10" class="pb-center"><b>${p.total != null ? esc(String(p.total)) : ''}</b></td>
        <td class="pb-note">เท่ากับเกรด <b>${esc(p.grade || '')}</b></td>
      </tr>
    </table>

    <table class="pb-tb">
      <tr><td class="pb-band green"><u>หมายเหตุ</u> : เกณฑ์การให้คะแนน&nbsp; (โปรดศึกษาในหน้าถัดไป)</td></tr>
      <tr><td class="pb-grade">เกรด A = 91 - 100 คะแนน&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        B+ = 86 - 90 คะแนน&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; B = 81 - 85 คะแนน&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        C = 70 - 80 คะแนน&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; และ F = &lt; 70 คะแนน</td></tr>
    </table>

    <table class="pb-tb">
      <tr><td class="pb-band" colspan="5"><u>ส่วนที่ 3</u> : บันทึกการมาปฏิบัติงาน</td></tr>
      <tr class="pb-att-h">
        <td>มาสาย (ครั้ง)</td><td>ขาดงาน (วัน)</td><td>ลากิจ (วัน)</td><td>ลาป่วย (วัน)</td><td>ลาอื่นๆ (วัน)</td>
      </tr>
      <tr class="pb-att-v">
        <td>${esc(att.late ?? '')}</td><td>${esc(att.absent ?? '')}</td><td>${esc(att.personal ?? '')}</td>
        <td>${esc(att.sick ?? '')}</td><td>${esc(att.other ?? '')}</td>
      </tr>
    </table>

    <table class="pb-tb">
      <colgroup><col style="width:26%"><col style="width:37%"><col style="width:37%"></colgroup>
      <tr><td class="pb-band" colspan="3"><u>ส่วนที่ 4</u> : สรุปผลการประเมิน</td></tr>
      <tr><td colspan="3" class="pb-sum">
        <div class="pb-sumrow">
          <span>${box(sum.result === 'บรรจุ')} เห็นควรบรรจุ ตั้งแต่วันที่${line(thDate(sum.confirmDate), 40)}</span>
          <span>${box(sum.result === 'ต่อทดลองงาน')} ทดลองงานต่อ 30 วัน</span>
        </div>
        <div class="pb-sumrow">
          <span>${box(sum.result === 'ไม่ผ่าน')} ไม่ผ่านทดลองงาน</span>
          <span>${box(sum.result === 'อื่นๆ')} อื่นๆ (ระบุ)${line(sum.other, 52)}</span>
        </div>
        <div class="pb-sumrow indent">
          <span>ให้ปฏิบัติงานวันสุดท้าย วันที่ ${line(thDate(sum.lastDate), 34)}</span>
          <span>${line('', 58)}</span>
        </div>
      </td></tr>
      <tr class="pb-sig-h"><td>4.1 ผู้ประเมิน</td><td>4.2 ฝ่ายทรัพยากรมนุษย์</td><td>4.3 ผู้อนุมัติ</td></tr>
      <tr class="pb-sig">
        <td>${sigCell(sg.evaluator)}</td>
        <td>${sigCell(sg.hr)}</td>
        <td>${sigCell(sg.approver, `<div class="pb-approve">${box(sg.approver && sg.approver.approved === true)} อนุมัติ
             &nbsp;&nbsp;&nbsp;&nbsp;${box(sg.approver && sg.approver.approved === false)} ไม่อนุมัติ</div>`)}</td>
      </tr>
    </table>

    <div class="pb-foot-l">Form Page 1 / 4</div>
    <div class="pb-foot-r">FM-HRM-004 Rev.02 (14/9/2569)</div>
  </div></div>`;
}
