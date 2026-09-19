import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort, thaiDateTime } from '../utils/format.js';
import { openModal, closeModal } from '../components/modal.js';
import { uploadFile, fileSize, fileKind } from '../services/photos.js';
import { stepsOf, stepDiag, roleOnRequest, parseLog, decide, loadResolved, buildRoute, flowFieldsFor } from '../services/requests.js';
import { LETTERHEAD } from '../core/letterhead.js';
import { standardLabel } from '../components/form-renderer.js';

export const meta = { route: 'requests', title: 'ติดตามสถานะ', nav: true, order: 4, adminOnly: false };

const STATUS_TONE = {
  'ร่าง': 'gray', 'รออนุมัติ': 'blue', 'อนุมัติแล้ว': 'green',
  'ไม่อนุมัติ': 'red', 'เสร็จสิ้น': 'green', 'ยกเลิก': 'gray',
  'ส่งกลับแก้ไข': 'amber',
};

let allRequests = [];
let stepCache = {};
let me = '';
let meIds = [];
let olderCount = 0;   // จำนวนคำขอเก่าที่ถูกซ่อนไว้

/**
 * หา FormCode ของคำขอให้ได้เป็นข้อความเสมอ เผื่อคอลัมน์เป็น Lookup/ออบเจ็กต์
 * ลำดับ: ค่าตรง → คลี่ออบเจ็กต์ → ชื่อคอลัมน์แปลก (FormCode0) → กู้จากเลขเอกสารในชื่อเรื่อง
 * เลขเอกสารรูปแบบ FM-XXX-000-nnn-yyyy สาม ส่วนแรกคือ FormCode
 */
export function formCodeOf(req) {
  const clean = (v) => String(
    (v && typeof v === 'object') ? (v.LookupValue ?? v.Value ?? v.Title ?? '') : (v ?? '')
  ).trim();

  let c = clean(req.FormCode);
  if (c) return c;

  const k = Object.keys(req).find((x) => /^FormCode\d+$/i.test(x) || /^Form_x0020_Code/i.test(x));
  if (k) { c = clean(req[k]); if (c) return c; }

  const m = String(req.Title || '').match(/^([A-Za-z]+-[A-Za-z]+-\d+)/);
  return m ? m[1] : '';
}

async function loadSteps(codes) {
  for (const c of codes) if (!(c in stepCache)) stepCache[c] = await stepsOf(c);
}

