/**
 * ตารางกรอกวันขาด ลา มาสาย ของใบประเมินทั้งรอบ
 * ใช้ในหน้าต่าง "แก้ไขรอบประเมินผล" (จัดการข้อมูล) ให้ผู้ดูแล/ฝ่ายบุคคลกรอกได้ในที่เดียว
 */
import { esc, $$ } from '../core/dom.js';
import { update } from '../services/data.js';
import { extraOf, clean } from '../services/appraisal.js';

const KEYS = [
  ['late', 'มาสาย', 'ครั้ง'], ['absent', 'ขาดงาน', 'วัน'], ['personal', 'ลากิจ', 'วัน'],
  ['sick', 'ลาป่วย', 'วัน'], ['other', 'ลาอื่นๆ', 'วัน'],
];
const fix = (n) => (Number(n) || 0).toFixed(1);

export function attendanceGrid(rows) {
  if (!rows.length) return '<div class="empty">ยังไม่มีใบประเมินในรอบนี้</div>';
  return `<table class="ap-table ap-attgrid">
    <thead><tr>
      <th>ชื่อ</th><th>ฝ่าย</th><th>ผู้ประเมิน</th><th>สถานะ</th>
      ${KEYS.map(([, label, unit]) => `<th class="num">${label}<br><span class="dim">${unit}</span></th>`).join('')}
      <th class="num">สรุป</th>
    </tr></thead>
    <tbody>${rows.map((r) => {
      const a = extraOf(r).attendance || {};
      return `<tr>
        <td>${esc(clean(r.EmployeeName))}</td>
        <td>${esc(clean(r.Department))}</td>
        <td>${esc(clean(r.EvaluatorName))}</td>
        <td><span class="ap-pill">${esc(clean(r.Status) || '—')}</span></td>
        ${KEYS.map(([k]) => `<td class="num"><input type="number" min="0" step="1" class="ap-attin"
          data-row="${r.id}" data-k="${k}" value="${esc(a[k] ?? '')}"></td>`).join('')}
        <td class="num">${fix(r.FinalScore || r.MgrScore || r.SelfScore)}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <div class="panel-note">ฝ่ายทรัพยากรบุคคลกรอกได้ทุกขั้นตอน · ผู้ประเมินจะเห็นตัวเลขนี้ในแบบประเมินทันที</div>`;
}

/** บันทึกเฉพาะแถวที่ตัวเลขเปลี่ยน คืนจำนวนใบที่บันทึก */
export async function saveAttendance(rows, onProgress = () => {}) {
  const byRow = {};
  $$('.ap-attin').forEach((el) => {
    byRow[el.dataset.row] = byRow[el.dataset.row] || {};
    byRow[el.dataset.row][el.dataset.k] = el.value.trim();
  });
  const jobs = Object.entries(byRow).filter(([id, att]) => {
    const cur = extraOf(rows.find((r) => String(r.id) === String(id)) || {}).attendance || {};
    return Object.keys(att).some((k) => String(cur[k] ?? '') !== att[k]);
  });
  let done = 0;
  for (const [id, att] of jobs) {
    const row = rows.find((r) => String(r.id) === String(id));
    // eslint-disable-next-line no-await-in-loop
    await update('appraisals', id, { Extra: JSON.stringify({ ...extraOf(row), attendance: att }) });
    done += 1;
    onProgress(done, jobs.length);
  }
  return done;
}
