import { peopleWithKeys, intranet } from './intranet.js';
import { $, $$, esc, fmt, fmtS, toast, boot, compute, list, newId, randPin, sampleData, mediaSrc, fileToDataURL, AGG, DEFAULT_EVENT, initials, prepareBgMedia, kindFromUrl, fmtBytes, KIND_LABEL, matchEntry } from './common.js';

const app = $('#app');
let S = {}, C = compute({}), SECRET = {}, tab = 'control', authed = false, pending = false, offSecret = null, loaded = false, builtTab = null;

const store = await boot();
const PEOPLE = await peopleWithKeys();   // รายชื่อบุคลากรจากเว็บภายใน ใช้ผูกกรรมการกับบัญชี
const personOf = ek => (ek && PEOPLE.find(p => p.key === ek)) || null;

function ensureEvent() {
  if (!authed || !loaded) return;
  // งานใหม่: ใช้ชื่องานที่ตั้งไว้ในเว็บภายใน (จัดการข้อมูล → ฟังก์ชันเสริม)
  if (!S.event) return store.set('event', { ...DEFAULT_EVENT, ...(intranet?.title ? { title: intranet.title } : {}) });
  // fill in settings added in later versions
  const up = {};
  for (const [k, v] of Object.entries(DEFAULT_EVENT)) if (S.event[k] === undefined) up[k] = v;
  for (const [k, v] of Object.entries(DEFAULT_EVENT.display)) if (S.event.display?.[k] === undefined) up['display/' + k] = v;
  if (Object.keys(up).length) store.update('event', up);
}
function safeRender() {
  const a = document.activeElement;
  if (authed && a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'file' && a.type !== 'range' && a.type !== 'checkbox') { pending = true; return; }
  render();
}
app.addEventListener('focusout', () => setTimeout(() => { if (pending) { pending = false; safeRender(); } }, 50));

