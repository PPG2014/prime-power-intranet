/**
 * คู่มือทุกแบบฟอร์ม — สร้างจากข้อมูลจริงในระบบทุกครั้งที่เปิด
 * อ่านทะเบียนแบบฟอร์ม ช่องกรอก และเส้นทางอนุมัติ แล้วอธิบายเป็นภาษาคน:
 * กรอกอะไร ช่องไหนบังคับ ช่องไหนโผล่เมื่อไร ใครอนุมัติ ลำดับไหนใช้เมื่อไร และกติกาพิเศษของระบบ
 * แบบฟอร์มใหม่ที่ผู้ดูแลเพิ่มจะขึ้นในคู่มือนี้เองโดยไม่ต้องแก้โค้ด · พิมพ์/บันทึกเป็น PDF ได้
 * #/form-guide = ทุกฟอร์ม · #/form-guide/<รหัส> = เฉพาะฟอร์มนั้น
 */
import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { withStandard, lineCols, OFFICE_PROJECTS, NO_PROJECT } from '../components/form-renderer.js';
import { stepsOf, isOptionalStep, isNotifyEarly, SIGN_EVERY_STEP, needsSlip, PURCHASE_STATUSES } from '../services/requests.js';
import { isQueueForm } from '../services/booking.js';
import { isCarForm } from '../services/car.js';
import { isPR } from '../templates/pr-fm-pur-004.js';
import { OM_FORMS, OM_PROJECT } from '../services/om.js';
import { DEPT_WATCH_FORMS, NEED_DATE_FORMS } from './requests.page.js';
import { groupByDepartment } from '../utils/dept.js';
import { isSolar, SOLAR_FIELDS } from '../services/solar.js';

export const meta = { route: 'form-guide', title: 'คู่มือทุกแบบฟอร์ม', nav: false, order: 99, adminOnly: false };

/** IsActive จาก SharePoint เป็น Yes/No ส่วน mock เป็น true/false · ค่าว่าง = ใช้งาน */
const active = (v) => !(v === false || /^(no|false|0|ไม่)$/i.test(String(v ?? '').trim()));
const yes = (v) => v === true || v === 'Yes' || v === 'ใช่';
const codeOf = (v) => String((v && typeof v === 'object') ? (v.LookupValue ?? v.Title ?? '') : (v ?? '')).trim();
const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? (x.LookupValue ?? x.Title ?? '') : x))
  : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);

/** ชนิดช่องเป็นภาษาคน */
const TYPE_TH = {
  text: 'พิมพ์ข้อความสั้น', textarea: 'พิมพ์ข้อความยาว', number: 'ตัวเลข', currency: 'จำนวนเงิน (บาท)',
  date: 'เลือกวันที่', time: 'เลือกเวลา', choice: 'เลือก 1 ข้อ', multichoice: 'เลือกได้หลายข้อ',
  lookup: 'เลือกจากรายการ', person: 'เลือกชื่อบุคลากร', yesno: 'ติ๊ก ใช่/ไม่ใช่', file: 'แนบไฟล์',
  readonly: 'ระบบเติมให้ (แก้ไม่ได้)', lineitems: 'ตารางรายการ (เพิ่มได้หลายแถว)',
};
const LOOKUP_TH = { projects: 'ทะเบียนโครงการ', directory: 'รายชื่อบุคลากร', departments: 'รายชื่อฝ่าย', rooms: 'ห้องประชุม' };

