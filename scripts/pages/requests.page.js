import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort, thaiDateTime } from '../utils/format.js';
import { openModal, closeModal } from '../components/modal.js';
import { uploadFile, fileSize, fileKind } from '../services/photos.js';
import { stepsOf, roleOnRequest, parseLog, decide } from '../services/requests.js';

export const meta = { route: 'requests', title: 'ติดตามสถานะ', nav: true, order: 4, adminOnly: false };

const STATUS_TONE = {
  'ร่าง': 'gray', 'รออนุมัติ': 'blue', 'อนุมัติแล้ว': 'green',
  'ไม่อนุมัติ': 'red', 'เสร็จสิ้น': 'green', 'ยกเลิก': 'gray',
};

let allRequests = [];
let stepCache = {};
let me = '';

async function loadSteps(codes) {
  for (const c of codes) if (!(c in stepCache)) stepCache[c] = await stepsOf(c);
}

function statusPill(s) {
  return `<span class="rq-status st-${STATUS_TONE[s] || 'gray'}">${esc(s || '')}</span>`;
}

function summaryLine(req) {
  try {
    const d = JSON.parse(req.FormData || '{}');
    return d.std_subject || d.subject || d.purpose || d.reason || '';
  } catch (e) { return ''; }
}

function requestRow(req, opts = {}) {
  const steps = stepCache[req.FormCode] || [];
  const cur = +req.CurrentStep || 1;
  const curName = (steps.find((s) => +s.StepOrder === cur) || {}).StepName || '';
  return `
    <button class="rq-row" data-open="${req.id}">
      <div class="rq-main">
        <span class="rq-no">${esc(req.Title)}</span>
        <span class="rq-form">${esc(req.FormName || req.FormCode)}</span>
      </div>
      <div class="rq-sub">${esc(summaryLine(req)) || '<span class="dim">ไม่มีหัวข้อ</span>'}</div>
      <div class="rq-foot">
        ${statusPill(req.Status)}
        ${req.Status === 'รออนุมัติ' && curName ? `<span class="rq-step">รอ: ${esc(curName)}</span>` : ''}
        ${opts.showRequester ? `<span class="rq-by">${esc(req.RequesterName || '')}</span>` : ''}
        <time>${esc(thaiDateShort(req.SubmittedDate))}</time>
        ${opts.canAct ? '<span class="rq-act-flag">ถึงคิวคุณ</span>' : ''}
      </div>
    </button>`;
}

export async function render(ctx) {
  me = state.user?.name || '';
  const isAdmin = !!state.isAdmin;

  allRequests = (await list('requests').catch(() => []))
    .sort((a, b) => new Date(b.SubmittedDate) - new Date(a.SubmittedDate));
  await loadSteps([...new Set(allRequests.map((r) => r.FormCode))]);

  const mine = allRequests.filter((r) => r.RequesterEmail
    && r.RequesterEmail.toLowerCase() === String(state.user?.email).toLowerCase());

  // คำขอที่ผู้ใช้เกี่ยวข้องในฐานะผู้อนุมัติ (แอดมินเห็นทุกใบ)
  const toReview = allRequests.filter((r) => {
    if (isAdmin) return true;
    const role = roleOnRequest(r, stepCache[r.FormCode] || [], me);
    return role.isInvolved;
  });

  // จัดกลุ่มฝั่งซ้ายตามชื่อฟอร์ม
  const groups = [];
  toReview.forEach((r) => {
    let g = groups.find((x) => x.code === r.FormCode);
    if (!g) groups.push((g = { code: r.FormCode, name: r.FormName || r.FormCode, rows: [] }));
    g.rows.push(r);
  });
  const activeTab = state.reviewTab || (groups[0] && groups[0].code) || '';
  const shownGroup = groups.find((g) => g.code === activeTab) || groups[0];

  const actableCount = toReview.filter((r) =>
    roleOnRequest(r, stepCache[r.FormCode] || [], me).canActNow).length;

  return `
  <section class="page page-requests">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>

      <div class="rq-layout">
        <main class="rq-review">
          <div class="rq-head-row">
            <h2>${isAdmin ? 'คำขอทั้งหมด' : 'คำขอที่ต้องดำเนินการ'}</h2>
            ${actableCount ? `<span class="rq-badge">${actableCount} รายการถึงคิวคุณ</span>` : ''}
          </div>

          ${groups.length ? `
            <div class="rq-tabs">
              ${groups.map((g) => `<button data-tab="${esc(g.code)}"
                aria-current="${g.code === activeTab ? 'page' : 'false'}">
                ${esc(g.name)} <b>${g.rows.length}</b></button>`).join('')}
            </div>
            <div class="rq-list">
              ${shownGroup.rows.map((r) => requestRow(r, {
                showRequester: true,
                canAct: roleOnRequest(r, stepCache[r.FormCode] || [], me).canActNow,
              })).join('')}
            </div>`
          : `<div class="panel"><div class="empty">
              ${isAdmin ? 'ยังไม่มีคำขอในระบบ' : 'ยังไม่มีคำขอที่คุณต้องดำเนินการ'}
            </div></div>`}
        </main>

        <aside class="rq-mine">
          <div class="panel">
            <div class="panel-head">📄 คำขอของฉัน
              <span class="panel-meta">${mine.length} รายการ</span></div>
            ${mine.length ? `<div class="rq-list">
              ${mine.map((r) => requestRow(r)).join('')}</div>`
            : '<div class="side-empty">คุณยังไม่ได้ยื่นคำขอ<br><a href="#/forms">ไปหน้าแบบฟอร์ม</a></div>'}
          </div>
        </aside>
      </div>
    </div>
  </section>`;
}

