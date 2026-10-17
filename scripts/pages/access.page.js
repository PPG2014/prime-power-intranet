/**
 * ตรวจสิทธิ์เข้าถึงเว็บ — #/access (ผู้ดูแลระบบ)
 *
 * อ่านสิทธิ์จริงใน SharePoint Site แล้วเทียบกับทะเบียนบุคลากรและ AllowedEmails
 * เพื่อหาคนที่ "หลุด" สิทธิ์: ลาออกแล้วแต่ยังมีสิทธิ์ · ไม่อยู่ในทะเบียน · คนนอกที่ไม่ได้อนุญาต · ทุกคนเข้าได้
 * หน้านี้อ่านอย่างเดียว การเพิ่ม/ถอนสิทธิ์ทำใน SharePoint (ลิงก์อยู่ในหน้า)
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { state } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { ALLOWED_DOMAIN } from '../services/auth.js';
import { toCsv, downloadText } from '../utils/csv.js';

export const meta = { route: 'access', title: 'ตรวจสิทธิ์เข้าถึงเว็บ', nav: false, order: 13, adminOnly: true };

const SITE = `https://${CONFIG.sharepoint.hostname}${CONFIG.sharepoint.sitePath}`;
const RANK = ['Full Control', 'Design', 'Edit', 'Contribute', 'Read', 'View Only'];
const LEVEL_TH = { 'Full Control': 'ควบคุมทั้งหมด', Design: 'ออกแบบ', Edit: 'แก้ไข', Contribute: 'เพิ่ม/แก้รายการ', Read: 'อ่านอย่างเดียว', 'View Only': 'ดูอย่างเดียว' };
const norm = (v) => String(v ?? '').trim().toLowerCase();

let people = [];        // ผลล่าสุด (ใช้กับตัวกรองและส่งออก)
let findings = [];
let view = { filter: 'all', q: '' };

/** รวมสิทธิ์ทุกทางของแต่ละคนเป็นหนึ่งแถว */
function flatten(grants) {
  const map = new Map();
  const add = (p, scope, via, levels) => {
    const key = norm(p.email) || norm(p.login) || norm(p.name);
    if (!map.has(key)) map.set(key, { name: p.name || p.email, email: p.email || '', login: p.login || '', kind: p.kind,
      guest: !!p.guest, disabled: !!p.disabled, entries: [] });
    const row = map.get(key);
    row.guest = row.guest || !!p.guest; row.disabled = row.disabled || !!p.disabled;
    row.entries.push({ scope, via, levels });
  };
  grants.forEach((g) => {
    if (g.members) g.members.forEach((m) => add(m, g.scope, m.viaGroup ? `${g.name} → ${m.viaGroup}` : g.name, g.levels));
    else add(g, g.scope, 'ให้สิทธิ์รายบุคคล', g.levels);
  });
  return [...map.values()];
}

const topLevel = (entries) => {
  const all = entries.flatMap((e) => e.levels);
  return RANK.find((r) => all.includes(r)) || all[0] || '';
};
const isExternal = (p) => p.guest || /#ext#/i.test(p.login) || (p.email && !norm(p.email).endsWith('@' + ALLOWED_DOMAIN));

