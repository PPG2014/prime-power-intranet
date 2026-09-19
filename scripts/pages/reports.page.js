import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { state, setState } from '../core/state.js';
import { parseLog } from '../services/requests.js';
import { toCsv, downloadText } from '../utils/csv.js';

export const meta = { route: 'reports', title: 'รายงาน', nav: true, order: 8, adminOnly: false };

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? '') : String(v ?? '')).trim();

const PERIODS = { '30': '30 วัน', '90': '90 วัน', '365': '1 ปี', 'all': 'ทั้งหมด' };

/** ชั่วโมงเป็นข้อความอ่านง่าย */
const dur = (h) => {
  if (h == null || isNaN(h)) return '—';
  if (h < 24) return `${h.toFixed(1)} ชม.`;
  return `${(h / 24).toFixed(1)} วัน`;
};

let snapshot = { rows: [], perStep: [], perPerson: [] };

export async function render(ctx) {
  const days = state.reportPeriod || '90';
  const all = await list('requests').catch(() => []);
  const since = days === 'all' ? 0 : Date.now() - (+days) * 86400000;
  const rows = all.filter((r) => {
    const d = new Date(r.SubmittedDate);
    return isNaN(d) ? true : d.getTime() >= since;
  });

  const byStatus = {};
  const byForm = {};
  const byDept = {};
  rows.forEach((r) => {
    const st = clean(r.Status) || 'ไม่ระบุ';
    byStatus[st] = (byStatus[st] || 0) + 1;
    const fm = clean(r.FormName) || clean(r.FormCode) || 'ไม่ระบุ';
    byForm[fm] = (byForm[fm] || 0) + 1;
    const dp = clean(r.RequesterDept) || 'ไม่ระบุ';
    byDept[dp] = (byDept[dp] || 0) + 1;
  });

  // เวลาที่ใช้ในแต่ละลำดับ และของผู้อนุมัติแต่ละคน (ชั่วโมง)
  const stepAgg = {};
  const personAgg = {};
  rows.forEach((r) => {
    const log = parseLog(r.ApprovalLog).filter((l) => l.at && l.step);
    let prev = new Date(r.SubmittedDate);
    log.sort((a, b) => new Date(a.at) - new Date(b.at)).forEach((l) => {
      const at = new Date(l.at);
      if (isNaN(at) || isNaN(prev)) { prev = at; return; }
      const hrs = (at - prev) / 3600000;
      if (hrs >= 0 && hrs < 24 * 90) {
        const k = `ลำดับ ${l.step}`;
        (stepAgg[k] = stepAgg[k] || []).push(hrs);
        const who = clean(l.by) || 'ไม่ระบุ';
        (personAgg[who] = personAgg[who] || []).push(hrs);
      }
      prev = at;
    });
  });

  const avg = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const perStep = Object.entries(stepAgg)
    .map(([k, a]) => ({ k, n: a.length, avg: avg(a) }))
    .sort((x, y) => x.k.localeCompare(y.k, 'th'));
  const perPerson = Object.entries(personAgg)
    .map(([k, a]) => ({ k, n: a.length, avg: avg(a) }))
    .sort((x, y) => y.avg - x.avg);

  // คำขอที่ยังค้าง เรียงจากค้างนานสุด
  const pending = rows.filter((r) => clean(r.Status) === 'รออนุมัติ')
    .map((r) => ({ r, days: (Date.now() - new Date(r.SubmittedDate)) / 86400000 }))
    .filter((x) => !isNaN(x.days))
    .sort((a, b) => b.days - a.days);

  snapshot = { rows, perStep, perPerson };

  const done = rows.filter((r) => ['อนุมัติแล้ว', 'เสร็จสิ้น'].includes(clean(r.Status)));
  const cycle = done.map((r) => {
    const log = parseLog(r.ApprovalLog).filter((l) => l.at);
    if (!log.length) return null;
    const end = new Date(log[log.length - 1].at);
    const st = new Date(r.SubmittedDate);
    return isNaN(end) || isNaN(st) ? null : (end - st) / 3600000;
  }).filter((x) => x != null && x >= 0);

  const barList = (obj, max = 6) => {
    const items = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, max);
    const top = items.length ? items[0][1] : 1;
    return items.map(([k, n]) => `
      <div class="rr-row">
        <span class="rr-label">${esc(k)}</span>
        <span class="rr-bar"><i style="width:${Math.round((n / top) * 100)}%"></i></span>
        <b>${n}</b>
      </div>`).join('') || '<div class="dim">ไม่มีข้อมูล</div>';
  };

  return `
  <section class="page page-reports">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">สรุปปริมาณคำขอ ระยะเวลาอนุมัติ และจุดที่งานค้าง</p>

      <div class="chips">
        ${Object.entries(PERIODS).map(([k, v]) =>
          `<button class="chip" data-period="${k}" aria-pressed="${days === k}">${esc(v)}</button>`).join('')}
        <span class="toolbar-meta">${rows.length} คำขอ</span>
        <button class="btn-mini" id="rr-csv">⭳ ส่งออก CSV</button>
      </div>

      <div class="rr-kpis">
        <div><b>${rows.length}</b><span>คำขอทั้งหมด</span></div>
        <div><b>${byStatus['รออนุมัติ'] || 0}</b><span>รออนุมัติ</span></div>
        <div><b>${done.length}</b><span>อนุมัติ/เสร็จสิ้น</span></div>
        <div><b>${byStatus['ไม่อนุมัติ'] || 0}</b><span>ไม่อนุมัติ</span></div>
        <div><b>${cycle.length ? dur(avg(cycle)) : '—'}</b><span>เวลาเฉลี่ยจนจบ</span></div>
      </div>

      <div class="rr-cols">
        <div class="panel">
          <div class="panel-head">แบบฟอร์มที่ใช้มากที่สุด</div>
          ${barList(byForm)}
        </div>
        <div class="panel">
          <div class="panel-head">ปริมาณคำขอตามฝ่าย</div>
          ${barList(byDept)}
        </div>
      </div>

      <div class="rr-cols">
        <div class="panel">
          <div class="panel-head">เวลาเฉลี่ยของแต่ละลำดับอนุมัติ</div>
          ${perStep.length ? `<table class="rr-table">
            <thead><tr><th>ลำดับ</th><th>จำนวนครั้ง</th><th>เวลาเฉลี่ย</th></tr></thead>
            <tbody>${perStep.map((x) => `<tr><td>${esc(x.k)}</td><td>${x.n}</td><td>${esc(dur(x.avg))}</td></tr>`).join('')}</tbody>
          </table>` : '<div class="dim">ยังไม่มีข้อมูลการอนุมัติ</div>'}
        </div>
        <div class="panel">
          <div class="panel-head">ผู้อนุมัติที่ใช้เวลานานที่สุด</div>
          ${perPerson.length ? `<table class="rr-table">
            <thead><tr><th>ผู้อนุมัติ</th><th>จำนวนครั้ง</th><th>เวลาเฉลี่ย</th></tr></thead>
            <tbody>${perPerson.slice(0, 8).map((x) =>
              `<tr><td>${esc(x.k)}</td><td>${x.n}</td><td>${esc(dur(x.avg))}</td></tr>`).join('')}</tbody>
          </table>` : '<div class="dim">ยังไม่มีข้อมูลการอนุมัติ</div>'}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">คำขอที่ค้างนานที่สุด
          <span class="panel-meta">${pending.length} ใบ</span></div>
        ${pending.length ? `<table class="rr-table">
          <thead><tr><th>เลขที่</th><th>แบบฟอร์ม</th><th>ผู้ยื่น</th><th>ลำดับ</th><th>ค้างมาแล้ว</th></tr></thead>
          <tbody>${pending.slice(0, 12).map(({ r, days: d }) => `<tr${d > 7 ? ' class="late"' : ''}>
            <td>${esc(clean(r.Title))}</td>
            <td>${esc(clean(r.FormName))}</td>
            <td>${esc(clean(r.RequesterName))}</td>
            <td>${esc(String(r.CurrentStep || '—'))}</td>
            <td>${d.toFixed(1)} วัน</td></tr>`).join('')}</tbody>
        </table>` : '<div class="empty">ไม่มีคำขอค้าง</div>'}
      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
  onClick('period', (k) => setState({ reportPeriod: k }));

  const csv = $('#rr-csv');
  if (csv) {
    csv.onclick = () => {
      const keys = ['เลขที่', 'แบบฟอร์ม', 'ผู้ยื่น', 'ฝ่าย', 'สถานะ', 'ลำดับปัจจุบัน', 'วันที่ยื่น', 'จำนวนครั้งที่ดำเนินการ'];
      const rows = snapshot.rows.map((r) => ({
        'เลขที่': clean(r.Title), 'แบบฟอร์ม': clean(r.FormName), 'ผู้ยื่น': clean(r.RequesterName),
        'ฝ่าย': clean(r.RequesterDept), 'สถานะ': clean(r.Status),
        'ลำดับปัจจุบัน': r.CurrentStep || '', 'วันที่ยื่น': r.SubmittedDate || '',
        'จำนวนครั้งที่ดำเนินการ': parseLog(r.ApprovalLog).length,
      }));
      downloadText(`รายงานคำขอ-${new Date().toISOString().slice(0, 10)}.csv`, '\uFEFF' + toCsv(keys, rows));
    };
  }
}
