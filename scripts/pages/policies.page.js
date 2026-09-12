import { esc, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { openModal } from '../components/modal.js';
import { dataTable } from '../components/data-table.js';
import { thaiDateShort } from '../utils/format.js';
import { toFiles } from '../admin/entity-form.js';

export const meta = { route: 'policies', title: 'นโยบายบริษัท', nav: true, order: 2, adminOnly: false };

let rows = [];

export async function render(ctx) {
  rows = (await list('policies'))
    .filter((p) => p.IsActive !== false)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));

  const table = dataTable({
    columns: [
      { label: 'เลขที่', width: '110px', value: (r) => r.DocCode },
      { label: 'ชื่อเอกสาร', raw: true,
        value: (r) => `<button class="linky" data-policy="${r.id}">${esc(r.Title)}</button>` },
      { label: 'ฉบับแก้ไข', width: '120px', value: (r) => r.Revision },
      { label: 'ประกาศใช้', width: '130px', value: (r) => thaiDateShort(r.EffectiveDate) },
      { label: 'ไฟล์แนบ', width: '100px',
        value: (r) => (toFiles(r.Files).length ? `📎 ${toFiles(r.Files).length}` : '—') },
    ],
    rows,
    actions: (r) => `<button class="btn-mini" data-policy="${r.id}">เปิดอ่าน</button>`,
    empty: 'ยังไม่มีนโยบายในระบบ',
  });

  return `
  <section class="page page-policies">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">นโยบายและระเบียบปฏิบัติฉบับที่บังคับใช้อยู่ปัจจุบัน กดที่ชื่อเอกสารเพื่ออ่านเนื้อหาและเปิดไฟล์แนบ</p>
      ${table}
      <p class="fineprint">เอกสารทุกฉบับควบคุมเลขที่และฉบับแก้ไข หากพบเอกสารที่ไม่ตรงกับรายการนี้ ถือเป็นฉบับยกเลิก</p>
    </div>
  </section>`;
}

/** รูปแสดงเลย · ไฟล์อื่นเป็นลิงก์กดเปิด */
function renderAttachments(files) {
  if (!files.length) return '';
  const isImg = (a) => /^(JPG|JPEG|PNG|GIF|WEBP)$/.test(a.kind);
  const imgs = files.filter(isImg);
  const docs = files.filter((a) => !isImg(a));
  return `<div class="doc-files"><h4>ไฟล์แนบ ${files.length} ไฟล์</h4>
    ${imgs.map((a) => `<figure class="doc-img">
        <img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy">
        <figcaption>${esc(a.name)}</figcaption></figure>`).join('')}
    ${docs.map((a) => `<a class="doc-file" href="${esc(a.url)}" target="_blank" rel="noopener">
        <span>📄</span><b>${esc(a.name)}</b>
        <span class="doc-file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
      </a>`).join('')}</div>`;
}

export function mount(ctx) {
  onClick('policy', (id) => {
    const p = rows.find((r) => String(r.id) === String(id));
    if (!p) return;
    const files = toFiles(p.Files);
    openModal({
      title: p.Title,
      wide: true,
      body: `
        <div class="doc-meta">
          ${[p.DocCode, p.Revision, thaiDateShort(p.EffectiveDate), p.Department]
            .filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}
        </div>
        ${p.Content
          ? `<div class="doc-body">${esc(p.Content)}</div>`
          : `<div class="doc-empty">ยังไม่ได้ใส่เนื้อหาสำหรับเอกสารนี้</div>`}
        ${renderAttachments(files)}
`,
    });
  });
}