async function analyse() {
  const { readSiteAccess } = await import('../services/site-access.js');
  const [acc, dir, cfg] = await Promise.all([
    readSiteAccess(),
    list('directory').catch(() => []),
    import('../utils/settings.js').then((m) => m.settings()).catch(() => ({})),
  ]);
  const allow = new Set(String(cfg.AllowedEmails || '').split(',').map(norm).filter(Boolean));
  const byEmail = new Map(dir.filter((p) => p.Email).map((p) => [norm(p.Email), p]));

  const rows = flatten(acc.grants).map((p) => {
    const d = byEmail.get(norm(p.email));
    let status = 'ok'; let label = 'อยู่ในทะเบียนบุคลากร';
    if (p.kind === 'everyone') { status = 'stop'; label = 'ทุกคน รวมคนนอก'; }
    else if (p.kind === 'everyone-internal') { status = 'info'; label = 'พนักงานทุกคนในบริษัท'; }
    else if (p.kind === 'm365group' || p.kind === 'secgroup') { status = 'info'; label = 'กลุ่ม (ยังไม่ได้ขยายรายชื่อ)'; }
    else if (d && d.IsActive === false) { status = 'stop'; label = 'ทะเบียนระบุว่าไม่ทำงานแล้ว'; }
    else if (isExternal(p)) {
      status = allow.has(norm(p.email)) ? 'info' : 'stop';
      label = allow.has(norm(p.email)) ? 'คนนอก (อยู่ใน AllowedEmails)' : 'คนนอก ไม่ได้อยู่ใน AllowedEmails';
    } else if (!d) { status = 'warn'; label = 'ไม่อยู่ในทะเบียนบุคลากร'; }
    if (p.disabled && status === 'ok') { status = 'info'; label = 'บัญชีถูกปิดใน Entra'; }
    return { ...p, dir: d, status, label, level: topLevel(p.entries), external: isExternal(p) };
  }).sort((a, b) => ['stop', 'warn', 'info', 'ok'].indexOf(a.status) - ['stop', 'warn', 'info', 'ok'].indexOf(b.status)
    || String(a.name).localeCompare(String(b.name), 'th'));

  // ── ข้อสรุป ─────────────────────────────────────────────
  const out = [];
  const add = (level, issue, detail, fix) => out.push({ level, issue, detail, fix });
  const names = (xs) => xs.slice(0, 12).map((x) => x.name + (x.email ? ` (${x.email})` : '')).join(', ') + (xs.length > 12 ? ' …' : '');
  const by = (fn) => rows.filter(fn);

  const everyone = by((r) => r.kind === 'everyone');
  if (everyone.length) add('stop', 'เปิดสิทธิ์ให้ "Everyone" (รวมคนนอกที่เป็น Guest)', everyone.map((r) => r.entries.map((e) => e.via).join(', ')).join(' · '),
    'ถอด Everyone ออกจากกลุ่ม/List นั้น แล้วให้สิทธิ์เป็นกลุ่มพนักงานแทน');
  const left = by((r) => r.status === 'stop' && r.dir && r.dir.IsActive === false);
  if (left.length) add('stop', `ทะเบียนระบุว่าไม่ทำงานแล้ว แต่ยังมีสิทธิ์ ${left.length} คน`, names(left),
    'ถอดออกจากกลุ่มใน SharePoint (และปิดบัญชีใน Microsoft 365 ถ้าลาออกแล้ว)');
  const extBad = by((r) => r.external && r.status === 'stop' && r.kind === 'user');
  if (extBad.length) add('stop', `คนนอกที่มีสิทธิ์ใน SharePoint แต่ไม่อยู่ใน AllowedEmails ${extBad.length} คน`, names(extBad),
    'เข้าเว็บไม่ได้ แต่เปิด SharePoint ตรงได้ — ถ้าไม่ได้ตั้งใจให้ ถอดสิทธิ์ออก · ถ้าตั้งใจ เพิ่มอีเมลใน AllowedEmails');
  const notDir = by((r) => r.status === 'warn');
  if (notDir.length) add('warn', `มีสิทธิ์แต่ไม่อยู่ในทะเบียนบุคลากร ${notDir.length} คน`, names(notDir),
    'ตรวจว่าเป็นพนักงานจริงไหม — ถ้าใช่ เพิ่มในทะเบียนบุคลากร · ถ้าไม่ใช่ ถอดสิทธิ์');
  const fullCtl = by((r) => r.kind === 'user' && r.entries.some((e) => e.scope === 'site' && e.levels.includes('Full Control')));
  if (fullCtl.length) add('info', `ผู้มีสิทธิ์ควบคุมทั้งหมด (Owner) ${fullCtl.length} คน`, names(fullCtl),
    'คนกลุ่มนี้แก้สิทธิ์และลบข้อมูลได้ทั้งหมด ควรมีเฉพาะผู้ดูแลระบบ');
  if (acc.admins.length) add('info', `ผู้ดูแล Site Collection ${acc.admins.length} คน`, names(acc.admins), 'มีสิทธิ์สูงสุดเหนือทุกกลุ่ม');
  const everyoneIn = by((r) => r.kind === 'everyone-internal');
  if (everyoneIn.length) add('info', 'พนักงานทุกคนในบริษัทเข้าเว็บได้ (Everyone except external users)',
    everyoneIn.map((r) => `${r.entries.map((e) => e.via).join(', ')} · ${LEVEL_TH[r.level] || r.level}`).join(' · '),
    'ปกติสำหรับ Intranet — คนที่ลาออกจะหมดสิทธิ์เองเมื่อปิดบัญชี Microsoft 365');
  else {
    const has = new Set(rows.map((r) => norm(r.email)));
    const noAccess = dir.filter((p) => p.IsActive !== false && p.Email && !has.has(norm(p.Email)));
    if (noAccess.length && !rows.some((r) => r.kind === 'm365group' || r.kind === 'secgroup')) {
      add('info', `พนักงานในทะเบียนที่ยังไม่มีสิทธิ์ ${noAccess.length} คน`, names(noAccess.map((p) => ({ name: p.Title, email: p.Email }))),
        'คนกลุ่มนี้เข้าเว็บแล้วจะไม่เห็นข้อมูล — เพิ่มเข้ากลุ่ม Members/Visitors ของ Site');
    }
  }
  if (acc.uniqueLists.length) add('info', `List ที่ตั้งสิทธิ์แยกจาก Site ${acc.uniqueLists.length} รายการ`, acc.uniqueLists.join(', '),
    'สิทธิ์ใน List เหล่านี้ไม่ตามกลุ่มของ Site — ดูป้าย "List: …" ในคอลัมน์ได้สิทธิ์จาก ในตารางด้านล่าง');
  acc.notes.forEach((n) => add('info', 'อ่านบางส่วนไม่ได้', n, 'ตรวจสิทธิ์ของแอปตามคำแนะนำด้านล่างหน้า'));
  return { rows, out };
}

