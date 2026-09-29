/**
 * บันทึกหน้ารายงานเป็นรูปภาพ PNG / JPG ขนาด Full HD 1920×1080 พิกเซล
 *
 * ใช้ html2canvas (เก็บไว้ใน assets/vendor ไม่ดึงจาก CDN เพราะ CSP อนุญาตสคริปต์จากเว็บนี้เท่านั้น)
 * วิธี: คัดลอกหน้าไปวางในกรอบขนาด 1280×720 (สัดส่วน 16:9) แล้ววาดด้วย scale 1.5 → ได้ 1920×1080 พอดี
 * อัปเดตไลบรารี: npm pack html2canvas แล้วคัดลอก dist/html2canvas.min.js มาทับ
 */
const LIB = 'assets/vendor/html2canvas.min.js';
export const IMG_W = 1920;
export const IMG_H = 1080;
const SCALE = 1.5;                     // 1280×720 × 1.5 = 1920×1080

let loading = null;
function loadLib() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!loading) {
    loading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => (window.html2canvas ? ok(window.html2canvas) : fail(new Error('โหลดตัวสร้างรูปไม่สำเร็จ')));
      s.onerror = () => { loading = null; fail(new Error('โหลดไฟล์ ' + LIB + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  return loading;
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
 * pages     = element ของแต่ละหน้า (คัดลอกไปวาด ไม่แตะของเดิม)
 * stageClass = คลาสของกรอบวาด ใช้จัดหน้าตาเฉพาะตอนเป็นรูป (ตัวแปรสี/ฟอนต์ของรายงานต้องอยู่ในนี้)
 * fmt       = 'png' | 'jpg' · baseName = ชื่อไฟล์ (ไม่รวมเลขหน้าและนามสกุล)
 * fonts     = ฟอนต์ที่ต้องโหลดก่อนวาด เช่น ['400 16px "Report Sarabun"']
 * onProgress(done, total)
 */
export async function exportPagesAsImages(pages, {
  stageClass, fmt = 'png', baseName = 'report', fonts = [], onProgress = () => {},
}) {
  const html2canvas = await loadLib();
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
  const pad = String(pages.length).length;
  try {
    for (let i = 0; i < pages.length; i += 1) {
      stage.replaceChildren(pages[i].cloneNode(true));
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(stage, {
        scale: SCALE, width: IMG_W / SCALE, height: IMG_H / SCALE,
        windowWidth: IMG_W / SCALE, windowHeight: IMG_H / SCALE,
        scrollX: 0, scrollY: 0, x: 0, y: 0,
        backgroundColor: '#ffffff', logging: false, useCORS: true,
      });
      // eslint-disable-next-line no-await-in-loop
      const blob = await new Promise((ok) => canvas.toBlob(ok, type, 0.95));
      save(blob, `${baseName}-p${String(i + 1).padStart(pad, '0')}.${fmt}`);
      onProgress(i + 1, pages.length);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));   // เว้นจังหวะ เบราว์เซอร์จะได้ไม่ตัดการดาวน์โหลดทิ้ง
    }
  } finally {
    stage.remove();
    fix.remove();
  }
}
