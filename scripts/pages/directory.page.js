import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { groupByDepartment, groupOrder, extensionOf, sections } from '../utils/dept.js';
import { toArray } from '../admin/entity-form.js';
import { state, setState } from '../core/state.js';

export const meta = { route: 'directory', title: 'บุคลากร', nav: true, order: 8, adminOnly: false };

/** ระดับในผังฝ่าย — เลข 1 อยู่บนสุด */
export const LEVELS = [
  '1 — ผู้อำนวยการฝ่าย / ผู้บริหารสูงสุด',
  '2 — ผู้จัดการฝ่าย / รองผู้บริหาร',
  '3 — รองผู้จัดการฝ่าย',
  '4 — ผู้จัดการแผนก / เลขานุการ',
  '5 — บุคลากรในแผนก',
];
const TOP_TIERS = [1, 2, 3, 4];   // ชั้นที่จัดกึ่งกลาง
const STAFF_TIER = 5;             // ชั้นที่เรียงเป็นตาราง

/** ถ้ายังไม่ได้ระบุระดับ ให้เดาจากชื่อตำแหน่งไปก่อน */
function levelOf(p) {
  const n = parseInt(p.Level, 10);
  if (n >= 1 && n <= LEVELS.length) return n;

  const pos = p.Position || '';
  if (/^กรรมการผู้จัดการ|ผู้อำนวยการฝ่าย|^ผู้อำนวยการ/.test(pos)) return 1;
  if (/^รองกรรมการผู้จัดการ|ผู้จัดการฝ่าย|หัวหน้าฝ่าย|ผู้จัดการโครงการ/.test(pos)) return 2;
  if (/รองผู้จัดการฝ่าย|รองหัวหน้าฝ่าย/.test(pos)) return 3;
  if (/ผู้จัดการแผนก|หัวหน้าแผนก|หัวหน้างาน|เลขานุการ/.test(pos)) return 4;
  return STAFF_TIER;
}

const card = (p, cls = '') => `
  <article class="staff-card ${cls}">
    <div class="staff-photo">${p.PhotoUrl
      ? `<img src="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy" decoding="async">`
      : `<span>${esc(p.Title.slice(0, 2))}</span>`}</div>
    <div class="staff-info">
      <div class="staff-name">${esc(p.Title)} ${p.Nickname ? `<em>(${esc(p.Nickname)})</em>` : ''}</div>
      <div class="staff-en">${esc(p.NameEN)}</div>
      <div class="staff-pos">${esc(p.Position)}</div>
      ${toArray(p.Project).length
        ? `<div class="project-tag" title="${esc(toArray(p.Project).join(' · '))}">🏗 ${
            toArray(p.Project).length > 1
              ? `${toArray(p.Project).length} โครงการ`
              : esc(toArray(p.Project)[0])}</div>` : ''}
      ${toArray(p.Oversees).length > 1
        ? `<div class="oversee-tag" title="${esc(toArray(p.Oversees).join(' · '))}"
            >ดูแล ${toArray(p.Oversees).length} ฝ่าย</div>` : ''}
      ${p.Email ? `<a class="staff-mail" href="mailto:${esc(p.Email)}">✉ ${esc(p.Email)}</a>` : ''}
      <div class="staff-ext">โทรภายใน <b>${p.Extension ? esc(p.Extension) : '—'}</b></div>
    </div>
  </article>`;

/** การ์ดย่อ ใช้กับชั้นที่มีหลายคนในแถวเดียว เช่นผู้จัดการแผนก 5 คน */
const miniCard = (p) => `
  <article class="mini-card">
    <div class="mini-photo">${p.PhotoUrl
      ? `<img src="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy" decoding="async">`
      : `<span>${esc(p.Title.slice(0, 2))}</span>`}</div>
    <div class="mini-name">${esc(p.Title)}</div>
    ${p.Nickname ? `<div class="mini-nick">(${esc(p.Nickname)})</div>` : ''}
    <div class="mini-pos">${esc(p.Section || p.Position)}</div>
    <div class="mini-foot">
      <span>ต่อ ${p.Extension ? esc(p.Extension) : '—'}</span>
      ${p.Email ? `<a href="mailto:${esc(p.Email)}" title="${esc(p.Email)}">✉</a>` : ''}
    </div>
  </article>`;

/**
 * วาดผังของหนึ่งฝ่าย
 * ระดับ 1–3 จัดกึ่งกลางเป็นแถว ๆ ระดับ 4 เรียงเป็นตารางปกติ
 * ระดับ 2 ที่มีสองคนจะอยู่ซ้าย-ขวาของแถวเดียวกัน ใต้ระดับ 1
 */
