import { esc, $, $$, onClick } from '../core/dom.js';
import { list, create, update, remove } from '../services/data.js';
import { SCHEMA } from '../admin/schema.js';
import { formBody, collect, bindDependents, bindPhoto, bindFiles, bindFilters, toFiles } from '../admin/entity-form.js';
import { openModal, closeModal } from '../components/modal.js';
import { state, setState } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { thaiDateShort } from '../utils/format.js';
import { parseCsv, toCsv, downloadText, castValue } from '../utils/csv.js';
import { previewAnnouncement } from '../components/announcement-popup.js';
import { hydratePhotos } from '../services/photos.js';
import { clearCaches } from '../utils/dept.js';
import { render as rerender } from '../core/render.js';

export const meta = { route: 'admin', title: 'จัดการข้อมูล', nav: true, order: 11, adminOnly: true };

let rows = [];
let key = '';
let s = null;
let allRows = [];
let activeGroup = '';
let formNames = {};

/** ค่ากลุ่มอาจมาเป็นออบเจ็กต์ (ถ้าคอลัมน์เป็น Choice/Lookup) แปลงเป็นข้อความเสมอ */
function groupVal(r, kBy) {
  const v = r[kBy];
  if (v && typeof v === 'object') return v.LookupValue ?? v.Label ?? v.Value ?? v.Title ?? '';
  return v || '';
}

