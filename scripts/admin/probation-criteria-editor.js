/**
 * หน้าแก้เกณฑ์ประเมินบุคลากรผ่านงาน FM-HRM-004 (เมนู 📋 เกณฑ์ประเมินผ่านงาน ในหน้าจัดการข้อมูล)
 * ใช้วิธีเดียวกับเกณฑ์ KPI: แยกเป็นชุด — ใบประเมินจำชุดที่ใช้ตอนสร้าง แก้ชุดใหม่ไม่กระทบใบที่ประเมินไปแล้ว
 *   - หัวข้อ / หมวด / น้ำหนัก (ให้คะแนนรายข้อ 1–10)
 *   - ช่วงคะแนนของเกรด + ผลทดลองงาน (ผ่าน/ไม่ผ่าน)
 *   - คำอธิบายคะแนน 1–10 ที่ผู้ประเมินเห็นในใบ
 * เก็บในตั้งค่าระบบ ProbationCriteria (services/probation-config.js)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import {
  PB_SETTING, PB_BUILTIN, builtinPb, normPb, parsePbConfig, formatPbConfig, loadPbConfig, newItemId,
} from '../services/probation-config.js';

const TABS = [['items', '📝 หัวข้อและน้ำหนัก'], ['grades', '🏅 เกรดและเกณฑ์ผ่านทดลองงาน'], ['scale', '📋 คำอธิบายคะแนน 1–10']];

let draft = { current: PB_BUILTIN, sets: {} };
let saved = '';
let ver = PB_BUILTIN;
let tab = 'items';
let usage = {};          // ชื่อชุด → จำนวนใบประเมินที่ใช้

const dirty = () => formatPbConfig(draft) !== saved;
const readOnly = () => !draft.sets[ver];
const cur = () => draft.sets[ver] || normPb(builtinPb());
const r2 = (v) => Math.round(v * 100) / 100;
const isPb = (r) => /ทดลองงาน|ผ่านงาน/.test(String(r.FormSet || ''));

export async function pbCriteriaHtml() {
  const [cfg, sheets] = await Promise.all([loadPbConfig({ fresh: true }), list('appraisals').catch(() => [])]);
  draft = JSON.parse(JSON.stringify(cfg));
  saved = formatPbConfig(draft);
  ver = draft.current;
  usage = {};
  sheets.filter(isPb).forEach((r) => {
    let v = '';
    try { v = JSON.parse(r.Extra || '{}').pbVer || ''; } catch (e) { v = ''; }
    v = v && (draft.sets[v] || v === PB_BUILTIN) ? v : PB_BUILTIN;   // ใบเก่าที่ไม่ได้จำชุด = ชุดมาตรฐาน
    usage[v] = (usage[v] || 0) + 1;
  });
  return `<div class="panel-head">📋 เกณฑ์ประเมินผ่านงาน (FM-HRM-004)</div>
    <div class="om-intro">
      หัวข้อ น้ำหนัก เกรด และคำอธิบายคะแนน ของแบบ <b>ประเมินบุคลากรผ่านงาน (FM-HRM-004)</b> — แยกเป็น <b>ชุดเกณฑ์</b> เหมือน KPI
      <ul>
        <li>อยากแก้: กด <b>✏️ แก้ไข (สร้างสำเนา)</b> หรือ <b>＋ สร้างชุดใหม่</b> (คัดลอกจากชุดที่เลือก) → แก้หัวข้อ/น้ำหนัก/เกรด → กด <b>ใช้กับรอบใหม่</b> → <b>บันทึก</b></li>
        <li>ใบประเมินจำชุดที่ใช้ตอนสร้างใบ — แก้ชุดใหม่ <b>ไม่กระทบ</b> ใบที่ประเมินไปแล้ว</li>
        <li>เพิ่ม/ลบหัวข้อ เพิ่มหมวดได้ · น้ำหนักรายข้อรวมควรเท่ากับ 100 · ให้คะแนนรายข้อ 1–10</li>
      </ul>
    </div>
    <div id="kc-editor" class="pb-editor"></div>`;
}

/* ───────── วาด ───────── */