/** เติมผู้อนุมัติจริงให้คำขอแต่ละใบ ตามผู้ยื่นของใบนั้น */
async function resolveFor(requests) {
  for (const r of requests) {
    const base = stepCache[r.FormCode] || [];
    // clone เพราะผู้ยื่นต่างกัน ผู้อนุมัติตามตำแหน่งก็ต่างกัน
    r._steps = await loadResolved(base.map((x) => ({ ...x })), r);
  }
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
  const steps = req._steps || stepCache[req.FormCode] || [];
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
  // ชื่อที่ใช้เทียบ/บันทึก = ชื่อในทะเบียนบุคลากร (หาด้วยอีเมล) ถ้าไม่เจอใช้ชื่อจาก Microsoft 365
  const dirAll = await list('directory').catch(() => []);
  const myEmail = String(state.user?.email || '').trim().toLowerCase();
  const mePerson = dirAll.find((p) => String(p.Email || '').trim().toLowerCase() === myEmail);
  me = (mePerson && mePerson.Title) || state.user?.name || '';
  meIds = [me, state.user?.name, state.user?.email].filter(Boolean);
  const isAdmin = !!state.isAdmin;

  // โหลดทั้งหมดแล้วตัดเหลือช่วงล่าสุด กันหน้าอืดเมื่อคำขอสะสมหลักพันใบ
  // ของเก่ายังดูได้ด้วยปุ่ม "แสดงย้อนหลังทั้งหมด"
  const MONTHS = 6;
  const cutoff = Date.now() - MONTHS * 30 * 86400000;
  const everything = (await list('requests').catch(() => []))
    .sort((a, b) => new Date(b.SubmittedDate) - new Date(a.SubmittedDate));

  const isRecent = (r) => {
    const d = new Date(r.SubmittedDate);
    return isNaN(d) ? true : d.getTime() >= cutoff;
  };
  // คำขอที่ยังเดินอยู่ต้องเห็นเสมอ ต่อให้ยื่นนานแล้ว
  const live = (r) => ['รออนุมัติ', 'ส่งกลับแก้ไข'].includes(String(r.Status || '').trim());

  olderCount = everything.filter((r) => !isRecent(r) && !live(r)).length;
  allRequests = state.showAllRequests
    ? everything
    : everything.filter((r) => isRecent(r) || live(r));
  // ทำ FormCode ให้เป็นข้อความก่อนใช้งานทั้งหน้า (แก้ทั้งชื่อช่องและเส้นทางอนุมัติ)
  allRequests.forEach((r) => { r.FormCode = formCodeOf(r); });
  await loadSteps([...new Set(allRequests.map((r) => r.FormCode).filter(Boolean))]);
  await resolveFor(allRequests);

  const mine = allRequests.filter((r) => r.RequesterEmail
    && r.RequesterEmail.toLowerCase() === String(state.user?.email).toLowerCase());

  // ค้นหา + แบ่งหน้า กล่อง "คำขอของฉัน" (15 รายการต่อหน้า)
  const MINE_PER = 15;
  const mineQ = (state.mineQuery || '').trim().toLowerCase();
  const mineFiltered = mineQ
    ? mine.filter((r) => (String(r.Title) + ' ' + String(r.FormName || '')).toLowerCase().includes(mineQ))
    : mine;
  const minePages = Math.max(1, Math.ceil(mineFiltered.length / MINE_PER));
  const minePage = Math.min(Math.max(1, state.minePage || 1), minePages);
  const mineRows = mineFiltered.slice((minePage - 1) * MINE_PER, minePage * MINE_PER);

  // คำขอที่ผู้ใช้เกี่ยวข้องในฐานะผู้อนุมัติ (แอดมินเห็นทุกใบ)
  const toReview = allRequests.filter((r) => {
    if (isAdmin) return true;
    const role = roleOnRequest(r, r._steps || [], meIds);
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
    roleOnRequest(r, r._steps || [], meIds).canActNow).length;

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
                canAct: roleOnRequest(r, r._steps || [], meIds).canActNow,
              })).join('')}
            </div>`
          : `<div class="panel"><div class="empty">
              ${isAdmin ? 'ยังไม่มีคำขอในระบบ' : 'ยังไม่มีคำขอที่คุณต้องดำเนินการ'}
            </div></div>`}
        </main>

        <aside class="rq-mine">
          <div class="panel">
            <div class="panel-head">📄 คำขอของฉัน
              <span class="panel-meta">${mineFiltered.length} รายการ</span></div>
            ${mine.length ? `<div class="rq-mine-tools">
              <input id="mine-q" type="search" data-keepfocus value="${esc(state.mineQuery || '')}"
                placeholder="ค้นหาเลขที่ / ชื่อฟอร์ม…" autocomplete="off">
            </div>` : ''}
            ${mineFiltered.length ? `<div class="rq-list rq-mine-list">
              ${mineRows.map((r) => requestRow(r)).join('')}</div>
              ${minePages > 1 ? `<div class="rq-pager">
                <button class="btn-mini" data-minepage="${minePage - 1}" ${minePage <= 1 ? 'disabled' : ''}>‹ ก่อนหน้า</button>
                <span class="rq-pager-info">หน้า ${minePage} / ${minePages}</span>
                <button class="btn-mini" data-minepage="${minePage + 1}" ${minePage >= minePages ? 'disabled' : ''}>ถัดไป ›</button>
              </div>` : ''}`
            : (mine.length
              ? '<div class="side-empty">ไม่พบคำขอที่ค้นหา</div>'
              : '<div class="side-empty">คุณยังไม่ได้ยื่นคำขอ<br><a href="#/forms">ไปหน้าแบบฟอร์ม</a></div>')}
            ${olderCount && !state.showAllRequests ? `<div class="rq-older">
              ซ่อนคำขอเก่ากว่า 6 เดือนไว้ ${olderCount} ใบ
              <button class="btn-mini" id="rq-showall">แสดงย้อนหลังทั้งหมด</button>
            </div>` : ''}
            ${state.showAllRequests ? `<div class="rq-older">
              กำลังแสดงย้อนหลังทั้งหมด
              <button class="btn-mini" id="rq-showrecent">แสดงเฉพาะ 6 เดือนล่าสุด</button>
            </div>` : ''}
          </div>
        </aside>
      </div>
    </div>
  </section>`;
}

