import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { renderForm, collectForm, bindForm, attachedFiles, loadLookups, withStandard, summarizeForm } from '../components/form-renderer.js';
import { LETTERHEAD } from '../core/letterhead.js';
import { buildRoute, flowFieldsFor } from '../services/requests.js';
import { isPR, renderPR, readLiveValues, openPRWindow } from '../templates/pr-fm-pur-004.js';

export const meta = { route: 'form', title: 'กรอกแบบฟอร์ม', nav: false, order: 3, adminOnly: false };

let fields = [];

/** IsActive จาก SharePoint เป็น Yes/No ส่วน mock เป็น true/false รองรับทั้งคู่ · ค่าว่าง = แสดง */
const active = (v) => v !== false && v !== 'No' && v !== 'ไม่' && v !== 0;
let form = null;
let me = null;
let editId = null;

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
    const existing = await list('requests').catch(() => []);
    const seq = nextSeq(existing, formCode, year) + attempt;
    const no = docNo(formCode, seq, year);

    // กันชั้นแรก ถ้าเลขนี้มีอยู่แล้วในรายการที่เพิ่งอ่าน ขยับไปเลย
    if (existing.some((r) => String(r.Title) === no)) { attempt++; continue; }

    try {
      const meta = await create('requests', { ...payload, Title: no });
      const info = { skipped: meta?.skipped || [], dropped: meta?.dropped || [] };
      // กันชั้นสอง อ่านซ้ำหลังบันทึก ถ้ามีเลขนี้มากกว่าหนึ่งรายการ แปลว่าชนกัน
      const after = await list('requests').catch(() => []);
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

  await loadLookups(fields);   // ช่องที่ดึงตัวเลือกจาก List อื่นต้องโหลดก่อนวาด

  // โหมดแก้ไข: ดึงคำขอเดิมมาเติมในฟอร์ม
  let editData = null;
  if (editId) {
    const all = await list('requests').catch(() => []);
    const orig = all.find((r) => String(r.id) === String(editId));
    if (orig) { try { editData = JSON.parse(orig.FormData || '{}'); } catch (e) {} }
  }

  me = people.find((p) => p.Email && state.user
    && p.Email.toLowerCase() === String(state.user.email).toLowerCase()) || null;

  if (!form) {
    return `<section class="page"><div class="wrap">
      <h1 class="page-title">ไม่พบแบบฟอร์ม</h1>
      <div class="panel"><div class="empty">ไม่พบแบบฟอร์มรหัส ${esc(code)}
        <br><a href="#/forms">กลับไปหน้าแบบฟอร์มทั้งหมด</a></div></div></div></section>`;
  }

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
  <section class="page page-form">
    <div class="wrap narrow">
      <a class="back-link" href="#/forms">← แบบฟอร์มทั้งหมด</a>

      <div class="form-head">
        <div class="form-icon-lg">${form.Icon || '📄'}</div>
        <div>
          <h1>${esc(form.Title)}${editId ? ' <span class="edit-tag">แก้ไข</span>' : ''}</h1>
          <div class="form-sub">${esc(form.FormCode)} · ${esc(form.Department || '')}</div>
          ${descWithoutLinks(form.Description) ? `<p class="form-desc">${esc(descWithoutLinks(form.Description))}</p>` : ''}
        </div>
      </div>
      ${templateButtons(form)}

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
        <div class="form-foot">
          <span class="dim">ยื่นโดย ${esc(state.user?.name || '')} · ${
            esc(thaiDateShort(new Date().toISOString()))}</span>
          <span class="foot-btns">
            <button class="btn-mini" id="q-download">⭳ ดาวน์โหลดแบบฟอร์ม</button>
            <button class="btn btn-primary" id="q-send">ส่งคำขอ</button>
          </span>
        </div>
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
        ${g ? `<a class="btn-mini" href="${esc(g.url)}" target="_blank" rel="noopener">⭳ ดาวน์โหลด ${esc(g.name)}</a>
               <a class="btn-mini" href="${esc(g.pdf)}" target="_blank" rel="noopener">⭳ PDF</a>` : ''}
        <a class="btn-mini" href="${esc(l.url)}" target="_blank" rel="noopener">↗ ${g ? 'เปิดดู' : 'เปิด / ดาวน์โหลด'}</a>
      </div>`;
    }).join('')}
  </div>`;
}

