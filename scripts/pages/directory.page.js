import { esc, $, $$, onClick } from '../core/dom.js';
import { openModal } from '../components/modal.js';
import { copyButton, bindCopyButtons } from '../utils/clipboard.js';
import { hydratePhotos } from '../services/photos.js';
import { list } from '../services/data.js';
import { groupByDepartment, groupOrder, extensionOf, sections } from '../utils/dept.js';
import { toArray as rawArray } from '../admin/entity-form.js';

/** แปลงค่าหลายรายการให้เป็นข้อความเสมอ กันกรณีที่ยังหลุดมาเป็นออบเจ็กต์ */
const toArray = (v) => rawArray(v)
  .map((x) => (x && typeof x === 'object'
    ? (x.LookupValue ?? x.Label ?? x.Title ?? x.DisplayName ?? '')
    : x))
  .filter(Boolean);
import { state, setState } from '../core/state.js';
import { renderCompanyChart, bindCompanyChart } from '../components/company-chart.js';

export const meta = { route: 'directory', title: 'บุคลากร', nav: true, order: 9, adminOnly: false };

/**
 * ระดับในผังฝ่าย เรียงจากบนลงล่าง
 * ต้องตรงกับตัวเลือกของคอลัมน์ Level ใน SharePoint
 */
export const LEVELS = [
  'ผู้บริหาร',
  'รองผู้บริหาร',
  'เลขานุการ',
  'ผู้อำนวยการ',
  'ผู้จัดการฝ่าย',
  'รองผู้จัดการฝ่าย',
  'ผู้จัดการแผนก',
  'บุคลากรในแผนก',
];
export const SECRETARY_TIER = 3;  // เลขานุการอยู่ใต้ผู้บริหาร แต่ไม่ใช่หัวหน้าของคนในฝ่าย
const SECTION_HEAD_TIER = 7;      // ผู้จัดการแผนก ใช้เรียงลำดับแผนก
const STAFF_TIER = LEVELS.length; // ชั้นที่เรียงเป็นตาราง
const TOP_TIERS = LEVELS.map((_, i) => i + 1).filter((n) => n !== STAFF_TIER); // ชั้นที่จัดกึ่งกลาง

/**
 * ค่าระดับแบบเก่า (5 ชั้น) → ชั้นใหม่ · ชั้นที่รวมสองตำแหน่งไว้ด้วยกันจะดูชื่อตำแหน่งประกอบ
 * ข้อมูลเก่าที่ยังไม่ได้แก้จึงยังขึ้นผังถูกที่
 */
const OLD_LEVELS = {
  'ผู้อำนวยการฝ่าย / ผู้บริหารสูงสุด': (pos) => (/^กรรมการผู้จัดการ|^ประธาน/.test(pos) ? 1 : 4),
  'ผู้จัดการฝ่าย / รองผู้บริหาร': (pos) => (/^รองกรรมการผู้จัดการ|^รองประธาน/.test(pos) ? 2 : 5),
  'รองผู้จัดการฝ่าย': () => 6,
  'ผู้จัดการแผนก / เลขานุการ': (pos) => (/เลขานุการ/.test(pos) ? 3 : 7),
  'บุคลากรในแผนก': () => 8,
};
const OLD_BY_NUMBER = Object.values(OLD_LEVELS);

/**
 * หาชั้นของคนหนึ่งคน (1 = บนสุด)
 * รับได้ทั้งค่าระดับชุดปัจจุบัน ค่าชุดเก่า 5 ชั้น และค่าที่ขึ้นต้นด้วยเลข (ข้อมูลเก่ากว่านั้น)
 * ถ้ายังไม่ได้ระบุ จะเดาจากชื่อตำแหน่งให้ก่อน
 */
