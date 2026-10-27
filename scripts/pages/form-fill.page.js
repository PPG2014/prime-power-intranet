import { PPE_PROJECT, PPE_OTHER, ppeConfig, ppeApproversFor } from '../services/ppe.js';
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { renderForm, collectForm, bindForm, attachedFiles, loadLookups, withStandard, summarizeForm, NO_PROJECT, OFFICE_PROJECTS } from '../components/form-renderer.js';
import { buildRoute, flowFieldsFor, stepsOf, applicableSteps } from '../services/requests.js';
import { renderFormDoc } from '../templates/form-doc.js';
import { isWelfareRoom } from '../templates/welfare-room.js';
import { signaturePad, bindSignaturePads, readSignature, previewSignature } from '../components/signature-pad.js';
import { isPR, renderPR, readLiveValues, openPRWindow } from '../templates/pr-fm-pur-004.js';
import { isQueueForm, QUEUE_FIELDS, queueConflicts, freeSlots } from '../services/booking.js';
import { isSolar, SOLAR_FIELDS } from '../services/solar.js';
import { isCarForm, CAR_FIELDS, CAR_PLACE, carProblem, mapLink } from '../services/car.js';
/** ฟอร์มที่มีปฏิทินด้านข้าง: คิวรายวัน (Messenger) หรือจองรถ */
const hasCal = (fields) => isQueueForm(fields) || isCarForm(fields);
import { mountQueueCalendar } from '../components/queue-calendar.js';
import { confirmSubmit } from '../components/submit-confirm.js';
import { printWithNotice } from '../components/eta-notice.js';
import { formFolder } from '../services/photos.js';
import { findMe } from '../services/me.js';

export const meta = { route: 'form', title: 'กรอกแบบฟอร์ม', nav: false, order: 3, adminOnly: false };

let fields = [];

/** IsActive จาก SharePoint เป็น Yes/No ส่วน mock เป็น true/false รองรับทั้งคู่ · ค่าว่าง = แสดง */
const active = (v) => v !== false && v !== 'No' && v !== 'ไม่' && v !== 0;
let form = null;
let me = null;
let editId = null;
let editSign = null;
let solar = null;        // โมดูลหน้ากรอกเฉพาะ (ใบจองโซลาร์เซลล์)    // ลายเซ็นผู้ยื่นเดิม (โหมดแก้ไข)

/**
 * เลขที่เอกสาร แยกรันตามฟอร์ม รีเซ็ตทุกปี
 * รูปแบบ <รหัสฟอร์ม>-<ลำดับ 3 หลัก>-<ปี ค.ศ. 4 หลัก>  เช่น FM-ACC-002-001-2026
 */
function docNo(formCode, seq, year) {
  return `${formCode}-${String(seq).padStart(3, '0')}-${year}`;
}

/** หาลำดับถัดไปของฟอร์มนี้ในปีนี้ จากรายการที่มีอยู่ */
function nextSeq(existing, formCode, year) {
  const re = new RegExp('^' + formCode.replace(/[-]/g, '\\-') + '-(\\d+)-' + year + '$');
  const last = existing
    .map((r) => String(r.Title || ''))
    .map((t) => { const m = t.match(re); return m ? parseInt(m[1], 10) : 0; })
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a)[0] || 0;
  return last + 1;
}

/**
 * บันทึกคำขอพร้อมออกเลขที่ไม่ซ้ำ
 *
 * ป้องกันเลขซ้ำตอนหลายคนส่งพร้อมกัน ด้วยการอ่านเลขล่าสุด → บันทึก →
 * ถ้าพบว่าเลขซ้ำ (มีคนอื่นแทรกมาก่อน) ก็ขยับเลขแล้วลองใหม่ สูงสุด 5 ครั้ง
 *
 * นี่กันได้เกือบสมบูรณ์สำหรับการใช้งานจริง แต่ถ้าต้องการกันเด็ดขาด 100%
 * ให้ Power Automate เป็นคนออกเลขแทน (ดูหมายเหตุในคู่มือ)
 */
async function createWithDocNo(formCode, payload) {
  const year = new Date().getFullYear();       // ปี ค.ศ. 4 หลัก
  let attempt = 0;

  while (attempt < 5) {
    const existing = await list('requests', { fresh: true }).catch(() => []);
    const seq = nextSeq(existing, formCode, year) + attempt;
    const no = docNo(formCode, seq, year);

    // กันชั้นแรก ถ้าเลขนี้มีอยู่แล้วในรายการที่เพิ่งอ่าน ขยับไปเลย
    if (existing.some((r) => String(r.Title) === no)) { attempt++; continue; }

    try {
      const meta = await create('requests', { ...payload, Title: no });
      const info = { skipped: meta?.skipped || [], dropped: meta?.dropped || [] };
      // กันชั้นสอง อ่านซ้ำหลังบันทึก ถ้ามีเลขนี้มากกว่าหนึ่งรายการ แปลว่าชนกัน
      const after = await list('requests', { fresh: true }).catch(() => []);
      const dup = after.filter((r) => String(r.Title) === no);
      if (dup.length > 1) {
        // คนที่ id มากกว่า (บันทึกทีหลัง) เป็นฝ่ายต้องแก้เลข
        const mine = dup.sort((a, b) => (+b.id) - (+a.id))[0];
        const winnerExists = dup.some((r) => +r.id < +mine.id);
        if (winnerExists) {
          const newNo = docNo(formCode, seq + 1 + attempt, year);
          await update('requests', mine.id, { Title: newNo });
          return { no: newNo, ...info };
        }
      }
      return { no, ...info };
    } catch (e) {
      attempt++;
      if (attempt >= 5) throw e;
    }
  }
  throw new Error('ออกเลขที่เอกสารไม่สำเร็จ กรุณาลองใหม่');
}

