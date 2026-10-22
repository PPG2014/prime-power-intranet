/**
 * หน้ากรอก ใบจองและสั่งซื้อระบบโซลาร์เซลล์ (FM-SMD-001) — บุคลากรฝ่ายขายกรอกข้อมูลลูกค้า
 * คำนวณราคาอัตโนมัติจาก Price List (SharePoint) · ลายเซ็น 3 ช่อง · ส่งออกเอกสาร Sales / ลูกค้า
 * มี Solar Calculator แถบข้าง (components/solar-calculator.js)
 * บันทึกผ่าน saveRequest ของหน้าแบบฟอร์ม (เลขที่เอกสาร เส้นทางอนุมัติ Power Automate เหมือนฟอร์มอื่น)
 *
 * ร่างที่กรอกไว้เก็บในเครื่อง (localStorage) ทุกครั้งที่พิมพ์ — เน็ตหลุดกลางงานขายข้อมูลไม่หาย
 */
import { esc, $, $$ } from '../core/dom.js';
import { state } from '../core/state.js';
import { toast } from '../components/toast.js';
import { signaturePad, bindSignaturePads, readSignature, previewSignature } from '../components/signature-pad.js';
import {
  SOLAR_FIELDS, TYPICAL_KWP, ROOF_TYPES, BANK_ACCOUNT, INCENTIVES, TERMS, SCHEDULE,
  loadSolarPrices, computeQuote, sizesFor, panelsFor, previewQuoteNo, assignQuoteNo,
} from '../services/solar.js';
import { openSolarDoc } from '../templates/solar-doc.js';
import { calculatorHtml, bindCalculator } from '../components/solar-calculator.js';

let prices = null;
let values = {};
let people = [];
let editMode = false;
let lastSaved = null;     // ค่าที่บันทึกล่าสุด (ส่งออกเอกสารหลังบันทึกได้)

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DRAFT_KEY = () => `solarDraft:${String(state.user?.email || '').toLowerCase()}`;
const TEL_KEY = (name) => `solarTel:${name}`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัว */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ข้าม */ } },
};

/* ───────── ตัวช่วยสร้างช่อง ───────── */
const radios = (key, opts, val, { other } = {}) => `<div class="sb-radios" role="radiogroup">${opts.map((o) => {
  const [v, label] = Array.isArray(o) ? o : [o, o];
  return `<label class="sb-chip"><input type="radio" name="sb_${key}" value="${esc(v)}" ${String(val ?? '') === String(v) ? 'checked' : ''}> ${esc(label)}</label>`;
}).join('')}${other || ''}</div>`;
const input = (key, val, attrs = '') => `<input id="sb_${key}" data-k="${key}" value="${esc(val ?? '')}" ${attrs}>`;
const field = (label, html, { req = false, cls = '' } = {}) => `<div class="sb-f ${cls}"><label class="sb-l">${label}${req ? ' <b class="req">*</b>' : ''}</label>${html}</div>`;
const section = (no, th, en, body, extra = '') => `<section class="sb-sec" ${extra}><h3 class="sb-h"><span class="sb-no">${no}</span>${th} <span class="sb-en">${en}</span></h3>${body}</section>`;

