/**
 * ข้อความแจ้งเรื่องผลทางกฎหมายของเอกสารอิเล็กทรอนิกส์
 * ขึ้นทุกครั้งก่อนพิมพ์ / บันทึกเอกสารจากแบบฟอร์มเป็น PDF แล้วค่อยเปิดหน้าต่างพิมพ์
 *
 * ขึ้นเป็นชั้นแยกเหนือหน้าต่างเอกสาร (ไม่แทนที่ #overlay-root) จึงยังเห็นเอกสารอยู่ด้านหลัง
 * กดยกเลิก = ไม่พิมพ์ กลับไปดูเอกสารต่อ
 */
const ETDA_URL = 'https://www.etda.or.th';

function notice() {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'eta-mask';
    layer.innerHTML = `
      <div class="eta-box" role="dialog" aria-modal="true" aria-labelledby="eta-title">
        <div class="eta-head" id="eta-title">⚖️ พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544</div>
        <div class="eta-body">
          <p>กฎหมายฉบับนี้เป็นกฎหมายกลางที่รองรับผลทางกฎหมายของข้อมูลและเอกสารอิเล็กทรอนิกส์ทั้งหมด
            มีหลักการสำคัญคือ:</p>
          <ul>
            <li><b>การรับรองสถานะ:</b> ห้ามปฏิเสธความมีผลผูกพันและการบังคับใช้กฎหมายของข้อความ
              เพียงเพราะเหตุที่ข้อความนั้นอยู่ในรูปของข้อมูลอิเล็กทรอนิกส์</li>
            <li><b>ผลเทียบเท่าเอกสารกระดาษ:</b> เอกสารที่ทำในรูปแบบอิเล็กทรอนิกส์ (e-Document)
              หากสามารถเข้าถึงและนำกลับมาใช้ใหม่ได้โดยความหมายไม่เปลี่ยนแปลง
              ให้ถือว่ามีผลเทียบเท่ากับการทำเป็นลายลักษณ์อักษรหรือเอกสารต้นฉบับ</li>
            <li><b>ลายมือชื่ออิเล็กทรอนิกส์ (e-Signature):</b> รองรับการเซ็นชื่อดิจิทัลให้มีผลทางกฎหมาย
              เสมือนการจรดปากกาลงบนกระดาษ</li>
          </ul>
          <p class="eta-src">ที่มา: <a href="${ETDA_URL}" target="_blank" rel="noopener">www.etda.or.th</a></p>
        </div>
        <div class="eta-foot">
          <button type="button" class="btn-mini" data-eta="0">ยกเลิก</button>
          <button type="button" class="btn btn-primary" data-eta="1">รับทราบ · พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>`;
    const done = (ok) => {
      layer.remove();
      removeEventListener('keydown', onKey, true);
      resolve(ok);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    layer.querySelectorAll('[data-eta]').forEach((b) => { b.onclick = () => done(b.dataset.eta === '1'); });
    addEventListener('keydown', onKey, true);
    document.body.appendChild(layer);
    layer.querySelector('[data-eta="1"]').focus();
  });
}

/**
 * แจ้งข้อความตามกฎหมายก่อน แล้วค่อยพิมพ์
 * bodyClass = คลาสที่ซ่อนส่วนอื่นของหน้าตอนพิมพ์ เช่น printing-pr / printing-doc
 */
export async function printWithNotice(bodyClass) {
  if (!(await notice())) return;
  document.body.classList.add(bodyClass);
  window.print();
  setTimeout(() => document.body.classList.remove(bodyClass), 500);
}
