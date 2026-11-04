/**
 * แบบฟอร์มขอเบิกสวัสดิการของพนักงาน (ฝ่ายทรัพยากรบุคคล) — หน้าตาตามต้นฉบับ Excel ห้ามปรับรูปแบบ
 *
 * ใช้กับแบบฟอร์มที่ชื่อมีคำว่า "สวัสดิการของพนักงาน" (รหัสฟอร์มตั้งเองได้ เช่น FM-HRM-007)
 * ช่องกรอกกำหนดในโค้ด (EMP_WELFARE_FIELDS) — ไม่ต้องเพิ่มช่องในหน้า ช่องกรอกของแบบฟอร์ม
 *
 * ช่องลงนาม 4 ช่อง จับคู่กับลำดับในเส้นทางอนุมัติตามชื่อขั้น
 *   ทราบ (ฝ่ายทรัพยากรบุคคล) · ตรวจสอบ (รองกรรมการผู้จัดการ) · อนุมัติ (กรรมการผู้จัดการ)
 *   ชื่อในวงเล็บ = ผู้ที่กดอนุมัติจริง · ยังไม่ถึงขั้นนั้นแสดงชื่อตามต้นฉบับ
 */
import { esc } from '../core/dom.js';
import { LETTERHEAD } from '../core/letterhead.js';
import { sigImg } from './form-doc.js';
import { thaiDateShort } from '../utils/format.js';

export const isEmpWelfare = (form) => /สวัสดิการของพนักงาน|สวัสดิการพนักงาน/.test(String((form && form.Title) || ''))
  && !/ห้องพัก/.test(String((form && form.Title) || ''));

export const EW = { type: 'ew_type', shoe: 'ew_shoe_amount', other: 'ew_other', otherAmt: 'ew_other_amount', docs: 'ew_docs', files: 'ew_files' };
export const EW_TYPES = ['เงินช่วยเหลือค่าคลอดบุตร', 'เงินช่วยเหลือการฌาปนกิจญาติสายตรง', 'ค่ารองเท้าเซฟตี้', 'อื่นๆ'];
export const SHOE_MAX = 1000;

const SEC = 'รายละเอียดการขอเบิก';
/** ช่องกรอกของแบบฟอร์ม (ใช้เมื่อยังไม่ได้ตั้งช่องกรอกในตาราง FormFields) */
export function empWelfareFields(code) {
  let n = 0;
  const f = (FieldKey, Title, FieldType, extra = {}) => ({ FormCode: code, FieldKey, Title, FieldType, Section: SEC,
    IsRequired: 'No', IsActive: true, Options: '', ShowIf: '', HelpText: '', ColumnWidth: 'half', DefaultValue: '', SortOrder: (n += 1), ...extra });
  return [
    f('std_subject', 'ชื่อเรื่อง', 'text', { IsRequired: 'Yes', Section: 'ข้อมูลผู้ยื่น', DefaultValue: 'ขอเบิกสวัสดิการพนักงาน' }),
    f(EW.type, 'ขอเบิกเงินสวัสดิการพนักงานในกรณี', 'choice', { IsRequired: 'Yes', ColumnWidth: 'full', Options: EW_TYPES.join('\n'),
      HelpText: 'ค่าคลอดบุตร 3,000 บาท · ฌาปนกิจญาติสายตรง 5,000 บาท · รองเท้าเซฟตี้เบิกตามจริงไม่เกิน 1,000 บาท' }),
    f(EW.shoe, 'จำนวนเงินค่ารองเท้าเซฟตี้ (บาท)', 'currency', { IsRequired: 'Yes', ShowIf: `${EW.type}=ค่ารองเท้าเซฟตี้`,
      HelpText: 'เบิกจ่ายตามจริงได้ไม่เกิน 1,000 บาท' }),
    f(EW.other, 'อื่นๆ ระบุ', 'text', { IsRequired: 'Yes', ShowIf: `${EW.type}=อื่นๆ` }),
    f(EW.otherAmt, 'จำนวนเงิน (บาท)', 'currency', { ShowIf: `${EW.type}=อื่นๆ` }),
    f(EW.docs, 'พร้อมกันนี้ได้แนบเอกสาร ดังนี้', 'textarea', { ColumnWidth: 'full',
      HelpText: 'บรรทัดละ 1 รายการ เช่น สำเนาสูติบัตร · ไม่กรอก = ใช้ชื่อไฟล์ที่แนบ' }),
    f(EW.files, 'แนบเอกสารประกอบ', 'file', { ColumnWidth: 'full', HelpText: 'เช่น สำเนาสูติบัตร ใบมรณบัตร ใบเสร็จค่ารองเท้า' }),
  ];
}