/** ประเภทผู้อนุมัติเป็นภาษาคน */
function approverText(s) {
  const t = String(s.ApproverType || '').trim();
  const dept = codeOf(s.ApproverDept);
  const fixed = [...names(s.Approvers), ...names(s.ExtraApprovers)];
  const by = {
    'ผู้บังคับบัญชาของผู้ยื่น': 'ผู้บังคับบัญชาของผู้ยื่น (ตามทะเบียนบุคลากร)',
    'ผู้จัดการฝ่ายของผู้ยื่น': 'ผู้จัดการฝ่ายที่ผู้ยื่นสังกัด',
    'หัวหน้าฝ่ายตามสังกัด': 'หัวหน้าฝ่ายตามสังกัดของผู้ยื่น',
    'ทุกคนในฝ่ายที่ระบุ': `ทุกคนใน${dept || 'ฝ่ายที่ระบุ'} (คนใดคนหนึ่งกดได้)`,
    'ผู้จัดการฝ่ายที่ระบุ': `ผู้จัดการ${dept || 'ฝ่ายที่ระบุ'}`,
    'ผู้รับผิดชอบหลักของโครงการ': 'ผู้รับผิดชอบหลักของโครงการที่เลือกในฟอร์ม',
    'ผู้จัดการโครงการ': 'ผู้จัดการโครงการที่เลือกในฟอร์ม',
    'ผู้อำนวยการโครงการ': 'ผู้อำนวยการโครงการที่เลือกในฟอร์ม',
  }[t] || (t && t !== 'ระบุชื่อเจาะจง' ? t : '');
  const also = String(s.AlsoTypes || '').split(',').map((x) => x.trim()).filter(Boolean);
  const parts = [];
  if (by) parts.push(by);
  if (also.length) parts.push(`หรือ ${also.join(' / ')}`);
  if (fixed.length) parts.push((by ? 'และ ' : '') + fixed.join(', '));
  if (!parts.length) parts.push('<span class="fg-warn">ยังไม่ได้ระบุผู้อนุมัติ</span>');
  return parts.join(' ');
}

/** เงื่อนไขของลำดับอนุมัติเป็นภาษาคน */
function stepCondText(s, fieldTitle) {
  const field = String(s.ConditionField || '').trim();
  const vals = String(s.ConditionValues || '').split(',').map((x) => x.trim()).filter(Boolean);
  return field && vals.length ? `ใช้เฉพาะเมื่อ “${esc(fieldTitle(field))}” = ${vals.map((v) => `<b>${esc(v)}</b>`).join(' หรือ ')}` : 'ใช้กับทุกคำขอ';
}

/** เงื่อนไขแสดงช่อง (ShowIf) เป็นภาษาคน */
function showIfText(rule, fieldTitle) {
  if (!rule) return '';
  return 'แสดงเมื่อ ' + String(rule).split('|').map((part) => {
    const [k, ...rest] = part.split('=');
    return `“${esc(fieldTitle(k.trim()))}” = <b>${esc(rest.join('=').trim())}</b>`;
  }).join(' หรือ ');
}

