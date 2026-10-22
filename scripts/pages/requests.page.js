import { esc, $, $$, onClick } from '../core/dom.js';
import { list, listRecent, get, clearDataCache, RECENT_REQUESTS } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort, thaiDateTime } from '../utils/format.js';
import { openModal, closeModal } from '../components/modal.js';
import { uploadFile, fileSize, fileKind, formFolder } from '../services/photos.js';
import { stepsOf, stepDiag, roleOnRequest, applicableSteps, parseLog, decide, loadResolved, buildRoute, flowFieldsFor,
  PURCHASE_ACTION, PURCHASE_DONE, PURCHASE_CANCEL, PURCHASE_STATUSES, purchaseStatusOf, stepProgress } from '../services/requests.js';
import { isPR, renderPR, mapSignatures, openPRWindow, thaiNumDate } from '../templates/pr-fm-pur-004.js';
import { prValues, normPR, todayISO, findDuplicatePR, duplicateMessage } from '../services/pr.js';
import { isCarRequest, dataOf as carData, spanOf, spanText, carPlates, plateClash, changePlate, cancelCar, returnCar, mapLink, CAR_PLACE, localDay } from '../services/car.js';
import { standardLabel, withStandard, NO_PROJECT } from '../components/form-renderer.js';
import { renderFormDoc } from '../templates/form-doc.js';
import { isWelfareRoom } from '../templates/welfare-room.js';
import { signaturePad, bindSignaturePads, readSignature, previewSignature } from '../components/signature-pad.js';
import { isUnread, markSeen, refreshBadges } from '../services/badges.js';
import { printWithNotice } from '../components/eta-notice.js';
import { findMe, myEmails } from '../services/me.js';
import { projectText } from '../services/om.js';

export const meta = { route: 'requests', title: 'ติดตามสถานะ', nav: true, order: 4, adminOnly: false };

/** ลำดับตัวกรองสถานะในหน้าติดตามสถานะ */
const STATUS_FILTERS = ['รออนุมัติ', 'ส่งกลับแก้ไข', 'อนุมัติแล้ว', 'เสร็จสิ้น', 'ไม่อนุมัติ', 'ยกเลิก'];
/** ลำดับตัวกรองสถานะจัดซื้อ (ใบขอสั่งซื้อ) */
const PURCHASE_FILTERS = ['เบิก Store', 'รับ PR', 'รับใบเสนอราคา', 'ออก PO แล้ว', 'ส่ง Sup แล้ว', 'ส่งของแล้ว', 'Cancel'];
const STATUS_TONE = {
  'ร่าง': 'gray', 'รออนุมัติ': 'blue', 'อนุมัติแล้ว': 'green',
  'ไม่อนุมัติ': 'red', 'เสร็จสิ้น': 'green', 'ยกเลิก': 'red',
  'ส่งกลับแก้ไข': 'amber',
};

let allRequests = [];
let stepCache = {};
let me = '';
let meIds = [];
let olderCount = 0;   // จำนวนคำขอเก่าที่ถูกซ่อนไว้
let notInDir = false; // หาผู้ใช้ในทะเบียนบุคลากรไม่เจอ → ระบบไม่รู้ว่าเป็นผู้อนุมัติใบไหน
let watchForms = [];  // ฟอร์มที่ผู้ใช้ติดตามได้ทุกใบตามฝ่าย (ดูอย่างเดียวถ้าไม่ได้อยู่ในเส้นทาง)

/**
 * ฟอร์มที่บุคลากรในฝ่ายหนึ่งดูได้ทุกคำขอเพื่อตรวจสอบสถานะ (กดอนุมัติได้เฉพาะลำดับที่ตัวเองอยู่ในเส้นทาง)
 * ฝ่าย → รหัสฟอร์ม
 */
export const DEPT_WATCH_FORMS = {
  'ฝ่ายบัญชีและการเงิน': ['FM-ACC-002', 'FM-ACC-003', 'FM-ACC-004'],   // เงินทดรองจ่าย · เงินสำรองโครงการ · ค่าแรงผู้รับเหมา
};
/** ขั้นที่ไม่แสดงรายชื่อผู้มีสิทธิ์อนุมัติ (ชื่อขึ้นเมื่อมีคนกดแล้ว) — ขั้นผู้ทบทวนที่ส่งให้ทั้งฝ่าย */
const HIDE_NAMES_STEP = /ผู้ทบทวน/;
const deptName = (v) => String((v && typeof v === 'object' ? (v.LookupValue ?? v.Title) : v) || '').trim();

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

/** เติมผู้อนุมัติจริงให้คำขอแต่ละใบ ตามผู้ยื่นของใบนั้น (ทำพร้อมกันทีละชุด ไม่รอทีละใบ) */
async function resolveFor(requests) {
  const BATCH = 20;
  for (let i = 0; i < requests.length; i += BATCH) {
    await Promise.all(requests.slice(i, i + BATCH).map(async (r) => {
      const base = stepCache[r.FormCode] || [];
      // clone เพราะผู้ยื่นต่างกัน ผู้อนุมัติตามตำแหน่งก็ต่างกัน
      r._steps = await loadResolved(base.map((x) => ({ ...x })), r);
    }));
  }
}

/**
 * เปลี่ยนแถบ/ตัวกรอง/หน้า: วาดใหม่จากข้อมูลที่โหลดไว้แล้ว ไม่ต้องอ่าน SharePoint และคำนวณผู้อนุมัติใหม่ทุกครั้ง
 * (ข้อมูลเก่าเกิน FRESH_MS จะโหลดใหม่ตามปกติ)
 */
const FRESH_MS = 60000;
let fastNext = false;
let loadedAt = 0;
let loadedAll = null;
function quick(patch) { fastNext = true; setState(patch); }

function statusPill(s) {
  return `<span class="rq-status st-${STATUS_TONE[s] || 'gray'}">${esc(s || '')}</span>`;
}

/** ช่องที่ระบบเติมให้ภายหลัง (ไม่ได้อยู่ในแบบฟอร์ม) — ชื่อที่แสดงในข้อมูลคำขอ */
const SYSTEM_LABEL = { om_site: 'โครงการ O&M', om_group: 'กลุ่มโครงการ O&M', pr_no: 'PR No.', pr_date: 'วันที่ออก PR', car_plate: 'ทะเบียนรถที่ใช้', car_returned_at: 'คืนรถเมื่อ' };

/** ช่องกรอกของแบบฟอร์ม (เรียงตามลำดับ) */
export async function formFieldsOf(code) {
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
  return (await list('formFields').catch(() => []))
    .filter((f) => fcodeOf(f) === code)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
}

/** ฟอร์มที่แสดงวันที่ต้องการใช้เงินบนแถวคำขอ: ใกล้ถึง (≤ NEED_SOON_DAYS วัน) สีเหลือง · ถึงวัน/เลยกำหนด สีแดง */
const NEED_DATE_FORMS = ['FM-ACC-002', 'FM-ACC-003'];
const NEED_SOON_DAYS = 3;
const needField = {};
async function loadNeedFields() {
  await Promise.all(NEED_DATE_FORMS.filter((c) => !needField[c]).map(async (code) => {
    const fields = (await formFieldsOf(code).catch(() => [])).filter((f) => f.FieldType === 'date');
    const f = fields.find((x) => x.FieldKey === 'use_date')
      || fields.find((x) => /ต้องการใช้|ขอใช้/.test(x.Title || '')) || fields[0];
    needField[code] = f ? { key: f.FieldKey, label: f.Title || 'วันที่ต้องการใช้' } : { key: 'use_date', label: 'วันที่ต้องการใช้' };
  }));
}
/** ช่อง "ชื่อโครงการ (กรณีไม่มีในรายการ)" ของแต่ละฟอร์ม — ใช้แสดงแทนเมื่อไม่ได้เลือกโครงการจากรายการ */
const OTHER_PROJECT_KEYS = ['project_other', 'other_project', 'project_name', 'project_custom'];
const otherProjField = {};
async function loadOtherProjFields(codes) {
  await Promise.all(codes.filter((c) => c && !(c in otherProjField)).map(async (code) => {
    const fields = await formFieldsOf(code).catch(() => []);
    const f = fields.find((x) => x.FieldKey !== 'project' && /ไม่มีในรายการ|กรอกชื่อโครงการ|ระบุชื่อโครงการ|โครงการอื่น/.test(x.Title || ''));
    otherProjField[code] = f ? f.FieldKey : '';
  }));
}
function projectOf(req) {
  const v = prValues(req);
  const pj = projectText(v);
  if (pj && pj !== NO_PROJECT) return pj;
  const key = otherProjField[req.FormCode];
  const other = String((key && v[key]) || OTHER_PROJECT_KEYS.map((k) => v[k]).find((x) => String(x || '').trim()) || '').trim();
  return other || pj;
}

/** วันที่ต้องใช้เงินของคำขอ · tone: due = ถึงวัน/เลยกำหนด, soon = อีก 1–3 วัน, later = เกิน 3 วัน, '' = ปิดแล้ว/ไม่มีวันที่ */
function needInfo(req) {
  const nf = needField[req.FormCode];
  if (!nf) return null;
  const day = localDay(prValues(req)[nf.key]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(y, m - 1, d) - t) / 86400000);
  const open = ['รออนุมัติ', 'ส่งกลับแก้ไข'].includes(String(req.Status || '').trim());
  const tone = !open ? '' : diff <= 0 ? 'due' : diff <= NEED_SOON_DAYS ? 'soon' : 'later';
  return { nf, date: new Date(y, m - 1, d), diff, open, tone };
}
/** ตัวกรองวันที่ต้องใช้เงิน (เฉพาะฟอร์มเบิกเงินสำรอง/ทดรองจ่าย) — ข้อความสั้น ผู้บริหารอ่านแล้วเข้าใจทันที */
const NEED_FILTERS = [
  { key: 'due', label: '🔴 ถึงกำหนดแล้ว', hint: 'ถึงวันที่ต้องใช้เงินแล้ว หรือเลยกำหนด — ควรอนุมัติด่วน' },
  { key: 'soon', label: '🟡 ใกล้ถึง (1–3 วัน)', hint: `อีก 1–${NEED_SOON_DAYS} วันจะถึงวันที่ต้องใช้เงิน` },
  { key: 'later', label: '⚪ ยังมีเวลา', hint: `อีกเกิน ${NEED_SOON_DAYS} วันจึงจะถึงวันที่ต้องใช้เงิน` },
];
function needChip(req) {
  const n = needInfo(req);
  if (!n) return '';
  const tone = n.tone === 'due' || n.tone === 'soon' ? ' ' + n.tone : '';
  const when = !n.open ? '' : n.diff < 0 ? ` · เลยกำหนด ${-n.diff} วัน` : n.diff === 0 ? ' · วันนี้' : ` · อีก ${n.diff} วัน`;
  return `<span class="rq-need${tone}" title="${esc(n.nf.label)}">📅 ${esc(n.nf.label)} ${esc(thaiDateShort(n.date))}${when}</span>`;
}