/**
 * ปุ่มแก้ไข/ยกเลิกของผู้ยื่น
 * ทำได้เฉพาะเมื่อยังไม่มีใครอนุมัติเลย (ApprovalLog ว่าง และสถานะรออนุมัติ)
 * ถ้ามีการอนุมัติแล้ว ต้องให้ผู้อนุมัติลำดับถัดไปยกเลิกให้แทน
 */
function requesterActions(req, log) {
  const isMine = req.RequesterEmail
    && req.RequesterEmail.toLowerCase() === String(state.user?.email).toLowerCase();
  if (!isMine) return '';

  // ส่งกลับแก้ไข: ผู้ยื่นแก้แล้วยื่นใหม่ได้ แม้จะมีลำดับก่อนหน้าอนุมัติมาแล้ว
  if (req.Status === 'ส่งกลับแก้ไข') {
    const back = [...log].reverse().find((l) => l.action === 'ส่งกลับแก้ไข');
    return `<div class="rq-owner-act rq-sentback">
      <span>📝 ผู้อนุมัติส่งกลับให้แก้ไข${back && back.by ? ` โดย ${esc(back.by)}` : ''}
        ${back && back.note ? `<br><b>เหตุผล:</b> ${esc(back.note)}` : ''}
        <br>แก้ไขแล้วยื่นใหม่ได้เลย (จะเริ่มอนุมัติใหม่ตั้งแต่ลำดับแรก)</span>
      <span class="rq-owner-btns">
        <button class="btn-mini" data-reqedit="${req.id}">✎ แก้ไขและยื่นใหม่</button>
        <button class="btn-mini danger" data-reqcancel="${req.id}">ยกเลิกคำขอ</button>
      </span>
    </div>`;
  }

  if (['อนุมัติแล้ว', 'ไม่อนุมัติ', 'เสร็จสิ้น', 'ยกเลิก'].includes(req.Status)) return '';

  const approved = log.some((l) => l.action === 'อนุมัติ');
  if (approved) {
    return `<div class="rq-locked">
      คำขอนี้มีการอนุมัติบางลำดับแล้ว จึงแก้ไขหรือยกเลิกเองไม่ได้<br>
      หากต้องการยกเลิก กรุณาแจ้งผู้อนุมัติลำดับถัดไปให้กดไม่อนุมัติ
    </div>`;
  }

  return `<div class="rq-owner-act">
    <span>ยังไม่มีการอนุมัติ คุณแก้ไขหรือยกเลิกคำขอได้</span>
    <span class="rq-owner-btns">
      <button class="btn-mini" data-reqedit="${req.id}">✎ แก้ไขคำขอ</button>
      <button class="btn-mini danger" data-reqcancel="${req.id}">ยกเลิกคำขอ</button>
    </span>
  </div>`;
}

