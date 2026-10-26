/**
 * เอกสารใบจองและสั่งซื้อระบบโซลาร์เซลล์ (FM-SMD-001)
 *   'sales'    = ฉบับปรับปรุง (ครบทุกข้อ 1–10 + เงินจอง + งวดชำระ) สำหรับฝ่ายขาย
 *   'customer' = ฉบับลูกค้าเก็บไว้ ออกแบบใหม่ให้อยู่ใน A4 หน้าเดียว (ข้อมูลครบตามไฟล์ต้นฉบับ)
 * เปิดเป็นหน้าต่างตัวอย่าง แล้วกด พิมพ์ / บันทึกเป็น PDF
 * ห้ามแสดงราคาขั้นต่ำ (ข้อมูลลับ) ในเอกสารทั้งสองแบบ
 */
import { esc } from '../core/dom.js';
import { sigImg } from './form-doc.js';
import { hydratePhotos } from '../services/photos.js';
import { printWithNotice } from '../components/eta-notice.js';
import { BANK_ACCOUNT, INCENTIVES, TERMS, SCHEDULE, computeQuote, panelsFor } from '../services/solar.js';

/** หัวกระดาษบริษัท (PPE-01) — โลโก้ ที่อยู่ ไทย/อังกฤษ และเส้นเขียว-น้ำเงิน อยู่ในรูปเดียว */
const LETTERHEAD = 'assets/img/PPE-01.png';
const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const box = (on) => (on ? '☑' : '☐');
const opt = (cur, list) => list.map((o) => `<span class="sd-opt">${box(String(cur || '') === o)} ${esc(o)}</span>`).join('');
const v_ = (x) => (x == null || x === '' ? '<span class="sd-blank">&nbsp;</span>' : esc(x));
const thDate = (iso) => {
  if (!iso) return '........ / ........ / ........';
  const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};
const sigOf = (v, role) => (v._live && v._live[role]) || (v['_sign_' + role] && v['_sign_' + role].url) || '';

/** หมายเหตุเงื่อนไขการชำระเงิน (ข้อ 9 ในฟอร์ม) · ว่าง = ไม่แสดง */
const schedNote = (v) => (String(v.sched_note || '').trim()
  ? `<div class="sd-remark"><b>หมายเหตุ:</b> ${esc(String(v.sched_note).trim()).replace(/\n/g, '<br>')}</div>` : '');

function header(v, title) {
  return `<img src="${LETTERHEAD}" alt="Prime Power Engineering Pro Co., Ltd." class="sd-letterhead">
  <div class="sd-head">
    <div></div>
    <div class="sd-title"><b>ใบจองและสั่งซื้อระบบโซลาร์เซลล์</b><span>SOLAR BOOKING &amp; ORDER FORM${title ? ` · ${title}` : ''}</span></div>
    <div class="sd-code">FM-SMD-001</div>
  </div>
  <table class="sd-meta"><tr>
    <th>เลขที่ใบเสนอราคา<br><small>Quotation No.</small></th><td><b>${v_(v.q_no)}</b></td>
    <th>วันที่<br><small>Date</small></th><td>${thDate(v.q_date)}</td>
  </tr><tr>
    <th>ที่ปรึกษาการขาย<br><small>Sales</small></th><td>${v_(v.sales_name)}</td>
    <th>โทร<br><small>Tel</small></th><td>${v_(v.sales_tel)}</td>
  </tr></table>`;
}

function customerBlock(v, full) {
  const site = v.site_same ? `${box(true)} ที่อยู่เดียวกับบัตรประชาชน` : `${box(false)} ที่อยู่เดียวกับบัตรประชาชน &nbsp; ${v_(v.site_address)}`;
  return `<table class="sd-t">
    <tr><th>คำนำหน้า</th><td>${opt(v.c_title, ['นาย', 'นาง', 'นางสาว'])}</td><th>ประเภท</th><td>${opt(v.c_type, ['บุคคลธรรมดา', 'นิติบุคคล'])}</td></tr>
    <tr><th>ชื่อ-นามสกุล / ชื่อนิติบุคคล</th><td colspan="3"><b>${v_(v.c_name)}</b></td></tr>
    <tr><th>เลขบัตรประชาชน / เลขผู้เสียภาษี</th><td>${v_(v.c_id)}</td><th>โทรศัพท์</th><td>${v_(v.c_phone)}</td></tr>
    <tr><th>ที่อยู่ตามบัตรประชาชน</th><td colspan="3">${v_(v.c_address)}</td></tr>
    <tr><th>ที่อยู่สถานที่ติดตั้ง</th><td colspan="3">${site}</td></tr>
    ${full ? `<tr><th>เจ้าของมิเตอร์ไฟฟ้า</th><td>${opt(v.meter_owner, ['ผู้สั่งซื้อเอง', 'ผู้อื่น'])}</td><th>ระบุชื่อ</th><td>${v_(v.meter_owner === 'ผู้อื่น' ? v.meter_owner_name : '')}</td></tr>
    <tr><th>อีเมล Email</th><td>${v_(v.c_email)}</td><th>ไอดีไลน์ ID LINE</th><td>${v_(v.c_line)}</td></tr>` : ''}
  </table>`;
}