function summaryLine(req) {
  try {
    const d = JSON.parse(req.FormData || '{}');
    return d.std_subject || d.subject || d.purpose || d.reason || '';
  } catch (e) { return ''; }
}

/** ข้อความที่ใช้ค้นหา: เลขที่ หัวข้อ ชื่อฟอร์ม ผู้ยื่น โครงการ/ไซต์ O&M เลข PR ทะเบียนรถ */
function searchText(req) {
  const v = prValues(req);
  return [req.Title, req.FormName, req.FormCode, summaryLine(req), req.RequesterName,
    projectText(v), projectOf(req), v.om_site, v.pr_no, carData(req).car_plate].filter(Boolean).join(' ').toLowerCase();
}
const matchQ = (req, q) => q.split(/\s+/).every((w) => searchText(req).includes(w));

function requestRow(req, opts = {}) {
  const steps = req._steps || stepCache[req.FormCode] || [];
  const cur = +req.CurrentStep || 1;
  const curName = (steps.find((s) => +s.StepOrder === cur) || {}).StepName || '';
  return `
    <button class="rq-row${opts.unread ? ' unread' : ''}" data-open="${req.id}">
      <div class="rq-main">
        <span class="rq-no">${esc(req.Title)}</span>
        <span class="rq-form">${esc(req.FormName || req.FormCode)}</span>
        ${(() => { const pj = projectOf(req); return pj ? `<span class="rq-proj${pj === NO_PROJECT ? ' none' : ''}" title="โครงการ">🏗 ${esc(pj)}</span>` : ''; })()}
      </div>
      <div class="rq-sub">${esc(summaryLine(req)) || '<span class="dim">ไม่มีหัวข้อ</span>'}</div>
      <div class="rq-foot">
        ${statusPill(req.Status)}
        ${req.Status === 'รออนุมัติ' && curName ? `<span class="rq-step">รอ: ${esc(curName)}</span>` : ''}
        ${purchaseStatusOf(req) ? `<span class="rq-pstatus${purchaseStatusOf(req) === PURCHASE_CANCEL ? ' bad' : ''}">📦 ${esc(purchaseStatusOf(req))}</span>` : ''}
        ${isPR(req.FormCode) && prValues(req).pr_no ? `<span class="rq-pstatus">PR ${esc(prValues(req).pr_no)}</span>` : ''}
        ${needChip(req)}
        ${isCarRequest(req) && carData(req).car_plate ? `<span class="rq-pstatus">🚗 ${esc(carData(req).car_plate)}${carData(req).car_returned_at ? ' · คืนแล้ว' : ''}</span>` : ''}
        ${opts.showRequester ? `<span class="rq-by">${esc(req.RequesterName || '')}</span>` : ''}
        <time title="ยื่นเมื่อ ${esc(thaiDateTime(req.SubmittedDate))}">${esc(thaiDateTime(req.SubmittedDate))}</time>
        ${opts.canAct ? '<span class="rq-act-flag">ถึงคิวคุณ</span>' : ''}
        ${opts.waiting ? '<span class="rq-wait-flag" title="คุณอยู่ลำดับถัดไป ดูได้อย่างเดียวจนกว่าจะถึงคิว">👁 ยังไม่ถึงคิว</span>' : ''}
        ${opts.unread ? '<span class="rq-new-flag">● มีความเคลื่อนไหว</span>' : ''}
      </div>
    </button>`;
}

