import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';

export const meta = { route: 'projects', title: 'ความคืบหน้าโครงการ', nav: true, order: 5, adminOnly: false };

const STATUSES = ['เตรียมงาน', 'กำลังดำเนินการ', 'ส่งมอบแล้ว', 'ปิดโครงการ'];

let projects = [];

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
  <article class="pj-card tone-${v.tone}">
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
      <span>อัปเดตล่าสุด ${esc(thaiDateShort(p.UpdatedDate)) || '—'}</span>
      <span class="pj-actions">
        <button class="btn-mini" data-history="${p.id}">🕓 ประวัติ</button>
        <button class="btn-mini" data-export="${p.id}">⭳ ส่งออก</button>
      </span>
    </div>
  </article>`;
}

export async function render(ctx) {
  const all = (await list('projects')).filter((p) => p.IsActive !== false);
  projects = all;

  const q = (state.projectQuery || '').trim().toLowerCase();
  const st = state.projectStatus || 'ทั้งหมด';

  const rows = all.filter((p) =>
    (st === 'ทั้งหมด' || p.Status === st) &&
    (!q || (p.Title + p.ProjectCode + p.Detail).toLowerCase().includes(q)));

  const active = all.filter((p) => p.Status === 'กำลังดำเนินการ');
  const behind = active.filter((p) => variance(p).diff < 0);
  const totalKw = all.reduce((n, p) => n + (Number(p.Capacity) || 0), 0);

  return `
  <section class="page page-projects">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ภาพรวมความคืบหน้าของทุกโครงการ เทียบแผนกับผลจริงและยอดเบิกจ่าย</p>

      <div class="pj-summary">
        <div><b>${all.length}</b><span>โครงการทั้งหมด</span></div>
        <div><b>${active.length}</b><span>กำลังดำเนินการ</span></div>
        <div class="${behind.length ? 'alert' : ''}"><b>${behind.length}</b><span>ช้ากว่าแผน</span></div>
        <div><b>${totalKw.toLocaleString('th-TH')}</b><span>kWp รวม</span></div>
      </div>

      <div class="toolbar">
        <div class="search-box"><span>🔍</span>
          <input id="pj-q" type="search" value="${esc(state.projectQuery || '')}"
                 placeholder="ค้นหาชื่อโครงการ รหัส หรือรายละเอียด" autocomplete="off"></div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} โครงการ</span>
      </div>

      <div class="chips">
        ${['ทั้งหมด', ...STATUSES].map((x) => `<button class="chip" data-status="${esc(x)}"
          aria-pressed="${st === x}">${esc(x)}</button>`).join('')}
      </div>

      ${rows.length
        ? `<div class="pj-grid">${rows.map(card).join('')}</div>`
        : '<div class="panel"><div class="empty">ไม่พบโครงการที่ตรงกับเงื่อนไข</div></div>'}
    </div>
  </section>`;
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

export function mount(ctx) {
  onClick('status', (x) => setState({ projectStatus: x }));
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
