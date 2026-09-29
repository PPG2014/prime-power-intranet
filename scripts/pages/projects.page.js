import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toArray } from '../admin/entity-form.js';
import { openPerson } from './directory.page.js';
import { hydratePhotos } from '../services/photos.js';
import { toCsv, downloadText } from '../utils/csv.js';
import { printWithNotice } from '../components/eta-notice.js';

export const meta = { route: 'projects', title: 'ความคืบหน้าโครงการ', nav: false, order: 5, adminOnly: false };

const STATUSES = ['เตรียมงาน', 'กำลังดำเนินการ', 'ส่งมอบแล้ว', 'ปิดโครงการ'];
/** ดัชนีสีของสถานะ · รองรับค่าที่ขึ้นต้นด้วย "ปิดโครงการ" ทุกแบบ */
const stIdx = (v) => /^ปิดโครงการ/.test(String(v || '').trim()) ? 3 : STATUSES.indexOf(v);

let projects = [];
let shownRows = [];   // โครงการที่แสดงอยู่ตามตัวกรอง ใช้ตอนส่งออกสรุป
let staff = [];

/** ร้อยละ 0–100 เก็บทศนิยม 2 ตำแหน่ง */
const num = (v) => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100) / 100));
/** แสดงร้อยละเป็นทศนิยม 2 ตำแหน่งเสมอ เช่น 45.50 */
const pct = (v) => num(v).toFixed(2);