function startAdmin() {
  offSecret?.();
  offSecret = store.onSecret(s => { SECRET = s || {}; safeRender(); });
  ensureEvent();
}
const ev = () => S.event || {};
const disp = () => ev().display || {};
const baseUrl = () => location.href.replace(/[^/]*([?#].*)?$/, '');
/** ลิงก์แถบประกวดในเว็บภายใน (กรรมการ/ผู้โหวตต้องล็อกอินเว็บภายในก่อน) */
const intranetUrl = () => baseUrl().replace(/contest\/$/, '') + '#/contest';

// ---------------- Auth ----------------
async function renderAuth() {
  const ready = await store.adminReady();
  app.innerHTML = `<div class="a-login">
    <div class="avatar" style="width:64px;height:64px;margin:0 auto 18px;border-radius:20px;font-size:1.6rem">⚙</div>
    <h1 class="j-title">${ready ? 'เข้าสู่ระบบผู้ดูแล' : 'ตั้งรหัสผู้ดูแลครั้งแรก'}</h1>
    <p class="muted">${ready ? 'ใส่รหัสผู้ดูแลระบบ' : 'รหัสนี้ใช้เข้าหลังบ้าน (อย่างน้อย 4 ตัว) — ใครตั้งก่อนคนนั้นเป็นผู้ดูแล จึงควรตั้งทันทีหลังติดตั้ง'}</p>
    <form id="f" class="card" style="text-align:left;margin-top:20px">
      <label class="field"><span>รหัสผู้ดูแล</span><input class="input" id="p1" type="password" autocomplete="current-password" minlength="4" required></label>
      ${ready ? '' : '<label class="field"><span>ยืนยันรหัส</span><input class="input" id="p2" type="password" minlength="4" required></label>'}
      <button class="btn btn-primary btn-block" style="margin-top:6px">${ready ? 'เข้าสู่ระบบ' : 'ตั้งรหัสและเริ่มใช้งาน'}</button>
    </form></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const p = $('#p1').value.trim();
    if (p.length < 4) return toast('รหัสต้องมีอย่างน้อย 4 ตัว', 'err');
    if (!ready && p !== $('#p2').value.trim()) return toast('รหัสยืนยันไม่ตรงกัน', 'err');
    const ok = ready ? await store.loginAdmin(p) : await store.createAdmin(p);
    if (!ok) return toast(ready ? 'รหัสไม่ถูกต้อง' : 'ตั้งรหัสไม่สำเร็จ (อาจมีผู้ตั้งไปแล้ว)', 'err');
    authed = true; startAdmin(); toast('ยินดีต้อนรับ', 'ok'); render();
  };
}

// ---------------- Shell ----------------
const TABS = [['control', 'ควบคุม'], ['entries', 'ทีมประกวด'], ['judges', 'กรรมการ'], ['criteria', 'เกณฑ์คะแนน'], ['display', 'หน้าจอแสดงผล'], ['results', 'ผลคะแนน'], ['summary', 'หน้าสรุปผล'], ['settings', 'ตั้งค่า']];

function render() {
  if (!authed) { builtTab = null; return renderAuth(); }
  if (tab === 'display' && builtTab === 'display' && $('#tab')) { updateDisplayTab(); return; }
  if (tab === 'summary' && builtTab === 'summary' && $('#tab')) { updateSummaryTab(); return; }
  const e = ev();
  app.innerHTML = `<div class="a-wrap">
    <div class="a-head">
      <h1>${esc(e.title || 'การประกวด')} <span class="muted" style="font-size:.9rem;font-weight:500">· หลังบ้าน</span></h1>
      <a class="btn btn-sm" href="display.html" target="_blank">🖥 จอแสดงผล</a>
      <a class="btn btn-sm" href="judge.html" target="_blank">📱 หน้ากรรมการ</a>
    </div>
    <nav class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <div id="tab"></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; builtTab = null; render(); });
  builtTab = tab;
  ({ control: tControl, entries: tEntries, judges: tJudges, criteria: tCriteria, display: tDisplay, results: tResults, summary: tSummary, settings: tSettings })[tab]($('#tab'));
}

const seg = (items, val, attr) => `<div class="seg">${items.map(([k, l, cls = '']) => `<button data-${attr}="${k}" class="${val === k ? 'on ' + cls : ''}">${l}</button>`).join('')}</div>`;
function qrSvg(text) {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  catch { return '<div style="color:#000;font-size:.8rem;display:grid;place-items:center;height:100%">QR</div>'; }
}
const thumb = (src, cls = '') => `<div class="media-thumb ${cls}">${src ? `<img src="${esc(src)}" alt="">` : 'ไม่มีรูป'}</div>`;
const VIEWS = [['lowerthird', 'แถบคะแนน'], ['current', 'ทีมปัจจุบัน'], ['leaderboard', 'อันดับสด'], ['hidden', 'ซ่อนคะแนน'], ['reveal', 'ประกาศผลทีละอันดับ'], ['results', 'สรุปผลทุกทีม'], ['popular', '❤️ ผลโหวตขวัญใจ']];

// upload helper: resize → data URL → /media/{key}
async function uploadTo(file, key, { maxSide = 900, alpha = false, quiet = false } = {}) {
  if (!file) return false;
  try {
    let url = await fileToDataURL(file, maxSide, alpha);
    if (url.length > 1_800_000) url = await fileToDataURL(file, Math.round(maxSide * 0.7), alpha, 0.72);
    if (url.length > 1_800_000) { toast('รูปใหญ่เกินไป ลองใช้ไฟล์ที่เล็กลง', 'err'); return false; }
    await store.set('media/' + key, url);
    if (!quiet) toast('อัปโหลดรูปแล้ว', 'ok'); return true;
  } catch (e) { toast('อัปโหลดไม่สำเร็จ: ' + (e.message || e), 'err'); return false; }
}

// ---------------- Control ----------------
function tControl(el) {
  const e = ev(), entries = C.rows, view = e.view || 'lowerthird';
  const cur = entries.find(x => x.id === e.current), idx = cur ? entries.indexOf(cur) : -1;
  const nJ = C.judges.length, step = Number(e.revealStep) || 0;
  el.innerHTML = `<div class="grid2">
    <div class="stack">
      <div class="card"><h3>ทีมที่กำลังนำเสนอ</h3><p class="sub">กรรมการจะเห็นทีมนี้บนเครื่องทันที${e.judgeMode === 'free' ? ' (โหมดอิสระ: กรรมการเลือกทีมเองได้)' : ''}</p>
        <div class="row-flex" style="flex-wrap:nowrap">
          <button class="btn icon-btn" id="prev" ${idx <= 0 ? 'disabled' : ''}>‹</button>
          <select class="select" id="cur" style="flex:1"><option value="">— ไม่ระบุ —</option>${entries.map(x => `<option value="${x.id}" ${x.id === e.current ? 'selected' : ''}>${esc(x.code || x.order)} · ${esc(x.name)}</option>`).join('')}</select>
          <button class="btn btn-primary" id="next" ${idx >= entries.length - 1 && idx !== -1 ? 'disabled' : ''}>${idx === -1 ? 'เริ่มทีมแรก ›' : 'ทีมถัดไป ›'}</button></div>
        ${cur ? `<div class="row-flex" style="margin-top:16px;flex-wrap:nowrap;align-items:flex-start">
            ${thumb(mediaSrc(S, cur.photo))}
            <div style="flex:1;min-width:0"><b>${esc(cur.name)}</b><div class="muted" style="font-size:.88rem">${esc(cur.owner || '')}</div>
              <div class="muted" style="font-size:.88rem;margin-top:4px">ส่งแล้ว <b style="color:var(--text)">${cur.count}/${nJ}</b> · ${C.aggLabel} <b style="color:var(--gold)" class="num">${fmt(cur.total, Number(e.decimals ?? 2))}</b></div></div>
            <button class="btn btn-sm ${e.locked?.[cur.id] ? 'btn-danger' : ''}" id="lock">${e.locked?.[cur.id] ? '🔒 ล็อกแล้ว' : '🔓 ล็อกคะแนน'}</button></div>
          <div class="mini-judges">${cur.per.map(p => `<span class="${p.total != null ? 'done' : ''}">${p.total != null ? '✓ ' : ''}${esc(p.judge.name)}${p.total != null ? ' · ' + fmtS(p.total) : ''}</span>`).join('')}</div>` : ''}
      </div>
      ${readinessCard()}
      <div class="card"><h3>สถานะการให้คะแนน</h3><p class="sub">กรรมการกดยืนยันคะแนนได้เฉพาะตอน "เปิดให้คะแนน"</p>
        ${seg([['setup', 'รอเริ่ม'], ['open', 'เปิดให้คะแนน', 'ok'], ['closed', 'ปิดรับคะแนน', 'danger']], e.status || 'setup', 'status')}
        <div class="row-flex" style="margin-top:16px;justify-content:space-between"><span class="muted">ส่งคะแนนแล้วทั้งหมด</span><span class="big-stat num">${C.submitted}<span class="muted" style="font-size:1rem"> / ${C.possible}</span></span></div>
        <div class="progress" style="margin-top:10px"><i style="width:${C.possible ? C.submitted / C.possible * 100 : 0}%"></i></div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><h3>หน้าจอแสดงผล</h3><p class="sub">เปลี่ยนสิ่งที่ผู้ชมเห็นได้ทันที · ตั้งพื้นหลัง/ขนาดที่แท็บ "หน้าจอแสดงผล"</p>
        ${seg(VIEWS, view, 'view')}
        ${view === 'reveal' ? `<div style="margin-top:16px" class="row-flex">
          <button class="btn btn-primary btn-lg" id="revNext" ${step >= entries.length ? 'disabled' : ''}>${step >= entries.length ? '🏆 เปิดเผยครบแล้ว' : step === entries.length - 1 ? '🏆 เปิดเผยอันดับ 1' : `เปิดเผยอันดับ ${entries.length - step} →`}</button>
          <button class="btn" id="revBack" ${step <= 0 ? 'disabled' : ''}>ย้อน</button>
          <button class="btn btn-ghost" id="revReset">เริ่มใหม่</button></div>` : ''}
      </div>
      ${voteCard()}
      <div class="card"><h3>ลิงก์สำหรับกรรมการและผู้โหวต</h3><p class="sub">สแกน QR → ล็อกอินเว็บภายใน → แถบประกวด · กรรมการที่ผูกบัญชีแล้วไม่ต้องเลือกชื่อ ใส่ PIN ครั้งแรกครั้งเดียว ${store.mode === 'demo' ? '<br><b style="color:var(--warn)">โหมดทดลอง: มือถือเครื่องอื่นจะไม่เห็นข้อมูล</b>' : ''}</p>
        <div class="row-flex" style="align-items:flex-start;flex-wrap:nowrap">
          <div class="qr">${qrSvg(intranetUrl())}</div>
          <div class="stack" style="flex:1;min-width:0;gap:10px">
            <div class="linkbox"><code>${esc(intranetUrl())}</code><button class="btn btn-sm" data-copy="${esc(intranetUrl())}">คัดลอก</button></div>
            <div class="linkbox"><code>${esc(baseUrl())}display.html</code><button class="btn btn-sm" data-copy="${esc(baseUrl())}display.html">คัดลอก</button></div>
            <span class="dim" style="font-size:.85rem">ลิงก์สำหรับ OBS / vMix (พื้นเขียว) อยู่ที่แท็บ "หน้าจอแสดงผล"</span>
          </div></div>
      </div>
    </div></div>`;
  $$('[data-status]', el).forEach(b => b.onclick = () => store.set('event/status', b.dataset.status));
  $$('[data-view]', el).forEach(b => b.onclick = () => store.update('event', { view: b.dataset.view, ...(b.dataset.view === 'reveal' ? { revealStep: 0 } : {}) }));
  $('#cur', el).onchange = x => store.set('event/current', x.target.value || null);
  $('#prev', el).onclick = () => idx > 0 && store.set('event/current', entries[idx - 1].id);
  $('#next', el).onclick = () => entries.length && store.set('event/current', entries[idx + 1]?.id || entries[0].id);
  $('#lock', el) && ($('#lock', el).onclick = () => store.set(`event/locked/${cur.id}`, e.locked?.[cur.id] ? null : true));
  $('#revNext', el) && ($('#revNext', el).onclick = () => store.set('event/revealStep', Math.min(entries.length, step + 1)));
  $('#revBack', el) && ($('#revBack', el).onclick = () => store.set('event/revealStep', Math.max(0, step - 1)));
  $('#revReset', el) && ($('#revReset', el).onclick = () => store.set('event/revealStep', 0));
  bindVote(el);
  bindCopy(el);
}
function readinessCard() {
  const E = C.entries, J = C.judges, pins = SECRET.pins || {}, d = disp();
  const nP = E.filter(x => mediaSrc(S, x.photo)).length, nB = E.filter(x => x.bg?.ref).length;
  const nJP = J.filter(j => mediaSrc(S, j.photo)).length, nPin = J.filter(j => pins[j.id]).length;
  const items = [
    [C.criteria.length > 0, `เกณฑ์คะแนน ${C.criteria.length} ข้อ (เต็ม ${fmtS(C.maxPerJudge)})`, 'criteria'],
    [J.length > 0 && nPin === J.length, `กรรมการ ${J.length} คน · มี PIN ${nPin}/${J.length}`, 'judges'],
    [J.length > 0 && nJP === J.length, `รูปกรรมการ ${nJP}/${J.length}`, 'judges', true],
    [J.length > 0 && J.every(j => j.ek), `ผูกบัญชีเว็บภายใน ${J.filter(j => j.ek).length}/${J.length}`, 'judges', true],
    [E.length > 0, `ทีมประกวด ${E.length} ทีม`, 'entries'],
    [E.length > 0 && nP === E.length, `รูปทีม ${nP}/${E.length}`, 'entries', true],
    [d.bg !== 'image' || (E.length > 0 && nB === E.length) || !!d.bgMedia?.ref, d.bg === 'image' ? `พื้นหลังทีม ${nB}/${E.length}${d.bgMedia?.ref ? ' (ทีมที่ไม่มีใช้พื้นหลังหลัก)' : ''}` : `พื้นหลังจอ: ${({ green: 'พื้นเขียว', blue: 'พื้นน้ำเงิน', transparent: 'โปร่งใส', theme: 'ธีมเว็บ' })[d.bg] || d.bg}`, 'display', true],
    [store.mode !== 'demo', store.mode === 'demo' ? 'ยังเป็นโหมดทดลอง — วางค่า Firebase ที่เว็บภายใน → จัดการข้อมูล → ฟังก์ชันเสริม' : 'เชื่อมต่อ Firebase แล้ว', 'settings'],
  ];
  const okAll = items.every(i => i[0] || i[3]);
  return `<div class="card"><h3>ความพร้อมก่อนเริ่มงาน ${okAll ? '<span class="pill ok" style="margin-left:6px">พร้อม</span>' : ''}</h3>
    <div class="ready">${items.map(([ok, txt, t, optional]) => `<button class="ready-i ${ok ? 'ok' : optional ? 'opt' : 'bad'}" data-goto="${t}"><span>${ok ? '✓' : optional ? '•' : '!'}</span>${esc(txt)}</button>`).join('')}</div></div>`;
}
const bindCopy = el => $$('[data-copy]', el).forEach(b => b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('คัดลอกแล้ว', 'ok')));