function orderBlock(v, q) {
  const sizeTxt = q.kwp ? `${q.kwp.toFixed(2)} kWp (${q.panels || panelsFor(q.kwp)} แผง)` : '';
  const sizes = ['5.20', '6.50', '9.75'];
  const isTyp = sizes.includes(q.kwp ? q.kwp.toFixed(2) : '');
  return `<table class="sd-t">
    <tr><th>ขนาดระบบ</th><td>${sizes.map((s) => `<span class="sd-opt">${box(q.kwp && q.kwp.toFixed(2) === s)} ${s} kWp</span>`).join('')}<span class="sd-opt">${box(q.kwp && !isTyp)} อื่นๆ ${q.kwp && !isTyp ? `<b>${esc(sizeTxt)}</b>` : ''}</span></td></tr>
    <tr><th>ประเภทระบบ</th><td>${opt(v.system_type, ['On-Grid', 'Hybrid'])} <small>(Hybrid = มีแบตเตอรี่สำรองไฟ)</small></td></tr>
    <tr><th>ระบบไฟฟ้า</th><td>${opt(v.phase, ['1 เฟส', '3 เฟส'])}</td></tr>
    <tr><th>ชนิดหลังคา</th><td>${opt(v.roof, ['เมทัลชีท', 'กระเบื้องCPAC', 'อดามัส', 'ลอนคู่ (ไฟเบอร์ซีเมนต์)', 'อื่นๆ'])}${v.roof === 'อื่นๆ' && v.roof_other ? ` <b>${esc(v.roof_other)}</b>` : ''}</td></tr>
  </table>`;
}

function equipBlock(v, q) {
  const hybrid = v.system_type === 'Hybrid';
  const sets = hybrid && +v.battery_kwh ? Math.round(+v.battery_kwh / 7) : '';
  return `<table class="sd-t sd-grid">
    <tr class="sd-th"><th>รายการ</th><th>ยี่ห้อ / รุ่น</th><th>จำนวน</th><th>กำลัง / หน่วย</th></tr>
    <tr><td>แผงโซลาร์เซลล์ (Solar Panel)</td><td>Jinko Solar</td><td class="c">${v_(v.panels || q.panels || '')} แผง</td><td>650 W / แผง</td></tr>
    <tr><td>อินเวอร์เตอร์ (Inverter)</td><td>Huawei</td><td class="c">${v_(v.inverter_qty)} เครื่อง</td><td>${v_(v.inverter_kw)} kW / เครื่อง</td></tr>
    <tr><td>แบตเตอรี่ (Battery) เฉพาะ Hybrid</td><td>Huawei</td><td class="c">${v_(sets)} ชุด</td><td>7 kWh / ชุด${hybrid && v.battery_kwh ? ` (รวม ${esc(v.battery_kwh)} kWh)` : ''}</td></tr>
  </table>`;
}

function extrasBlock(v, q) {
  const price = (k) => { const l = q.lines.find((x) => x.key === k); return l ? baht(l.list) : '.............'; };
  return `<table class="sd-t sd-grid">
    <tr class="sd-th"><th>รายการ</th><th>ประโยชน์</th><th class="r">ราคา (บาท)</th></tr>
    ${[['opt_tou', 'มิเตอร์ TOU', 'คิดค่าไฟตามช่วงเวลา (TOU) เพื่อบริหารการใช้ไฟให้เหมาะสม'],
       ['opt_optimizer', 'Optimizer', 'เพิ่มประสิทธิภาพการผลิตไฟรายแผง และลดผลกระทบจากเงาบัง'],
       ['opt_smartguard', 'Smart Guard', 'ตรวจสอบและเพิ่มความปลอดภัยของระบบไฟฟ้า ป้องกันความผิดปกติ และใช้ไฟสำรองได้เมื่อไฟดับ'],
       ['opt_structure', 'โครงสร้างพิเศษ', 'โครงสร้างเสริมเพื่อรองรับการติดตั้งตามสภาพหลังคา']]
      .map(([k, t, d]) => `<tr><td>${box(!!v[k])} ${t}</td><td>${d}</td><td class="r">${v[k] ? price(k) : '-'}</td></tr>`).join('')}
  </table>`;
}

