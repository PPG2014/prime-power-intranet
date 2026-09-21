import { esc, $, $$, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toArray } from '../admin/entity-form.js';
import { openPerson } from './directory.page.js';
import { hydratePhotos } from '../services/photos.js';
import { toCsv, downloadText } from '../utils/csv.js';

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


/** สรุปภาพรวมทุกโครงการ (ตามตัวกรองที่เลือกอยู่) — พิมพ์เป็น PDF หรือดาวน์โหลด CSV */
function exportAll(rows, label) {
  const late = rows.filter((p) => variance(p).diff < 0);
  const kwp = rows.reduce((t, p) => t + (Number(p.Capacity) || 0), 0);
  const avg = (k) => rows.length
    ? num(rows.reduce((t, p) => t + num(p[k]), 0) / rows.length) : 0;

  const row = (p) => {
    const v = variance(p);
    return `<tr>
      <td>${esc(p.ProjectCode || '—')}</td>
      <td>${esc(p.Title)}</td>
      <td>${esc(p.Status || '—')}</td>
      <td class="num">${p.Capacity ? Number(p.Capacity).toLocaleString('th-TH') : '—'}</td>
      <td class="num">${pct(p.PlanProgress)}</td>
      <td class="num">${pct(p.ActualProgress)}</td>
      <td class="num ${v.tone}">${v.diff > 0 ? '+' : ''}${v.diff.toFixed(2)}</td>
      <td class="num">${pct(p.ActualPayment)}</td>
      <td>${esc(p.Owner || '—')}</td>
      <td>${esc(thaiDateShort(p.UpdatedDate))}</td>
    </tr>`;
  };

  openModal({
    title: 'ส่งออกสรุปทุกโครงการ',
    wide: true,
    body: `
      <div class="pj-report" id="pj-report-all">
        <div class="rp-runhead">Prime Power Group · สรุปภาพรวมความคืบหน้าโครงการ
          <span>${esc(label)} · ${rows.length} โครงการ</span></div>

        <div class="rp-head">
          <div class="rp-brand">Prime Power Group</div>
          <div class="rp-title">สรุปภาพรวมความคืบหน้าโครงการ</div>
          <div class="rp-sub">ตัวกรอง: ${esc(label)} · ${rows.length} โครงการ</div>
        </div>

        <div class="rp-kpis">
          <div><b>${rows.length}</b><span>โครงการ</span></div>
          <div><b>${kwp.toLocaleString('th-TH')}</b><span>kWp รวม</span></div>
          <div><b>${pct(avg('PlanProgress'))}%</b><span>ตามแผนเฉลี่ย</span></div>
          <div><b>${pct(avg('ActualProgress'))}%</b><span>ผลงานจริงเฉลี่ย</span></div>
          <div class="${late.length ? 'bad' : ''}"><b>${late.length}</b><span>ช้ากว่าแผน</span></div>
        </div>

        <table class="rp-grid">
          <thead><tr>
            <th>รหัส</th><th>ชื่อโครงการ</th><th>สถานะ</th><th>kWp</th>
            <th>แผน %</th><th>จริง %</th><th>ต่าง</th><th>เบิกจ่าย %</th>
            <th>ผู้รับผิดชอบ</th><th>อัปเดต</th>
          </tr></thead>
          <tbody>${rows.map(row).join('')}</tbody>
        </table>

        ${late.length ? `<div class="rp-late">
          <b>โครงการที่ช้ากว่าแผน (${late.length})</b>
          <ul>${late.sort((a, b) => variance(a).diff - variance(b).diff).map((p) =>
            `<li>${esc(p.ProjectCode || '')} ${esc(p.Title)} — ช้ากว่าแผน ${(-variance(p).diff).toFixed(2)}%${
              p.Detail ? ` · ${esc(p.Detail)}` : ''}</li>`).join('')}</ul>
        </div>` : ''}

        <div class="rp-foot">พิมพ์เมื่อ ${esc(thaiDateShort(new Date().toISOString()))}</div>
      </div>`,
    footer: `<button class="btn-mini" id="rpa-close">ปิด</button>
             <button class="btn-mini" id="rpa-csv">⭳ ดาวน์โหลด CSV</button>
             <button class="btn btn-primary" id="rpa-print">พิมพ์ / บันทึกเป็น PDF</button>`,
  });

  $('#rpa-close').onclick = () => $('#overlay-root').replaceChildren();
  $('#rpa-print').onclick = () => {
    document.body.classList.add('printing-report');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-report'), 500);
  };
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
