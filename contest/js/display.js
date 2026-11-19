import { $, $$, esc, fmt, fmtS, initials, boot, compute, statusPill, mediaSrc, setImg } from './common.js';

const stage = $('#stage');
const Q = new URLSearchParams(location.search);       // ?bg=green&view=lowerthird  (overrides for an OBS/vMix output)
let S = {}, C = compute({}), curView = null, curEntry = null, known = null, celebrated = false;
const rowEls = new Map();

const store = await boot();
window.addEventListener('resize', () => { if (curView === 'leaderboard' || curView === 'reveal' || curView === 'popular') layoutBoard(); });

// ---------- tools ----------
let idle;
document.addEventListener('mousemove', () => {
  document.body.classList.add('mouse'); document.body.classList.remove('nocursor');
  clearTimeout(idle); idle = setTimeout(() => { document.body.classList.remove('mouse'); document.body.classList.add('nocursor'); }, 2500);
});
$('#fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
document.addEventListener('keydown', e => { if (e.key === 'f') $('#fs').click(); });

const dec = () => Number(S.event?.decimals ?? 2);
const fmtT = n => fmt(n, dec());

// ---------- background: theme / chroma / looping image-GIF-video ----------
let BGM = {}, curBgToken = null, bgSeq = 0;
const blobCache = new Map();
const layer = $('#bgLayer');
function refSrc(ref) {
  if (!ref) return null;
  if (ref.startsWith('bgm:')) return BGM[ref.slice(4)] || null;
  if (ref.startsWith('media:')) return S.media?.[ref.slice(6)] || null;
  return ref; // plain URL or relative path such as media/team01.mp4
}
async function toObjURL(key, data) {
  if (!data.startsWith('data:')) return data;
  const c = blobCache.get(key);
  if (c && c.n === data.length) return c.u;
  if (c) URL.revokeObjectURL(c.u);
  const u = URL.createObjectURL(await (await fetch(data)).blob());
  blobCache.set(key, { u, n: data.length });
  return u;
}
function applyBg(view) {
  const d = S.event?.display || {};
  const bg = Q.get('bg') || d.bg || 'theme';
  const body = document.body;
  body.classList.remove('bg-theme', 'bg-image', 'bg-green', 'bg-blue', 'bg-transparent', 'chroma');
  body.classList.add('bg-' + bg);
  if (['green', 'blue', 'transparent'].includes(bg)) body.classList.add('chroma');
  document.documentElement.style.background = bg === 'green' ? '#00b140' : bg === 'blue' ? '#0047bb' : bg === 'transparent' ? 'transparent' : '';
  stage.style.setProperty('--s', (Number(d.ltScale) || 100) / 100);
  layer.classList.toggle('fit-contain', d.fit === 'contain');
  layer.style.setProperty('--dim', (d.dim ?? 30) / 100);
  let m = null;
  if (bg === 'image') {
    const ent = S.entries?.[S.event?.current], rbg = S.event?.results?.bgMedia;
    if ((view === 'lowerthird' || view === 'current') && ent?.bg?.ref) m = ent.bg;
    else if (['results', 'leaderboard', 'reveal', 'hidden'].includes(view) && rbg?.ref) m = rbg;
    else if (d.bgMedia?.ref) m = d.bgMedia;
    else if (S.media?.bg) m = { kind: 'image', ref: 'media:bg' };
  }
  showMedia(m);
}
async function showMedia(m) {
  const token = m ? [m.ref, m.v || '', m.size || ''].join('|') : null;
  if (token === curBgToken) return;
  const raw = m && refSrc(m.ref);
  if (m && !raw) return;            // file still downloading — applyBg runs again when it arrives
  curBgToken = token;
  const seq = ++bgSeq;
  const olds = [...layer.children];
  const retire = () => olds.forEach(o => { o.classList.remove('on'); setTimeout(() => { $('video', o)?.pause(); o.remove(); }, 900); });
  if (!m) return retire();
  const src = await toObjURL(m.ref, raw);
  if (seq !== bgSeq) return;
  const wrap = document.createElement('div'); wrap.className = 'bgm-wrap';
  let el;
  if (m.kind === 'video') {
    el = document.createElement('video');
    el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true;
    el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('loop', '');
    el.src = src;
  } else {
    const blur = new Image(); blur.className = 'bgm-blur'; blur.alt = ''; blur.src = src; wrap.appendChild(blur);
    el = new Image(); el.alt = ''; el.src = src;
  }
  el.className = 'bgm-item';
  wrap.appendChild(el); layer.appendChild(wrap);
  let shown = false;
  const show = () => { if (shown || seq !== bgSeq) return; shown = true; wrap.classList.add('on'); retire(); if (el.play) el.play().catch(() => {}); };
  if (m.kind === 'video') el.addEventListener('loadeddata', show, { once: true }); else el.onload = show;
  el.onerror = () => { console.warn('background media failed to load', m.ref); show(); };
  setTimeout(show, 2500);
}

// ---------- main ----------
function render() {
  const ev = S.event || {};
  const view = C.entries.length ? (Q.get('view') || ev.view || 'lowerthird') : 'empty';
  applyBg(view);
  const logo = mediaSrc(S, 'logo');
  setImg($('#dLogo'), logo);
  $('#dTitle').textContent = ev.title || 'การประกวดแบบ';
  $('#dSub').textContent = [ev.round, ev.subtitle].filter(Boolean).join(' · ');
  document.title = (ev.title || 'การประกวดแบบ') + ' · Live';
  const showHead = view !== 'results' && (view !== 'lowerthird' || (ev.display?.showTitle && !Q.get('bg')));
  $('.d-head').classList.toggle('hidden', !showHead);
  $('#dPill').innerHTML = view === 'popular' ? '<span class="pill ok"><span class="dot"></span>❤️ โหวตขวัญใจ</span>'
    : view === 'reveal' ? '<span class="pill warn"><span class="dot"></span>ประกาศผล</span>'
    : ev.status === 'open' ? '<span class="pill ok live"><span class="dot"></span>LIVE</span>' : statusPill(ev.status);
  $('#dCount').innerHTML = view === 'popular' ? `โหวตแล้ว <b>${Object.keys(S.votes || {}).length}</b> คน` : `ส่งคะแนนแล้ว <b>${C.submitted}</b> / ${C.possible}`;

  const entryKey = ev.current;
  if (view !== curView || ((view === 'current' || view === 'lowerthird') && curEntry !== entryKey)) {
    stage.innerHTML = ''; rowEls.clear(); curView = view; curEntry = entryKey; celebrated = false;
    const v = document.createElement('div'); v.className = 'view' + (view === 'lowerthird' ? ' ltv' : ''); stage.appendChild(v);
    if (view === 'leaderboard' || view === 'reveal' || view === 'popular') v.innerHTML = '<div class="board"></div>';
    if (view === 'empty') v.innerHTML = '<div class="empty-state">ยังไม่มีทีม<br><small class="dim">เพิ่มทีม กรรมการ และเกณฑ์ ได้ที่หน้าแอดมิน</small></div>';
    if (view === 'hidden') buildSuspense(v);
    if (view === 'current') buildSpotlight(v);
    if (view === 'lowerthird') buildLowerThird(v);
    if (view === 'results') resKey = null;
  }
  if (view === 'results') updateResults(stage.firstChild);
  if (view === 'leaderboard') updateBoard(C.ranked, false);
  if (view === 'reveal') updateBoard(C.ranked, true);
  if (view === 'popular') updateBoard(popularRanked(), false, true);
  if (view === 'hidden') updateSuspense();
  if (view === 'current') updateSpotlight();
  if (view === 'lowerthird') updateLowerThird();
  ticker(view);
}

function tween(el, to, d = 1100, int = false) {
  const from = el._v ?? 0; el._v = to;
  const t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = t => {
    const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
    el.textContent = int ? String(Math.round(from + (to - from) * e)) : fmtT(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
// a judge's own score: "8.5" (as typed) or "9.20" when converted from several criteria
const jtxt = v => v == null ? '–' : (C.scale && C.maxPerJudge !== C.scale ? fmtS(Math.round(v * 100) / 100) : fmtS(v));
const popIn = el => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };

// =============== LOWER THIRD (like broadcast score bar) ===============
function buildLowerThird(v) {
  const ev = S.event || {}, e = C.rows.find(r => r.id === ev.current);
  const pos = ev.display?.ltPos || 'bottom';
  if (!e) { v.innerHTML = document.body.classList.contains('chroma') ? '' : '<div class="empty-state">เลือก “ทีมที่กำลังนำเสนอ” ในหน้าแอดมิน</div>'; return; }
  v.innerHTML = `<div class="lt lt-${pos}">
    <div class="lt-photo"><img id="ltImg" alt=""><span class="lt-ini">${esc(initials(e.name))}</span></div>
    <div class="lt-bar">
      <div class="lt-name">${e.code ? `<span class="lt-code">${esc(e.code)}</span>` : ''}<b>${esc(e.name)}</b><small>${esc(e.owner || '')}</small></div>
      <div class="lt-sep"></div>
      ${C.judges.map(j => `<div class="lt-j" data-j="${j.id}"><div class="lt-av"><img alt=""><span>${esc(initials(j.name))}</span></div><div class="lt-jn">${esc(j.name)}</div><div class="lt-sc num">–</div></div>`).join('')}
      <div class="lt-j lt-avg"><div class="lt-av"><span>${C.method === 'sum' ? 'Σ' : 'AVG'}</span></div><div class="lt-jn">${C.aggLabel}</div><div class="lt-sc num" id="ltAvg">–</div></div>
    </div></div>`;
  const photo = mediaSrc(S, e.photo);
  setImg($('#ltImg'), photo); $('.lt-photo').classList.toggle('has', !!photo);
  $$('.lt-j[data-j]').forEach(el => { const src = mediaSrc(S, S.judges[el.dataset.j]?.photo); setImg($('img', el), src); $('.lt-av', el).classList.toggle('has', !!src); });
  requestAnimationFrame(() => $('.lt')?.classList.add('in'));
}
function updateLowerThird() {
  const e = C.rows.find(r => r.id === S.event?.current); if (!e || !$('.lt')) return;
  if ($$('.lt-j[data-j]').length !== C.judges.length || $$('.lt-j[data-j]').some((el, i) => el.dataset.j !== C.judges[i]?.id)) { curView = null; return render(); }
  e.per.forEach(p => {
    const el = $(`.lt-j[data-j="${p.judge.id}"]`); if (!el) return;
    const sc = $('.lt-sc', el), txt = jtxt(p.total);
    if (sc.textContent !== txt) { sc.textContent = txt; if (p.total != null) popIn(el); }
    el.classList.toggle('done', p.total != null);
    const src = mediaSrc(S, p.judge.photo); setImg($('img', el), src); $('.lt-av', el).classList.toggle('has', !!src);
  });
  const avg = $('#ltAvg'), t = e.total;
  if (t == null) { avg.textContent = '–'; avg._v = 0; }
  else if (avg._v !== t) { tween(avg, t, 700); popIn(avg.closest('.lt-j')); }
  const photo = mediaSrc(S, e.photo); setImg($('#ltImg'), photo); $('.lt-photo').classList.toggle('has', !!photo);
}

// =============== LEADERBOARD / REVEAL ===============
function layoutBoard() {
  const board = $('.board', stage); if (!board) return;
  const n = Math.max(1, board.children.length), H = stage.clientHeight;
  const gap = Math.max(6, Math.min(16, H * 0.014));
  const h = Math.max(44, Math.min(H * 0.16, (H - gap * (n - 1)) / n));
  board.style.setProperty('--gap', gap + 'px');
  board.style.setProperty('--rowh', h + 'px');
}
/** ผลโหวตขวัญใจ เรียงจากโหวตมากไปน้อย (ใช้แถวอันดับแบบเดียวกับอันดับสด) */
function popularRanked() {
  const n = {}; Object.values(S.votes || {}).forEach(v => { if (v && v.e) n[v.e] = (n[v.e] || 0) + 1; });
  const rows = C.entries.map(e => ({ ...e, total: n[e.id] || 0 })).sort((a, b) => b.total - a.total || (a.order ?? 0) - (b.order ?? 0));
  let prev = null, rank = 0;
  rows.forEach((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = r.total ? rank : null; });
  return rows;
}
function updateBoard(ranked, reveal, pop = false) {
  const board = $('.board', stage);
  const n = ranked.length, step = Math.min(n, Number(S.event?.revealStep) || 0);
  const first = new Map([...board.children].map(el => [el.dataset.id, el.getBoundingClientRect().top]));
  const nJ = C.judges.length, maxT = pop ? Math.max(1, ...ranked.map(r => r.total || 0)) : (C.maxTotal || 100);
  if (reveal && step < n) celebrated = false;

  ranked.forEach((r, i) => {
    let el = rowEls.get(r.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'row'; el.dataset.id = r.id;
      el.innerHTML = '<div class="rank"></div><div class="name"><img class="th" alt=""><div class="nm"><b></b><small></small></div></div><div class="bar"><i></i></div><div class="score num"><span></span><small></small></div>';
      rowEls.set(r.id, el);
    }
    board.appendChild(el);
    const masked = reveal && i < n - step, wasMasked = el._masked;
    el._masked = masked;
    const rank = reveal ? i + 1 : r.rank;
    el.classList.remove('r1', 'r2', 'r3');
    if (!masked && r.total != null && rank <= 3) el.classList.add('r' + rank);
    el.classList.toggle('pending', r.total == null);
    $('.rank', el).textContent = rank ?? '–';
    const th = $('.th', el), nameB = $('.nm b', el), nameS = $('.nm small', el), sc = $('.score span', el);
    if (masked) {
      setImg(th, ''); th.classList.add('noimg');
      nameB.innerHTML = '<span class="masked">? ? ? ? ?</span>'; nameS.textContent = '';
      $('.bar i', el).style.width = '0%'; sc.textContent = ''; sc._v = 0; $('.score small', el).textContent = '';
    } else {
      setImg(th, mediaSrc(S, r.photo));
      nameB.textContent = (r.code ? r.code + ' · ' : '') + r.name; nameS.textContent = r.owner || '';
      $('.bar i', el).style.width = Math.min(100, (r.total ?? 0) / maxT * 100) + '%';
      $('.score small', el).textContent = pop ? 'โหวต' : reveal ? 'คะแนน' : `${r.count}/${nJ} กรรมการ`;
      if (r.total == null) { sc.textContent = '–'; sc._v = 0; }
      else if (sc._v !== r.total) {
        const changed = sc._v != null && sc._v !== 0 && !reveal;
        tween(sc, r.total, 1300, pop);
        if (changed) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      }
      if (reveal && wasMasked) {
        el.classList.remove('reveal-in', 'winner'); void el.offsetWidth;
        el.classList.add(i === 0 ? 'winner' : 'reveal-in');
        if (i === 0 && !celebrated) { celebrated = true; setTimeout(confetti, 350); }
      }
    }
  });
  for (const [id, el] of rowEls) if (!ranked.find(r => r.id === id)) { el.remove(); rowEls.delete(id); }
  layoutBoard();
  for (const el of board.children) {
    const top = first.get(el.dataset.id); if (top == null) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) {
      el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`;
      el.getBoundingClientRect();
      requestAnimationFrame(() => { el.style.transition = 'transform 1s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
    }
  }
}

// =============== RESULTS SUMMARY (all teams, after the contest) ===============
let resKey = null;
function updateResults(v) {
  const R = S.event?.results || {}, d = dec();
  const awards = R.awards || [];
  let list = C.ranked.filter(r => r.total != null);
  if (Number(R.limit) > 0) list = list.slice(0, Number(R.limit));
  const key = JSON.stringify([list.map(r => [r.id, r.total, r.rank, r.name, r.owner, r.code, r.photo]), R, d, C.maxTotal, S.event?.title, C.judges.map(j => j.name), !!R.showJudges && list.map(r => r.per.map(p => p.total))]);
  if (key === resKey) return;
  const first = resKey === null; resKey = key;
  const top = list.filter(r => r.rank <= 3).slice(0, 3), rest = list.filter(r => !top.includes(r));
  const judgesLine = r => R.showJudges ? `<div class="rs-j">${r.per.map(p => `<span title="${esc(p.judge.name)}">${jtxt(p.total)}</span>`).join('')}</div>` : '';
  const photo = r => { const src = mediaSrc(S, r.photo); return src ? `<img src="${esc(src)}" alt="">` : `<span>${esc(initials(r.name))}</span>`; };
  const pod = [top[1], top[0], top[2]].filter(Boolean).map(r => `<div class="pod pod-${r.rank}">
      <div class="pod-photo">${photo(r)}</div>
      <div class="pod-card"><div class="pod-award">${esc(awards[r.rank - 1] || 'อันดับ ' + r.rank)}</div>
      <div class="pod-name">${r.code ? `<span class="pod-code">${esc(r.code)}</span>` : ''}${esc(r.name)}</div>
      <div class="pod-owner">${esc(r.owner || '')}</div>
      <div class="pod-score num">${fmt(r.total, d)}<small> / ${fmtS(C.maxTotal)}</small></div>${judgesLine(r)}</div>
      <div class="pod-base"><b>${r.rank}</b></div></div>`).join('');
  v.innerHTML = `<div class="rs ${first ? 'anim' : ''}">
    <div class="rs-head"><div class="rs-title grad-text">${esc(R.title || 'สรุปผลการประกวด')}</div><div class="rs-sub">${esc(R.subtitle || S.event?.title || '')}</div></div>
    ${list.length ? `<div class="podium n${top.length}">${pod}</div>` : '<div class="empty-state">ยังไม่มีคะแนน</div>'}
    ${rest.length ? `<div class="rs-list ${rest.length > 12 ? 'three' : rest.length > 3 ? 'two' : ''}">${rest.map((r, i) => `<div class="rs-row" style="--i:${i}"><b class="rs-rank">${r.rank}</b><div class="rs-th">${photo(r)}</div>
      <div class="rs-nm"><b>${r.code ? esc(r.code) + ' · ' : ''}${esc(r.name)}</b><small>${esc(r.owner || '')}</small>${judgesLine(r)}</div><div class="rs-sc num">${fmt(r.total, d)}</div></div>`).join('')}</div>` : ''}
  </div>`;
  if (first && top[0]) setTimeout(confetti, 1600);
}

// =============== RINGS ===============
const RING_C = 2 * Math.PI * 54;
const ringSVG = id => `<svg viewBox="0 0 120 120"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
  <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
  <circle class="arc" cx="60" cy="60" r="54" fill="none" stroke="url(#g${id})" stroke-width="9" stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"/></svg>`;
const setRing = (root, frac) => { $('.arc', root).style.strokeDashoffset = RING_C * (1 - Math.max(0, Math.min(1, frac))); };

// =============== SPOTLIGHT (current team, full screen) ===============
function buildSpotlight(v) {
  const e = C.rows.find(r => r.id === S.event?.current);
  if (!e) { v.innerHTML = '<div class="empty-state">เลือก “ทีมที่กำลังนำเสนอ” ในหน้าแอดมิน</div>'; return; }
  const photo = mediaSrc(S, e.photo);
  v.innerHTML = `<div class="spot2 ${photo ? '' : 'noimg'}">
    ${photo ? `<div class="sp-frame"><img id="spImg" alt=""></div>` : ''}
    <div class="sp-body">
      <div class="sp-label"><span class="dot pulse" style="width:.6em;height:.6em;border-radius:50%;background:#a78bfa;color:#a78bfa"></span>กำลังนำเสนอ${e.code ? ' · ' + esc(e.code) : ''}</div>
      <div class="sp-name">${esc(e.name)}</div>
      <div class="sp-owner">${esc(e.owner || '')}</div>
      <div class="sp-judges">${C.judges.map(j => `<div class="sj" data-j="${j.id}"><div class="sj-av"><img alt=""><span>${esc(initials(j.name))}</span></div><div class="sj-n">${esc(j.name)}</div><div class="sj-s num">–</div></div>`).join('')}</div>
      <div class="sp-total"><div class="ring-score" id="spRing">${ringSVG('sp')}<div class="val num"></div></div>
        <div><div class="sp-tl">${C.aggLabel}</div><div class="sp-tv num" id="spTotal">–</div><div class="dim" id="spOf"></div></div></div>
    </div></div>`;
  if (photo) setImg($('#spImg'), photo);
  $$('.sj').forEach(el => { const src = mediaSrc(S, S.judges[el.dataset.j]?.photo); setImg($('img', el), src); $('.sj-av', el).classList.toggle('has', !!src); });
}
function updateSpotlight() {
  const e = C.rows.find(r => r.id === S.event?.current); if (!e || !$('#spRing')) return;
  const nJ = C.judges.length;
  e.per.forEach(p => {
    const el = $(`.sj[data-j="${p.judge.id}"]`); if (!el) return;
    const s = $('.sj-s', el), txt = jtxt(p.total);
    if (s.textContent !== txt) { s.textContent = txt; if (p.total != null) popIn(el); }
    el.classList.toggle('done', p.total != null);
  });
  setRing($('#spRing'), nJ ? e.count / nJ : 0);
  $('.val', $('#spRing')).innerHTML = `${e.count}/${nJ}<small>กรรมการ</small>`;
  const tv = $('#spTotal');
  if (e.total == null) { tv.textContent = '–'; tv._v = 0; } else if (tv._v !== e.total) tween(tv, e.total);
  $('#spOf').textContent = `เต็ม ${fmtS(C.maxTotal)}`;
}

// =============== SUSPENSE ===============
function buildSuspense(v) {
  v.innerHTML = `<div class="suspense">
    <div class="ring-score big-ring" id="suRing">${ringSVG('su')}<div class="val num"></div></div>
    <h2>กำลังรวบรวมคะแนน</h2>
    <div class="jchips" id="suChips" style="justify-content:center;max-width:80vw"></div></div>`;
}
function updateSuspense() {
  const ring = $('#suRing'); if (!ring) return;
  const frac = C.possible ? C.submitted / C.possible : 0;
  setRing(ring, frac);
  $('.val', ring).innerHTML = `${Math.round(frac * 100)}%<small>${C.submitted}/${C.possible} คะแนน</small>`;
  const nE = C.entries.length;
  $('#suChips').innerHTML = C.judges.map(j => {
    const n = C.rows.filter(r => r.per.find(p => p.judge.id === j.id)?.total != null).length;
    return `<div class="jchip ${n >= nE ? 'done' : ''}"><span class="st">${n >= nE ? '✓' : ''}</span>${esc(j.name)} <span class="dim num">${n}/${nE}</span></div>`;
  }).join('');
}

// =============== TICKER ===============
function ticker(view) {
  const cur = {};
  for (const [jid, ents] of Object.entries(S.scores || {})) for (const [eid, rec] of Object.entries(ents || {})) cur[jid + '|' + eid] = rec?.ts;
  if (known && !['reveal', 'lowerthird'].includes(view)) {
    const fresh = Object.entries(cur).filter(([k, ts]) => known[k] !== ts).map(([k]) => k);
    const add = html => {
      const t = document.createElement('div'); t.className = 'tick'; t.innerHTML = html;
      $('#ticker').appendChild(t); setTimeout(() => t.remove(), 5200);
      while ($('#ticker').children.length > 3) $('#ticker').firstChild.remove();
    };
    if (fresh.length > 3) add(`<span class="st">✓</span><span><b>+${fresh.length}</b> คะแนนใหม่</span>`);
    else fresh.forEach(k => {
      const [jid, eid] = k.split('|');
      const j = S.judges?.[jid], e = S.entries?.[eid]; if (!j || !e) return;
      add(`<span class="st">✓</span><span><b>${esc(j.name)}</b> ${known[k] ? 'แก้ไขคะแนน' : 'ส่งคะแนน'} <span class="muted">“${esc(e.name)}”</span></span>`);
    });
  }
  known = cur;
}

// =============== CONFETTI ===============
function confetti() {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const colors = ['#f6c453', '#ffe9a8', '#8b5cf6', '#22d3ee', '#ffffff', '#f472b6'];
  const P = Array.from({ length: 260 }, () => ({
    x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 26 * devicePixelRatio,
    vy: (-Math.random() * 22 - 8) * devicePixelRatio, r: (4 + Math.random() * 6) * devicePixelRatio,
    c: colors[Math.random() * colors.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .4,
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    const life = (t - t0) / 1000;
    P.forEach(p => {
      p.vy += .55 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, 1 - life / 5);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    });
    if (life < 5) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

// ---- start (after all helpers are defined) ----
store.onState(st => { S = st; C = compute(st); render(); });
// heavy background files are only downloaded by the display, never by judges' phones
store.watch('bgm', v => { BGM = v || {}; if (curView) render(); });