const inp = (path, v, attrs = '') => `<input data-pb="${path}" value="${esc(String(v ?? ''))}" ${readOnly() ? 'disabled' : ''} ${attrs}>`;
const num = (path, v, attrs = '') => inp(path, v, `type="number" step="0.01" min="0" class="kc-num" ${attrs}`);

function verBar() {
  const names = [PB_BUILTIN, ...Object.keys(draft.sets).sort().reverse()];
  return `<div class="om-bar kc-bar">
    <label>ชุดเกณฑ์ <select data-pbact="ver">${names.map((n) => `<option value="${esc(n)}" ${n === ver ? 'selected' : ''}>${esc(n)}${n === draft.current ? ' · ใช้กับรอบใหม่' : ''}${n === PB_BUILTIN ? ' (ตามเอกสาร Rev.02 ติดมากับระบบ)' : ''}</option>`).join('')}</select></label>
    <span class="dim">ใบประเมินที่ใช้ชุดนี้ ${usage[ver] || 0} ใบ</span>
    <button class="btn-mini" data-pbact="new">＋ สร้างชุดใหม่</button>
    ${ver !== draft.current ? '<button class="btn-mini" data-pbact="use">✓ ใช้กับรอบใหม่</button>' : ''}
    ${!readOnly() ? '<button class="btn-mini danger" data-pbact="del">🗑 ลบชุดนี้</button>' : ''}
    <span style="flex:1"></span>
    <button class="btn-mini" data-pbact="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
    <button class="btn btn-primary om-save" data-pbact="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
  </div>
  ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
  ${readOnly() ? `<div class="panel-note kc-ro">ชุด <b>${esc(PB_BUILTIN)}</b> ติดมากับระบบ (ตามเอกสาร FM-HRM-004 Rev.02) จึงแก้ตรง ๆ ไม่ได้
      <button class="btn btn-primary kc-copy" data-pbact="new">✏️ แก้ไข (สร้างสำเนาจากชุดนี้)</button></div>` : ''}
  ${!readOnly() && (usage[ver] || 0) > 0 ? `<div class="panel-note kc-warn">⚠️ มีใบประเมิน ${usage[ver]} ใบใช้ชุดนี้อยู่ — แก้แล้วคะแนน/เกรดในใบเหล่านั้นจะคิดตามเกณฑ์ใหม่</div>` : ''}`;
}

function itemsHtml() {
  const s = cur();
  const all = s.secs.reduce((t, c) => t + c.items.reduce((x, it) => x + (+it.weight || 0), 0), 0);
  let no = 0;
  return `
    <div class="kc-sum ${Math.abs(all - 100) > 0.05 ? 'bad' : ''}">น้ำหนักรายข้อรวม <b data-pbsum>${r2(all)}</b> / 100 · ให้คะแนนรายข้อ 1–10</div>
    ${s.secs.map((c, ci) => {
      const sumW = c.items.reduce((t, it) => t + (+it.weight || 0), 0);
      return `<section class="om-group kc-cat">
        <div class="kc-cathead">
          <label class="kc-no">หมวด <input class="kc-num" value="${ci + 1}" disabled></label>
          <label class="kc-name">ชื่อหมวด ${inp(`c.${ci}.name`, c.name)}</label>
          <label class="kc-w" title="แสดงในใบประเมินเท่านั้น · คะแนนคิดจากน้ำหนักรายข้อ">น้ำหนักหมวด (%) ${num(`c.${ci}.weight`, c.weight)}</label>
          ${readOnly() ? '' : `<button class="btn-mini danger" data-pbdelcat="${ci}" title="ลบหมวดนี้">✕</button>`}
        </div>
        <table class="ap-table kc-items"><thead><tr><th>ลำดับ</th><th>หัวข้อประเมิน</th><th class="num">น้ำหนัก (%)</th><th></th></tr></thead>
          <tbody>${c.items.map((it, ii) => { no += 1; return `<tr>
            <td class="kc-code"><span class="pb-no">${no}</span></td>
            <td>${inp(`c.${ci}.i.${ii}.title`, it.title, 'class="kc-title"')}</td>
            <td class="num">${num(`c.${ci}.i.${ii}.weight`, it.weight)}</td>
            <td>${readOnly() ? '' : `<button class="btn-mini danger" data-pbdel="${ci}.${ii}" title="ลบข้อนี้">✕</button>`}</td></tr>`; }).join('')}</tbody>
          <tfoot><tr><td></td><td class="dim">น้ำหนักรวมหมวดนี้</td><td class="num"><b>${r2(sumW)}</b></td><td></td></tr></tfoot>
        </table>
        ${readOnly() ? '' : `<button class="btn-mini" data-pbadd="${ci}">＋ เพิ่มหัวข้อ</button>`}
      </section>`;
    }).join('')}
    ${readOnly() ? '' : `<button class="btn-mini" data-pbact="addcat">＋ เพิ่มหมวด</button>
      <button class="btn-mini" data-pbact="even" title="แบ่ง 100 ให้ทุกข้อเท่ากัน (เศษใส่ข้อสุดท้าย) · น้ำหนักหมวด = ผลรวมของหมวด">⚖ แบ่งน้ำหนักเท่ากันทุกข้อ</button>`}`;
}

