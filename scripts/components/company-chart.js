/**
 * แผนผังองค์กรทั้งบริษัท (แท็บ "แผนผังองค์กร" ในหน้าบุคลากร)
 *
 * วาดจากข้อมูลจริง ไม่ใช่รูปภาพ — ย้ายคน/ตั้งฝ่ายใหม่ในหน้าจัดการข้อมูล ผังเปลี่ยนตามเอง
 *   ผู้บริหาร       = บุคลากรระดับ ผู้บริหาร / รองผู้บริหาร / เลขานุการ
 *   ผู้อำนวยการ     = บุคลากรระดับ ผู้อำนวยการ · ฝ่ายใต้สายงานมาจากช่อง "ดูแลฝ่าย" (Oversees)
 *   ฝ่าย            = ทะเบียนหน่วยงาน · ฝ่ายที่ไม่มีผู้อำนวยการดูแล ขึ้นตรงกรรมการผู้จัดการ
 *   แผนก           = ทะเบียนแผนก + ช่องแผนกของบุคลากร
 * คลิกคน → ข้อมูลบุคคล · คลิกฝ่าย/แผนก → รายชื่อคนในหน่วยนั้น
 */
import { esc } from '../core/dom.js';

const plain = (v) => String((v && typeof v === 'object') ? (v.LookupValue ?? v.Title ?? '') : (v ?? '')).trim();
const bySort = (a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0);

/**
 * จัดโครงสร้างผังจากข้อมูล
 * opts = { people, departments, sections, levelOf, toArray, execGroups }
 */
export function buildCompanyChart({ people, departments, sections, levelOf, toArray, execGroups = [] }) {
  const lv = (p) => levelOf(p);
  const at = (n) => people.filter((p) => lv(p) === n).sort(bySort);

  // ── ผู้บริหาร: ประธานอยู่บนสุด → รองประธาน/รองกรรมการผู้จัดการ → กรรมการผู้จัดการ + เลขานุการ
  const top = at(1);
  const president = top.filter((p) => /^ประธาน/.test(plain(p.Position)));
  const md = top.filter((p) => !president.includes(p));
  const vps = at(2);
  const secretaries = at(3);

  // ── ฝ่าย: ตามทะเบียนหน่วยงาน ไม่รวมกลุ่มผู้บริหาร/ตำแหน่งที่ลงทะเบียนเป็นหน่วยงาน
  const execNames = new Set([...execGroups, ...[...top, ...vps, ...secretaries].map((p) => plain(p.Position))]);
  const deptOf = (p) => plain(p.Department);
  const staffIn = (d) => people.filter((p) => deptOf(p) === d && lv(p) >= 5);
  const depts = departments
    .map((d) => plain(d.Title))
    .filter((d) => d && !execNames.has(d) && (/^ฝ่าย/.test(d) || staffIn(d).length));
  // ฝ่ายที่มีคนแต่ยังไม่ได้ลงทะเบียน ก็ให้ขึ้นผังด้วย
  people.forEach((p) => {
    const d = deptOf(p);
    if (d && lv(p) >= 5 && !depts.includes(d) && !execNames.has(d)) depts.push(d);
  });

  const unit = (name) => {
    const rows = staffIn(name);
    const secNames = [
      ...sections.filter((s) => plain(s.Department) === name).sort(bySort).map((s) => plain(s.Title)),
      ...rows.map((p) => plain(p.Section)),
    ].filter((v, i, a) => v && a.indexOf(v) === i);
    return {
      name,
      heads: rows.filter((p) => lv(p) === 5).sort(bySort),
      count: rows.length,
      sections: secNames.map((s) => {
        const inSec = rows.filter((p) => plain(p.Section) === s);
        return { name: s, heads: inSec.filter((p) => lv(p) === 7).sort(bySort), count: inSec.length };
      }),
    };
  };

  // ── ผู้อำนวยการแต่ละคน พร้อมฝ่ายในสายงาน (ฝ่ายหนึ่งอยู่กับผู้อำนวยการคนแรกที่ระบุเท่านั้น)
  const taken = new Set();
  const directors = at(4).map((p) => {
    const own = [...toArray(p.Oversees).map(plain), deptOf(p)]
      .filter((d, i, a) => d && a.indexOf(d) === i && depts.includes(d) && !taken.has(d));
    own.forEach((d) => taken.add(d));
    // เรียงฝ่ายตามลำดับในทะเบียนหน่วยงาน
    own.sort((a, b) => depts.indexOf(a) - depts.indexOf(b));
    return { person: p, units: own.map(unit) };
  });
  const direct = depts.filter((d) => !taken.has(d)).map(unit);

  return { president, vps, md, secretaries, directors, direct };
}