/** ข้อความเมื่อไม่พบเส้นทาง พร้อมสาเหตุที่ตรวจได้ (แสดงรายละเอียดให้แอดมิน) */
function noRouteBox(code) {
  const d = stepDiag[String(code ?? '').trim()];
  let why = '';
  if (d) {
    if (d.error) why = `อ่าน ApprovalMatrix ไม่สำเร็จ: ${d.error}`;
    else if (!d.total) why = 'อ่าน ApprovalMatrix ได้ 0 แถว — ตรวจ GUID หรือสิทธิ์ของ List';
    else if (d.inactive) why = `พบ ${d.inactive} แถวแต่ IsActive ถูกตั้งเป็น "ไม่"`;
    else if (!d.keys.some((k) => /^FormCode/i.test(k)))
      why = `ไม่พบคอลัมน์ FormCode ในข้อมูลที่ได้ — คอลัมน์ที่มี: ${d.keys.join(', ')}`;
    else why = `ไม่มีแถวที่ FormCode ตรงกับ "${d.target}" — ค่าที่พบ: ${d.codes.map((c) => `"${c}"`).join(', ')}`;
  }
  return `<div class="dim">ฟอร์มนี้ยังไม่ได้ตั้งเส้นทางอนุมัติ</div>
    ${why && state.isAdmin ? `<div class="dim" style="font-size:.85em;margin-top:.5em;word-break:break-all">🔎 ${esc(why)}</div>` : ''}`;
}

