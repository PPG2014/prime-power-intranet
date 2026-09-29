/**
 * บันทึกหน้ารายงานเป็นรูปภาพ PNG / JPG ขนาด Full HD 1920×1080 พิกเซล
 *
 * ใช้ html2canvas (เก็บไว้ใน assets/vendor ไม่ดึงจาก CDN เพราะ CSP อนุญาตสคริปต์จากเว็บนี้เท่านั้น)
 * วิธี: คัดลอกหน้าไปวางในกรอบขนาด 1280×720 (สัดส่วน 16:9) แล้ววาดด้วย scale 1.5 → ได้ 1920×1080 พอดี
 * เลือก 1 หน้า = ดาวน์โหลดรูปเดียว · หลายหน้า = รวมเป็น ZIP (JSZip) มีโฟลเดอร์ชื่อ zipName อยู่ข้างใน
 * อัปเดตไลบรารี: npm pack html2canvas / jszip แล้วคัดลอกไฟล์ใน dist/ มาทับใน assets/vendor
 */
const LIB = 'assets/vendor/html2canvas.min.js';
const ZIP_LIB = 'assets/vendor/jszip.min.js';
export const IMG_W = 1920;
export const IMG_H = 1080;
const SCALE = 1.5;                     // 1280×720 × 1.5 = 1920×1080

const loading = {};
/** โหลดสคริปต์จาก assets/vendor ครั้งเดียว แล้วคืนตัวแปร global ที่สคริปต์สร้าง */
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!loading[src]) {
    loading[src] = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (window[globalName] ? ok(window[globalName]) : fail(new Error('โหลด ' + src + ' แล้วใช้งานไม่ได้')));
      s.onerror = () => { delete loading[src]; fail(new Error('โหลดไฟล์ ' + src + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * pages      = [{ el, name }] หน้าที่จะวาด — el คือ element ของหน้า (คัดลอกไปวาด ไม่แตะของเดิม)
 *              name คือชื่อไฟล์ของหน้านั้นใน ZIP (ไม่รวมนามสกุล)
 * stageClass = คลาสของกรอบวาด ใช้จัดหน้าตาเฉพาะตอนเป็นรูป (ตัวแปรสี/ฟอนต์ของรายงานต้องอยู่ในนี้)
 * fmt        = 'png' | 'jpg'
 * single     = ชื่อไฟล์เมื่อได้รูปเดียว (ไม่รวมนามสกุล)
 * zipName    = ชื่อไฟล์ ZIP และชื่อโฟลเดอร์ข้างใน เมื่อได้หลายรูป
 * fonts      = ฟอนต์ที่ต้องโหลดก่อนวาด เช่น ['400 16px "Report Sarabun"']
 * onProgress(done, total, phase) — phase: 'draw' | 'zip'
 */
export async function exportPagesAsImages(pages, {
  stageClass, fmt = 'png', single = 'report', zipName = 'report', fonts = [], onProgress = () => {},
}) {
  const html2canvas = await loadScript(LIB, 'html2canvas');
  const JSZip = pages.length > 1 ? await loadScript(ZIP_LIB, 'JSZip') : null;
  // ฟอนต์ไทยต้องโหลดครบก่อนวาด ไม่งั้นรูปจะใช้ฟอนต์สำรองและตำแหน่งข้อความเพี้ยน
  if (document.fonts) {
    await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  }

  const stage = document.createElement('div');
  stage.className = stageClass;
  stage.setAttribute('aria-hidden', 'true');
  // วางไว้มุมบนซ้ายหลังเนื้อหาทั้งหมด html2canvas วาดตำแหน่งนี้ได้แม่นที่สุด
  stage.style.cssText = `position:fixed;left:0;top:0;width:${IMG_W / SCALE}px;height:${IMG_H / SCALE}px;`
    + 'z-index:-1;pointer-events:none;overflow:hidden;background:#fff;';
  document.body.appendChild(stage);

  // บั๊กที่รู้กันของ html2canvas: วัดเส้นฐานตัวอักษรด้วย <img> ซ่อนบนหน้าเว็บจริง
  // แต่ reset.css ตั้ง img เป็น display:block ทำให้วัดผิด ข้อความในรูปจะต่ำลงทุกบรรทัด
  // จึงคืนค่า img เป็น inline ชั่วคราวระหว่างสร้างรูป แล้วลบออกเมื่อเสร็จ
  const fix = document.createElement('style');
  fix.textContent = 'img { display: inline-block !important; }';
  document.head.appendChild(fix);

  const type = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const blobs = [];
  try {
    for (let i = 0; i < pages.length; i += 1) {
      stage.replaceChildren(pages[i].el.cloneNode(true));
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(stage, {
        scale: SCALE, width: IMG_W / SCALE, height: IMG_H / SCALE,
        windowWidth: IMG_W / SCALE, windowHeight: IMG_H / SCALE,
        scrollX: 0, scrollY: 0, x: 0, y: 0,
        backgroundColor: '#ffffff', logging: false, useCORS: true,
      });
      // eslint-disable-next-line no-await-in-loop
      blobs.push(await new Promise((ok) => canvas.toBlob(ok, type, 0.95)));
      onProgress(i + 1, pages.length, 'draw');
    }
  } finally {
    stage.remove();
    fix.remove();
  }

  if (blobs.length === 1) {
    save(blobs[0], `${single}.${fmt}`);
    return;
  }
  // หลายรูป: รวมเป็น ZIP ไฟล์เดียว มีโฟลเดอร์ชื่อเดียวกับไฟล์อยู่ข้างใน (แตกไฟล์แล้วได้โฟลเดอร์พร้อมใช้)
  onProgress(blobs.length, blobs.length, 'zip');
  const zip = new JSZip();
  const dir = zip.folder(zipName);
  blobs.forEach((b, i) => dir.file(`${pages[i].name}.${fmt}`, b));
  save(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${zipName}.zip`);
}