// ---------------- Background media helpers ----------------
const bgBadge = m => m?.ref ? `<span class="bg-badge k-${m.kind}">${m.kind === 'video' ? '🎬' : m.kind === 'gif' ? '🌀' : '🖼'} ${KIND_LABEL[m.kind] || ''}${m.size ? ' · ' + fmtBytes(m.size) : m.ref.startsWith('bgm:') ? '' : ' · ลิงก์'}</span>` : '<span class="bg-badge none">ไม่มีพื้นหลัง</span>';
/** target: entry id, or '_global' for the default display background */
const bgMetaPath = target => target === '_global' ? 'event/display/bgMedia' : target === '_results' ? 'event/results/bgMedia' : `entries/${target}/bg`;
const bgKeyOf = target => target.startsWith('_') ? target : 'e_' + target;
async function uploadBg(target, file, quiet = false) {
  if (!file) return false;
  try {
    if (!quiet) toast(`กำลังอัปโหลด ${file.name}…`);
    const m = await prepareBgMedia(file);
    const key = bgKeyOf(target);
    await store.set('bgm/' + key, m.data);
    await store.set(bgMetaPath(target), { kind: m.kind, ref: 'bgm:' + key, name: m.name, size: m.size, v: Date.now() });
    if (target.startsWith('_')) await store.set('event/display/bg', 'image');
    if (!quiet) toast('อัปโหลดพื้นหลังแล้ว', 'ok');
    return true;
  } catch (e) { toast((e.message || e) + '', 'err'); return false; }
}
async function linkBg(target) {
  const cur = target === '_global' ? disp().bgMedia : target === '_results' ? ev().results?.bgMedia : S.entries?.[target]?.bg;
  const url = prompt('วางลิงก์ไฟล์ (https://…) หรือชื่อไฟล์ในโฟลเดอร์ของเว็บ เช่น media/A01.mp4', cur?.ref && !cur.ref.startsWith('bgm:') ? cur.ref : 'media/');
  if (!url || url === 'media/') return;
  await removeBg(target, true);
  await store.set(bgMetaPath(target), { kind: kindFromUrl(url), ref: url.trim(), name: url.trim(), v: Date.now() });
  if (target.startsWith('_')) await store.set('event/display/bg', 'image');
  toast('ตั้งลิงก์พื้นหลังแล้ว', 'ok');
}
async function removeBg(target, silent) {
  await store.update('', { ['bgm/' + bgKeyOf(target)]: null, [bgMetaPath(target)]: null });
  if (!silent) toast('ลบพื้นหลังแล้ว');
}
function previewBg(m, title) {
  if (!m?.ref) return;
  const box = document.createElement('div'); box.className = 'jk-modal';
  box.innerHTML = `<div class="jk-modal-card" style="width:min(900px,100%)"><h3>${esc(title)}</h3><div class="pv-media"><div class="spinner" style="margin:40px auto"></div></div>
    <div class="row-flex" style="justify-content:space-between;margin-top:12px"><span class="muted">${esc(m.name || m.ref)} ${m.size ? '· ' + fmtBytes(m.size) : ''}</span><button class="btn" id="pvClose">ปิด</button></div></div>`;
  document.body.appendChild(box);
  let off = null;
  const show = src => {
    if (!src) return;
    $('.pv-media', box).innerHTML = m.kind === 'video' ? `<video src="${esc(src)}" autoplay muted loop playsinline controls></video>` : `<img src="${esc(src)}" alt="">`;
  };
  if (m.ref.startsWith('bgm:')) off = store.watch('bgm/' + m.ref.slice(4), v => { if (v) { show(v); off?.(); off = null; } });
  else if (m.ref.startsWith('media:')) show(S.media?.[m.ref.slice(6)]);
  else show(m.ref);
  $('#pvClose', box).onclick = () => { off?.(); box.remove(); };
  box.onclick = e => { if (e.target === box) $('#pvClose', box).click(); };
}

// ---------------- Entries (teams) ----------------
let bulkLines = [];
function tEntries(el) {
  const items = list(S.entries);
  const nPhoto = items.filter(x => mediaSrc(S, x.photo)).length, nBg = items.filter(x => x.bg?.ref).length;
  el.innerHTML = `<div class="stack">
  <div class="card"><div class="row-flex" style="justify-content:space-between;align-items:flex-start">
      <div><h3>เตรียมผู้เข้าประกวดก่อนเริ่มงาน</h3>
      <p class="sub" style="margin:0">มีรูปทีม <b style="color:${nPhoto === items.length && items.length ? 'var(--ok)' : 'var(--warn)'}">${nPhoto}/${items.length}</b> · มีพื้นหลัง (รูป/GIF/คลิปวนซ้ำ) <b style="color:${nBg === items.length && items.length ? 'var(--ok)' : 'var(--muted)'}">${nBg}/${items.length}</b>
      <br>อัปโหลดหลายไฟล์ทีเดียวได้ — <b>ตั้งชื่อไฟล์ตามรหัสทีม</b> เช่น <code>A01.jpg</code> (รูปทีม) · <code>A01.mp4</code> / <code>A01.gif</code> (พื้นหลัง)</p></div>
      <div class="row-flex">
        <button class="btn" id="impToggle">📋 นำเข้าจาก Excel</button>
        <label class="btn file-btn">📷 รูปทีมหลายไฟล์<input type="file" accept="image/*" multiple id="bulkPhoto"></label>
        <label class="btn file-btn">🎬 พื้นหลังหลายไฟล์<input type="file" accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm" multiple id="bulkBg"></label>
      </div></div>
    <div id="imp" class="hidden" style="margin-top:14px">
      <p class="sub">คัดลอกจาก Excel 3 คอลัมน์: <b>รหัส | ชื่อทีม/ผลงาน | สมาชิก</b> แล้ววางด้านล่าง (ถ้ารหัสซ้ำกับทีมเดิม ระบบจะอัปเดตทีมนั้น)</p>
      <textarea class="input" id="impText" rows="6" placeholder="A01&#9;ศูนย์การเรียนรู้ชุมชน&#9;ทีม Riverline&#10;A02&#9;อาคารประหยัดพลังงาน&#9;ทีม Zero Watt"></textarea>
      <div class="row-flex" style="margin-top:10px"><button class="btn btn-primary" id="impGo">นำเข้า</button><span class="dim" id="impInfo"></span></div>
    </div>
    <div id="bulkLog" class="bulk-log ${bulkLines.length ? '' : 'hidden'}">${bulkLines.join('')}</div>
  </div>
  <div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:14px"><div><h3>ทีมประกวด (${items.length})</h3>
      <p class="sub" style="margin:0">รูปทีม: แสดงบนเครื่องกรรมการและวงกลมบนแถบคะแนน · พื้นหลัง: เล่นวนเต็มจอตอนทีมนั้นขึ้นนำเสนอ (เมื่อหน้าจอตั้งเป็น "รูป/คลิปพื้นหลัง")</p></div>
    <button class="btn btn-primary" id="add">+ เพิ่มทีม</button></div>
    <div class="list-edit">${items.map((x, i) => `<div class="le-row ent-row" data-id="${x.id}">
      <div class="ord"><button class="btn" data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn" data-mv="1" ${i === items.length - 1 ? 'disabled' : ''}>▼</button></div>
      ${thumb(mediaSrc(S, x.photo))}
      <input class="input" data-f="code" value="${esc(x.code || '')}" placeholder="รหัส">
      <input class="input" data-f="name" value="${esc(x.name)}" placeholder="ชื่อทีม / ชื่อผลงาน">
      <input class="input" data-f="owner" value="${esc(x.owner || '')}" placeholder="สมาชิก / หน่วยงาน">
      <div class="row-flex" style="gap:4px;flex-wrap:nowrap"><label class="btn btn-sm file-btn">📷 รูปทีม<input type="file" accept="image/*" data-up></label>${x.photo ? '<button class="btn btn-sm btn-ghost" data-rmimg title="ลบรูป">✕</button>' : '<span class="ph-btn"></span>'}</div>
      <div class="bg-cell">${bgBadge(x.bg)}<div class="row-flex" style="gap:4px;flex-wrap:nowrap">
        <label class="btn btn-sm file-btn" title="อัปโหลดรูป / GIF / MP4 / WebM">🎬 พื้นหลัง<input type="file" accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm" data-bgup></label>
        <button class="btn btn-sm btn-ghost" data-bglink title="ใช้ลิงก์ไฟล์">🔗</button>
        ${x.bg?.ref ? '<button class="btn btn-sm btn-ghost" data-bgpv title="ดูตัวอย่าง">▶</button><button class="btn btn-sm btn-ghost" data-bgrm title="ลบพื้นหลัง">✕</button>' : '<span class="ph-btn"></span><span class="ph-btn"></span>'}</div></div>
      <button class="btn btn-ghost icon-btn" data-del title="ลบทีม">🗑</button></div>`).join('') || '<p class="muted">ยังไม่มีทีม — กด "+ เพิ่มทีม", นำเข้าจาก Excel หรือโหลดข้อมูลตัวอย่างที่แท็บตั้งค่า</p>'}</div></div></div>`;
  $('#add', el).onclick = () => {
    const id = newId('e'), order = items.length ? Math.max(...items.map(x => x.order || 0)) + 1 : 1;
    store.set('entries/' + id, { name: 'ทีมใหม่ ' + order, owner: '', code: 'A' + String(order).padStart(2, '0'), order });
  };
  $('#impToggle', el).onclick = () => $('#imp', el).classList.toggle('hidden');
  $('#impGo', el).onclick = async () => {
    const lines = $('#impText', el).value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const up = {}; let add = 0, upd = 0, order = items.length ? Math.max(...items.map(x => x.order || 0)) : 0;
    for (const line of lines) {
      const cols = (line.includes('\t') ? line.split('\t') : line.split(/\s*,\s*/)).map(c => c.trim());
      if (/^(รหัส|code|ลำดับ|no\.?)$/i.test(cols[0]) || /ชื่อทีม|name/i.test(cols[1] || '')) continue; // header row
      let [code, name, owner] = cols.length === 1 ? ['', cols[0], ''] : cols;
      if (!name) continue;
      const ex = code && items.find(x => (x.code || '').toLowerCase() === code.toLowerCase());
      if (ex) { up[ex.id + '/name'] = name; up[ex.id + '/owner'] = owner || ''; upd++; }
      else { order++; const id = newId('e'); up[id] = { code: code || 'A' + String(order).padStart(2, '0'), name, owner: owner || '', order }; add++; }
    }
    if (!add && !upd) return toast('ไม่พบข้อมูลที่นำเข้าได้', 'err');
    await store.update('entries', up);
    toast(`เพิ่ม ${add} ทีม · อัปเดต ${upd} ทีม`, 'ok');
  };
  const bulk = async (files, kind) => {
    bulkLines = []; const lines = bulkLines;
    // the tab re-renders on every realtime update, so the log lives outside the DOM
    const paint = () => { const log = $('#bulkLog'); if (log) { log.classList.remove('hidden'); log.innerHTML = lines.join(''); } };
    let ok = 0;
    for (const f of files) {
      const ent = matchEntry(items, f.name);
      if (!ent) { lines.push(`<div class="bad">✕ ${esc(f.name)} — ไม่พบทีมที่รหัสตรงกับชื่อไฟล์</div>`); paint(); continue; }
      lines.push(`<div class="wait">… ${esc(f.name)} → ${esc(ent.code || '')} ${esc(ent.name)}</div>`); paint();
      let done;
      if (kind === 'photo') { done = await uploadTo(f, 'p_' + ent.id, { maxSide: 1000, quiet: true }); if (done) await store.set(`entries/${ent.id}/photo`, 'p_' + ent.id); }
      else done = await uploadBg(ent.id, f, true);
      lines[lines.length - 1] = `<div class="${done ? 'good' : 'bad'}">${done ? '✓' : '✕'} ${esc(f.name)} → ${esc(ent.code || '')} ${esc(ent.name)}</div>`; paint();
      if (done) ok++;
    }
    toast(`อัปโหลดสำเร็จ ${ok}/${files.length} ไฟล์`, ok === files.length ? 'ok' : 'err');
  };
  $('#bulkPhoto', el).onchange = e => bulk([...e.target.files], 'photo');
  $('#bulkBg', el).onchange = e => bulk([...e.target.files], 'bg');
  $$('.ent-row', el).forEach(row => {
    const id = row.dataset.id;
    $('[data-bgup]', row).onchange = e => uploadBg(id, e.target.files[0]);
    $('[data-bglink]', row).onclick = () => linkBg(id);
    $('[data-bgpv]', row) && ($('[data-bgpv]', row).onclick = () => previewBg(S.entries[id].bg, S.entries[id].name));
    $('[data-bgrm]', row) && ($('[data-bgrm]', row).onclick = () => confirm('ลบพื้นหลังของทีมนี้?') && removeBg(id));
  });
  bindRows(el, 'entries', items, async id => {
    const up = { ['entries/' + id]: null, ['event/locked/' + id]: null, ['media/p_' + id]: null, ['bgm/e_' + id]: null };
    C.judges.forEach(j => { up[`scores/${j.id}/${id}`] = null; });
    if (S.event?.current === id) up['event/current'] = null;
    await store.update('', up);
  }, { maxSide: 1000 });
}