/** ดาวน์โหลดแบบฟอร์มเป็นเอกสาร A4 พร้อมหัวกระดาษ กรอกค่าที่พิมพ์ไว้ให้ถ้ามี */
function downloadBlankForm(form, fields) {
  // ใบขอสั่งซื้อใช้แม่แบบเอกสารจริง เติมค่าที่พิมพ์ไว้แล้วให้ ที่เหลือเว้นว่างให้เขียนมือ
  if (isPR(form.FormCode)) {
    const values = readLiveValues(fields);
    return openPRWindow(renderPR({
      values,
      requester: { name: (me && me.Title) || state.user?.name || '', dept: (me && me.Department) || '', position: (me && me.Position) || '' },
      submitted: new Date().toISOString(),
      sign: { requester: { name: (me && me.Title) || state.user?.name || '' } },
    }), 'ดาวน์โหลดแบบฟอร์ม — ใบขอสั่งซื้อ');
  }
  const val = (k) => {
    const el = document.getElementById('q_' + k);
    if (!el) return '';
    if (el.dataset && el.dataset.value) return el.dataset.value;
    return el.value || '';
  };
  const rows = fields
    .filter((f) => { const b = document.querySelector(`[data-q="${f.FieldKey}"]`); return !b || !b.hidden; })
    .filter((f) => f.FieldType !== 'file' && f.FieldType !== 'lineitems')
    .map((f) => `<tr><th>${esc(f.Title)}</th><td>${esc(val(f.FieldKey)) || '&nbsp;'}</td></tr>`).join('');

  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="dl-mask">
      <div class="modal modal-wide">
        <div class="modal-head">ดาวน์โหลดแบบฟอร์ม <button id="dl-close">✕</button></div>
        <div class="modal-body">
          <div class="ex-doc" id="dl-doc">
            <img class="ex-letterhead" src="${LETTERHEAD}" alt="Prime Power">
            <h2 class="ex-title">${esc(form.Title)}</h2>
            ${form.ISODocNo ? `<div class="ex-meta"><span>เลขที่เอกสาร ${esc(form.ISODocNo)}</span>
              <span>${esc(form.ISORevision || '')}</span></div>` : ''}
            <table class="ex-table">${rows}</table>
            <div class="ex-approvals">
              <div class="ex-approve"><div class="ex-ap-role">ผู้ยื่นคำขอ</div>
                <div class="ex-ap-sign"><div class="ex-ap-line"></div></div>
                <div class="ex-ap-name">( ${esc(state.user?.name || '')} )<br>
                  <span class="ex-ap-time">วันที่ ......../......../........</span></div></div>
              <div class="ex-approve"><div class="ex-ap-role">ผู้อนุมัติ</div>
                <div class="ex-ap-sign"><div class="ex-ap-line"></div></div>
                <div class="ex-ap-name">( ................................ )<br>
                  <span class="ex-ap-time">วันที่ ......../......../........</span></div></div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-mini" id="dl-cancel">ปิด</button>
          <button class="btn btn-primary" id="dl-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;
  const close = () => { win.innerHTML = ''; };
  document.getElementById('dl-close').onclick = close;
  document.getElementById('dl-cancel').onclick = close;
  document.getElementById('dl-mask').onclick = (e) => { if (e.target.id === 'dl-mask') close(); };
  document.getElementById('dl-print').onclick = () => {
    document.body.classList.add('printing-doc');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-doc'), 500);
  };
}

export function mount(ctx) {
  const again = $('#again');
  if (again) again.onclick = () => setState({ formSent: null, formDraft: null });

  const send = $('#q-send');
  if (!send || !fields.length) return;

  bindForm(fields, `Requests/${form.FormCode}`);

  const dl = $('#q-download');
  if (dl) dl.onclick = () => downloadBlankForm(form, fields);

  send.onclick = async () => {
    const err = $('#q-error');
    const res = collectForm(fields);

    if (res.errors) {
      err.innerHTML = `กรอกข้อมูลให้ครบก่อนส่ง<br>ยังขาด: ${esc(res.errors.join(', '))}`;
      err.hidden = false;
      return;
    }

    send.disabled = true;
    send.textContent = 'กำลังส่ง…';

    try {
      if (editId) {
        // แก้ไขคำขอเดิม เขียนทับข้อมูลและรีเซ็ตกลับลำดับ 1 (ยังไม่มีใครอนุมัติอยู่แล้ว)
        const orig = (await list('requests').catch(() => [])).find((r) => String(r.id) === String(editId)) || {};
        const rq = { ...orig, FormCode: form.FormCode, FormData: JSON.stringify(res.values) };
        const { route, missing } = await buildRoute(rq);
        const first = route.length ? route[0].step : 1;
        const um = await update('requests', editId, {
          FormData: JSON.stringify(res.values),
          SummaryText: summarizeForm(fields, res.values),
          Files: JSON.stringify(attachedFiles()),
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
        setState({ formSent: 'แก้ไขแล้ว', formDraft: null, formWarn: w1.length ? w1 : null });
        return;
      }

      const base = {
        FormCode: form.FormCode,
        FormName: form.Title,
        RequesterName: (me && me.Title) || state.user?.name || '',
        RequesterEmail: state.user?.email || '',
        RequesterDept: me?.Department || '',
        FormData: JSON.stringify(res.values),
        // สรุปทั้งใบเป็นข้อความ ให้การ์ด Teams/อีเมล แสดงได้ครบโดยไม่ต้องเปิดเว็บ
        SummaryText: summarizeForm(fields, res.values),
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
        Files: JSON.stringify(attachedFiles()),
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
      setState({ formSent: r.no, formDraft: null, formWarn: warn.length ? warn : null });
    } catch (e) {
      console.error(e);
      err.innerHTML = `ส่งคำขอไม่สำเร็จ<br>${esc(e.message).replace(/\n/g, '<br>')}`;
      err.hidden = false;
      send.disabled = false;
      send.textContent = 'ส่งคำขอ';
    }
  };
}
