/**
 * ใบเบิกค่าใช้จ่ายในการเดินทาง — หน้าตาตามต้นฉบับ Excel ของฝ่ายบุคคล
 *
 * ใช้กับฟอร์มที่ชื่อมีคำว่า "เดินทาง" และมีตารางรายการ
 * อ่านช่องจากชื่อหัวข้อ (ไม่ผูกกับ FieldKey) จึงใช้ได้แม้ตั้งรหัสช่องใน SharePoint ต่างไป
 * "เลขที่" ใส่รหัสพนักงานของผู้เบิกเสมอ
 */
import { esc } from '../core/dom.js';
import { lineCols, toLineRows } from '../components/form-renderer.js';
import { sigImg } from './form-doc.js';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MIN_ROWS = 9;

/** วันที่แบบต้นฉบับ: 30-ก.ย.-26 (sep='-') หรือ 30 ก.ย. 26 (sep=' ') */
function shortDate(v, sep = '-') {
  const d = new Date(v);
  if (!v || isNaN(d)) return '';
  return [d.getDate(), MONTHS[d.getMonth()], String(d.getFullYear()).slice(-2)].join(sep);
}
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const has = (v) => String(v ?? '').trim() !== '';
/** จำนวนเงินแบบบัญชี: 0 แสดงเป็น - */
const acc = (n) => (n ? n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');

/** ฟอร์มนี้เป็นใบเบิกค่าเดินทางหรือไม่ */
export const isTravel = (form, fields) => /เดินทาง/.test(String((form && form.Title) || ''))
  && fields.some((f) => f.FieldType === 'lineitems');

export function renderTravel({ form = {}, fields = [], values = {}, empCode = '', requester = {}, approvals = [] }) {
  const byTitle = (re, type) => fields.find((f) => re.test(String(f.Title || '')) && (!type || f.FieldType === type));
  const val = (f) => (f ? values[f.FieldKey] : '');
  const text = (f) => {
    const v = val(f);
    return v && typeof v === 'object' ? (v.Title || v.LookupValue || '') : String(v ?? '');
  };

  const dateF = fields.find((f) => f.FieldKey === 'std_date') || byTitle(/^วันที่/, 'date');
  const payTo = text(byTitle(/จ่ายให้/)) || requester.name || '';
  const position = text(byTitle(/ตำแหน่ง/));
  const plate = text(byTitle(/ทะเบียน/));
  const desc = text(byTitle(/^คำอธิบาย/));
  const advance = num(val(byTitle(/สำรอง/)));
  const code = empCode || text(fields.find((f) => f.FieldKey === 'std_emp_code')) || '';

  // คอลัมน์ในตาราง จับคู่จากชื่อหัวคอลัมน์
  const li = fields.find((f) => f.FieldType === 'lineitems');
  const cols = li ? lineCols(li) : [];
  const col = (re) => (cols.find((c) => re.test(c.label)) || {}).key;
  const k = {
    date: col(/วันที่/), place: col(/สถานที่|คำอธิบาย|รายละเอียด/),
    from: col(/ไมล์ก่อน/), to: col(/ไมล์หลัง/), km: col(/^ก\.?\s*ม|กิโล/),
    rate: col(/ราคา|อัตรา/), amount: col(/จำนวนเงิน|เป็นเงิน/) || (cols.find((c) => c.type === 'money') || {}).key,
  };
  const rows = toLineRows(val(li)).map((r) => {
    // ช่อง ก.ม. และจำนวนเงินที่ไม่ได้กรอก คำนวณจากเลขไมล์และราคาต่อหน่วยให้
    const km = has(r[k.km]) ? num(r[k.km]) : (has(r[k.from]) && has(r[k.to]) ? num(r[k.to]) - num(r[k.from]) : 0);
    const amount = has(r[k.amount]) ? num(r[k.amount]) : km * num(r[k.rate]);
    return { date: r[k.date] || '', place: r[k.place] || '', from: r[k.from] || '', to: r[k.to] || '',
      km: km || '', rate: r[k.rate] || '', amount };
  });
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const pad = Array.from({ length: Math.max(0, MIN_ROWS - rows.length) }, () => ({ amount: 0 }));

  // ผู้ตรวจ = ขั้นแรก · ผู้อนุมัติ = ขั้นสุดท้าย (มีขั้นเดียว = ผู้อนุมัติ)
  const checker = approvals.length > 1 ? approvals[0] : {};
  const approver = approvals.length ? approvals[approvals.length - 1] : {};
  const cellD = (v) => `<td>${esc(v ?? '')}</td>`;
  const person = (p) => `
      <span class="tv-sig">${p.sig ? sigImg(p.sig) : ''}<span class="tv-line">${esc(p.name || '')}</span></span>`;

  return `
  <div class="ex-doc tv-doc">
    <div class="tv-head">
      <div>เบิกค่าใช้จ่ายในการเดินทาง</div>
      <div>บริษัท ไพร์ม พาวเวอร์ คอนสตรัคชั่น  จำกัด</div>
      <div>ใบเบิกค่าใช้จ่ายในการเดินทาง</div>
    </div>
    <div class="tv-no">
      <div><span>เลขที่</span><b class="tv-line tv-w1">${esc(code)}</b></div>
      <div><span>วันที่</span><b class="tv-line tv-w1">${esc(shortDate(val(dateF)))}</b></div>
    </div>

    <div class="tv-row">
      <span>จ่ายให้</span><b class="tv-line tv-w2">${esc(payTo)}</b>
      <span>ตำแหน่ง</span><b class="tv-line tv-w2">${esc(position)}</b>
      <span>ทะเบียนรถ</span><b class="tv-line tv-w1">${esc(plate)}</b>
    </div>
    <div class="tv-desc">คำอธิบาย ${esc(desc)}</div>

    <table class="tv-table">
      <thead>
        <tr><th colspan="6">รายการ</th><th rowspan="2" class="tv-amt">จำนวนเงิน</th></tr>
        <tr><th class="tv-date">วันที่</th><th>คำอธิบาย/ สถานที่เดินทาง</th><th class="tv-n">เลขไมล์ก่อน</th>
          <th class="tv-n">เลขไมล์หลัง</th><th class="tv-n">ก.ม.</th><th class="tv-n">ราคาต่อหน่วย</th></tr>
      </thead>
      <tbody>
        ${[...rows, ...pad].map((r) => `<tr>${cellD(r.date)}<td class="tv-left">${esc(r.place ?? '')}</td>
          <td class="tv-r">${esc(r.from ?? '')}</td><td class="tv-r">${esc(r.to ?? '')}</td>
          <td class="tv-r">${esc(r.km ?? '')}</td><td class="tv-r">${esc(r.rate ?? '')}</td>
          <td class="tv-r">${acc(r.amount)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="6" class="tv-flabel">รวม</td><td class="tv-r tv-box">${acc(total)}</td></tr>
        <tr><td colspan="6" class="tv-flabel">เบิกสำรอง</td><td class="tv-r tv-box">${acc(advance)}</td></tr>
        <tr><td colspan="6" class="tv-flabel"><b>รวมยอดสุทธิ</b></td><td class="tv-r tv-box tv-net"><b>${acc(total - advance)}</b></td></tr>
      </tfoot>
    </table>

    <p class="tv-cert">ข้าพเจ้าขอรับรองว่ารายการที่กล่าวมาข้างต้นเป็นความจริง และหลักฐานการจ่ายที่ส่งมาด้วย รวมทั้งจำนวนเงินที่ขอเบิกถูกต้องตามกฎหมายทุกประการ</p>

    <div class="tv-signs">
      <div><div class="tv-sr"><span>ผู้เบิกเงิน/รับเงิน</span>${person(requester)}</div>
        <div class="tv-sr"><span>วันที่</span><b class="tv-line">${esc(shortDate(requester.at || val(dateF), ' '))}</b></div></div>
      <div><div class="tv-sr"><span>ผู้ตรวจ</span>${person(checker)}</div>
        <div class="tv-sr"><span>วันที่</span><b class="tv-line">${esc(shortDate(checker.at, ' '))}</b></div></div>
      <div><div class="tv-sr"><span>ผู้อนุมัติ</span>${person(approver)}</div>
        <div class="tv-sr"><span>วันที่</span><b class="tv-line">${esc(shortDate(approver.at, ' '))}</b></div></div>
    </div>

    <div class="tv-notes">
      <div class="tv-u"><b>รายละเอียดในการเบิกค่าเดินทาง</b></div>
      <div><b class="tv-blue">1. ค่าเดินทางที่สามารถเบิกได้</b> ต้องนับจากสถานที่ทำงานหน่วยงานที่ 1 ไปยังหน่วยงานที่ 2 ดังนี้</div>
      <div>- รถส่วนบุคคล เริ่มนับจาก office ไปสถานที่ทำงาน ที่ 2,3…..ฯลฯ</div>
      <div>- รถส่วนบุคคล เริ่มนับจาก Site office ไปสถานที่ทำงาน ที่ 2,3...ฯลฯ</div>
      <div>- ค่ารถแท็กซี่ ให้ลงรายละเอียดในแบบฟอร์มข้างต้น โดยระบุว่าเป็นการเดินทางจากสถานที่ใด เพื่อไปยังสถานที่ใด พร้อมถ่ายรูปค่ามิตเตอร์ประกอบ</div>
      <div><b class="tv-red">2.ค่าเดินทางที่ไม่สามารถเบิกได้</b></div>
      <div>- จากบ้านมาออฟฟิศ หรือจากที่พักไป Site office นับเป็นการเดินทางที่ 1</div>
      <div>- ในกรณีที่ไปทำงานแล้วสามารถนั่งรถบริษัทรวมกันได้ แต่ไม่มาโดยไม่มีสาเหตุจากการทำงาน</div>
      <div class="tv-u tv-gap">หมายเหตุ</div>
      <div>- แบบฟอร์มนี้ ใช้สำหรับเบิกค่าใช้จ่ายในการเดินทาง ( กรณีที่พนักงานของบริษัทต้องไปติดต่องานนอกสถานที่ ) เช่น ค่าน้ำมัน , ค่าแท็กซี่</div>
      <div>- กรณีใช้รถยนต์ คิดค่าน้ำมันกิโลละ 6 บาท และ สำหรับรถจักรยานยนต์ คิดค่าน้ำมันกิโลละ 3.5 บาท</div>
      <div>- สำหรับการเบิกค่าน้ำมันรถยนต์ นอกจากการกรอกรายละเอียดในแบบฟอร์มข้างต้นแล้ว ควรจะมีบิลค่าน้ำมันมาใช้เป็นหลักฐานประกอบการเบิกเงินด้วย (กรณีมีน้ำมันอยู่ควรจดเลขไมล์ในการวิ่งแต่ละงาน)</div>
      <div>- กรณีเดินทางไป-กลับ จากบ้านไปไซต์งาน ไม่ได้เข้ามาที่สำนักงานก่อน จะหักระยะทางออก 20 กิโล</div>
    </div>
  </div>`;
}