/** เหลือกี่วันจากวันที่กำหนด ติดลบแปลว่าเลยแล้ว */
function daysLeft(end) {
  if (!end) return null;
  const d = new Date(end);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

/**
 * ข้อความช่วงเวลาที่เหลือ ปรับตามสถานะโครงการ
 * ปิดโครงการ = ไม่แสดง · ประกันผลงาน = แสดงช่วงประกัน · อื่น ๆ = นับวันตามสัญญา
 * คืน null เมื่อไม่ต้องแสดงช่องนี้เลย
 */
function timeLeftInfo(p) {
  if (p.Status === 'ปิดโครงการ') return null;

  if (p.InWarranty === true || p.InWarranty === 'Yes') {
    const wl = daysLeft(p.WarrantyEnd);
    if (wl !== null) {
      return wl < 0
        ? { text: 'ประกันผลงานสิ้นสุดแล้ว', tone: '' }
        : { text: `ประกันผลงาน · เหลือ ${wl} วัน`, tone: 'warranty' };
    }
    return { text: 'อยู่ระหว่างประกันผลงาน (O&M)', tone: 'warranty' };
  }

  const left = daysLeft(p.EndDate);
  if (left === null) return { text: '—', tone: '' };
  return left < 0
    ? { text: `เลยกำหนด ${-left} วัน`, tone: 'over' }
    : { text: `${left} วัน`, tone: '' };
}

/** ช้ากว่าแผนเท่าไร ใช้ตัดสินสีและข้อความเตือน */
function variance(p) {
  const diff = Math.round((num(p.ActualProgress) - num(p.PlanProgress)) * 100) / 100;
  if (diff >= 0) return { diff, tone: 'ok',   text: diff === 0 ? 'ตรงตามแผน' : `เร็วกว่าแผน ${diff.toFixed(2)}%` };
  if (diff >= -5) return { diff, tone: 'warn', text: `ช้ากว่าแผน ${(-diff).toFixed(2)}%` };
  return { diff, tone: 'bad', text: `ช้ากว่าแผน ${(-diff).toFixed(2)}%` };
}

const bar = (label, value, cls) => `
  <div class="pg-line">
    <div class="pg-label"><span>${esc(label)}</span><b>${pct(value)}%</b></div>
    <div class="pg-track"><div class="pg-fill ${cls}" style="width:${num(value)}%"></div></div>
  </div>`;

function card(p) {
  const plan = num(p.PlanProgress);
  const actual = num(p.ActualProgress);
  const pay = num(p.ActualPayment);
  const v = variance(p);
  const tl = timeLeftInfo(p);

  return `
  <article class="pj-card is-clickable tone-${v.tone}" data-project="${p.id}"
           role="button" tabindex="0" aria-label="ดูรายละเอียด ${esc(p.Title)}">
    <div class="pj-head">
      <div>
        <div class="pj-code">${esc(p.ProjectCode || '')}</div>
        <h3>${esc(p.Title)}</h3>
      </div>
      <span class="pj-status st-${stIdx(p.Status)}">${esc(p.Status || '')}</span>
    </div>

    <div class="pj-facts">
      <div><span>ขนาดติดตั้ง</span><b>${p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') + ' kWp' : '—'}</b></div>
      <div><span>เริ่มโครงการ</span><b>${esc(thaiDateShort(p.StartDate)) || '—'}</b></div>
      <div><span>สิ้นสุดตามสัญญา</span><b>${esc(thaiDateShort(p.EndDate)) || '—'}</b></div>
      ${tl ? `<div><span>เวลาที่เหลือ</span><b class="${tl.tone}">${esc(tl.text)}</b></div>` : ''}
    </div>

    <div class="pj-bars">
      ${bar('ความคืบหน้าตามแผน', plan, 'plan')}
      ${bar('ความคืบหน้าจริง', actual, 'actual')}
      ${bar('เบิกจ่ายแล้ว', pay, 'pay')}
      <div class="pj-var ${v.tone}">${esc(v.text)}</div>
    </div>

    ${p.Detail ? `<div class="pj-detail"><span>ขณะนี้</span>${esc(p.Detail)}</div>` : ''}

    <div class="pj-foot">
      <span>${p.Owner ? '👤 ' + esc(p.Owner) + ' · ' : ''}อัปเดตล่าสุด ${
        esc(thaiDateShort(p.UpdatedDate)) || '—'}</span>
      <span class="pj-actions">
        <button class="btn-mini" data-history="${p.id}">🕓 ประวัติ</button>
        <button class="btn-mini" data-export="${p.id}">⭳ ส่งออก</button>
      </span>
    </div>
  </article>`;
}

/**
 * ส่วนแดชบอร์ดความคืบหน้า แยกออกมาเพื่อให้หน้าแรกเรียกใช้ได้โดยตรง
 * ผู้ใช้จะได้เห็นทันทีหลังเข้าสู่ระบบ ไม่ต้องกดเข้าเมนูอีกชั้น
 */
export async function renderDashboard() {
  const [all, people] = await Promise.all([
    list('projects'),
    // ดึงทะเบียนบุคลากรมาด้วย เพื่อแสดงรูปและตำแหน่งของผู้รับผิดชอบตอนกดดูโครงการ
    list('directory').catch(() => []),
  ]);
  const isClosed = (v) => /^ปิดโครงการ/.test(String(v || '').trim());
  // โครงการที่ปิดแล้วต้องแสดงในตัวกรอง "ปิดโครงการ" เสมอ แม้จะถูกปิดใช้งาน (IsActive=false)
  // เรียงตามลำดับที่จัดไว้ในหน้าจัดการข้อมูล (SortOrder) แล้วตามชื่อ
  // ใช้กติกาเดียวกับหน้าจัดการข้อมูลเป๊ะ ลำดับจึงตรงกันเสมอ
  projects = all
    .slice()
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0))
    .filter((p) => p.IsActive !== false || isClosed(p.Status));
  staff = people;

  const q = (state.projectQuery || '').trim().toLowerCase();
  const st = state.projectStatus || 'ทั้งหมด';

  const matchStatus = (p) => st === 'ทั้งหมด'
    || (st === 'ช้ากว่าแผน' ? variance(p).diff < 0
      : st === 'ปิดโครงการ' ? isClosed(p.Status) : String(p.Status || '').trim() === st);

  const rows = projects.filter((p) =>
    matchStatus(p) &&
    (!q || (p.Title + p.ProjectCode + p.Detail).toLowerCase().includes(q)));
  shownRows = rows;

  const active = projects.filter((p) => p.Status === 'กำลังดำเนินการ');
  const behind = active.filter((p) => variance(p).diff < 0);
  const totalKw = projects.reduce((n, p) => n + (Number(p.Capacity) || 0), 0);

  return `
    <div class="pj-summary">
      <div><b>${projects.length}</b><span>โครงการทั้งหมด</span></div>
      <div><b>${active.length}</b><span>กำลังดำเนินการ</span></div>
      <div class="${behind.length ? 'alert' : ''}"><b>${behind.length}</b><span>ช้ากว่าแผน</span></div>
      <div><b>${Math.round(totalKw).toLocaleString('th-TH')}</b><span>kWp รวม</span></div>
    </div>

    <div class="toolbar">
      <div class="search-box"><span>🔍</span>
        <input id="pj-q" type="search" data-keepfocus value="${esc(state.projectQuery || '')}"
               placeholder="ค้นหาชื่อโครงการ รหัส หรือรายละเอียด" autocomplete="off"></div>
      <span class="toolbar-meta">แสดง ${rows.length} จาก ${projects.length} โครงการ</span>
    </div>

    <div class="pj-tools">
      <button class="btn-mini" id="pj-export-all">⭳ ส่งออกสรุปทุกโครงการ</button>
    </div>

    <div class="chips">
      ${['ทั้งหมด', ...STATUSES, 'ช้ากว่าแผน'].map((x) => {
        const n = x === 'ช้ากว่าแผน' ? projects.filter((p) => variance(p).diff < 0).length : 0;
        return `<button class="chip${x === 'ช้ากว่าแผน' ? ' chip-late' : ''}" data-status="${esc(x)}"
        aria-pressed="${st === x}">${esc(x)}${x === 'ช้ากว่าแผน' ? ` (${n})` : ''}</button>`;
      }).join('')}
    </div>

    ${rows.length
      ? `<div class="pj-grid">${rows.map(card).join('')}</div>`
      : '<div class="panel"><div class="empty">ไม่พบโครงการที่ตรงกับเงื่อนไข</div></div>'}`;
}

