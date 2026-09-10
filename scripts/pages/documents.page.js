import { esc, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { groupByDepartment } from '../utils/dept.js';
import { state, setState } from '../core/state.js';
import { openModal } from '../components/modal.js';
import { thaiDateShort } from '../utils/format.js';
import { toFiles } from '../admin/entity-form.js';

export const meta = { route: 'documents', title: 'เอกสาร/คู่มือ', nav: true, order: 6, adminOnly: false };

let rows = [];

export async function render(ctx) {
  const tab = state.docTab || 'คู่มือ';
  const all = (await list('documents')).filter((d) => d.IsActive !== false);
  rows = all.filter((d) => d.DocType === tab);
  const groups = await groupByDepartment(rows);
  const tabs = ['คู่มือ', 'ไฟล์ดาวน์โหลด'];

  return `
  <section class="page page-documents">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">คู่มือการปฏิบัติงานและไฟล์ต้นแบบ แยกตามฝ่ายเจ้าของเอกสาร — นโยบายบริษัทอยู่ที่แท็บนโยบายบริษัท</p>

      <div class="doc-tabs">
        ${tabs.map((t) => `<button data-tab="${esc(t)}" aria-current="${tab === t ? 'page' : 'false'}">
          ${esc(t)} <b>${all.filter((d) => d.DocType === t).length}</b></button>`).join('')}
      </div>

      ${groups.length ? groups.map((g) => `
        <section class="dept-group">
          <div class="dept-head"><h2>${esc(g.name)}</h2>
            <span class="dept-meta">${g.rows.length} รายการ</span></div>
          <div class="panel"><table>
            <thead><tr>
              <th>ชื่อเอกสาร</th>
              ${tab === 'คู่มือ' ? '<th style="width:170px">อัปเดตล่าสุด</th>'
                                 : '<th style="width:90px">ชนิด</th><th style="width:100px">ขนาด</th>'}
              <th style="width:90px">ไฟล์แนบ</th><th class="col-actions"></th>
            </tr></thead>
            <tbody>${g.rows.map((d) => `<tr>
              <td><button class="linky" data-doc="${d.id}">${d.Icon} ${esc(d.Title)}</button></td>
              ${tab === 'คู่มือ' ? `<td>${esc(thaiDateShort(d.LastUpdated))}</td>`
                : `<td class="code">${esc(d.FileFormat || '')}</td><td>${esc(d.FileSize || '')}</td>`}
              <td>${toFiles(d.Files).length ? '📎 ' + toFiles(d.Files).length : '—'}</td>
              <td class="col-actions"><button class="btn-mini" data-doc="${d.id}">${
                tab === 'คู่มือ' ? 'เปิดอ่าน' : 'เปิดดู'}</button></td>
            </tr>`).join('')}</tbody>
          </table></div>
        </section>`).join('')
      : `<div class="panel"><div class="empty">ยังไม่มีเอกสารในหมวดนี้</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  onClick('tab', (t) => setState({ docTab: t }));
  onClick('doc', (id) => {
    const d = rows.find((r) => String(r.id) === String(id));
    if (!d) return;
    const files = toFiles(d.Files);
    openModal({
      title: d.Title, wide: true,
      body: `
        <div class="doc-meta">${[d.Department, d.FileFormat, d.FileSize, thaiDateShort(d.LastUpdated)]
          .filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        ${d.Description ? `<div class="doc-body">${esc(d.Description)}</div>`
                        : `<div class="doc-empty">ยังไม่ได้ใส่คำอธิบายสำหรับเอกสารนี้</div>`}
        ${files.length ? `<div class="doc-files"><h4>ไฟล์แนบ ${files.length} ไฟล์</h4>
          ${files.map((a) => `<a class="doc-file" href="${esc(a.url)}" target="_blank" rel="noopener">
            <span>${/^(JPG|JPEG|PNG|GIF|WEBP)$/.test(a.kind) ? '🖼' : '📄'}</span>
            <b>${esc(a.name)}</b>
            <span class="doc-file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
          </a>`).join('')}</div>` : ''}
`,
    });
  });
}
