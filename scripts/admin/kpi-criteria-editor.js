/**
 * หน้าแก้เกณฑ์การประเมิน KPI ประจำปี (เมนู 🎯 เกณฑ์ประเมิน KPI ในหน้าจัดการข้อมูล)
 * แยกเป็นชุดรายปี — ใบประเมินจำชุดที่ใช้ตอนสร้าง แก้ชุดปีใหม่ไม่กระทบใบของปีก่อน
 *   - หัวข้อ/น้ำหนัก ของแบบ GA และ MG ทั้ง Part 1 และ Part 2 (รวมน้ำหนักข้อเฉพาะตำแหน่ง ตัวแดง)
 *   - เกณฑ์ให้คะแนนรายข้อ 0–10 · ช่วงคะแนนของเกรด · เกณฑ์ขั้นต่ำพิจารณาโบนัส
 * เก็บในตั้งค่าระบบ KpiCriteria (services/kpi-config.js)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import {
  KPI_SETTING, BUILTIN_VER, builtinSet, normSet, parseKpiConfig, formatKpiConfig, loadKpiConfig,
} from '../services/kpi-config.js';

const PARTS = [['skill', 'Part 1: Skill / Functional Competency'], ['behavior', 'Part 2: Behavioral Competency']];
const FORMS = [['GA', 'ฉบับบุคลากรทั่วไป (GA)'], ['MG', 'ฉบับหัวหน้างาน / ผู้จัดการ (MG)']];
const TABS = [['items', '📝 หัวข้อและน้ำหนัก'], ['rubric', '📋 เกณฑ์ให้คะแนน 0–10'], ['grades', '🏅 เกรดและโบนัส']];
const KPI_SET = 'ประเมิน KPI ประจำปี';

let draft = { current: BUILTIN_VER, sets: {} };
let saved = '';
let ver = BUILTIN_VER;
let form = 'GA';
let part = 'skill';
let tab = 'items';
let usage = {};          // ชื่อชุด → จำนวนใบประเมินที่ใช้

const dirty = () => formatKpiConfig(draft) !== saved;
const readOnly = () => !draft.sets[ver];
const cur = () => draft.sets[ver] || normSet(builtinSet());
const thYear = () => String(new Date().getFullYear() + 543);

export async function kpiCriteriaHtml() {
  const [cfg, sheets] = await Promise.all([loadKpiConfig({ fresh: true }), list('appraisals').catch(() => [])]);
  draft = JSON.parse(JSON.stringify(cfg));
  saved = formatKpiConfig(draft);
  ver = draft.sets[draft.current] ? draft.current : (Object.keys(draft.sets)[0] || BUILTIN_VER);
  usage = {};
  sheets.filter((r) => String(r.FormSet || '').trim() === KPI_SET).forEach((r) => {
    let v = '';
    try { v = (JSON.parse(r.Extra || '{}').kpi || {}).ver || ''; } catch (e) { v = ''; }
    v = v && (draft.sets[v] || v === BUILTIN_VER) ? v : draft.current;
    usage[v] = (usage[v] || 0) + 1;
  });
  return `<div class="panel-head">🎯 เกณฑ์ประเมิน KPI ประจำปี</div>
    <div class="om-intro">
      หัวข้อ น้ำหนัก เกณฑ์ให้คะแนน เกรด และเกณฑ์โบนัส ของแบบประเมิน <b>KPI ประจำปี</b> — แยกเป็น <b>ชุดรายปี</b>
      <ul>
        <li>ปีใหม่: กด <b>＋ สร้างชุดใหม่</b> (คัดลอกจากชุดที่เลือก) แล้วแก้ตามไฟล์ปีนั้น → กด <b>ใช้กับรอบใหม่</b></li>
        <li>ใบประเมินจำชุดที่ใช้ตอนสร้างใบ — แก้ชุดปีใหม่ <b>ไม่กระทบ</b> ใบของปีก่อน</li>
        <li>แก้ชุดที่มีใบประเมินใช้อยู่ คะแนนในใบเหล่านั้นจะคิดตามเกณฑ์ใหม่ทันที</li>
        <li>หัวข้อเฉพาะตำแหน่ง (ตัวแดง) ไม่ต้องใส่ที่นี่ — ใส่แค่ <b>น้ำหนักสูงสุด</b> ของหมวด หัวหน้างานกำหนดหัวข้อเองในใบประเมิน</li>
      </ul>
    </div>
    <div id="kc-editor"></div>`;
}

/* ───────── วาด ───────── */