export async function solarRender({ form, me, dir = [], editData = null }) {
  prices = await loadSolarPrices({ fresh: true });
  people = dir.filter((p) => p.IsActive !== false && p.Title);
  editMode = !!editData;
  let draft = null;
  if (!editData) { try { draft = JSON.parse(store.get(DRAFT_KEY()) || 'null'); } catch (e) { draft = null; } }
  const myName = (me && me.Title) || state.user?.name || '';
  values = {
    q_date: todayISO(), sales_name: myName, sales_tel: store.get(TEL_KEY(myName)) || (me && me.Extension) || '',
    c_title: '', c_type: 'บุคคลธรรมดา', site_same: true, meter_owner: 'ผู้สั่งซื้อเอง',
    system_type: 'On-Grid', phase: '1 เฟส', size: '', inverter_qty: 1,
    pay_option: 'ชำระเงินเอง', deposit_method: '', deposit_date: todayISO(), deposit_receiver: myName,
    incentives: [],
    ...(draft || {}), ...(editData || {}),
  };
  const nextNo = editData && editData.q_no ? editData.q_no : await previewQuoteNo().catch(() => '');

  const warnPrice = !prices
    ? `<div class="sb-alert">⚠ ยังไม่ได้ตั้งราคา (Price List) — ผู้ดูแลระบบไปที่ จัดการข้อมูล → 💲 ราคาโซลาร์เซลล์ · ระหว่างนี้กรอกราคาเองได้ในข้อ 4 และช่องส่วนลด</div>` : '';

  return `
  <section class="page page-solar">
    <div class="sb-shell" id="sb-shell">
      <div class="wrap sb-wrap">
        <a class="back-link" href="#/forms">← แบบฟอร์มทั้งหมด</a>
        <a class="back-link guide-link" href="#/form-guide/${esc(form.FormCode)}">📘 วิธีกรอกและเส้นทางอนุมัติของฟอร์มนี้</a>
        <a class="back-link guide-link" href="#/register/${esc(form.FormCode)}">📋 ทะเบียนใบจอง · ค้นหา · ส่งออก Excel</a>
        <header class="sb-head">
          <div class="form-icon-lg">${esc(form.Icon || '☀️')}</div>
          <div>
            <h1>ใบจองและสั่งซื้อระบบโซลาร์เซลล์${editMode ? ' <span class="edit-tag">แก้ไข</span>' : ''}</h1>
            <div class="sb-sub">SOLAR BOOKING &amp; ORDER FORM · ${esc(form.FormCode)}${draft && !editMode ? ' · <span class="sb-draft">กู้ข้อมูลที่กรอกค้างไว้แล้ว <button class="link-btn" data-sbact="cleardraft">เริ่มใบใหม่</button></span>' : ''}</div>
          </div>
        </header>
        ${warnPrice}
        <p class="sb-lead">ข้าพเจ้าขอจองและสั่งซื้อระบบโซลาร์เซลล์ตามรายการด้านล่าง ภายใต้เงื่อนไขที่ระบุท้ายใบจองนี้</p>

        <div class="sb-grid sb-top">
          ${field('เลขที่ใบเสนอราคา <span class="sb-en">Quotation No.</span>', `<div class="sb-qno" id="sb-qno">${esc(values.q_no || nextNo || 'SMD-001-…')}</div><div class="sb-hint">${values.q_no ? 'เลขที่ออกแล้ว' : 'ระบบออกเลขให้เมื่อกดบันทึก (ถ้ามีคนบันทึกก่อน เลขจะขยับ)'}</div>`)}
          ${field('วันที่ <span class="sb-en">Date</span>', input('q_date', values.q_date, 'type="date"'), { req: true })}
          ${field('ที่ปรึกษาการขาย <span class="sb-en">Sales</span>', `${input('sales_name', values.sales_name, 'list="sb-people" autocomplete="off" placeholder="พิมพ์ชื่อเพื่อค้นหา"')}
            <datalist id="sb-people">${people.map((p) => `<option value="${esc(p.Title)}">${esc([p.Position, p.Department].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>`, { req: true })}
          ${field('โทร <span class="sb-en">Tel</span>', input('sales_tel', values.sales_tel, 'inputmode="tel" placeholder="เบอร์ติดต่อที่ปรึกษาการขาย"'))}
        </div>

        ${section('1', 'ข้อมูลผู้สั่งซื้อ', 'Customer Details', `<div class="sb-grid">
          ${field('คำนำหน้า', radios('c_title', ['นาย', 'นาง', 'นางสาว'], values.c_title))}
          ${field('ประเภท', radios('c_type', ['บุคคลธรรมดา', 'นิติบุคคล'], values.c_type))}
          ${field('ชื่อ-นามสกุล / ชื่อนิติบุคคล', input('c_name', values.c_name), { req: true, cls: 'sb-wide' })}
          ${field('เลขบัตรประชาชน / เลขผู้เสียภาษี', input('c_id', values.c_id, 'inputmode="numeric" maxlength="17"'))}
          ${field('โทรศัพท์', input('c_phone', values.c_phone, 'inputmode="tel"'), { req: true })}
          ${field('ที่อยู่ตามบัตรประชาชน', `<textarea id="sb_c_address" data-k="c_address" rows="2">${esc(values.c_address || '')}</textarea>`, { cls: 'sb-wide' })}
          ${field('ที่อยู่สถานที่ติดตั้ง', `<label class="sb-chip"><input type="checkbox" id="sb_site_same" data-k="site_same" ${values.site_same ? 'checked' : ''}> ที่อยู่เดียวกับบัตรประชาชน</label>
            <textarea id="sb_site_address" data-k="site_address" rows="2" placeholder="หรือระบุที่อยู่ติดตั้ง" ${values.site_same ? 'hidden' : ''}>${esc(values.site_address || '')}</textarea>`, { cls: 'sb-wide' })}
          ${field('เจ้าของมิเตอร์ไฟฟ้า', radios('meter_owner', ['ผู้สั่งซื้อเอง', 'ผู้อื่น'], values.meter_owner)
            + `<input id="sb_meter_owner_name" data-k="meter_owner_name" value="${esc(values.meter_owner_name || '')}" placeholder="ระบุชื่อเจ้าของมิเตอร์" ${values.meter_owner === 'ผู้อื่น' ? '' : 'hidden'}>`)}
          ${field('อีเมล <span class="sb-en">Email</span>', input('c_email', values.c_email, 'type="email" inputmode="email"'))}
          ${field('ไอดีไลน์ <span class="sb-en">ID LINE</span>', input('c_line', values.c_line))}
        </div>`)}

        ${section('2', 'รายการสั่งซื้อ', 'Order Details', `<div class="sb-grid">
          ${field('ระบบไฟฟ้า', radios('phase', ['1 เฟส', '3 เฟส'], values.phase), { req: true })}
          ${field('ประเภทระบบ', radios('system_type', [['On-Grid', 'On-Grid (ออนกริด)'], ['Hybrid', 'Hybrid (มีแบตเตอรี่สำรองไฟ)']], values.system_type), { req: true })}
          ${field('ขนาดระบบ', `<div id="sb-sizes"></div>`, { req: true, cls: 'sb-wide' })}
          ${field('ชนิดหลังคา', radios('roof', ROOF_TYPES, values.roof)
            + `<input id="sb_roof_other" data-k="roof_other" value="${esc(values.roof_other || '')}" placeholder="ระบุชนิดหลังคา" ${values.roof === 'อื่นๆ' ? '' : 'hidden'}>`, { cls: 'sb-wide' })}
        </div>`)}

        ${section('3', 'อุปกรณ์หลัก', 'Main Equipment', `<div class="sb-scroll"><table class="sb-table">
          <thead><tr><th>รายการ</th><th>ยี่ห้อ / รุ่น</th><th>จำนวน</th><th>กำลัง / หน่วย</th></tr></thead>
          <tbody>
            <tr><td>แผงโซลาร์เซลล์ (Solar Panel)</td><td>Jinko Solar</td><td>${input('panels', values.panels, 'type="number" min="0" class="sb-num"')} แผง</td><td>650 W / แผง</td></tr>
            <tr><td>อินเวอร์เตอร์ (Inverter)</td><td>Huawei</td><td>${input('inverter_qty', values.inverter_qty, 'type="number" min="0" class="sb-num"')} เครื่อง</td><td>${input('inverter_kw', values.inverter_kw, 'type="number" min="0" step="0.1" class="sb-num"')} kW / เครื่อง</td></tr>
            <tr id="sb-batt-row"><td>แบตเตอรี่ (Battery) เฉพาะ Hybrid</td><td>Huawei</td><td colspan="2"><div id="sb-batt"></div></td></tr>
          </tbody></table></div>`)}

        ${section('4', 'อุปกรณ์เสริม (เลือกได้)', 'Additional Equipment', `<div class="sb-scroll"><table class="sb-table">
          <thead><tr><th>รายการ</th><th>ประโยชน์</th><th class="r">ราคา (บาท)</th></tr></thead><tbody>
          ${[['opt_tou', 'มิเตอร์ TOU', 'คิดค่าไฟตามช่วงเวลา (TOU) เพื่อบริหารการใช้ไฟให้เหมาะสม', 'price_tou'],
             ['opt_optimizer', 'Optimizer', 'เพิ่มประสิทธิภาพการผลิตไฟรายแผง และลดผลกระทบจากเงาบัง', 'price_optimizer'],
             ['opt_smartguard', 'Smart Guard', 'ตรวจสอบและเพิ่มความปลอดภัยของระบบไฟฟ้า ป้องกันความผิดปกติ และใช้ไฟสำรองได้เมื่อไฟดับ', 'price_smartguard'],
             ['opt_structure', 'โครงสร้างพิเศษ', 'โครงสร้างเสริมเพื่อรองรับการติดตั้งตามสภาพหลังคา', 'price_structure']]
            .map(([k, t, d, pk]) => `<tr><td><label class="sb-chip"><input type="checkbox" id="sb_${k}" data-k="${k}" ${values[k] ? 'checked' : ''}> ${t}</label></td><td>${d}</td>
              <td class="r"><input id="sb_${pk}" data-k="${pk}" class="sb-money" inputmode="decimal" value="${esc(values[pk] ?? '')}" placeholder="อัตโนมัติ"></td></tr>`).join('')}
          </tbody></table></div><div class="sb-hint">ราคาเติมให้อัตโนมัติตาม Price List (Optimizer = จำนวนแผง × ราคาต่อตัว · Smart Guard ตามเฟส · โครงสร้างพิเศษตามขนาดระบบ) — พิมพ์ทับเพื่อเปลี่ยนราคาได้ ลบให้ว่างเพื่อกลับเป็นอัตโนมัติ</div>`)}

        ${section('5', 'สิทธิประโยชน์ภาครัฐที่ประสงค์ใช้', 'Government Incentives', `<div class="sb-checks">${INCENTIVES.map((t, i) => `<label class="sb-chip sb-block"><input type="checkbox" data-inc="${i}" ${(values.incentives || []).includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
          <div class="sb-hint">* เป็นความประสงค์ของผู้สั่งซื้อเท่านั้น การได้รับสิทธิ จำนวนเงิน และเงื่อนไข เป็นไปตามประกาศและการอนุมัติของหน่วยงานภาครัฐ ซึ่งอาจเปลี่ยนแปลงได้</div>`)}

        ${section('6', 'วิธีชำระค่าระบบ', 'Payment Option', `${radios('pay_option', ['ชำระเงินเอง', 'เครื่องรูดบัตร k-bank 0% 10 เดือน', 'ขอสินเชื่อธนาคาร'], values.pay_option)}
          <input id="sb_loan_bank" data-k="loan_bank" value="${esc(values.loan_bank || '')}" placeholder="ธนาคารที่ขอสินเชื่อ (ผลอนุมัติเป็นไปตามธนาคารกำหนด)" ${values.pay_option === 'ขอสินเชื่อธนาคาร' ? '' : 'hidden'}>`)}

        ${section('7', 'ราคาและส่วนลด', 'Pricing and Discount', `<div id="sb-price"></div>
          <div class="sb-hint">* ส่วนลดโปรโมชั่นสำหรับผู้จองภายในงานเท่านั้น · ราคาอาจเปลี่ยนแปลงได้กรณีเพิ่มเติมหลังการสำรวจเป็นไปตามที่ลูกค้ากำหนด</div>`)}

        ${section('8', 'เงินจอง', 'Booking Deposit', `<div class="sb-grid">
          ${field('วิธีชำระเงินจอง', radios('deposit_method', ['เงินสด', 'โอนผ่านธนาคาร', 'บัตรเครดิต'], values.deposit_method) + '<div class="sb-hint">บัตรเครดิต: ไม่รวมค่าธรรมเนียม 3%</div>', { cls: 'sb-wide' })}
          ${field('บัญชีรับโอน', `<div class="sb-static">${esc(BANK_ACCOUNT)}</div>`, { cls: 'sb-wide' })}
          ${field('ชื่อบัญชี (ผู้โอน)', input('deposit_account_name', values.deposit_account_name))}
          ${field('จำนวนเงินจอง (บาท)', input('deposit_amount', values.deposit_amount ?? '', `class="sb-money" inputmode="decimal" placeholder="${esc(baht(prices ? prices.deposit : 2000))}"`))}
          ${field('วันที่ชำระ', input('deposit_date', values.deposit_date, 'type="date"'))}
          ${field('ผู้รับเงิน', input('deposit_receiver', values.deposit_receiver, 'list="sb-people" autocomplete="off"'))}
        </div>`)}

        ${section('9', 'งวดการชำระเงิน', 'Payment Schedule', `<div id="sb-sched"></div>
          <div class="sb-grid">${field('วันที่นัดสำรวจหน้างาน', input('survey_date', values.survey_date, 'type="date"'))}</div>
          <div class="sb-hint">* งวดที่ 2-4 คิดจากยอดคงเหลือหลังหักเงินจอง · กำหนดชำระนับจากวันที่บริษัทแจ้งว่าขั้นตอนนั้นแล้วเสร็จ</div>`)}

        ${section('10', 'ข้อตกลงที่สำคัญ', 'Key Terms', `<ol class="sb-terms">${TERMS.map(([h, t]) => `<li><b>${esc(h)}:</b> ${esc(t.replace('{deposit}', '2,000'))}</li>`).join('')}</ol>
          <p class="sb-ack">ข้าพเจ้าได้อ่านและเข้าใจรายละเอียดและข้อตกลงทั้งหมดข้างต้นแล้ว และได้รับสำเนาใบจอง 1 ฉบับ</p>`)}

        <section class="sb-sec"><h3 class="sb-h"><span class="sb-no">✍</span>ลงนาม <span class="sb-en">Signatures</span></h3>
          <div class="sb-signs">
            ${[['customer', 'ผู้สั่งซื้อ', 'c_name'], ['sales', 'ผู้แทนฝ่ายขาย', 'sales_name'], ['checker', 'ผู้ตรวจสอบ / วิศวกรฝ่ายขาย', 'checker_name']].map(([role, label, nk]) => `
              <div class="sb-sign">
                <div class="sb-sign-role">${label}</div>
                ${signaturePad('solar_' + role, (values['_sign_' + role] && values['_sign_' + role].url) || '', true)}
                ${nk === 'checker_name' ? input('checker_name', values.checker_name, 'list="sb-people" autocomplete="off" placeholder="ชื่อผู้ตรวจสอบ / วิศวกร"')
                  : `<div class="sb-sign-name" data-signame="${nk}">( ${esc(values[nk] || '................................')} )</div>`}
              </div>`).join('')}
          </div>
        </section>

        <div class="q-error" id="sb-error" hidden></div>
        <div class="sb-actions">
          <button class="btn sb-exp sales" data-sbact="export-sales">⬇ ส่งออก (Sales)</button>
          <button class="btn sb-exp cust" data-sbact="export-customer">⬇ ส่งออก (ลูกค้า)</button>
          <button class="btn btn-primary" id="sb-save">💾 ${editMode ? 'บันทึกการแก้ไขและยื่นใหม่' : 'บันทึกใบจอง'}</button>
        </div>
      </div>
    </div>
    ${calculatorHtml()}
  </section>`;
}

/* ───────── อ่านค่าจากหน้าจอ ───────── */
function read() {
  $$('#sb-shell [data-k]').forEach((el) => {
    const k = el.dataset.k;
    values[k] = el.type === 'checkbox' ? el.checked : el.value;
  });
  $$('#sb-shell input[type="radio"]:checked').forEach((el) => { values[el.name.replace(/^sb_/, '')] = el.value; });
  values.incentives = $$('#sb-shell [data-inc]').filter((el) => el.checked).map((el) => INCENTIVES[+el.dataset.inc]);
  return values;
}

/** ขนาดระบบ: ปุ่มขนาดยอดนิยม + รายการทุกขนาดที่มีราคาของเฟสนั้น */
function paintSizes() {
  const box = $('#sb-sizes');
  if (!box) return;
  const phase = String(values.phase || '1').startsWith('3') ? 3 : 1;
  const all = sizesFor(prices, phase);
  const cur = values.size === 'other' ? 'other' : String(values.size || '');
  const typical = TYPICAL_KWP.filter((k) => !all.length || all.some((a) => Math.abs(a - k) < 0.001));
  const label = (k) => `${(+k).toFixed(2)} kWp (${panelsFor(k)} แผง)`;
  box.innerHTML = `<div class="sb-radios">${typical.map((k) => `<label class="sb-chip"><input type="radio" name="sb_size" value="${k}" ${Math.abs(+cur - k) < 0.001 ? 'checked' : ''}> ${label(k)}</label>`).join('')}
    <label class="sb-chip"><input type="radio" name="sb_size" value="other" ${cur === 'other' || (cur && !typical.some((k) => Math.abs(+cur - k) < 0.001)) ? 'checked' : ''}> อื่นๆ</label></div>
    <div class="sb-other-size" ${cur === 'other' || (cur && !typical.some((k) => Math.abs(+cur - k) < 0.001)) ? '' : 'hidden'}>
      ${all.length ? `<select id="sb_size_other" data-k="size_other"><option value="">— เลือกขนาด —</option>${all.map((k) => `<option value="${k}" ${Math.abs(+(values.size_other || (cur !== 'other' ? cur : 0)) - k) < 0.001 ? 'selected' : ''}>${label(k)}</option>`).join('')}</select>`
        : `<input id="sb_size_other" data-k="size_other" type="number" step="0.01" value="${esc(values.size_other || '')}" placeholder="kWp">`}
      <span class="sb-hint">${phase} เฟส มี ${all.length} ขนาดใน Price List</span>
    </div>`;
  // ขนาดเดิมที่ไม่อยู่ในปุ่มยอดนิยม → ย้ายไปช่องอื่นๆ
  if (cur && cur !== 'other' && !typical.some((k) => Math.abs(+cur - k) < 0.001)) { values.size_other = cur; values.size = 'other'; }
}

function paintBattery() {
  const box = $('#sb-batt');
  const row = $('#sb-batt-row');
  if (!box) return;
  const hybrid = values.system_type === 'Hybrid';
  row.classList.toggle('sb-dim', !hybrid);
  const list = (prices && prices.battery.length) ? prices.battery : [{ kwh: 7 }, { kwh: 14 }, { kwh: 21 }];
  box.innerHTML = hybrid ? `<div class="sb-radios">${list.map((b) => `<label class="sb-chip"><input type="radio" name="sb_battery_kwh" value="${b.kwh}" ${+values.battery_kwh === +b.kwh ? 'checked' : ''}> ${b.kwh} kWh (${Math.round(b.kwh / 7)} ชุด × 7 kWh)${b.model ? ` <span class="sb-en">${esc(b.model)}</span>` : ''}</label>`).join('')}</div>`
    : '<span class="dim">เลือกประเภทระบบ Hybrid เพื่อเพิ่มแบตเตอรี่</span>';
}

function paintPrice() {
  const q = computeQuote(read(), prices);
  // ช่องราคาอุปกรณ์เสริมที่ยังว่าง แสดงราคาอัตโนมัติเป็นตัวจาง
  const auto = Object.fromEntries(q.lines.map((l) => [l.key, l.list]));
  [['opt_tou', 'price_tou'], ['opt_optimizer', 'price_optimizer'], ['opt_smartguard', 'price_smartguard'], ['opt_structure', 'price_structure']].forEach(([k, pk]) => {
    const el = $('#sb_' + pk);
    if (!el) return;
    const autoVal = computeQuote({ ...values, [k]: true, [pk]: '' }, prices).lines.find((l) => l.key === k);
    el.placeholder = autoVal ? baht(autoVal.list) : 'อัตโนมัติ';
  });
  if (!values.panels) { const pe = $('#sb_panels'); if (pe) pe.placeholder = q.panels ? String(q.panels) : ''; }
  const box = $('#sb-price');
  if (box) {
    box.innerHTML = `<div class="sb-scroll"><table class="sb-table sb-price">
      <thead><tr><th>รายการ</th><th class="r">จำนวนเงิน (บาท)</th></tr></thead><tbody>
      ${q.lines.map((l) => `<tr class="sb-line"><td>${esc(l.label)}</td><td class="r">${baht(l.list)}</td></tr>`).join('') || '<tr><td colspan="2" class="dim">เลือกขนาดระบบเพื่อคำนวณราคา</td></tr>'}
      <tr class="sb-sum"><td>ราคาก่อนส่วนลด (รวมอุปกรณ์เสริมที่เลือก)</td><td class="r">${baht(q.gross)}</td></tr>
      <tr><td>ส่วนลดโปรโมชั่น <span class="sb-hint">(อัตโนมัติ ${baht(q.autoDisc)} · พิมพ์ทับได้)</span></td>
        <td class="r"><input id="sb_discount" data-k="discount" class="sb-money" inputmode="decimal" value="${esc(values.discount ?? '')}" placeholder="${esc(baht(q.autoDisc))}"></td></tr>
      <tr><td>ราคาสุทธิ (ก่อน VAT)</td><td class="r">${baht(q.net)}</td></tr>
      <tr><td>VAT ${prices ? prices.vat : 7}%</td><td class="r">${baht(q.vat)}</td></tr>
      <tr class="sb-total"><td>รวมทั้งสิ้น</td><td class="r">${baht(q.total)}</td></tr>
      </tbody></table></div>
      ${q.missing.length ? `<div class="sb-alert">⚠ ไม่พบ${esc(q.missing.join(', '))} ใน Price List — ตรวจขนาด/เฟส หรือให้ผู้ดูแลเพิ่มราคา</div>` : ''}
      ${q.belowMin ? `<div class="sb-alert sb-internal">🔒 (ภายใน) ราคาสุทธิต่ำกว่าราคาขั้นต่ำ ${baht(q.minimum)} บาท — พยายามอย่าขายต่ำกว่านี้</div>` : ''}`;
    const d = $('#sb_discount');
    if (d) d.addEventListener('input', () => { clearTimeout(d._t); d._t = setTimeout(() => { values.discount = d.value; paintPrice(); focusEnd('#sb_discount'); }, 400); });
  }
  const sch = $('#sb-sched');
  if (sch) {
    sch.innerHTML = `<div class="sb-scroll"><table class="sb-table">
      <thead><tr><th>งวด</th><th>รายละเอียด</th><th class="c">%</th><th class="r">จำนวนเงิน (บาท)</th><th>กำหนดชำระ</th></tr></thead><tbody>
      ${q.schedule.map((s) => `<tr><td class="c">${s.no}</td><td>${esc(s.text)}</td><td class="c">${s.pct == null ? '-' : s.pct + '%'}</td><td class="r">${baht(s.amount)}</td><td>${esc(s.due)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  return q;
}
const focusEnd = (sel) => { const el = $(sel); if (!el) return; el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* ข้าม */ } };

function saveDraft() {
  if (editMode) return;
  const v = { ...read() };
  Object.keys(v).filter((k) => k.startsWith('_')).forEach((k) => delete v[k]);
  store.set(DRAFT_KEY(), JSON.stringify(v));
}

/** ความครบถ้วนก่อนบันทึก */
function problems(v, q) {
  const miss = [];
  if (!String(v.q_date || '').trim()) miss.push('วันที่');
  if (!String(v.sales_name || '').trim()) miss.push('ที่ปรึกษาการขาย');
  if (!String(v.c_name || '').trim()) miss.push('ชื่อ-นามสกุล ผู้สั่งซื้อ');
  if (!String(v.c_phone || '').trim()) miss.push('โทรศัพท์ ผู้สั่งซื้อ');
  if (!q.kwp) miss.push('ขนาดระบบ');
  if (v.system_type === 'Hybrid' && !+v.battery_kwh) miss.push('ขนาดแบตเตอรี่ (Hybrid)');
  if (!v.site_same && !String(v.site_address || '').trim()) miss.push('ที่อยู่สถานที่ติดตั้ง');
  if (v.meter_owner === 'ผู้อื่น' && !String(v.meter_owner_name || '').trim()) miss.push('ชื่อเจ้าของมิเตอร์');
  if (v.roof === 'อื่นๆ' && !String(v.roof_other || '').trim()) miss.push('ชนิดหลังคา (อื่นๆ)');
  if (v.pay_option === 'ขอสินเชื่อธนาคาร' && !String(v.loan_bank || '').trim()) miss.push('ธนาคารที่ขอสินเชื่อ');
  return miss;
}

/** ค่าที่ใช้บันทึก/ส่งออก: เติมยอดเงินที่คำนวณ */
function finalValues() {
  const v = { ...read() };
  const q = computeQuote(v, prices);
  if (!v.panels && q.panels) v.panels = q.panels;
  // ช่องติ๊ก เก็บเป็น ใช่ / ว่าง ให้หน้าติดตามสถานะและทะเบียนแสดงเป็นคำ (ไม่ใช่ true/false)
  ['site_same', 'opt_tou', 'opt_optimizer', 'opt_smartguard', 'opt_structure'].forEach((k) => { v[k] = v[k] ? 'ใช่' : ''; });
  Object.assign(v, {
    size_kwp: q.kwp, q_gross: q.gross, q_discount: q.discount, q_net: q.net, q_vat: q.vat, q_total: q.total,
    q_lines: q.lines.map((l) => ({ label: l.label, amount: l.list })),
    q_schedule: q.schedule.map((s) => ({ no: s.no, pct: s.pct, amount: s.amount })),
    deposit_amount: v.deposit_amount === '' || v.deposit_amount == null ? q.deposit : v.deposit_amount,
    std_subject: `ใบจองโซลาร์ ${q.kwp ? q.kwp.toFixed(2) + ' kWp ' : ''}${v.system_type || ''} — ${v.c_name || ''}`.trim(),
    std_date: v.q_date,
  });
  return { v, q };
}

/** ลายเซ็นปัจจุบันบนจอ (ยังไม่อัปโหลด) ใช้ส่งออกเอกสารก่อนบันทึก */
const liveSigns = (v) => Object.fromEntries(['customer', 'sales', 'checker'].map((r) => [r,
  previewSignature('solar_' + r) || (v['_sign_' + r] && v['_sign_' + r].url) || '']));

export function solarMount({ form, saveRequest, onSaved }) {
  const shell = $('#sb-shell');
  if (!shell) return;
  bindSignaturePads('Requests/' + form.FormCode + '/ลายเซ็น');
  paintSizes(); paintBattery(); paintPrice();
  bindCalculator({
    shell,
    onApply: ({ kwp, kwh, phase }) => {
      read();
      if (phase) values.phase = phase;
      if (kwp) { values.size = String(kwp); values.size_other = ''; }
      if (kwh) { values.system_type = 'Hybrid'; values.battery_kwh = kwh; }
      $$('#sb-shell input[name="sb_phase"]').forEach((el) => { el.checked = el.value === values.phase; });
      $$('#sb-shell input[name="sb_system_type"]').forEach((el) => { el.checked = el.value === values.system_type; });
      paintSizes(); paintBattery(); paintPrice(); saveDraft();
      toast(`ใช้แพ็กเกจ ${kwp ? (+kwp).toFixed(2) + ' kWp' : ''}${kwh ? ' + แบตเตอรี่ ' + kwh + ' kWh' : ''} ในใบจองแล้ว`);
      $('#sb-sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });

  let t;
  const onChange = (e) => {
    const el = e.target;
    const name = el.name || el.dataset.k || '';
    read();
    if (name === 'sb_phase' || name === 'sb_system_type') { paintSizes(); paintBattery(); }
    if (name === 'sb_size' && el.value !== 'other') values.size_other = '';
    if (name === 'sb_size') { paintSizes(); }
    if (el.id === 'sb_site_same') $('#sb_site_address').hidden = el.checked;
    if (name === 'sb_meter_owner') $('#sb_meter_owner_name').hidden = values.meter_owner !== 'ผู้อื่น';
    if (name === 'sb_roof') $('#sb_roof_other').hidden = values.roof !== 'อื่นๆ';
    if (name === 'sb_pay_option') $('#sb_loan_bank').hidden = values.pay_option !== 'ขอสินเชื่อธนาคาร';
    if (el.id === 'sb_sales_name') {
      const tel = store.get(TEL_KEY(el.value));
      const p = people.find((x) => x.Title === el.value);
      if (tel || (p && p.Extension)) { $('#sb_sales_tel').value = tel || p.Extension; values.sales_tel = $('#sb_sales_tel').value; }
    }
    $$('[data-signame]').forEach((n) => { n.textContent = `( ${values[n.dataset.signame] || '................................'} )`; });
    if (el.id !== 'sb_discount') { clearTimeout(t); t = setTimeout(paintPrice, el.type === 'text' || el.tagName === 'TEXTAREA' ? 250 : 0); }
    clearTimeout(shell._d); shell._d = setTimeout(saveDraft, 600);
  };
  shell.addEventListener('input', onChange);
  shell.addEventListener('change', onChange);

  shell.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sbact]');
    if (!b) return;
    const act = b.dataset.sbact;
    if (act === 'cleardraft') {
      if (!confirm('ล้างข้อมูลที่กรอกค้างไว้ แล้วเริ่มใบจองใหม่?')) return;
      store.del(DRAFT_KEY());
      const { render } = await import('../core/render.js');
      render();
      return;
    }
    const { v, q } = finalValues();
    const src = { ...v, _live: liveSigns(v) };
    if (!src.q_no) src.q_no = ($('#sb-qno')?.textContent || '').trim() + ' (ร่าง)';
    openSolarDoc(act === 'export-customer' ? 'customer' : 'sales', src, { prices, quote: q });
  });

  $('#sb-save').onclick = async () => {
    const btn = $('#sb-save');
    const err = $('#sb-error');
    const { v, q } = finalValues();
    const miss = problems(v, q);
    if (miss.length) { err.innerHTML = `กรอกข้อมูลให้ครบก่อนบันทึก<br>ยังขาด: ${esc(miss.join(', '))}`; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (q.missing.length) { err.innerHTML = `คำนวณราคาไม่ได้: ไม่พบ${esc(q.missing.join(', '))} ใน Price List`; err.hidden = false; return; }
    if (q.belowMin && !confirm(`ราคาสุทธิ ${baht(q.net)} บาท ต่ำกว่าราคาขั้นต่ำ ${baht(q.minimum)} บาท\n\nยืนยันบันทึกราคานี้หรือไม่?`)) return;
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const folder = 'Requests/' + form.FormCode + '/ลายเซ็น';
      for (const role of ['customer', 'sales', 'checker']) {
        // eslint-disable-next-line no-await-in-loop
        const url = await readSignature('solar_' + role, folder);
        const name = role === 'customer' ? v.c_name : role === 'sales' ? v.sales_name : v.checker_name;
        if (url) v['_sign_' + role] = { name: name || '', url, at: new Date().toISOString() };
      }
      if (v._sign_sales) v._requesterSign = v._sign_sales;
      store.set(TEL_KEY(v.sales_name), v.sales_tel || '');
      const { sentNo, warn } = await saveRequest(v, {
        flds: SOLAR_FIELDS, files: [],
        afterCreate: async (docNo, label) => {
          const { list } = await import('../services/data.js');
          const row = (await list('requests', { fresh: true }).catch(() => [])).find((x) => String(x.Title) === String(docNo));
          if (!row) return label;
          const qn = await assignQuoteNo(row.id).catch(() => '');
          if (qn) v.q_no = qn;
          return qn ? `${docNo} · ใบเสนอราคา ${qn}` : label;
        },
      });
      lastSaved = { ...v };
      store.del(DRAFT_KEY());
      onSaved({ sentNo, warn, values: lastSaved });
    } catch (ex) {
      console.error(ex);
      err.innerHTML = `บันทึกไม่สำเร็จ<br>${esc(ex.message).replace(/\n/g, '<br>')}<br><span class="dim">ข้อมูลที่กรอกยังอยู่ในเครื่องนี้ กดบันทึกใหม่ได้</span>`;
      err.hidden = false;
      btn.disabled = false; btn.textContent = editMode ? '💾 บันทึกการแก้ไขและยื่นใหม่' : '💾 บันทึกใบจอง';
    }
  };
}

/** หน้าหลังบันทึกสำเร็จ: ส่งออกเอกสารได้ทันที */
export function solarDoneHtml({ sentNo, warn = [] }) {
  return `<section class="page"><div class="wrap narrow"><div class="panel sb-done">
    <div class="sb-done-ic">✅</div>
    <h2>บันทึกใบจองแล้ว</h2>
    <p>เลขที่ <b>${esc(sentNo)}</b></p>
    ${warn.length ? `<div class="sb-alert">${warn.map(esc).join('<br>')}</div>` : ''}
    <div class="sb-actions">
      <button class="btn sb-exp sales" data-sbdone="export-sales">⬇ ส่งออก (Sales)</button>
      <button class="btn sb-exp cust" data-sbdone="export-customer">⬇ ส่งออก (ลูกค้า)</button>
    </div>
    <p class="dim"><a href="#/requests">ติดตามสถานะ</a> · <a href="#/register/FM-SMD-001">📋 ทะเบียนใบจอง</a> · <button class="link-btn" data-sbdone="new">＋ ใบจองใหม่</button></p>
  </div></div></section>`;
}
export function bindSolarDone() {
  $$('[data-sbdone]').forEach((b) => {
    b.onclick = async () => {
      const a = b.dataset.sbdone;
      if (a === 'new') { lastSaved = null; const { setState } = await import('../core/state.js'); setState({ formSent: null, solarDone: null }); return; }
      if (!lastSaved) return;
      openSolarDoc(a === 'export-customer' ? 'customer' : 'sales', lastSaved, { prices, quote: computeQuote(lastSaved, prices) });
    };
  });
}

export { SCHEDULE };
