/** ตารางมาตรฐาน ใช้ทุกหน้าที่แสดงรายการ */
import { esc } from '../core/dom.js';

export function dataTable({ columns, rows, actions, empty = 'ยังไม่มีข้อมูล' }) {
  if (!rows.length) return `<div class="panel"><div class="empty">${esc(empty)}</div></div>`;
  return `<div class="panel"><table>
    <thead><tr>${columns.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('')}
      ${actions ? '<th class="col-actions"></th>' : ''}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      ${columns.map((c) => `<td>${c.raw ? c.value(r) : esc(c.value(r))}</td>`).join('')}
      ${actions ? `<td class="col-actions">${actions(r, i)}</td>` : ''}
    </tr>`).join('')}</tbody>
  </table></div>`;
}