/** หน้าต่างรายละเอียดคำขอ พร้อมปุ่มอนุมัติถ้าถึงคิว */
async function openRequest(req) {
  const steps = req._steps || stepCache[req.FormCode] || [];
  const role = roleOnRequest(req, steps, meIds);
  const log = parseLog(req.ApprovalLog);
  const cur = +req.CurrentStep || 1;

  let data = {};
  try { data = JSON.parse(req.FormData || '{}'); } catch (e) { /* ข้อมูลเสีย */ }
  const code = formCodeOf(req);
  // เผื่อ FormCode ในฟอร์มฟิลด์เป็น Lookup ที่คืนมาแค่เลข id → แปลงกลับผ่าน formCatalog
  const catalog = await list('formCatalog').catch(() => []);
  const codeById = {};
  catalog.forEach((c) => { codeById[String(c.id)] = String(c.FormCode || '').trim(); });
  const fcodeOf = (f) => {
    if (f.FormCode !== undefined && f.FormCode !== null)
      return String(typeof f.FormCode === 'object' ? (f.FormCode.LookupValue ?? f.FormCode.Title ?? '') : f.FormCode).trim();
    const k = Object.keys(f).find((x) => /^FormCode\d+$/i.test(x));
    if (k) return String(f[k]).trim();
    if (f.FormCodeLookupId != null) return codeById[String(f.FormCodeLookupId)] || '';
    return '';
  };
  const fields = (await list('formFields').catch(() => []))
    .filter((f) => fcodeOf(f) === code)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

  const answerRows = Object.entries(data)
    .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => {
      const f = fields.find((x) => x.FieldKey === k);
      const label = (f ? f.Title : null) || standardLabel(k) || k;
      if (f && f.FieldType === 'lineitems' && Array.isArray(v)) {
        const cols = String(f.Options||'').split('\n').map(x=>x.split('|'));
        return `<div class="rq-ans rq-ans-table"><span>${esc(label)}</span>
          <table class="li-view"><tr>${cols.map(c=>`<th>${esc(c[1]||c[0])}</th>`).join('')}</tr>
          ${v.map(row=>`<tr>${cols.map(c=>`<td>${esc(row[c[0].trim()]||'')}</td>`).join('')}</tr>`).join('')}
          </table></div>`;
      }
      const isDate = (f && f.FieldType === 'date') || k === 'std_date'
        || /Date$/.test(k) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v));
      const val = Array.isArray(v) ? v.join(', ')
        : isDate ? thaiDateShort(v) : v;
      return `<div class="rq-ans"><span>${esc(label)}</span><b>${esc(val)}</b></div>`;
    }).join('');

  // สถานะของแต่ละลำดับนับเฉพาะรอบล่าสุด (หลังการยื่นใหม่ครั้งล่าสุด) ส่วนประวัติยังแสดงครบ
  const lastRound = log.map((l) => l.action).lastIndexOf('ยื่นใหม่');
  const timeline = steps.map((s) => {
    const n = +s.StepOrder;
    const acts = log.filter((l) => l.step === n);
    const now = log.slice(lastRound + 1).filter((l) => l.step === n);
    const rejected = now.find((l) => l.action === 'ไม่อนุมัติ');
    const sentBack = now.find((l) => l.action === 'ส่งกลับแก้ไข');
    const approved = now.filter((l) => l.action === 'อนุมัติ');
    const st = rejected ? 'bad' : sentBack ? 'back' : approved.length ? 'ok' : n === cur ? 'now' : 'wait';
    return `<div class="tl-step tl-${st}">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-name">${esc(s.StepName || 'ลำดับ ' + n)}</div>
        <div class="tl-people">${esc((Array.isArray(s.Approvers) ? s.Approvers : [s.Approvers]).filter(Boolean).join(', '))}</div>
        ${acts.map((a) => `<div class="tl-act ${a.action === 'ไม่อนุมัติ' ? 'bad' : a.action === 'ส่งกลับแก้ไข' ? 'back' : 'ok'}">
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
            ${timeline || noRouteBox(req.FormCode)}
          </div>
        </div>

        ${req.PaymentSlip ? renderSlip(req.PaymentSlip) : ''}

        ${role.canActNow ? actionBox(req, role) : role.waiting
          ? '<div class="rq-wait">ยังไม่ถึงคิวของคุณ · รอลำดับก่อนหน้าอนุมัติก่อน</div>' : ''}

        ${requesterActions(req, log)}
        ${state.isAdmin && req.Status === 'รออนุมัติ' ? `<div class="rq-owner-act">
          <span>แอดมิน: สถานะแจ้งอนุมัติอัตโนมัติ = <b>${esc(req.PAState || 'ยังไม่ตั้ง')}</b>
          · กดเพื่อคำนวณผู้อนุมัติใหม่และส่งการ์ดลำดับปัจจุบันอีกครั้ง</span>
          <span class="rq-owner-btns"><button class="btn-mini" data-reqresend="${req.id}">↻ ส่งแจ้งอนุมัติใหม่</button></span>
        </div>` : ''}

        <div class="rq-export-row">
          <button class="btn-mini" data-exportreq="${req.id}">⭳ ส่งออกเป็นเอกสาร (PDF)</button>
        </div>
      </div>`,
  });
  onClick('exportreq', () => exportRequest(req, steps, answerRows));

  if (role.canActNow) bindActions(req, steps, role);

  onClick('reqcancel', async () => {
    if (!confirm('ยกเลิกคำขอนี้ใช่หรือไม่ · การยกเลิกถาวร')) return;
    try {
      const { update } = await import('../services/data.js');
      await update('requests', req.id, { Status: 'ยกเลิก', PAState: 'DONE' });
      closeModal();
      const { render: rr } = await import('../core/render.js'); rr();
    } catch (e) { alert('ยกเลิกไม่สำเร็จ — ' + e.message); }
  });

  onClick('reqresend', async () => {
    try {
      const { update } = await import('../services/data.js');
      const { route, missing } = await buildRoute(req);
      const f = flowFieldsFor(route, +req.CurrentStep || (route[0] && route[0].step) || 1);
      await update('requests', req.id, f);
      alert(String(f.PAState).startsWith('PENDING')
        ? 'ส่งแจ้งแล้ว ผู้อนุมัติ: ' + f.CurrentApprovers
        : 'ยังส่งไม่ได้ — ไม่พบอีเมลผู้อนุมัติของลำดับนี้'
          + (missing.length ? '\nชื่อที่ไม่มีอีเมล/ไม่พบ: ' + missing.join(', ') : '')
          + '\nตรวจช่อง Manager และ Email ในทะเบียนบุคลากร หรือช่อง Approvers ใน ApprovalMatrix');
      setState({});
    } catch (e) { alert('ส่งไม่สำเร็จ: ' + e.message); }
  });

  onClick('reqedit', async () => {
    // เปิดฟอร์มกรอกใหม่พร้อมข้อมูลเดิม แล้วให้แก้แล้วส่งใหม่
    closeModal();
    location.hash = `#/form/${req.FormCode}?edit=${req.id}`;
  });
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
      <label class="rq-note-label" for="rq-note">เหตุผล / ความเห็น
        <span class="dim">(จำเป็นเมื่อกด ส่งกลับแก้ไข หรือ ไม่อนุมัติ)</span></label>
      <textarea id="rq-note" rows="3" placeholder="พิมพ์เหตุผลหรือความเห็นประกอบการพิจารณา"></textarea>
      ${role.isFinalStep ? `
        <div class="rq-slip-upload">
          <label class="btn-mini upload-btn" for="rq-slip">แนบสลิปการโอน</label>
          <input type="file" id="rq-slip" accept="image/*,application/pdf" hidden>
          <span id="rq-slip-name" class="dim">ยังไม่ได้แนบ</span>
        </div>` : ''}
      <div class="field-error" id="rq-err" hidden></div>
      <div class="rq-buttons">
        <button class="btn-mini danger" id="rq-reject">✗ ไม่อนุมัติ</button>
        <button class="btn-mini warn" id="rq-sendback">↩ ส่งกลับแก้ไข</button>
        ${role.isFinalStep
          ? '<button class="btn btn-primary" id="rq-finish">✓ อนุมัติและปิดงาน</button>'
          : '<button class="btn btn-primary" id="rq-approve">✓ อนุมัติ</button>'}
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

  const note = () => $('#rq-note').value.trim();
  const busy = (on) => $$('.rq-buttons button').forEach((b) => { b.disabled = on; });
  // มีคนดำเนินการไปแล้ว: รีเฟรชหน้าให้เห็นสถานะล่าสุดหลังผู้ใช้อ่านข้อความ
  const refreshLater = () => setTimeout(async () => {
    closeModal();
    const { render: rerender } = await import('../core/render.js');
    rerender();
  }, 4000);

  const done = async () => {
    closeModal();
    const { render: rerender } = await import('../core/render.js');
    rerender();
  };

  const run = async (action) => {
    err.hidden = true;
    if ((action === 'ไม่อนุมัติ' || action === 'ส่งกลับแก้ไข') && !note()) {
      fail(`กรุณาพิมพ์เหตุผลก่อนกด "${action}"`);
      $('#rq-note').focus();
      return;
    }
    if (action === 'ไม่อนุมัติ' && !confirm('ยืนยันไม่อนุมัติคำขอนี้? คำขอจะสิ้นสุดทันที')) return;
    if (action === 'ส่งกลับแก้ไข' && !confirm('ส่งกลับให้ผู้ยื่นแก้ไข? เมื่อยื่นใหม่จะเริ่มอนุมัติตั้งแต่ลำดับแรก')) return;
    busy(true);
    try {
      await decide(req, steps, { action, by: me, note: note(), slip: pendingSlip });
      await done();
    } catch (e) {
      busy(false);
      if (e.name === 'AlreadyActedError') { fail('⚠ ' + e.message); refreshLater(); }
      else fail('บันทึกไม่สำเร็จ — ' + e.message);
    }
  };

  const ap = $('#rq-approve'); if (ap) ap.onclick = () => run('อนุมัติ');
  const rj = $('#rq-reject'); if (rj) rj.onclick = () => run('ไม่อนุมัติ');
  const sb = $('#rq-sendback'); if (sb) sb.onclick = () => run('ส่งกลับแก้ไข');
  const fn = $('#rq-finish'); if (fn) fn.onclick = async () => {
    err.hidden = true;
    if (!pendingSlip) { fail('ต้องแนบสลิปการโอนก่อนปิดงาน'); return; }
    busy(true);
    try {
      await decide(req, steps, { action: 'อนุมัติ', by: me, note: note() });
      await decide({ ...req, CurrentStep: 999 }, steps, { action: 'ปิดงาน', by: me, slip: pendingSlip });
      await done();
    } catch (e) {
      busy(false);
      if (e.name === 'AlreadyActedError') { fail('⚠ ' + e.message); refreshLater(); }
      else fail('บันทึกไม่สำเร็จ — ' + e.message);
    }
  };
}