function bindRows(el, coll, items, onDelete, upOpts) {
  $$('.le-row', el).forEach(row => {
    const id = row.dataset.id;
    $$('[data-f]', row).forEach(inp => inp.onchange = () => {
      let v = inp.value.trim();
      if (inp.type === 'number') v = Math.max(0, Number(v) || 0);
      store.set(`${coll}/${id}/${inp.dataset.f}`, v === '' ? null : v);
    });
    $$('[data-mv]', row).forEach(b => b.onclick = () => {
      const i = items.findIndex(x => x.id === id), j = i + Number(b.dataset.mv);
      if (j < 0 || j >= items.length) return;
      const up = {}; items.forEach((x, k) => { up[x.id + '/order'] = k + 1; });
      up[id + '/order'] = j + 1; up[items[j].id + '/order'] = i + 1;
      store.update(coll, up);
    });
    const upl = $('[data-up]', row);
    if (upl) upl.onchange = async () => {
      const key = 'p_' + id;
      if (await uploadTo(upl.files[0], key, upOpts)) store.set(`${coll}/${id}/photo`, key);
    };
    const rm = $('[data-rmimg]', row);
    if (rm) rm.onclick = () => store.update('', { [`${coll}/${id}/photo`]: null, ['media/p_' + id]: null });
    $('[data-del]', row).onclick = () => { if (confirm('ลบรายการนี้และคะแนนที่เกี่ยวข้อง?')) onDelete(id); };
  });
}

// ---------------- Judges ----------------
function tJudges(el) {
  const items = list(S.judges), pins = SECRET.pins || {};
  el.innerHTML = `<div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:14px"><div><h3>กรรมการ (${items.length})</h3><p class="sub" style="margin:0">รูปกรรมการแสดงบนแถบคะแนน · PIN เห็นเฉพาะผู้ดูแล · <b>ผูกบัญชี</b> = เลือกชื่อในทะเบียนบุคลากร กรรมการเข้าแถบประกวดแล้วระบบรู้เองว่าเป็นใคร</p>
    <datalist id="ppPeople">${PEOPLE.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></div>
    <div class="row-flex"><button class="btn" id="copyAll">คัดลอกรายชื่อ + PIN</button><button class="btn btn-primary" id="add">+ เพิ่มกรรมการ</button></div></div>
    <div class="list-edit">${items.map((j, i) => {
      const n = C.rows.filter(r => r.per.find(p => p.judge.id === j.id)?.total != null).length;
      return `<div class="le-row" style="grid-template-columns:auto 52px minmax(0,2fr) minmax(0,2fr) auto 96px auto auto auto" data-id="${j.id}">
      <div class="ord"><button class="btn" data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn" data-mv="1" ${i === items.length - 1 ? 'disabled' : ''}>▼</button></div>
      ${thumb(mediaSrc(S, j.photo))}
      <input class="input" data-f="name" value="${esc(j.name)}" placeholder="ชื่อกรรมการ">
      <label class="j-link ${j.ek ? 'on' : ''}" title="ผูกกับบัญชีเว็บภายใน"><span>${j.ek ? '🔗' : '○'}</span><input class="input" data-link list="ppPeople" autocomplete="off" value="${esc(personOf(j.ek)?.name || (j.ek ? '(ผูกแล้ว)' : ''))}" placeholder="ผูกบัญชี: พิมพ์ชื่อ"></label>
      <div class="row-flex" style="gap:4px;flex-wrap:nowrap"><label class="btn btn-sm file-btn">📷 รูป<input type="file" accept="image/*" data-up></label>${j.photo ? '<button class="btn btn-sm btn-ghost" data-rmimg title="ลบรูป">✕</button>' : ''}</div>
      <div class="pin-chip">${esc(pins[j.id] || '----')}</div>
      <button class="btn btn-sm" data-regen>PIN ใหม่</button>
      <span class="muted num" style="font-size:.85rem;min-width:64px;text-align:right">${n}/${C.entries.length}</span>
      <button class="btn btn-ghost icon-btn" data-del title="ลบ">🗑</button></div>`;
    }).join('') || '<p class="muted">ยังไม่มีกรรมการ</p>'}</div></div>`;
  $('#add', el).onclick = () => {
    const id = newId('j'), order = items.length ? Math.max(...items.map(x => x.order || 0)) + 1 : 1;
    store.update('', { ['judges/' + id]: { name: 'กรรมการ ' + order, order }, ['secret/pins/' + id]: randPin() });
  };
  $('#copyAll', el).onclick = () => {
    const txt = `${ev().title || ''}\nเข้าเว็บภายใน → แถบประกวด: ${intranetUrl()}\n` + items.map(j => `${j.name} — PIN ${pins[j.id] || '-'}`).join('\n');
    navigator.clipboard?.writeText(txt).then(() => toast('คัดลอกแล้ว — วางส่งใน LINE ได้เลย', 'ok'));
  };
  $$('[data-link]', el).forEach(inp => inp.onchange = () => {
    const id = inp.closest('.le-row').dataset.id, v = inp.value.trim();
    if (!v) return store.set(`judges/${id}/ek`, null);
    const p = PEOPLE.find(x => x.name === v);
    if (!p) { toast(`ไม่พบ "${v}" ในทะเบียนบุคลากร — เลือกจากรายชื่อที่ขึ้นมา`, 'err'); inp.value = personOf(S.judges?.[id]?.ek)?.name || ''; return; }
    const dup = list(S.judges).find(j => j.ek === p.key && j.id !== id);
    if (dup) { toast(`${p.name} ผูกกับ "${dup.name}" อยู่แล้ว`, 'err'); inp.value = ''; return; }
    const cur = S.judges?.[id]?.name || '';
    store.update(`judges/${id}`, { ek: p.key, ...(/^กรรมการ \d+$/.test(cur) || !cur ? { name: p.name } : {}) });
  });
  $$('[data-regen]', el).forEach(b => b.onclick = () => store.set('secret/pins/' + b.closest('.le-row').dataset.id, randPin()));
  bindRows(el, 'judges', items, id => store.update('', { ['judges/' + id]: null, ['secret/pins/' + id]: null, ['scores/' + id]: null, ['media/p_' + id]: null }), { maxSide: 400 });
}

