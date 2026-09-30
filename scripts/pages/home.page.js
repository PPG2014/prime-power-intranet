import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toFiles } from '../admin/entity-form.js';
import { renderDashboard, mountDashboard } from './projects.page.js';
import { attachedFiles } from '../components/form-renderer.js';
import { companySocial } from '../components/company-social.js';

export const meta = { route: 'home', title: 'หน้าแรก', nav: true, order: 1, adminOnly: false };

let newsRows = [];
let msgCodeList = [];   // รหัสฟอร์มจองคิว Messenger ทุกตัว ใช้เปิดปฏิทินคิวทั้งหมด

export async function render(ctx) {
  const [forms, news, docs, requests, dashboard] = await Promise.all([
    list('formCatalog'), list('news'), list('documents'),
    list('requests').catch(() => []), renderDashboard(),
  ]);

  // คำขอจองคิว Messenger ของวันนี้ ดึงวันที่ที่ขอใช้จากคำตอบในฟอร์ม
  const today = new Date().toISOString().slice(0, 10);
  // หารหัสฟอร์มจองคิว Messenger จากทะเบียนแบบฟอร์มเอง เผื่อรหัส ISO เปลี่ยน
  const msgCodes = new Set(forms
    .filter((f) => /messenger|จองคิว/i.test(`${f.Title} ${f.Description || ''}`))
    .map((f) => String(f.FormCode || '').trim()));
  ['FM-ADM-006', 'FM-HR-003'].forEach((c) => msgCodes.add(c));
  msgCodeList = [...msgCodes].filter(Boolean);

  // แสดงคิวของวันนี้ทุกคำขอ ไม่ว่าใครเป็นคนจอง ยกเว้นใบที่ยกเลิก/ไม่อนุมัติ
  const messengerToday = requests
    .filter((r) => msgCodes.has(String(r.FormCode || '').trim())
      && !['ยกเลิก', 'ไม่อนุมัติ'].includes(String(r.Status || '').trim()))
    .map((r) => { try { return { r, d: JSON.parse(r.FormData || '{}') }; } catch (e) { return null; } })
    .filter((x) => x && String(x.d.service_date || '').slice(0, 10) === today)
    // เติม 0 หน้าเวลาก่อนเทียบ ไม่งั้น "10:00" จะมาก่อน "9:00"
    .sort((a, b) => String(a.d.time_from || a.d.time_slot || '').padStart(5, '0')
      .localeCompare(String(b.d.time_from || b.d.time_slot || '').padStart(5, '0')));

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
          <div class="panel side-panel">
            <div class="panel-head">🏍 จองคิว Messenger วันนี้
              <button type="button" class="panel-link" data-msgall="1">ดูทั้งหมด →</button></div>
            ${messengerToday.length ? `<ul class="side-list msg-list">
              ${messengerToday.map(({ r, d }) => `<li>
                <div class="msg-row">
                  <span class="msg-time">${esc(d.time_from ? `${d.time_from}–${d.time_to || ''}` : (d.time_slot || ''))}</span>
                  <span class="st">${esc(d.place || d.job_detail || 'ไม่ระบุสถานที่')}</span>
                </div>
                <div class="msg-by">${esc(d.requester || r.RequesterName || '')}${
                  r.Status ? ` · <span class="dim">${esc(r.Status)}</span>` : ''}</div>
              </li>`).join('')}</ul>`
              : '<div class="side-empty">วันนี้ยังไม่มีการจองคิว</div>'}
          </div>

          ${companySocial({ compact: true })}

        </aside>

      </div>
    </div>
  </section>`;
}

/**
 * แถบข้างขวาติดจอตอนเลื่อน (sticky) แต่ถ้าสูงกว่าจอ ส่วนล่าง (เช่นกล่องติดต่อบริษัท)
 * จะไม่โผล่จนกว่าจะเลื่อนหน้าจนสุด — จึงตั้งจุดติดให้เป็น "ขอบล่างชนขอบจอ" แทน
 * แถบจะเลื่อนตามหน้าไปจนเห็นกล่องสุดท้าย แล้วค่อยติดอยู่ตรงนั้น
 */
const SIDE_TOP = 82;      // ตรงกับ top ใน home.css (ใต้หัวเว็บ)
function fitSidebar() {
  const side = $('.home-side');
  if (!side) return;
  const fit = () => {
    if (!document.body.contains(side)) { removeEventListener('resize', fit); ro.disconnect(); return; }
    const room = innerHeight - SIDE_TOP - 16;
    side.style.top = side.offsetHeight > room
      ? `${innerHeight - side.offsetHeight - 16}px` : `${SIDE_TOP}px`;
  };
  const ro = new ResizeObserver(fit);   // กล่องข้างในโหลดข้อมูลเสร็จแล้วสูงขึ้น ต้องคำนวณใหม่
  ro.observe(side);
  addEventListener('resize', fit);
  fit();
}

export function mount(ctx) {
  mountDashboard();
  fitSidebar();

  // เดิมลิงก์ไป #/requests?form=… ซึ่งเราเตอร์ไม่รู้จัก เลยค้างอยู่หน้าแรก
  // และหน้าติดตามสถานะก็ไม่แสดงคำขอของคนอื่นอยู่แล้ว จึงเปิดปฏิทินคิวทั้งหมดแทน
  onClick('msgall', async () => {
    openModal({ title: '🏍 คิว Messenger ทั้งหมด', wide: true, dismissable: true,
      body: '<div id="queue-cal"></div>' });
    const { mountQueueCalendar } = await import('../components/queue-calendar.js');
    await mountQueueCalendar(msgCodeList);
  });

  onClick('news', (id) => {
    const n = newsRows.find((r) => String(r.id) === String(id));
    if (!n) return;
    const files = toFiles(n.Files);
    // รูปภาพที่แนบ แสดงในหน้าต่างเลย (ย่อให้พอดีกรอบ ทั้งแนวตั้งและแนวนอน) · ไฟล์อื่นเป็นรายการให้เปิด
    const isImg = (a) => /^(JPG|JPEG|PNG|GIF|WEBP)$/i.test(a.kind || '')
      || /\.(jpe?g|png|gif|webp)$/i.test(a.name || '');
    const imgs = files.filter(isImg);
    const others = files.filter((a) => !isImg(a));
    openModal({
      title: n.Title, wide: true,
      body: `
        <div class="doc-meta"><span>${esc(thaiDateShort(n.PublishDate))}</span></div>
        ${imgs.length ? `<div class="news-imgs">${imgs.map((a) => `
          <a class="news-img" href="${esc(a.url)}" target="_blank" rel="noopener" title="เปิดรูปขนาดเต็ม">
            <img data-photo="${esc(a.url)}" alt="${esc(a.name || n.Title)}" loading="lazy"></a>`).join('')}</div>` : ''}
        ${n.Content ? `<div class="doc-body">${esc(n.Content)}</div>`
                    : (imgs.length ? '' : '<div class="doc-empty">ยังไม่ได้ใส่เนื้อหาสำหรับข่าวนี้</div>')}
        ${others.length ? `<div class="doc-files"><h4>ไฟล์แนบ ${others.length} ไฟล์</h4>
          ${others.map((a) => `<a class="doc-file" href="${esc(a.url)}" target="_blank" rel="noopener">
            <span>📄</span>
            <b>${esc(a.name)}</b>
            <span class="doc-file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
          </a>`).join('')}</div>` : ''}`,
    });
    // รูปใน SharePoint ต้องแนบ token จึงโหลดได้
    if (imgs.length) import('../services/photos.js').then((m) => m.hydratePhotos(document.getElementById('overlay-root')));
  });
}
