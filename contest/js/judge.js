import { $, $$, esc, fmtS, initials, toast, vibrate, boot, compute, list, judgeTotal, statusPill, mediaSrc, setImg } from './common.js';
import { myKey, backLink } from './intranet.js';

const app = $('#app');
let S = {}, C = compute({}), me = null, pickJudge = null, pin = '', busy = false;
let viewId = null, active = 0, draft = {}, fresh = true, structKey = '', pendingJump = null;

const store = await boot();
me = await store.whoAmI();
const myEk = await myKey();   // ผู้ใช้ที่ล็อกอินเว็บภายใน → เลือกชื่อกรรมการให้อัตโนมัติ
let autoPicked = false;

const ev = () => S.event || {};
const mine = () => S.scores?.[me] || {};
const submitted = id => !!mine()[id];
const canEdit = id => ev().status === 'open' && !ev().locked?.[id] && (!submitted(id) || ev().allowEdit);

function render() {
  if (!me) { structKey = ''; return renderLogin(); }
  renderJudge();
}

// ======================= Login =======================
function renderLogin() {
  const e = ev(), all = list(S.judges), logo = mediaSrc(S, 'logo');
  // กรรมการที่ผูกบัญชีเว็บภายในไว้ → ข้ามหน้าเลือกชื่อ · ยังไม่ผูก → ให้เลือกจากชื่อที่ยังไม่ผูก
  const mineJ = myEk && all.find(j => j.ek === myEk);
  if (!pickJudge && mineJ && !autoPicked) { autoPicked = true; pickJudge = mineJ.id; pin = ''; }
  const judges = mineJ ? [mineJ] : all.filter(j => !j.ek);
  if (!pickJudge) {
    app.innerHTML = `<div class="j-login">
      ${logo ? `<img src="${esc(logo)}" alt="" style="max-height:64px;max-width:200px;align-self:flex-start;margin-bottom:10px">` : ''}
      ${backLink()}
      <span class="pill off" style="align-self:flex-start">สำหรับกรรมการ${e.round ? ' · ' + esc(e.round) : ''}</span>
      <h1 class="j-title" style="font-size:2.1rem;margin-top:18px">${esc(e.title || 'การประกวดแบบ')}</h1>
      <p class="muted" style="margin:0">เลือกชื่อของคุณเพื่อเข้าสู่ระบบ</p>
      ${judges.length
        ? `<div class="judge-grid">${judges.map(j => { const src = mediaSrc(S, j.photo); return `<button class="judge-pick" data-j="${j.id}">${src ? `<span class="avatar" style="background:none"><img src="${esc(src)}" alt=""></span>` : `<span class="avatar">${esc(initials(j.name))}</span>`}<b>${esc(j.name)}</b></button>`; }).join('')}</div>`
        : `<div class="notice">${all.length ? 'บัญชีของคุณไม่ได้อยู่ในรายชื่อกรรมการ — ถ้าเป็นกรรมการ ให้ผู้ดูแลผูกบัญชีที่แท็บ "กรรมการ"' : 'ยังไม่มีรายชื่อกรรมการ — ให้ผู้ดูแลเพิ่มในหน้าแอดมิน'}</div>`}
    </div>`;
    $$('.judge-pick').forEach(b => b.onclick = () => { pickJudge = b.dataset.j; pin = ''; render(); });
    return;
  }
  const j = S.judges?.[pickJudge];
  if (!j) { pickJudge = null; return render(); }
  if ($('#dots')) return drawDots(); // keypad already on screen
  const src = mediaSrc(S, j.photo);
  app.innerHTML = `<div class="j-login" style="text-align:center">
    <button class="btn btn-ghost btn-sm" id="back" style="align-self:flex-start">← เปลี่ยนชื่อ</button>
    <div class="avatar" style="width:84px;height:84px;font-size:2rem;border-radius:26px;margin:18px auto 14px;${src ? 'background:none' : ''}">${src ? `<img src="${esc(src)}" alt="">` : esc(initials(j.name))}</div>
    <h2 class="j-title">${esc(j.name)}</h2>
    <p class="muted" style="margin:0">ใส่รหัส PIN 4 หลักที่ได้รับจากผู้จัด<br><small class="dim">ใส่ครั้งแรกครั้งเดียว เครื่องนี้จะจำไว้</small></p>
    <div class="pin-dots" id="dots">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
      <button class="fn" data-k="c">ล้าง</button><button data-k="0">0</button><button class="fn" data-k="b">⌫</button></div>
  </div>`;
  $('#back').onclick = () => { pickJudge = null; app.innerHTML = ''; render(); };
  $$('.keypad button').forEach(b => b.onclick = () => pressPin(b.dataset.k));
  drawDots();
}
function drawDots() { $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); }
async function pressPin(k) {
  if (busy) return;
  if (k === 'c') pin = ''; else if (k === 'b') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
  vibrate(8); drawDots();
  if (pin.length === 4) {
    busy = true;
    const ok = await store.loginJudge(pickJudge, pin);
    busy = false;
    if (ok) { me = pickJudge; pickJudge = null; pin = ''; vibrate(30); render(); }
    else {
      const d = $('#dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      vibrate([60, 40, 60]); pin = ''; setTimeout(drawDots, 250); toast('รหัส PIN ไม่ถูกต้อง', 'err');
    }
  }
}

// ======================= Scoring screen =======================
function targetEntry() {
  const e = ev(), ids = C.entries.map(x => x.id);
  if (e.judgeMode !== 'free') return ids.includes(e.current) ? e.current : null;
  if (viewId && ids.includes(viewId)) return viewId;
  if (ids.includes(e.current)) return e.current;
  return C.entries.find(x => !submitted(x.id))?.id || ids[0] || null;
}

function loadDraft(id) {
  const v = mine()[id]?.v || {};
  draft = Object.fromEntries(C.criteria.map(c => [c.id, typeof v[c.id] === 'number' ? fmtS(v[c.id]) : '']));
  const firstEmpty = C.criteria.findIndex(c => draft[c.id] === '');
  active = firstEmpty < 0 ? 0 : firstEmpty; fresh = true;
}
const hasDraft = () => Object.values(draft).some(v => v !== '');

function renderJudge() {
  const e = ev();
  let id = targetEntry();
  // follow mode: if admin moves on while this judge is mid-entry, don't yank the screen — offer a jump
  if (e.judgeMode !== 'free' && viewId && id !== viewId && hasDraft() && !submitted(viewId) && C.entries.find(x => x.id === viewId)) {
    pendingJump = id; id = viewId;
  } else pendingJump = null;
  if (id !== viewId) { viewId = id; loadDraft(id); }

  const key = JSON.stringify([viewId, me, C.criteria.map(c => [c.id, c.name, c.max]), submitted(viewId), canEdit(viewId), e.status, e.judgeMode,
    e.step, S.entries?.[viewId], mediaSrc(S, S.entries?.[viewId]?.photo).length, e.round, e.title, !!S.media?.logo, pendingJump, C.entries.length]);
  if (key !== structKey) { structKey = key; buildJudge(); }
  updateHeader();
}

function updateHeader() {
  const done = C.entries.filter(x => submitted(x.id)).length, n = C.entries.length;
  const p = $('#jkProg'); if (p) p.innerHTML = `<small>ให้คะแนนแล้ว</small><b class="num">${done}/${n}</b>`;
  const bar = $('#jkBar'); if (bar) bar.style.width = (n ? done / n * 100 : 0) + '%';
}

function buildJudge() {
  const e = ev(), j = S.judges[me], logo = mediaSrc(S, 'logo');
  const head = `<header class="jk-head">
      <div class="jk-brand">${logo ? `<img src="${esc(logo)}" alt="">` : `<span class="avatar" style="width:34px;height:34px;border-radius:10px;font-size:.9rem">${esc(initials(e.title))}</span>`}</div>
      <div class="jk-title"><b>${esc(e.round || e.title || 'การประกวด')}</b><span> · ${esc(j.name)} – <button class="linkbtn" id="logout">ออกจากระบบ</button></span></div>
      <div class="jk-prog" id="jkProg"></div>
    </header>
    <div class="progress jk-bar"><i id="jkBar"></i></div>`;

  if (!viewId) {
    app.innerHTML = `<div class="jk">${head}<div class="jk-wait"><div class="spinner" style="margin:0 auto 22px"></div>
      <h2>${C.entries.length ? 'รอผู้ดูแลเลือกทีมที่กำลังนำเสนอ' : 'ยังไม่มีทีมในระบบ'}</h2><p class="muted">หน้านี้จะเปลี่ยนให้อัตโนมัติ</p>
      <div style="margin-top:10px">${statusPill(e.status)}</div></div></div>`;
    return bindHead();
  }

  const ent = S.entries[viewId], src = mediaSrc(S, ent.photo), idx = C.entries.findIndex(x => x.id === viewId);
  const crit = C.criteria, multi = crit.length > 1, editable = canEdit(viewId), isSub = submitted(viewId);
  let notice = '';
  if (e.status !== 'open') notice = e.status === 'closed' ? 'ปิดรับคะแนนแล้ว' : 'ยังไม่เปิดให้คะแนน — รอผู้ดูแลเปิดระบบ';
  else if (e.locked?.[viewId]) notice = '🔒 ทีมนี้ถูกล็อกคะแนนแล้ว';

  const photo = `<section class="jk-photo">
      <div class="jk-frame">${src ? `<img id="jkImg" alt="">` : `<div class="jk-ph">${esc(initials(ent.name))}</div>`}</div>
      <div class="jk-cap">${ent.code ? `<span class="code">${esc(ent.code)}</span>` : ''}<b>${esc(ent.name)}</b><small>${esc(ent.owner || '')}</small></div>
      ${e.judgeMode === 'free' ? `<div class="jk-nav"><button class="btn icon-btn" id="prevE" ${idx <= 0 ? 'disabled' : ''}>‹</button>
        <select class="select" id="pickE">${C.entries.map((x, i) => `<option value="${x.id}" ${x.id === viewId ? 'selected' : ''}>${submitted(x.id) ? '✓ ' : ''}${esc(x.code || i + 1)} · ${esc(x.name)}</option>`).join('')}</select>
        <button class="btn icon-btn" id="nextE" ${idx >= C.entries.length - 1 ? 'disabled' : ''}>›</button></div>` : ''}
    </section>`;

  let pad;
  if (!crit.length) pad = `<section class="jk-pad"><div class="notice">ผู้ดูแลยังไม่ได้ตั้งเกณฑ์การให้คะแนน</div></section>`;
  else if (isSub && !editable) {
    const t = judgeTotal(mine()[viewId].v, crit);
    pad = `<section class="jk-pad"><div class="jk-done">
      <div class="ring">✓</div><h3>ยืนยันคะแนนแล้ว</h3>
      <div class="jk-done-total num">${scaledLine(t)}</div>
      ${multi ? `<div class="jk-done-list">${crit.map(c => `<div><span>${esc(c.name)}</span><b class="num">${fmtS(mine()[viewId].v[c.id])}</b></div>`).join('')}</div>` : ''}
      <p class="muted">${e.judgeMode === 'free' ? 'เลือกทีมถัดไปได้ทางซ้าย' : 'รอทีมถัดไป — หน้าจอจะเปลี่ยนให้อัตโนมัติ'}</p>
      ${notice ? `<div class="notice">${notice}</div>` : ''}
    </div></section>`;
  } else {
    pad = `<section class="jk-pad ${editable ? '' : 'disabled'}">
      ${multi ? `<div class="jk-crit">${crit.map((c, i) => `<button class="jk-c" data-i="${i}"><span class="n">${i + 1}</span><span class="t">${esc(c.name)}<small>เต็ม ${fmtS(c.max)}</small></span><b class="v num"></b></button>`).join('')}</div>` : ''}
      <div class="jk-screen" id="jkScreen"><small id="jkLabel"></small><b class="num" id="jkVal"></b></div>
      <div class="keys">
        <button class="k k-ac" data-k="ac">AC</button><button class="k k-max" data-k="max"></button><button class="k k-bs" data-k="bs">⌫</button>
        ${[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => `<button class="k" data-k="${n}">${n}</button>`).join('')}
        <button class="k k-zero" data-k="0">0</button><button class="k" data-k="." ${e.step === 'int' ? 'disabled' : ''}>.</button>
      </div>
      <div class="jk-actions">
        <div class="jk-total"><small>${multi ? (C.scale && C.maxPerJudge !== C.scale ? 'คะแนน (เทียบเต็ม ' + fmtS(C.scale) + ')' : 'รวมทุกเกณฑ์') : 'คะแนน'}</small><b class="num" id="jkTotal">–</b></div>
        ${multi ? `<button class="btn btn-lg" id="jkNext">ถัดไป ›</button>` : ''}
        <button class="btn btn-primary btn-lg" id="jkConfirm">${isSub ? 'แก้ไขคะแนน ✓' : 'ยืนยันคะแนน ✓'}</button>
      </div>
      ${notice ? `<div class="notice">${notice}</div>` : ''}
    </section>`;
  }

  app.innerHTML = `<div class="jk">${head}
    ${pendingJump ? `<div class="jk-jump">ผู้ดูแลเปลี่ยนเป็นทีม “${esc(S.entries[pendingJump]?.name || '')}” แล้ว <button class="btn btn-sm btn-primary" id="doJump">ไปทีมนั้น</button></div>` : ''}
    <main class="jk-main">${photo}${pad}</main></div>`;
  if (src) setImg($('#jkImg'), src);
  bindHead();
  if ($('#doJump')) $('#doJump').onclick = () => { draft = {}; viewId = null; structKey = ''; render(); };
  if ($('#pickE')) {
    $('#pickE').onchange = ev2 => goEntry(ev2.target.value);
    $('#prevE').onclick = () => goEntry(C.entries[idx - 1]?.id);
    $('#nextE').onclick = () => goEntry(C.entries[idx + 1]?.id);
  }
  $$('.jk-c').forEach(b => b.onclick = () => { active = Number(b.dataset.i); fresh = true; paint(); });
  $$('.keys .k').forEach(b => b.onclick = () => press(b.dataset.k));
  $('#jkNext') && ($('#jkNext').onclick = () => { active = (active + 1) % crit.length; fresh = true; paint(); });
  $('#jkConfirm') && ($('#jkConfirm').onclick = askConfirm);
  paint();
}

function bindHead() {
  $('#logout').onclick = async () => { if (confirm('ออกจากระบบ?')) { await store.logoutJudge(); me = null; viewId = null; render(); } };
  updateHeader();
}
function goEntry(id) {
  if (!id || id === viewId) return;
  if (hasDraft() && !submitted(viewId) && !confirm('ยังไม่ได้ยืนยันคะแนนทีมนี้ ต้องการเปลี่ยนทีม?')) { $('#pickE').value = viewId; return; }
  viewId = id; loadDraft(id); structKey = ''; render();
}

// "36.8 / 40 → 9.20 / 10" when scores are converted to a 10-point scale
function scaledLine(raw) {
  if (raw == null) return `–<small> / ${fmtS(C.judgeMax)}</small>`;
  if (!C.scale || C.maxPerJudge === C.scale) return `${fmtS(raw)}<small> / ${fmtS(C.maxPerJudge)}</small>`;
  return `${C.toScale(raw).toFixed(2)}<small> / ${fmtS(C.scale)}</small> <small class="raw">(${fmtS(raw)}/${fmtS(C.maxPerJudge)})</small>`;
}

// ---------- keypad ----------
const crit = () => C.criteria;
function valid(s, c) {
  if (s === '') return true;
  const step = ev().step || '0.1', mx = Number(c.max) || 10;
  if (!/^\d+(\.\d*)?$/.test(s)) return false;
  if (s.length > 1 && s[0] === '0' && s[1] !== '.') return false;
  const [, dec = ''] = s.split('.');
  if (s.includes('.')) {
    if (step === 'int') return false;
    if (dec.length > (step === '0.5' ? 1 : step === '0.01' ? 2 : 1)) return false;
    if (step === '0.5' && dec && !/^[05]$/.test(dec)) return false;
  }
  if (s.endsWith('.') && Number(s) >= mx) return false; // "10." makes no sense when max is 10
  return Number(s) <= mx;
}
const canExtend = (s, c) => [...'0123456789.'].some(ch => valid(s + ch, c) && s + ch !== s);

function press(k) {
  const cs = crit(), c = cs[active];
  if (!c || !canEdit(viewId)) return;
  let s = draft[c.id] ?? '';
  const replacing = fresh && /^[\d.]$|^max$/.test(k);
  if (replacing) s = '';
  let cand = s;
  if (/^\d$/.test(k)) cand = s === '0' ? k : s + k;
  else if (k === '.') cand = (s || '0') + (s.includes('.') ? '' : '.');
  else if (k === 'max') cand = fmtS(Number(c.max) || 10);
  else if (k === 'ac') cand = '';
  else if (k === 'bs') cand = s.slice(0, -1);
  if (!valid(cand, c)) {
    const sc = $('#jkScreen'); sc.classList.remove('shake'); void sc.offsetWidth; sc.classList.add('shake');
    vibrate([40, 30, 40]);
    $('#jkLabel').textContent = `ใส่ได้ 0 – ${fmtS(c.max)}${ev().step === 'int' ? ' (จำนวนเต็ม)' : ev().step === '0.5' ? ' (ทีละ 0.5)' : ''}`;
    return;
  }
  fresh = false; vibrate(6);
  draft[c.id] = cand;
  paint();
  // auto-advance when nothing more can be typed for this criterion (e.g. "10", "7.5")
  if (cs.length > 1 && cand !== '' && !cand.endsWith('.') && !canExtend(cand, c) && /^[\d.]$|^max$/.test(k)) {
    const next = cs.findIndex((x, i) => i > active && draft[x.id] === '');
    if (next > -1) setTimeout(() => { if (crit()[active] === c) { active = next; fresh = true; paint(); } }, 220);
  }
}

function paint() {
  const cs = crit(), c = cs[active]; if (!c || !$('#jkVal')) return;
  $$('.jk-c').forEach((b, i) => {
    const v = draft[cs[i].id];
    b.classList.toggle('on', i === active);
    b.classList.toggle('filled', v !== '' && v != null);
    $('.v', b).textContent = v === '' || v == null ? '–' : v;
  });
  $('#jkLabel').textContent = `${cs.length > 1 ? `${active + 1}/${cs.length} · ` : ''}${c.name} · เต็ม ${fmtS(c.max)}`;
  const v = draft[c.id];
  $('#jkVal').textContent = v === '' || v == null ? '' : v;
  $('#jkScreen').classList.toggle('fresh', fresh && v !== '');
  $('.k-max').textContent = fmtS(c.max);
  const complete = cs.every(x => draft[x.id] !== '' && draft[x.id] != null && !isNaN(Number(draft[x.id])));
  const total = cs.reduce((a, x) => a + (Number(draft[x.id]) || 0), 0);
  const any = cs.some(x => draft[x.id]);
  $('#jkTotal').innerHTML = scaledLine(any ? total : null);
  const btn = $('#jkConfirm');
  if (btn) { btn.disabled = !complete || !canEdit(viewId); btn.title = complete ? '' : 'กรอกให้ครบทุกเกณฑ์'; }
}

document.addEventListener('keydown', e => {
  if (!me) { if (pickJudge && /^\d$/.test(e.key)) pressPin(e.key); else if (pickJudge && e.key === 'Backspace') pressPin('b'); return; }
  if ($('.jk-modal')) { if (e.key === 'Enter') $('#mOk')?.click(); if (e.key === 'Escape') $('#mNo')?.click(); return; }
  if (/^\d$/.test(e.key) || e.key === '.') press(e.key);
  else if (e.key === 'Backspace') press('bs');
  else if (e.key === 'Escape') press('ac');
  else if (e.key === 'Enter') ($('#jkConfirm') && !$('#jkConfirm').disabled ? $('#jkConfirm') : $('#jkNext'))?.click();
  else if (e.key === 'Tab' && $('#jkNext')) { e.preventDefault(); $('#jkNext').click(); }
});

// ---------- confirm & submit ----------
function askConfirm() {
  const cs = crit(), values = Object.fromEntries(cs.map(c => [c.id, Number(draft[c.id])]));
  const total = judgeTotal(values, cs), ent = S.entries[viewId];
  const m = document.createElement('div');
  m.className = 'jk-modal';
  m.innerHTML = `<div class="jk-modal-card">
    <small class="muted">ยืนยันคะแนนให้</small><h3>${esc(ent.name)}</h3>
    ${cs.length > 1 ? `<div class="jk-done-list">${cs.map(c => `<div><span>${esc(c.name)}</span><b class="num">${fmtS(values[c.id])}</b></div>`).join('')}</div>` : ''}
    <div class="jk-done-total num">${scaledLine(total)}</div>
    ${ev().allowEdit ? '' : '<p class="dim" style="font-size:.85rem;margin:0 0 14px">ยืนยันแล้วจะแก้ไขไม่ได้</p>'}
    <div class="row-flex"><button class="btn btn-lg" id="mNo" style="flex:1">แก้ไข</button><button class="btn btn-primary btn-lg" id="mOk" style="flex:1.4">ยืนยัน ✓</button></div></div>`;
  document.body.appendChild(m);
  $('#mNo').onclick = () => m.remove();
  $('#mOk').onclick = async () => {
    $('#mOk').disabled = true; $('#mOk').textContent = 'กำลังส่ง…';
    try {
      await store.submitScore(me, viewId, values);
      vibrate([20, 40, 20]);
      m.innerHTML = `<div style="text-align:center"><div class="ring big">✓</div><h3 style="font-family:var(--display);font-size:1.6rem;margin:18px 0 4px">ส่งคะแนนแล้ว</h3><div class="muted num">${C.toScale(total) != null ? (C.scale && C.maxPerJudge !== C.scale ? C.toScale(total).toFixed(2) : fmtS(total)) : ''} / ${fmtS(C.judgeMax)}</div></div>`;
      m.classList.add('ok');
      setTimeout(() => {
        m.remove();
        if (ev().judgeMode === 'free') { const nx = C.entries.find(x => !submitted(x.id)); if (nx && !ev().allowEdit) { viewId = nx.id; loadDraft(nx.id); } }
        structKey = ''; render();
      }, 1100);
    } catch (err) {
      m.remove();
      const e = ev();
      toast(e.locked?.[viewId] ? 'ทีมนี้ถูกล็อกแล้ว' : e.status !== 'open' ? 'ยังไม่เปิด / ปิดรับคะแนนแล้ว' : submitted(viewId) ? 'ส่งคะแนนทีมนี้ไปแล้ว' : 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง', 'err');
    }
  };
}

// ---- start (after all helpers are defined) ----
store.onState(st => {
  S = st; C = compute(st);
  if (me && !S.judges?.[me]) me = null;
  render();
});