/** กติกาพิเศษที่ระบบทำให้เองตามชนิดฟอร์ม (อ่านจากโค้ด ไม่ต้องตั้งค่า) */
function systemRules(form, fields) {
  const code = codeOf(form.FormCode);
  const out = [];
  const hasProject = fields.some((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects');
  out.push(`ส่งแล้วได้เลขที่เอกสารอัตโนมัติ รูปแบบ <b>${esc(code || 'รหัสฟอร์ม')}-ลำดับ-ปี ค.ศ.</b> เช่น ${esc(code || 'FM-XXX-000')}-001-${new Date().getFullYear()}`);
  if (hasProject) {
    out.push(`ช่องโครงการ: เลือกจากทะเบียนโครงการ หรือเลือก <b>${OFFICE_PROJECTS.join('</b> / <b>')}</b> (งานสำนักงาน) หรือ <b>${esc(NO_PROJECT)}</b> หรือ <b>Prime Power Engineering Pro Co., Ltd</b> (เลือกโครงการ PPE หรือพิมพ์ชื่อเอง · ผู้อนุมัติตามที่ตั้งใน จัดการข้อมูล → 🏠 โครงการ PPE) · ลำดับที่ตั้งเป็น "ผู้จัดการ/ผู้รับผิดชอบโครงการ" จะหาผู้อนุมัติจากโครงการที่เลือก ถ้าไม่ได้เลือกโครงการหรือผู้ยื่นไม่อยู่ในทีมโครงการ ผู้บังคับบัญชาของผู้ยื่นอนุมัติแทนได้`);
  }
  if (OM_FORMS.includes(code)) out.push(`มีตัวเลือก <b>${esc(OM_PROJECT)}</b> — เลือกแล้วต้องเลือกไซต์ O&amp;M (WHA Group / Gulf Solar) หรือพิมพ์ชื่อไซต์ใหม่เองได้`);
  if (isPR(code)) {
    out.push('ระบบออก <b>เลข PR อัตโนมัติ</b> ตอนกดส่ง รูปแบบ PRปปดดลำดับ (เช่น PR2610175) ขึ้นเดือนใหม่เริ่ม 001');
    out.push('ผู้อนุมัติ <b>ต้องลงลายเซ็นทุกขั้น</b> ก่อนกดอนุมัติ (ไม่มีลายเซ็นกดไม่ได้)');
    out.push(`หลังอนุมัติครบ ฝ่ายจัดซื้ออัปเดตสถานะจัดซื้อ: ${PURCHASE_STATUSES.filter((x) => x !== '-').join(' → ')} · ดูรวมได้ที่ทะเบียนใบขอสั่งซื้อ (PR)`);
  } else if (SIGN_EVERY_STEP.includes(code)) out.push('ผู้อนุมัติต้องลงลายเซ็นทุกขั้นก่อนกดอนุมัติ');
  if (needsSlip(code, form.Title)) out.push('ขั้นสุดท้าย ฝ่ายการเงิน <b>แนบสลิปโอนเงิน</b> แล้วปิดงาน ผู้ยื่นได้รับแจ้งพร้อมสลิป');
  if (NEED_DATE_FORMS.includes(code)) out.push(`หน้าติดตามสถานะแสดงวันที่ต้องใช้เงิน: <b class="fg-due">ถึงกำหนด/เลยกำหนด = แดง</b> · <b class="fg-soon">อีก 1–3 วัน = เหลือง</b> · เกิน 3 วัน = เทา และกดกรองได้`);
  const watch = Object.entries(DEPT_WATCH_FORMS).filter(([, codes]) => codes.includes(code)).map(([d]) => d);
  if (watch.length) out.push(`${esc(watch.join(', '))} เห็นคำขอของฟอร์มนี้ทุกใบเพื่อตรวจสอบ (กดอนุมัติได้เฉพาะคนที่อยู่ในเส้นทาง)`);
  if (isSolar(code)) {
    out.push('หน้ากรอกเฉพาะ: <b>คำนวณราคาอัตโนมัติ</b>จาก Price List (ระบบ · แบตเตอรี่ · Optimizer · Smart Guard · โครงสร้างพิเศษ) → ส่วนลด → VAT → รวมทั้งสิ้น และงวดชำระ 50/45/5% หลังหักเงินจอง');
    out.push('เลขที่ใบเสนอราคาอัตโนมัติ <b>SMD-001-ปปดดลำดับ</b> (เช่น SMD-001-2610001) ขึ้นเดือนใหม่เริ่ม 001 · วันที่ตั้งเป็นวันนี้ แก้ได้ · ที่ปรึกษาการขายเลือกจากรายชื่อบุคลากร');
    out.push('ลายเซ็น 3 ช่อง: ผู้สั่งซื้อ · ผู้แทนฝ่ายขาย · ผู้ตรวจสอบ/วิศวกรฝ่ายขาย · ส่งออกเอกสาร <b>ฉบับ Sales</b> และ <b>ฉบับลูกค้า (A4 หน้าเดียว)</b>');
    out.push('แถบ <b>☀ Solar Calculator</b> ด้านขวา คำนวณขนาดติดตั้ง/แบตเตอรี่/ความคุ้มค่า แล้วกดใช้แพ็กเกจในใบจองได้ · ข้อมูลที่กรอกค้างเก็บในเครื่อง เน็ตหลุดไม่หาย');
  }
  if (isQueueForm(fields)) out.push('เป็นการจองคิวตามช่วงเวลา: มีปฏิทินคิวข้างฟอร์ม ถ้าเวลาชนกับคิวอื่น ระบบเตือนว่าชนกับใคร เรื่องอะไร และให้ยืนยันก่อนจองซ้อน (คิวซ้อนขึ้นสีม่วงในปฏิทิน)');
  if (isCarForm(fields)) out.push('เป็นการจองรถ: เลือกช่วงวัน-เวลา ระบบตรวจรถว่าง/ชนกัน ผู้ดูแลรถเลือกทะเบียนรถตอนอนุมัติ เปลี่ยนรถ ยกเลิก หรือกดคืนรถได้ · ดูตารางการใช้รถได้ในปฏิทิน');
  if (fields.some((f) => f.FieldType === 'lineitems')) out.push('มีตารางรายการ: กด ＋ เพิ่มแถว ระบบรวมยอดเงินให้เอง');
  if (yes(form.UseStandardHeader) || form.UseStandardHeader === undefined || form.UseStandardHeader === '') {
    out.push('ส่วน "ข้อมูลผู้ยื่น" (รหัส ชื่อ อีเมล ฝ่าย แผนก) ระบบดึงจากบัญชีที่ล็อกอินให้เอง');
  }
  out.push('ถูกส่งกลับแก้ไข → กด "แก้ไขและส่งใหม่" ได้ ข้อมูลเดิมยังอยู่ · ยกเลิกเองได้ระหว่างรออนุมัติ');
  return out;
}

let forms = [];
let fieldsByCode = {};
let stepsByCode = {};

export async function render(ctx) {
  const only = state.params && state.params.id ? decodeURIComponent(state.params.id) : '';
  const [catalog, allFields] = await Promise.all([
    list('formCatalog').catch(() => []), list('formFields').catch(() => []),
  ]);
  const showOff = !!state.fgShowOff && (state.isAdmin || state.isHR);
  forms = catalog.filter((f) => showOff || active(f.IsActive))
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  const q = String(state.fgQuery || '').trim().toLowerCase();
  const shown = forms.filter((f) => (!only || codeOf(f.FormCode) === only)
    && (!q || `${f.Title} ${codeOf(f.FormCode)} ${codeOf(f.Department)} ${f.Description || ''}`.toLowerCase().includes(q)));

  fieldsByCode = {};
  allFields.forEach((f) => {
    const c = codeOf(f.FormCode);
    if (!active(f.IsActive)) return;
    (fieldsByCode[c] = fieldsByCode[c] || []).push(f);
  });
  Object.values(fieldsByCode).forEach((a) => a.sort((x, y) => (+x.SortOrder || 0) - (+y.SortOrder || 0)));
  const steps = await Promise.all(shown.map((f) => stepsOf(codeOf(f.FormCode)).catch(() => [])));
  stepsByCode = {};
  shown.forEach((f, i) => { stepsByCode[codeOf(f.FormCode)] = steps[i]; });

  const groups = await groupByDepartment(shown.map((f) => ({ ...f, Department: codeOf(f.Department) || 'ไม่ระบุฝ่าย' })), 'Department', { byRows: true });

  return `
  <section class="page page-form-guide">
    <div class="wrap">
      <div class="fg-head no-print-break">
        <h1 class="page-title">📘 ${esc(meta.title)}</h1>
        <p class="page-lead">อธิบายทุกแบบฟอร์มที่เปิดใช้งาน ${forms.length} ฟอร์ม — กรอกอะไร ช่องไหนบังคับ ช่องไหนแสดงเมื่อไร ใครอนุมัติ และกติกาพิเศษ
          · สร้างจากข้อมูลจริงในระบบทุกครั้งที่เปิด แบบฟอร์มที่เพิ่ม/แก้ใหม่ขึ้นที่นี่ทันที</p>
        <div class="fg-tools no-print">
          ${only ? `<a class="btn-mini" href="#/form-guide">← ดูทุกแบบฟอร์ม</a>` : `<input id="fg-q" type="search" data-keepfocus value="${esc(state.fgQuery || '')}" placeholder="🔍 ค้นหาชื่อฟอร์ม รหัส หรือฝ่าย…" autocomplete="off">`}
          <button class="btn-mini" id="fg-print">🖨 พิมพ์ / บันทึกเป็น PDF</button>
          ${state.isAdmin || state.isHR ? `<label class="fg-off"><input type="checkbox" id="fg-off" ${showOff ? 'checked' : ''}> แสดงฟอร์มที่ปิดใช้งาน</label>
          <button class="btn-mini" id="fg-json" title="ไฟล์ข้อมูลแบบฟอร์มทั้งหมด ใช้ทำคู่มือ/สำรองข้อมูล">⬇ ข้อมูลแบบฟอร์ม (JSON)</button>` : ''}
        </div>
      </div>

      ${only ? '' : `<nav class="fg-toc no-print-break" aria-label="สารบัญแบบฟอร์ม">
        ${groups.map((g) => `<div class="fg-toc-g"><b>${esc(g.name)}</b>
          <ol>${g.rows.map((f) => `<li><button type="button" class="fg-link" data-fgjump="${esc(codeOf(f.FormCode))}">${esc(f.Icon || '📄')} ${esc(f.Title)}</button> <span class="dim">${esc(codeOf(f.FormCode))}</span></li>`).join('')}</ol></div>`).join('')}
      </nav>`}

      ${shown.length ? groups.map((g) => `
        <h2 class="fg-dept">${esc(g.name)} <span class="dim">${g.rows.length} แบบฟอร์ม</span></h2>
        ${g.rows.map((f) => formCard(f)).join('')}`).join('')
        : '<div class="panel"><div class="empty">ไม่พบแบบฟอร์มที่ค้นหา</div></div>'}
    </div>
  </section>`;
}

function formCard(form) {
  const code = codeOf(form.FormCode);
  const own = fieldsByCode[code] || [];
  // ใบจองโซลาร์มีหน้ากรอกเฉพาะ ช่องกำหนดในโค้ด
  const fields = isSolar(code) && !own.length ? SOLAR_FIELDS : withStandard(own, form);
  const steps = stepsByCode[code] || [];
  const titleOf = (k) => (fields.find((f) => f.FieldKey === k) || {}).Title || k;
  const ext = String(form.ExternalUrl || '').trim();
  const off = !active(form.IsActive);

  const fieldRows = fields.map((f, i) => {
    const t = String(f.FieldType || 'text');
    let detail = '';
    if (t === 'choice' || t === 'multichoice') detail = String(f.Options || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((o) => `<span class="fg-opt">${esc(o)}</span>`).join(' ');
    else if (t === 'lookup' || t === 'person') detail = `จาก${esc(LOOKUP_TH[String(f.Options || '').trim()] || (t === 'person' ? 'รายชื่อบุคลากร' : String(f.Options || '')))}`;
    else if (t === 'lineitems') detail = 'คอลัมน์: ' + lineCols(f).map((c) => esc(c.label)).join(' · ');
    const def = String(f.DefaultValue || '').trim();
    const defText = def === '{today}' ? 'ค่าเริ่มต้น = วันนี้' : /^\{me\./.test(def) ? 'ดึงจากข้อมูลผู้ยื่น' : def ? `ค่าเริ่มต้น = ${esc(def)}` : '';
    const notes = [detail, f.HelpText ? `💡 ${esc(f.HelpText)}` : '', defText, f.ShowIf ? `<span class="fg-if">👁 ${showIfText(f.ShowIf, titleOf)}</span>` : '']
      .filter(Boolean).join('<br>');
    return `<tr>
      <td class="n">${i + 1}</td>
      <td><b>${esc(f.Title)}</b>${f.Section && (i === 0 || fields[i - 1].Section !== f.Section) ? `<div class="fg-sec">${esc(f.Section)}</div>` : ''}</td>
      <td>${esc(TYPE_TH[t] || t)}</td>
      <td class="c">${yes(f.IsRequired) ? '<span class="fg-req">ต้องกรอก</span>' : '<span class="dim">ไม่บังคับ</span>'}</td>
      <td>${notes || '<span class="dim">—</span>'}</td>
    </tr>`;
  }).join('');

  const signAll = SIGN_EVERY_STEP.includes(code);
  const stepRows = steps.map((s) => `<tr>
      <td class="n">${esc(s.StepOrder)}</td>
      <td><b>${esc(s.StepName || '')}</b></td>
      <td>${/ผู้ทบทวน/.test(String(s.StepName || '')) ? 'ตามผู้รับผิดชอบหลักของโครงการ / ฝ่ายที่กำหนด' : approverText(s)}</td>
      <td>${/ครบ/.test(String(s.ApproveMode || '')) ? '<b>ทุกคนต้องอนุมัติ</b>' : 'คนใดคนหนึ่งอนุมัติก็ผ่าน'}${signAll ? '<br>✍ ต้องลงลายเซ็น' : ''}</td>
      <td>${stepCondText(s, titleOf)}${isOptionalStep(s) ? '<br>ข้ามได้ถ้าไม่มีผู้อนุมัติ' : ''}${isNotifyEarly(s) ? '<br>🔔 ได้รับแจ้งตั้งแต่ยื่น' : ''}</td>
    </tr>`).join('');

  return `
  <article class="fg-card${off ? ' off' : ''}" id="fg-${esc(code)}">
    <div class="fg-card-head">
      <span class="fg-icon">${esc(form.Icon || '📄')}</span>
      <div>
        <h3>${esc(form.Title)} ${off ? '<span class="fg-badge off">ปิดใช้งาน</span>' : ''}${form.Badge ? ` <span class="fg-badge">${esc(form.Badge)}</span>` : ''}</h3>
        <div class="fg-meta">รหัส <b>${esc(code)}</b>${form.ISODocNo ? ` · เอกสาร ISO ${esc(form.ISODocNo)}${form.ISORevision ? ` Rev.${esc(form.ISORevision)}` : ''}` : ''} · เจ้าของ ${esc(codeOf(form.Department) || '—')}</div>
        ${form.Description ? `<p class="fg-desc">${esc(form.Description)}</p>` : ''}
      </div>
      ${ext ? `<a class="btn-mini no-print" href="${esc(ext)}" target="_blank" rel="noopener">เปิดระบบ ↗</a>` : `<a class="btn-mini no-print" href="#/form/${esc(code)}">เปิดแบบฟอร์ม →</a>`}
    </div>
    ${ext ? `<div class="fg-ext">🔗 แบบฟอร์มนี้ใช้งานผ่านระบบภายนอก: <a href="${esc(ext)}" target="_blank" rel="noopener">${esc(ext)}</a> — การกรอกและอนุมัติเป็นไปตามระบบนั้น</div>` : `
    ${form.FormNote ? `<div class="fg-note">⚠ ${esc(form.FormNote)}</div>` : ''}
    <h4>1. ช่องที่ต้องกรอก <span class="dim">${fields.length} ช่อง · บังคับ ${fields.filter((f) => yes(f.IsRequired)).length} ช่อง</span></h4>
    <div class="fg-scroll"><table class="fg-table">
      <thead><tr><th>#</th><th>ชื่อช่อง</th><th>วิธีกรอก</th><th>บังคับ</th><th>ตัวเลือก / คำแนะนำ / เงื่อนไข</th></tr></thead>
      <tbody>${fieldRows}</tbody></table></div>
    <h4>2. ลำดับการอนุมัติ <span class="dim">${steps.length ? `${steps.length} ลำดับ` : ''}</span></h4>
    ${steps.length ? `<div class="fg-scroll"><table class="fg-table">
      <thead><tr><th>ลำดับ</th><th>ขั้น</th><th>ผู้อนุมัติ</th><th>เงื่อนไขการผ่าน</th><th>ใช้เมื่อ</th></tr></thead>
      <tbody>${stepRows}</tbody></table></div>
      <p class="fg-hint">ลำดับที่มีเงื่อนไข "ใช้เฉพาะเมื่อ" ถ้าคำขอไม่ตรงเงื่อนไข ระบบข้ามลำดับนั้นให้เอง · ผู้อนุมัติที่ลา ระบบส่งให้ผู้ปฏิบัติแทนอัตโนมัติ</p>`
      : '<p class="fg-warn">ยังไม่ได้ตั้งเส้นทางอนุมัติ — ส่งคำขอแล้วจะไม่มีผู้อนุมัติ (แจ้งผู้ดูแลระบบ)</p>'}
    <h4>3. กติกาพิเศษที่ระบบทำให้</h4>
    <ul class="fg-rules">${systemRules(form, fields).map((r) => `<li>${r}</li>`).join('')}</ul>`}
  </article>`;
}

export function mount(ctx) {
  const q = $('#fg-q');
  if (q) {
    let t;
    q.oninput = (e) => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => setState({ fgQuery: v }), 250); };
  }
  const pr = $('#fg-print');
  if (pr) pr.onclick = () => window.print();
  const off = $('#fg-off');
  if (off) off.onchange = (e) => setState({ fgShowOff: e.target.checked });
  onClick('fgjump', (code) => document.getElementById('fg-' + code)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const js = $('#fg-json');
  if (js) js.onclick = async () => {
    const [catalog, fields, matrix] = await Promise.all([list('formCatalog'), list('formFields'), list('approvalMatrix')].map((p) => p.catch(() => [])));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), formCatalog: catalog, formFields: fields, approvalMatrix: matrix }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `form-guide-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}