function priceBlock(q, vat) {
  return `<table class="sd-t sd-grid sd-price">
    <tr class="sd-th"><th>รายการ</th><th class="r">จำนวนเงิน (บาท)</th></tr>
    <tr><td>ราคาก่อนส่วนลด (รวมอุปกรณ์เสริมที่เลือก)</td><td class="r">${baht(q.gross)}</td></tr>
    <tr><td>ส่วนลดโปรโมชั่น</td><td class="r">${q.discount ? '-' + baht(q.discount) : '0.00'}</td></tr>
    <tr><td>ราคาสุทธิ (ก่อน VAT)</td><td class="r">${baht(q.net)}</td></tr>
    <tr><td>VAT ${vat}%</td><td class="r">${baht(q.vat)}</td></tr>
    <tr class="sd-total"><td>รวมทั้งสิ้น</td><td class="r">${baht(q.total)}</td></tr>
  </table>`;
}

const incentivesBlock = (v) => `<div class="sd-checks">${INCENTIVES.map((t) => `<div>${box((v.incentives || []).includes(t))} ${esc(t)}</div>`).join('')}</div>
  <div class="sd-note">* เป็นความประสงค์ของผู้สั่งซื้อเท่านั้น การได้รับสิทธิ จำนวนเงิน และเงื่อนไข เป็นไปตามประกาศและการอนุมัติของหน่วยงานภาครัฐ ซึ่งอาจเปลี่ยนแปลงได้</div>`;

const termsBlock = (dep) => `<ol class="sd-terms">${TERMS.map(([h, t]) => `<li><b>${esc(h)}:</b> ${esc(t.replace('{deposit}', baht(dep).replace('.00', '')))}</li>`).join('')}</ol>
  <div class="sd-ack">ข้าพเจ้าได้อ่านและเข้าใจรายละเอียดและข้อตกลงทั้งหมดข้างต้นแล้ว และได้รับสำเนาใบจอง 1 ฉบับ</div>`;

function signBlock(v) {
  const one = (role, label, name) => `<div class="sd-sign">
    <div class="sd-sig">${sigImg(sigOf(v, role)) || ''}</div>
    <div class="sd-line"></div>
    <div>( ${v_(name)} )</div>
    <div class="sd-role">${label}</div>
    <div class="sd-date">วันที่ ${v['_sign_' + role] && v['_sign_' + role].at ? thDate(v['_sign_' + role].at) : (sigOf(v, role) ? thDate(v.q_date) : '........ / ........ / ........')}</div>
  </div>`;
  return `<div class="sd-signs">${one('customer', 'ผู้สั่งซื้อ', v.c_name)}${one('sales', 'ผู้แทนฝ่ายขาย', v.sales_name)}${one('checker', 'ผู้ตรวจสอบ / วิศวกรฝ่ายขาย', v.checker_name)}</div>`;
}

const sec = (no, th, en, body) => `<div class="sd-sec"><div class="sd-h"><span>${no}</span>${th} <small>${en}</small></div>${body}</div>`;

