import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { groupByDepartment, extensionOf } from '../utils/dept.js';
import { state, setState } from '../core/state.js';

export const meta = { route: 'directory', title: 'บุคลากร', nav: true, order: 8, adminOnly: false };

const card = (p) => `
  <article class="staff-card">
    <div class="staff-photo">${p.PhotoUrl
      ? `<img src="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}">`
      : `<span>${esc(p.Title.slice(0, 2))}</span>`}</div>
    <div class="staff-info">
      <div class="staff-name">${esc(p.Title)} ${p.Nickname ? `<em>(${esc(p.Nickname)})</em>` : ''}</div>
      <div class="staff-en">${esc(p.NameEN)}</div>
      <div class="staff-pos">${esc(p.Position)}</div>
      ${p.Email ? `<a class="staff-mail" href="mailto:${esc(p.Email)}">✉ ${esc(p.Email)}</a>` : ''}
      <div class="staff-ext">โทรภายใน <b>${p.Extension ? esc(p.Extension) : '—'}</b></div>
    </div>
  </article>`;

export async function render(ctx) {
  const q = (state.directoryQuery || '').trim().toLowerCase();
  const all = (await list('directory')).filter((p) => p.IsActive !== false);
  const rows = q
    ? all.filter((p) => Object.values(p).join(' ').toLowerCase().includes(q))
    : all;
  const groups = await groupByDepartment(rows);
  const exts = await Promise.all(groups.map((g) => extensionOf(g.name)));

  return `
  <section class="page page-directory">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ค้นหาบุคลากรจากชื่อจริง ชื่อเล่น ชื่อภาษาอังกฤษ หรือชื่อฝ่าย คลิกอีเมลเพื่อเปิดโปรแกรมส่งเมลได้ทันที</p>

      <div class="toolbar">
        <div class="search-box">
          <span>🔍</span>
          <input id="dir-q" type="search" value="${esc(state.directoryQuery || '')}"
                 placeholder="ค้นหาชื่อ ชื่อเล่น ตำแหน่ง หรือฝ่าย" autocomplete="off">
        </div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} คน${
          q ? '' : ` · ${groups.length} ฝ่าย`}</span>
      </div>

      ${rows.length ? groups.map((g, i) => `
        <section class="dept-group">
          <div class="dept-head">
            <h2>${esc(g.name)}</h2>
            <span class="dept-meta">${g.rows.length} คน${exts[i] ? ` · ต่อ ${esc(exts[i])}` : ''}</span>
          </div>
          <div class="staff-grid">${g.rows.map(card).join('')}</div>
        </section>`).join('')
      : `<div class="panel"><div class="empty">ไม่พบรายชื่อที่ตรงกับคำค้น ลองค้นด้วยชื่อเล่นหรือชื่อฝ่าย</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  const box = $('#dir-q');
  if (!box) return;
  box.oninput = (ev) => {
    const pos = ev.target.selectionStart;
    setState({ directoryQuery: ev.target.value });
    const next = $('#dir-q');
    next.focus();
    next.setSelectionRange(pos, pos);
  };
}