export async function render(ctx) {
  const prRegisterOk = await import('./pr-register.page.js').then((m) => m.canSeePRRegister()).catch(() => false);
  // ชื่อที่ใช้เทียบ/บันทึก = ชื่อในทะเบียนบุคลากร (หาด้วยอีเมล) ถ้าไม่เจอใช้ชื่อจาก Microsoft 365
  const dirAll = await list('directory').catch(() => []);
  const mePerson = findMe(dirAll);
  me = (mePerson && mePerson.Title) || state.user?.name || '';
  meIds = [me, state.user?.name, state.user?.email].filter(Boolean);
  const isAdmin = !!state.isAdmin;
  const seeAll = isAdmin || !!state.isViewer;   // แอดมิน + ผู้บริหาร เห็นคำขอทุกใบ
  notInDir = !mePerson && !state.isAdmin;   // บัญชีแอดมินกลาง (เช่น Intranet Prime) ไม่ต้องอยู่ในทะเบียน
  watchForms = DEPT_WATCH_FORMS[deptName(mePerson && mePerson.Department)] || [];

  // ปกติดึงเฉพาะช่วงล่าสุด + ใบที่ยังเดินอยู่ (กรองที่ SharePoint) กันหน้าอืดเมื่อคำขอสะสมหลักพันใบ
  // ของเก่ายังดูได้ด้วยปุ่ม "แสดงย้อนหลังทั้งหมด" (ดึงทั้ง List)
  const MONTHS = 6;
  const cutoff = Date.now() - MONTHS * 30 * 86400000;
  const reuse = fastNext && allRequests.length && loadedAll === !!state.showAllRequests && Date.now() - loadedAt < FRESH_MS;
  fastNext = false;
  if (!reuse) {
  // ใช้ข้อมูลในแคชแสดงทันที · ถ้าเก่ากว่า 60 วินาที ระบบดึงใหม่เบื้องหลังแล้ววาดใหม่เอง (กดอนุมัติในอีเมล/Teams ก็เห็น)
  const fetched = await (state.showAllRequests
    ? list('requests')
    : listRecent('requests', RECENT_REQUESTS)).catch(() => []);
  const everything = [...fetched]
    .sort((a, b) => new Date(b.SubmittedDate) - new Date(a.SubmittedDate));

  const isRecent = (r) => {
    const d = new Date(r.SubmittedDate);
    return isNaN(d) ? true : d.getTime() >= cutoff;
  };
  // คำขอที่ยังเดินอยู่ต้องเห็นเสมอ ต่อให้ยื่นนานแล้ว
  const live = (r) => ['รออนุมัติ', 'ส่งกลับแก้ไข'].includes(String(r.Status || '').trim());

  // ได้มาแค่บางส่วนจาก SharePoint → ไม่รู้จำนวนที่ซ่อน (-1 = มีอาจมีของเก่า แสดงปุ่มโดยไม่บอกจำนวน)
  olderCount = fetched.partial ? -1 : everything.filter((r) => !isRecent(r) && !live(r)).length;
  allRequests = state.showAllRequests
    ? everything
    : everything.filter((r) => isRecent(r) || live(r));
  // ทำ FormCode ให้เป็นข้อความก่อนใช้งานทั้งหน้า (แก้ทั้งชื่อช่องและเส้นทางอนุมัติ)
  allRequests.forEach((r) => { r.FormCode = formCodeOf(r); });
  await loadSteps([...new Set(allRequests.map((r) => r.FormCode).filter(Boolean))]);
  await resolveFor(allRequests);
  await loadNeedFields();
  await loadOtherProjFields([...new Set(allRequests.map((r) => r.FormCode))]);
  loadedAt = Date.now(); loadedAll = !!state.showAllRequests;
  }

  const mine = allRequests.filter((r) => r.RequesterEmail
    && r.RequesterEmail.toLowerCase() === String(state.user?.email).toLowerCase());
  const unreadCount = mine.filter((r) => isUnread(r)).length;

  // ค้นหา + แบ่งหน้า กล่อง "คำขอของฉัน" (15 รายการต่อหน้า)
  const MINE_PER = 15;
  const mineQ = (state.mineQuery || '').trim().toLowerCase();
  const mineFiltered = mineQ
    ? mine.filter((r) => matchQ(r, mineQ))
    : mine;
  const minePages = Math.max(1, Math.ceil(mineFiltered.length / MINE_PER));
  const minePage = Math.min(Math.max(1, state.minePage || 1), minePages);
  const mineRows = mineFiltered.slice((minePage - 1) * MINE_PER, minePage * MINE_PER);

  // คำขอที่ผู้ใช้เกี่ยวข้องในฐานะผู้อนุมัติ (แอดมินเห็นทุกใบ)
  const toReview = allRequests.filter((r) => {
    if (seeAll || watchForms.includes(r.FormCode)) return true;
    const role = roleOnRequest(r, r._steps || [], meIds);
    return role.isInvolved;
  });
  // ค้นหาชื่อโครงการ / ชื่อพนักงาน / เลขที่ — กรองทุกแบบฟอร์ม ตัวเลขบนแถบเป็นจำนวนที่พบ
  const reviewQ = (state.reviewQuery || '').trim().toLowerCase();
  const reviewHits = reviewQ ? toReview.filter((r) => matchQ(r, reviewQ)) : toReview;

  // จัดกลุ่มฝั่งซ้ายตามชื่อฟอร์ม พร้อมนับใบที่ถึงคิวฉันในแต่ละฟอร์ม (ตัวเลขเตือนบนแถบ)
  const groups = [];
  reviewHits.forEach((r) => {
    let g = groups.find((x) => x.code === r.FormCode);
    if (!g) groups.push((g = { code: r.FormCode, name: r.FormName || r.FormCode, rows: [], act: 0 }));
    g.rows.push(r);
    if (roleOnRequest(r, r._steps || [], meIds).canActNow) g.act += 1;
  });
  // ฟอร์มที่มีงานค้างขึ้นก่อน แล้วเปิดแถบแรกที่มีงานค้างให้เลย
  groups.sort((a, b) => (b.act > 0) - (a.act > 0));
  const activeTab = (groups.some((g) => g.code === state.reviewTab) && state.reviewTab)
    || (groups[0] && groups[0].code) || '';
  const shownGroup = groups.find((g) => g.code === activeTab) || groups[0];
  const reviewStatus = state.reviewStatus || '';
  const isPRTab = !!shownGroup && isPR(shownGroup.code);
  const reviewPStatus = isPRTab ? (state.reviewPStatus || '') : '';
  const isNeedTab = !!shownGroup && NEED_DATE_FORMS.includes(shownGroup.code);
  const reviewNeed = isNeedTab ? (state.reviewNeed || '') : '';
  const shownRows = shownGroup ? shownGroup.rows.filter((r) => (!reviewStatus || String(r.Status || '').trim() === reviewStatus)
    && (!reviewPStatus || purchaseStatusOf(r) === reviewPStatus)
    && (!reviewNeed || needInfo(r)?.tone === reviewNeed)) : [];

  // ผู้ใช้ที่ไม่มีหน้าที่อนุมัติใบไหนเลย ไม่ต้องเห็นกล่องว่าง "คำขอที่ต้องดำเนินการ" ให้เหลือแค่คำขอของฉัน
  const solo = !seeAll && !toReview.length;

  const actableCount = toReview.filter((r) =>
    roleOnRequest(r, r._steps || [], meIds).canActNow).length;

  return `
  <section class="page page-requests">
    <div class="wrap">
      <div class="rq-title-row">
        <h1 class="page-title">${esc(meta.title)}</h1>
      </div>

      ${notInDir ? `<div class="rq-dir-warn">⚠ ไม่พบอีเมลที่คุณใช้ล็อกอิน (<b>${esc(myEmails().join(', '))}</b>) ในทะเบียนบุคลากร
        ระบบจึงไม่รู้ว่าคุณเป็นผู้อนุมัติของคำขอใด และคุณจะไม่ได้รับการ์ดอนุมัติ — แจ้งผู้ดูแลให้แก้ช่องอีเมลของคุณในหน้าบุคลากรให้ตรงกับอีเมลนี้</div>` : ''}
      <div class="rq-layout${solo ? ' solo' : ''}">
        ${solo ? '' : `<main class="rq-review">
          <div class="rq-head-row">
            <h2>${seeAll ? 'คำขอทั้งหมด' : watchForms.length ? 'คำขอที่ต้องดำเนินการ / ติดตาม' : 'คำขอที่ต้องดำเนินการ'}</h2>
            ${actableCount ? `<span class="rq-badge">${actableCount} รายการถึงคิวคุณ</span>` : ''}
          </div>

          ${toReview.length ? `<div class="rq-search">
            <input id="rq-q" type="search" data-keepfocus value="${esc(state.reviewQuery || '')}"
              placeholder="🔍 ค้นหาชื่อโครงการ ชื่อพนักงาน เลขที่ หัวข้อ เลข PR…" autocomplete="off">
            ${reviewQ ? `<span class="dim">พบ ${reviewHits.length} จาก ${toReview.length} รายการ</span>` : ''}
          </div>` : ''}
          ${groups.length ? `
            <div class="rq-tabs">
              ${groups.map((g) => `<button data-tab="${esc(g.code)}"
                aria-current="${g.code === activeTab ? 'page' : 'false'}">
                ${esc(g.name)} <b>${g.rows.length}</b>${g.act
                  ? `<span class="tab-badge" title="ถึงคิวคุณ ${g.act} ใบ">${g.act}</span>` : ''}</button>`).join('')}
            </div>
            ${(() => {
              // ตัวกรองสถานะของฟอร์มที่เลือก · รออนุมัติมีตัวเลขเตือน
              const cnt = (st) => shownGroup.rows.filter((r) => String(r.Status || '').trim() === st).length;
              const chips = STATUS_FILTERS.filter((st) => cnt(st) || st === reviewStatus);
              return `<div class="rq-stfilter" role="group" aria-label="กรองตามสถานะ">
                <button data-rqst="" aria-pressed="${!reviewStatus}">ทั้งหมด <b>${shownGroup.rows.length}</b></button>
                ${chips.map((st) => `<button data-rqst="${esc(st)}" class="st-${STATUS_TONE[st] || 'gray'}" aria-pressed="${st === reviewStatus}">${esc(st)}${
                  st === 'รออนุมัติ' && cnt(st) ? ` <span class="tab-badge" title="รออนุมัติ ${cnt(st)} ใบ">${cnt(st)}</span>` : ` <b>${cnt(st)}</b>`}</button>`).join('')}
              </div>${isPRTab ? `<div class="rq-stfilter rq-pfilter" role="group" aria-label="กรองตามสถานะจัดซื้อ">
                <span class="rq-pf-label">📦 สถานะจัดซื้อ</span>
                <button data-rqpst="" aria-pressed="${!reviewPStatus}">ทั้งหมด</button>
                ${PURCHASE_FILTERS.map((x) => {
                  const n = shownGroup.rows.filter((r) => purchaseStatusOf(r) === x).length;
                  return `<button data-rqpst="${esc(x)}" class="${x === PURCHASE_CANCEL ? 'st-red' : ''}" aria-pressed="${x === reviewPStatus}">${esc(x)} <b>${n}</b></button>`;
                }).join('')}
              </div>` : ''}${isNeedTab ? `<div class="rq-stfilter rq-nfilter" role="group" aria-label="กรองตามวันที่ต้องใช้เงิน">
                <span class="rq-pf-label" title="นับเฉพาะคำขอที่ยังไม่อนุมัติ (รออนุมัติ / ส่งกลับแก้ไข)">📅 วันที่ต้องใช้เงิน</span>
                <button data-rqneed="" aria-pressed="${!reviewNeed}">ทั้งหมด</button>
                ${NEED_FILTERS.map((x) => {
                  const n = shownGroup.rows.filter((r) => needInfo(r)?.tone === x.key).length;
                  return `<button data-rqneed="${x.key}" class="nf-${x.key}" title="${esc(x.hint)}" aria-pressed="${x.key === reviewNeed}">${x.label} <b>${n}</b></button>`;
                }).join('')}
              </div>` : ''}
              <div class="rq-tools">
                <span class="dim">แสดง ${shownRows.length} จาก ${shownGroup.rows.length} รายการ</span>
                ${isPRTab && prRegisterOk ? '<a class="btn-mini" href="#/pr-register" title="ค้นหา กรองรายวัน/เดือน/ปี และส่งออก Excel">📋 ทะเบียนใบขอสั่งซื้อ (PR)</a>' : ''}
                ${isPRTab ? '' : `<a class="btn-mini" href="#/register/${esc(shownGroup.code)}" title="สรุปรวมคำขอของแบบฟอร์มนี้ กรองรายวัน/เดือน/ปี และส่งออก Excel">📋 ทะเบียนคำขอ · ส่งออก Excel</a>`}
              </div>`;
            })()}
            <div class="rq-list">
              ${shownRows.length ? '' : '<div class="panel"><div class="empty">ไม่มีคำขอสถานะนี้ในแบบฟอร์มนี้</div></div>'}
              ${shownRows.map((r) => requestRow(r, {
                showRequester: true,
                canAct: roleOnRequest(r, r._steps || [], meIds).canActNow,
                waiting: roleOnRequest(r, r._steps || [], meIds).waiting,
              })).join('')}
            </div>`
          : `<div class="panel"><div class="empty">
              ${reviewQ ? `ไม่พบคำขอที่ตรงกับ “${esc(state.reviewQuery.trim())}”` : seeAll ? 'ยังไม่มีคำขอในระบบ' : 'ยังไม่มีคำขอที่คุณต้องดำเนินการ'}
            </div></div>`}
        </main>`}

        <aside class="rq-mine">
          <div class="panel">
            <div class="panel-head">📄 คำขอของฉัน
              <span class="panel-meta">${unreadCount ? `<span class="tab-badge">${unreadCount} ใหม่</span> ` : ''}${mineFiltered.length} รายการ</span></div>
            ${mine.length ? `<div class="rq-mine-tools">
              <input id="mine-q" type="search" data-keepfocus value="${esc(state.mineQuery || '')}"
                placeholder="ค้นหาเลขที่ / ฟอร์ม / โครงการ…" autocomplete="off">
            </div>` : ''}
            ${mineFiltered.length ? `<div class="rq-list rq-mine-list">
              ${mineRows.map((r) => requestRow(r, { unread: isUnread(r) })).join('')}</div>
              ${minePages > 1 ? `<div class="rq-pager">
                <button class="btn-mini" data-minepage="${minePage - 1}" ${minePage <= 1 ? 'disabled' : ''}>‹ ก่อนหน้า</button>
                <span class="rq-pager-info">หน้า ${minePage} / ${minePages}</span>
                <button class="btn-mini" data-minepage="${minePage + 1}" ${minePage >= minePages ? 'disabled' : ''}>ถัดไป ›</button>
              </div>` : ''}`
            : (mine.length
              ? '<div class="side-empty">ไม่พบคำขอที่ค้นหา</div>'
              : '<div class="side-empty">คุณยังไม่ได้ยื่นคำขอ<br><a href="#/forms">ไปหน้าแบบฟอร์ม</a></div>')}
            ${olderCount && !state.showAllRequests ? `<div class="rq-older">
              ซ่อนคำขอเก่ากว่า 6 เดือนไว้${olderCount > 0 ? ` ${olderCount} ใบ` : ''}
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
  // อ่านคำขอใบนี้สดอีกครั้ง ถ้ามีคนกดอนุมัติจากอีเมล/Teams ไปแล้ว จะไม่ขึ้นปุ่มให้กดซ้ำ
  try {
    const fresh = await get('requests', req.id);
    if (fresh) req = { ...req, ...fresh, FormCode: formCodeOf({ ...req, ...fresh }) };
  } catch (e) { /* อ่านไม่ได้ ใช้ข้อมูลเดิม */ }
  // เปิดคำขอของตัวเองแล้ว ถือว่าอ่านความเคลื่อนไหวล่าสุดแล้ว ตัวเลขเตือนลดลงทันที
  if (String(req.RequesterEmail || '').toLowerCase() === String(state.user?.email || '').toLowerCase()) {
    markSeen(req);
    document.querySelectorAll(`.rq-row[data-open="${req.id}"]`).forEach((row) => {
      row.classList.remove('unread');
      row.querySelector('.rq-new-flag')?.remove();
    });
  }
  // ผู้อนุมัติจริงของคำขอนี้ (ตามผู้ยื่น/โครงการ/เงื่อนไข) — เปิดจากลิงก์ตรงอาจยังไม่ได้คำนวณไว้
  const steps = req._steps || await loadResolved((stepCache[req.FormCode] || await stepsOf(req.FormCode).catch(() => [])).map((x) => ({ ...x })), req);
  const role = roleOnRequest(req, steps, meIds);
  const log = parseLog(req.ApprovalLog);
  const cur = +req.CurrentStep || 1;

  let data = {};
  try { data = JSON.parse(req.FormData || '{}'); } catch (e) { /* ข้อมูลเสีย */ }
  const code = formCodeOf(req);
  const fields = await formFieldsOf(code);
  const catalog = await list('formCatalog').catch(() => []);

  const answerRows = Object.entries(data)
    .filter(([k]) => !k.startsWith('_'))      // ค่าภายใน เช่นลายเซ็นผู้ยื่น
    .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => {
      const f = fields.find((x) => x.FieldKey === k);
      const label = (f ? f.Title : null) || standardLabel(k) || SYSTEM_LABEL[k] || k;
      // เวลาคืนรถ: แสดงทั้งวันและเวลา
      if (k === 'car_returned_at') return `<div class="rq-ans"><span>${esc(label)}</span><b>${esc(thaiDateTime(v))}</b></div>`;
      if (f && f.FieldType === 'lineitems' && Array.isArray(v)) {
        const cols = String(f.Options||'').split('\n').map(x=>x.split('|'));
        return `<div class="rq-ans rq-ans-table"><span>${esc(label)}</span>
          <table class="li-view"><tr>${cols.map(c=>`<th>${esc(c[1]||c[0])}</th>`).join('')}</tr>
          ${v.map(row=>`<tr>${cols.map(c=>`<td>${esc(row[c[0].trim()]||'')}</td>`).join('')}</tr>`).join('')}
          </table></div>`;
      }
      const isDate = (f && f.FieldType === 'date') || k === 'std_date' || k === 'pr_date'
        || /Date$/.test(k) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v));
      // ไฟล์แนบ: กดเปิดได้ (รูปภาพโชว์ตัวอย่างด้วย)
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && x.url)) {
        return `<div class="rq-ans rq-ans-files"><span>${esc(label)}</span><div class="rq-files">${v.map((x) => {
          const name = (x && (x.name || x.Title)) || 'ไฟล์แนบ';
          if (!x || !x.url || x.url === '#') return `<b>${esc(name)}</b>`;
          const img = /^(JPG|JPEG|PNG|GIF|WEBP)$/i.test(x.kind || '') || /\.(jpe?g|png|gif|webp)$/i.test(name);
          return `<a class="rq-file" href="${esc(x.url)}" target="_blank" rel="noopener" title="เปิดไฟล์">
            ${img ? `<img data-photo="${esc(x.url)}" alt="${esc(name)}" loading="lazy">` : '<span>📄</span>'}
            <b>${esc(name)}</b></a>`;
        }).join('')}</div></div>`;
      }
      const val = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? (x.name || x.Title || '') : x)).join(', ')
        : isDate ? thaiDateShort(v) : v;
      return `<div class="rq-ans"><span>${esc(label)}</span><b>${esc(val)}</b></div>`;
    }).join('');

  // เวลาที่ใช้ในแต่ละครั้งที่อนุมัติ นับจากเวลายื่นหรือจากการดำเนินการครั้งก่อน
  const sortedActs = [...log].filter((l) => l.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  const tookMap = new Map();
  let prevAt = new Date(req.SubmittedDate);
  sortedActs.forEach((l) => {
    const at = new Date(l.at);
    if (!isNaN(at) && !isNaN(prevAt)) {
      const h = (at - prevAt) / 3600000;
      if (h >= 0) tookMap.set(l.at + '|' + l.by, h);
    }
    prevAt = at;
  });
  const took = (h) => (h == null ? ''
    : h < 1 ? `ใช้เวลา ${Math.max(1, Math.round(h * 60))} นาที`
      : h < 24 ? `ใช้เวลา ${h.toFixed(1)} ชม.`
        : `ใช้เวลา ${(h / 24).toFixed(1)} วัน`);

  // สถานะของแต่ละลำดับนับเฉพาะรอบล่าสุด (หลังการยื่นใหม่ครั้งล่าสุด) ส่วนประวัติยังแสดงครบ
  const lastRound = log.map((l) => l.action).lastIndexOf('ยื่นใหม่');
  const timeline = steps.map((s) => {
    const n = +s.StepOrder;
    const acts = log.filter((l) => l.step === n);
    const now = log.slice(lastRound + 1).filter((l) => l.step === n);
    const rejected = now.find((l) => l.action === 'ไม่อนุมัติ');
    const sentBack = now.find((l) => l.action === 'ส่งกลับแก้ไข');
    const approved = now.filter((l) => l.action === 'อนุมัติ' || l.action === 'ข้าม'
      || (l.action === PURCHASE_ACTION && String(l.note || '').startsWith(PURCHASE_DONE)));
    const cancelled = now.find((l) => l.action === PURCHASE_ACTION && String(l.note || '').startsWith(PURCHASE_CANCEL));
    // ลำดับปัจจุบันที่ต้องอนุมัติครบทุกคน: มีคนอนุมัติบางส่วนแล้วยังไม่ถือว่าผ่าน
    const prog = stepProgress(s, log);
    const partial = n === cur && req.Status === 'รออนุมัติ' && prog.all && !prog.done && prog.approvedBy.length;
    const st = rejected || cancelled ? 'bad' : sentBack ? 'back' : partial ? 'now' : approved.length ? 'ok' : n === cur ? 'now' : 'wait';
    return `<div class="tl-step tl-${st}">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-name">${esc(s.StepName || 'ลำดับ ' + n)}</div>
        ${(() => {
          const who = (Array.isArray(s._resolved) ? s._resolved
            : (Array.isArray(s.Approvers) ? s.Approvers : [s.Approvers])).filter(Boolean).map((x) => String(x).trim());
          if (!who.length) {
            return `<div class="tl-people"><span class="dim">${s.Optional === true || s.Optional === 'Yes' || s.Optional === 'ใช่'
              ? '— ไม่มีผู้อนุมัติ · ข้ามขั้นนี้อัตโนมัติ —' : '— หาผู้อนุมัติไม่พบ —'}</span></div>`;
          }
          // แสดงรายชื่อผู้มีสิทธิ์อนุมัติของขั้นที่ยังไม่มีคนกด · ยกเว้นขั้นผู้ทบทวน (รายชื่อยาวทั้งฝ่าย)
          const names = !acts.length && !HIDE_NAMES_STEP.test(String(s.StepName || ''))
            ? `<div class="tl-people">${esc(who.join(', '))}</div>` : '';
          if (!who.some((x) => meIds.includes(x)) || acts.some((a) => meIds.includes(String(a.by).trim()))
            || req.Status !== 'รออนุมัติ') return names;
          return names + (n === cur ? '<div class="tl-people tl-me">ถึงคิวคุณแล้ว</div>'
            : n > cur ? '<div class="tl-people tl-me tl-later">คุณเป็นผู้อนุมัติขั้นนี้ · รอลำดับก่อนหน้าอนุมัติก่อน</div>' : '');
        })()}
        ${partial ? `<div class="tl-people tl-partial">ต้องอนุมัติครบทุกคน · อนุมัติแล้ว ${prog.approvedBy.length}/${prog.need.length} คน · รออีก ${prog.left.length} คน</div>` : ''}
        ${n === cur && req.Status === 'รออนุมัติ' && prog.done ? '<div class="tl-people tl-stuck">⚠ ลำดับนี้อนุมัติแล้ว แต่ระบบยังไม่เลื่อนไปลำดับถัดไป — แจ้งแอดมินกด ↻ ส่งแจ้งอนุมัติใหม่</div>' : ''}
        ${st === 'now' && req.Status === 'รออนุมัติ' ? (() => {
          const base = sortedActs.length ? new Date(sortedActs[sortedActs.length - 1].at) : new Date(req.SubmittedDate);
          const h = (Date.now() - base) / 3600000;
          return isNaN(h) ? '' : `<div class="tl-waiting">⏳ รออยู่ ${
            h < 24 ? `${h.toFixed(1)} ชม.` : `${(h / 24).toFixed(1)} วัน`}</div>`;
        })() : ''}
        ${acts.map((a) => `<div class="tl-act ${a.action === 'ไม่อนุมัติ' ? 'bad' : a.action === 'ส่งกลับแก้ไข' ? 'back' : a.action === 'ข้าม' ? 'skip' : a.action === PURCHASE_ACTION ? 'buy' : 'ok'}">
          <b>${esc(a.action)}</b> · ${esc(a.by)}${isPR(req.FormCode) && a.action === 'อนุมัติ' && !a.sig
            ? ' <span class="tl-nosig" title="อนุมัติจากการ์ด Teams/อีเมล จึงไม่มีลายเซ็นในขั้นนี้">⚠ ไม่มีลายเซ็น</span>' : ''}<br><span class="tl-when">${esc(thaiDateTime(a.at))}${
            tookMap.has(a.at + '|' + a.by) ? ` · ${esc(took(tookMap.get(a.at + '|' + a.by)))}` : ''}</span>
          ${a.note ? (a.action === PURCHASE_ACTION || (a.action === 'ข้าม' && /จัดซื้อ/.test(a.note))
            ? `<div class="tl-note tl-note-buy"><span class="tl-note-h">📦 สถานะจัดซื้อ</span>${esc(a.note)}</div>`
            : `<div class="tl-note"><span class="tl-note-h">💬 ความเห็นผู้อนุมัติ</span>${esc(a.note)}</div>`) : ''}</div>`).join('')}
      </div></div>`;
  }).join('') + carTimeline(log);

  role.carPlates = isCarRequest(req) ? await carPlates() : [];
  openModal({
    title: `${req.Title} · ${req.FormName || ''}`,   // openModal escape ให้เองแล้ว
    wide: true,
    body: `
      <div class="rq-detail">
        <div class="rq-detail-head">
          ${statusPill(req.Status)}
          <span class="dim">ยื่นโดย ${esc(req.RequesterName)} · ยื่นเมื่อ ${esc(thaiDateTime(req.SubmittedDate))}</span>
          ${isPR(req.FormCode) && prValues(req).pr_no ? `<span class="rq-prline">PR No. <b>${esc(prValues(req).pr_no)}</b>${
            prValues(req).pr_date ? ` · ออก ${esc(thaiNumDate(prValues(req).pr_date))}` : ''}</span>` : ''}
          ${isCarRequest(req) ? carLine(req) : ''}
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
          ? '<div class="rq-wait">👁 ดูได้อย่างเดียว · ยังไม่ถึงคิวของคุณ — ระบบจะแจ้งเตือนอีกครั้งเมื่อถึงคิว</div>'
          : (state.isViewer && !state.isAdmin && !role.isInvolved && req.Status === 'รออนุมัติ'
            ? '<div class="rq-wait">👁 ดูได้อย่างเดียว (ผู้บริหาร) · คุณไม่ได้อยู่ในเส้นทางอนุมัติของคำขอนี้</div>'
            : (!state.isAdmin && !role.isInvolved && watchForms.includes(req.FormCode)
              ? '<div class="rq-wait">👁 ดูได้อย่างเดียว · ติดตามสถานะตามฝ่าย — คุณไม่ได้อยู่ในเส้นทางอนุมัติของคำขอนี้</div>' : ''))}

        ${requesterActions(req, log)}
        ${isCarRequest(req) ? carManageBox(req, role) : ''}
        ${state.isAdmin && req.Status === 'รออนุมัติ' ? `<div class="rq-owner-act">
          <span>แอดมิน: สถานะแจ้งอนุมัติอัตโนมัติ = <b>${esc(req.PAState || 'ยังไม่ตั้ง')}</b>
          · กดเพื่อคำนวณผู้อนุมัติใหม่และส่งการ์ดลำดับปัจจุบันอีกครั้ง</span>
          <span class="rq-owner-btns"><button class="btn-mini" data-reqresend="${req.id}">↻ ส่งแจ้งอนุมัติใหม่</button></span>
        </div>` : ''}

        <div class="rq-export-row">
          <button class="btn-mini" data-exportreq="${req.id}">⬇ ส่งออกเป็นเอกสาร (PDF)</button>
        </div>
      </div>`,
  });
  // รูปใน SharePoint (ไฟล์แนบ / สลิป) ต้องแนบ token จึงโหลดได้
  import('../services/photos.js').then((m) => m.hydratePhotos(document.getElementById('overlay-root')));
  const formRow = catalog.find((c) => String(c.FormCode || '').trim() === code) || { FormCode: code, Title: req.FormName };
  onClick('exportreq', () => exportRequest(req, steps, answerRows, { fields: withStandard(fields, formRow), data, formRow }));

  if (role.canActNow) { bindActions(req, steps, role, formRow); watchOthers(req); }

  onClick('reqcancel', async () => {
    if (!confirm('ยกเลิกคำขอนี้ใช่หรือไม่ · การยกเลิกถาวร')) return;
    try {
      const { update } = await import('../services/data.js');
      await update('requests', req.id, { Status: 'ยกเลิก', PAState: 'DONE' });
      closeModal();
      const { render: rr } = await import('../core/render.js'); rr();
    } catch (e) { alert('ยกเลิกไม่สำเร็จ — ' + e.message); }
  });

  // จองรถ: คืนรถ / เปลี่ยนรถ / ยกเลิกการจอง
  if (isCarRequest(req)) {
    bindPlatePicker('car-plate');
    const meName = () => state.user?.name || '';
    const after = async () => { closeModal(); const { render: rr } = await import('../core/render.js'); rr(); };
    const carErr = (m) => { const e = $('#car-err'); if (e) { e.textContent = m; e.hidden = !m; } else if (m) alert(m); };
    onClick('carreturn', async (_, btn) => {
      if (!confirm('ยืนยันคืนรถ? ระบบจะบันทึกเวลาคืนเป็นตอนนี้ และปิดคำขอ')) return;
      btn.disabled = true;
      try { await returnCar(req, meName(), ($('#car-ret-note') || {}).value || ''); await after(); }
      catch (e) { btn.disabled = false; alert('คืนรถไม่สำเร็จ — ' + e.message); }
    });
    onClick('carplate', async (_, btn) => {
      const plate = pickedPlate('car-plate');
      if (!plate) { carErr('กรุณาเลือกทะเบียนรถ'); return; }
      if (plate === carData(req).car_plate) { carErr(`ใช้รถ ${plate} อยู่แล้ว`); return; }
      const clash = await plateClash(req, plate);
      if (clash.length && !confirm(`รถ ${plate} ถูกจองช่วงเวลาทับกันอยู่แล้ว\n\n${clash.map((b) => `• ${spanText(b)} ${b.by} (${b.req.Title})`).join('\n')}\n\nยืนยันเปลี่ยนเป็นรถคันนี้หรือไม่`)) return;
      btn.disabled = true;
      try { await changePlate(req, meName(), plate, ($('#car-mg-note') || {}).value || ''); await after(); }
      catch (e) { btn.disabled = false; carErr('บันทึกไม่สำเร็จ — ' + e.message); }
    });
    onClick('carcancel', async (_, btn) => {
      const why = (($('#car-mg-note') || {}).value || '').trim();
      if (!why) { carErr('กรุณาพิมพ์เหตุผลก่อนยกเลิกการจอง'); $('#car-mg-note').focus(); return; }
      if (!confirm(`ยืนยันยกเลิกการจองรถ ${req.Title}?\n\nเหตุผล: ${why}`)) return;
      btn.disabled = true;
      try { await cancelCar(req, meName(), why); await after(); }
      catch (e) { btn.disabled = false; carErr('ยกเลิกไม่สำเร็จ — ' + e.message); }
    });
  }

  onClick('reqresend', async () => {
    try {
      const { update } = await import('../services/data.js');
      // ลำดับปัจจุบันผ่านครบแล้วแต่ไม่ได้เลื่อน → เลื่อนไปลำดับถัดไปก่อน
      const { stalledAdvance } = await import('../services/requests.js');
      const adv = await stalledAdvance(req, steps).catch(() => null);
      if (adv) {
        await update('requests', req.id, adv.fields);
        alert(adv.step ? `เลื่อนไปลำดับ ${adv.step} แล้ว · ส่งแจ้งผู้อนุมัติ: ${adv.fields.CurrentApprovers || '(ไม่พบอีเมล)'}`
          : 'ลำดับสุดท้ายอนุมัติครบแล้ว → ปิดคำขอเป็น "อนุมัติแล้ว"');
        setState({});
        return;
      }
      const { route, missing } = await buildRoute(req);
      let f = flowFieldsFor(route, +req.CurrentStep || (route[0] && route[0].step) || 1);
      // ลำดับปัจจุบันไม่อยู่ในเส้นทางแล้ว (ไม่บังคับ/ไม่เข้าเงื่อนไข) → เลื่อนไปลำดับถัดไปที่มีผู้อนุมัติ
      let why = '';
      if (f.PAState === 'NOAPPROVER') {
        const { diagnoseRoute } = await import('../services/requests.js');
        const d = await diagnoseRoute(req).catch(() => null);
        if (d && d.ok) f = d.fields;
        else if (d) why = d.reason;
      }
      await update('requests', req.id, f);
      alert(String(f.PAState).startsWith('PENDING')
        ? 'ส่งแจ้งแล้ว ผู้อนุมัติ: ' + f.CurrentApprovers
        : 'ยังส่งไม่ได้ — ไม่พบอีเมลผู้อนุมัติของลำดับนี้'
          + (why ? '\nสาเหตุ: ' + why : '')
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
    ${img ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="เปิดรูปขนาดเต็ม"><img data-photo="${esc(s.url)}" alt="สลิป"></a>`
      : `<a class="doc-file" href="${esc(s.url)}" target="_blank" rel="noopener">📄 ${esc(s.name)}</a>`}</div>`;
}

/** ขั้นฝ่ายจัดซื้อของใบขอสั่งซื้อ: เลือกสถานะงานจัดซื้อแทนปุ่มอนุมัติ · "ส่งของแล้ว" = ปิดคำขอ */
function purchaseBox(req, role) {
  const nowSt = purchaseStatusOf(req);
  const cur = role.actStep || +req.CurrentStep || 1;
  const early = cur !== (+req.CurrentStep || 1);
  const signed = parseLog(req.ApprovalLog).some((l) => l.step === cur && l.action === PURCHASE_ACTION && l.sig);
  const pv = prValues(req);
  return `
    <div class="rq-action rq-purchase">
      <h4>📦 อัปเดตสถานะงานจัดซื้อ${nowSt ? ` <span class="rq-pstatus${nowSt === PURCHASE_CANCEL ? ' bad' : ''}">ปัจจุบัน: ${esc(nowSt)}</span>` : ''}</h4>
      ${early ? '<div class="rq-wait">ตอนนี้รอขั้นที่ไม่บังคับ (เช่น ผู้อำนวยการโครงการ) — ฝ่ายจัดซื้อเริ่มอัปเดตสถานะได้เลย เมื่อบันทึก ระบบจะข้ามขั้นนั้นให้</div>' : ''}
      <div class="rq-prno">
        <div><label class="rq-note-label" for="rq-prno">PR No. <span class="dim">(ระบบออกให้อัตโนมัติตอนยื่น · แก้ได้ · ห้ามซ้ำ)</span></label>
          <input id="rq-prno" type="text" maxlength="40" autocomplete="off" value="${esc(pv.pr_no || '')}" placeholder="เช่น PR2610175"></div>
        <div><label class="rq-note-label" for="rq-prdate">วันที่ออก PR</label>
          <input id="rq-prdate" type="date" value="${esc(String(pv.pr_date || '').slice(0, 10) || todayISO())}"></div>
      </div>
      <label class="rq-note-label" for="rq-pstat">สถานะ</label>
      <select id="rq-pstat" class="rq-pselect">
        ${PURCHASE_STATUSES.map((x) => `<option ${x === (nowSt || '-') ? 'selected' : ''}>${esc(x)}</option>`).join('')}
      </select>
      <label class="rq-note-label" for="rq-note">หมายเหตุ <span class="dim">(ไม่บังคับ เช่น เลขที่ PO / ผู้ขาย)</span></label>
      <textarea id="rq-note" rows="2" placeholder="รายละเอียดเพิ่มเติม"></textarea>
      ${signed ? '' : `<details class="rq-sign" open>
        <summary><b>✍ ลายเซ็นฝ่ายจัดซื้อ</b> <b class="req">*</b>
          <span class="dim">— เซ็นครั้งแรกครั้งเดียว ลงช่องฝ่ายจัดซื้อในใบขอสั่งซื้อ</span></summary>
        ${signaturePad('approver', '', true)}
      </details>`}
      <div class="field-error" id="rq-err" hidden></div>
      <div class="rq-buttons">
        <span class="dim">เลือก "${PURCHASE_DONE}" = ปิดคำขอ (เสร็จสิ้น) · "${PURCHASE_CANCEL}" = ปิดคำขอ (ยกเลิก)</span>
        <button class="btn btn-primary" id="rq-psave">💾 บันทึกสถานะ</button>
      </div>
    </div>`;
}

/* ───── จองรถยนต์บริษัทฯ ───── */
/** เลือกทะเบียนรถ (รายการจากตั้งค่าระบบ CarPlates) + กรอกเองได้ เผื่อยืมรถฝ่ายอื่น */
function platePicker(plates, cur = '', id = 'rq-plate') {
  const known = plates.includes(cur);
  return `<div class="rq-car-pick">
    <label class="rq-note-label" for="${id}">🚗 ทะเบียนรถที่ให้ใช้ <b class="req">*</b> <span class="dim">— ต้องเลือกก่อนกดอนุมัติ</span></label>
    <div class="rq-car-row">
      <select id="${id}" class="rq-pselect">
        <option value="">— เลือกรถ —</option>
        ${plates.map((p) => `<option ${p === cur ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        <option value="__other" ${cur && !known ? 'selected' : ''}>อื่น ๆ (กรอกทะเบียนเอง เช่น ยืมรถฝ่ายอื่น)</option>
      </select>
      <input id="${id}-other" type="text" placeholder="พิมพ์ทะเบียนรถ เช่น 7 กข 1234 (ฝ่ายขาย)" value="${cur && !known ? esc(cur) : ''}"
        ${cur && !known ? '' : 'hidden'} autocomplete="off">
    </div>
  </div>`;
}
const pickedPlate = (id = 'rq-plate') => {
  const sel = $('#' + id);
  if (!sel) return null;
  return sel.value === '__other' ? ($('#' + id + '-other').value || '').trim() : sel.value.trim();
};
const bindPlatePicker = (id = 'rq-plate') => {
  const sel = $('#' + id); const other = $('#' + id + '-other');
  if (sel && other) sel.onchange = () => { other.hidden = sel.value !== '__other'; if (!other.hidden) other.focus(); };
};

/** หลังอนุมัติ: เปลี่ยนรถ / ยกเลิกการจอง / คืนรถ ต่อท้ายเส้นทางอนุมัติ */
function carTimeline(log) {
  const acts = log.filter((l) => l.step === 999 && ['คืนรถ', 'เปลี่ยนรถ', 'ยกเลิก'].includes(l.action));
  if (!acts.length) return '';
  return `<div class="tl-step tl-ok"><div class="tl-dot"></div><div class="tl-body">
    <div class="tl-name">🚗 การใช้รถ</div>
    ${acts.map((a) => `<div class="tl-act ${a.action === 'ยกเลิก' ? 'bad' : 'buy'}">
      <b>${esc(a.action)}</b> · ${esc(a.by)}<br><span class="tl-when">${esc(thaiDateTime(a.at))}</span>
      ${a.note ? `<div class="tl-note tl-note-buy">${esc(a.note)}</div>` : ''}</div>`).join('')}
  </div></div>`;
}

/** บรรทัดสรุปบนหัวรายละเอียดคำขอ: ช่วงเวลา · ทะเบียนรถ · คืนรถ */
function carLine(req) {
  const d = carData(req);
  const sp = spanOf(d);
  const link = mapLink(d[CAR_PLACE]);
  return `<span class="rq-prline rq-carline">🚗 ${sp ? esc(spanText(sp)) : ''}${
    d.car_plate ? ` · ทะเบียน <b>${esc(d.car_plate)}</b>` : ' · <span class="dim">ยังไม่ได้กำหนดรถ</span>'}${
    d.car_returned_at ? ` · <b class="rq-returned">คืนรถแล้ว ${esc(thaiDateTime(d.car_returned_at))}</b>` : ''}${
    link ? ` · <a href="${esc(link)}" target="_blank" rel="noopener">🗺 แผนที่</a>` : ''}</span>`;
}

/**
 * หลังอนุมัติ (ยังไม่คืนรถ):
 *   ผู้ยื่น และผู้อนุมัติในเส้นทาง/แอดมิน → ปุ่มคืนรถ (ผู้ดูแลกดแทนได้เมื่อรถกลับมาแล้ว)
 *   ผู้อนุมัติในเส้นทาง/แอดมิน → เปลี่ยนรถ หรือยกเลิกการจอง ได้ทุกเมื่อ
 */
function carManageBox(req, role) {
  const d = carData(req);
  if (req.Status !== 'อนุมัติแล้ว' || d.car_returned_at) return '';
  const mine = req.RequesterEmail && req.RequesterEmail.toLowerCase() === String(state.user?.email).toLowerCase();
  const manager = role.isInvolved || state.isAdmin;
  if (!mine && !manager) return '';
  return `<div class="rq-action rq-car-box">
    ${mine || manager ? `<div class="rq-car-return">
      <h4>🔑 คืนรถ${mine ? '' : ' <span class="dim">(ผู้ดูแลกดแทนผู้ยื่น)</span>'}</h4>
      <p class="dim">${mine ? 'ใช้งานเสร็จแล้ว กดคืนรถ' : `เมื่อ ${esc(carData(req).car_user || req.RequesterName || 'ผู้ยื่น')} นำรถมาคืนแล้ว กดคืนรถแทนได้`} ระบบบันทึกวันเวลาที่คืนและปิดคำขอ · รถจะว่างให้คนอื่นจองทันที</p>
      <input id="car-ret-note" type="text" placeholder="หมายเหตุ (ไม่บังคับ) เช่น เลขไมล์ / น้ำมันคงเหลือ / จุดจอด" autocomplete="off">
      <div class="rq-buttons"><button class="btn btn-primary" data-carreturn="1">🔑 คืนรถ</button></div>
    </div>` : ''}
    ${manager ? `<div class="rq-car-manage">
      <h4>🚗 จัดการการจองรถ <span class="dim">(ผู้อนุมัติ)</span></h4>
      ${platePicker(role.carPlates || [], d.car_plate, 'car-plate')}
      <input id="car-mg-note" type="text" placeholder="หมายเหตุ / เหตุผล (จำเป็นเมื่อยกเลิก)" autocomplete="off">
      <div class="field-error" id="car-err" hidden></div>
      <div class="rq-buttons">
        <button class="btn-mini danger" data-carcancel="1">✗ ยกเลิกการจอง</button>
        <button class="btn btn-primary" data-carplate="1">💾 บันทึกการเปลี่ยนรถ</button>
      </div>
    </div>` : ''}
  </div>`;
}

function actionBox(req, role) {
  if (role.isPurchasing) return purchaseBox(req, role);
  return `
    <div class="rq-action">
      <h4>${role.isFinalStep ? 'ขั้นสุดท้าย — กดอนุมัติแล้วแนบสลิปการโอนเงิน' : 'ดำเนินการ'}</h4>
      <label class="rq-note-label" for="rq-note">เหตุผล / ความเห็น
        <span class="dim">(จำเป็นเมื่อกด ส่งกลับแก้ไข หรือ ไม่อนุมัติ)</span></label>
      <textarea id="rq-note" rows="3" placeholder="พิมพ์เหตุผลหรือความเห็นประกอบการพิจารณา"></textarea>
      ${isCarRequest(req) && role.isLastStep ? platePicker(role.carPlates, carData(req).car_plate, 'rq-plate') : ''}
      ${role.wantsSign ? `<details class="rq-sign"${isWelfareRoom({ Title: req.FormName }) || isPR(req.FormCode) ? ' open' : ''}>
        <summary><b>✍ ลายเซ็นผู้อนุมัติ</b>${isPR(req.FormCode)
          ? ' <b class="req">*</b> <span class="dim">— จำเป็น: วาดหรืออัปโหลดลายเซ็นก่อนกดอนุมัติ ลงช่องของขั้นนี้ในใบขอสั่งซื้อ</span>'
          : ' <span class="dim">— ใส่ในเอกสารที่ส่งออก (ไม่เซ็นใหม่ใช้ลายเซ็นในทะเบียน)</span>'}</summary>
        ${signaturePad('approver', '', true)}
      </details>` : ''}
      <div class="field-error" id="rq-err" hidden></div>
      <div class="rq-buttons">
        <button class="btn-mini danger" id="rq-reject">✗ ไม่อนุมัติ</button>
        <button class="btn-mini warn" id="rq-sendback">↩ ส่งกลับแก้ไข</button>
        ${role.canSkip ? '<button class="btn-mini" id="rq-skip" title="ลำดับนี้ไม่บังคับ — ข้ามไปลำดับถัดไปโดยไม่ลงนาม">⏭ ข้ามขั้นนี้</button>' : ''}
        ${role.isFinalStep
          ? '<button class="btn btn-primary" id="rq-finish">✓ อนุมัติ (แนบสลิปโอนเงิน)</button>'
          : '<button class="btn btn-primary" id="rq-approve">✓ อนุมัติ</button>'}
      </div>
    </div>`;
}

/**
 * ระหว่างเปิดหน้าต่างค้างไว้ ตรวจทุก 15 วินาทีว่ามีคนอื่นดำเนินการไปก่อนไหม
 * (เช่นผู้อนุมัติอีกคนในลำดับเดียวกันกดในเว็บ/Teams/อีเมล) ถ้ามี เอาปุ่มออกแล้วแจ้งว่าใครทำไปแล้ว
 */
function watchOthers(req) {
  const sig = (r) => `${r.Status}|${+r.CurrentStep || 1}|${parseLog(r.ApprovalLog).length}`;
  const before = sig(req);
  const mine = document.querySelector('.rq-action');            // กล่องของหน้าต่างนี้เท่านั้น
  const timer = setInterval(async () => {
    const box = mine && mine.isConnected ? mine : null;
    if (!box) { clearInterval(timer); return; }                 // ปิดหน้าต่างนี้แล้ว (หรือเปิดใบใหม่แทน)
    if (box.querySelector('button:disabled')) return;           // ผู้ใช้กำลังบันทึกเอง
    let now;
    try { now = await get('requests', req.id); } catch (e) { return; }
    if (!now || sig(now) === before) return;
    clearInterval(timer);
    clearDataCache('requests');
    refreshBadges({ force: true });
    const last = parseLog(now.ApprovalLog).slice(-1)[0];
    box.outerHTML = `<div class="rq-wait rq-acted">
      ⚠ <b>${esc(last ? last.by || 'มีผู้ใช้' : 'มีผู้ใช้')}</b> ${esc(last ? last.action : 'ดำเนินการ')}ไปแล้ว${
        last && last.at ? ` เมื่อ ${esc(thaiDateTime(last.at))}` : ''}
      · สถานะล่าสุด: <b>${esc(now.Status || '-')}</b><br>
      คุณไม่ต้องดำเนินการในลำดับนี้ <button class="btn-mini" id="rq-reload">↻ เปิดดูสถานะล่าสุด</button></div>`;
    const btn = document.getElementById('rq-reload');
    if (btn) btn.onclick = async () => {
      closeModal();
      const { render: rerender } = await import('../core/render.js');
      await rerender();
      openRequest({ ...req, ...now, FormCode: formCodeOf({ ...req, ...now }) });
    };
  }, 15000);
}

let pendingSlip = null;

function bindActions(req, steps, role, formRow = { FormCode: req.FormCode, Title: req.FormName }) {
  pendingSlip = null;
  const signFolder = formFolder(formRow, 'ลายเซ็น');
  if (role.wantsSign || role.isPurchasing) bindSignaturePads(signFolder);
  const err = $('#rq-err');
  const fail = (m) => { err.textContent = m; err.hidden = false; };

  const note = () => $('#rq-note').value.trim();
  // ใบขอสั่งซื้อ: ทุกขั้นต้องวาด/อัปโหลดลายเซ็นก่อนอนุมัติ (ข้ามขั้น/ส่งกลับ/ไม่อนุมัติ ไม่ต้องเซ็น)
  const signedNow = () => {
    if (!isPR(req.FormCode) || !role.wantsSign || previewSignature('approver')) return true;
    fail('กรุณาลงลายเซ็นก่อนกดอนุมัติ — ลากเมาส์/นิ้วเซ็นในกรอบ "ลายเซ็นผู้อนุมัติ" หรือกด "อัปโหลดรูป"');
    const pad = $('.sig-pad[data-sig="approver"]');
    if (pad) pad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  };
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
    if (action === 'อนุมัติ' && !signedNow()) return;
    // จองรถ: ผู้อนุมัติขั้นสุดท้ายต้องเลือกทะเบียนรถก่อน · รถคันเดียวกันถูกจองช่วงเวลาทับกัน → ถามยืนยัน
    const plate = action === 'อนุมัติ' ? pickedPlate() : null;
    if (plate === '') { fail('กรุณาเลือกทะเบียนรถก่อนกดอนุมัติ (หรือเลือก "อื่น ๆ" แล้วพิมพ์ทะเบียน)'); $('#rq-plate').focus(); return; }
    if (plate) {
      const clash = await plateClash(req, plate);
      if (clash.length && !confirm(`รถ ${plate} ถูกจองช่วงเวลาทับกันอยู่แล้ว\n\n${clash.map((b) => `• ${spanText(b)} ${b.by} (${b.req.Title})`).join('\n')}\n\nยืนยันใช้รถคันนี้หรือไม่`)) return;
    }
    if (action === 'ไม่อนุมัติ' && !confirm('ยืนยันไม่อนุมัติคำขอนี้? คำขอจะสิ้นสุดทันที')) return;
    if (action === 'ส่งกลับแก้ไข' && !confirm('ส่งกลับให้ผู้ยื่นแก้ไข? เมื่อยื่นใหม่จะเริ่มอนุมัติตั้งแต่ลำดับแรก')) return;
    busy(true);
    try {
      const sig = action === 'อนุมัติ' && role.wantsSign ? await readSignature('approver', signFolder) : '';
      // ใบขอสั่งซื้อ: อัปโหลดลายเซ็นไม่สำเร็จ = ห้ามอนุมัติ
      if (action === 'อนุมัติ' && isPR(req.FormCode) && role.wantsSign && !sig) {
        busy(false); fail('บันทึกลายเซ็นไม่สำเร็จ กรุณาเซ็นหรืออัปโหลดลายเซ็นใหม่ แล้วกดอนุมัติอีกครั้ง'); return;
      }
      await decide(req, steps, { action, by: me, note: plate ? [note(), `🚗 ${plate}`].filter(Boolean).join(' — ') : note(),
        slip: pendingSlip, sig, formPatch: plate ? { car_plate: plate } : null });
      await done();
    } catch (e) {
      busy(false);
      if (e.name === 'AlreadyActedError') { fail('⚠ ' + e.message); refreshLater(); }
      else fail('บันทึกไม่สำเร็จ — ' + e.message);
    }
  };

  bindPlatePicker('rq-plate');
  const ap = $('#rq-approve'); if (ap) ap.onclick = () => run('อนุมัติ');
  const rj = $('#rq-reject'); if (rj) rj.onclick = () => run('ไม่อนุมัติ');
  const sb = $('#rq-sendback'); if (sb) sb.onclick = () => run('ส่งกลับแก้ไข');
  // ฝ่ายจัดซื้อ: บันทึกสถานะ (ครั้งแรกต้องเซ็น) · "ส่งของแล้ว" ต้องยืนยันก่อนปิดคำขอ
  const ps = $('#rq-psave'); if (ps) ps.onclick = async () => {
    err.hidden = true;
    const st = $('#rq-pstat').value;
    const pv = prValues(req);
    const prNo = $('#rq-prno').value.trim();
    const prDate = prNo ? ($('#rq-prdate').value || todayISO()) : '';
    const prChanged = normPR(prNo) !== normPR(pv.pr_no) || (prNo && prDate !== String(pv.pr_date || '').slice(0, 10));
    const curSt = purchaseStatusOf(req);
    const stChanged = !!st && st !== '-' && st !== curSt;
    if (!stChanged && !prChanged && !note()) {
      fail(curSt ? `สถานะเป็น "${curSt}" อยู่แล้ว — เปลี่ยนสถานะ เลข PR หรือพิมพ์หมายเหตุ` : 'กรุณาเลือกสถานะ หรือกรอกเลข PR');
      return;
    }
    if (pv.pr_no && !prNo && !confirm(`ลบเลข PR "${pv.pr_no}" ออกจากใบขอสั่งซื้อนี้?`)) return;
    const needSign = !!document.querySelector('.sig-pad[data-sig="approver"]');
    if (needSign && !previewSignature('approver')) {
      fail('กรุณาลงลายเซ็นฝ่ายจัดซื้อก่อนบันทึกครั้งแรก — ลากเมาส์/นิ้วเซ็นในกรอบ หรือกด "อัปโหลดรูป"');
      return;
    }
    if (st === PURCHASE_CANCEL && !note()) {
      fail('กรุณาพิมพ์เหตุผลในช่องหมายเหตุก่อนเลือก "Cancel"');
      $('#rq-note').focus();
      return;
    }
    if (st === PURCHASE_CANCEL && !confirm(
      `ยืนยันยกเลิกใบขอสั่งซื้อ ${req.Title}?\n\nเหตุผล: ${note()}\nเมื่อยืนยัน คำขอนี้จะถูกปิด (ยกเลิก) และแก้สถานะไม่ได้อีก`)) return;
    if (st === PURCHASE_DONE && !confirm(
      `ยืนยัน "${PURCHASE_DONE}"?\n\nตรวจสอบแล้วว่าส่งของครบถ้วนตามใบขอสั่งซื้อ ${req.Title}\nเมื่อยืนยัน คำขอนี้จะถูกปิด (เสร็จสิ้น) และแก้สถานะไม่ได้อีก`)) return;
    busy(true); ps.disabled = true;
    try {
      // กันเลข PR ซ้ำ: อ่านทะเบียนสดก่อนบันทึก ซ้ำแล้วไม่บันทึก พร้อมบอกว่าซ้ำกับใบไหน
      if (prNo && normPR(prNo) !== normPR(pv.pr_no)) {
        const dup = await findDuplicatePR(prNo, req.id);
        if (dup) {
          busy(false); ps.disabled = false;
          fail(duplicateMessage(prNo, dup));
          alert(duplicateMessage(prNo, dup) + '\n\nกรุณาตรวจสอบและใช้เลข PR อื่น');
          $('#rq-prno').focus();
          return;
        }
      }
      const sig = needSign ? await readSignature('approver', signFolder) : '';
      if (needSign && !sig) { busy(false); ps.disabled = false; fail('บันทึกลายเซ็นไม่สำเร็จ กรุณาเซ็นหรืออัปโหลดลายเซ็นใหม่'); return; }
      const extra = note();
      const parts = [stChanged || (!prChanged && st && st !== '-') ? st : '',
        prChanged ? (prNo ? `PR No. ${prNo} (ออก ${thaiNumDate(prDate)})` : 'ลบเลข PR') : '', extra].filter(Boolean);
      await decide(req, steps, { action: PURCHASE_ACTION, by: me, note: parts.join(' — '), sig, actStep: role.actStep,
        formPatch: prChanged ? { pr_no: prNo, pr_date: prDate } : null });
      await done();
    } catch (e) {
      busy(false); ps.disabled = false;
      if (e.name === 'AlreadyActedError') { fail('⚠ ' + e.message); refreshLater(); }
      else fail('บันทึกไม่สำเร็จ — ' + e.message);
    }
  };
  const sk = $('#rq-skip'); if (sk) sk.onclick = () => {
    if (confirm('ข้ามลำดับนี้ไปลำดับถัดไป โดยไม่ลงนามในช่องนี้?')) run('ข้าม');
  };
  // ขั้นสุดท้าย (บัญชีการเงิน): กดอนุมัติ → หน้าต่างแนบสลิปเด้งขึ้น (เลือกไฟล์ / ลากวาง / Ctrl+V)
  const fn = $('#rq-finish'); if (fn) fn.onclick = async () => {
    err.hidden = true;
    if (!signedNow()) return;
    const { pickSlip } = await import('../components/slip-dialog.js');
    pendingSlip = await pickSlip({ folder: formFolder(formRow, 'สลิปโอนเงิน') });
    if (!pendingSlip) return;               // ยกเลิก = ยังไม่อนุมัติ
    busy(true);
    // ขอสิทธิ์ Teams ทันทีหลังกดยืนยัน (ครั้งแรกอาจเด้งหน้าต่างขอสิทธิ์ ต้องอยู่ใกล้การกดปุ่ม ไม่งั้นเบราว์เซอร์บล็อก)
    const teams = await import('../services/teams-notify.js');
    const tokenP = teams.teamsToken().catch((e) => e);
    try {
      const sig = role.wantsSign ? await readSignature('approver', signFolder) : '';
      const msg = note();
      await decide(req, steps, { action: 'อนุมัติ', by: me, note: msg, sig, slip: pendingSlip, closeAfter: true });
      // แจ้งผู้ยื่นทาง Teams พร้อมรูปสลิป — ไม่สำเร็จก็ไม่กระทบการอนุมัติที่บันทึกแล้ว
      const { toast } = await import('../components/toast.js');
      try {
        const token = await tokenP;
        if (token instanceof Error) throw token;
        const r = await teams.notifySlipPaid({ req, slip: pendingSlip, by: me, note: msg, token });
        if (r.sent) toast(`✓ แจ้ง ${req.RequesterName || 'ผู้ยื่น'} ทาง Teams พร้อมสลิปแล้ว`);
      } catch (e) {
        toast(`อนุมัติและปิดงานแล้ว แต่แจ้งทาง Teams ไม่สำเร็จ — ${e.message}`, 'bad');
      }
      await done();
    } catch (e) {
      busy(false);
      if (e.name === 'AlreadyActedError') { fail('⚠ ' + e.message); refreshLater(); }
      else fail('บันทึกไม่สำเร็จ — ' + e.message);
    }
  };
}

/** ส่งออกคำขอเป็นเอกสาร A4 พร้อมหัวกระดาษ ข้อมูล และบล็อกอนุมัติจากระบบ */
async function exportRequest(req, steps, answerRows, doc = {}) {
  const log = parseLog(req.ApprovalLog);
  const dir = await list('directory').catch(() => []);
  const sigOf = (name) => (dir.find((p) => p.Title === name) || {}).SignatureUrl || '';

  // ฟอร์มที่มีแม่แบบเอกสารเฉพาะ ใช้หน้าตาตามต้นฉบับ ISO แทนเอกสารทั่วไป
  if (isPR(req.FormCode)) {
    let values = {};
    try { values = JSON.parse(req.FormData || '{}'); } catch (e) { values = {}; }
    const em = String(req.RequesterEmail || '').toLowerCase();
    const who = dir.find((p) => String(p.Email || '').toLowerCase() === em)
      || dir.find((p) => p.Title === req.RequesterName) || {};
    const reqName = who.Title || req.RequesterName || '';
    const html = renderPR({
      values,
      requester: { name: reqName, dept: req.RequesterDept || who.Department || '', position: who.Position || '' },
      submitted: req.SubmittedDate,
      prNo: req.PRNo || '',
      sign: { requester: { name: reqName, sig: (values._requesterSign && values._requesterSign.url) || who.SignatureUrl || '' },
        ...mapSignatures(steps, log, sigOf) },
    });
    return openPRWindow(html, `ใบขอสั่งซื้อ — ${req.Title}`);
  }

  // เอกสารทั่วไป: หน้าตาเหมือนหน้ากรอกฟอร์ม · ผู้อนุมัติมาจากบันทึกจริง
  const { fields = [], data = {}, formRow = {} } = doc;
  const em = String(req.RequesterEmail || '').toLowerCase();
  const who = dir.find((p) => String(p.Email || '').toLowerCase() === em)
    || dir.find((p) => p.Title === req.RequesterName) || {};
  const isRequester = !!em && em === String(state.user?.email || '').toLowerCase();
  const requester = () => {
    const saved = data._requesterSign || null;   // อ่านใหม่ทุกครั้ง เผื่อเพิ่งเซ็นในหน้านี้
    return {
      name: (saved && saved.name) || who.Title || req.RequesterName || '',
      sig: (saved && saved.url) || who.SignatureUrl || '',
      at: (saved && saved.at) || req.SubmittedDate,
    };
  };
  const last = steps.length ? Math.max(...steps.map((st) => +st.StepOrder)) : 0;
  // คำนวณใหม่ทุกครั้งที่วาดเอกสาร — หลังกด "ใส่ลายเซ็นนี้ในเอกสาร" ลายเซ็นใหม่จึงขึ้นทันที
  const approvals = () => steps.map((st) => {
    const n = +st.StepOrder;
    const act = log.filter((l) => l.step === n).slice(-1)[0];
    const role = st.StepName || 'ลำดับ ' + n;
    if (!act) return { role, name: '', wait: 'รออนุมัติ' };   // ชื่อขึ้นเมื่อมีคนกดอนุมัติแล้วเท่านั้น
    const own = n === last && act.action === 'อนุมัติ' && data._approverSign && data._approverSign.url;
    return {
      role, name: act.by, note: act.note, at: act.at,
      sig: act.action === 'อนุมัติ' ? (own ? data._approverSign.url : (act.sig || sigOf(act.by))) : '',
      result: act.action === 'อนุมัติ' ? '✓ อนุมัติ' : act.action === 'ส่งกลับแก้ไข' ? '↩ ส่งกลับแก้ไข' : '✗ ไม่อนุมัติ',
    };
  });
  // ผู้อนุมัติขั้นสุดท้าย: ลายเซ็นขึ้นเมื่อขั้นนั้นอนุมัติแล้วเท่านั้น
  // หลังเสร็จสิ้น ผู้อนุมัติคนนั้นเซ็นเพิ่ม/เปลี่ยนได้จากหน้านี้ (เก็บใน _approverSign)
  const lastAct = log.filter((l) => l.step === last && l.action === 'อนุมัติ').slice(-1)[0];
  const lastStep = steps.find((st) => +st.StepOrder === last) || {};
  const finalSign = () => (data._approverSign && data._approverSign.url ? data._approverSign
    : lastAct ? { name: lastAct.by, sig: lastAct.sig || sigOf(lastAct.by) } : null);
  const finished = !!lastAct || ['อนุมัติแล้ว', 'เสร็จสิ้น'].includes(String(req.Status || '').trim());
  const myName = (findMe(dir) || {}).Title
    || state.user?.name || '';
  const isFinalApprover = finished && !!myName
    && ((lastAct && lastAct.by === myName) || (lastStep._resolved || []).includes(myName));
  const docHtml = () => renderFormDoc({
    form: { ...formRow, Title: formRow.Title || req.FormName }, fields, values: data,
    docNo: req.Title, submitted: req.SubmittedDate, requester: requester(), approvals: approvals(),
    empCode: who.EmployeeCode || data.std_emp_code || '', position: who.Position || '', dept: who.Department || req.RequesterDept || '',
    finalSign: finalSign(),
  });

  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="ex-mask">
      <div class="modal modal-wide">
        <div class="modal-head">ส่งออกเอกสาร — ${esc(req.Title)}
          <button id="ex-close">✕</button></div>
        <div class="modal-body">
          ${isRequester ? `<details class="panel fd-sign-panel"${requester().sig ? '' : ' open'}>
            <summary><b>✍ ลายเซ็นผู้ยื่น</b> <span class="dim">— ${requester().sig ? 'เปลี่ยนลายเซ็นในเอกสาร' : 'ยังไม่มีลายเซ็น ลากเมาส์เซ็นหรืออัปโหลดรูป'}</span></summary>
            ${signaturePad('requester', '', true)}
            <button class="btn-mini" id="ex-sign-save">ใส่ลายเซ็นนี้ในเอกสาร</button>
            <span class="dim" id="ex-sign-msg"></span>
          </details>` : ''}
          ${isFinalApprover ? `<details class="panel fd-sign-panel"${finalSign() && finalSign().sig ? '' : ' open'}>
            <summary><b>✍ ลายเซ็นผู้อนุมัติ</b> <span class="dim">— ${finalSign() && finalSign().sig ? 'เปลี่ยนลายเซ็นในเอกสาร' : 'ลากเมาส์เซ็นหรืออัปโหลดรูป'}</span></summary>
            ${signaturePad('approver', '', true)}
            <button class="btn-mini" id="ex-asign-save">ใส่ลายเซ็นนี้ในเอกสาร</button>
            <span class="dim" id="ex-asign-msg"></span>
          </details>` : ''}
          <div id="ex-doc">${docHtml()}</div>
        </div>
        <div class="modal-foot">
          <button class="btn-mini" id="ex-cancel">ปิด</button>
          <button class="btn btn-primary" id="ex-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;
  const { hydratePhotos } = await import('../services/photos.js');
  hydratePhotos(win);

  const close = () => { win.innerHTML = ''; };
  document.getElementById('ex-close').onclick = close;
  document.getElementById('ex-cancel').onclick = close;
  document.getElementById('ex-mask').onclick = (e) => { if (e.target.id === 'ex-mask') close(); };
  // แจ้งผลทางกฎหมายของเอกสารอิเล็กทรอนิกส์ก่อนพิมพ์ทุกครั้ง
  document.getElementById('ex-print').onclick = () => printWithNotice('printing-doc');

  // ผู้ยื่น / ผู้อนุมัติขั้นสุดท้าย เซ็นเพิ่มหรือเปลี่ยนลายเซ็นตอนส่งออก → บันทึกลงคำขอ แล้ววาดเอกสารใหม่
  const folder = formFolder({ FormCode: req.FormCode, Title: req.FormName, ...formRow }, 'ลายเซ็น');
  if (document.querySelector('.fd-sign-panel')) bindSignaturePads(folder);
  const bindSave = (btnId, msgId, role, key, name) => {
    const signBtn = document.getElementById(btnId);
    if (!signBtn) return;
    signBtn.onclick = async () => {
      const msg = document.getElementById(msgId);
      signBtn.disabled = true;
      try {
        const url = await readSignature(role, folder);
        if (!url) { msg.textContent = 'ยังไม่ได้เซ็นหรืออัปโหลดรูป'; return; }
        const next = { ...data, [key]: { name, url, sig: url, at: new Date().toISOString() } };
        const { update } = await import('../services/data.js');
        await update('requests', req.id, { FormData: JSON.stringify(next) });
        Object.assign(data, next);
        req.FormData = JSON.stringify(next);
        document.getElementById('ex-doc').innerHTML = docHtml();
        hydratePhotos(document.getElementById('ex-doc'));
        msg.textContent = '✓ บันทึกลายเซ็นแล้ว';
      } catch (e) { msg.textContent = 'บันทึกไม่สำเร็จ — ' + e.message; }
      finally { signBtn.disabled = false; }
    };
  };
  bindSave('ex-sign-save', 'ex-sign-msg', 'requester', '_requesterSign', requester().name);
  bindSave('ex-asign-save', 'ex-asign-msg', 'approver', '_approverSign', myName);
}

export function mount(ctx) {
  onClick('tab', (code) => quick({ reviewTab: code }));
  onClick('rqst', (st) => quick({ reviewStatus: st || '' }));
  onClick('rqpst', (st) => quick({ reviewPStatus: st || '' }));
  onClick('rqneed', (k) => quick({ reviewNeed: k || '' }));

  // กล่อง "คำขอของฉัน": ค้นหา (หน่วง 250ms) + เลือกหน้า
  const mq = $('#mine-q');
  if (mq) {
    let t;
    mq.oninput = (e) => {
      const v = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => quick({ mineQuery: v, minePage: 1 }), 250);
    };
  }
  onClick('minepage', (p) => quick({ minePage: +p }));
  const rq = $('#rq-q');
  if (rq) {
    let t;
    rq.oninput = (e) => {
      const v = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => quick({ reviewQuery: v }), 250);
    };
  }

  const showAll = $('#rq-showall');
  if (showAll) showAll.onclick = () => setState({ showAllRequests: true, minePage: 1 });
  const showRecent = $('#rq-showrecent');
  if (showRecent) showRecent.onclick = () => setState({ showAllRequests: false, minePage: 1 });
  onClick('open', (id) => {
    const r = allRequests.find((x) => String(x.id) === String(id));
    if (r) openRequest(r);
  });

  // ลิงก์ตรง #/requests/<id> (จากหน้าค้นหา) — เปิดหน้าต่างคำขอใบนั้นทันที เปิดครั้งเดียวต่อการเข้าลิงก์
  const deep = ctx && ctx.state && ctx.state.params && ctx.state.params.id;
  if (deep && deepOpened !== location.hash) {
    deepOpened = location.hash;
    const r = allRequests.find((x) => String(x.id) === String(deep));
    if (r) openRequest(r);
    else get('requests', deep).then((x) => {
      if (!x) return;
      const mineOk = state.isAdmin || state.isViewer || String(x.RequesterEmail || '').toLowerCase() === String(state.user?.email || '').toLowerCase();
      if (mineOk) openRequest({ ...x, FormCode: formCodeOf(x) });
    }).catch(() => {});
  } else if (!deep) deepOpened = '';
}
let deepOpened = '';
// เปลี่ยนหน้าไปแล้วกลับมาที่ลิงก์เดิม → เปิดคำขอให้อีกครั้ง (กันเปิดซ้ำเฉพาะตอนหน้าเดิมวาดใหม่)
addEventListener('hashchange', () => { if (location.hash !== deepOpened) deepOpened = ''; });