/** ฉบับ Sales (ครบทุกข้อ) */
export function renderSalesDoc(v, { prices } = {}) {
  const q = computeQuote(v, prices);
  const vat = prices ? prices.vat : 7;
  const payOpt = ['ชำระเงินเอง', 'เครื่องรูดบัตร k-bank 0% 10 เดือน', 'ขอสินเชื่อธนาคาร'];
  return `<div class="sd-doc sd-sales">
    <div class="sd-page">
      ${header(v, 'ฉบับฝ่ายขาย')}
      <p class="sd-lead">ข้าพเจ้าขอจองและสั่งซื้อระบบโซลาร์เซลล์ตามรายการด้านล่าง ภายใต้เงื่อนไขที่ระบุท้ายใบจองนี้ <small>I hereby book and order the solar system below, subject to the terms at the end of this form.</small></p>
      ${sec('1.', 'ข้อมูลผู้สั่งซื้อ', 'Customer Details', customerBlock(v, true))}
      ${sec('2.', 'รายการสั่งซื้อ', 'Order Details', orderBlock(v, q))}
      ${sec('3.', 'อุปกรณ์หลัก', 'Main Equipment', equipBlock(v, q))}
      ${sec('4.', 'อุปกรณ์เสริม (เลือกได้)', 'Additional Equipment', extrasBlock(v, q))}
      ${sec('5.', 'สิทธิประโยชน์ภาครัฐที่ประสงค์ใช้', 'Government Incentives', incentivesBlock(v))}
    </div>
    <div class="sd-page">
      ${sec('6.', 'วิธีชำระค่าระบบ', 'Payment Option', `<div class="sd-checks">${payOpt.map((o) => `<div>${box(v.pay_option === o)} ${esc(o)}${o === 'ชำระเงินเอง' ? ' ตามงวดการชำระเงินในข้อ 9' : ''}${o === 'ขอสินเชื่อธนาคาร' ? ` &nbsp; ธนาคาร ${v_(v.loan_bank)} <small>(ผลอนุมัติเป็นไปตามธนาคารกำหนด)</small>` : ''}</div>`).join('')}</div>`)}
      ${sec('7.', 'ราคาและส่วนลด', 'Pricing and Discount', priceBlock(q, vat) + '<div class="sd-note">* ส่วนลดโปรโมชั่นสำหรับผู้จองภายในงานเท่านั้น · ราคาอาจเปลี่ยนแปลงได้กรณีเพิ่มเติมหลังการสำรวจเป็นไปตามที่ลูกค้ากำหนด</div>')}
      ${sec('8.', 'เงินจอง', 'Booking Deposit', `<table class="sd-t">
        <tr><th>วิธีชำระเงินจอง</th><td colspan="3">${opt(v.deposit_method, ['เงินสด', 'โอนผ่านธนาคาร'])}<span class="sd-opt">${box(v.deposit_method === 'บัตรเครดิต')} บัตรเครดิต (ไม่รวมค่าธรรมเนียม 3%)</span></td></tr>
        <tr><th>บัญชีรับโอน</th><td colspan="3">${esc(BANK_ACCOUNT)}</td></tr>
        <tr><th>ชื่อบัญชี</th><td colspan="3">${v_(v.deposit_account_name)}</td></tr>
        <tr><th>จำนวนเงินจอง</th><td>${baht(q.deposit)} บาท</td><th>วันที่ชำระ</th><td>${v.deposit_date ? thDate(v.deposit_date) : v_('')}</td></tr>
        <tr><th>ผู้รับเงิน</th><td colspan="3">${v_(v.deposit_receiver)}</td></tr>
      </table>`)}
      ${sec('9.', 'งวดการชำระเงิน', 'Payment Schedule', `<table class="sd-t sd-grid">
        <tr class="sd-th"><th class="c">งวด</th><th>รายละเอียด</th><th class="c">%</th><th class="r">จำนวนเงิน (บาท)</th><th>กำหนดชำระ</th></tr>
        ${q.schedule.map((s) => `<tr><td class="c">${s.no}</td><td>${esc(s.text)}</td><td class="c">${s.pct == null ? '-' : s.pct + '%'}</td><td class="r">${baht(s.amount)}</td><td>${esc(s.due)}${s.no === 2 ? ` (วันที่นัดสำรวจ ${v.survey_date ? thDate(v.survey_date) : '..................'})` : ''}</td></tr>`).join('')}
      </table><div class="sd-note">* งวดที่ 2-4 คิดจากยอดคงเหลือหลังหักเงินจอง · กำหนดชำระนับจากวันที่บริษัทแจ้งว่าขั้นตอนนั้นแล้วเสร็จ</div>
      ${schedNote(v)}`)}
      ${sec('10.', 'ข้อตกลงที่สำคัญ', 'Key Terms', termsBlock(q.deposit))}
      ${signBlock(v)}
    </div>
  </div>`;
}