export async function render(ctx) {
  return `
  <section class="page page-projects">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ภาพรวมความคืบหน้าของทุกโครงการ เทียบแผนกับผลจริงและยอดเบิกจ่าย</p>
      ${await renderDashboard()}
    </div>
  </section>`;
}

/** หาข้อมูลคนจากทะเบียนบุคลากร เพื่อเอารูปและตำแหน่งมาแสดง */
const findPerson = (name) => staff.find((x) => x.Title === name) || { Title: name };

const personChip = (name, role) => {
  const p = findPerson(name);
  const photo = (cls) => `<div class="${cls}">${p.PhotoUrl
    ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy">`
    : `<span>${esc(String(p.Title || '?').slice(0, 2))}</span>`}</div>`;

  return `
    <div class="pp-chip">
      ${photo('pp-photo')}
      <div class="pp-info">
        <button class="pp-name" data-person-name="${esc(p.Title || '')}"
                title="ดูข้อมูลบุคลากร">${esc(p.Title || '—')}</button>
        <div class="pp-pos">${esc(p.Position || role || '')}</div>
        ${p.Extension ? `<div class="pp-ext">ต่อ ${esc(p.Extension)}</div>` : ''}

        <div class="pp-hover" aria-hidden="true">
          ${photo('pp-hover-photo')}
          <div>
            <div class="pph-name">${esc(p.Title || '—')}${
              p.Nickname ? ` <em>(${esc(p.Nickname)})</em>` : ''}</div>
            ${p.NameEN ? `<div class="pph-en">${esc(p.NameEN)}</div>` : ''}
            <div class="pph-pos">${esc(p.Position || role || '')}</div>
            ${p.Department ? `<div class="pph-row">ฝ่าย · ${esc(p.Department)}</div>` : ''}
            ${p.Section ? `<div class="pph-row">แผนก · ${esc(p.Section)}</div>` : ''}
            ${p.Extension ? `<div class="pph-row">โทรภายใน ${esc(p.Extension)}</div>` : ''}
            ${p.Email ? `<div class="pph-row dim">${esc(p.Email)}</div>` : ''}
            <div class="pph-hint">คลิกที่ชื่อเพื่อดูข้อมูลเต็ม</div>
          </div>
        </div>
      </div>
      ${p.Email ? `<a class="pp-mail" href="mailto:${esc(p.Email)}" title="${esc(p.Email)}">✉</a>` : ''}
    </div>`;
};

/** หน้าต่างรายละเอียดโครงการแบบขยาย */
function openProject(p) {
  const plan = num(p.PlanProgress), actual = num(p.ActualProgress), pay = num(p.ActualPayment);
  const v = variance(p);
  const tl = timeLeftInfo(p);

  const fact = (label, value, cls = '') => `
    <div class="pv-row"><span>${esc(label)}</span><b class="${cls}">${value}</b></div>`;

  openModal({
    title: p.Title,
    wide: true,
    body: `
      <div class="pj-view">
        <div class="pv-top">
          <div>
            <div class="pj-code">${esc(p.ProjectCode || '')}</div>
            <h3>${esc(p.Title)}</h3>
          </div>
          <span class="pj-status st-${stIdx(p.Status)}">${esc(p.Status || '')}</span>
        </div>

        <div class="pv-cols">
          <div class="pv-table">
            ${fact('ขนาดติดตั้ง', p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') + ' kWp' : '—')}
            ${fact('ฝ่ายเจ้าของ', esc(p.Department || '—'))}
            ${fact('เริ่มโครงการ', esc(thaiDateShort(p.StartDate)) || '—')}
            ${fact('สิ้นสุดตามสัญญา', esc(thaiDateShort(p.EndDate)) || '—')}
            ${tl ? fact('เวลาที่เหลือ', esc(tl.text), tl.tone) : ''}
            ${fact('อัปเดตล่าสุด', esc(thaiDateShort(p.UpdatedDate)) || '—')}
          </div>

          <div class="pv-bars">
            ${bar('ความคืบหน้าตามแผน', plan, 'plan')}
            ${bar('ความคืบหน้าจริง', actual, 'actual')}
            ${bar('เบิกจ่ายแล้ว', pay, 'pay')}
            <div class="pj-var ${v.tone}">${esc(v.text)}</div>
            ${pay > actual + 5
              ? '<div class="pj-note warn">ยอดเบิกจ่ายสูงกว่าความคืบหน้าจริงเกิน 5%</div>' : ''}
          </div>
        </div>

        ${p.Detail
          ? `<div class="pj-detail big"><span>ขณะนี้ดำเนินการ</span>${esc(p.Detail)}</div>`
          : '<div class="doc-empty">ยังไม่ได้บันทึกว่าขณะนี้ดำเนินการอะไรอยู่</div>'}

        ${(p.Owner || toArray(p.Team).length) ? `
          <div class="pp-block">
            <h4>ผู้รับผิดชอบโครงการ</h4>
            <div class="pp-grid">
              ${p.Owner ? personChip(p.Owner, 'ผู้รับผิดชอบหลัก') : ''}
              ${toArray(p.Team).map((n) => personChip(n, 'ทีมงาน')).join('')}
            </div>
          </div>` : ''}
      </div>`,
    footer: `<button class="btn-mini" data-vhistory="${p.id}">🕓 ประวัติความคืบหน้า</button>
             <button class="btn-mini" data-vexport="${p.id}">⭳ ส่งออกรายงาน</button>
             ${state.isAdmin ? `<button class="btn btn-primary" data-vedit="${p.id}">✎ อัปเดตโครงการ</button>` : ''}`,
  });

  hydratePhotos($('#overlay-root'));
  onClick('vhistory', () => showHistory(p));
  onClick('vexport', () => exportProject(p));
  onClick('vedit', () => editProject(p));
  onClick('person-name', (name) => {
    const person = staff.find((x) => x.Title === name);
    if (person) openPerson(person, () => openProject(p));   // ปิดแล้วกลับมาที่โครงการเดิมได้
  });
}

/** เปิดฟอร์มแก้ไขโครงการจากหน้าแดชบอร์ด (เฉพาะแอดมิน) */
async function editProject(p) {
  const { openProjectEditor } = await import('./admin.page.js');
  await openProjectEditor(p, () => {
    // หลังบันทึก โหลดหน้าแดชบอร์ดใหม่ให้เห็นค่าล่าสุด
    import('../core/render.js').then((m) => m.render());
  });
}


/**
 * เลยวันสิ้นสุดสัญญาแล้วแต่งานยังไม่เสร็จ
 * ไม่นับโครงการที่ส่งมอบ/ปิดแล้ว หรืออยู่ระหว่างประกันผลงาน · คืนจำนวนวันที่เลย หรือ 0
 */
function overdueDays(p) {
  const st = String(p.Status || '').trim();
  if (/^ปิดโครงการ/.test(st) || st === 'ส่งมอบแล้ว') return 0;
  if (p.InWarranty === true || p.InWarranty === 'Yes') return 0;
  if (num(p.ActualProgress) >= 100) return 0;
  const left = daysLeft(p.EndDate);
  return left !== null && left < 0 ? -left : 0;
}

/** โครงการที่ต้องติดตามขึ้นก่อน: เกินกำหนด (มาก→น้อย) → ช้ากว่าแผน (มาก→น้อย) → ที่เหลือตามรหัส */
const priority = (a, b) => (overdueDays(b) - overdueDays(a))
  || (variance(a).diff - variance(b).diff)
  || String(a.ProjectCode || '').localeCompare(String(b.ProjectCode || ''));

const PER_PAGE = 5;        // โครงการต่อหน้า A4 แนวนอน
const thDate = (v) => (v ? thaiDateShort(v) : '—');

/** แท่งแนวนอนหนึ่งเส้นในการ์ดโครงการ */
const rpxBar = (label, value, cls) => `
  <div class="rpx-bar" title="${esc(label)} ${pct(value)}%">
    <span class="rpx-bl">${esc(label)}</span>
    <span class="rpx-track"><span class="rpx-fill ${cls}" style="width:${num(value)}%"></span></span>
    <b>${pct(value)}%</b>
  </div>`;

/** ป้ายสถานะความคืบหน้า — สี + ไอคอน + ข้อความเสมอ (ไม่ใช้สีอย่างเดียว) */
function health(p) {
  const od = overdueDays(p);
  const v = variance(p);
  if (od) return { cls: 'crit', icon: '⚠', text: `เกินกำหนด ${od.toLocaleString('th-TH')} วัน` };
  if (v.tone === 'bad') return { cls: 'crit', icon: '▼', text: v.text };
  if (v.tone === 'warn') return { cls: 'warn', icon: '▼', text: v.text };
  return { cls: 'good', icon: '✓', text: v.text };
}

function projectRow(p) {
  const h = health(p);
  const od = overdueDays(p);
  return `
  <article class="rpx-proj${od ? ' overdue' : ''}">
    ${od ? `<div class="rpx-ribbon">⚠ เกินกำหนดสัญญา ${od.toLocaleString('th-TH')} วัน</div>` : ''}
    <div class="rpx-id">
      <div class="rpx-code">${esc(p.ProjectCode || '—')}<span class="rpx-st">${esc(p.Status || '—')}</span></div>
      <div class="rpx-name">${esc(p.Title)}</div>
      <div class="rpx-meta">👤 ${esc(p.Owner || '—')} · ${p.Capacity ? `${Number(p.Capacity).toLocaleString('th-TH')} kWp` : '— kWp'}</div>
      <div class="rpx-meta">${esc(thDate(p.StartDate))} – <b class="${od ? 'rpx-red' : ''}">${esc(thDate(p.EndDate))}</b></div>
    </div>
    <div class="rpx-bars">
      ${rpxBar('แผน', p.PlanProgress, 'plan')}
      ${rpxBar('จริง', p.ActualProgress, 'actual')}
      ${rpxBar('เบิกจ่าย', p.ActualPayment, 'pay')}
      <div class="rpx-health ${h.cls}"><span aria-hidden="true">${h.icon}</span> ${esc(h.text)}</div>
    </div>
    <div class="rpx-detail">
      <div class="rpx-dh">การดำเนินงานปัจจุบัน</div>
      <div class="rpx-dt">${esc(p.Detail || '—')}</div>
      <div class="rpx-upd">อัปเดต ${esc(thDate(p.UpdatedDate))}</div>
    </div>
  </article>`;
}

/** สรุปภาพรวมทุกโครงการ (ตามตัวกรองที่เลือกอยู่) — หน้าแรกเป็นกราฟสรุป ตามด้วยหน้าละ 5 โครงการ · A4 แนวนอน */
function exportAll(rows, label) {
  const sorted = [...rows].sort(priority);
  const n = rows.length;
  const late = rows.filter((p) => variance(p).diff < 0);
  const over = rows.filter((p) => overdueDays(p));
  const kwp = rows.reduce((t, p) => t + (Number(p.Capacity) || 0), 0);
  const avg = (k) => (n ? num(rows.reduce((t, p) => t + num(p[k]), 0) / n) : 0);
  const today = thaiDateShort(new Date().toISOString());

  // กราฟ 1: สถานะโครงการ (แท่งเดียวแบ่งส่วน) — สีตามลำดับสถานะคงที่ ไม่สลับตามจำนวน
  const stCount = STATUSES.map((s, i) => ({ s, i, c: rows.filter((p) => stIdx(p.Status) === i).length }));
  const stOther = n - stCount.reduce((t, x) => t + x.c, 0);
  const segs = stCount.filter((x) => x.c);
  // กราฟ 2: สุขภาพตามกำหนดการ
  const buckets = [
    { k: 'good', icon: '✓', label: 'ตามแผน / เร็วกว่าแผน', c: rows.filter((p) => variance(p).diff >= 0 && !overdueDays(p)).length },
    { k: 'warn', icon: '▼', label: 'ช้ากว่าแผนไม่เกิน 5%', c: rows.filter((p) => variance(p).tone === 'warn' && !overdueDays(p)).length },
    { k: 'crit', icon: '▼', label: 'ช้ากว่าแผนเกิน 5%', c: rows.filter((p) => variance(p).tone === 'bad' && !overdueDays(p)).length },
    { k: 'crit', icon: '⚠', label: 'เกินกำหนดสัญญา', c: over.length },
  ];
  const needWatch = sorted.filter((p) => overdueDays(p) || variance(p).tone === 'bad');
  const watch = needWatch.slice(0, 6);      // ให้หน้าสรุปจบในกระดาษแผ่นเดียว ที่เหลืออยู่หน้ารายโครงการ (เรียงขึ้นก่อน)

  const pages = [];
  for (let i = 0; i < sorted.length; i += PER_PAGE) pages.push(sorted.slice(i, i + PER_PAGE));
  const total = pages.length + 1;
  const pageHead = (no, sub) => `<div class="rpx-phead">
      <span><b>Prime Power Group</b> · สรุปความคืบหน้าโครงการ · ${esc(label)}</span>
      <span>${esc(sub)} · หน้า ${no}/${total}</span></div>`;

  const summary = `
    <section class="rpx-page">
      <div class="rpx-head">
        <div>
          <div class="rp-brand">Prime Power Group</div>
          <div class="rp-title">สรุปภาพรวมความคืบหน้าโครงการ</div>
          <div class="rp-sub">ตัวกรอง: ${esc(label)} · ${n} โครงการ · ข้อมูล ณ ${esc(today)}</div>
        </div>
        <div class="rpx-pno">หน้า 1/${total}</div>
      </div>

      <div class="rpx-kpis">
        <div><b>${n}</b><span>โครงการ</span></div>
        <div><b>${kwp.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</b><span>kWp รวม</span></div>
        <div><b>${pct(avg('ActualProgress'))}%</b><span>ผลงานจริงเฉลี่ย · แผน ${pct(avg('PlanProgress'))}%</span></div>
        <div><b>${pct(avg('ActualPayment'))}%</b><span>เบิกจ่ายเฉลี่ย</span></div>
        <div class="${late.length ? 'warn' : ''}"><b>${late.length}</b><span>ช้ากว่าแผน</span></div>
        <div class="${over.length ? 'crit' : ''}"><b>${over.length ? '⚠ ' : ''}${over.length}</b><span>เกินกำหนดสัญญา</span></div>
      </div>

      <div class="rpx-cols">
        <div class="rpx-charts">
          <div class="rpx-chart">
            <h4>สถานะโครงการ</h4>
            <div class="rpx-stack" role="img" aria-label="สถานะโครงการ ${segs.map((x) => `${x.s} ${x.c}`).join(', ')}">
              ${segs.map((x) => `<span class="s${x.i + 1}" style="flex:${x.c}" title="${esc(x.s)} ${x.c} โครงการ">${
                x.c / n >= 0.08 ? x.c : ''}</span>`).join('')}
              ${stOther ? `<span class="s0" style="flex:${stOther}" title="อื่น ๆ ${stOther}"></span>` : ''}
            </div>
            <div class="rpx-legend">${stCount.map((x) => `<span><i class="s${x.i + 1}"></i>${esc(x.s)} <b>${x.c}</b></span>`).join('')}${
              stOther ? `<span><i class="s0"></i>อื่น ๆ <b>${stOther}</b></span>` : ''}</div>
          </div>

          <div class="rpx-chart">
            <h4>ความคืบหน้าเทียบแผนและสัญญา <small>(จำนวนโครงการ)</small></h4>
            ${buckets.map((b) => `<div class="rpx-hb" title="${esc(b.label)} ${b.c} โครงการ">
              <span class="rpx-hl"><span class="rpx-ic ${b.k}" aria-hidden="true">${b.icon}</span>${esc(b.label)}</span>
              <span class="rpx-track"><span class="rpx-fill ${b.k}" style="width:${n ? (b.c / n) * 100 : 0}%"></span></span>
              <b>${b.c}</b></div>`).join('')}
          </div>

          <div class="rpx-chart">
            <h4>ผลงานจริงเฉลี่ยเทียบแผน</h4>
            ${rpxBar('แผน', avg('PlanProgress'), 'plan')}
            ${rpxBar('จริง', avg('ActualProgress'), 'actual')}
            ${rpxBar('เบิกจ่าย', avg('ActualPayment'), 'pay')}
          </div>
        </div>

        <div class="rpx-watch">
          <h4>⚠ โครงการที่ต้องติดตาม ${needWatch.length ? `<small>(${needWatch.length} โครงการ${
            needWatch.length > watch.length ? ` · แสดง ${watch.length} อันดับแรก` : ''})</small>` : ''}</h4>
          ${watch.length ? `<ol>${watch.map((p) => {
            const h = health(p);
            return `<li class="${overdueDays(p) ? 'overdue' : ''}">
              <div><b>${esc(p.ProjectCode || '')}</b> ${esc(p.Title)}</div>
              <div class="rpx-health ${h.cls}"><span aria-hidden="true">${h.icon}</span> ${esc(h.text)}${
                overdueDays(p) && variance(p).diff < 0 ? ` · ช้ากว่าแผน ${(-variance(p).diff).toFixed(2)}%` : ''}
                <span class="rpx-meta">· 👤 ${esc(p.Owner || '—')}</span></div>
            </li>`;
          }).join('')}</ol>`
            : '<div class="rpx-allgood">✓ ไม่มีโครงการที่เกินกำหนดหรือช้ากว่าแผนเกิน 5%</div>'}
          <div class="rpx-note">รายละเอียดรายโครงการอยู่หน้าถัดไป หน้าละ ${PER_PAGE} โครงการ
            เรียงโครงการที่ต้องติดตามขึ้นก่อน</div>
        </div>
      </div>
    </section>`;

  const projectPages = pages.map((chunk, i) => `
    <section class="rpx-page">
      ${pageHead(i + 2, `โครงการที่ ${i * PER_PAGE + 1}–${i * PER_PAGE + chunk.length} จาก ${n}`)}
      <div class="rpx-list">${chunk.map(projectRow).join('')}</div>
      <div class="rpx-legend small"><span><i class="plan"></i>แผน</span><span><i class="actual"></i>ผลงานจริง</span>
        <span><i class="pay"></i>เบิกจ่าย</span><span class="rpx-red">⚠ กรอบแดง = เกินกำหนดสัญญา</span>
        <span>พิมพ์เมื่อ ${esc(today)}</span></div>
    </section>`).join('');

  openModal({
    title: 'ส่งออกสรุปทุกโครงการ',
    wide: true,
    body: `<div class="pj-report rpx" id="pj-report-all">${summary}${projectPages}</div>`,
    footer: `<button class="btn-mini" id="rpa-close">ปิด</button>
             <button class="btn-mini" id="rpa-csv">⭳ ดาวน์โหลด CSV</button>
             <button class="btn btn-primary" id="rpa-print">พิมพ์ / บันทึกเป็น PDF</button>`,
  });

  $('#rpa-close').onclick = () => $('#overlay-root').replaceChildren();
  $('#rpa-print').onclick = () => printWithNotice('printing-report');   // แจ้งผลทางกฎหมายก่อนพิมพ์
  $('#rpa-csv').onclick = () => {
    const keys = ['รหัส', 'ชื่อโครงการ', 'สถานะ', 'kWp', 'แผน %', 'จริง %', 'ต่าง %', 'เบิกจ่าย %',
      'ผู้รับผิดชอบ', 'เริ่มโครงการ', 'สิ้นสุดสัญญา', 'การดำเนินงานปัจจุบัน', 'อัปเดตล่าสุด'];
    const data = rows.map((p) => ({
      'รหัส': p.ProjectCode || '', 'ชื่อโครงการ': p.Title || '', 'สถานะ': p.Status || '',
      'kWp': Number(p.Capacity) || '', 'แผน %': pct(p.PlanProgress), 'จริง %': pct(p.ActualProgress),
      'ต่าง %': variance(p).diff.toFixed(2), 'เบิกจ่าย %': pct(p.ActualPayment),
      'ผู้รับผิดชอบ': p.Owner || '', 'เริ่มโครงการ': p.StartDate || '', 'สิ้นสุดสัญญา': p.EndDate || '',
      'การดำเนินงานปัจจุบัน': p.Detail || '', 'อัปเดตล่าสุด': p.UpdatedDate || '',
    }));
    // \uFEFF = BOM ให้ Excel อ่านภาษาไทยไม่เป็นตัวยึกยือ
    downloadText(`สรุปโครงการ-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(keys, data));
  };
}

