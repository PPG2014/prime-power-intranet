import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toFiles } from '../admin/entity-form.js';
import { renderDashboard, mountDashboard } from './projects.page.js';

export const meta = { route: 'home', title: 'หน้าแรก', nav: true, order: 1, adminOnly: false };

let newsRows = [];

export async function render(ctx) {
  const [forms, news, docs, dashboard] = await Promise.all([
    list('formCatalog'), list('news'), list('documents'), renderDashboard(),
  ]);

  newsRows = news.filter((n) => n.IsActive !== false);

  const popular = forms
    .filter((f) => f.IsActive !== false && (f.Badge === 'ใช้บ่อย' || f.Badge === 'ใหม่'))
    .slice(0, 6);
  const pinned = [...newsRows]
    .sort((a, b) => (b.IsPinned ? 1 : 0) - (a.IsPinned ? 1 : 0))
    .slice(0, 6);
  const manuals = docs.filter((d) => d.DocType === 'คู่มือ' && d.IsActive !== false).slice(0, 5);

  return `
  <section class="page page-home">
    <div class="wrap">
      <div class="home-layout">

        <main class="home-main">
          <h1 class="page-title">ความคืบหน้าโครงการ</h1>
          <p class="page-lead">ภาพรวมของทุกโครงการ เทียบแผนกับผลจริงและยอดเบิกจ่าย</p>
          ${dashboard}
        </main>

        <aside class="home-side">
          <div class="panel side-panel">
            <div class="panel-head">📋 แบบฟอร์มที่ใช้บ่อย
              <a class="panel-link" href="#/forms">ทั้งหมด →</a></div>
            ${popular.length ? `<ul class="side-list">
              ${popular.map((f) => `<li>
                ${f.ExternalUrl
                  ? `<a href="${esc(f.ExternalUrl)}" target="_blank" rel="noopener">
                      <span class="si">${f.Icon || '📄'}</span>
                      <span class="st">${esc(f.Title)}</span><span class="sx">↗</span></a>`
                  : `<a href="#/forms"><span class="si">${f.Icon || '📄'}</span>
                      <span class="st">${esc(f.Title)}</span></a>`}
              </li>`).join('')}</ul>`
              : '<div class="side-empty">ยังไม่มีแบบฟอร์มที่ติดป้ายใช้บ่อย</div>'}
          </div>

          <div class="panel side-panel">
            <div class="panel-head">📢 ข่าวประกาศ</div>
            ${pinned.length ? `<ul class="side-list">
              ${pinned.map((n) => `<li>
                <button data-news="${n.id}">
                  <span class="st">${n.IsPinned ? '<b class="pin">ปักหมุด</b> ' : ''}${esc(n.Title)}</span>
                  <time>${esc(thaiDateShort(n.PublishDate))}</time>
                </button></li>`).join('')}</ul>`
              : '<div class="side-empty">ยังไม่มีข่าวประกาศ</div>'}
          </div>

          <div class="panel side-panel">
            <div class="panel-head">📚 คู่มือการใช้งาน
              <a class="panel-link" href="#/documents">ทั้งหมด →</a></div>
            ${manuals.length ? `<ul class="side-list">
              ${manuals.map((d) => `<li>
                <a href="#/documents"><span class="si">${d.Icon || '📘'}</span>
                  <span class="st">${esc(d.Title)}</span></a></li>`).join('')}</ul>`
              : '<div class="side-empty">ยังไม่มีคู่มือ</div>'}
          </div>
        </aside>

      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
  mountDashboard();

  onClick('news', (id) => {
    const n = newsRows.find((r) => String(r.id) === String(id));
    if (!n) return;
    const files = toFiles(n.Files);
    openModal({
      title: n.Title, wide: true,
      body: `
        <div class="doc-meta"><span>${esc(thaiDateShort(n.PublishDate))}</span></div>
        ${n.Content ? `<div class="doc-body">${esc(n.Content)}</div>`
                    : '<div class="doc-empty">ยังไม่ได้ใส่เนื้อหาสำหรับข่าวนี้</div>'}
        ${files.length ? `<div class="doc-files"><h4>ไฟล์แนบ ${files.length} ไฟล์</h4>
          ${files.map((a) => `<a class="doc-file" href="${esc(a.url)}" target="_blank" rel="noopener">
            <span>${/^(JPG|JPEG|PNG|GIF|WEBP)$/.test(a.kind) ? '🖼' : '📄'}</span>
            <b>${esc(a.name)}</b>
            <span class="doc-file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
          </a>`).join('')}</div>` : ''}`,
    });
  });
}