export async function render(ctx) {
  const rawSeg = (location.hash.split('/')[2] || '');
  const code = rawSeg.split('?')[0].trim();
  editId = (rawSeg.match(/edit=(\d+)/) || [])[1] || null;

  const [forms, allFields, people] = await Promise.all([
    list('formCatalog'), list('formFields'), list('directory').catch(() => []),
  ]);

  form = forms.find((f) => f.FormCode === code);

  const own = allFields
    .filter((f) => f.FormCode === code && active(f.IsActive))
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  // เติมช่องหัวข้อมาตรฐานให้อัตโนมัติ ไม่ต้องกรอกในตาราง
  fields = withStandard(own, form);

  await loadLookups(fields, { formCode: form && form.FormCode });   // ช่องที่ดึงตัวเลือกจาก List อื่นต้องโหลดก่อนวาด

  // โหมดแก้ไข: ดึงคำขอเดิมมาเติมในฟอร์ม
  let editData = null;
  if (editId) {
    const all = await list('requests', { fresh: true }).catch(() => []);
    const orig = all.find((r) => String(r.id) === String(editId));
    if (orig) { try { editData = JSON.parse(orig.FormData || '{}'); } catch (e) {} }
  }
  editSign = (editData && editData._requesterSign) || null;

  me = findMe(people);

  if (!form) {
    return `<section class="page"><div class="wrap">
      <h1 class="page-title">ไม่พบแบบฟอร์ม</h1>
      <div class="panel"><div class="empty">ไม่พบแบบฟอร์มรหัส ${esc(code)}
        <br><a href="#/forms">กลับไปหน้าแบบฟอร์มทั้งหมด</a></div></div></div></section>`;
  }

  // ใบจองโซลาร์เซลล์: หน้ากรอกเฉพาะ (คำนวณราคา ลายเซ็น 3 ช่อง Solar Calculator)
  if (isSolar(form.FormCode)) {
    solar = await import('../forms/solar-booking.js');
    fields = SOLAR_FIELDS;
    if (state.formSent) return solar.solarDoneHtml({ sentNo: state.formSent, warn: state.formWarn || [] });
    return solar.solarRender({ form, me, dir: people, editData });
  }
  solar = null;

  if (state.formSent) {
    return `<section class="page page-form"><div class="wrap narrow">
      <div class="panel sent-panel">
        <div class="sent-mark">✓</div>
        <h2>ส่งคำขอเรียบร้อย</h2>
        <p>เลขที่คำขอ <b>${esc(state.formSent)}</b></p>
        ${(state.formWarn && state.formWarn.length) ? `<div class="mock-warning" style="text-align:left">
          ⚠ บันทึกแล้ว แต่มีเรื่องที่ต้องแก้ ไม่งั้นการแจ้งอนุมัติอัตโนมัติจะไม่ทำงาน:<br>
          • ${state.formWarn.map(esc).join('<br>• ')}</div>` : ''}
        <p class="dim">ติดตามความคืบหน้าได้ที่เมนูติดตามสถานะ</p>
        <div class="sent-actions">
          <a class="btn btn-primary" href="#/forms">กลับไปหน้าแบบฟอร์ม</a>
          <button class="btn-mini" id="again">ยื่นคำขอใหม่อีกใบ</button>
        </div>
      </div></div></section>`;
  }

  if (!fields.length) {
    return `<section class="page"><div class="wrap">
      <h1 class="page-title">${esc(form.Title)}</h1>
      <div class="panel"><div class="empty">
        แบบฟอร์มนี้ยังไม่ได้กำหนดช่องกรอก<br>
        <span class="dim">ผู้ดูแลระบบเพิ่มได้ที่ SharePoint List ชื่อ FormFields รหัส ${esc(code)}</span>
      </div></div></div></section>`;
  }

  return `
  <section class="page page-form${hasCal(fields) ? ' has-queue-cal' : ''}">
    <div class="wrap${hasCal(fields) ? '' : ' narrow'}">
      <a class="back-link" href="#/forms">← แบบฟอร์มทั้งหมด</a>
      <a class="back-link guide-link" href="#/form-guide/${esc(form.FormCode)}">📘 วิธีกรอกและเส้นทางอนุมัติของฟอร์มนี้</a>

      <div class="form-head">
        <div class="form-icon-lg">${form.Icon || '📄'}</div>
        <div>
          <h1>${esc(form.Title)}${editId ? ' <span class="edit-tag">แก้ไข</span>' : ''}</h1>
          <div class="form-sub">${esc(form.FormCode)} · ${esc(form.Department || '')}</div>
          ${descWithoutLinks(form.Description) ? `<p class="form-desc">${esc(descWithoutLinks(form.Description))}</p>` : ''}
        </div>
      </div>
      ${templateButtons(form)}

      <div class="${hasCal(fields) ? 'form-layout' : ''}">
      <div>

      ${me ? '' : `<div class="mock-warning">
        <b>ไม่พบข้อมูลของคุณในทะเบียนบุคลากร</b>
        ช่องที่ระบบกรอกให้อัตโนมัติจะว่างไว้ แจ้งผู้ดูแลให้เพิ่มอีเมลของคุณในทะเบียน
      </div>`}

      <div class="panel form-panel">
        ${renderForm(fields, me, editData || state.formDraft || {})}
        <div class="field-error" id="q-error" hidden></div>
        ${form.FormNote ? `<div class="form-note-box">
          <b>หมายเหตุ</b> ${esc(form.FormNote)}
        </div>` : ''}
        ${`<section class="q-group q-sign">
          <h3 class="q-group-title">ลายเซ็นผู้ยื่น${isWelfareRoom(form) || isPR(form.FormCode) ? ' <b class="req">*</b>' : ''}</h3>
          <div class="q-help">ลากเมาส์/นิ้วเซ็นในกรอบ หรืออัปโหลดรูปลายเซ็น · ใช้ในเอกสารที่ดาวน์โหลดและส่งออก${
            (editSign && editSign.url) || (me && me.SignatureUrl) ? ' · ถ้าไม่เซ็นใหม่ ระบบใช้ลายเซ็นที่แสดงอยู่' : ''}</div>
          ${signaturePad('requester', (editSign && editSign.url) || (me && me.SignatureUrl) || '', true)}
        </section>`}
        <div class="form-foot">
          <span class="dim">ยื่นโดย ${esc(state.user?.name || '')} · ${
            esc(thaiDateShort(new Date().toISOString()))}</span>
          <span class="foot-btns">
            <button class="btn-mini" id="q-download">⬇ ดาวน์โหลดแบบฟอร์ม</button>
            <button class="btn btn-primary" id="q-send">ส่งคำขอ</button>
          </span>
        </div>
      </div>
      </div>
      ${hasCal(fields) ? '<aside class="form-aside" id="queue-cal"></aside>' : ''}
      </div>
    </div>
  </section>`;
}