export async function render(ctx) {
  if (!state.isAdmin) return `<section class="page"><div class="wrap">
    <h1 class="page-title">${esc(meta.title)}</h1>
    <div class="panel"><div class="empty">
      หน้านี้เปิดให้เฉพาะผู้ดูแลระบบ<br>
      บัญชี <b>${esc(state.user?.email || '')}</b> ไม่อยู่ในรายชื่อผู้ดูแล<br>
      <span class="dim">เพิ่มอีเมลได้ที่ SharePoint List ชื่อ Settings รายการ Admins</span>
    </div></div></div></section>`;

  key = state.adminSet || 'departments';
  s = SCHEMA[key];

  // โหลดชื่อฟอร์มไว้แสดงในตัวเลือกกลุ่ม (เฉพาะชุดที่จัดกลุ่มตาม FormCode)
  if (s.groupBy === 'FormCode' && !Object.keys(formNames).length) {
    try {
      (await list('formCatalog')).forEach((f) => { formNames[f.FormCode] = f.Title; });
    } catch (e) { /* ไม่มีชื่อก็แสดงแค่รหัส */ }
  }

  let loadError = null;
  try {
    rows = await list(s.list);
    if (s.dateDesc) {
      // ประกาศ/ข่าว เรียงจากใหม่ไปเก่า ให้รายการล่าสุดอยู่บนสุด
      const t = (x) => { const d = new Date(x[s.dateDesc]); return isNaN(d) ? null : d.getTime(); };
      rows.sort((a, b) => ((t(b) ?? 0) - (t(a) ?? 0))
        || ((+a[s.sortField] || 0) - (+b[s.sortField] || 0))
        || ((+b.id || 0) - (+a.id || 0)));   // วันที่อ่านไม่ได้ ใช้รายการที่เพิ่มทีหลังขึ้นก่อน
    } else if (s.sortField) {
      rows.sort((a, b) => (+a[s.sortField] || 0) - (+b[s.sortField] || 0));
    }
  } catch (err) {
    console.error(err);
    rows = [];
    loadError = err.message;
  }

  // ชุดที่จัดกลุ่ม เก็บทุกแถวไว้ทำรายการกลุ่ม แล้วแสดงเฉพาะกลุ่มที่เลือก
  allRows = rows;
  let groupList = [];
  if (s.groupBy && !loadError) {
    const seen = [];
    rows.forEach((r) => { const g = groupVal(r, s.groupBy) || '(ไม่ระบุ)'; if (!seen.includes(g)) seen.push(g); });
    groupList = seen.sort();
    activeGroup = groupList.includes(state.adminGroup) ? state.adminGroup : (groupList[0] || '');
    rows = rows.filter((r) => (groupVal(r, s.groupBy) || '(ไม่ระบุ)') === activeGroup);
  }

  return `
  <section class="page page-admin">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">เพิ่ม แก้ไข หรือลบข้อมูลทุกชุดที่แสดงบนเว็บ โดยไม่ต้องแก้ไขโค้ด</p>

      <div class="admin-quick">
        <a class="btn-mini" href="#/health">🩺 ตรวจสุขภาพระบบ</a>
        <span class="dim">ตรวจว่าข้อมูลตั้งต้นครบไหม เช่น อีเมล ผู้บังคับบัญชา เส้นทางอนุมัติ คอลัมน์ใน SharePoint</span>
      </div>
      ${state.adminUnconfigured ? `<div class="mock-warning">
        <b>⚠ ยังไม่ได้กำหนดว่าใครเป็นผู้ดูแลระบบ</b>
        ตอนนี้ทุกคนที่ล็อกอินเข้ามาแก้ข้อมูลได้ทั้งหมด
        ไปที่ 🛟 ตั้งค่าระบบ แล้วเพิ่มรายการชื่อ <b>Admins</b>
        ใส่อีเมลผู้ดูแลคั่นด้วยจุลภาค เช่น a@primepower.co.th, b@primepower.co.th
      </div>` : ''}
      ${CONFIG.dataSource !== 'sharepoint' ? `<div class="mock-warning">
        <b>⚠ กำลังใช้ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริงจาก SharePoint</b>
        สิ่งที่แก้ในหน้านี้จะหายเมื่อรีเฟรช และไม่ถูกบันทึกลง SharePoint
        แก้ได้ที่ไฟล์ scripts/core/config.js บรรทัด dataSource ให้เป็น 'sharepoint'
      </div>` : ''}

      <div class="admin-layout${state.adminNavHidden ? ' nav-hidden' : ''}">
        <nav class="set-nav">
          ${Object.entries(SCHEMA).map(([k, v]) => `
            <button data-set="${k}" aria-current="${key === k ? 'page' : 'false'}">
              <span>${v.icon}</span> ${esc(v.title)}</button>`).join('')}
        </nav>

        <div class="panel">
          <div class="panel-head">
            <button class="nav-toggle" data-navtoggle="1"
              title="${state.adminNavHidden ? 'แสดงเมนูชุดข้อมูล' : 'ซ่อนเมนูเพื่อให้ตารางกว้างขึ้น'}"
              >${state.adminNavHidden ? '☰' : '⟨'}</button>
            ${s.icon} ${esc(s.title)}${s.groupBy && activeGroup
              ? ' · ' + esc(formLabel(activeGroup)) : ''} — ${rows.length} รายการ

            ${key === 'directory' ? '<button class="head-btn" data-autosort="1" title="เรียงตามฝ่าย → ระดับในผัง → แผนก">⚡ เรียงตามระดับอัตโนมัติ</button>' : ''}
            ${s.readOnly ? '' : '<button class="head-btn" data-new="1">+ เพิ่มรายการ</button>'}</div>
          ${(() => {
            const off = rows.filter((r) => r.IsActive === false).length;
            return off
              ? `<div class="off-note">${off} รายการปิดใช้งานอยู่ จึงไม่แสดงบนหน้าเว็บ
                   แต่ยังนับรวมในตารางนี้</div>` : '';
          })()}
          ${(() => {
            if (!s.groupBy || loadError) return '';
            const orphans = allRows.filter((r) => !groupVal(r, s.groupBy));
            if (!orphans.length) return '';
            return `<div class="mock-warning">
              <b>พบ ${orphans.length} รายการที่ไม่มีค่า ${s.groupBy}</b>
              รายการเหล่านี้จะไม่ผูกกับฟอร์มใด มักเกิดจากตอนวาง CSV คอลัมน์ไม่ตรงกัน<br>
              เลือกฟอร์มที่ถูกต้องด้านล่างแล้วกด "ผูกรายการที่ค้าง" เพื่อเติมให้
              <button class="btn-mini" data-fixgroup="1" style="margin-left:8px">ผูกรายการที่ค้าง (${orphans.length})</button>
            </div>`;
          })()}
          ${s.groupBy && !loadError ? `<div class="group-bar">
            <span class="group-label">เลือก${
              s.groupBy === 'FormCode' ? 'แบบฟอร์ม' : s.labels[s.groupBy] || s.groupBy}:</span>
            <select class="group-select" data-group="1">
              ${[...new Set(allRows.map((r) => groupVal(r, s.groupBy) || '(ไม่ระบุ)'))].sort().map((g) => {
                const label = formLabel(g);
                const n = allRows.filter((r) => (groupVal(r, s.groupBy) || '(ไม่ระบุ)') === g).length;
                return `<option value="${esc(g)}" ${g === activeGroup ? 'selected' : ''}
                  >${esc(label)} (${n})</option>`;
              }).join('')}
            </select>
          </div>` : ''}
          ${loadError ? `<div class="mock-warning">
            <b>โหลดข้อมูลจาก SharePoint ไม่สำเร็จ</b>
            ${esc(loadError)}<br>
            ลองรีเฟรชหน้า หรือออกจากระบบแล้วเข้าใหม่ · เมนูอื่นยังใช้ได้ตามปกติ
          </div>` : ''}
          ${(s.search || (s.facets && s.facets.length)) && !loadError ? `<div class="admin-toolbar">
            ${s.search ? `<input class="admin-q" id="admin-q" type="search" data-keepfocus
              placeholder="ค้นหาในตาราง…" autocomplete="off">` : ''}
            ${(s.facets || []).map((f) => `<select class="facet-select" data-facet="${f}">
              <option value="">${esc(s.labels[f] || f)}: ทั้งหมด</option>
              ${[...new Set(rows.map((r) => String(r[f] ?? '').trim()).filter(Boolean))].sort()
                .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
            </select>`).join('')}
            <span class="admin-count-wrap">แสดง <span id="admin-count">${rows.length}</span> / ${rows.length}</span>
          </div>` : ''}
          <div class="table-scroll"><table>
            <thead><tr>${s.sortField ? '<th class="col-no">ลำดับ</th>' : ''}
              ${s.columns.map((c) => `<th data-col="${c}">${esc(s.labels[c] || c)}</th>`).join('')}
              <th class="col-actions"></th></tr></thead>
            <tbody id="admin-tbody">${rows.length ? rows.map((r, i) => `<tr data-id="${r.id}" data-search="${esc(
              s.columns.concat(s.facets || []).map((c) => (r[c] == null ? '' : (typeof r[c] === 'object' ? '' : r[c]))).join(' ').toLowerCase())
            }"${(s.facets || []).map((f) => ` data-f-${f}="${esc(String(r[f] ?? '').trim())}"`).join('')}>
              ${s.sortField ? `<td class="col-no"><button class="no-edit" data-pos="${r.id}"
                title="คลิกแล้วพิมพ์ลำดับใหม่ กด Enter">${i + 1}</button></td>` : ''}
              ${s.columns.map((c) => c === 'PhotoUrl'
                ? `<td class="col-thumb">${r[c] ? `<img data-photo="${esc(r[c])}" alt="">` : '—'}</td>`
                : `<td data-col="${c}">${esc(
                typeof r[c] === 'boolean' ? (r[c] ? 'ใช่' : 'ไม่')
                : Array.isArray(r[c]) ? (r[c].length ? r[c].length + ' รายการ' : '—')
                : c === 'Files' ? (toFiles(r[c]).length ? '📎 ' + toFiles(r[c]).length : '—')
                : /Date|Updated/.test(c) ? (thaiDateShort(r[c]) || '—')
                : (r[c] ?? '—'))}</td>`).join('')}
              <td class="col-actions">
                ${s.readOnly ? '<span class="dim">อ่านอย่างเดียว</span>' : ''}
                ${s.sortField ? `<span class="move-group">
                  <button class="btn-move" data-up="${r.id}" title="เลื่อนขึ้น"
                    ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn-move" data-down="${r.id}" title="เลื่อนลง"
                    ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
                </span>` : ''}
                ${key === 'announcements' ? `<button class="btn-mini" data-prev="${r.id}" title="ดูว่าประกาศนี้เด้งออกมาหน้าตาแบบไหน">👁 ดูตัวอย่าง</button>` : ''}
                ${s.readOnly ? '' : `<button class="btn-mini" data-edit="${r.id}">✎ แก้ไข</button>
                <button class="btn-mini danger" data-del="${r.id}">🗑 ลบ</button>`}
              </td></tr>`).join('')
              : `<tr><td colspan="${s.columns.length + (s.sortField ? 2 : 1)}"><div class="empty">ยังไม่มีข้อมูล กด “เพิ่มรายการ” เพื่อเริ่มต้น</div></td></tr>`}
              <tr id="admin-nomatch" style="display:none"><td colspan="${s.columns.length + (s.sortField ? 2 : 1)}"><div class="empty">ไม่พบรายการที่ตรงกับการค้นหา</div></td></tr>
            </tbody>
          </table></div>
          <div class="panel-note">
            ${s.hint ? esc(s.hint) + '<br>' : ''}
            ${s.sortField ? 'กดปุ่ม ↑ ↓ เพื่อจัดลำดับใหม่ ผลจะเปลี่ยนทันทีทุกหน้าที่แสดงข้อมูลชุดนี้<br>' : ''}
            ข้อมูลชุดนี้เก็บใน SharePoint List <b>${esc(s.spName || s.list)}</b> ·
            แก้ที่นี่หรือแก้ใน SharePoint โดยตรงก็ได้ ผลลัพธ์เหมือนกัน
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/** ผูกปุ่มนำเข้า CSV และปุ่มดาวน์โหลดไฟล์ตัวอย่าง ในหน้าต่างเพิ่มรายการ */
function bindImport(s) {
  const tpl = $('#csv-template');
  if (tpl) tpl.onclick = () => {
    const keys = [...s.fields.map((f) => f.key), ...(s.sortField ? [s.sortField] : [])];
    downloadText(`${s.spName || s.list}-template.csv`, toCsv(keys, []));
  };

  const picker = $('#csv-in');
  if (!picker) return;
  picker.onchange = async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;

    const table = parseCsv(await file.text());
    if (table.length < 2) { alert('ไฟล์ว่างหรืออ่านไม่ได้'); return; }

    const header = table[0].map((h) => h.trim());
    const known = [...s.fields.map((f) => f.key), ...(s.sortField ? [s.sortField] : [])];
    const matched = header.filter((h) => known.includes(h));
    const ignored = header.filter((h) => !known.includes(h));
    if (!matched.length) {
      alert('ไม่พบคอลัมน์ที่ตรงกับชุดข้อมูลนี้\n\nในไฟล์: ' + header.join(', ') +
        '\n\nที่รองรับ: ' + known.join(', '));
      return;
    }

    const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const items = [], dups = [];
    table.slice(1).forEach((line) => {
      const item = {};
      header.forEach((h, i) => {
        const f = s.fields.find((x) => x.key === h) || (h === s.sortField ? { key: h, type: 'number' } : null);
        if (f) item[h] = castValue(f, line[i]);
      });
      const clash = (s.unique || []).some((k) => item[k] && rows.some((r) => norm(r[k]) === norm(item[k])));
      (clash ? dups : items).push(item);
    });

    if (!confirm(`ไฟล์ ${file.name}\n\nจะเพิ่ม ${items.length} รายการ` +
      (dups.length ? `\nข้ามที่ซ้ำ ${dups.length}` : '') +
      (ignored.length ? `\nข้ามคอลัมน์ที่ไม่รู้จัก: ${ignored.join(', ')}` : '') +
      '\n\nดำเนินการต่อหรือไม่') || !items.length) return;

    let done = 0; const failed = [];
    for (const item of items) {
      try { await create(s.list, item); done++; }
      catch (e) { failed.push(`${item[s.fields[0].key] || '-'} — ${e.message}`); }
    }
    clearCaches(); closeModal(); rerender();
    alert(`นำเข้าสำเร็จ ${done} รายการ` +
      (failed.length ? `\nไม่สำเร็จ ${failed.length}\n${failed.slice(0, 5).join('\n')}` : ''));
  };
}

async function openEditor(key, record) {
  const s = SCHEMA[key];
  const isNew = !record;
  openModal({
    title: `${s.icon} ${isNew ? 'เพิ่ม' : 'แก้ไข'}${s.title}`,
    wide: true,
    body: await formBody(s, record || {})
      + (isNew && !s.readOnly ? `
        <div class="import-row">
          <span>หรือนำเข้าหลายรายการพร้อมกัน</span>
          <label class="btn-mini" for="csv-in">⭱ นำเข้าจากไฟล์ CSV</label>
          <input type="file" id="csv-in" accept=".csv,text/csv" hidden>
          <button class="btn-mini" id="csv-template">⭳ ดาวน์โหลดไฟล์ตัวอย่าง</button>
        </div>` : ''),
    footer: `<button class="btn-mini" id="cancel">ยกเลิก</button>
             <button class="btn btn-primary" id="save">${isNew ? 'เพิ่มรายการ' : 'บันทึกการแก้ไข'}</button>`,
  });
  if (isNew && !s.readOnly) bindImport(s);
  bindDependents(s);
  bindPhoto(s);
  bindFiles(s);
  bindFilters(s);
  $('#cancel').onclick = closeModal;
  $('#save').onclick = async (ev) => {
    const data = collect(s);
    if (!data) return;

    const btn = ev.currentTarget;
    const err = $('#form-error');

    /**
     * เตือนเมื่อค่าซ้ำกับรายการที่มีอยู่แล้ว
     * เทียบแบบไม่สนตัวพิมพ์และช่องว่างหัวท้าย เพราะพิมพ์ซ้ำมักต่างกันแค่นั้น
     */
    const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    for (const key of (s.unique || [])) {
      const value = norm(data[key]);
      if (!value) continue;
      const clash = rows.find((r) => norm(r[key]) === value && (isNew || r.id !== record.id));
      if (!clash) continue;

      const label = (s.fields.find((f) => f.key === key) || {}).label || key;
      const ok = confirm(
        `มี${s.title}ที่ใช้${label}นี้อยู่แล้ว\n\n` +
        `"${clash[key]}"` +
        (clash.Department ? `  (${clash.Department})` : '') +
        '\n\nต้องการบันทึกซ้ำหรือไม่');
      if (!ok) {
        err.textContent = `ยกเลิกการบันทึก เพราะ${label}ซ้ำกับรายการที่มีอยู่`;
        err.hidden = false;
        const el = $('#f_' + key);
        if (el) el.focus();
        return;
      }
    }

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'กำลังบันทึก…';

    try {
      // เก็บค่าเดิมไว้ในทะเบียนประวัติก่อน เพื่อให้ย้อนดูความคืบหน้าได้
      if (!isNew && s.history && record) {
        try {
          await create(s.history, {
            Title: record.Title,
            ProjectCode: record.ProjectCode || '',
            PlanProgress: record.PlanProgress ?? 0,
            ActualProgress: record.ActualProgress ?? 0,
            ActualPayment: record.ActualPayment ?? 0,
            Detail: record.Detail || '',
            RecordedDate: record.UpdatedDate || new Date().toISOString(),
            RecordedBy: state.user?.name || '',
          });
        } catch (e) {
          console.warn('บันทึกประวัติไม่สำเร็จ:', e.message);
        }
      }
      if (s.history) data.UpdatedDate = new Date().toISOString();

      const res = isNew ? await create(s.list, data)
                        : await update(s.list, record.id, data);
      clearCaches();
      closeModal();
      rerender();
      const notes = [];
      if (res && res.skipped && res.skipped.length) {
        notes.push('ยังไม่มีคอลัมน์เหล่านี้ใน List "' + (s.spName || s.list) + '"\n  '
          + res.skipped.join('\n  '));
        // เตือนเป็นพิเศษถ้าช่องที่ใช้จัดกลุ่มถูกข้าม เพราะจะทำให้รายการลอยไม่ผูกกับกลุ่ม
        if (s.groupBy && res.skipped.some((x) => x.startsWith(s.groupBy))) {
          notes.push('⚠ คอลัมน์ ' + s.groupBy + ' หายไป ทำให้รายการนี้ไม่ผูกกับฟอร์มใด\n'
            + '  ต้องเพิ่มคอลัมน์ ' + s.groupBy + ' ใน SharePoint List "' + (s.spName || s.list)
            + '" ก่อน จึงจะใช้งานได้');
        }
      }
      if (res && res.dropped && res.dropped.length) {
        notes.push('SharePoint ปฏิเสธการบันทึกช่องที่เลือกได้หลายค่า\n  '
          + res.dropped.join('\n  ')
          + '\n  ข้อมูลอื่นบันทึกแล้ว ส่วนช่องเหล่านี้ต้องแก้ใน SharePoint โดยตรง');
      }
      if (notes.length) alert('บันทึกแล้ว แต่มีข้อสังเกต\n\n' + notes.join('\n\n'));
    } catch (e) {
      console.error(e);
      err.innerHTML = `บันทึกไม่สำเร็จ<br>${esc(e.message)}`;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  };
}

function formLabel(code) {
  return formNames[code] ? `${code} · ${formNames[code]}` : code;
}

export function mount(ctx) {
  hydratePhotos($('#app'));

  // ค้นหา + ตัวกรอง ฝ่าย/แผนก แบบกรองในที่ (ไม่รีเฟรชทั้งหน้า เคอร์เซอร์ไม่หลุด)
  const q = $('#admin-q');
  const facetSels = $$('.facet-select');
  if (q || facetSels.length) {
    const applyFilter = () => {
      const term = (q?.value || '').trim().toLowerCase();
      const picked = {};
      facetSels.forEach((se) => { if (se.value) picked[se.dataset.facet] = se.value; });
      let shown = 0;
      $$('#admin-tbody tr[data-search]').forEach((tr) => {
        let ok = !term || tr.dataset.search.includes(term);
        for (const k in picked) { if (tr.getAttribute('data-f-' + k) !== picked[k]) ok = false; }
        tr.style.display = ok ? '' : 'none';
        if (ok) shown += 1;
      });
      const nm = $('#admin-nomatch'); if (nm) nm.style.display = shown ? 'none' : '';
      const c = $('#admin-count'); if (c) c.textContent = shown;
    };
    if (q) q.oninput = applyFilter;
    facetSels.forEach((se) => { se.onchange = applyFilter; });
  }

  onClick('set', (k) => setState({ adminSet: k, adminGroup: '' }));

  const gsel = $('.group-select');
  if (gsel) gsel.onchange = () => setState({ adminGroup: gsel.value });

    onClick('new', () => openEditor(key, null));
  onClick('group', () => {}); // select ใช้ onchange แยกด้านล่าง
  onClick('prev', (id) => previewAnnouncement(rows.find((r) => String(r.id) === String(id))));
  onClick('edit', (id) => openEditor(key, rows.find((r) => String(r.id) === String(id))));
  /** สลับลำดับกับแถวข้างเคียง แล้วเขียนเลขลำดับใหม่ทั้งคู่ */
  const f = s.sortField;

  /** เขียนเลขลำดับใหม่เฉพาะแถวที่เปลี่ยน ทีละไม่เกิน 6 รายการพร้อมกัน กัน SharePoint ปฏิเสธ */
  const saveOrder = async (order, onProgress = () => {}) => {
    const changed = order.map((r, k) => ({ r, n: k + 1 })).filter(({ r, n }) => +r[f] !== n);
    let done = 0;
    for (let k = 0; k < changed.length; k += 6) {
      await Promise.all(changed.slice(k, k + 6).map(({ r, n }) => update(s.list, r.id, { [f]: n })));
      done = Math.min(changed.length, k + 6);
      onProgress(done, changed.length);
    }
    clearCaches();
    rerender();
  };

  /** แถวที่มองเห็นอยู่บนจอ (หลังค้นหา/กรองฝ่าย) เรียงตามที่แสดง */
  const visibleIds = () => [...$$('#admin-tbody tr[data-id]')]
    .filter((tr) => tr.style.display !== 'none').map((tr) => tr.dataset.id);

  /** ย้ายแถวไปอยู่ลำดับที่ n (นับจากแถวที่เห็นบนจอ) คนอื่นเลื่อนตามให้เอง */
  const moveTo = async (id, n) => {
    const vis = visibleIds();
    const from = vis.indexOf(String(id));
    const to = Math.max(0, Math.min(vis.length - 1, n - 1));
    if (from < 0 || from === to) { rerender(); return; }

    const order = allRows.slice();
    const item = order.find((r) => String(r.id) === String(id));
    order.splice(order.indexOf(item), 1);
    let at = order.findIndex((r) => String(r.id) === vis[to]);
    if (to > from) at += 1;                 // ย้ายลง: วางหลังแถวเป้าหมาย
    order.splice(at, 0, item);
    await saveOrder(order);
  };

  // ลูกศรเลื่อนทีละขั้น เทียบกับแถวถัดไปที่เห็นบนจอ (ไม่ข้ามไปสลับกับฝ่ายอื่นที่ถูกซ่อน)
  const move = (id, step) => {
    const pos = visibleIds().indexOf(String(id));
    if (pos >= 0) moveTo(id, pos + 1 + step);
  };
  onClick('up', (id) => move(id, -1));
  onClick('down', (id) => move(id, 1));

  // คลิกเลขลำดับ → พิมพ์ตำแหน่งใหม่
  onClick('pos', (id, el) => {
    const cur = visibleIds().indexOf(String(id)) + 1;
    const input = document.createElement('input');
    input.type = 'number'; input.min = 1; input.value = cur;
    input.className = 'no-input';
    el.replaceWith(input);
    input.focus(); input.select();
    let finished = false;
    const commit = () => {
      if (finished) return; finished = true;
      const n = parseInt(input.value, 10);
      if (!n || n === cur) { rerender(); return; }
      input.disabled = true;
      moveTo(id, n);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { finished = true; rerender(); }
    };
    input.onblur = commit;
  });

  // เรียงบุคลากรอัตโนมัติ: ฝ่าย → ระดับในผัง → แผนก → ลำดับเดิม → ชื่อ
  onClick('autosort', async (_, btn) => {
    if (!confirm('เรียงบุคลากรทั้งหมดใหม่ตามฝ่าย → ระดับในผัง → แผนก ?\n'
      + 'ลำดับที่จัดมือไว้จะถูกแทนที่ (คนระดับเดียวกันในแผนกเดียวกันยังคงลำดับเดิม)')) return;
    const { levelOf } = await import('./directory.page.js');
    const [deps, secs] = await Promise.all([list('departments').catch(() => []), list('sections').catch(() => [])]);
    const rank = (arr) => {
      const m = new Map();
      arr.slice().sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0))
        .forEach((x, i) => m.set(String(x.Title).trim(), i));
      return (v) => (m.has(String(v || '').trim()) ? m.get(String(v || '').trim()) : 9999);
    };
    const dRank = rank(deps); const sRank = rank(secs);
    const order = allRows.slice().sort((a, b) =>
      (dRank(a.Department) - dRank(b.Department))
      || (levelOf(a) - levelOf(b))
      || (sRank(a.Section) - sRank(b.Section))
      || ((+a[f] || 0) - (+b[f] || 0))
      || String(a.Title || '').localeCompare(String(b.Title || ''), 'th'));
    btn.disabled = true;
    await saveOrder(order, (d, t) => { btn.textContent = `กำลังบันทึก ${d}/${t}…`; });
  });

  onClick('del', async (id) => {
    const r = rows.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (!confirm(`ต้องการลบ "${r.Title}" ออกจาก${s.title} ใช่หรือไม่`)) return;
    try {
      await remove(s.list, id);
      clearCaches();
      rerender();
    } catch (e) {
      console.error(e);
      alert('ลบไม่สำเร็จ — ' + e.message);
    }
  });
}

/**
 * เปิดฟอร์มแก้ไขโครงการจากที่อื่น (เช่นหน้าแดชบอร์ด)
 * เป็นฟังก์ชันอิสระที่ไม่พึ่งตัวแปรของหน้า admin จึงเรียกจากหน้าอื่นได้
 * เก็บประวัติค่าเดิมและเติม UpdatedDate เหมือนแก้ในหน้าจัดการข้อมูล
 */
export async function openProjectEditor(record, onSaved) {
  const sc = SCHEMA.projects;

  openModal({
    title: `${sc.icon} อัปเดตโครงการ`,
    wide: true,
    body: await formBody(sc, record || {}),
    footer: `<button class="btn-mini" id="pe-cancel">ยกเลิก</button>
             <button class="btn btn-primary" id="pe-save">บันทึกการแก้ไข</button>`,
  });

  bindDependents(sc);
  bindPhoto(sc);
  bindFiles(sc);
  bindFilters(sc);

  $('#pe-cancel').onclick = closeModal;
  $('#pe-save').onclick = async (ev) => {
    const data = collect(sc);
    if (!data) return;
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      // เก็บค่าเดิมลงประวัติก่อนเขียนทับ
      if (sc.history && record) {
        try {
          await create(sc.history, {
            Title: record.Title, ProjectCode: record.ProjectCode || '',
            PlanProgress: record.PlanProgress ?? 0, ActualProgress: record.ActualProgress ?? 0,
            ActualPayment: record.ActualPayment ?? 0, Detail: record.Detail || '',
            RecordedDate: record.UpdatedDate || new Date().toISOString(),
            RecordedBy: state.user?.name || '',
          });
        } catch (e) { console.warn('บันทึกประวัติไม่สำเร็จ:', e.message); }
      }
      data.UpdatedDate = new Date().toISOString();
      await update(sc.list, record.id, data);
      closeModal();
      if (onSaved) onSaved();
    } catch (e) {
      console.error(e);
      const err = $('#form-error');
      if (err) { err.innerHTML = `บันทึกไม่สำเร็จ<br>${esc(e.message)}`; err.hidden = false; }
      btn.disabled = false;
      btn.textContent = 'บันทึกการแก้ไข';
    }
  };
}
