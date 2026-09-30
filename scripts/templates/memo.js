/**
 * บันทึกข้อความภายใน / MEMORANDUM (Rev.02) — หน้าตาตามต้นฉบับ Word ห้ามปรับรูปแบบ
 *
 * อ่านช่องจากชื่อหัวข้อ: เรื่อง (ตัวเลือก 6 ข้อ) · ระบุเรื่อง · ระบุเหตุผล · วันที่
 * ชื่อ รหัส ตำแหน่ง สังกัด ดึงจากทะเบียนบุคลากรของผู้ยื่น
 * ผู้อนุมัติขั้นต้น = ขั้นอนุมัติแรก · ผู้อนุมัติสูงสุด = ขั้นสุดท้าย (เมื่อมีมากกว่า 1 ขั้น)
 */
import { esc } from '../core/dom.js';
import { LETTERHEAD } from '../core/letterhead.js';
import { sigImg } from './form-doc.js';

/** ฟอร์มนี้เป็นบันทึกข้อความภายในหรือไม่ */
export const isMemo = (form) => /บันทึกข้อความ|MEMORANDUM/i.test(String((form && form.Title) || ''));

const TOPICS = [
  { re: /ลางานกรณีพิเศษ|Biosoft/i, label: 'ขอลางานกรณีพิเศษ (กรณีเร่งด่วนไม่สามารถลาในระบบ Biosoft)' },
  { re: /สาย/, label: 'ลงเวลาเข้าปฏิบัติงานสายเกิน 5 นาที' },
  { re: /ไม่ได้ลงเวลาเข้า/, label: 'ไม่ได้ลงเวลาเข้าปฏิบัติงาน' },
  { re: /ไม่ได้ลงเวลาออก/, label: 'ไม่ได้ลงเวลาออกปฏิบัติงาน' },
  { re: /ขออนุมัติ/, label: 'ขออนุมัติเรื่อง', detail: true },
  { re: /อื่น/, label: 'เรื่องอื่น ๆ', detail: true },
];