function gradesHtml() {
  const s = cur();
  return `<section class="om-group">
      <div class="om-ghead"><b class="om-glabel">ช่วงคะแนนของเกรด</b><span class="dim">คะแนนรวม 0–100 ตั้งแต่ … ขึ้นไป ได้เกรดนี้ · เรียงจากสูงไปต่ำอัตโนมัติ</span></div>
      <table class="ap-table kc-grades"><thead><tr><th class="num">คะแนนตั้งแต่</th><th>เกรด</th><th>ความหมาย</th><th>ผลทดลองงาน</th><th></th></tr></thead>
      <tbody>${s.grades.map((g, i) => `<tr>
        <td class="num">${num(`g.${i}.0`, g[0])}</td>
        <td class="kc-code">${inp(`g.${i}.1`, g[1])}</td>
        <td>${inp(`g.${i}.2`, g[2], 'class="kc-title"')}</td>
        <td><select data-pb="g.${i}.3" ${readOnly() ? 'disabled' : ''}><option value="1" ${g[3] !== false ? 'selected' : ''}>ผ่าน</option><option value="0" ${g[3] === false ? 'selected' : ''}>ไม่ผ่าน</option></select></td>
        <td>${readOnly() || s.grades.length < 2 ? '' : `<button class="btn-mini danger" data-pbdelg="${i}">✕</button>`}</td></tr>`).join('')}</tbody></table>
      ${readOnly() ? '' : '<button class="btn-mini" data-pbact="addgrade">＋ เพิ่มเกรด</button>'}
    </section>
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">หมายเหตุของชุดนี้</b></div>
      ${inp('n', s.note, 'class="kc-title" placeholder="เช่น ปรับตามเอกสาร FM-HRM-004 Rev.03 ฉบับวันที่ …"')}
    </section>`;
}

function scaleHtml() {
  const s = cur();
  return `<div class="panel-note">แสดงในใบประเมินที่หัวตาราง "ให้คะแนน 1–10 (…)" · ใส่เฉพาะคะแนนที่ต้องการอธิบาย ช่องว่างไม่แสดง</div>
    <table class="ap-table kc-rubric"><thead><tr><th class="num">คะแนน</th><th>คำอธิบาย</th></tr></thead>
    <tbody>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((k) => `<tr><th class="num">${k}</th>
      <td>${inp(`s.${k}`, s.scale[k] || '', 'class="kc-title"')}</td></tr>`).join('')}</tbody></table>`;
}