/* ─────────────────────────────────────────────────────────────
 * ลิงก์เอกสารใบปะหน้า / แบบฟอร์มสำหรับดาวน์โหลด
 * อ่านจากช่อง TemplateUrl (บรรทัดละลิงก์ ใส่ชื่อนำหน้าได้ "ชื่อ|ลิงก์")
 * และดึงลิงก์ที่พิมพ์ไว้ในคำอธิบายมาทำเป็นปุ่มด้วย จะได้ไม่ต้องแก้ข้อมูลเดิม
 * ───────────────────────────────────────────────────────────── */
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** ลิงก์ Google Docs/Sheets/Slides → ลิงก์ดาวน์โหลดเป็นไฟล์ Office ตรง ๆ */
function googleExport(url) {
  const m = String(url).match(/docs\.google\.com\/(spreadsheets|document|presentation)\/d\/([\w-]+)/);
  if (!m) return null;
  const fmt = { spreadsheets: 'xlsx', document: 'docx', presentation: 'pptx' }[m[1]];
  const name = { spreadsheets: 'Excel', document: 'Word', presentation: 'PowerPoint' }[m[1]];
  const gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1];
  return {
    url: `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=${fmt}${gid && fmt === 'xlsx' ? `&gid=${gid}` : ''}`,
    pdf: `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=pdf${gid && fmt === 'xlsx' ? `&gid=${gid}` : ''}`,
    name,
  };
}

function templateLinks(form) {
  const out = [];
  String(form.TemplateUrl || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
    const [a, b] = line.includes('|') ? line.split('|') : ['', line];
    const url = (b || '').trim();
    if (/^https?:\/\//.test(url)) out.push({ label: a.trim() || 'เอกสารใบปะหน้า', url });
  });
  (String(form.Description || '').match(URL_RE) || []).forEach((url) => {
    if (!out.some((x) => x.url === url)) out.push({ label: 'เอกสารใบปะหน้า', url });
  });
  return out;
}

/** คำอธิบายที่ตัดลิงก์ออกแล้ว (ลิงก์ไปแสดงเป็นปุ่มแทน) */
const descWithoutLinks = (text) => String(text || '')
  .replace(URL_RE, '').replace(/ดาวน์โหลดแบบฟอร์ม\s*[:：]?\s*$/m, '').replace(/\s{2,}/g, ' ').trim();

function templateButtons(form) {
  const links = templateLinks(form);
  if (!links.length) return '';
  return `<div class="tpl-links">
    ${links.map((l) => {
      const g = googleExport(l.url);
      return `<div class="tpl-item">
        <span class="tpl-label">📎 ${esc(l.label)}</span>
        ${g ? `<a class="btn-mini" href="${esc(g.url)}" target="_blank" rel="noopener">⬇ ดาวน์โหลด ${esc(g.name)}</a>
               <a class="btn-mini" href="${esc(g.pdf)}" target="_blank" rel="noopener">⬇ PDF</a>` : ''}
        <a class="btn-mini" href="${esc(l.url)}" target="_blank" rel="noopener">↗ ${g ? 'เปิดดู' : 'เปิด / ดาวน์โหลด'}</a>
      </div>`;
    }).join('')}
  </div>`;
}