const STATUS = { stop: ['ต้องแก้', 'stop'], warn: ['ควรตรวจ', 'warn'], info: ['ข้อสังเกต', 'info'], ok: ['ปกติ', 'ok'] };

function tableHtml() {
  const q = norm(view.q);
  const shown = people.filter((r) => (view.filter === 'all'
      || (view.filter === 'issue' && (r.status === 'stop' || r.status === 'warn'))
      || (view.filter === 'external' && r.external)
      || (view.filter === 'owner' && r.level === 'Full Control'))
    && (!q || [r.name, r.email, r.label, ...r.entries.map((e) => e.via)].some((v) => norm(v).includes(q))));
  if (!shown.length) return '<div class="empty">ไม่พบรายชื่อตามเงื่อนไขนี้</div>';
  return `<div class="ac-scroll"><table class="ac-table">
    <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์สูงสุด</th><th>ได้สิทธิ์จาก</th><th>สถานะ</th></tr></thead>
    <tbody>${shown.map((r) => `<tr class="ac-${STATUS[r.status][1]}">
      <td><b>${esc(r.name)}</b>${r.dir ? `<span class="ac-sub">${esc([r.dir.Position, r.dir.Department].filter(Boolean).join(' · '))}</span>` : ''}</td>
      <td class="ac-mail">${esc(r.email || '—')}</td>
      <td>${esc(LEVEL_TH[r.level] || r.level)}<span class="ac-sub">${esc(r.level)}</span></td>
      <td>${r.entries.map((e) => `<div>${esc(e.via)}${e.scope !== 'site' ? ` <span class="ac-scope">List: ${esc(e.scope)}</span>` : ''}</div>`).join('')}</td>
      <td><span class="ac-st ac-st-${STATUS[r.status][1]}">${esc(r.label)}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function setupHelp(err) {
  return `<div class="panel ac-help">
    <h3>อ่านสิทธิ์จาก SharePoint ไม่ได้</h3>
    <p class="ac-err">${esc(err.message || String(err))}</p>
    <p>หน้านี้ต้องตั้งค่าครั้งเดียว 2 ข้อ</p>
    <ol>
      <li><b>ผู้เปิดหน้านี้ต้องเป็น Owner ของ Site</b> (กลุ่ม Owners / Full Control) — คนที่มีแค่สิทธิ์แก้ไขจะดูรายการสิทธิ์ไม่ได้</li>
      <li><b>ให้สิทธิ์แอปอ่านสิทธิ์ SharePoint</b> — Microsoft Entra admin center → App registrations → แอปของ Intranet
        (<code>${esc(CONFIG.auth.clientId)}</code>) → <b>API permissions</b> → Add a permission → <b>SharePoint</b> → <b>Delegated</b>
        → ติ๊ก <code>AllSites.FullControl</code> · แล้วเพิ่ม <b>Microsoft Graph</b> → Delegated → <code>GroupMember.Read.All</code>
        → กด <b>Grant admin consent</b></li>
    </ol>
    <p class="dim">สิทธิ์นี้ใช้เฉพาะตอนผู้ดูแลเปิดหน้านี้ หน้านี้อ่านอย่างเดียว ไม่แก้สิทธิ์ใด ๆ · ตั้งค่าแล้วกด "ตรวจอีกครั้ง"</p>
  </div>`;
}

export async function render() {
  if (!state.isAdmin) return '<section class="page"><div class="wrap"><div class="panel"><div class="empty">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div></div></div></section>';
  let body;
  try {
    const r = await analyse();
    people = r.rows; findings = r.out;
    const count = (lv) => findings.filter((f) => f.level === lv).length;
    body = `
      <div class="hl-summary">
        <div class="hl-kpi"><b>${people.filter((p) => p.kind === 'user').length}</b><span>คนที่มีสิทธิ์</span></div>
        <div class="hl-kpi stop"><b>${count('stop')}</b><span>ต้องแก้</span></div>
        <div class="hl-kpi warn"><b>${count('warn')}</b><span>ควรตรวจ</span></div>
        <div class="hl-kpi"><b>${people.filter((p) => p.external && p.kind === 'user').length}</b><span>คนนอก</span></div>
        <div class="hl-actions">
          <a class="btn-mini" href="${esc(SITE)}/_layouts/15/user.aspx" target="_blank" rel="noopener">⚙ จัดการสิทธิ์ใน SharePoint ↗</a>
          <button class="btn-mini" id="ac-csv">⬇ ส่งออก CSV</button>
        </div>
      </div>
      <div class="hl-list">${findings.map((f) => `
        <div class="hl-item hl-${f.level}">
          <div class="hl-top"><span class="hl-tag">${esc(STATUS[f.level][0])}</span></div>
          <div class="hl-issue">${esc(f.issue)}</div>
          ${f.detail ? `<div class="hl-detail">${esc(f.detail)}</div>` : ''}
          <div class="hl-fix">→ ${esc(f.fix)}</div>
        </div>`).join('') || '<div class="hl-item"><div class="hl-issue">✓ ไม่พบปัญหาสิทธิ์</div></div>'}</div>

      <h2 class="ac-h2">รายชื่อทุกคนที่เข้าถึง Site ได้</h2>
      <div class="ac-tools">
        <div class="chips">${[['all', 'ทั้งหมด'], ['issue', 'มีปัญหา'], ['external', 'คนนอก'], ['owner', 'ควบคุมทั้งหมด']].map(([k, t]) =>
          `<button class="chip" data-acf="${k}" aria-pressed="${view.filter === k}">${t}</button>`).join('')}</div>
        <input id="ac-q" type="search" placeholder="ค้นชื่อ อีเมล กลุ่ม" value="${esc(view.q)}" autocomplete="off">
      </div>
      <div class="panel" id="ac-body"></div>`;
  } catch (e) {
    people = []; findings = [];
    body = setupHelp(e);
  }
  return `
  <section class="page page-health page-access">
    <div class="wrap">
      <h1 class="page-title">${meta.title}</h1>
      <p class="page-lead">อ่านสิทธิ์จริงจาก SharePoint Site ของเว็บนี้ แล้วเทียบกับทะเบียนบุคลากรและรายชื่อคนนอกที่อนุญาต (AllowedEmails)</p>
      <div class="ac-nav"><a class="btn-mini" href="#/admin">← กลับไปจัดการข้อมูล</a>
        <button class="btn btn-primary" id="ac-again">↻ ตรวจอีกครั้ง</button></div>
      ${body}
    </div>
  </section>`;
}

export function mount() {
  const draw = () => { const b = $('#ac-body'); if (b) b.innerHTML = tableHtml(); };
  $$('[data-acf]').forEach((b) => { b.onclick = () => {
    view.filter = b.dataset.acf;
    $$('[data-acf]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }; });
  const q = $('#ac-q'); let t;
  if (q) q.oninput = () => { clearTimeout(t); t = setTimeout(() => { view.q = q.value; draw(); }, 200); };
  const again = $('#ac-again');
  if (again) again.onclick = async () => { (await import('../core/render.js')).render(); };
  const csv = $('#ac-csv');
  if (csv) csv.onclick = () => {
    const keys = ['ชื่อ', 'อีเมล', 'สิทธิ์สูงสุด', 'ได้สิทธิ์จาก', 'สถานะ', 'ฝ่าย', 'ตำแหน่ง'];
    downloadText(`site-access-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(keys, people.map((r) => ({
      'ชื่อ': r.name, 'อีเมล': r.email, 'สิทธิ์สูงสุด': r.level,
      'ได้สิทธิ์จาก': r.entries.map((e) => e.via + (e.scope !== 'site' ? ` [List: ${e.scope}]` : '')).join(' | '),
      'สถานะ': r.label, 'ฝ่าย': r.dir ? r.dir.Department || '' : '', 'ตำแหน่ง': r.dir ? r.dir.Position || '' : '',
    }))));
  };
  draw();
}