/** หน้าต่างรายละเอียดคำขอ พร้อมปุ่มอนุมัติถ้าถึงคิว */
async function openRequest(req) {
  const steps = stepCache[req.FormCode] || [];
  const role = roleOnRequest(req, steps, me);
  const log = parseLog(req.ApprovalLog);
  const cur = +req.CurrentStep || 1;

  let data = {};
  try { data = JSON.parse(req.FormData || '{}'); } catch (e) { /* ข้อมูลเสีย */ }
  const fields = (await list('formFields').catch(() => []))
    .filter((f) => f.FormCode === req.FormCode)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

  const answerRows = Object.entries(data)
    .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => {
      const f = fields.find((x) => x.FieldKey === k);
      const label = f ? f.Title : k;
      const val = Array.isArray(v) ? v.join(', ')
        : (f && f.FieldType === 'date') ? thaiDateShort(v) : v;
      return `<div class="rq-ans"><span>${esc(label)}</span><b>${esc(val)}</b></div>`;
    }).join('');

  const timeline = steps.map((s) => {
    const n = +s.StepOrder;
    const acts = log.filter((l) => l.step === n);
    const rejected = acts.find((l) => l.action === 'ไม่อนุมัติ');
    const approved = acts.filter((l) => l.action === 'อนุมัติ');
    const st = rejected ? 'bad' : approved.length ? 'ok' : n === cur ? 'now' : 'wait';
    return `<div class="tl-step tl-${st}">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-name">${esc(s.StepName || 'ลำดับ ' + n)}</div>
        <div class="tl-people">${esc((Array.isArray(s.Approvers) ? s.Approvers : [s.Approvers]).filter(Boolean).join(', '))}</div>
        ${acts.map((a) => `<div class="tl-act ${a.action === 'ไม่อนุมัติ' ? 'bad' : 'ok'}">
          <b>${esc(a.action)}</b> · ${esc(a.by)}<br><span class="tl-when">${esc(thaiDateTime(a.at))}</span>
          ${a.note ? `<div class="tl-note">${esc(a.note)}</div>` : ''}</div>`).join('')}
      </div></div>`;
  }).join('');

  openModal({
    title: `${esc(req.Title)} · ${esc(req.FormName || '')}`,
    wide: true,
    body: `
      <div class="rq-detail">
        <div class="rq-detail-head">
          ${statusPill(req.Status)}
          <span class="dim">ยื่นโดย ${esc(req.RequesterName)} · ${esc(thaiDateShort(req.SubmittedDate))}</span>
        </div>

        <div class="rq-cols">
          <div class="rq-answers">
            <h4>ข้อมูลคำขอ</h4>
            ${answerRows || '<div class="dim">ไม่มีข้อมูล</div>'}
          </div>
          <div class="rq-timeline">
            <h4>เส้นทางอนุมัติ</h4>
            ${timeline || '<div class="dim">ฟอร์มนี้ยังไม่ได้ตั้งเส้นทางอนุมัติ</div>'}
          </div>
        </div>

        ${req.PaymentSlip ? renderSlip(req.PaymentSlip) : ''}

        ${role.canActNow ? actionBox(req, role) : role.waiting
          ? '<div class="rq-wait">ยังไม่ถึงคิวของคุณ · รอลำดับก่อนหน้าอนุมัติก่อน</div>' : ''}
      </div>`,
  });

  if (role.canActNow) bindActions(req, steps, role);
}