function thaiDate(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function renderMemo({ fields = [], values = {}, empCode = '', requester = {}, approvals = [],
  person = {} }) {
  const byTitle = (re, pred = () => true) => fields.find((f) => re.test(String(f.Title || '')) && pred(f));
  const text = (f) => {
    if (!f) return '';
    const v = values[f.FieldKey];
    if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.Title || x.name || '') : x)).join(', ');
    return v && typeof v === 'object' ? (v.Title || v.LookupValue || '') : String(v ?? '');
  };
  const std = (k) => text(fields.find((f) => f.FieldKey === k));

  // เรื่องที่เลือก: ช่องตัวเลือกที่มีหัวข้อตามต้นฉบับ (ถ้าไม่มี ใช้ชื่อเรื่องมาตรฐานเทียบแทน)
  const topicF = fields.find((f) => ['choice', 'multichoice'].includes(f.FieldType)
    && /Biosoft|ลงเวลา|ขออนุมัติ/.test(String(f.Options || '')));
  const picked = text(topicF) || std('std_subject');
  const detail = text(byTitle(/ระบุเรื่อง|รายละเอียดเรื่อง|เรื่องที่ขออนุมัติ/)) || (topicF ? '' : std('std_subject'));
  const on = TOPICS.map((t) => t.re.test(picked));
  const detailRow = on[4] ? 4 : on[5] ? 5 : -1;

  const dateF = byTitle(/^วันที่$/, (f) => f.FieldType === 'date') || fields.find((f) => f.FieldKey === 'std_date');
  const date = thaiDate(values[dateF && dateF.FieldKey]) || thaiDate(values.std_date) || thaiDate(requester.at);
  const reasonF = byTitle(/เหตุผล/) || fields.find((f) => f.FieldType === 'textarea');
  const reason = text(reasonF);
  const name = person.name || std('std_emp_name') || requester.name || '';
  const position = person.position || text(byTitle(/^ตำแหน่ง/)) || '';
  const dept = person.dept || text(byTitle(/สังกัด/)) || std('std_emp_dept') || '';
  const code = empCode || std('std_emp_code') || '';

  const first = approvals[0] || {};
  const top = approvals.length > 1 ? approvals[approvals.length - 1] : {};
  const ok = first.result && /อนุมัติ/.test(first.result) && !/ไม่/.test(first.result);
  const no = first.result && /ไม่อนุมัติ/.test(first.result);
  const box = (checked) => `<span class="mm-box">${checked ? '✓' : ''}</span>`;
  const fill = (v, cls = '') => `<span class="mm-fill ${cls}">${v ? esc(v) : ''}</span>`;
  const signLine = (p) => `<div class="mm-sigline">${p.sig ? sigImg(p.sig) : ''}</div>`;

  return `
  <div class="ex-doc mm-doc">
    <img class="ex-letterhead" src="${LETTERHEAD}" alt="Prime Power Construction">
    <h2 class="mm-title">บันทึกข้อความภายใน / MEMORANDUM</h2>
    <div class="mm-date">วันที่ ${fill(date, 'mm-w-date')}</div>

    <div class="mm-subject">
      <div class="mm-lbl"><b>เรื่อง</b></div>
      <div class="mm-topics">${TOPICS.map((t, i) => `
        <div class="mm-topic">${box(on[i])}<span class="mm-tl">${esc(t.label)}</span>${t.detail
          ? fill(i === detailRow ? detail : '', 'mm-w-detail') : ''}</div>`).join('')}
      </div>
    </div>

    <div class="mm-to"><div class="mm-lbl"><b>เรียน</b></div>
      <div>กรรมการผู้จัดการ/ รองกรรมการผู้จัดการ / ผู้บังคับบัญชา</div></div>

    <div class="mm-info">
      <div class="mm-irow"><span class="mm-il">ชื่อ-สกุล บุคลากร</span>${fill(name, 'mm-w-half')}
        <span class="mm-il2">รหัส</span>${fill(code, 'mm-w-rest')}</div>
      <div class="mm-irow"><span class="mm-il">ตำแหน่ง</span>${fill(position, 'mm-w-half')}
        <span class="mm-il2">สังกัด</span>${fill(dept, 'mm-w-rest')}</div>
    </div>

    <div class="mm-reason-h"><b>ระบุเหตุผล</b></div>
    <div class="mm-reason">${reason
      ? `<div class="mm-reason-text">${esc(reason)}</div>` : ''}${'<div class="mm-rline"></div>'.repeat(4)}</div>

    <div class="mm-close"><b>จึงเรียนมาเพื่อขอชี้แจงและอนุมัติ</b></div>

    <div class="mm-signs">
      <div class="mm-col">
        <div class="mm-sh"><b>ผู้ขออนุมัติ</b></div>
        <div class="mm-spacer"></div>
        ${signLine(requester)}
        <div>(${fill(requester.name || name, 'mm-w-name')})</div>
        <div>วันที่${fill(thaiDate(requester.at) || (requester.sig ? date : ''), 'mm-w-sdate')}</div>
      </div>
      <div class="mm-col mm-right">
        <div class="mm-sh"><b>ผู้อนุมัติขั้นต้น</b></div>
        <div class="mm-chk">${box(ok)}<span>อนุมัติ</span></div>
        <div class="mm-chk">${box(no)}<span>ไม่อนุมัติ${fill(no ? first.note : '', 'mm-w-note')}</span></div>
        <div class="mm-rsign">
          ${signLine(first)}
          <div>(${fill(first.at ? first.name : '', 'mm-w-name2')})</div>
          <div class="mm-role">ผู้บังคับบัญชา</div>
        </div>
      </div>
    </div>

    <div class="mm-top">
      <div class="mm-sh"><b>ผู้อนุมัติสูงสุด</b></div>
      ${signLine(top)}
      <div>( รองกรรมการผู้จัดการ )</div>
      <div>วันที่ ${fill(thaiDate(top.at), 'mm-w-sdate')}</div>
    </div>
  </div>`;
}