export function levelOf(p) {
  const raw = String(p.Level || '').trim();
  const pos = String(p.Position || '').trim();

  if (raw) {
    const text = raw.replace(/^\d+\s*[—–-]\s*/, '');
    const i = LEVELS.indexOf(text);
    if (i >= 0) return i + 1;
    if (OLD_LEVELS[text]) return OLD_LEVELS[text](pos);
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= OLD_BY_NUMBER.length) return OLD_BY_NUMBER[n - 1](pos);
  }

  if (/^กรรมการผู้จัดการ|^ประธาน/.test(pos)) return 1;
  if (/^รองกรรมการผู้จัดการ|^รองประธาน/.test(pos)) return 2;
  if (/เลขานุการ/.test(pos)) return 3;
  if (/ผู้อำนวยการ/.test(pos) && !/^รองผู้อำนวยการ/.test(pos)) return 4;
  if (/^รองผู้อำนวยการ|(?<!รอง)ผู้จัดการฝ่าย|(?<!รอง)หัวหน้าฝ่าย/.test(pos)) return 5;
  if (/รองผู้จัดการฝ่าย|รองหัวหน้าฝ่าย/.test(pos)) return 6;
  if (/ผู้จัดการแผนก|หัวหน้าแผนก|หัวหน้างาน|ผู้จัดการโครงการ/.test(pos)) return 7;
  return STAFF_TIER;
}

