/**
 * ใบรับรองแทนใบเสร็จรับเงิน — เบิกสวัสดิการ (Welfare Benefit) ห้องพักรายเดือน
 * หน้าตาตามต้นฉบับ Excel ของฝ่ายบัญชี ห้ามปรับรูปแบบ
 *
 * อ่านช่องจากชื่อหัวข้อ (ไม่ผูกกับ FieldKey):
 *   ประเภทสวัสดิการ (ติ๊ก ค่าห้องพัก / ค่าส่วนกลาง / ค่าที่จอดรถ) · จำนวนเงินแยกรายการหรือยอดรวม
 *   เลขห้อง · ทะเบียนรถ · เดือนที่ขอเบิก · หมายเหตุ · ไฟล์แนบ (นับเป็นจำนวนฉบับ)
 * ผู้ลงนามด้านขวา = ผู้อนุมัติขั้นสุดท้าย · ลายเซ็นขึ้นเมื่อขั้นนั้นอนุมัติแล้วเท่านั้น
 */
import { esc } from '../core/dom.js';
import { sigImg } from './form-doc.js';

export const FINANCE_DIRECTOR = { name: 'น.ส. จินต์จุฑา ใสสะอาด', title: 'ผู้อำนวยการด้านการเงินและสนับสนุนองค์กร' };
const MIN_ROWS = 13;
const LOGO = 'assets/img/ppc-logo-2024.png';

/** ฟอร์มนี้เป็นเบิกสวัสดิการห้องพักรายเดือนหรือไม่ */
export const isWelfareRoom = (form) => /สวัสดิการ|welfare/i.test(String((form && form.Title) || ''))
  && /ห้องพัก|ห้อง/.test(String((form && form.Title) || ''));