// ---------------- Criteria ----------------
function tCriteria(el) {
  const items = list(S.criteria), sum = items.reduce((a, c) => a + (Number(c.max) || 0), 0);
  el.innerHTML = `<div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:14px"><div><h3>เกณฑ์การให้คะแนน</h3>
    <p class="sub" style="margin:0">กรรมการกดคะแนนทีละเกณฑ์ แล้วระบบ<b>รวม (sum)</b> ให้อัตโนมัติ · คะแนนเต็มต่อกรรมการ 1 คน = <b style="color:var(--gold)">${fmtS(sum)}</b>${C.scale && sum !== C.scale ? ` → เทียบเป็นเต็ม <b style="color:var(--gold)">${C.scale}</b> แล้วเฉลี่ยทุกกรรมการ` : ''}<br>
    ถ้ามีเกณฑ์เดียว หน้ากรรมการจะเป็นแป้นตัวเลขอย่างเดียว · อยากให้เกณฑ์ไหนสำคัญกว่า ให้ตั้งคะแนนเต็มมากกว่า</p></div>
    <button class="btn btn-primary" id="add">+ เพิ่มเกณฑ์</button></div>
    <div class="list-edit">${items.map((c, i) => `<div class="le-row" style="grid-template-columns:auto 34px minmax(0,2fr) 170px auto" data-id="${c.id}">
      <div class="ord"><button class="btn" data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn" data-mv="1" ${i === items.length - 1 ? 'disabled' : ''}>▼</button></div>
      <b class="num muted" style="text-align:center">${i + 1}</b>
      <input class="input" data-f="name" value="${esc(c.name)}" placeholder="ชื่อเกณฑ์">
      <label class="row-flex" style="gap:6px;flex-wrap:nowrap"><span class="muted">เต็ม</span><input class="input num" data-f="max" type="number" min="1" step="any" value="${c.max ?? 10}"></label>
      <button class="btn btn-ghost icon-btn" data-del title="ลบ">🗑</button></div>`).join('') || '<p class="muted">ยังไม่มีเกณฑ์</p>'}</div>
    <p class="dim" style="font-size:.85rem;margin:14px 0 0">ตั้งเกณฑ์ให้เสร็จก่อนเปิดให้คะแนน — การเพิ่ม/ลบเกณฑ์หลังเริ่มแล้ว คะแนนที่ส่งไปก่อนจะไม่ครบเกณฑ์</p></div>`;
  $('#add', el).onclick = () => {
    const id = newId('c'), order = items.length ? Math.max(...items.map(x => x.order || 0)) + 1 : 1;
    store.set('criteria/' + id, { name: 'เกณฑ์ที่ ' + order, max: 10, order });
  };
  bindRows(el, 'criteria', items, id => store.remove('criteria/' + id));
}