/** หน้าต่างสำหรับพิมพ์หรือบันทึกเป็น PDF ส่งให้หน่วยงานภายนอก */
function exportProject(p) {
  const plan = num(p.PlanProgress), actual = num(p.ActualProgress), pay = num(p.ActualPayment);
  const v = variance(p);

  openModal({
    title: 'ส่งออกรายงานโครงการ',
    wide: true,
    body: `
      <div class="pj-report" id="pj-report">
        <div class="rp-head">
          <div class="rp-brand">Prime Power Group</div>
          <div class="rp-title">รายงานความคืบหน้าโครงการ</div>
        </div>

        <table class="rp-table">
          <tr><th>รหัสโครงการ</th><td>${esc(p.ProjectCode || '—')}</td></tr>
          <tr><th>ชื่อโครงการ</th><td>${esc(p.Title)}</td></tr>
          <tr><th>ขนาดติดตั้ง</th><td>${p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') + ' kWp' : '—'}</td></tr>
          <tr><th>ระยะเวลา</th><td>${esc(thaiDateShort(p.StartDate))} ถึง ${esc(thaiDateShort(p.EndDate))}</td></tr>
          <tr><th>สถานะ</th><td>${esc(p.Status || '—')}</td></tr>
          <tr><th>ความคืบหน้าตามแผน</th><td>${pct(plan)}%</td></tr>
          <tr><th>ความคืบหน้าจริง</th><td>${pct(actual)}% (${esc(v.text)})</td></tr>
          <tr><th>เบิกจ่ายแล้ว</th><td>${pct(pay)}%</td></tr>
          <tr><th>การดำเนินงานปัจจุบัน</th><td>${esc(p.Detail || '—')}</td></tr>
          <tr><th>ผู้รับผิดชอบโครงการ</th><td>${esc(p.Owner || '—')}${
            findPerson(p.Owner).Extension ? ` · ต่อ ${esc(findPerson(p.Owner).Extension)}` : ''}</td></tr>
          <tr><th>ข้อมูล ณ วันที่</th><td>${esc(thaiDateShort(p.UpdatedDate))}</td></tr>
        </table>

        <div class="rp-bars">
          ${bar('ตามแผน', plan, 'plan')}
          ${bar('ผลงานจริง', actual, 'actual')}
          ${bar('เบิกจ่าย', pay, 'pay')}
        </div>

        <div class="rp-foot">พิมพ์เมื่อ ${esc(thaiDateShort(new Date().toISOString()))}</div>
      </div>`,
    footer: `<button class="btn-mini" id="rp-close">ปิด</button>
             <button class="btn btn-primary" id="rp-print">พิมพ์ / บันทึกเป็น PDF</button>`,
  });

  $('#rp-close').onclick = () => $('#overlay-root').replaceChildren();
  $('#rp-print').onclick = () => printWithNotice('printing-report');   // แจ้งผลทางกฎหมายก่อนพิมพ์
}