const inp = (path, v, attrs = '') => `<input data-kc="${path}" value="${esc(String(v ?? ''))}" ${readOnly() ? 'disabled' : ''} ${attrs}>`;
const num = (path, v, attrs = '') => inp(path, v, `type="number" step="0.5" min="0" class="kc-num" ${attrs}`);

function verBar() {
  const names = Object.keys(draft.sets).sort().reverse();
  const opts = names.length ? names : [BUILTIN_VER];
  return `<div class="om-bar kc-bar">
    <label>ชุดเกณฑ์ <select data-kcact="ver">${opts.map((n) => `<option value="${esc(n)}" ${n === ver ? 'selected' : ''}>${esc(n)}${n === draft.current ? ' · ใช้กับรอบใหม่' : ''}${n === BUILTIN_VER ? ' (ติดมากับระบบ)' : ''}</option>`).join('')}</select></label>
    <span class="dim">ใบประเมินที่ใช้ชุดนี้ ${usage[ver] || 0} ใบ</span>
    <button class="btn-mini" data-kcact="new">＋ สร้างชุดใหม่</button>
    ${!readOnly() && ver !== draft.current ? '<button class="btn-mini" data-kcact="use">✓ ใช้กับรอบใหม่</button>' : ''}
    ${!readOnly() ? '<button class="btn-mini danger" data-kcact="del">🗑 ลบชุดนี้</button>' : ''}
    <span style="flex:1"></span>
    <button class="btn-mini" data-kcact="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
    <button class="btn btn-primary om-save" data-kcact="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
  </div>
  ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
  ${readOnly() ? `<div class="panel-note kc-ro">ชุด <b>${esc(BUILTIN_VER)}</b> ติดมากับระบบ (ตามไฟล์ Excel ปี 2569) แก้ไม่ได้ — กด <b>＋ สร้างชุดใหม่</b> เพื่อคัดลอกไปแก้</div>` : ''}
  ${!readOnly() && (usage[ver] || 0) > 0 ? `<div class="panel-note kc-warn">⚠️ มีใบประเมิน ${usage[ver]} ใบใช้ชุดนี้อยู่ — แก้แล้วคะแนน/เกรดในใบเหล่านั้นจะคิดตามเกณฑ์ใหม่</div>` : ''}`;
}