// ---------------- Display settings ----------------
const BGS = [['theme', 'ธีมเว็บ'], ['image', 'รูป/คลิปพื้นหลัง'], ['green', 'พื้นเขียว (Chroma)'], ['blue', 'พื้นน้ำเงิน'], ['transparent', 'โปร่งใส (OBS)']];
function tDisplay(el) {
  const d = disp(), b = baseUrl();
  el.innerHTML = `<div class="grid2">
    <div class="stack">
      <div class="card"><h3>ตัวอย่างจอ (สด)</h3><p class="sub">สิ่งที่ผู้ชมเห็นตอนนี้</p>
        <div class="preview-wrap" id="pv"><iframe src="display.html" title="preview" loading="lazy"></iframe></div>
        <div style="margin-top:12px">${seg(VIEWS, ev().view || 'lowerthird', 'view')}</div>
      </div>
      <div class="card"><h3>ลิงก์จอแสดงผล</h3><p class="sub">ใช้ลิงก์ไหนก็ได้ แต่ละลิงก์บังคับพื้นหลังของตัวเอง เปิดพร้อมกันได้หลายจอ</p>
        <div class="stack" style="gap:8px">
          ${[['display.html', 'จอโปรเจกเตอร์ (ตามที่ตั้งค่า)'], ['display.html?bg=green&view=lowerthird', 'OBS / vMix: แถบคะแนนพื้นเขียว (Chroma key)'], ['display.html?bg=transparent&view=lowerthird', 'OBS Browser Source: แถบคะแนนพื้นโปร่งใส']]
            .map(([u, l]) => `<div><div class="muted" style="font-size:.82rem;margin-bottom:4px">${l}</div><div class="linkbox"><code>${esc(b + u)}</code><button class="btn btn-sm" data-copy="${esc(b + u)}">คัดลอก</button><a class="btn btn-sm" href="${esc(u)}" target="_blank">เปิด</a></div></div>`).join('')}
        </div></div>
    </div>
    <div class="stack">
      <div class="card"><h3>พื้นหลัง</h3><p class="sub">พื้นเขียว/น้ำเงิน ใช้ซ้อนในโปรแกรมตัดต่อสด · "รูป/คลิปพื้นหลัง" ใช้ฉายตรง — ทีมที่มีพื้นหลังของตัวเองจะใช้ของทีมก่อน</p>
        <div id="bgSeg">${seg(BGS, d.bg || 'green', 'bg')}</div>
        <div class="media-box" style="margin-top:14px;align-items:flex-start"><div id="bgThumb"></div>
          <div class="stack" style="gap:6px"><div class="row-flex" style="gap:6px"><label class="btn btn-sm file-btn">🎬 อัปโหลด รูป / GIF / คลิป<input type="file" accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm" id="bgUp"></label>
            <button class="btn btn-sm" id="bgLink">🔗 ลิงก์</button><button class="btn btn-sm btn-ghost" id="bgRm">ลบ</button></div>
          <span class="dim" style="font-size:.8rem">พื้นหลังหลัก (ใช้เมื่อทีมไม่มีพื้นหลังของตัวเอง และในหน้าอันดับ/ประกาศผล) · คลิปเล่นวนซ้ำแบบไม่มีเสียง · ไม่เกิน 7 MB ต่อไฟล์</span></div></div>
        <div style="margin-top:14px"><span class="muted" style="font-size:.85rem">การจัดภาพ</span><div id="fitSeg" style="margin-top:6px">${seg([['cover', 'เต็มจอ (ครอปขอบ)'], ['contain', 'เห็นทั้งภาพ (พื้นเบลอ)']], d.fit || 'cover', 'fit')}</div></div>
        <label class="field" style="margin-top:14px"><span>ความมืดทับพื้นหลัง (ให้ตัวหนังสืออ่านง่าย) <b id="dimV">${d.dim ?? 30}%</b></span><input type="range" min="0" max="80" step="5" value="${d.dim ?? 30}" id="dim" style="width:100%;accent-color:var(--accent)"></label>
      </div>
      <div class="card"><h3>โลโก้งาน</h3><p class="sub">แสดงบนหัวจอและหน้ากรรมการ (PNG พื้นใสสวยที่สุด)</p>
        <div class="media-box"><div id="logoThumb">${thumb(mediaSrc(S, 'logo'), 'logo')}</div>
          <label class="btn btn-sm file-btn">อัปโหลดโลโก้<input type="file" accept="image/*" id="logoUp"></label><button class="btn btn-sm btn-ghost" id="logoRm">ลบ</button></div>
      </div>
      <div class="card"><h3>แถบคะแนน</h3><p class="sub">ตำแหน่งและขนาดของแถบคะแนนกรรมการ</p>
        <div id="posSeg">${seg([['bottom', 'ล่าง'], ['center', 'กลาง'], ['top', 'บน']], d.ltPos || 'bottom', 'pos')}</div>
        <label class="field" style="margin-top:14px"><span>ขนาด <b id="scaleV">${d.ltScale || 100}%</b></span><input type="range" min="60" max="150" step="5" value="${d.ltScale || 100}" id="scale" style="width:100%;accent-color:var(--accent)"></label>
        <label class="switch"><span>ซ่อนตัวเลขคะแนนระหว่างประกวด<br><small class="dim">แถบคะแนน/ทีมปัจจุบัน แสดง ✓ เมื่อกรรมการให้คะแนนแล้ว · อันดับสดแสดงแค่แถบ · ประกาศผลและสรุปผลยังแสดงคะแนน</small></span><input type="checkbox" id="hideScores" ${d.hideScores !== false ? 'checked' : ''}></label>
        <label class="switch"><span>แสดงชื่องานด้านบนในโหมดแถบคะแนน<br><small class="dim">เฉพาะจอที่ไม่ได้บังคับพื้นหลังด้วยลิงก์</small></span><input type="checkbox" id="showTitle" ${d.showTitle ? 'checked' : ''}></label>
      </div>
    </div></div>`;
  const fit = () => { const w = $('#pv')?.clientWidth; if (w) $('#pv iframe').style.transform = `scale(${w / 1920})`; };
  fit(); new ResizeObserver(fit).observe($('#pv'));
  $$('[data-view]', el).forEach(x => x.onclick = () => store.update('event', { view: x.dataset.view, ...(x.dataset.view === 'reveal' ? { revealStep: 0 } : {}) }));
  $$('[data-bg]', el).forEach(x => x.onclick = () => store.set('event/display/bg', x.dataset.bg));
  $$('[data-pos]', el).forEach(x => x.onclick = () => store.set('event/display/ltPos', x.dataset.pos));
  $('#scale').oninput = x => { $('#scaleV').textContent = x.target.value + '%'; };
  $('#scale').onchange = x => store.set('event/display/ltScale', Number(x.target.value));
  $('#showTitle').onchange = x => store.set('event/display/showTitle', x.target.checked);
  $('#hideScores').onchange = x => store.set('event/display/hideScores', x.target.checked);
  $('#bgUp').onchange = x => uploadBg('_global', x.target.files[0]);
  $('#bgLink').onclick = () => linkBg('_global');
  $('#bgRm').onclick = async () => { await removeBg('_global'); await store.remove('media/bg'); };
  $$('[data-fit]', el).forEach(x => x.onclick = () => store.set('event/display/fit', x.dataset.fit));
  $('#dim').oninput = x => { $('#dimV').textContent = x.target.value + '%'; };
  $('#dim').onchange = x => store.set('event/display/dim', Number(x.target.value));
  updateDisplayTab();
  $('#logoUp').onchange = x => uploadTo(x.target.files[0], 'logo', { maxSide: 500, alpha: true });
  $('#logoRm').onclick = () => store.remove('media/logo');
  bindCopy(el);
}
function updateDisplayTab() {
  const d = disp();
  const on = (attr, val) => $$(`[data-${attr}]`).forEach(b => b.classList.toggle('on', b.dataset[attr] === val));
  on('view', ev().view || 'lowerthird'); on('bg', d.bg || 'green'); on('pos', d.ltPos || 'bottom'); on('fit', d.fit || 'cover');
  if (document.activeElement !== $('#dim')) { $('#dim').value = d.dim ?? 30; $('#dimV').textContent = (d.dim ?? 30) + '%'; }
  if (document.activeElement !== $('#scale')) { $('#scale').value = d.ltScale || 100; $('#scaleV').textContent = (d.ltScale || 100) + '%'; }
  $('#showTitle').checked = !!d.showTitle;
  $('#hideScores').checked = d.hideScores !== false;
  const gm = d.bgMedia, lg = mediaSrc(S, 'logo'), oldImg = mediaSrc(S, 'bg');
  const bgKey = JSON.stringify(gm || null) + (oldImg ? oldImg.length : 0);
  if ($('#bgThumb')._s !== bgKey) {
    $('#bgThumb')._s = bgKey;
    $('#bgThumb').innerHTML = gm?.ref ? `<div class="media-thumb wide bgm-thumb" title="ดูตัวอย่าง">${gm.kind === 'video' ? '🎬' : gm.kind === 'gif' ? '🌀' : '🖼'}<small>${esc(KIND_LABEL[gm.kind] || '')} ${gm.size ? fmtBytes(gm.size) : 'ลิงก์'}<br>แตะเพื่อดู</small></div>` : thumb(oldImg, 'wide');
    const t = $('.bgm-thumb'); if (t) t.onclick = () => previewBg(gm, 'พื้นหลังหลัก');
  }
  if ($('#logoThumb')._s !== lg) { $('#logoThumb')._s = lg; $('#logoThumb').innerHTML = thumb(lg, 'logo'); }
}