const photo = (p) => (p.PhotoUrl
  ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}" loading="lazy" decoding="async">`
  : `<span>${esc(String(p.Title || '').slice(0, 2))}</span>`);

const personBox = (p, cls = '') => `
  <button type="button" class="cc-person ${cls}" data-ccperson="${esc(p.id)}" title="ดูข้อมูล ${esc(p.Title)}">
    <span class="cc-photo">${photo(p)}</span>
    <span class="cc-pinfo">
      <span class="cc-pos">${esc(plain(p.Position))}</span>
      <b>${esc(p.Title)}${p.Nickname ? ` <em>(${esc(p.Nickname)})</em>` : ''}</b>
    </span>
  </button>`;

const headLine = (heads) => (heads.length
  ? `<span class="cc-head">${heads.map((h) => esc(h.Title)).join(', ')}</span>` : '');

const unitBox = (u) => `
  <div class="cc-unit">
    <button type="button" class="cc-dept" data-ccunit="${esc(u.name)}" title="ดูรายชื่อ ${esc(u.name)}">
      <b>${esc(u.name)}</b>
      ${headLine(u.heads)}
      <span class="cc-count">${u.count} คน</span>
    </button>
    ${u.sections.length ? `<div class="cc-secs">${u.sections.map((s) => `
      <button type="button" class="cc-sec" data-ccunit="${esc(u.name)}" data-ccsec="${esc(s.name)}" title="ดูรายชื่อ ${esc(s.name)}">
        <b>${esc(s.name)}</b>
        ${headLine(s.heads)}
        <span class="cc-count">${s.count} คน</span>
      </button>`).join('')}</div>` : ''}
  </div>`;

const row = (list, cls = '') => (list.length
  ? `<div class="cc-row ${cls}">${list.map((p) => personBox(p, cls === 'cc-vp' ? 'is-side' : '')).join('')}</div>` : '');

/** HTML ของแผนผัง */
export function renderCompanyChart(c, { officialUrl = '' } = {}) {
  const execRows = [
    row(c.president, 'cc-top'),
    row(c.vps, 'cc-vp'),
    c.md.length || c.secretaries.length ? `<div class="cc-row cc-md">
      ${c.md.map((p) => personBox(p, 'is-md')).join('')}
      ${c.secretaries.length ? `<div class="cc-secretary">${c.secretaries.map((p) => personBox(p, 'is-sec')).join('')}</div>` : ''}
    </div>` : '',
  ].filter(Boolean).join('<div class="cc-link" aria-hidden="true"></div>');

  const columns = [
    c.direct.length ? `<section class="cc-col cc-col-direct">
      <div class="cc-col-head"><b>ขึ้นตรงกรรมการผู้จัดการ</b></div>
      ${c.direct.map(unitBox).join('')}
    </section>` : '',
    ...c.directors.map((d) => `<section class="cc-col">
      <div class="cc-col-head">${personBox(d.person, 'is-director')}</div>
      ${d.units.length ? d.units.map(unitBox).join('')
        : '<div class="cc-empty">ยังไม่ได้ระบุฝ่ายที่ดูแล<br><span>ตั้งได้ที่ช่อง "ดูแลฝ่าย" ในข้อมูลบุคลากร</span></div>'}
    </section>`),
  ].filter(Boolean).join('');

  return `
    <div class="cc-bar">
      <span class="cc-hint">คลิกชื่อคนเพื่อดูข้อมูล · คลิกฝ่ายหรือแผนกเพื่อดูรายชื่อบุคลากรในหน่วยนั้น</span>
      ${officialUrl ? `<a class="btn-mini" href="${esc(officialUrl)}" target="_blank" rel="noopener">📄 ผังองค์กรฉบับประกาศ</a>` : ''}
    </div>
    <div class="company-chart">
      ${execRows ? `<div class="cc-exec">${execRows}</div>` : ''}
      ${columns ? `<div class="cc-link" aria-hidden="true"></div><div class="cc-cols">${columns}</div>`
        : '<div class="panel"><div class="empty">ยังไม่มีข้อมูลฝ่ายสำหรับวาดผัง</div></div>'}
    </div>`;
}