function itemsHtml() {
  const s = cur();
  const cats = s.forms[form][part];
  const sumCat = cats.reduce((t, c) => t + (+c.weight || 0), 0);
  return `
    <div class="kc-pick">
      ${FORMS.map(([k, l]) => `<button class="chip ${form === k ? 'active' : ''}" data-kcform="${k}">${esc(l)}</button>`).join('')}
      <span class="kc-sep"></span>
      ${PARTS.map(([k, l]) => `<button class="chip ${part === k ? 'active' : ''}" data-kcpart="${k}">${esc(l)}</button>`).join('')}
      <button class="btn-mini" data-kcact="copyform" ${readOnly() ? 'disabled' : ''} title="คัดลอกหัวข้อ Part นี้ไปอีกฉบับ">⇄ คัดลอกไป${form === 'GA' ? ' MG' : ' GA'}</button>
    </div>
    <div class="kc-sum ${Math.abs(sumCat - 100) > 1e-9 ? 'bad' : ''}">น้ำหนักหมวดรวม <b data-kcsum>${sumCat}</b> / 100</div>
    ${cats.map((c, ci) => {
      const sumW = c.items.reduce((t, it) => t + (+it[2] || 0), 0);
      return `<section class="om-group kc-cat">
        <div class="kc-cathead">
          <label class="kc-no">ข้อ ${num(`c.${ci}.no`, c.no, 'step="1" min="1"')}</label>
          <label class="kc-name">ชื่อหมวด ${inp(`c.${ci}.name`, c.name)}</label>
          <label class="kc-w">น้ำหนักหมวด ${num(`c.${ci}.weight`, c.weight)}</label>
          ${part === 'skill' ? `<label class="kc-w kc-red" title="หัวหน้างานเพิ่มหัวข้อเฉพาะตำแหน่งได้ น้ำหนักรวมไม่เกินค่านี้ · 0 = ไม่มี">ตัวแดง (เฉพาะตำแหน่ง) ${num(`c.${ci}.budget`, c.budget || 0)}</label>` : ''}
          ${readOnly() ? '' : `<button class="btn-mini danger" data-kcdelcat="${ci}" title="ลบหมวดนี้">✕</button>`}
        </div>
        <table class="ap-table kc-items"><thead><tr><th>รหัส</th><th>หัวข้อ / ตัวชี้วัด</th><th class="num">น้ำหนักรายข้อ</th><th></th></tr></thead>
          <tbody>${c.items.map((it, ii) => `<tr>
            <td class="kc-code">${inp(`c.${ci}.i.${ii}.0`, it[0])}</td>
            <td>${inp(`c.${ci}.i.${ii}.1`, it[1], 'class="kc-title"')}</td>
            <td class="num">${num(`c.${ci}.i.${ii}.2`, it[2])}</td>
            <td>${readOnly() ? '' : `<button class="btn-mini danger" data-kcdel="${ci}.${ii}" title="ลบข้อนี้">✕</button>`}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td></td><td class="dim">น้ำหนักรายข้อรวม${c.budget ? ` (ไม่รวมตัวแดง ${c.budget})` : ''}</td><td class="num"><b>${sumW}</b></td><td></td></tr></tfoot>
        </table>
        ${readOnly() ? '' : `<button class="btn-mini" data-kcadd="${ci}">＋ เพิ่มหัวข้อ</button>`}
      </section>`;
    }).join('')}
    ${readOnly() ? '' : '<button class="btn-mini" data-kcact="addcat">＋ เพิ่มหมวด</button>'}`;
}

function rubricHtml() {
  const s = cur();
  return `<div class="panel-note">ให้คะแนนรายข้อ 0–10 ทีละ 0.5 · <b>ช่วงระดับ</b> ใส่เฉพาะแถวแรกของช่วง · <b>เกรดเทียบ</b> ใส่เฉพาะแถวที่ต้องการแสดง</div>
    <table class="ap-table kc-rubric"><thead><tr><th class="num">คะแนน</th><th>คำอธิบาย</th><th>ช่วงระดับ</th><th>เกรดเทียบ</th></tr></thead>
    <tbody>${s.rubric.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => `<tr>
      <th class="num">${r[0]}</th>
      <td><textarea data-kc="r.${i}.1" rows="2" ${readOnly() ? 'disabled' : ''}>${esc(r[1])}</textarea></td>
      <td>${inp(`r.${i}.2`, r[2])}</td>
      <td class="kc-code">${inp(`r.${i}.3`, r[3])}</td></tr>`).join('')}</tbody></table>`;
}

function gradesHtml() {
  const s = cur();
  return `<section class="om-group">
      <div class="om-ghead"><b class="om-glabel">ช่วงคะแนนของเกรด</b><span class="dim">คะแนนตั้งแต่ … ขึ้นไป ได้เกรดนี้ · เรียงจากสูงไปต่ำอัตโนมัติ</span></div>
      <table class="ap-table kc-grades"><thead><tr><th class="num">คะแนนตั้งแต่</th><th>เกรด</th><th>ความหมาย</th><th></th></tr></thead>
      <tbody>${s.grades.map((g, i) => `<tr>
        <td class="num">${num(`g.${i}.0`, g[0], 'step="0.01"')}</td>
        <td class="kc-code">${inp(`g.${i}.1`, g[1])}</td>
        <td>${inp(`g.${i}.2`, g[2], 'class="kc-title"')}</td>
        <td>${readOnly() || s.grades.length < 2 ? '' : `<button class="btn-mini danger" data-kcdelg="${i}">✕</button>`}</td></tr>`).join('')}</tbody></table>
      ${readOnly() ? '' : '<button class="btn-mini" data-kcact="addgrade">＋ เพิ่มเกรด</button>'}
    </section>
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">เกณฑ์ขั้นต่ำพิจารณาโบนัส / ปรับเงินเดือน</b><span class="dim">ต้องผ่านทั้งจากผู้บังคับบัญชาและผู้บริหาร</span></div>
      <div class="mil-rates">
        ${PARTS.map(([k, l]) => `<label>${esc(l.split(':')[0])} ได้ตั้งแต่
          <select data-kc="b.${k}" ${readOnly() ? 'disabled' : ''}>${s.grades.map((g) => `<option ${g[1] === s.bonus[k] ? 'selected' : ''}>${esc(g[1])}</option>`).join('')}</select> ขึ้นไป</label>`).join('')}
      </div>
    </section>
    <section class="om-group">
      <div class="om-ghead"><b class="om-glabel">หมายเหตุของชุดนี้</b></div>
      ${inp('n', s.note, 'class="kc-title" placeholder="เช่น ตามไฟล์ประเมิน KPI ปี 2570 ฉบับวันที่ …"')}
    </section>`;
}

function paint() {
  const box = $('#kc-editor');
  if (!box) return;
  box.innerHTML = `${verBar()}
    <div class="kc-tabs">${TABS.map(([k, l]) => `<button class="chip ${tab === k ? 'active' : ''}" data-kctab="${k}">${l}</button>`).join('')}</div>
    <div class="kc-body">${tab === 'items' ? itemsHtml() : tab === 'rubric' ? rubricHtml() : gradesHtml()}</div>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${KPI_SETTING}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
}

