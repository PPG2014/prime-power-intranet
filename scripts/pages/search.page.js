/**
 * ค้นหาทั้งเว็บ — #/search/<คำค้น>
 * ค้นจากข้อมูลที่ผู้ใช้เปิดดูได้อยู่แล้วในหน้าต่าง ๆ เท่านั้น
 *   บุคลากร · แบบฟอร์ม · นโยบาย · เอกสาร/คู่มือ · โครงการ · คำขอของฉัน (แอดมินเห็นทุกใบ)
 */
import { esc, $, onClick } from '../core/dom.js';
import { list, listRecent } from '../services/data.js';
import { state } from '../core/state.js';
import { toArray, toFiles } from '../admin/entity-form.js';
import { openPerson } from './directory.page.js';
import { formCodeOf } from './requests.page.js';

export const meta = { route: 'search', title: 'ค้นหาทั้งเว็บ', nav: false, order: 99, adminOnly: false };

const LIMIT = 8;                 // แสดงต่อหมวด
let people = [];

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const hit = (q, ...vals) => q.split(' ').every((w) => vals.some((v) => norm(v).includes(w)));
const queryOf = () => { try { return decodeURIComponent(state.params?.id || ''); } catch (e) { return ''; } };

export async function render() {
  const raw = queryOf();
  const q = norm(raw);
  let body = '<div class="sr-hint">พิมพ์ชื่อคน ชื่อ/รหัสแบบฟอร์ม ชื่อเอกสาร ชื่อ/รหัสโครงการ หรือเลขที่คำขอ แล้วกด Enter</div>';

  if (q) {
    const safe = (p) => p.catch(() => []);
    const me = norm(state.user?.email);
    const [dir, forms, policies, docs, projects, reqs] = await Promise.all([
      safe(list('directory')), safe(list('formCatalog')), safe(list('policies')),
      safe(list('documents')), safe(list('projects')),
      safe(listRecent('requests', { days: 365, statuses: ['รออนุมัติ', 'ส่งกลับแก้ไข'] })),
    ]);
    people = dir.filter((p) => p.IsActive !== false
      && hit(q, p.Title, p.NameEN, p.Nickname, p.Position, p.Department, p.Section, p.Email, p.Extension));

    const fileLink = (d, fallback) => (toFiles(d.Files)[0] || {}).url || fallback;
    const groups = [
      { title: '👥 บุคลากร', rows: people.map((p) => ({
        html: `<button class="linky" data-srperson="${esc(p.id)}">${esc(p.Title)}</button>`,
        sub: [p.Position, p.Department, p.Extension && `ต่อ ${p.Extension}`].filter(Boolean).join(' · ') })) },
      { title: '📝 แบบฟอร์ม', rows: forms.filter((f) => f.IsActive !== false
          && hit(q, f.Title, f.FormCode, f.Description, f.Department)).map((f) => ({
        html: f.ExternalUrl
          ? `<a href="${esc(f.ExternalUrl)}" target="_blank" rel="noopener">${esc(f.Title)} ↗</a>`
          : `<a href="#/form/${esc(f.FormCode || '')}">${esc(f.Title)}</a>`,
        sub: [f.FormCode, f.Department].filter(Boolean).join(' · ') })) },
      { title: '📜 นโยบายบริษัท', rows: policies.filter((d) => d.IsActive !== false
          && hit(q, d.Title, d.DocCode, d.Description, d.Category)).map((d) => ({
        html: `<a href="${esc(fileLink(d, '#/policies'))}"${toFiles(d.Files).length ? ' target="_blank" rel="noopener"' : ''}>${esc(d.Title)}</a>`,
        sub: [d.DocCode, d.Category].filter(Boolean).join(' · ') })) },
      { title: '📚 เอกสาร/คู่มือ', rows: docs.filter((d) => d.IsActive !== false
          && hit(q, d.Title, d.DocCode, d.Description, d.Category, d.Department)).map((d) => ({
        html: `<a href="${esc(fileLink(d, '#/documents'))}"${toFiles(d.Files).length ? ' target="_blank" rel="noopener"' : ''}>${esc(d.Title)}</a>`,
        sub: [d.DocCode, d.Category, d.Department].filter(Boolean).join(' · ') })) },
      { title: '🏗 โครงการ', rows: projects.filter((p) => hit(q, p.Title, p.ProjectCode, p.Department,
          p.Owner, toArray(p.Team).join(' '))).map((p) => ({
        html: `<a href="#/projects">${esc(p.Title)}</a>`,
        sub: [p.ProjectCode, p.Status, p.Owner && `ผู้รับผิดชอบ ${p.Owner}`].filter(Boolean).join(' · ') })) },
      { title: '📨 คำขอ', rows: reqs.filter((r) => (state.isAdmin || norm(r.RequesterEmail) === me)
          && hit(q, r.Title, r.FormName, formCodeOf(r), r.RequesterName, r.Status)).map((r) => ({
        html: `<a href="#/requests/${esc(r.id)}">${esc(r.Title)}</a>`,
        sub: [r.FormName, r.Status, state.isAdmin && r.RequesterName].filter(Boolean).join(' · ') })) },
    ].filter((g) => g.rows.length);

    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    body = total ? `
      <p class="sr-count">พบ ${total} รายการ</p>
      ${groups.map((g) => `
        <section class="panel sr-group">
          <div class="panel-head"><h2>${g.title}</h2><span class="panel-meta">${g.rows.length} รายการ</span></div>
          <ul class="sr-list">
            ${g.rows.slice(0, LIMIT).map((r) => `<li>${r.html}${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</li>`).join('')}
          </ul>
          ${g.rows.length > LIMIT ? `<div class="sr-more">…และอีก ${g.rows.length - LIMIT} รายการ · พิมพ์คำค้นให้เจาะจงขึ้น</div>` : ''}
        </section>`).join('')}`
      : `<div class="panel"><div class="empty">ไม่พบ "${esc(raw)}" · ลองค้นด้วยคำที่สั้นลง หรือสะกดแบบอื่น</div></div>`;
  }

  return `
  <section class="page page-search">
    <div class="wrap">
      <h1 class="page-title">${meta.title}</h1>
      <form class="sr-form" id="sr-form" role="search">
        <input id="sr-q" type="search" value="${esc(raw)}" placeholder="ค้นหาคน แบบฟอร์ม เอกสาร โครงการ คำขอ…" autocomplete="off" aria-label="คำค้นหา">
        <button class="btn btn-primary" type="submit">ค้นหา</button>
      </form>
      ${body}
    </div>
  </section>`;
}

export function mount() {
  const form = $('#sr-form');
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    location.hash = '#/search/' + encodeURIComponent($('#sr-q').value.trim());
  };
  const input = $('#sr-q');
  if (input && !queryOf()) input.focus();
  onClick('srperson', (id) => {
    const p = people.find((x) => String(x.id) === String(id));
    if (p) openPerson(p, null);
  });
}
