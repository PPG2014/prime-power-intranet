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

/**
 * ทะเบียนเครื่องมือและอุปกรณ์ (#/equipment) — การ์ดท้ายกลุ่มฝ่ายจัดซื้อและคลังสินค้า
 * แสดงเมื่อกลุ่มฝ่ายจัดซื้อแสดงอยู่ หรือค้นคำที่เกี่ยวข้อง
 */
const EQ_CARD = {
  key: 'ทะเบียนเครื่องมือและอุปกรณ์ equipment ยืม คืน โอนย้าย ฝ่ายจัดซื้อและคลังสินค้า',
  html: `<a class="form-card form-card-link" href="#/equipment">
    <div class="form-top"><span class="form-icon">🧰</span><span class="badge badge-app">ทะเบียน</span></div>
    <div class="form-name">ทะเบียนเครื่องมือและอุปกรณ์</div>
    <div class="form-desc">เครื่องมือแต่ละตัวอยู่ที่ใคร โครงการไหน สถานะอะไร · อัปเดตเองจากใบยืม-คืนและบันทึกโอนย้าย</div>
    <div class="form-meta"><span>ดูได้ทุกคน</span><span>ฝ่ายจัดซื้อแก้ไขได้</span></div>
    <div class="form-go">เปิดทะเบียน →</div>
  </a>`,
};
const isPurchase = (name) => /จัดซื้อ/.test(String(name || ''));

export async function render(ctx) {
  const q = (state.formQuery || '').trim().toLowerCase();
  const chip = state.formChip || 'ทั้งหมด';

  // เรียงตามลำดับที่จัดไว้ในหน้าจัดการข้อมูล · กลุ่มฝ่ายเรียงตามแบบฟอร์มแรกของฝ่ายนั้น
  const all = (await list('formCatalog')).filter((f) => f.IsActive !== false)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  const rows = all.filter((f) =>
    (chip === 'ทั้งหมด' || f.Department === chip) &&
    (!q || (f.Title + f.Description + f.FormCode + f.Department).toLowerCase().includes(q)));

  const chips = ['ทั้งหมด', ...(await groupByDepartment(all, 'Department', { byRows: true })).map((g) => g.name)];
  const groups = await groupByDepartment(rows, 'Department', { byRows: true });   // ตามลำดับแบบฟอร์มในหน้าจัดการข้อมูล
  // การ์ดทะเบียนเครื่องมือ: ท้ายกลุ่มฝ่ายจัดซื้อ (ไม่ได้กรองฝ่ายอื่นอยู่ และคำค้นตรงหรือไม่ได้ค้น)
  const eqHit = (chip === 'ทั้งหมด' || isPurchase(chip)) && (!q || EQ_CARD.key.includes(q));
  const purchaseDept = (all.find((f) => isPurchase(f.Department)) || {}).Department || 'ฝ่ายจัดซื้อและคลังสินค้า';
  if (eqHit && !groups.some((g) => isPurchase(g.name))) groups.push({ name: purchaseDept, rows: [] });

  return `
  <section class="page page-forms">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">แบบฟอร์มออนไลน์ ${all.length} รายการ แยกตามฝ่ายเจ้าของ ฟอร์มที่ระบุว่าเปิดระบบจะพาไปยังระบบภายนอก</p>

      <div class="toolbar">
        <div class="search-box">
          <span>🔍</span>
          <input id="form-q" type="search" data-keepfocus value="${esc(state.formQuery || '')}"
                 placeholder="ค้นหาชื่อฟอร์ม รหัส หรือฝ่าย" autocomplete="off">
        </div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} รายการ</span>
        <a class="btn-mini guide-btn" href="#/form-guide" title="อธิบายทุกฟอร์ม: กรอกอะไร ช่องไหนบังคับ ใครอนุมัติ">📘 คู่มือทุกแบบฟอร์ม</a>
      </div>

      <div class="chips">
        ${chips.map((c) => `<button class="chip" data-chip="${esc(c)}"
          aria-pressed="${chip === c}">${esc(c.replace(/^ฝ่าย/, ''))}</button>`).join('')}
      </div>

      ${rows.length || eqHit ? groups.map((g) => `
        <section class="dept-group">
          <div class="dept-head">
            <h2>${esc(g.name)}</h2>
            <span class="dept-meta">${g.rows.length} แบบฟอร์ม</span>
          </div>
          <div class="form-grid">${g.rows.map(card).join('')}${eqHit && isPurchase(g.name) ? EQ_CARD.html : ''}</div>
        </section>`).join('')
      : `<div class="panel"><div class="empty">ไม่พบแบบฟอร์มที่ตรงกับคำค้น</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  onClick('chip', (c) => setState({ formChip: c }));
  const box = $('#form-q');
  if (!box) return;
  let t;
  box.oninput = (ev) => {
    const val = ev.target.value;
    clearTimeout(t);
    t = setTimeout(() => setState({ formQuery: val }), 250);
  };
}