/* ───────── แก้ค่า ───────── */

function setPath(path, value) {
  const s = draft.sets[ver];
  if (!s) return;
  const p = path.split('.');
  const n = (v) => (v === '' ? '' : +v);
  if (p[0] === 'c') {
    const c = s.forms[form][part][+p[1]];
    if (p[2] === 'i') c.items[+p[3]][+p[4]] = +p[4] === 2 ? n(value) : value;
    else c[p[2]] = p[2] === 'name' ? value : n(value);
    if (p[2] === 'budget' && !(+value > 0)) delete c.budget;
  } else if (p[0] === 'r') s.rubric[+p[1]][+p[2]] = value;
  else if (p[0] === 'g') s.grades[+p[1]][+p[2]] = +p[2] === 0 ? n(value) : value;
  else if (p[0] === 'b') s.bonus[p[1]] = value;
  else if (p[0] === 'n') s.note = value;
}

function problems() {
  const out = [];
  Object.entries(draft.sets).forEach(([name, s]) => {
    FORMS.forEach(([f, fl]) => PARTS.forEach(([pt, pl]) => {
      const cats = s.forms[f][pt];
      const sum = cats.reduce((t, c) => t + (+c.weight || 0), 0);
      if (Math.abs(sum - 100) > 1e-9) out.push(`ชุด ${name} · ${fl} · ${pl.split(':')[0]}: น้ำหนักหมวดรวม ${sum} (ควรเป็น 100)`);
      cats.forEach((c) => {
        if (!String(c.name || '').trim()) out.push(`ชุด ${name} · ${f} · ${pl.split(':')[0]} ข้อ ${c.no}: ยังไม่มีชื่อหมวด`);
        if (!c.items.length && !c.budget) out.push(`ชุด ${name} · ${f} · ${pl.split(':')[0]} ข้อ ${c.no}: ยังไม่มีหัวข้อ`);
        c.items.forEach((it) => { if (!String(it[1] || '').trim() || !(+it[2] > 0)) out.push(`ชุด ${name} · ${f} · ข้อ ${it[0] || c.no}: ต้องมีหัวข้อและน้ำหนักมากกว่า 0`); });
      });
    }));
    const gs = s.grades.map((g) => String(g[1] || '').trim());
    if (gs.some((g) => !g) || new Set(gs).size !== gs.length) out.push(`ชุด ${name}: ชื่อเกรดต้องไม่ว่างและไม่ซ้ำกัน`);
  });
  return out;
}