async function showHistory(p) {
  let rows = [];
  try {
    rows = (await list('projectHistory'))
      .filter((h) => h.ProjectCode === p.ProjectCode || h.Title === p.Title)
      .sort((a, b) => new Date(b.RecordedDate) - new Date(a.RecordedDate));
  } catch (e) { /* ยังไม่ได้สร้างทะเบียนประวัติก็แสดงว่าไม่มีข้อมูล */ }

  openModal({
    title: `ประวัติความคืบหน้า — ${p.Title}`,
    wide: true,
    body: rows.length
      ? `<table class="hist-table">
          <thead><tr><th>วันที่บันทึก</th><th>แผน</th><th>จริง</th><th>เบิกจ่าย</th><th>ผู้บันทึก</th></tr></thead>
          <tbody>${rows.map((h) => `<tr>
            <td>${esc(thaiDateShort(h.RecordedDate))}</td>
            <td>${pct(h.PlanProgress)}%</td>
            <td>${pct(h.ActualProgress)}%</td>
            <td>${pct(h.ActualPayment)}%</td>
            <td class="dim">${esc(h.RecordedBy || '—')}</td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<div class="doc-empty">ยังไม่มีประวัติ ระบบจะเริ่มเก็บให้ตั้งแต่การแก้ไขครั้งถัดไป</div>',
  });
}

export function mountDashboard() {
  onClick('status', (x) => setState({ projectStatus: x }));

  const exAll = $('#pj-export-all');
  if (exAll) exAll.onclick = () => exportAll(shownRows, state.projectStatus || 'ทั้งหมด');

  const open = (id) => {
    const p = projects.find((x) => String(x.id) === String(id));
    if (p) openProject(p);
  };
  $$('[data-project]').forEach((el) => {
    el.onclick = (ev) => {
      // ปุ่มในการ์ดทำงานของตัวเอง ไม่ต้องเปิดหน้าต่างรายละเอียด
      if (ev.target.closest('button[data-export], button[data-history]')) return;
      open(el.dataset.project);
    };
    el.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(el.dataset.project); }
    };
  });

  onClick('export', (id) => { const p = projects.find((x) => String(x.id) === String(id)); if (p) exportProject(p); });
  onClick('history', (id) => { const p = projects.find((x) => String(x.id) === String(id)); if (p) showHistory(p); });

  const box = $('#pj-q');
  if (!box) return;
  let t;
  box.oninput = (ev) => {
    const val = ev.target.value;
    clearTimeout(t);
    t = setTimeout(() => setState({ projectQuery: val }), 250);
  };
}

export function mount(ctx) { mountDashboard(); }