/** ส่งออกคำขอเป็นเอกสาร A4 พร้อมหัวกระดาษ ข้อมูล และบล็อกอนุมัติจากระบบ */
async function exportRequest(req, steps, answerRows) {
  const log = parseLog(req.ApprovalLog);
  const dir = await list('directory').catch(() => []);
  const sigOf = (name) => (dir.find((p) => p.Title === name) || {}).SignatureUrl || '';

  // บล็อกผู้อนุมัติ สร้างจากบันทึกจริง ไม่ใช่ช่องเซ็นเปล่า
  const approvals = steps.map((st) => {
    const n = +st.StepOrder;
    const act = log.filter((l) => l.step === n).slice(-1)[0];
    const who = act ? act.by : ((st._resolved || [])[0] || '');
    const sig = act && act.action === 'อนุมัติ' ? sigOf(act.by) : '';
    return `
      <div class="ex-approve">
        <div class="ex-ap-role">${esc(st.StepName || 'ลำดับ ' + n)}</div>
        <div class="ex-ap-sign">
          ${sig ? `<img src="${esc(sig)}" alt="">` : '<div class="ex-ap-line"></div>'}
        </div>
        <div class="ex-ap-name">${act
          ? `<b>${act.action === 'อนุมัติ' ? '✓ อนุมัติ' : act.action === 'ส่งกลับแก้ไข' ? '↩ ส่งกลับแก้ไข' : '✗ ไม่อนุมัติ'}</b><br>
             ${act.note ? `<span class="ex-ap-time">เหตุผล: ${esc(act.note)}</span><br>` : ''}
             ( ${esc(act.by)} )<br>
             <span class="ex-ap-time">${esc(thaiDateTime(act.at))}</span>`
          : `( ${esc(who)} )<br><span class="ex-ap-time">รออนุมัติ</span>`}
        </div>
      </div>`;
  }).join('');

  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="ex-mask">
      <div class="modal modal-wide">
        <div class="modal-head">ส่งออกเอกสาร — ${esc(req.Title)}
          <button id="ex-close">✕</button></div>
        <div class="modal-body">
          <div class="ex-doc" id="ex-doc">
            <img class="ex-letterhead" src="${LETTERHEAD}" alt="Prime Power Construction">
            <h2 class="ex-title">${esc(req.FormName || '')}</h2>
            <div class="ex-meta">
              <span>เลขที่คำขอ ${esc(req.Title)}</span>
              <span>วันที่ ${esc(thaiDateShort(req.SubmittedDate))}</span>
            </div>
            <table class="ex-table">
              ${answerRows.replace(/rq-ans/g, 'ex-ans')}
            </table>
            <div class="ex-approvals">${approvals}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-mini" id="ex-cancel">ปิด</button>
          <button class="btn btn-primary" id="ex-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;

  const close = () => { win.innerHTML = ''; };
  document.getElementById('ex-close').onclick = close;
  document.getElementById('ex-cancel').onclick = close;
  document.getElementById('ex-mask').onclick = (e) => { if (e.target.id === 'ex-mask') close(); };
  document.getElementById('ex-print').onclick = () => {
    document.body.classList.add('printing-doc');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-doc'), 500);
  };
}

export function mount(ctx) {
  onClick('tab', (code) => setState({ reviewTab: code }));

  // กล่อง "คำขอของฉัน": ค้นหา (หน่วง 250ms) + เลือกหน้า
  const mq = $('#mine-q');
  if (mq) {
    let t;
    mq.oninput = (e) => {
      const v = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => setState({ mineQuery: v, minePage: 1 }), 250);
    };
  }
  onClick('minepage', (p) => setState({ minePage: +p }));

  const showAll = $('#rq-showall');
  if (showAll) showAll.onclick = () => setState({ showAllRequests: true, minePage: 1 });
  const showRecent = $('#rq-showrecent');
  if (showRecent) showRecent.onclick = () => setState({ showAllRequests: false, minePage: 1 });
  onClick('open', (id) => {
    const r = allRequests.find((x) => String(x.id) === String(id));
    if (r) openRequest(r);
  });
}
