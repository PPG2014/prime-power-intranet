/**
 * แม่แบบเอกสาร FM-PUR-004 ใบขอสั่งซื้อ (PURCHASE REQUISITION) Rev.02
 *
 * วางทุกองค์ประกอบด้วยตำแหน่งเป็นมิลลิเมตรบนกระดาษ A4 ตามต้นฉบับ PDF
 * ข้อความตายตัวบนฟอร์ม (หัวข้อ ป้ายกำกับ ตำแหน่ง ท้ายกระดาษ) คงไว้ตามต้นฉบับทุกตัวอักษร
 * ข้อมูลจากคำขอจะถูกเติมลงช่องว่างเท่านั้น
 *
 * รายการเกิน 20 แถว จะขึ้นหน้าใหม่ด้วยฟอร์มเดิมทั้งใบ และเลขหน้ามุมขวาบนนับให้อัตโนมัติ
 */
import { esc } from '../core/dom.js';

export const PR_CODE = 'FM-PUR-004';
export const isPR = (code) => String(code || '').trim().toUpperCase() === PR_CODE;

const LOGO = 'assets/img/ppc-logo-2024.png';
const ROWS_PER_PAGE = 20;

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? v.Value ?? '') : String(v ?? '')).trim();

/** วันที่แบบฟอร์มราชการ 14/07/2568 */
export function thaiNumDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return clean(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

/** ค่าที่เลือก "อื่น ๆ" ให้แสดงข้อความที่ผู้ขอระบุแทน */
const withOther = (main, other) => {
  const m = clean(main);
  return /^อื่น/.test(m) && clean(other) ? clean(other) : m;
};

/**
 * สร้างเอกสารทุกหน้า
 * @param {object} p
 *   values     คำตอบในฟอร์ม (FormData)
 *   requester  { name, dept, position }
 *   submitted  วันที่ส่งคำร้อง (ใช้เป็นวันที่ออก PR)
 *   prNo       เลขที่ PR (ฝ่ายจัดซื้อกรอก เว้นว่างได้)
 *   sign       { approver, reviewer, director, purchasing } แต่ละช่อง { name, sig }
 */
export function renderPR({ values = {}, requester = {}, submitted = '', prNo = '', sign = {} }) {
  const items = (Array.isArray(values.items) ? values.items : [])
    .filter((r) => r && Object.values(r).some((x) => String(x ?? '').trim()));
  const pages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));

  const left = [
    ['โครงการ', clean(values.project)],
    ['ประเภทงาน', withOther(values.work_type, values.work_type_other)],
    ['วันที่ต้องการใช้', thaiNumDate(values.need_date)],
    ['กรณีด่วนระบุเหตุผล', clean(values.urgent_reason)],
    ['หมวดหมู่อุปกรณ์', withOther(values.category, values.category_other)],
  ];
  const right = [
    ['PR No.', clean(prNo || values.pr_no)],
    ['วันที่ออก PR', thaiNumDate(submitted)],
    ['ฝ่าย', clean(requester.dept)],
    ['ผู้ขอ', clean(requester.name)],
    ['เบอร์ติดต่อ', clean(values.phone)],
  ];

  /** เส้นประสำหรับเซ็น ถ้ามีรูปลายเซ็นจะวางทับบนเส้น */
  const signLine = (s, extraCls = '') => `<span class="pr-dots ${extraCls}">…................................${
    s && s.sig ? `<img class="pr-sig" data-photo="${esc(s.sig)}" alt="">` : ''}</span>`;
  const nameIn = (s) => (s && s.name ? esc(s.name) : '');

  const page = (p) => {
    const slice = items.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    const body = Array.from({ length: ROWS_PER_PAGE }, (_, i) => {
      const r = slice[i] || {};
      return `<tr>
        <td class="c-no">${p * ROWS_PER_PAGE + i + 1}</td>
        <td class="c-desc">${esc(clean(r.detail))}</td>
        <td class="c-qty">${esc(clean(r.qty))}</td>
        <td class="c-unit">${esc(clean(r.unit))}</td>
        <td class="c-rem">${esc(clean(r.remark))}</td>
      </tr>`;
    }).join('');

    return `
    <div class="pr-page">
      <img class="pr-logo" src="${LOGO}" alt="Prime Power Construction">
      <div class="pr-title1">ใบขอสั่งซื้อ</div>
      <div class="pr-title2">(PURCHASE REQUISITION)</div>
      <div class="pr-pageno">หน้า ${pages > 1 ? `${p + 1} / ${pages}` : '1 / 1'}</div>

      <table class="pr-box pr-left"><tbody>
        ${left.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>

      <table class="pr-box pr-right"><tbody>
        ${right.map(([k, v], i) => `<tr class="${i === 0 ? 'first' : ''}"><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>

      <table class="pr-items">
        <thead><tr>
          <th class="c-no">รายการที่<br><span>ITEM</span></th>
          <th class="c-desc">รายละเอียด<br><span>DESCRIPTION</span></th>
          <th class="c-qty">จำนวน<br><span>QTY</span></th>
          <th class="c-unit">หน่วย<br><span>UNIT</span></th>
          <th class="c-rem"><span>REMARK</span></th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>

      <div class="pr-reason-label">ระบุเหตุผล :</div>
      <div class="pr-reason-line l1"></div>
      <div class="pr-reason-line l2"></div>
      <div class="pr-reason-text">${esc(clean(values.reason))}</div>

      <!-- แถวลายเซ็นที่ 1 -->
      <div class="pr-sg a r1"><b>ผู้ขอสั่งซื้อ :</b> ${signLine(sign.requester)}</div>
      <div class="pr-sg a r1p">( <span class="pr-name">${nameIn(sign.requester)}</span> )</div>
      <div class="pr-sg a r1t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg a r1t pos-v">${requester.position
        ? `<span class="pr-fill">${esc(requester.position)}</span>` : '…................................'}</div>

      <div class="pr-sg b r1"><b>ผู้อนุมัติ :</b> ${signLine(sign.approver)}</div>
      <div class="pr-sg b r1p">( <span class="pr-name">${nameIn(sign.approver)}</span> )</div>
      <div class="pr-sg b r1t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg b r1t pos-v">ผู้จัดการฝ่าย/ผู้จัดการโครงการ</div>

      <div class="pr-sg c r1"><b>ฝ่ายจัดซื้อ</b></div>
      <div class="pr-sg c r1s">${signLine(sign.purchasing)}</div>
      <div class="pr-sg c r1p2">( <span class="pr-name">${nameIn(sign.purchasing)}</span> )</div>
      <div class="pr-sg c r1t2 pos-l">ตำแหน่ง : พนักงานจัดซื้อ/ผู้จัดการแผนก/ผู้จัดการฝ่าย</div>

      <!-- แถวลายเซ็นที่ 2 -->
      <div class="pr-sg a r2"><b>ผู้ทบทวน :</b> ${signLine(sign.reviewer)}</div>
      <div class="pr-sg a r2p">( <span class="pr-name">${nameIn(sign.reviewer)}</span> )</div>
      <div class="pr-sg a r2t pos-l">ตำแหน่ง :</div>
      <div class="pr-sg a r2t pos-v">วิศวกรบริหารโครงการประจำสำนักงาน</div>

      <div class="pr-sg b r2"><b>ผู้อนุมัติ :</b> ${signLine(sign.director)}${
        sign.director && sign.director.name && !sign.director.sig
          ? `<span class="pr-name pr-dir-name">${esc(sign.director.name)}</span>` : ''}</div>
      <div class="pr-sg b r2p pos-l">ตำแหน่ง :</div>
      <div class="pr-sg b r2p pos-v">ผู้อำนวยการโครงการ (*ถ้ามี)</div>

      <div class="pr-foot-l">Form Page 1 / 1</div>
      <div class="pr-foot-r">FM-PUR-004 Rev.02 (14/07/2568)</div>
    </div>`;
  };

  return `<div class="pr-doc">${Array.from({ length: pages }, (_, p) => page(p)).join('')}</div>`;
}

/**
 * จับคู่ลำดับอนุมัติในระบบเข้ากับช่องเซ็นบนฟอร์ม ตามชื่อลำดับ (StepName)
 *   มีคำว่า "ทบทวน" → ผู้ทบทวน · "ผู้อำนวยการ" → ผู้อนุมัติ (ผอ.)
 *   "จัดซื้อ" → ฝ่ายจัดซื้อ · ลำดับอื่นลำดับแรก → ผู้อนุมัติ (ผจก.ฝ่าย/โครงการ)
 * ใช้เฉพาะผู้ที่กด "อนุมัติ" ในรอบล่าสุดเท่านั้น
 */
export function mapSignatures(steps, log, sigOf) {
  const lastRound = log.map((l) => l.action).lastIndexOf('ยื่นใหม่');
  const acts = log.slice(lastRound + 1).filter((l) => l.action === 'อนุมัติ' || l.action === 'ปิดงาน');
  const slotOf = (name) => {
    const n = String(name || '');
    if (/ทบทวน/.test(n)) return 'reviewer';
    if (/ผู้อำนวยการ/.test(n)) return 'director';
    if (/จัดซื้อ/.test(n)) return 'purchasing';
    return 'approver';
  };
  const out = {};
  steps.forEach((st) => {
    const slot = slotOf(st.StepName);
    if (out[slot]) return;                         // ช่องละคนเดียว ใช้ลำดับแรกที่ตรง
    const act = acts.filter((a) => a.step === +st.StepOrder).slice(-1)[0];
    if (act) out[slot] = { name: act.by, sig: sigOf(act.by) };
  });
  return out;
}

/** อ่านคำตอบที่กรอกอยู่บนหน้าจอ (ใช้ตอนดาวน์โหลดแบบฟอร์มก่อนส่ง) */
export function readLiveValues(fields) {
  const out = {};
  fields.forEach((f) => {
    const el = document.getElementById('q_' + f.FieldKey);
    if (!el) return;
    if (f.FieldType === 'lineitems') {
      out[f.FieldKey] = [...el.querySelectorAll('.li-body tr')].map((tr) => {
        const row = {};
        tr.querySelectorAll('[data-k]').forEach((c) => { row[c.dataset.k] = c.value || ''; });
        return row;
      });
      return;
    }
    out[f.FieldKey] = (el.dataset && el.dataset.value) || el.value || '';
  });
  return out;
}

/** เปิดหน้าต่างแสดงเอกสาร พร้อมปุ่มพิมพ์ / บันทึกเป็น PDF */
export async function openPRWindow(html, title) {
  const { hydratePhotos } = await import('../services/photos.js');
  const win = document.getElementById('overlay-root');
  win.innerHTML = `
    <div class="mask" id="pr-mask">
      <div class="modal modal-wide pr-modal">
        <div class="modal-head">${esc(title)} <button id="pr-close">✕</button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-foot">
          <span class="dim pr-tip">ตั้งหน้าต่างพิมพ์เป็น A4 · ขอบกระดาษ "ไม่มี/None" · ปิด Headers and footers</span>
          <button class="btn-mini" id="pr-cancel">ปิด</button>
          <button class="btn btn-primary" id="pr-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
    </div>`;
  hydratePhotos(win);   // รูปลายเซ็นจาก SharePoint ต้องแนบ token จึงโหลดได้
  const close = () => { win.innerHTML = ''; };
  document.getElementById('pr-close').onclick = close;
  document.getElementById('pr-cancel').onclick = close;
  document.getElementById('pr-print').onclick = () => {
    document.body.classList.add('printing-pr');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-pr'), 500);
  };
}