const card = (p, cls = '') => `
  <article class="staff-card is-clickable ${cls}" data-person="${p.id}"
           role="button" tabindex="0" aria-label="ดูข้อมูล ${esc(p.Title)}">
    <div class="staff-photo">${p.PhotoUrl
      ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy" decoding="async">`
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
      ${p.Email ? `<div class="mail-line"><a class="staff-mail" href="mailto:${esc(p.Email)}">✉ ${esc(p.Email)}</a>
        ${copyButton(p.Email, '')}</div>` : ''}
      <div class="staff-ext">โทรภายใน <b>${p.Extension ? esc(p.Extension) : '—'}</b></div>
    </div>
  </article>`;

/** การ์ดย่อ ใช้กับชั้นที่มีหลายคนในแถวเดียว เช่นผู้จัดการแผนก 5 คน */
const miniCard = (p) => `
  <article class="mini-card is-clickable" data-person="${p.id}"
           role="button" tabindex="0" aria-label="ดูข้อมูล ${esc(p.Title)}">
    <div class="mini-photo">${p.PhotoUrl
      ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy" decoding="async">`
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
  const secOrder = [...secOrderList, ...tiers[SECTION_HEAD_TIER - 1].map((p) => p.Section).filter(Boolean)]
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

let people = [];

const TABS = [['list', '👥 รายชื่อบุคลากร'], ['chart', '🏢 แผนผังองค์กร']];
const tabBar = (tab) => `<div class="dir-tabs" role="tablist">${TABS.map(([k, label]) => `
  <button type="button" role="tab" data-dirtab="${k}" aria-selected="${tab === k}"
    ${tab === k ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</div>`;

/** แท็บแผนผังองค์กร — วาดจากข้อมูลบุคลากร ฝ่าย และแผนก */
async function renderChartTab() {
  const { settings } = await import('../utils/settings.js');
  const cfg = await settings();
  return `
  <section class="page page-directory">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">แผนผังองค์กร Prime Power Construction ตามฉบับประกาศ</p>
      ${tabBar('chart')}
      ${renderCompanyChart({ officialUrl: cfg.OrgChartUrl || '' })}
    </div>
  </section>`;
}

export async function render(ctx) {
  const q = (state.directoryQuery || '').trim().toLowerCase();
  const everyone = await list('directory');
  const all = everyone.filter((p) => p.IsActive !== false);
  const hidden = everyone.length - all.length;
  people = all;
  if (state.dirTab === 'chart') return renderChartTab();
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
    const names = await groupOrder();
    const extra = [];
    directors.forEach((d) => {
      toArray(d.Oversees).forEach((dep) => {
        if (dep === d.Department) return;              // ฝ่ายตัวเองมีอยู่แล้ว
        const g = groups.find((x) => x.name === dep);
        if (g) { if (!g.rows.includes(d)) g.rows = [d, ...g.rows]; }
        else if (names.includes(dep)) extra.push({ name: dep, rows: [d] });  // ฝ่ายที่ยังไม่มีใครอยู่เลย
      });
    });
    if (extra.length) {
      groups = [...groups, ...extra];
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
      ${tabBar('list')}

      <div class="toolbar">
        <div class="search-box">
          <span>🔍</span>
          <input id="dir-q" type="search" data-keepfocus value="${esc(state.directoryQuery || '')}"
                 placeholder="ค้นหาชื่อ ชื่อเล่น ตำแหน่ง หรือฝ่าย" autocomplete="off">
        </div>
        <span class="toolbar-meta">แสดง ${rows.length} จาก ${all.length} คน${
          q ? '' : ` · ${groups.length} ฝ่าย`}${
          hidden ? ` · <span class="hidden-note" title="ช่อง IsActive ไม่ได้ติ๊กไว้ จึงไม่แสดงบนหน้านี้">ปิดใช้งาน ${hidden} คน</span>` : ''}</span>
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

/**
 * หน้าต่างแสดงข้อมูลบุคลากรแบบเต็ม พร้อมรูปใหญ่
 * หน้าอื่นเรียกใช้ได้ เช่นกดชื่อผู้รับผิดชอบในหน้าต่างโครงการ
 * ส่ง back มาด้วยเพื่อให้มีปุ่มย้อนกลับไปยังหน้าต่างเดิม
 */
export function openPerson(p, back, backLabel = '← กลับไปที่โครงการ') {
  const projects = toArray(p.Project);
  const oversees = toArray(p.Oversees);

  const row = (label, value) => value
    ? `<div class="pv-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : '';

  openModal({
    title: p.Title,
    wide: true,
    body: `
      <div class="person-view">
        <div class="pv-photo">${p.PhotoUrl
          ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}">`
          : `<span>${esc(p.Title.slice(0, 2))}</span>`}</div>

        <div class="pv-info">
          <div class="pv-name">${esc(p.Title)} ${p.Nickname ? `<em>(${esc(p.Nickname)})</em>` : ''}</div>
          <div class="pv-en">${esc(p.NameEN || '')}</div>
          <div class="pv-pos">${esc(p.Position || '')}</div>

          <div class="pv-table">
            ${row('ฝ่าย', p.Department)}
            ${row('แผนก', p.Section)}
            ${row('ระดับ', p.Level)}
            ${row('โทรภายใน', p.Extension)}
          </div>

          ${p.Email ? `<div class="mail-line pv-mailline"><a class="pv-mail" href="mailto:${esc(p.Email)}">✉ ${esc(p.Email)}</a>
            ${copyButton(p.Email, 'คัดลอกอีเมล')}</div>` : ''}

          ${oversees.length ? `<div class="pv-block"><h4>ดูแลฝ่าย</h4>
            <ul>${oversees.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

          ${projects.length ? `<div class="pv-block"><h4>โครงการที่รับผิดชอบ</h4>
            <ul>${projects.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>`,
    footer: back ? `<button class="btn-mini" id="pv-back">${esc(backLabel)}</button>` : '',
  });

  hydratePhotos($('#overlay-root'));
  bindCopyButtons($('#overlay-root'));
  bindPhotoZoom($('#overlay-root .pv-photo'));
  if (back) $('#pv-back').onclick = back;
}

/**
 * ชี้เมาส์ที่รูปในหน้าต่างข้อมูลบุคคล → แสดงรูปขยายใหญ่กลางจอ เอาเมาส์ออกแล้วหายไป
 * บนมือถือ/แท็บเล็ต (ไม่มีเมาส์) แตะรูปเพื่อเปิด แตะอีกครั้งเพื่อปิด
 * วางไว้ที่ body เพราะในหน้าต่างมีกรอบที่ตัดส่วนเกิน รูปขยายในกรอบจะถูกตัด
 */
function bindPhotoZoom(box) {
  const img = box && box.querySelector('img');
  if (!img) return;
  const show = () => {
    if (!img.currentSrc || document.getElementById('photo-zoom')) return;
    const z = document.createElement('div');
    z.id = 'photo-zoom';
    z.className = 'photo-zoom';
    z.innerHTML = `<img src="${esc(img.currentSrc)}" alt="${esc(img.alt)}">`;
    z.onclick = hide;
    document.body.appendChild(z);
  };
  const hide = () => { const z = document.getElementById('photo-zoom'); if (z) z.remove(); };
  box.classList.add('zoomable');
  box.addEventListener('mouseenter', show);
  box.addEventListener('mouseleave', hide);
  // จอสัมผัสไม่มีการชี้ ใช้แตะแทน (จอที่มีเมาส์ไม่ผูก ไม่งั้นคลิกแล้วรูปที่ขยายอยู่จะหาย)
  if (matchMedia('(hover: none)').matches) {
    box.addEventListener('click', () => (document.getElementById('photo-zoom') ? hide() : show()));
  }
  // ปิดหน้าต่างข้อมูลแล้ว รูปขยายต้องไม่ค้าง
  new MutationObserver((_, obs) => {
    if (!document.body.contains(box)) { hide(); obs.disconnect(); }
  }).observe(document.getElementById('overlay-root'), { childList: true });
}

/** รายชื่อคนในฝ่าย/แผนกที่คลิกจากแผนผัง เรียงจากระดับสูงลงล่าง */
const plainText = (v) => String((v && typeof v === 'object') ? (v.LookupValue ?? v.Title ?? '') : (v ?? '')).trim();
/** เทียบชื่อหน่วยงาน/ตำแหน่งแบบไม่สนช่องว่าง (ผังพิมพ์แยกบรรทัด ข้อมูลบุคลากรอาจเว้นวรรคต่างกัน) */
const same = (a, b) => plainText(a).replace(/\s+/g, '') === plainText(b).replace(/\s+/g, '');

/**
 * ชื่อแผนกในผังกับในทะเบียนบุคลากรมักเขียนต่างกันเล็กน้อย
 * เช่น "แผนกงานขออนุญาตและใบอนุญาต(เขตพื้นที่ทั่วไป)" กับ "แผนกขออนุญาตและใบอนุญาต (เขตพื้นที่ทั่วไป)"
 * จึงตัดช่องว่าง วงเล็บ และคำว่า แผนก/งาน ออกก่อนเทียบ และยอมให้ชื่อหนึ่งอยู่ในอีกชื่อหนึ่ง
 */
const secKey = (v) => plainText(v).replace(/\s+|แผนก|งาน|[()（）]/g, '');
const sameSection = (a, b) => {
  const x = secKey(a), y = secKey(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** ชื่อฝ่าย: ไม่สนช่องว่างและคำว่า "ฝ่าย" — "ทรัพยากรบุคคล" = "ฝ่ายทรัพยากรบุคคล" */
const deptKey = (v) => plainText(v).replace(/\s+|ฝ่าย/g, '');
const sameDept = (a, b) => {
  const x = deptKey(a), y = deptKey(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

function openUnit(dept, sec = '') {
  const byLevel = (a, b) => (levelOf(a) - levelOf(b)) || ((+a.SortOrder || 0) - (+b.SortOrder || 0));
  const inDept = people.filter((p) => sameDept(p.Department, dept));
  // ชื่อแผนกไม่ซ้ำกันทั้งบริษัท จึงค้นจากทุกฝ่าย เผื่อช่องฝ่ายของคนนั้นเขียนไม่ตรงกับผัง
  let rows = (sec ? people.filter((p) => sameSection(p.Section, sec)) : inDept).sort(byLevel);
  // แผนกยังไม่มีใครระบุไว้ → แสดงคนทั้งฝ่ายแทน พร้อมบอกว่ายังไม่ได้ระบุแผนก
  let fallback = false;
  // (เอาเฉพาะคนที่ยังไม่ระบุแผนก ถ้าไม่มีเลยค่อยแสดงทั้งฝ่าย)
  if (sec && !rows.length && inDept.length) {
    const noSec = inDept.filter((p) => !plainText(p.Section));
    rows = (noSec.length ? noSec : inDept).sort(byLevel);
    fallback = noSec.length ? 'nosec' : 'all';
  }
  // ผู้อำนวยการที่ดูแลฝ่ายนี้ ขึ้นบนสุดของรายชื่อฝ่าย (ไม่ใช่รายชื่อแผนก)
  const dirs = sec ? [] : people.filter((p) => !rows.includes(p) && toArray(p.Oversees).some((d) => sameDept(d, dept)));
  const list_ = [...dirs, ...rows];
  openModal({
    title: sec ? `${sec} · ${dept}` : dept,
    wide: true,
    body: list_.length
      ? `${fallback ? `<div class="dir-unit-note">ยังไม่มีบุคลากรที่ระบุแผนกนี้ในทะเบียนบุคลากร — ${fallback === 'nosec'
             ? `แสดงคนใน${esc(dept)}ที่ยังไม่ได้ระบุแผนก` : `แสดงรายชื่อทั้ง${esc(dept)}แทน`}
           (ระบุแผนกได้ที่ ⚙ จัดการข้อมูล → บุคลากร → ช่องแผนก)</div>` : ''}
         <div class="dir-unit-meta">${rows.length} คน${dirs.length ? ` · ผู้อำนวยการที่ดูแล ${dirs.length} คน` : ''}</div>
         <div class="staff-grid">${list_.map((p) => card(p)).join('')}</div>`
      : `<div class="empty">ยังไม่มีบุคลากรในหน่วยนี้</div>
         <div class="dir-unit-note">ตรวจที่ ⚙ จัดการข้อมูล → บุคลากร ว่าช่อง <b>ฝ่าย</b> ตรงกับ “${esc(dept)}”${
           sec ? ` และช่อง <b>แผนก</b> ตรงกับ “${esc(sec)}”` : ''} และติ๊ก <b>เปิดใช้งาน</b> ไว้</div>`,
  });
  const root = $('#overlay-root');
  hydratePhotos(root);
  bindCopyButtons(root);
  bindPeople(root, (p) => openPerson(p, () => openUnit(dept, sec), `← กลับไปที่${sec || dept}`));
}

/** คลิกตำแหน่งในผัง → ข้อมูลผู้ดำรงตำแหน่ง (หลายคนแสดงเป็นรายชื่อ) */
function openPosition(pos) {
  const norm = (v) => plainText(v).replace(/\s+/g, '');
  let rows = people.filter((p) => same(p.Position, pos));
  if (!rows.length) rows = people.filter((p) => norm(p.Position).startsWith(norm(pos)));
  if (rows.length === 1) return openPerson(rows[0]);
  openModal({
    title: pos,
    wide: rows.length > 0,
    body: rows.length
      ? `<div class="staff-grid">${rows.map((p) => card(p)).join('')}</div>`
      : '<div class="empty">ยังไม่มีบุคลากรที่ระบุตำแหน่งนี้ในทะเบียนบุคลากร</div>',
  });
  const root = $('#overlay-root');
  hydratePhotos(root);
  bindCopyButtons(root);
  bindPeople(root, (p) => openPerson(p, () => openPosition(pos), `← กลับไปที่${pos}`));
}

/** คลิก/กด Enter ที่การ์ดบุคลากร → เปิดข้อมูลคนนั้น */
function bindPeople(root, open) {
  root.querySelectorAll('[data-person]').forEach((el) => {
    const go = () => { const p = people.find((x) => String(x.id) === String(el.dataset.person)); if (p) open(p); };
    el.onclick = (ev) => { if (!ev.target.closest('a, [data-copy]')) go(); };
    el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } };
  });
}

export function mount(ctx) {
  hydratePhotos($('#app'));
  bindCopyButtons($('#app'));
  onClick('dirtab', (k) => setState({ dirTab: k }));
  bindCompanyChart($('#app'), { onUnit: openUnit, onPosition: openPosition });
  const show = (id) => {
    const p = people.find((x) => String(x.id) === String(id));
    if (p) openPerson(p);
  };

  $$('[data-person]').forEach((el) => {
    el.onclick = (ev) => {
      // กดที่ลิงก์อีเมลให้เปิดโปรแกรมส่งเมลตามปกติ ไม่ต้องเปิดหน้าต่างข้อมูล
      if (ev.target.closest('a, [data-copy]')) return;
      show(el.dataset.person);
    };
    el.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); show(el.dataset.person); }
    };
  });

  const box = $('#dir-q');
  if (!box) return;
  let t;
  box.oninput = (ev) => {
    const val = ev.target.value;
    clearTimeout(t);
    t = setTimeout(() => setState({ directoryQuery: val }), 250);
  };
}
