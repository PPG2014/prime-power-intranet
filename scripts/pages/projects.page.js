import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toArray } from '../admin/entity-form.js';
import { openPerson } from './directory.page.js';

export const meta = { route: 'projects', title: 'ความคืบหน้าโครงการ', nav: false, order: 5, adminOnly: false };

const STATUSES = ['เตรียมงาน', 'กำลังดำเนินการ', 'ส่งมอบแล้ว', 'ปิดโครงการ'];

let projects = [];
let staff = [];

const num = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/** เหลือกี่วันตามสัญญา ติดลบแปลว่าเลยกำหนดแล้ว */
function daysLeft(end) {
  if (!end) return null;
  const d = new Date(end);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

/** ช้ากว่าแผนเท่าไร ใช้ตัดสินสีและข้อความเตือน */
function variance(p) {
  const diff = num(p.ActualProgress) - num(p.PlanProgress);
  if (diff >= 0) return { diff, tone: 'ok',   text: diff === 0 ? 'ตรงตามแผน' : `เร็วกว่าแผน ${diff}%` };
  if (diff >= -5) return { diff, tone: 'warn', text: `ช้ากว่าแผน ${-diff}%` };
  return { diff, tone: 'bad', text: `ช้ากว่าแผน ${-diff}%` };
}

const bar = (label, value, cls) => `
  <div class="pg-line">
    <div class="pg-label"><span>${esc(label)}</span><b>${value}%</b></div>
    <div class="pg-track"><div class="pg-fill ${cls}" style="width:${value}%"></div></div>
  </div>`;

function card(p) {
  const plan = num(p.PlanProgress);
  const actual = num(p.ActualProgress);
  const pay = num(p.ActualPayment);
  const v = variance(p);
  const left = daysLeft(p.EndDate);

  return `
  <article class="pj-card is-clickable tone-${v.tone}" data-project="${p.id}"
           role="button" tabindex="0" aria-label="ดูรายละเอียด ${esc(p.Title)}">
    <div class="pj-head">
      <div>
        <div class="pj-code">${esc(p.ProjectCode || '')}</div>
        <h3>${esc(p.Title)}</h3>
      </div>
      <span class="pj-status st-${STATUSES.indexOf(p.Status)}">${esc(p.Status || '')}</span>
    </div>

    <div class="pj-facts">
      <div><span>ขนาดติดตั้ง</span><b>${p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') + ' kWp' : '—'}</b></div>
      <div><span>เริ่มโครงการ</span><b>${esc(thaiDateShort(p.StartDate)) || '—'}</b></div>
      <div><span>สิ้นสุดตามสัญญา</span><b>${esc(thaiDateShort(p.EndDate)) || '—'}</b></div>
      <div><span>เวลาที่เหลือ</span><b class="${left !== null && left < 0 ? 'over' : ''}">${
        left === null ? '—' : left < 0 ? `เลยกำหนด ${-left} วัน` : `${left} วัน`}</b></div>
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
  projects = all.filter((p) => p.IsActive !== false);
  staff = people;

  const q = (state.projectQuery || '').trim().toLowerCase();
  const st = state.projectStatus || 'ทั้งหมด';

  const rows = projects.filter((p) =>
    (st === 'ทั้งหมด' || p.Status === st) &&
    (!q || (p.Title + p.ProjectCode + p.Detail).toLowerCase().includes(q)));

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
        <input id="pj-q" type="search" value="${esc(state.projectQuery || '')}"
               placeholder="ค้นหาชื่อโครงการ รหัส หรือรายละเอียด" autocomplete="off"></div>
      <span class="toolbar-meta">แสดง ${rows.length} จาก ${projects.length} โครงการ</span>
    </div>

    <div class="chips">
      ${['ทั้งหมด', ...STATUSES].map((x) => `<button class="chip" data-status="${esc(x)}"
        aria-pressed="${st === x}">${esc(x)}</button>`).join('')}
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
    ? `<img src="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy">`
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
  const left = daysLeft(p.EndDate);

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
          <span class="pj-status st-${STATUSES.indexOf(p.Status)}">${esc(p.Status || '')}</span>
        </div>

        <div class="pv-cols">
          <div class="pv-table">
            ${fact('ขนาดติดตั้ง', p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') + ' kWp' : '—')}
            ${fact('ฝ่ายเจ้าของ', esc(p.Department || '—'))}
            ${fact('เริ่มโครงการ', esc(thaiDateShort(p.StartDate)) || '—')}
            ${fact('สิ้นสุดตามสัญญา', esc(thaiDateShort(p.EndDate)) || '—')}
            ${fact('เวลาที่เหลือ',
              left === null ? '—' : left < 0 ? `เลยกำหนด ${-left} วัน` : `${left} วัน`,
              left !== null && left < 0 ? 'over' : '')}
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
             <button class="btn btn-primary" data-vexport="${p.id}">⭳ ส่งออกรายงาน</button>`,
  });

  onClick('vhistory', () => showHistory(p));
  onClick('vexport', () => exportProject(p));
  onClick('person-name', (name) => {
    const person = staff.find((x) => x.Title === name);
    if (person) openPerson(person, () => openProject(p));   // ปิดแล้วกลับมาที่โครงการเดิมได้
  });
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
          <tr><th>ความคืบหน้าตามแผน</th><td>${plan}%</td></tr>
          <tr><th>ความคืบหน้าจริง</th><td>${actual}% (${esc(v.text)})</td></tr>
          <tr><th>เบิกจ่ายแล้ว</th><td>${pay}%</td></tr>
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
  $('#rp-print').onclick = () => {
    document.body.classList.add('printing-report');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-report'), 500);
  };
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
            <td>${num(h.PlanProgress)}%</td>
            <td>${num(h.ActualProgress)}%</td>
            <td>${num(h.ActualPayment)}%</td>
            <td class="dim">${esc(h.RecordedBy || '—')}</td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<div class="doc-empty">ยังไม่มีประวัติ ระบบจะเริ่มเก็บให้ตั้งแต่การแก้ไขครั้งถัดไป</div>',
  });
}

export function mountDashboard() {
  onClick('status', (x) => setState({ projectStatus: x }));

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
  box.oninput = (ev) => {
    const pos = ev.target.selectionStart;
    setState({ projectQuery: ev.target.value });
    const next = $('#pj-q');
    next.focus();
    next.setSelectionRange(pos, pos);
  };
}

export function mount(ctx) { mountDashboard(); }