/* ───── จำนวนเงินเป็นตัวอักษร (แบบ BAHTTEXT ของ Excel) ───── */
const DIGIT = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readInt(n) {
  if (n === 0) return '';
  if (n >= 1e6) return readInt(Math.floor(n / 1e6)) + 'ล้าน' + readInt(n % 1e6);
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const d = +s[i];
    const pos = s.length - i - 1;
    if (!d) continue;
    if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else out += DIGIT[d] + PLACE[pos];
  }
  return out;
}
export function bahtText(amount) {
  const v = Math.round((Number(amount) || 0) * 100);
  if (!v) return 'ศูนย์บาทถ้วน';
  const baht = Math.floor(v / 100);
  const satang = v % 100;
  return (baht ? readInt(baht) + 'บาท' : '') + (satang ? readInt(satang) + 'สตางค์' : 'ถ้วน');
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const money = (n) => (n ? n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
/** วัน-เดือน-ปี แบบ 30/09/2569 · ข้อความ (เช่น "กันยายน 2569") แสดงตามที่กรอก */
function dmy(v) {
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v);
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

export function renderWelfareRoom({ fields = [], values = {}, empCode = '', requester = {}, finalSign = null,
  position = '', files = null }) {
  const byTitle = (re, pred = () => true) => fields.find((f) => re.test(String(f.Title || '')) && pred(f));
  const val = (f) => (f ? values[f.FieldKey] : '');
  const text = (f) => {
    const v = val(f);
    if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.Title || x.name || '') : x)).join(', ');
    return v && typeof v === 'object' ? (v.Title || v.LookupValue || '') : String(v ?? '');
  };
  const isMoney = (f) => ['currency', 'number'].includes(f.FieldType);
  const isDate = (f) => f.FieldType === 'date';

  // รายการคงที่ 3 แถวตามต้นฉบับ
  const ITEMS = [
    { key: 'room', re: /ห้องพัก/ },
    { key: 'common', re: /ส่วนกลาง/ },
    { key: 'parking', re: /จอดรถ/ },
  ];
  const typeF = byTitle(/ประเภท|สวัสดิการ|รายการ/, (f) => ['multichoice', 'choice'].includes(f.FieldType));
  const picked = text(typeF);
  const totalF = byTitle(/จำนวนเงิน|ยอด|รวม/, (f) => isMoney(f) && !ITEMS.some((it) => it.re.test(f.Title)));
  const generalDate = text(byTitle(/เดือน|งวด/, (f) => !isMoney(f)))
    || val(byTitle(/วันที่/, (f) => isDate(f) && f.FieldKey !== 'std_date')) || val(fields.find((f) => f.FieldKey === 'std_date'));

  const rows = ITEMS.map((it) => {
    const amountF = byTitle(it.re, isMoney);
    const dateF = byTitle(it.re, isDate);
    return { ...it, amount: amountF ? num(val(amountF)) : 0, date: dateF ? val(dateF) : '', chosen: it.re.test(picked) };
  });
  // ฟอร์มที่มียอดเงินช่องเดียว: ลงที่รายการแรกที่ติ๊กไว้
  if (!rows.some((r) => r.amount) && totalF) {
    const first = rows.find((r) => r.chosen) || rows[0];
    first.amount = num(val(totalF));
  }
  rows.forEach((r) => { if (r.amount && !r.date) r.date = generalDate; });
  const total = rows.reduce((t, r) => t + r.amount, 0);

  const room = text(byTitle(/เลขห้อง|ห้องเลขที่|หมายเลขห้อง|^ห้อง$/));
  const plate = text(byTitle(/ทะเบียน/));
  const note = text(byTitle(/หมายเหตุ/));
  const fileCount = files != null ? files
    : fields.filter((f) => f.FieldType === 'file').reduce((t, f) => t + (Array.isArray(val(f)) ? val(f).length : 0), 0);
  const signer = finalSign || {};

  const blankRows = Array.from({ length: Math.max(0, MIN_ROWS - 3) }, () =>
    '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>').join('');

  return `
  <div class="ex-doc wf-doc">
    <div class="wf-logo"><img src="${LOGO}" alt="Prime Power Construction"></div>
    <h2 class="wf-title">ใบรับรองแทนใบเสร็จรับเงิน</h2>
    <div class="wf-co">
      <div>บริษัท ไพร์ม พาวเวอร์ คอนสตรัคชั่น จำกัด (สำนักงานใหญ่)</div>
      <div>เลขที่ 99 หมู่ที่ 7 ตำบล บางตลาด อำเภอ ปากเกร็ด จังหวัด นนทบุรี 11120</div>
      <div>โทร. +66 2 147 5098-99 เลขประจำตัวผู้เสียภาษีอากร 0105557084451</div>
    </div>

    <table class="wf-table">
      <colgroup><col class="wf-c1"><col class="wf-c2"><col><col class="wf-c4"><col class="wf-c5"></colgroup>
      <thead><tr><th>ลำดับที่</th><th>วัน-เดือน-ปี</th><th>รายละเอียดรายจ่าย</th><th>จำนวนเงิน (บาท)</th><th>หมายเหตุ</th></tr></thead>
      <tbody>
        <tr><td class="wf-c">1</td><td class="wf-in wf-c">${esc(dmy(rows[0].date))}</td>
          <td><div class="wf-line"><span>ค่าห้องพัก</span><span class="wf-box wf-b1">${esc(room)}</span>
            <span>พนักงานรหัส</span><span class="wf-box wf-b2">${esc(empCode)}</span><span class="wf-box wf-b4">:</span></div></td>
          <td class="wf-in wf-r">${money(rows[0].amount)}</td><td class="wf-in">${esc(note)}</td></tr>
        <tr><td class="wf-c">2</td><td class="wf-in wf-c">${esc(dmy(rows[1].date))}</td>
          <td>ค่าส่วนกลาง (ตามคำอนุมัติ)</td>
          <td class="wf-in wf-r">${money(rows[1].amount)}</td><td></td></tr>
        <tr><td class="wf-c">3</td><td class="wf-in wf-c">${esc(dmy(rows[2].date))}</td>
          <td><div class="wf-line"><span>ค่าที่จอดรถ</span><span class="wf-gap"></span><span>ทะเบียน</span>
            <span class="wf-box wf-b3">${esc(plate)}</span><span>(เฉพาะรถบริษัทเท่านั้น)</span></div></td>
          <td class="wf-in wf-r">${money(rows[2].amount)}</td><td></td></tr>
        ${blankRows}
      </tbody>
      <tfoot>
        <tr><td colspan="3" class="wf-bold">จำนวนเงินรวม</td><td class="wf-r">${total ? money(total) : '-'}</td><td></td></tr>
        <tr><td colspan="2" class="wf-bold">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</td><td colspan="3">${total ? esc(bahtText(total)) : ''}</td></tr>
      </tfoot>
    </table>

    <div class="wf-docs"><b>เอกสารประกอบการเบิกจ่าย</b><span class="wf-box wf-copies">${fileCount || ''}</span>
      <b>ฉบับ</b><b class="wf-sp">(ใบเรียกเก็บค่าใช้จ่าย)</b></div>
    <div class="wf-cert"><b>ข้าพเจ้าขอรับรองว่ารายการจ่ายข้างต้นนี้ ไม่อาจเรียกใบเสร็จรับเงินได้และข้าพเจ้าได้จ่ายไปในงานของบริษัทจริง</b></div>

    <div class="wf-signs">
      <div class="wf-left">
        <div class="wf-srow"><b>ลงชื่อ</b><span class="wf-sline">${requester.sig ? sigImg(requester.sig) : esc(requester.name || '')}</span><b>(ผู้เบิกจ่าย)</b></div>
        <div class="wf-srow"><b>ตำแหน่ง</b><span class="wf-sline wf-in">${esc(position)}</span></div>
      </div>
      <div class="wf-right">
        <div class="wf-srow"><b>ลงชื่อ</b><span class="wf-sline wf-short">${signer.sig ? sigImg(signer.sig) : ''}</span></div>
        <div class="wf-signer"><b>${esc(signer.name || FINANCE_DIRECTOR.name)}</b></div>
        <div class="wf-signer"><b>${esc(FINANCE_DIRECTOR.title)}</b></div>
      </div>
    </div>
  </div>`;
}
