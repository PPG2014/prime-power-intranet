import { esc, $ } from '../core/dom.js';
import { list, create } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { renderForm, collectForm, bindForm, attachedFiles, loadLookups, withStandard } from '../components/form-renderer.js';

export const meta = { route: 'form', title: 'กรอกแบบฟอร์ม', nav: false, order: 3, adminOnly: false };

let fields = [];
let form = null;
let me = null;

/** เลขที่คำขอ รันต่อเนื่องทั้งบริษัทตามปีพุทธศักราช */
function nextRequestNo(existing) {
  const year = new Date().getFullYear() + 543;
  const prefix = `REQ-${year}-`;
  const last = existing
    .map((r) => String(r.Title || ''))
    .filter((t) => t.startsWith(prefix))
    .map((t) => parseInt(t.slice(prefix.length), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a)[0] || 0;
  return prefix + String(last + 1).padStart(4, '0');
}

export async function render(ctx) {
  const code = (location.hash.split('/')[2] || '').trim();

  const [forms, allFields, people] = await Promise.all([
    list('formCatalog'), list('formFields'), list('directory').catch(() => []),
  ]);

  form = forms.find((f) => f.FormCode === code);

  const own = allFields
    .filter((f) => f.FormCode === code && f.IsActive !== false)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  // เติมช่องหัวข้อมาตรฐานให้อัตโนมัติ ไม่ต้องกรอกในตาราง
  fields = withStandard(own, form);

  await loadLookups(fields);   // ช่องที่ดึงตัวเลือกจาก List อื่นต้องโหลดก่อนวาด

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
          <h1>${esc(form.Title)}</h1>
          <div class="form-sub">${esc(form.FormCode)} · ${esc(form.Department || '')}</div>
          ${form.Description ? `<p class="form-desc">${esc(form.Description)}</p>` : ''}
        </div>
      </div>

      ${me ? '' : `<div class="mock-warning">
        <b>ไม่พบข้อมูลของคุณในทะเบียนบุคลากร</b>
        ช่องที่ระบบกรอกให้อัตโนมัติจะว่างไว้ แจ้งผู้ดูแลให้เพิ่มอีเมลของคุณในทะเบียน
      </div>`}

      <div class="panel form-panel">
        ${renderForm(fields, me, state.formDraft || {})}
        <div class="field-error" id="q-error" hidden></div>
        <div class="form-foot">
          <span class="dim">ยื่นโดย ${esc(state.user?.name || '')} · ${
            esc(thaiDateShort(new Date().toISOString()))}</span>
          <button class="btn btn-primary" id="q-send">ส่งคำขอ</button>
        </div>
      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
  const again = $('#again');
  if (again) again.onclick = () => setState({ formSent: null, formDraft: null });

  const send = $('#q-send');
  if (!send || !fields.length) return;

  bindForm(fields, `Requests/${form.FormCode}`);

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
      const existing = await list('requests').catch(() => []);
      const no = nextRequestNo(existing);

      await create('requests', {
        Title: no,
        FormCode: form.FormCode,
        FormName: form.Title,
        RequesterName: state.user?.name || '',
        RequesterEmail: state.user?.email || '',
        RequesterDept: me?.Department || '',
        Status: 'รออนุมัติ',
        SubmittedDate: new Date().toISOString(),
        FormData: JSON.stringify(res.values),
        Files: JSON.stringify(attachedFiles()),
      });

      setState({ formSent: no, formDraft: null });
    } catch (e) {
      console.error(e);
      err.innerHTML = `ส่งคำขอไม่สำเร็จ<br>${esc(e.message)}`;
      err.hidden = false;
      send.disabled = false;
      send.textContent = 'ส่งคำขอ';
    }
  };
}