async function save(btn) {
  const bad = problems();
  const hard = bad.filter((m) => !/ควรเป็น 100/.test(m));
  if (hard.length) { alert(`ยังบันทึกไม่ได้:\n• ${hard.slice(0, 12).join('\n• ')}`); return; }
  if (bad.length && !confirm(`${bad.slice(0, 12).join('\n')}\n\nบันทึกต่อหรือไม่?`)) return;
  const value = formatKpiConfig(draft);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === KPI_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: KPI_SETTING, Value: value, Description: 'เกณฑ์ประเมิน KPI ประจำปี (หัวข้อ น้ำหนัก เกณฑ์ 0–10 เกรด โบนัส) แยกชุดรายปี — แก้ที่ จัดการข้อมูล → 🎯 เกณฑ์ประเมิน KPI' });
    draft = await loadKpiConfig({ fresh: true });
    draft = JSON.parse(JSON.stringify(draft));
    saved = formatKpiConfig(draft);
    toast('✓ บันทึกเกณฑ์ประเมิน KPI แล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

function action(a, btn) {
  const s = draft.sets[ver];
  if (a === 'save') { save(btn); return; }
  if (a === 'reset') {
    if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นข้อมูลที่บันทึกล่าสุด?')) return;
    draft = parseKpiConfig(saved);
    if (!draft.sets[ver] && ver !== BUILTIN_VER) ver = draft.current;
  } else if (a === 'new') {
    const name = String(prompt(`ชื่อชุดเกณฑ์ใหม่ (เช่น ปี พ.ศ.) — คัดลอกจากชุด "${ver}"`, thYear()) || '').trim();
    if (!name) return;
    if (draft.sets[name] || name === BUILTIN_VER) { alert(`มีชุดชื่อ "${name}" อยู่แล้ว`); return; }
    draft.sets[name] = JSON.parse(JSON.stringify(cur()));
    draft.sets[name].note = '';
    if (!draft.sets[draft.current]) draft.current = name;    // ชุดแรกที่สร้าง ใช้กับรอบใหม่ทันที
    ver = name;
  } else if (a === 'use') {
    draft.current = ver;
  } else if (a === 'del') {
    if ((usage[ver] || 0) > 0 && !confirm(`มีใบประเมิน ${usage[ver]} ใบใช้ชุด "${ver}" — ลบแล้วใบเหล่านั้นจะใช้ชุดปัจจุบันแทน ลบต่อหรือไม่?`)) return;
    if (!(usage[ver] || 0) && !confirm(`ลบชุด "${ver}"?`)) return;
    delete draft.sets[ver];
    const rest = Object.keys(draft.sets).sort();
    if (draft.current === ver) draft.current = rest[rest.length - 1] || BUILTIN_VER;
    ver = draft.current;
  } else if (a === 'copyform' && s) {
    const other = form === 'GA' ? 'MG' : 'GA';
    if (!confirm(`แทนที่หัวข้อ ${PARTS.find((p) => p[0] === part)[1].split(':')[0]} ของฉบับ ${other} ด้วยของฉบับ ${form}?`)) return;
    s.forms[other][part] = JSON.parse(JSON.stringify(s.forms[form][part]));
  } else if (a === 'addcat' && s) {
    const cats = s.forms[form][part];
    cats.push({ no: cats.length + 1, name: '', weight: 0, items: [] });
  } else if (a === 'addgrade' && s) {
    s.grades.push([0, '', '']);
  }
  paint();
}

export function bindKpiCriteriaEditor() {
  const box = $('#kc-editor');
  if (!box) return;
  paint();
  const refresh = () => {
    box.querySelectorAll('[data-kcact="save"], [data-kcact="reset"]').forEach((b) => { b.disabled = !dirty(); });
    const sum = box.querySelector('[data-kcsum]');
    if (sum && draft.sets[ver]) {
      const t = draft.sets[ver].forms[form][part].reduce((a, c) => a + (+c.weight || 0), 0);
      sum.textContent = t; sum.parentElement.classList.toggle('bad', Math.abs(t - 100) > 1e-9);
    }
  };
  box.addEventListener('input', (e) => {
    const t = e.target.closest('[data-kc]');
    if (!t || t.tagName === 'SELECT') return;
    setPath(t.dataset.kc, t.value);
    refresh();
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.kcact === 'ver') { ver = t.value; paint(); return; }
    if (t.dataset.kc) {
      setPath(t.dataset.kc, t.value);
      // ค่าที่มีผลกับยอดรวม/ลำดับ วาดใหม่ตอนออกจากช่อง
      if (/^(c\.\d+\.(weight|budget|i\.\d+\.2)|g\.|b\.)/.test(t.dataset.kc)) paint(); else refresh();
    }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const s = draft.sets[ver];
    if (b.dataset.kcact && b.tagName === 'BUTTON') { action(b.dataset.kcact, b); return; }
    if (b.dataset.kctab) { tab = b.dataset.kctab; paint(); return; }
    if (b.dataset.kcform) { form = b.dataset.kcform; paint(); return; }
    if (b.dataset.kcpart) { part = b.dataset.kcpart; paint(); return; }
    if (!s) return;
    const cats = s.forms[form][part];
    if (b.dataset.kcadd !== undefined) {
      const c = cats[+b.dataset.kcadd];
      c.items.push([`${c.no}.${c.items.length + 1}`, '', 0]);
      paint();
      const ins = box.querySelectorAll(`[data-kc^="c.${b.dataset.kcadd}.i."][data-kc$=".1"]`);
      if (ins.length) ins[ins.length - 1].focus();
    } else if (b.dataset.kcdel) {
      const [ci, ii] = b.dataset.kcdel.split('.').map(Number);
      cats[ci].items.splice(ii, 1); paint();
    } else if (b.dataset.kcdelcat !== undefined) {
      const c = cats[+b.dataset.kcdelcat];
      if (!confirm(`ลบหมวด ${c.no} ${c.name} และหัวข้อทั้งหมดในหมวดนี้?`)) return;
      cats.splice(+b.dataset.kcdelcat, 1); paint();
    } else if (b.dataset.kcdelg !== undefined) {
      s.grades.splice(+b.dataset.kcdelg, 1); paint();
    }
  });
}

export const kpiCriteriaUnsaved = () => !!$('#kc-editor') && dirty();
