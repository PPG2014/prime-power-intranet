import { esc, $, onClick } from '../core/dom.js';
import { list, create, update, remove } from '../services/data.js';
import { SCHEMA } from '../admin/schema.js';
import { formBody, collect } from '../admin/entity-form.js';
import { openModal, closeModal } from '../components/modal.js';
import { state, setState } from '../core/state.js';
import { render as rerender } from '../core/render.js';

export const meta = { route: 'admin', title: 'จัดการข้อมูล', nav: true, order: 10, adminOnly: true };

let rows = [];

export async function render(ctx) {
  if (!state.isAdmin) return `<section class="page"><div class="wrap">
    <h1 class="page-title">${esc(meta.title)}</h1>
    <div class="panel"><div class="empty">หน้านี้เปิดให้เฉพาะผู้ดูแลระบบ</div></div></div></section>`;

  const key = state.adminSet || 'departments';
  const s = SCHEMA[key];
  rows = await list(s.list);

  return `
  <section class="page page-admin">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">เพิ่ม แก้ไข หรือลบข้อมูลทุกชุดที่แสดงบนเว็บ โดยไม่ต้องแก้ไขโค้ด</p>

      <div class="admin-layout">
        <nav class="set-nav">
          ${Object.entries(SCHEMA).map(([k, v]) => `
            <button data-set="${k}" aria-current="${key === k ? 'page' : 'false'}">
              <span>${v.icon}</span> ${esc(v.title)}</button>`).join('')}
        </nav>

        <div class="panel">
          <div class="panel-head">${s.icon} ${esc(s.title)} — ${rows.length} รายการ
            <button class="head-btn" data-new="1">+ เพิ่มรายการ</button></div>
          <table>
            <thead><tr>${s.columns.map((c) => `<th>${esc(s.labels[c] || c)}</th>`).join('')}
              <th class="col-actions"></th></tr></thead>
            <tbody>${rows.length ? rows.map((r) => `<tr>
              ${s.columns.map((c) => `<td>${esc(
                typeof r[c] === 'boolean' ? (r[c] ? 'ใช่' : 'ไม่') : (r[c] ?? '—'))}</td>`).join('')}
              <td class="col-actions">
                <button class="btn-mini" data-edit="${r.id}">✎ แก้ไข</button>
                <button class="btn-mini danger" data-del="${r.id}">🗑 ลบ</button>
              </td></tr>`).join('')
              : `<tr><td colspan="${s.columns.length + 1}"><div class="empty">ยังไม่มีข้อมูล กด “เพิ่มรายการ” เพื่อเริ่มต้น</div></td></tr>`}
            </tbody>
          </table>
          <div class="panel-note">
            ข้อมูลชุดนี้เก็บใน SharePoint List ชื่อ <b>${esc(s.list)}</b> ·
            แก้ที่นี่หรือแก้ใน SharePoint โดยตรงก็ได้ ผลลัพธ์เหมือนกัน
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

async function openEditor(key, record) {
  const s = SCHEMA[key];
  const isNew = !record;
  openModal({
    title: `${s.icon} ${isNew ? 'เพิ่ม' : 'แก้ไข'}${s.title}`,
    wide: true,
    body: await formBody(s, record || {}),
    footer: `<button class="btn-mini" id="cancel">ยกเลิก</button>
             <button class="btn btn-primary" id="save">${isNew ? 'เพิ่มรายการ' : 'บันทึกการแก้ไข'}</button>`,
  });
  $('#cancel').onclick = closeModal;
  $('#save').onclick = async () => {
    const data = collect(s);
    if (!data) return;
    if (isNew) await create(s.list, data);
    else await update(s.list, record.id, data);
    closeModal();
    rerender();
  };
}

export function mount(ctx) {
  onClick('set', (k) => setState({ adminSet: k }));
  const key = state.adminSet || 'departments';
  const s = SCHEMA[key];

  onClick('new', () => openEditor(key, null));
  onClick('edit', (id) => openEditor(key, rows.find((r) => String(r.id) === String(id))));
  onClick('del', async (id) => {
    const r = rows.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (!confirm(`ต้องการลบ "${r.Title}" ออกจาก${s.title} ใช่หรือไม่`)) return;
    await remove(s.list, id);
    rerender();
  });
}