function renderSlip(raw) {
  let s; try { s = JSON.parse(raw); } catch (e) { return ''; }
  if (!s || !s.url) return '';
  const img = /^(JPG|JPEG|PNG|GIF|WEBP)$/.test(s.kind);
  return `<div class="rq-slip"><h4>หลักฐานการโอนเงิน</h4>
    ${img ? `<img src="${esc(s.url)}" alt="สลิป">`
      : `<a class="doc-file" href="${esc(s.url)}" target="_blank" rel="noopener">📄 ${esc(s.name)}</a>`}</div>`;
}

function actionBox(req, role) {
  return `
    <div class="rq-action">
      <h4>${role.isFinalStep ? 'ขั้นสุดท้าย — แนบสลิปแล้วปิดงาน' : 'ดำเนินการ'}</h4>
      <textarea id="rq-note" rows="2" placeholder="บันทึกความเห็น (ถ้ามี)"></textarea>
      ${role.isFinalStep ? `
        <div class="rq-slip-upload">
          <label class="btn-mini upload-btn" for="rq-slip">แนบสลิปการโอน</label>
          <input type="file" id="rq-slip" accept="image/*,application/pdf" hidden>
          <span id="rq-slip-name" class="dim">ยังไม่ได้แนบ</span>
        </div>` : ''}
      <div class="field-error" id="rq-err" hidden></div>
      <div class="rq-buttons">
        <button class="btn-mini danger" id="rq-reject">ไม่อนุมัติ</button>
        ${role.isFinalStep
          ? '<button class="btn btn-primary" id="rq-finish">อนุมัติและปิดงาน</button>'
          : '<button class="btn btn-primary" id="rq-approve">อนุมัติ</button>'}
      </div>
    </div>`;
}

let pendingSlip = null;

function bindActions(req, steps, role) {
  pendingSlip = null;
  const err = $('#rq-err');
  const fail = (m) => { err.textContent = m; err.hidden = false; };

  const slipInput = $('#rq-slip');
  if (slipInput) slipInput.onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    $('#rq-slip-name').textContent = 'กำลังอัปโหลด…';
    try {
      pendingSlip = await uploadFile(f, `Requests/${req.FormCode}/slips`);
      $('#rq-slip-name').textContent = `${pendingSlip.name} · ${pendingSlip.sizeText}`;
    } catch (e) { $('#rq-slip-name').textContent = e.message; }
  };

  const run = async (action) => {
    if (action === 'ปิดงาน' && !pendingSlip) { fail('ต้องแนบสลิปการโอนก่อนปิดงาน'); return; }
    try {
      await decide(req, steps, { action, by: me, note: $('#rq-note').value.trim(), slip: pendingSlip });
      closeModal();
      const { render: rerender } = await import('../core/render.js');
      rerender();
    } catch (e) { fail('บันทึกไม่สำเร็จ — ' + e.message); }
  };

  const ap = $('#rq-approve'); if (ap) ap.onclick = () => run('อนุมัติ');
  const rj = $('#rq-reject'); if (rj) rj.onclick = () => run('ไม่อนุมัติ');
  const fn = $('#rq-finish'); if (fn) fn.onclick = async () => {
    if (!pendingSlip) { fail('ต้องแนบสลิปการโอนก่อนปิดงาน'); return; }
    await decide(req, steps, { action: 'อนุมัติ', by: me, note: $('#rq-note').value.trim() });
    await decide({ ...req, CurrentStep: 999 }, steps, { action: 'ปิดงาน', by: me, slip: pendingSlip });
    closeModal();
    const { render: rerender } = await import('../core/render.js');
    rerender();
  };
}

export function mount(ctx) {
  onClick('tab', (code) => setState({ reviewTab: code }));
  onClick('open', (id) => {
    const r = allRequests.find((x) => String(x.id) === String(id));
    if (r) openRequest(r);
  });
}
