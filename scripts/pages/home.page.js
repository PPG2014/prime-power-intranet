import { esc, onClick } from '../core/dom.js';
import { openModal } from '../components/modal.js';
import { toFiles } from '../admin/entity-form.js';
import { list } from '../services/data.js';
import { thaiDateShort } from '../utils/format.js';

export const meta = { route: 'home', title: 'หน้าแรก', nav: true, order: 1, adminOnly: false };

let newsRows = [];

export async function render(ctx) {
  const [forms, news, docs] = await Promise.all([
    list('formCatalog'), list('news'), list('documents'),
  ]);

  const popular = forms.filter((f) => f.Badge === 'ใช้บ่อย' || f.Badge === 'ใหม่').slice(0, 6);
  const pinned  = news.filter((n) => n.IsActive !== false)
                      .sort((a, b) => (b.IsPinned ? 1 : 0) - (a.IsPinned ? 1 : 0));
  const manuals = docs.filter((d) => d.DocType === 'คู่มือ').slice(0, 3);

  return `
  <section class="hero">
    <div class="wrap">
      <h1>ระบบแบบฟอร์มออนไลน์</h1>
      <p>ยื่นคำขอ ติดตามสถานะ และรับการอนุมัติได้ในที่เดียว — เชื่อมต่อกับ Microsoft 365 ขององค์กร ปลอดภัยด้วยบัญชีบุคลากร</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/forms">ดูแบบฟอร์มทั้งหมด</a>
        <a class="btn btn-ghost" href="#/requests">ติดตามสถานะคำขอ</a>
      </div>
    </div>
  </section>

  <section class="page page-home">
    <div class="wrap">
      <h2 class="section-title">แบบฟอร์มที่ใช้บ่อย</h2>
      <div class="form-grid">
        ${popular.map((f) => `
          ${f.ExternalUrl ? `<a class="form-card" href="${esc(f.ExternalUrl)}" target="_blank" rel="noopener">`
                          : `<a class="form-card" href="#/forms">`}
            <div class="form-icon">${f.Icon}</div>
            <div class="form-name">${esc(f.Title)}</div>
            <div class="form-desc">${esc(f.Description)}</div>
            <div class="form-go">${f.ExternalUrl ? 'เปิดระบบ ↗' : 'กรอกแบบฟอร์ม →'}</div>
          </a>`).join('')}
      </div>

      <div class="home-cols">
        <div class="panel">
          <div class="panel-head">📢 ข่าวประกาศ</div>
          <ul class="news-list">
            ${pinned.map((n) => `<li>
              <button class="linky" data-news="${n.id}">${
                n.IsPinned ? '<b class="pin">ปักหมุด</b> ' : ''}${esc(n.Title)}</button>
              <time>${esc(thaiDateShort(n.PublishDate))}</time></li>`).join('')}
          </ul>
        </div>
        <div class="panel">
          <div class="panel-head">📚 คู่มือการใช้งาน
            <a class="panel-link" href="#/documents">ดูทั้งหมด →</a></div>
          <ul class="news-list">
            ${manuals.map((d) => `<li>
              <span>${d.Icon} ${esc(d.Title)}</span>
              <time>${esc(thaiDateShort(d.LastUpdated))}</time></li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
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