/** ผู้ลงนามตามต้นฉบับ (แสดงเมื่อขั้นนั้นยังไม่มีคนกดอนุมัติ) */
const DEFAULT_SIGNERS = { ack: 'นางสาวพรสวรรค์ ธานี', check: 'กานต์ธิดา ใสสะอาด', approve: 'ไพรัช เขียนเขว้า' };

const money = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return n ? n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : ''; };
const ok = (a) => a && a.result && /อนุมัติ/.test(a.result) && !/ไม่/.test(a.result);

/** จับคู่ลำดับอนุมัติกับช่องลงนาม 3 ช่อง ตามชื่อขั้น · ที่เหลือเติมตามลำดับ */
function signSlots(approvals = []) {
  const left = [...approvals];
  const take = (re) => { const i = left.findIndex((a) => re.test(String(a.role || ''))); return i < 0 ? null : left.splice(i, 1)[0]; };
  const slots = {
    ack: take(/ทรัพยากรบุคคล|บุคคล|HR|ทราบ/i),
    check: take(/รองกรรมการ|ตรวจสอบ/),
    approve: take(/กรรมการผู้จัดการ|อนุมัติ/),
  };
  ['ack', 'check', 'approve'].forEach((k) => { if (!slots[k] && left.length) slots[k] = left.shift(); });
  return slots;
}

