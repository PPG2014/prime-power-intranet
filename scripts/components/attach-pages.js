/**
 * เอกสารแนบต่อท้ายเอกสารที่ส่งออก (หน้า 2 เป็นต้นไป) — ขนาดหน้า A4 หนึ่งไฟล์/หนึ่งหน้า
 *
 *   - รูปภาพ (jpg png gif webp bmp) → 1 หน้า ย่อให้พอดีหน้า A4
 *   - PDF → ทุกหน้าของไฟล์ (สูงสุด MAX_PDF_PAGES หน้า) วาดด้วย pdf.js เป็นภาพทีละหน้า
 *   - ไฟล์ชนิดอื่น (Word / Excel …) แสดงในเอกสารไม่ได้ → หน้าบอกชื่อไฟล์ให้พิมพ์แยก
 *
 * pdf.js เก็บไว้ใน assets/vendor/pdfjs (CSP อนุญาตสคริปต์จากเว็บนี้เท่านั้น)
 * อัปเดต: npm pack pdfjs-dist แล้วคัดลอก legacy/build/pdf.min.js + pdf.worker.min.js มาทับ
 */
import { esc } from '../core/dom.js';
import { photoBlobUrl } from '../services/photos.js';
import { loadScript } from '../utils/page-image.js';

const PDF_LIB = 'assets/vendor/pdfjs/pdf.min.js';
const PDF_WORKER = 'assets/vendor/pdfjs/pdf.worker.min.js';
const MAX_PDF_PAGES = 30;
const RENDER_W = 1400;   // ความกว้างภาพที่วาดจาก PDF (พอสำหรับพิมพ์ A4 คมชัด)

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const PDF_RE = /\.pdf$/i;
const nameOf = (f) => String((f && (f.name || f.Title)) || (f && f.url ? decodeURIComponent(String(f.url).split('/').pop().split('?')[0]) : '') || 'ไฟล์แนบ');

/** ไฟล์แนบทั้งหมดของคำขอ (ทุกช่องชนิดไฟล์ ไม่ซ้ำกัน) */
export function attachmentsOf(fields = [], values = {}) {
  const seen = new Set();
  const out = [];
  fields.filter((f) => f.FieldType === 'file').forEach((f) => {
    (Array.isArray(values[f.FieldKey]) ? values[f.FieldKey] : []).forEach((x) => {
      const url = x && typeof x === 'object' ? x.url : '';
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ name: nameOf(x), url });
    });
  });
  return out;
}

const page = (head, body) => `<section class="ex-att-page"><div class="ex-att-head">${head}</div><div class="ex-att-body">${body}</div></section>`;

async function pdfPages(url) {
  const lib = await loadScript(PDF_LIB, 'pdfjsLib');
  lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const src = await photoBlobUrl(url);   // ไฟล์ใน SharePoint ต้องแนบ token → ได้ blob URL
  const doc = await lib.getDocument({ url: src, isEvalSupported: false }).promise;
  const n = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const p = await doc.getPage(i);
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: RENDER_W / base.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: g, viewport: vp }).promise;
    out.push(c.toDataURL('image/jpeg', 0.9));
  }
  return { pages: out, total: doc.numPages };
}

/**
 * วาดหน้าเอกสารแนบลงกล่อง box · คืน Promise ที่เสร็จเมื่อทุกหน้าพร้อมพิมพ์
 * onProgress(ข้อความ) ใช้บอกสถานะระหว่างโหลด
 */
export async function renderAttachPages(box, files, { onProgress = () => {} } = {}) {
  const html = [];
  const all = files.length;
  for (let k = 0; k < all; k += 1) {
    const f = files[k];
    const tag = `เอกสารแนบ ${k + 1}/${all} · ${esc(f.name)}`;
    onProgress(`กำลังเตรียมเอกสารแนบ ${k + 1}/${all} — ${f.name}`);
    try {
      if (PDF_RE.test(f.name)) {
        const { pages, total } = await pdfPages(f.url);
        pages.forEach((src, i) => html.push(page(`${tag} · หน้า ${i + 1}/${total}`, `<img src="${src}" alt="">`)));
        if (total > pages.length) html.push(page(tag, `<div class="ex-att-other">แสดง ${pages.length} หน้าแรกจาก ${total} หน้า — หน้าที่เหลือพิมพ์จากไฟล์ต้นฉบับ</div>`));
      } else if (IMG_RE.test(f.name)) {
        const src = await photoBlobUrl(f.url);
        await new Promise((ok) => { const im = new Image(); im.onload = ok; im.onerror = ok; im.src = src; });
        html.push(page(tag, `<img src="${esc(src)}" alt="">`));
      } else {
        html.push(page(tag, `<div class="ex-att-other">📄 <b>${esc(f.name)}</b><br>ไฟล์ชนิดนี้แสดงในเอกสารไม่ได้ — เปิดไฟล์แล้วพิมพ์แยก หรือแนบเป็น PDF / รูปภาพ</div>`));
      }
    } catch (e) {
      html.push(page(tag, `<div class="ex-att-other">⚠ โหลด <b>${esc(f.name)}</b> ไม่สำเร็จ — ${esc(e.message || '')}</div>`));
    }
    box.innerHTML = html.join('');
  }
  onProgress('');
}