/** ฉบับลูกค้าเก็บไว้ — A4 หน้าเดียว (จัดวางแบบกระชับ ข้อมูลครบตามไฟล์ต้นฉบับ) */
export function renderCustomerDoc(v, { prices } = {}) {
  const q = computeQuote(v, prices);
  const vat = prices ? prices.vat : 7;
  const price = (k) => { const l = q.lines.find((x) => x.key === k); return l ? baht(l.list) : '-'; };
  const hybrid = v.system_type === 'Hybrid';
  const sets = hybrid && +v.battery_kwh ? Math.round(+v.battery_kwh / 7) : '';
  const site = v.site_same ? `${box(true)} ที่อยู่เดียวกับบัตรประชาชน` : `${box(false)} ที่อยู่เดียวกับบัตรประชาชน · ${v_(v.site_address)}`;
  const sizes = ['5.20', '6.50', '9.75'];
  const k2 = q.kwp ? q.kwp.toFixed(2) : '';
  return `<div class="sd-doc sd-customer">
    <div class="sd-page sd-one">
      ${header(v, 'ฉบับลูกค้า')}
      <p class="sd-lead">ข้าพเจ้าขอจองและสั่งซื้อระบบโซลาร์เซลล์ตามรายการด้านล่าง ภายใต้เงื่อนไขที่ระบุท้ายใบจองนี้ <small>I hereby book and order the solar system below, subject to the terms at the end of this form.</small></p>
      ${sec('1.', 'ข้อมูลผู้สั่งซื้อ', 'Customer Details', `<table class="sd-t sd-kv">
        <tr><th>คำนำหน้า</th><td>${opt(v.c_title, ['นาย', 'นาง', 'นางสาว'])}</td><th>ประเภท</th><td>${opt(v.c_type, ['บุคคลธรรมดา', 'นิติบุคคล'])}</td></tr>
        <tr><th>ชื่อ-นามสกุล / นิติบุคคล</th><td><b>${v_(v.c_name)}</b></td><th>โทรศัพท์</th><td>${v_(v.c_phone)}</td></tr>
        <tr><th>เลขบัตรประชาชน / ผู้เสียภาษี</th><td colspan="3">${v_(v.c_id)}</td></tr>
        <tr><th>ที่อยู่ตามบัตรประชาชน</th><td colspan="3">${v_(v.c_address)}</td></tr>
        <tr><th>ที่อยู่สถานที่ติดตั้ง</th><td colspan="3">${site}</td></tr>
      </table>`)}
      <div class="sd-cols">
        ${sec('2.', 'รายการสั่งซื้อ', 'Order Details', `<table class="sd-t sd-kv">
          <tr><th>ขนาดระบบ</th><td>${sizes.map((x) => `<span class="sd-opt">${box(k2 === x)} ${x}</span>`).join('')}<span class="sd-opt">${box(k2 && !sizes.includes(k2))} อื่นๆ${k2 && !sizes.includes(k2) ? ` <b>${k2}</b>` : ''}</span> kWp</td></tr>
          <tr><th>ประเภทระบบ</th><td>${opt(v.system_type, ['On-Grid', 'Hybrid'])}</td></tr>
          <tr><th>ระบบไฟฟ้า</th><td>${opt(v.phase, ['1 เฟส', '3 เฟส'])}</td></tr>
          <tr><th>ชนิดหลังคา</th><td>${opt(v.roof, ['เมทัลชีท', 'กระเบื้องCPAC', 'อดามัส', 'ลอนคู่ (ไฟเบอร์ซีเมนต์)', 'อื่นๆ'])}${v.roof === 'อื่นๆ' && v.roof_other ? ` <b>${esc(v.roof_other)}</b>` : ''}</td></tr>
        </table>`)}
        ${sec('3.', 'อุปกรณ์หลัก', 'Main Equipment', `<table class="sd-t sd-grid">
          <tr class="sd-th"><th>รายการ</th><th>ยี่ห้อ</th><th class="c">จำนวน</th><th>กำลัง / หน่วย</th></tr>
          <tr><td>แผงโซลาร์เซลล์</td><td>Jinko Solar</td><td class="c">${v_(v.panels || q.panels || '')} แผง</td><td>650 W / แผง</td></tr>
          <tr><td>อินเวอร์เตอร์</td><td>Huawei</td><td class="c">${v_(v.inverter_qty)} เครื่อง</td><td>${v_(v.inverter_kw)} kW / เครื่อง</td></tr>
          <tr><td>แบตเตอรี่ (Hybrid)</td><td>Huawei</td><td class="c">${v_(sets)} ชุด</td><td>7 kWh / ชุด</td></tr>
        </table>`)}
      </div>
      ${sec('4.', 'อุปกรณ์เสริม (เลือกได้)', 'Additional Equipment', `<table class="sd-t sd-grid sd-extras">
        <tr class="sd-th"><th>รายการ</th><th>ประโยชน์</th><th class="r">ราคา (บาท)</th></tr>
        ${[['opt_tou', 'มิเตอร์ TOU', 'คิดค่าไฟตามช่วงเวลา (TOU) เพื่อบริหารการใช้ไฟให้เหมาะสม'],
           ['opt_optimizer', 'Optimizer', 'เพิ่มประสิทธิภาพการผลิตไฟรายแผง และลดผลกระทบจากเงาบัง'],
           ['opt_smartguard', 'Smart Guard', 'ตรวจสอบและเพิ่มความปลอดภัยของระบบไฟฟ้า ป้องกันความผิดปกติ และใช้ไฟสำรองได้เมื่อไฟดับ'],
           ['opt_structure', 'โครงสร้างพิเศษ', 'โครงสร้างเสริมเพื่อรองรับการติดตั้งตามสภาพหลังคา']]
          .map(([k, t, d]) => `<tr><td class="nw">${box(!!v[k])} ${t}</td><td>${d}</td><td class="r nw">${v[k] ? price(k) : '-'}</td></tr>`).join('')}
      </table>`)}
      <div class="sd-cols">
        ${sec('5.', 'สิทธิประโยชน์ภาครัฐที่ประสงค์ใช้', 'Government Incentives', incentivesBlock(v))}
        ${sec('6.', 'ราคาและส่วนลด', 'Pricing and Discount', priceBlock(q, vat) + '<div class="sd-note">* ส่วนลดโปรโมชั่นสำหรับผู้จองภายในงานเท่านั้น · ราคาอาจเปลี่ยนแปลงได้กรณีเพิ่มเติมหลังการสำรวจเป็นไปตามที่ลูกค้ากำหนด</div>' + schedNote(v))}
      </div>
      ${sec('7.', 'ข้อตกลงที่สำคัญ', 'Key Terms', termsBlock(q.deposit))}
      ${signBlock(v)}
      <div class="sd-foot">บริษัท ไพร์ม พาวเวอร์ เอ็นจิเนียริ่ง โปร จำกัด · ฉบับลูกค้าเก็บไว้เป็นหลักฐาน</div>
    </div>
  </div>`;
}