export function renderEmpWelfare({ fields = [], values = {}, empCode = '', requester = {}, approvals = [], person = {}, submitted = '' }) {
  const v = (k) => values[k];
  const type = String(v(EW.type) || '').trim();
  const name = person.name || v('std_emp_name') || requester.name || '';
  const code = empCode || v('std_emp_code') || '';
  const position = person.position || '';
  const dept = person.dept || v('std_emp_dept') || '';
  const date = thaiDateShort(submitted || v('std_date') || new Date().toISOString());

  // รายการเอกสารที่แนบ: ที่พิมพ์ไว้ → ไม่มีใช้ชื่อไฟล์แนบ (สูงสุด 3 บรรทัดตามต้นฉบับ แต่แสดงครบถ้ามีมากกว่า)
  const typed = String(v(EW.docs) || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const fileNames = fields.filter((f) => f.FieldType === 'file')
    .flatMap((f) => (Array.isArray(v(f.FieldKey)) ? v(f.FieldKey) : [])).map((x) => String((x && x.name) || '').trim()).filter(Boolean);
  const docs = typed.length ? typed : fileNames;
  const docRows = Array.from({ length: Math.max(3, docs.length) }, (_, i) => docs[i] || '');

  const box = (on) => `<span class="ew-box">${on ? '✓' : ''}</span>`;
  const fill = (t, cls = '') => `<span class="ew-fill ${cls}">${t ? esc(t) : ''}</span>`;
  const slots = signSlots(approvals);
  const sign = (title, sub, a, fallbackName, who = null) => {
    const p = who || (a && ok(a) ? { name: a.name, sig: a.sig, at: a.at } : null);
    return `<td class="ew-sign">
      <div class="ew-st"><b>${esc(title)}</b></div>
      <div class="ew-ss">${esc(sub || '')}</div>
      <div class="ew-sl">${p && p.sig ? sigImg(p.sig) : ''}</div>
      <div>ลงชื่อ${fill('', 'ew-w-sign')}</div>
      <div>(${fill(p && p.name ? p.name : fallbackName, 'ew-w-name')})</div>
      <div>วันที่ ${fill(p && p.at ? thaiDateShort(p.at) : '', 'ew-w-date')}</div>
    </td>`;
  };

  return `
  <div class="ex-doc ew-doc">
    <div class="ew-frame">
      <img class="ex-letterhead ew-lh" src="${LETTERHEAD}" alt="Prime Power Construction">
      <h2 class="ew-title">แบบฟอร์มขอเบิกสวัสดิการของพนักงาน</h2>
      <div class="ew-date">วันที่ ${fill(date, 'ew-w-date')}</div>
      <div class="ew-to"><b>เรียน ฝ่ายทรัพยากรบุคคล</b></div>

      <div class="ew-row ew-ind">ข้าพเจ้า นาย / นาง / นางสาว ${fill(name, 'ew-w-name2')} รหัสพนักงาน ${fill(code, 'ew-w-code')}</div>
      <div class="ew-row">ตำแหน่ง ${fill(position, 'ew-w-pos')} ฝ่าย ${fill(dept, 'ew-w-dept')}</div>

      <div class="ew-h"><b>ขอเบิกเงินสวัสดิการพนักงานในกรณี</b></div>
      <div class="ew-opts">
        <div class="ew-opt">${box(type === EW_TYPES[0])}<span class="ew-ol">เงินช่วยเหลือค่าคลอดบุตร</span><span>จำนวนเงิน 3,000 &nbsp; บาท</span></div>
        <div class="ew-opt">${box(type === EW_TYPES[1])}<span class="ew-ol">เงินช่วยเหลือการฌาปนกิจญาติสายตรง</span><span>จำนวนเงิน 5,000 &nbsp; บาท</span></div>
        <div class="ew-opt">${box(type === EW_TYPES[2])}<span class="ew-ol">ค่ารองเท้าเซฟตี้</span><span>จำนวน${fill(type === EW_TYPES[2] ? money(v(EW.shoe)) : '', 'ew-w-amt')}บาท (เบิกจ่ายตามจริงได้ไม่เกิน 1,000 บาท)</span></div>
        <div class="ew-opt">${box(type === EW_TYPES[3])}<span>อื่นๆ ระบุ${fill(type === EW_TYPES[3] ? v(EW.other) : '', 'ew-w-other')}${
  type === EW_TYPES[3] && money(v(EW.otherAmt)) ? ` จำนวน ${fill(money(v(EW.otherAmt)), 'ew-w-amt')} บาท` : ''}</span></div>
      </div>

      <div class="ew-docs">
        <div>พร้อมกันนี้ได้แนบเอกสาร ดังนี้</div>
        <div class="ew-dlist">${docRows.map((d, i) => `<div>${i + 1}. ${fill(d, 'ew-w-doc')}</div>`).join('')}</div>
      </div>

      <table class="ew-signs">
        <tr>${sign('ผู้ส่งคำขอ', '', null, name, { name, sig: requester.sig, at: requester.at || submitted })}
          ${sign('ทราบ', 'ฝ่ายทรัพยากรบุคคล', slots.ack, DEFAULT_SIGNERS.ack)}</tr>
        <tr>${sign('ตรวจสอบ', 'รองกรรมการผู้จัดการ', slots.check, DEFAULT_SIGNERS.check)}
          ${sign('อนุมัติ', 'กรรมการผู้จัดการ', slots.approve, DEFAULT_SIGNERS.approve)}</tr>
      </table>
      <div class="ew-note"><b>หมายเหตุ :&nbsp; กรุณาส่งแบบฟอร์มคำขอเบิกสวัสดิการของพนักงานอย่างน้อย 3 วันทำการก่อนรับเงิน</b></div>
    </div>
  </div>`;
}