// ---------------- Results ----------------
function tResults(el) {
  const R = C.ranked, J = C.judges, d = Number(ev().decimals ?? 2);
  el.innerHTML = `<div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:14px"><div><h3>ผลคะแนน</h3>
    <p class="sub" style="margin:0">คะแนนกรรมการ = รวมทุกเกณฑ์${C.scale && C.maxPerJudge !== C.scale ? ` แล้วเทียบเป็นเต็ม ${C.scale}` : ''} · คะแนนทีม = ${AGG[C.method].long} (เต็ม ${fmtS(C.maxTotal)}) · <b>แตะช่องคะแนนเพื่อแก้ไข / ลบ</b></p></div>
    <div class="row-flex"><button class="btn" id="csv1">⬇ สรุปผล (CSV)</button><button class="btn" id="csv2">⬇ คะแนนละเอียด (CSV)</button></div></div>
    <div class="table-scroll"><table class="res num"><thead><tr><th>อันดับ</th><th>ทีม</th>${J.map(j => `<th>${esc(j.name)}</th>`).join('')}<th>ส่งแล้ว</th><th>${C.aggLabel}</th></tr></thead>
    <tbody>${R.map(r => `<tr><td>${r.rank ?? '–'}</td><td><b>${esc(r.code ? r.code + ' · ' : '')}${esc(r.name)}</b><div class="muted" style="font-size:.8rem">${esc(r.owner || '')}</div></td>
      ${r.per.map(p => `<td class="cell ${p.total == null ? 'dim' : ''}" data-clr="${p.judge.id}|${r.id}" title="แตะเพื่อแก้ไขคะแนน">${p.total == null ? '–' : (C.scale && C.maxPerJudge !== C.scale ? p.total.toFixed(2) : fmtS(p.total))}</td>`).join('')}<td>${r.count}/${J.length}</td><td class="total">${fmt(r.total, d)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $$('[data-clr]', el).forEach(td => td.onclick = () => { const [jid, eid] = td.dataset.clr.split('|'); editScore(jid, eid); });
  $('#csv1', el).onclick = () => downloadCSV('summary', [['อันดับ', 'รหัส', 'ทีม', 'สมาชิก', ...J.map(j => j.name), C.aggLabel],
    ...R.map(r => [r.rank ?? '', r.code || '', r.name, r.owner || '', ...r.per.map(p => p.total == null ? '' : fmtS(p.total)), r.total == null ? '' : r.total.toFixed(d)])]);
  $('#csv2', el).onclick = () => {
    const rows = [['รหัส', 'ทีม', 'กรรมการ', ...C.criteria.map(c => `${c.name} (เต็ม ${c.max})`), `รวม (เต็ม ${C.maxPerJudge})`, `คะแนน (เต็ม ${C.judgeMax})`, 'เวลาส่ง']];
    C.rows.forEach(r => r.per.forEach(p => { if (p.vals) rows.push([r.code || '', r.name, p.judge.name, ...C.criteria.map(c => p.vals[c.id] ?? ''), p.raw == null ? '' : fmtS(p.raw), p.total == null ? '' : p.total.toFixed(2), p.ts ? new Date(p.ts).toLocaleString('th-TH') : '']); }));
    downloadCSV('detail', rows);
  };
}
// admin can correct, enter (e.g. a judge's tablet died) or delete a single score
function editScore(jid, eid) {
  const cur = S.scores?.[jid]?.[eid]?.v || {};
  const box = document.createElement('div'); box.className = 'jk-modal';
  box.innerHTML = `<div class="jk-modal-card"><small class="muted">แก้ไขคะแนน · ${esc(S.judges[jid]?.name)}</small><h3>${esc(S.entries[eid]?.name)}</h3>
    <div class="edit-grid">${C.criteria.map(c => `<label for="ed_${c.id}">${esc(c.name)} <small class="dim">(เต็ม ${fmtS(c.max)})</small></label><input class="input num" id="ed_${c.id}" type="number" min="0" max="${c.max}" step="any" value="${cur[c.id] ?? ''}">`).join('')}</div>
    <div class="row-flex"><button class="btn btn-danger" id="edDel" ${S.scores?.[jid]?.[eid] ? '' : 'disabled'}>ลบคะแนน</button><span style="flex:1"></span><button class="btn" id="edNo">ยกเลิก</button><button class="btn btn-primary" id="edOk">บันทึก</button></div></div>`;
  document.body.appendChild(box);
  $('#edNo', box).onclick = () => box.remove();
  $('#edDel', box).onclick = async () => { if (!confirm('ลบคะแนนนี้ ให้กรรมการกดใหม่?')) return; await store.remove(`scores/${jid}/${eid}`); box.remove(); toast('ลบแล้ว', 'ok'); };
  $('#edOk', box).onclick = async () => {
    const v = {};
    for (const c of C.criteria) {
      const n = Number($('#ed_' + c.id, box).value);
      if ($('#ed_' + c.id, box).value === '' || isNaN(n) || n < 0 || n > Number(c.max)) return toast(`"${c.name}" ต้องอยู่ระหว่าง 0–${fmtS(c.max)}`, 'err');
      v[c.id] = n;
    }
    try { await store.set(`scores/${jid}/${eid}`, { v, ts: Date.now() }); box.remove(); toast('บันทึกแล้ว', 'ok'); }
    catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e.message || e), 'err'); }
  };
}
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${(ev().title || 'contest').replace(/[\\/:*?"<>|]/g, '')}-${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- Results summary page (after the contest) ----------------
function tSummary(el) {
  const R = ev().results || {}, aw = R.awards || [];
  el.innerHTML = `<div class="grid2">
    <div class="stack">
      <div class="card"><h3>ตัวอย่างหน้าสรุปผล</h3><p class="sub">หน้านี้แสดงทุกทีมเรียงตามคะแนน · 3 อันดับแรกขึ้นแท่นรางวัล</p>
        <div class="preview-wrap" id="pv"><iframe src="display.html?view=results" title="preview" loading="lazy"></iframe></div>
        <div class="row-flex" style="margin-top:12px">
          <button class="btn btn-primary btn-lg" id="goRes">🏆 แสดงหน้าสรุปผลบนจอ</button>
          <button class="btn" id="goReveal">ประกาศทีละอันดับ</button>
          <button class="btn btn-ghost" id="goLt">กลับไปแถบคะแนน</button></div>
        <p class="sub" style="margin:10px 0 0" id="liveNow"></p>
      </div>
    </div>
    <div class="stack">
      <div class="card"><h3>ข้อความ</h3>
        <label class="field"><span>หัวข้อ</span><input class="input" id="rTitle" value="${esc(R.title || '')}" placeholder="สรุปผลการประกวด"></label>
        <label class="field"><span>คำบรรยาย</span><input class="input" id="rSub" value="${esc(R.subtitle || '')}" placeholder="${esc(ev().title || '')}"></label>
        <div class="grid3">${[0, 1, 2].map(i => `<label class="field"><span>ชื่อรางวัลอันดับ ${i + 1}</span><input class="input" data-aw="${i}" value="${esc(aw[i] || '')}"></label>`).join('')}</div>
        <label class="field"><span>จำนวนทีมที่แสดง</span><select class="select" id="rLimit">${[[0, 'ทุกทีม'], [3, '3 อันดับแรก'], [5, '5 อันดับแรก'], [10, '10 อันดับแรก']].map(([k, l]) => `<option value="${k}" ${Number(R.limit || 0) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="switch"><span>แสดงคะแนนของกรรมการแต่ละคนใต้ชื่อทีม</span><input type="checkbox" id="rJ" ${R.showJudges ? 'checked' : ''}></label>
      </div>
      <div class="card"><h3>พื้นหลังหน้าสรุปผล</h3><p class="sub">ใช้กับหน้าสรุปผล ประกาศทีละอันดับ อันดับสด และซ่อนคะแนน · รองรับรูป GIF และคลิปวนซ้ำ (MP4/WebM ไม่เกิน 7 MB)</p>
        <div class="media-box" style="align-items:flex-start"><div id="rbgThumb"></div>
          <div class="stack" style="gap:6px"><div class="row-flex" style="gap:6px">
            <label class="btn btn-sm file-btn">🎬 อัปโหลด รูป / GIF / คลิป<input type="file" accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm" id="rbgUp"></label>
            <button class="btn btn-sm" id="rbgLink">🔗 ลิงก์</button><button class="btn btn-sm btn-ghost" id="rbgRm">ลบ</button></div>
          <span class="dim" style="font-size:.8rem">ถ้าไม่ตั้ง จะใช้พื้นหลังหลักจากแท็บ "หน้าจอแสดงผล" · จอต้องตั้งเป็น "รูป/คลิปพื้นหลัง"</span></div></div>
      </div>
    </div></div>`;
  const fit = () => { const w = $('#pv')?.clientWidth; if (w) $('#pv iframe').style.transform = `scale(${w / 1920})`; };
  fit(); new ResizeObserver(fit).observe($('#pv'));
  $('#goRes').onclick = () => store.update('event', { view: 'results', ...(disp().bg !== 'image' && (ev().results?.bgMedia || disp().bgMedia) ? { 'display/bg': 'image' } : {}) });
  $('#goReveal').onclick = () => store.update('event', { view: 'reveal', revealStep: 0 });
  $('#goLt').onclick = () => store.set('event/view', 'lowerthird');
  $('#rTitle').onchange = x => store.set('event/results/title', x.target.value.trim());
  $('#rSub').onchange = x => store.set('event/results/subtitle', x.target.value.trim());
  $$('[data-aw]', el).forEach(i => i.onchange = () => store.set('event/results/awards/' + i.dataset.aw, i.value.trim()));
  $('#rLimit').onchange = x => store.set('event/results/limit', Number(x.target.value));
  $('#rJ').onchange = x => store.set('event/results/showJudges', x.target.checked);
  $('#rbgUp').onchange = x => uploadBg('_results', x.target.files[0]);
  $('#rbgLink').onclick = () => linkBg('_results');
  $('#rbgRm').onclick = () => removeBg('_results');
  updateSummaryTab();
}
function updateSummaryTab() {
  const m = ev().results?.bgMedia, k = JSON.stringify(m || null);
  if ($('#rbgThumb')._s !== k) {
    $('#rbgThumb')._s = k;
    $('#rbgThumb').innerHTML = m?.ref ? `<div class="media-thumb wide bgm-thumb">${m.kind === 'video' ? '🎬' : m.kind === 'gif' ? '🌀' : '🖼'}<small>${esc(KIND_LABEL[m.kind] || '')} ${m.size ? fmtBytes(m.size) : 'ลิงก์'}<br>แตะเพื่อดู</small></div>` : thumb('', 'wide');
    const t = $('#rbgThumb .bgm-thumb'); if (t) t.onclick = () => previewBg(m, 'พื้นหลังหน้าสรุปผล');
  }
  const v = ev().view;
  $('#liveNow').innerHTML = `จอตอนนี้: <b>${(VIEWS.find(x => x[0] === v) || [, v])[1]}</b>`;
}

// ---------------- Settings ----------------
function tSettings(el) {
  const e = ev();
  el.innerHTML = `<div class="grid2">
    <div class="stack">
      <div class="card"><h3>ข้อมูลงาน</h3><p class="sub">แสดงบนจอและหน้ากรรมการ</p>
        <label class="field"><span>ชื่องาน (หัวข้อใหญ่บนจอแสดงผลและหน้ากรรมการ)</span><input class="input" id="title" value="${esc(e.title || '')}" placeholder="${esc(intranet?.title || 'เช่น Prime Power New Year 2027')}"><small class="dim">เว้นว่าง = ใช้ชื่องานที่ตั้งในเว็บภายใน (จัดการข้อมูล → ฟังก์ชันเสริม)</small></label>
        <label class="field"><span>ชื่อรอบ (แสดงบนหัวหน้ากรรมการ)</span><input class="input" id="round" value="${esc(e.round || '')}" placeholder="เช่น รอบคัดเลือก R1"></label>
        <label class="field"><span>คำบรรยายใต้ชื่อ</span><input class="input" id="subtitle" value="${esc(e.subtitle || '')}" placeholder="เช่น 20 พฤศจิกายน 2569 · หอประชุมใหญ่"></label>
      </div>
      <div class="card"><h3>การคิดคะแนน</h3>
        <label class="field"><span>สเกลคะแนน</span><select class="select" id="scale">
          <option value="10" ${Number(e.scale ?? 10) === 10 ? 'selected' : ''}>เทียบเป็นเต็ม 10 (แนะนำ) — เช่น 7+8+5+10 ÷ 4 = 7.50</option>
          <option value="100" ${Number(e.scale) === 100 ? 'selected' : ''}>เทียบเป็นเต็ม 100</option>
          <option value="0" ${Number(e.scale ?? 10) === 0 ? 'selected' : ''}>ใช้คะแนนดิบ (ผลรวมทุกเกณฑ์)</option></select></label>
        <label class="field"><span>คะแนนรวมของทีม</span><select class="select" id="method">${Object.entries(AGG).map(([k, v]) => `<option value="${k}" ${C.method === k ? 'selected' : ''}>${v.long}</option>`).join('')}</select></label>
        <label class="field"><span>ความละเอียดที่กรรมการกดได้</span><select class="select" id="step">
          ${[['int', 'จำนวนเต็มเท่านั้น (7, 8, 9)'], ['0.5', 'ทีละ 0.5 (7, 7.5, 8)'], ['0.1', 'ทศนิยม 1 ตำแหน่ง (7.3, 8.5)'], ['0.01', 'ทศนิยม 2 ตำแหน่ง (7.25)']].map(([k, l]) => `<option value="${k}" ${(e.step || '0.1') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>ทศนิยมของคะแนนรวมบนจอ</span><select class="select" id="decimals">${[0, 1, 2, 3].map(n => `<option value="${n}" ${Number(e.decimals ?? 2) === n ? 'selected' : ''}>${n} ตำแหน่ง</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="stack">
      <div class="card"><h3>การทำงานของกรรมการ</h3>
        <label class="field"><span>การเลือกทีม</span><select class="select" id="judgeMode">
          <option value="follow" ${e.judgeMode !== 'free' ? 'selected' : ''}>ตามผู้ดูแล — กรรมการเห็นเฉพาะทีมที่กำลังนำเสนอ (แนะนำ)</option>
          <option value="free" ${e.judgeMode === 'free' ? 'selected' : ''}>อิสระ — กรรมการเลือกทีมเองได้</option></select></label>
        <label class="switch"><span>อนุญาตให้แก้คะแนนหลังยืนยัน<br><small class="dim">ปิดไว้ = กดยืนยันแล้วจบ (ผู้ดูแลลบให้กดใหม่ได้ที่แท็บผลคะแนน)</small></span><input type="checkbox" id="allowEdit" ${e.allowEdit ? 'checked' : ''}></label>
      </div>
      <div class="card"><h3>ทดสอบ / ล้างข้อมูล</h3><p class="sub">ใช้ซ้อมก่อนวันงาน — ปุ่มเหล่านี้ย้อนกลับไม่ได้</p>
        <div class="stack" style="gap:10px">
          <button class="btn" id="sample">📦 โหลดข้อมูลตัวอย่าง (แทนที่ทีม/กรรมการ/เกณฑ์)</button>
          <button class="btn" id="rand">🎲 สุ่มคะแนนทดสอบให้กรรมการทุกคน</button>
          <button class="btn btn-danger" id="clearScores">ล้างคะแนนทั้งหมด</button>
          <button class="btn btn-danger" id="clearAll">ล้างข้อมูลทั้งหมด (เหลือแค่รหัสผู้ดูแล)</button>
          <button class="btn btn-ghost" id="logout">ออกจากระบบผู้ดูแล</button>
        </div></div>
    </div></div>`;
  ['title', 'subtitle', 'round'].forEach(k => $('#' + k, el).onchange = x => store.set('event/' + k, x.target.value.trim()));
  $('#method', el).onchange = x => store.set('event/method', x.target.value);
  $('#scale', el).onchange = x => store.set('event/scale', Number(x.target.value));
  $('#step', el).onchange = x => store.set('event/step', x.target.value);
  $('#decimals', el).onchange = x => store.set('event/decimals', Number(x.target.value));
  $('#judgeMode', el).onchange = x => store.set('event/judgeMode', x.target.value);
  $('#allowEdit', el).onchange = x => store.set('event/allowEdit', x.target.checked);
  $('#sample', el).onclick = async () => {
    if (!confirm('แทนที่ทีม กรรมการ เกณฑ์ และล้างคะแนนทั้งหมด?')) return;
    const d = sampleData();
    const up = { entries: d.entries, judges: d.judges, criteria: d.criteria, scores: null, 'secret/pins': d.pins,
      'event/current': 'e1', 'event/locked': null, 'event/revealStep': 0 };
    for (const [k, v] of Object.entries(d.media)) up['media/' + k] = v;
    await store.update('', up);
    toast('โหลดข้อมูลตัวอย่างแล้ว (PIN: 1111, 2222, 3333, 4444, 5555)', 'ok');
  };
  $('#rand', el).onclick = async () => {
    if (!confirm('สุ่มคะแนนทับคะแนนปัจจุบันทั้งหมด?')) return;
    const scores = {}, st = e.step || '0.1', q = st === 'int' ? 1 : st === '0.5' ? 2 : 10;
    C.judges.forEach(j => { scores[j.id] = {}; C.entries.forEach((x, k) => {
      const bias = 0.55 + ((k * 37) % 40) / 100;
      scores[j.id][x.id] = { v: Object.fromEntries(C.criteria.map(c => { const mx = Number(c.max) || 10; return [c.id, Math.max(0, Math.min(mx, Math.round((bias + (Math.random() - .5) * .3) * mx * q) / q))]; })), ts: Date.now() };
    }); });
    await store.set('scores', scores); toast('สุ่มคะแนนแล้ว', 'ok');
  };
  $('#clearScores', el).onclick = () => confirm('ล้างคะแนนทั้งหมด? ย้อนกลับไม่ได้') && store.update('', { scores: null, 'event/locked': null, 'event/revealStep': 0 }).then(() => toast('ล้างคะแนนแล้ว'));
  $('#clearAll', el).onclick = () => confirm('ล้างข้อมูลทั้งหมด รวมรูปภาพ? ย้อนกลับไม่ได้') &&
    store.update('', { entries: null, judges: null, criteria: null, scores: null, media: null, bgm: null, 'secret/pins': null, event: DEFAULT_EVENT }).then(() => toast('ล้างข้อมูลแล้ว'));
  $('#logout', el).onclick = async () => { await store.logoutAdmin(); offSecret?.(); authed = false; render(); };
}

// ---- start (after all helpers are defined) ----
store.onState(st => { S = st; C = compute(st); loaded = true; ensureEvent(); safeRender(); });
authed = await store.isAdmin();
if (authed) startAdmin();
render();

// ---------------- โหวตขวัญใจ ----------------
function voteRows() {
  const n = {}; Object.values(S.votes || {}).forEach(v => { if (v && v.e) n[v.e] = (n[v.e] || 0) + 1; });
  return C.entries.map(e => ({ ...e, votes: n[e.id] || 0 })).sort((a, b) => b.votes - a.votes || (a.order ?? 0) - (b.order ?? 0));
}
function voteCard() {
  const e = ev(), rows = voteRows(), total = rows.reduce((a, r) => a + r.votes, 0);
  return `<div class="card"><h3>❤️ โหวตขวัญใจ</h3><p class="sub">พนักงานโหวตจากแถบประกวดในเว็บภายใน คนละ 1 สิทธิ์</p>
    ${seg([['0', 'ปิดโหวต', 'danger'], ['1', 'เปิดโหวต', 'ok']], e.voteOpen ? '1' : '0', 'vote')}
    <div class="row-flex" style="margin-top:14px;justify-content:space-between"><span class="muted">โหวตแล้วทั้งหมด</span><span class="big-stat num">${total}</span></div>
    ${rows.slice(0, 5).map((r, i) => `<div class="row-flex" style="justify-content:space-between;margin-top:6px;font-size:.92rem"><span>${i + 1}. ${esc((r.code ? r.code + ' · ' : '') + r.name)}</span><b class="num">${r.votes}</b></div>`).join('')}
    <div class="row-flex" style="margin-top:14px"><button class="btn btn-sm" data-vshow>🖥 แสดงผลโหวตบนจอ</button><button class="btn btn-sm btn-ghost" data-vcsv>⬇ CSV</button><button class="btn btn-sm btn-ghost" data-vreset>ล้างผลโหวต</button></div></div>`;
}
function bindVote(el) {
  $$('[data-vote]', el).forEach(b => b.onclick = () => store.set('event/voteOpen', b.dataset.vote === '1'));
  const q = s => $(s, el);
  q('[data-vshow]') && (q('[data-vshow]').onclick = () => store.set('event/view', 'popular'));
  q('[data-vcsv]') && (q('[data-vcsv]').onclick = () => downloadCSV('ผลโหวตขวัญใจ', [['อันดับ', 'รหัส', 'ทีม', 'สมาชิก', 'คะแนนโหวต'], ...voteRows().map((r, i) => [i + 1, r.code || '', r.name, r.owner || '', r.votes])]));
  q('[data-vreset]') && (q('[data-vreset]').onclick = () => { if (confirm('ล้างผลโหวตขวัญใจทั้งหมด? (ทุกคนจะโหวตใหม่ได้)')) store.set('votes', null); });
}
