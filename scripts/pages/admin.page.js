import { esc, $, onClick } from '../core/dom.js';
import { list, create, update, remove } from '../services/data.js';
import { SCHEMA } from '../admin/schema.js';
import { formBody, collect, bindDependents, bindPhoto, bindFiles, toFiles } from '../admin/entity-form.js';
import { openModal, closeModal } from '../components/modal.js';
import { state, setState } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { thaiDateShort } from '../utils/format.js';
import { showAnnouncements } from '../components/announcement-popup.js';
import { clearCaches } from '../utils/dept.js';
import { render as rerender } from '../core/render.js';

export const meta = { route: 'admin', title: 'จัดการข้อมูล', nav: true, order: 10, adminOnly: true };

let rows = [];

export async function render(ctx) {
  if (!state.isAdmin) return `<section class="page"><div class="wrap">
    <h1 class="page-title">${esc(meta.title)}</h1>
    <div class="panel"><div class="empty">
      หน้านี้เปิดให้เฉพาะผู้ดูแลระบบ<br>
      บัญชี <b>${esc(state.user?.email || '')}</b> ไม่อยู่ในรายชื่อผู้ดูแล<br>
      <span class="dim">เพิ่มอีเมลได้ที่ SharePoint List ชื่อ Settings รายการ Admins</span>
    </div></div></div></section>`;

  const key = state.adminSet || 'departments';
  const s = SCHEMA[key];
  rows = await list(s.list);
  if (s.sortField) {
    rows.sort((a, b) => (+a[s.sortField] || 0) - (+b[s.sortField] || 0));
  }

  return `
  <section class="page page-admin">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">เพิ่ม แก้ไข หรือลบข้อมูลทุกชุดที่แสดงบนเว็บ โดยไม่ต้องแก้ไขโค้ด</p>
      ${state.adminUnconfigured ? `<div class="mock-warning">
        <b>⚠ ยังไม่ได้กำหนดว่าใครเป็นผู้ดูแลระบบ</b>
        ตอนนี้ทุกคนที่ล็อกอินเข้ามาแก้ข้อมูลได้ทั้งหมด
        ไปที่ 🛟 ตั้งค่าระบบ แล้วเพิ่มรายการชื่อ <b>Admins</b>
        ใส่อีเมลผู้ดูแลคั่นด้วยจุลภาค เช่น a@primepower.co.th, b@primepower.co.th
      </div>` : ''}
      ${CONFIG.dataSource !== 'sharepoint' ? `<div class="mock-warning">
        <b>⚠ กำลังใช้ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริงจาก SharePoint</b>
        สิ่งที่แก้ในหน้านี้จะหายเมื่อรีเฟรช และไม่ถูกบันทึกลง SharePoint
        แก้ได้ที่ไฟล์ scripts/core/config.js บรรทัด dataSource ให้เป็น 'sharepoint'
      </div>` : ''}

      <div class="admin-layout">
        <nav class="set-nav">
          ${Object.entries(SCHEMA).map(([k, v]) => `
            <button data-set="${k}" aria-current="${key === k ? 'page' : 'false'}">
              <span>${v.icon}</span> ${esc(v.title)}</button>`).join('')}
        </nav>

        <div class="panel">
          <div class="panel-head">${s.icon} ${esc(s.title)} — ${rows.length} รายการ
            ${key === 'announcements' ? '<button class="head-btn" data-preview="1">👁 ดูตัวอย่าง</button>' : ''}
            <button class="head-btn" data-new="1">+ เพิ่มรายการ</button></div>
          <div class="table-scroll"><table>
            <thead><tr>${s.sortField ? '<th class="col-no">ลำดับ</th>' : ''}
              ${s.columns.map((c) => `<th data-col="${c}">${esc(s.labels[c] || c)}</th>`).join('')}
              <th class="col-actions"></th></tr></thead>
            <tbody>${rows.length ? rows.map((r, i) => `<tr>
              ${s.sortField ? `<td class="col-no">${i + 1}</td>` : ''}
              ${s.columns.map((c) => c === 'Photo'
                ? `<td class="col-thumb">${r[c] ? `<img src="${r[c]}" alt="">` : '—'}</td>`
                : `<td data-col="${c}">${esc(
                typeof r[c] === 'boolean' ? (r[c] ? 'ใช่' : 'ไม่')
                : Array.isArray(r[c]) ? (r[c].length ? r[c].length + ' รายการ' : '—')
                : c === 'Files' ? (toFiles(r[c]).length ? '📎 ' + toFiles(r[c]).length : '—')
                : /Date|Updated/.test(c) ? (thaiDateShort(r[c]) || '—')
                : (r[c] ?? '—'))}</td>`).join('')}
              <td class="col-actions">
                ${s.sortField ? `<span class="move-group">
                  <button class="btn-move" data-up="${r.id}" title="เลื่อนขึ้น"
                    ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn-move" data-down="${r.id}" title="เลื่อนลง"
                    ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
                </span>` : ''}
                <button class="btn-mini" data-edit="${r.id}">✎ แก้ไข</button>
                <button class="btn-mini danger" data-del="${r.id}">🗑 ลบ</button>
              </td></tr>`).join('')
              : `<tr><td colspan="${s.columns.length + (s.sortField ? 2 : 1)}"><div class="empty">ยังไม่มีข้อมูล กด “เพิ่มรายการ” เพื่อเริ่มต้น</div></td></tr>`}
            </tbody>
          </table></div>
          <div class="panel-note">
            ${s.hint ? esc(s.hint) + '<br>' : ''}
            ${s.sortField ? 'กดปุ่ม ↑ ↓ เพื่อจัดลำดับใหม่ ผลจะเปลี่ยนทันทีทุกหน้าที่แสดงข้อมูลชุดนี้<br>' : ''}
            ข้อมูลชุดนี้เก็บใน SharePoint List <b>${esc(s.spName || s.list)}</b> ·
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
  bindDependents(s);
  bindPhoto(s);
  bindFiles(s);
  $('#cancel').onclick = closeModal;
  $('#save').onclick = async (ev) => {
    const data = collect(s);
    if (!data) return;

    const btn = ev.currentTarget;
    const err = $('#form-error');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'กำลังบันทึก…';

    try {
      const res = isNew ? await create(s.list, data)
                        : await update(s.list, record.id, data);
      clearCaches();
      closeModal();
      rerender();
      const notes = [];
      if (res && res.skipped && res.skipped.length) {
        notes.push('ยังไม่มีคอลัมน์เหล่านี้ใน List "' + (s.spName || s.list) + '"\n  '
          + res.skipped.join('\n  '));
      }
      if (res && res.dropped && res.dropped.length) {
        notes.push('SharePoint ปฏิเสธการบันทึกช่องที่เลือกได้หลายค่า\n  '
          + res.dropped.join('\n  ')
          + '\n  ข้อมูลอื่นบันทึกแล้ว ส่วนช่องเหล่านี้ต้องแก้ใน SharePoint โดยตรง');
      }
      if (notes.length) alert('บันทึกแล้ว แต่มีข้อสังเกต\n\n' + notes.join('\n\n'));
    } catch (e) {
      console.error(e);
      err.innerHTML = `บันทึกไม่สำเร็จ<br>${esc(e.message)}`;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  };
}

export function mount(ctx) {
  onClick('set', (k) => setState({ adminSet: k }));
  const key = state.adminSet || 'departments';
  const s = SCHEMA[key];

  onClick('new', () => openEditor(key, null));
  onClick('preview', () => showAnnouncements({ force: true }));
  onClick('edit', (id) => openEditor(key, rows.find((r) => String(r.id) === String(id))));
  /** สลับลำดับกับแถวข้างเคียง แล้วเขียนเลขลำดับใหม่ทั้งคู่ */
  const move = async (id, step) => {
    const i = rows.findIndex((r) => String(r.id) === String(id));
    const j = i + step;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const f = s.sortField;
    await Promise.all([
      update(s.list, rows[i].id, { [f]: j + 1 }),
      update(s.list, rows[j].id, { [f]: i + 1 }),
    ]);
    clearCaches();
    rerender();
  };
  onClick('up', (id) => move(id, -1));
  onClick('down', (id) => move(id, 1));

  onClick('del', async (id) => {
    const r = rows.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (!confirm(`ต้องการลบ "${r.Title}" ออกจาก${s.title} ใช่หรือไม่`)) return;
    try {
      await remove(s.list, id);
      clearCaches();
      rerender();
    } catch (e) {
      console.error(e);
      alert('ลบไม่สำเร็จ — ' + e.message);
    }
  });
}