/**
 * ตรวจช่วงเวลาที่ขอกับคิวเดิม
 * คืน { error, clash, html } · error = เวลาไม่ถูกต้อง (ห้ามส่ง) · clash = คิวที่ชน (ยังจองทับได้หลังยืนยัน)
 */
async function queueProblem(form, fields, values, excludeId) {
  const date = values[QUEUE_FIELDS.date];
  const from = values[QUEUE_FIELDS.from];
  const to = values[QUEUE_FIELDS.to];
  if (!date || !from || !to) return { error: '', clash: [], html: '' };

  if (String(to).padStart(5, '0') <= String(from).padStart(5, '0')) {
    return { error: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม กรุณาเลือกใหม่', clash: [], html: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม กรุณาเลือกใหม่' };
  }

  const hit = await queueConflicts({ formCode: form.FormCode, date, from, to, excludeId });
  if (!hit.length) return { error: '', clash: [], html: '' };

  const slotField = fields.find((f) => f.FieldKey === QUEUE_FIELDS.from) || {};
  const slots = String(slotField.Options || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const free = await freeSlots({ formCode: form.FormCode, date, slots });

  const html = `⚠ ช่วงเวลานี้ชนกับคิวที่มีอยู่แล้ว ${hit.length} รายการ — ยังจองทับได้ (ต้องกดยืนยันตอนส่ง) · ปฏิทินจะแสดงคิวที่ชนเป็นสีม่วง<br>`
    + hit.map((c) => `• <b>${esc(c.from)}–${esc(c.to)}</b> ${esc(c.by)}${c.what ? ` · เรื่อง: ${esc(c.what)}` : ''}${c.place ? ` · ${esc(c.place)}` : ''}`
      + `<span class="dim"> (${esc(c.title)}${c.status ? ` · ${esc(c.status)}` : ''})</span>`).join('<br>')
    + (free.length
      ? `<br><br>ช่วงเวลาที่ยังว่างของวันนี้: ${free.slice(0, 12).map(esc).join(' · ')}${free.length > 12 ? ' …' : ''}`
      : '');
  return { error: '', clash: hit, html };
}

/**
 * จองรถ: เตือนทันทีเมื่อเลือกวัน/เวลาแล้วรถเต็ม · วันที่สิ้นสุดตามวันเริ่มให้เอง · ปุ่มค้นสถานที่ใน Google Maps
 */
function bindCarForm(form, fields) {
  const box = $('#q-error');
  const els = Object.values(CAR_FIELDS).map((k) => $('#q_' + k)).filter(Boolean);
  const from = $('#q_' + CAR_FIELDS.dateFrom); const to = $('#q_' + CAR_FIELDS.dateTo);
  let timer = null;
  const check = async () => {
    const vals = {};
    els.forEach((el) => { vals[el.id.replace('q_', '')] = el.value; });
    if (!vals[CAR_FIELDS.dateFrom] || !vals[CAR_FIELDS.timeFrom] || !vals[CAR_FIELDS.timeTo]) return;
    const msg = await carProblem(form.FormCode, vals, editId);
    box.innerHTML = esc(msg).replace(/\n/g, '<br>');
    box.hidden = !msg;
  };
  els.forEach((el) => el.addEventListener('change', () => {
    if (el === from && to && (!to.value || to.value < from.value)) to.value = from.value;
    clearTimeout(timer); timer = setTimeout(check, 250);
  }));
  // สถานที่: พิมพ์ชื่อหรือวางลิงก์ Google Maps · ปุ่มเปิดแผนที่ในแท็บใหม่
  const place = $('#q_' + CAR_PLACE);
  if (place && !$('#car-map')) {
    const a = document.createElement('a');
    a.id = 'car-map'; a.className = 'btn-mini car-map'; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '🗺 เปิดในแผนที่';
    const sync = () => { const u = mapLink(place.value); a.href = u || 'https://www.google.com/maps'; };
    place.addEventListener('input', sync); sync();
    place.insertAdjacentElement('afterend', a);
  }
}

/** ดาวน์โหลดแบบฟอร์มเป็นเอกสาร A4 หน้าตาเหมือนหน้ากรอก กรอกค่าที่พิมพ์ไว้ให้ถ้ามี */
async function downloadBlankForm(form, fields) {
  // ใบขอสั่งซื้อใช้แม่แบบเอกสารจริง เติมค่าที่พิมพ์ไว้แล้วให้ ที่เหลือเว้นว่างให้เขียนมือ
  if (isPR(form.FormCode)) {
    const values = readLiveValues(fields);
    return openPRWindow(renderPR({
      values,
      requester: { name: (me && me.Title) || state.user?.name || '', dept: (me && me.Department) || '', position: (me && me.Position) || '' },
      submitted: new Date().toISOString(),
      sign: { requester: { name: (me && me.Title) || state.user?.name || '',
        sig: previewSignature('requester') || (editSign && editSign.url) || (me && me.SignatureUrl) || '' } },
    }), 'ดาวน์โหลดแบบฟอร์ม — ใบขอสั่งซื้อ');
  }
  const res = collectForm(fields);
  const values = res.values || res.partial || {};
  const sig = previewSignature('requester') || (editSign && editSign.url) || (me && me.SignatureUrl) || '';
  const steps = applicableSteps(await stepsOf(form.FormCode).catch(() => []), { FormData: values });
  const html = renderFormDoc({
    form, fields, values,
    requester: { name: (me && me.Title) || state.user?.name || '', sig },
    empCode: (me && me.EmployeeCode) || values.std_emp_code || '',
    position: (me && me.Position) || '',
    dept: (me && me.Department) || '',
    approvals: steps.map((st) => ({ role: st.StepName || `ผู้อนุมัติลำดับ ${st.StepOrder}` })),
  });

  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="dl-mask">
      <div class="modal modal-wide">
        <div class="modal-head">ดาวน์โหลดแบบฟอร์ม <button id="dl-close">✕</button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-foot">
          <span class="dim">ช่องที่ยังไม่กรอกเว้นว่างไว้ให้เขียนมือ</span>
          <button class="btn-mini" id="dl-cancel">ปิด</button>
          <button class="btn btn-primary" id="dl-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;
  const { hydratePhotos } = await import('../services/photos.js');
  hydratePhotos(win);     // ลายเซ็นที่เก็บใน SharePoint ต้องแนบ token จึงโหลดได้
  const close = () => { win.innerHTML = ''; };
  document.getElementById('dl-close').onclick = close;
  document.getElementById('dl-cancel').onclick = close;
  document.getElementById('dl-mask').onclick = (e) => { if (e.target.id === 'dl-mask') close(); };
  // แจ้งผลทางกฎหมายของเอกสารอิเล็กทรอนิกส์ก่อนพิมพ์ทุกครั้ง
  document.getElementById('dl-print').onclick = () => printWithNotice('printing-doc');
}

/** ช่องโครงการของฟอร์ม (ช่องเลือกจากทะเบียนโครงการ) */
const projectField = () => fields.find((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects');

/**
 * บอกผู้ยื่นล่วงหน้าว่าใครจะอนุมัติ ตามโครงการที่เลือก
 * ไม่เกี่ยวกับโครงการ / ไม่ได้อยู่ในทีมโครงการ → ผู้บังคับบัญชาของผู้ยื่นอนุมัติ
 */
function bindProjectHint() {
  const pf = projectField();
  const input = pf && document.getElementById('q_' + pf.FieldKey);
  if (!input) return;
  const hint = document.createElement('div');
  hint.className = 'q-help q-project-hint';
  input.insertAdjacentElement('afterend', hint);
  const show = async () => {
    const v = input.value.trim();
    const boss = (me && me.Manager) ? String(typeof me.Manager === 'object' ? (me.Manager.LookupValue ?? me.Manager.Title) : me.Manager) : '';
    const bossTxt = boss ? `ผู้บังคับบัญชาของคุณ (${boss})` : 'ผู้บังคับบัญชาของคุณ';
    if (!v) { hint.textContent = `ไม่เกี่ยวกับโครงการใด ให้เลือก "${NO_PROJECT}"`; hint.classList.remove('warn'); return; }
    if (v === NO_PROJECT) { hint.textContent = `คำขอนี้จะส่งให้${bossTxt}อนุมัติ`; hint.classList.remove('warn'); return; }
    // Prime Power Engineering Pro: ผู้อนุมัติตามที่ตั้งไว้ในหน้า 🏠 โครงการ PPE
    if (v === PPE_PROJECT) {
      const sel = document.getElementById('q_ppe_site');
      const site = sel && sel.value === PPE_OTHER ? (document.getElementById('q_ppe_other') || {}).value : (sel && sel.value);
      const who = ppeApproversFor(await ppeConfig(), site);
      hint.textContent = who.length ? `ผู้อนุมัติโครงการ PPE: ${who.join(', ')} (คนใดคนหนึ่ง)` : `ยังไม่ได้ตั้งผู้อนุมัติโครงการ PPE — คำขอจะส่งให้${bossTxt}อนุมัติ`;
      hint.classList.toggle('warn', !who.length);
      return;
    }
    const proj = (await list('projects').catch(() => [])).find((p) => String(p.Title).trim() === v);
    // สำนักงานใหญ่ / สำนักงานชลบุรี / งาน O&M (ไม่ได้อยู่ในทะเบียนโครงการ) → ผู้บังคับบัญชาอนุมัติ
    if (!proj && (OFFICE_PROJECTS.includes(v) || v === 'งาน O&M')) { hint.textContent = `คำขอนี้จะส่งให้${bossTxt}อนุมัติ`; hint.classList.remove('warn'); return; }
    if (!proj) { hint.textContent = ''; return; }
    const name = (me && me.Title) || '';
    const plain = (x) => String((x && typeof x === 'object' ? (x.LookupValue ?? x.Title) : x) || '').trim();
    const team = [plain(proj.Owner), ...(Array.isArray(proj.Team) ? proj.Team : String(proj.Team || '').split(',')).map(plain)];
    const mine = (Array.isArray(me && me.Project) ? me.Project : String((me && me.Project) || '').split(',')).map(plain);
    const inTeam = (!!name && team.filter(Boolean).includes(name)) || mine.filter(Boolean).includes(v);
    hint.textContent = inTeam ? 'คุณอยู่ในทีมโครงการนี้ · ผู้จัดการ/ผู้รับผิดชอบโครงการจะเป็นผู้อนุมัติ'
      : `⚠ คุณไม่ได้อยู่ในทีมของโครงการนี้ — คำขอจะส่งให้${bossTxt}อนุมัติด้วย`;
    hint.classList.toggle('warn', !inTeam);
  };
  input.addEventListener('change', show);
  input.addEventListener('input', show);
  // เปลี่ยนโครงการ PPE → ผู้อนุมัติอาจต่างกัน (ตั้งเฉพาะโครงการได้)
  ['q_ppe_site', 'q_ppe_other'].forEach((id) => { const el = document.getElementById(id); if (el) { el.addEventListener('change', show); el.addEventListener('input', show); } });
  show();
}

/**
 * บันทึกคำขอ (ยื่นใหม่ หรือแก้ไขแล้วยื่นใหม่เมื่อมี editId) — คำนวณเส้นทางอนุมัติ ออกเลขที่เอกสาร เติมช่องให้ Power Automate
 * ใช้ร่วมกับแบบฟอร์มที่มีหน้ากรอกเฉพาะ (เช่น ใบจองโซลาร์เซลล์) · คืน { sentNo, warn, no }
 */
export async function saveRequest(values, { flds = fields, files = attachedFiles(), afterCreate = null } = {}) {
  if (editId) {
    // แก้ไขคำขอเดิม เขียนทับข้อมูลและรีเซ็ตกลับลำดับ 1 (ยังไม่มีใครอนุมัติอยู่แล้ว)
    const orig = (await list('requests', { fresh: true }).catch(() => [])).find((r) => String(r.id) === String(editId)) || {};
    // ช่องที่ระบบ/ผู้อนุมัติเติมเอง (เลข PR ทะเบียนรถ ฯลฯ) ไม่อยู่ในฟอร์มที่ผู้ยื่นแก้ → เก็บค่าเดิมไว้
    try {
      const od = JSON.parse(orig.FormData || '{}') || {};
      ['pr_no', 'pr_date', 'car_plate', 'car_returned_at', 'q_no'].forEach((k) => {
        if (od[k] !== undefined && values[k] === undefined) values[k] = od[k];
      });
    } catch (e) { /* FormData เดิมอ่านไม่ได้ ข้าม */ }
    const rq = { ...orig, FormCode: form.FormCode, FormData: JSON.stringify(values) };
    const { route, missing } = await buildRoute(rq);
    const first = route.length ? route[0].step : 1;
    const um = await update('requests', editId, {
      FormData: JSON.stringify(values),
      SummaryText: summarizeForm(flds, values),
      Files: JSON.stringify(files),
      Status: 'รออนุมัติ', CurrentStep: first,
      ApprovalLog: (() => {
        let lg = []; try { lg = JSON.parse(orig.ApprovalLog || '[]'); } catch (e) { lg = []; }
        if (!Array.isArray(lg)) lg = [];
        lg.push({ step: 0, action: 'ยื่นใหม่', by: (me && me.Title) || state.user?.name || '',
                  note: 'แก้ไขและยื่นใหม่', at: new Date().toISOString() });
        return JSON.stringify(lg);
      })(),
      ...flowFieldsFor(route, first),
    });
    if (missing.length) console.warn('[route] ไม่พบอีเมลของ:', missing);
    const uprob = [...(um?.skipped || []), ...(um?.dropped || [])];
    if (uprob.some((x) => /^(Status|CurrentStep|FormData)\b/.test(x)))
      throw new Error('บันทึกการแก้ไขไม่ครบ ช่องสำคัญที่ SharePoint ไม่รับ:\n• ' + uprob.join('\n• '));
    const w1 = [...uprob];
    if (missing.length) w1.push('ไม่พบอีเมลผู้อนุมัติในทะเบียนบุคลากร: ' + missing.join(', '));
    if (!route.length) w1.push('ฟอร์มนี้ยังไม่ได้ตั้งเส้นทางอนุมัติ (ApprovalMatrix)');
    return { sentNo: 'แก้ไขแล้ว', warn: w1 };
  }

  // ใบขอสั่งซื้อ: ออกเลข PR อัตโนมัติ (PRyyMMnnn) ตอนยื่น · ตรวจซ้ำอีกครั้งหลังบันทึก
  const prMod = isPR(form.FormCode) ? await import('../services/pr.js') : null;
  if (prMod && !values.pr_no) {
    values.pr_no = prMod.nextPRNo(await list('requests', { fresh: true }).catch(() => []), { start: await prMod.prStart() });
    values.pr_date = prMod.todayISO();
  }

  const base = {
    FormCode: form.FormCode,
    FormName: form.Title,
    RequesterName: (me && me.Title) || state.user?.name || '',
    RequesterEmail: state.user?.email || '',
    RequesterDept: me?.Department || '',
    FormData: JSON.stringify(values),
    // สรุปทั้งใบเป็นข้อความ ให้การ์ด Teams/อีเมล แสดงได้ครบโดยไม่ต้องเปิดเว็บ
    SummaryText: summarizeForm(flds, values),
  };
  // คำนวณเส้นทาง + อีเมลผู้อนุมัติทุกลำดับไว้ล่วงหน้า ให้ Power Automate ใช้ได้ทันที
  const { route, missing } = await buildRoute(base);
  const first = route.length ? route[0].step : 1;
  if (missing.length) console.warn('[route] ไม่พบอีเมลของ:', missing);

  const r = await createWithDocNo(form.FormCode, {
    ...base,
    Status: 'รออนุมัติ',
    CurrentStep: first,
    SubmittedDate: new Date().toISOString(),
    Files: JSON.stringify(files),
    ApprovalLog: '[]',
    ...flowFieldsFor(route, first),
  });

  // ถ้าช่องสำคัญเขียนลง SharePoint ไม่ได้ อย่าขึ้นสำเร็จปลอม — บอกสาเหตุให้ชัด
  const problems = [...(r.skipped || []), ...(r.dropped || [])];
  const critical = problems.filter((x) => /^(Status|CurrentStep|FormCode|FormData)\b/.test(x));
  if (critical.length) {
    throw new Error(
      'คำขอบันทึกไม่ครบ ช่องสำคัญที่ SharePoint ไม่รับ:\n• ' + problems.join('\n• ') +
      '\n\nวิธีแก้: เปิด List Requests ที่ SharePoint แล้วแก้ชนิดคอลัมน์ให้ถูก — ' +
      'Status/FormCode ต้องเป็น Single line of text (ไม่ใช่ Choice), CurrentStep ต้องเป็น Number, ApprovalLog ต้องเป็น Multiple lines of text');
  }

  const warn = [...problems];
  if (missing.length) warn.push('ไม่พบอีเมลผู้อนุมัติในทะเบียนบุคลากร: ' + missing.join(', '));
  if (!route.length) warn.push('ฟอร์มนี้ยังไม่ได้ตั้งเส้นทางอนุมัติ (ApprovalMatrix)');
  let sentNo = r.no;
  if (prMod) {
    const row = (await list('requests', { fresh: true }).catch(() => [])).find((x) => String(x.Title) === String(r.no));
    const prNo = row ? await prMod.assignPRNo(row.id).catch(() => values.pr_no) : values.pr_no;
    if (prNo) sentNo = `${r.no} · PR No. ${prNo}`;
  }
  if (afterCreate) sentNo = (await afterCreate(r.no, sentNo)) || sentNo;
  return { sentNo, warn, no: r.no };
}

export function mount(ctx) {
  if (solar) {
    if (state.formSent) { solar.bindSolarDone(); return; }
    solar.solarMount({
      form, saveRequest,
      onSaved: ({ sentNo, warn }) => setState({ formSent: sentNo, formDraft: null, formWarn: warn.length ? warn : null }),
    });
    return;
  }
  const again = $('#again');
  if (again) again.onclick = () => setState({ formSent: null, formDraft: null });

  const send = $('#q-send');
  if (!send || !fields.length) return;

  bindForm(fields, formFolder(form, 'ไฟล์แนบ'));
  bindSignaturePads(formFolder(form, 'ลายเซ็น'));
  bindProjectHint();

  // ปฏิทินคิวรายเดือนด้านข้าง (เฉพาะฟอร์มที่จองเป็นช่วงเวลา)
  if (isQueueForm(fields)) mountQueueCalendar(form.FormCode);
  if (isCarForm(fields)) {
    mountQueueCalendar(form.FormCode, { kind: 'car' });
    bindCarForm(form, fields);
  }

  const dl = $('#q-download');
  if (dl) dl.onclick = () => downloadBlankForm(form, fields);

  // เตือนคิวชนทันทีที่เลือกวันหรือเวลา จะได้ไม่ต้องกรอกจนจบแล้วค่อยรู้
  if (isQueueForm(fields)) {
    const watch = [QUEUE_FIELDS.date, QUEUE_FIELDS.from, QUEUE_FIELDS.to]
      .map((k) => $('#q_' + k)).filter(Boolean);
    const box = $('#q-error');
    let timer = null;
    const check = async () => {
      const vals = {};
      watch.forEach((el) => { vals[el.id.replace('q_', '')] = el.value; });
      if (!vals[QUEUE_FIELDS.date] || !vals[QUEUE_FIELDS.from] || !vals[QUEUE_FIELDS.to]) return;
      const q = await queueProblem(form, fields, vals, editId);
      box.innerHTML = q.html;
      box.classList.toggle('q-warn', !!q.clash.length && !q.error);
      box.hidden = !q.html;
    };
    watch.forEach((el) => {
      el.onchange = () => { clearTimeout(timer); timer = setTimeout(check, 200); };
    });
  }

  send.onclick = async () => {
    const err = $('#q-error');
    err.classList.remove('q-warn');
    const res = collectForm(fields);

    // ใบขอสั่งซื้อ: ช่องโครงการต้องเลือกเสมอ (โครงการ หรือ "ไม่เกี่ยวกับโครงการ") เพื่อให้ระบบรู้ว่าใครอนุมัติ
    const pf = projectField();
    if (isPR(form.FormCode) && pf && !String((res.values || res.partial || {})[pf.FieldKey] || '').trim()) {
      (res.errors = res.errors || []).push(`${pf.Title} (เลือกโครงการ หรือ "${NO_PROJECT}")`);
    }
    if (res.errors) {
      err.innerHTML = `กรอกข้อมูลให้ครบก่อนส่ง<br>ยังขาด: ${esc(res.errors.join(', '))}`;
      err.hidden = false;
      return;
    }

    // จองรถ: รถว่างไม่พอในช่วงเวลานั้น (จองครบทุกคันแล้ว) → ห้ามส่ง ให้ติดต่อผู้ดูแลโดยตรง
    if (isCarForm(fields)) {
      const msg = await carProblem(form.FormCode, res.values, editId);
      if (msg) { err.innerHTML = esc(msg).replace(/\n/g, '<br>'); err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    }
    // ฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger) ต้องไม่ชนกับคิวที่มีอยู่
    // ชนกับคิวเดิม: แจ้งว่าชนกับใคร เรื่องอะไร แล้วให้ยืนยันว่าจะจองทับ
    if (isQueueForm(fields)) {
      const v = res.values;
      const q = await queueProblem(form, fields, v, editId);
      if (q.error) { err.innerHTML = esc(q.error); err.classList.remove('q-warn'); err.hidden = false; return; }
      if (q.clash.length) {
        const ok = confirm(`ช่วงเวลา ${v[QUEUE_FIELDS.from]}–${v[QUEUE_FIELDS.to]} ชนกับคิวที่มีอยู่แล้ว:\n\n`
          + q.clash.map((c) => `• ${c.from}–${c.to} ${c.by}${c.what ? ` · เรื่อง: ${c.what}` : ''}${c.place ? ` · ${c.place}` : ''} (${c.title})`).join('\n')
          + '\n\nยืนยันจองทับช่วงเวลานี้หรือไม่? (ปฏิทินจะแสดงคิวที่ชนเป็นสีม่วง)');
        if (!ok) { err.innerHTML = q.html; err.classList.add('q-warn'); err.hidden = false; return; }
        v._queueOverlap = q.clash.map((c) => c.title);   // บันทึกว่าผู้ยื่นยืนยันจองทับใบไหน
      }
    }
    // ใบรับรองแทนใบเสร็จต้องมีลายเซ็นผู้เบิกจ่าย (เซ็นใหม่ หรือมีลายเซ็นในทะเบียนแล้ว)
    if (isWelfareRoom(form) && !previewSignature('requester') && !(editSign && editSign.url) && !(me && me.SignatureUrl)) {
      err.innerHTML = 'กรุณาลงลายเซ็นผู้เบิกจ่ายก่อนส่ง — ลากเมาส์เซ็นในกรอบ หรือกด "อัปโหลดรูป"';
      err.hidden = false;
      const pad = $('.sig-pad[data-sig="requester"]');
      if (pad) pad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // ใบขอสั่งซื้อ: ผู้ยื่นต้องวาดหรืออัปโหลดลายเซ็นทุกครั้ง (ลงช่อง ผู้ขอสั่งซื้อ)
    if (isPR(form.FormCode) && !previewSignature('requester')) {
      err.innerHTML = 'กรุณาลงลายเซ็นผู้ขอสั่งซื้อก่อนส่ง — ลากเมาส์/นิ้วเซ็นในกรอบ หรือกด "อัปโหลดรูป"';
      err.hidden = false;
      const pad = $('.sig-pad[data-sig="requester"]');
      if (pad) pad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    err.hidden = true;

    // สรุปข้อมูลทั้งใบให้ตรวจทาน แล้วกดยืนยันก่อนส่งจริง
    const ok = await confirmSubmit({
      formName: form.Title,
      pairs: summarizeForm(fields, res.values, { html: true, pairs: true }),
      files: attachedFiles(),
      isEdit: !!editId,
    });
    if (!ok) return;

    send.disabled = true;
    send.textContent = 'กำลังส่ง…';

    try {
      // ลายเซ็นผู้ยื่น: เซ็นใหม่ → อัปโหลด · ไม่เซ็นใหม่ → ใช้ของเดิม/ลายเซ็นในทะเบียน
      {
        const url = await readSignature('requester', formFolder(form, 'ลายเซ็น'))
          || (editSign && editSign.url) || (me && me.SignatureUrl) || '';
        if (url) {
          res.values._requesterSign = { name: (me && me.Title) || state.user?.name || '',
            url, at: new Date().toISOString() };
        }
      }
      const { sentNo, warn } = await saveRequest(res.values);
      setState({ formSent: sentNo, formDraft: null, formWarn: warn.length ? warn : null });
    } catch (e) {
      console.error(e);
      err.innerHTML = `ส่งคำขอไม่สำเร็จ<br>${esc(e.message).replace(/\n/g, '<br>')}`;
      err.hidden = false;
      send.disabled = false;
      send.textContent = 'ส่งคำขอ';
    }
  };
}
