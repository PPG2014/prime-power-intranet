import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { groupByDepartment } from '../utils/dept.js';
import { state, setState } from '../core/state.js';

export const meta = { route: 'forms', title: 'แบบฟอร์มทั้งหมด', nav: true, order: 3, adminOnly: false };

const BADGE = { 'ใช้บ่อย': 'badge-hot', 'ใหม่': 'badge-new', 'ต้องอนุมัติ': 'badge-app' };

const card = (f) => {
  const tag = f.ExternalUrl
    ? `<a class="form-card" href="${esc(f.ExternalUrl)}" target="_blank" rel="noopener">`
    : `<a class="form-card" href="#/form/${esc(f.FormCode || '')}">`;
  return `${tag}
    <div class="form-top">
      <span class="form-icon">${f.Icon}</span>
      ${f.Badge ? `<span class="badge ${BADGE[f.Badge] || ''}">${esc(f.Badge)}</span>` : ''}
    </div>
    <div class="form-name">${esc(f.Title)}</div>
    <div class="form-desc">${esc(f.Description)}</div>
    <div class="form-meta">${(f.MetaTags || '').split(',').filter(Boolean)
      .map((m) => `<span>${esc(m.trim())}</span>`).join('')}</div>
    <div class="form-go">${f.ExternalUrl ? 'เปิดระบบ ↗' : 'กรอกแบบฟอร์ม →'}</div>
  </a>`;
};

export async function render(ctx) {
  const q = (state.formQuery || '').trim().toLowerCase();
  const chip = state.formChip || 'ทั้งหมด';

  const all = (await list('formCatalog')).filter((f) => f.IsActive !== false);
  const rows = all.filter((f) =>
    (chip === 'ทั้งหมด' || f.Department === chip) &&
    (!q || (f.Title + f.Description + f.FormCode + f.Department).toLowerCase().includes(q)));

  const chips = ['ทั้งหมด', ...(await groupByDepartment(all)).map((g) => g.name)];
  const groups = await groupByDepartment(rows);

  return `
  <section class="page page-forms">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">แบบฟอร์มออนไลน์ ${all.length} รายการ แยกตามฝ่ายเจ้าของ ฟอร์มที่ระบุว่าเปิดระบบจะพาไปยังระบบภายนอก</p>

      <div class="toolbar">
        <div class="search-box">
          <span>🔍</span>
          <input id="form-q" type="search" value="${esc(state.formQuery || '')}"
                 placeholder="ค้นหาชื่อฟอร์ม รหัส หรือฝ่าย" autocomplete="off">
        </div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} รายการ</span>
      </div>

      <div class="chips">
        ${chips.map((c) => `<button class="chip" data-chip="${esc(c)}"
          aria-pressed="${chip === c}">${esc(c.replace(/^ฝ่าย/, ''))}</button>`).join('')}
      </div>

      ${rows.length ? groups.map((g) => `
        <section class="dept-group">
          <div class="dept-head">
            <h2>${esc(g.name)}</h2>
            <span class="dept-meta">${g.rows.length} แบบฟอร์ม</span>
          </div>
          <div class="form-grid">${g.rows.map(card).join('')}</div>
        </section>`).join('')
      : `<div class="panel"><div class="empty">ไม่พบแบบฟอร์มที่ตรงกับคำค้น</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  onClick('chip', (c) => setState({ formChip: c }));
  const box = $('#form-q');
  if (!box) return;
  box.oninput = (ev) => {
    const pos = ev.target.selectionStart;
    setState({ formQuery: ev.target.value });
    const next = $('#form-q');
    next.focus();
    next.setSelectionRange(pos, pos);
  };
}