function orgChart(people, secOrderList = [], groupKey = 'Section') {
  const at = (n) => people.filter((p) => levelOf(p) === n)
                          .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  const tiers = TOP_TIERS.map(at);
  const staff = at(STAFF_TIER);

  const rows = tiers
    .map((group, i) => {
      if (!group.length) return '';
      // สามคนขึ้นไปในชั้นเดียวกัน ใช้การ์ดย่อเพื่อให้อยู่แถวเดียวได้
      const mini = group.length >= 3;
      return `<div class="org-tier tier-${i + 1}${mini ? ' is-mini' : ''}">
        ${group.map((p) => (mini ? miniCard(p) : card(p, 'is-lead'))).join('')}</div>`;
    })
    .filter(Boolean)
    .join('<div class="org-link" aria-hidden="true"></div>');

  // ถ้าระบุแผนกไว้ ให้แยกบุคลากรตามแผนก เรียงตามลำดับผู้จัดการแผนก
  // ลำดับแผนก: ยึดทะเบียนแผนกเป็นหลัก ถ้าไม่มีในทะเบียนค่อยใช้ลำดับผู้จัดการแผนก
  const secOrder = [...secOrderList, ...tiers[3].map((p) => p.Section).filter(Boolean)]
    .filter((v, i, a) => a.indexOf(v) === i);
  const sections = [];
  staff.forEach((p) => {
    // ช่องโครงการเลือกได้หลายค่า คนหนึ่งจึงอาจอยู่ได้หลายกลุ่ม
    const keys = groupKey === 'Project' ? toArray(p[groupKey]) : [p[groupKey] || ''];
    (keys.length ? keys : ['']).forEach((key) => {
      let g = sections.find((x) => x.name === key);
      if (!g) sections.push((g = { name: key, rows: [] }));
      g.rows.push(p);
    });
  });
  sections.sort((a, b) => {
    const i = secOrder.indexOf(a.name), j = secOrder.indexOf(b.name);
    return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
  });

  const grouped = sections.length > 1 || (sections[0] && sections[0].name);
  const staffHtml = !staff.length ? ''
    : grouped
      ? sections.map((g) => `
          <section class="sec-group">
            <div class="sec-head">
              <h3>${esc(g.name || (groupKey === 'Project' ? 'ยังไม่ระบุโครงการ' : 'ไม่ระบุแผนก'))}</h3>
              <span>${g.rows.length} คน</span>
            </div>
            <div class="staff-grid">${g.rows.map((p) => card(p)).join('')}</div>
          </section>`).join('')
      : `<div class="staff-grid">${staff.map((p) => card(p)).join('')}</div>`;

  return `${rows ? `<div class="org-chart">${rows}</div>` : ''}${staffHtml}`;
}

export async function render(ctx) {
  const q = (state.directoryQuery || '').trim().toLowerCase();
  const all = (await list('directory')).filter((p) => p.IsActive !== false);
  const rows = q
    ? all.filter((p) => Object.values(p).join(' ').toLowerCase().includes(q))
    : all;
  let groups = await groupByDepartment(rows);

  /**
   * ผู้อำนวยการที่ระบุว่าดูแลหลายฝ่าย จะถูกเก็บเป็นระเบียนเดียว
   * แต่ต้องแสดงบนสุดของทุกฝ่ายที่ดูแล จึงยืมมาแสดงโดยไม่คัดลอกข้อมูล
   */
  const directors = rows.filter((p) => toArray(p.Oversees).length);
  if (directors.length) {
    const extra = [];
    directors.forEach((d) => {
      toArray(d.Oversees).forEach((dep) => {
        if (dep === d.Department) return;              // ฝ่ายตัวเองมีอยู่แล้ว
        const g = groups.find((x) => x.name === dep);
        if (g) { if (!g.rows.includes(d)) g.rows = [d, ...g.rows]; }
        else extra.push({ name: dep, rows: [d] });     // ฝ่ายที่ยังไม่มีใครอยู่เลย
      });
    });
    if (extra.length) {
      groups = [...groups, ...extra];
      const names = await groupOrder();
      groups.sort((a, b) => {
        const i = names.indexOf(a.name), j = names.indexOf(b.name);
        return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
      });
    }
  }
  const secList = (await sections()).map((x) => x.Title);
  const { settings } = await import('../utils/settings.js');
  const cfg = await settings();
  const projectDepts = String(cfg.ProjectDepartments || '')
    .split(',').map((x) => x.trim()).filter(Boolean);
  const exts = await Promise.all(groups.map((g) => extensionOf(g.name)));

  return `
  <section class="page page-directory">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ค้นหาบุคลากรจากชื่อจริง ชื่อเล่น ชื่อภาษาอังกฤษ หรือชื่อฝ่าย คลิกอีเมลเพื่อเปิดโปรแกรมส่งเมลได้ทันที</p>

      <div class="toolbar">
        <div class="search-box">
          <span>🔍</span>
          <input id="dir-q" type="search" value="${esc(state.directoryQuery || '')}"
                 placeholder="ค้นหาชื่อ ชื่อเล่น ตำแหน่ง หรือฝ่าย" autocomplete="off">
        </div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} คน${
          q ? '' : ` · ${groups.length} ฝ่าย`}</span>
      </div>

      ${rows.length ? groups.map((g, i) => `
        <section class="dept-group">
          <div class="dept-head">
            <h2>${esc(g.name)}</h2>
            <span class="dept-meta">${g.rows.length} คน${exts[i] ? ` · ต่อ ${esc(exts[i])}` : ''}</span>
          </div>
          ${orgChart(g.rows, secList, projectDepts.includes(g.name) ? 'Project' : 'Section')}
        </section>`).join('')
      : `<div class="panel"><div class="empty">ไม่พบรายชื่อที่ตรงกับคำค้น ลองค้นด้วยชื่อเล่นหรือชื่อฝ่าย</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  const box = $('#dir-q');
  if (!box) return;
  box.oninput = (ev) => {
    const pos = ev.target.selectionStart;
    setState({ directoryQuery: ev.target.value });
    const next = $('#dir-q');
    next.focus();
    next.setSelectionRange(pos, pos);
  };
}