function paint() {
  const box = $('#kc-editor');
  if (!box) return;
  box.innerHTML = `${verBar()}
    <div class="kc-tabs">${TABS.map(([k, l]) => `<button class="chip ${tab === k ? 'active' : ''}" data-pbtab="${k}">${l}</button>`).join('')}</div>
    <div class="kc-body">${tab === 'items' ? itemsHtml() : tab === 'grades' ? gradesHtml() : scaleHtml()}</div>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${PB_SETTING}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
}

/* ───────── แก้ค่า ───────── */

function setPath(path, value) {
  const s = draft.sets[ver];
  if (!s) return;
  const p = path.split('.');
  const n = (v) => (v === '' ? '' : +v);
  if (p[0] === 'c') {
    const c = s.secs[+p[1]];
    if (p[2] === 'i') { const it = c.items[+p[3]]; it[p[4]] = p[4] === 'weight' ? n(value) : value; }
    else c[p[2]] = p[2] === 'name' ? value : n(value);
  } else if (p[0] === 'g') {
    const g = s.grades[+p[1]];
    g[+p[2]] = +p[2] === 0 ? n(value) : +p[2] === 3 ? value !== '0' : value;
  } else if (p[0] === 's') {
    if (String(value).trim()) s.scale[p[1]] = value; else delete s.scale[p[1]];
  } else if (p[0] === 'n') s.note = value;
}

function problems() {
  const out = [];
  Object.entries(draft.sets).forEach(([name, s]) => {
    const all = s.secs.reduce((t, c) => t + c.items.reduce((x, it) => x + (+it.weight || 0), 0), 0);
    if (Math.abs(all - 100) > 0.05) out.push(`ชุด ${name}: น้ำหนักรายข้อรวม ${r2(all)} (ควรเป็น 100)`);
    if (!s.secs.some((c) => c.items.length)) out.push(`ชุด ${name}: ยังไม่มีหัวข้อประเมิน`);
    s.secs.forEach((c, ci) => {
      if (!String(c.name || '').trim()) out.push(`ชุด ${name} · หมวดที่ ${ci + 1}: ยังไม่มีชื่อหมวด`);
      c.items.forEach((it) => { if (!String(it.title || '').trim() || !(+it.weight > 0)) out.push(`ชุด ${name} · ${c.name || `หมวดที่ ${ci + 1}`}: ทุกข้อต้องมีหัวข้อและน้ำหนักมากกว่า 0`); });
    });
    const gs = s.grades.map((g) => String(g[1] || '').trim());
    if (gs.some((g) => !g) || new Set(gs).size !== gs.length) out.push(`ชุด ${name}: ชื่อเกรดต้องไม่ว่างและไม่ซ้ำกัน`);
  });
  return [...new Set(out)];
}

async function save(btn) {
  const bad = problems();
  const hard = bad.filter((m) => !/ควรเป็น 100/.test(m));
  if (hard.length) { alert(`ยังบันทึกไม่ได้:\n• ${hard.slice(0, 12).join('\n• ')}`); return; }
  if (bad.length && !confirm(`${bad.slice(0, 12).join('\n')}\n\nบันทึกต่อหรือไม่?`)) return;
  const value = formatPbConfig(draft);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === PB_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: PB_SETTING, Value: value, Description: 'เกณฑ์ประเมินบุคลากรผ่านงาน FM-HRM-004 (หัวข้อ น้ำหนัก เกรด คำอธิบายคะแนน) แยกเป็นชุด — แก้ที่ จัดการข้อมูล → 📋 เกณฑ์ประเมินผ่านงาน' });
    draft = JSON.parse(JSON.stringify(await loadPbConfig({ fresh: true })));
    saved = formatPbConfig(draft);
    if (!draft.sets[ver] && ver !== PB_BUILTIN) ver = draft.current;
    toast('✓ บันทึกเกณฑ์ประเมินผ่านงานแล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message + (/255|length|too long|ยาว/i.test(e.message) ? ' — คอลัมน์ Value ของ List Settings ต้องเป็น Multiple lines of text' : ''), 'bad');
  }
  paint();
}

function action(a, btn) {
  const s = draft.sets[ver];
  if (a === 'save') { save(btn); return; }
  if (a === 'reset') {
    if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
    draft = parsePbConfig(saved);
    if (!draft.sets[ver] && ver !== PB_BUILTIN) ver = draft.current;
  } else if (a === 'new') {
    const name = String(prompt(`ชื่อชุดเกณฑ์ใหม่ (เช่น 2569/2 หรือ Rev.03) — คัดลอกจากชุด "${ver}"`, `${new Date().getFullYear() + 543}`) || '').trim();
    if (!name) return;
    if (draft.sets[name] || name === PB_BUILTIN) { alert(`มีชุดชื่อ "${name}" อยู่แล้ว`); return; }
    draft.sets[name] = JSON.parse(JSON.stringify(cur()));
    draft.sets[name].note = '';
    if (draft.current === PB_BUILTIN) draft.current = name;    // ชุดแรกที่สร้าง ใช้กับรอบใหม่ทันที
    ver = name;
  } else if (a === 'use') {
    draft.current = ver;
  } else if (a === 'del') {
    if ((usage[ver] || 0) > 0 && !confirm(`มีใบประเมิน ${usage[ver]} ใบใช้ชุด "${ver}" — ลบแล้วใบเหล่านั้นจะใช้ชุดที่ใช้กับรอบใหม่แทน ลบต่อหรือไม่?`)) return;
    if (!(usage[ver] || 0) && !confirm(`ลบชุด "${ver}"?`)) return;
    delete draft.sets[ver];
    if (draft.current === ver) draft.current = PB_BUILTIN;
    ver = draft.current;
  } else if (a === 'addcat' && s) {
    s.secs.push({ name: '', weight: 0, items: [] });
  } else if (a === 'even' && s) {
    const items = s.secs.flatMap((c) => c.items);
    if (!items.length) return;
    const each = Math.floor((100 / items.length) * 100) / 100;
    items.forEach((it, i) => { it.weight = i === items.length - 1 ? r2(100 - each * (items.length - 1)) : each; });
    s.secs.forEach((c) => { c.weight = r2(c.items.reduce((t, it) => t + it.weight, 0)); });
  } else if (a === 'addgrade' && s) {
    s.grades.push([0, '', '', true]);
  }
  paint();
}

export function bindPbCriteriaEditor() {
  const box = $('#kc-editor');
  if (!box) return;
  paint();
  const refresh = () => {
    box.querySelectorAll('[data-pbact="save"], [data-pbact="reset"]').forEach((b) => { b.disabled = !dirty(); });
  };
  box.addEventListener('input', (e) => {
    const t = e.target.closest('[data-pb]');
    if (!t || t.tagName === 'SELECT') return;
    setPath(t.dataset.pb, t.value);
    refresh();
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pbact === 'ver') { ver = t.value; paint(); return; }
    if (t.dataset.pb) {
      setPath(t.dataset.pb, t.value);
      // ค่าที่มีผลกับยอดรวม/ลำดับ วาดใหม่ตอนออกจากช่อง
      if (/^(c\.\d+\.(weight|i\.\d+\.weight)|g\.)/.test(t.dataset.pb)) paint(); else refresh();
    }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const s = draft.sets[ver];
    if (b.dataset.pbact && b.tagName === 'BUTTON') { action(b.dataset.pbact, b); return; }
    if (b.dataset.pbtab) { tab = b.dataset.pbtab; paint(); return; }
    if (!s) return;
    if (b.dataset.pbadd !== undefined) {
      s.secs[+b.dataset.pbadd].items.push({ id: newItemId(), title: '', weight: 0 });
      paint();
      const ins = box.querySelectorAll(`[data-pb^="c.${b.dataset.pbadd}.i."][data-pb$=".title"]`);
      if (ins.length) ins[ins.length - 1].focus();
    } else if (b.dataset.pbdel) {
      const [ci, ii] = b.dataset.pbdel.split('.').map(Number);
      s.secs[ci].items.splice(ii, 1); paint();
    } else if (b.dataset.pbdelcat !== undefined) {
      const c = s.secs[+b.dataset.pbdelcat];
      if (!confirm(`ลบหมวด "${c.name || '(ไม่มีชื่อ)'}" และหัวข้อทั้งหมดในหมวดนี้?`)) return;
      s.secs.splice(+b.dataset.pbdelcat, 1); paint();
    } else if (b.dataset.pbdelg !== undefined) {
      s.grades.splice(+b.dataset.pbdelg, 1); paint();
    }
  });
}

export const pbCriteriaUnsaved = () => !!$('#kc-editor.pb-editor') && dirty();