/** เปิดหน้าต่างตัวอย่างเอกสาร พร้อมปุ่มพิมพ์ / บันทึกเป็น PDF */
export function openSolarDoc(kind, v, { prices } = {}) {
  const html = kind === 'customer' ? renderCustomerDoc(v, { prices }) : renderSalesDoc(v, { prices });
  const root = document.getElementById('overlay-root');
  root.innerHTML = `<div class="mask" id="sd-mask"><div class="modal modal-wide sd-modal">
    <div class="modal-head">${kind === 'customer' ? 'ใบจอง · ฉบับลูกค้า (A4 หน้าเดียว)' : 'ใบจอง · ฉบับฝ่ายขาย'} — ${esc(v.q_no || '')}
      <button id="sd-close" title="ปิด">✕</button></div>
    <div class="modal-body">${html}</div>
    <div class="modal-foot"><span class="dim">เลือกเครื่องพิมพ์ “Save as PDF / บันทึกเป็น PDF” เพื่อได้ไฟล์ · กระดาษ A4</span>
      <button class="btn" id="sd-close2">ปิด</button>
      <button class="btn btn-primary" id="sd-print">🖨 พิมพ์ / บันทึกเป็น PDF</button></div>
  </div></div>`;
  hydratePhotos(root);
  const close = () => { root.innerHTML = ''; };
  document.getElementById('sd-close').onclick = close;
  document.getElementById('sd-close2').onclick = close;
  document.getElementById('sd-print').onclick = () => {
    const t = document.title;
    document.title = `${kind === 'customer' ? 'ใบจองโซลาร์-ลูกค้า' : 'ใบจองโซลาร์-Sales'} ${v.q_no || ''} ${v.c_name || ''}`.trim();
    printWithNotice('printing-solar').finally(() => { setTimeout(() => { document.title = t; }, 800); });
  };
}

export { SCHEDULE };
