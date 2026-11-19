import { getStore } from './store.js';
import { contestOn, closedScreen, DEFAULT_TITLE } from './intranet.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 2) => (n == null || isNaN(n) ? '–' : Number(n).toFixed(d));
/** short number: 8 → "8", 8.5 → "8.5", 8.25 → "8.25" */
export const fmtS = n => (n == null || isNaN(n) ? '–' : String(Math.round(n * 100) / 100));
export const initials = name => (String(name || '?').trim().replace(/^(คุณ|นาย|นางสาว|นาง|ดร\.|อ\.|ทีม)\s*/, '')[0] || '?').toUpperCase();
export const newId = (p = '') => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
export const randPin = () => String(Math.floor(1000 + Math.random() * 9000));
export const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

/** Resolve an image reference: a media key (stored in /media) or a plain URL. */
export const mediaSrc = (S, ref) => (!ref ? '' : /^(https?:|data:)/.test(ref) ? ref : (S.media?.[ref] || ''));
/** Set <img> src only when it actually changed (avoids flicker on realtime updates). */
export function setImg(img, src) { if (img && img._src !== src) { img._src = src; if (src) img.src = src; else img.removeAttribute('src'); img.classList.toggle('noimg', !src); } }
/** Avatar markup: photo if any, otherwise initials on gradient */
export const avatarHTML = (src, name, cls = '') => src
  ? `<span class="av ${cls}"><img src="${esc(src)}" alt=""></span>`
  : `<span class="av av-ini ${cls}">${esc(initials(name))}</span>`;

export function toast(msg, kind = '') {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; wrap.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2600);
}

export async function boot() {
  // ปิดสวิตช์ในเว็บภายใน หรือเปิดลิงก์ตรงโดยไม่ผ่านเว็บภายใน → ไม่เปิดให้ใช้
  if (!contestOn()) { closedScreen(); throw new Error('contest-off'); }
  try {
    const store = await getStore();
    if (store.mode === 'demo' && !document.body.dataset.nobanner) {
      const b = document.createElement('div');
      b.className = 'demo-banner';
      b.textContent = 'โหมดทดลอง · ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น (ยังไม่ได้วางค่า Firebase ที่เว็บภายใน)';
      document.body.prepend(b);
    }
    $('.loading')?.remove();
    return store;
  } catch (e) {
    console.error(e);
    const l = $('.loading');
    if (l) l.innerHTML = `<div style="text-align:center;max-width:420px;padding:20px"><div style="font-size:2.4rem">⚠️</div>
      <h3 style="font-family:var(--display)">เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h3>
      <p class="muted">ตรวจสอบอินเทอร์เน็ต และค่า Firebase ที่เว็บภายใน → จัดการข้อมูล → 🧩 ฟังก์ชันเสริม<br><small class="dim">${esc(e.message || e)}</small></p>
      <button class="btn btn-primary" onclick="location.reload()">ลองใหม่</button></div>`;
    throw e;
  }
}

// ---------- Scoring ----------
export function list(obj) {
  return Object.entries(obj || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'th'));
}

/** One judge's score for one entry = SUM of all criteria. null if any criterion is missing. */
export function judgeTotal(vals, criteria) {
  if (!vals || !criteria.length) return null;
  let s = 0;
  for (const c of criteria) {
    const v = vals[c.id];
    if (typeof v !== 'number') return null;
    s += v;
  }
  return Math.round(s * 1000) / 1000;
}

export const AGG = {
  avg: { label: 'เฉลี่ย', long: 'ค่าเฉลี่ยของกรรมการทุกคน (แนะนำ)' },
  sum: { label: 'รวม', long: 'รวมคะแนนของกรรมการทุกคน' },
  trim: { label: 'เฉลี่ย', long: 'ตัดคะแนนสูงสุด-ต่ำสุดออก แล้วเฉลี่ย (กรรมการ ≥ 5 คน)' },
};

/** scale: 10 → every judge's score is converted to a 10-point score (sum ÷ full marks × 10). 0 → raw sum. */
export function compute(state) {
  const entries = list(state.entries), judges = list(state.judges), criteria = list(state.criteria);
  const scores = state.scores || {};
  const method = state.event?.method || 'avg';
  const scale = Number(state.event?.scale ?? 10) || 0;
  const maxPerJudge = criteria.reduce((a, c) => a + (Number(c.max) || 0), 0);   // raw full marks
  const judgeMax = scale || maxPerJudge;                                           // full marks after scaling
  const toScale = raw => raw == null ? null : (scale && maxPerJudge ? raw / maxPerJudge * scale : raw);
  const maxTotal = method === 'sum' ? judgeMax * judges.length : judgeMax;
  const rows = entries.map(e => {
    const per = judges.map(j => {
      const rec = scores[j.id]?.[e.id];
      const raw = judgeTotal(rec?.v, criteria);
      return { judge: j, raw, total: toScale(raw), vals: rec?.v || null, ts: rec?.ts || 0 };
    });
    const got = per.filter(p => p.total != null);
    let used = got.map(p => p.total);
    if (method === 'trim' && used.length >= 5) used = [...used].sort((a, b) => a - b).slice(1, -1);
    let total = null;
    if (used.length) total = method === 'sum' ? used.reduce((a, b) => a + b, 0) : used.reduce((a, b) => a + b, 0) / used.length;
    const critAvg = Object.fromEntries(criteria.map(c => {
      const vs = got.map(p => p.vals?.[c.id]).filter(v => typeof v === 'number');
      return [c.id, vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null];
    }));
    return { ...e, per, count: got.length, total, critAvg };
  });
  const ranked = [...rows].sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || (a.order ?? 0) - (b.order ?? 0));
  let prev = null, rank = 0;
  ranked.forEach((r, i) => {
    if (r.total == null) { r.rank = null; return; }
    const key = r.total.toFixed(4);
    if (key !== prev) { rank = i + 1; prev = key; }
    r.rank = rank;
  });
  const submitted = rows.reduce((a, r) => a + r.count, 0);
  return { entries, judges, criteria, rows, ranked, submitted, possible: entries.length * judges.length, maxPerJudge, judgeMax, maxTotal, scale, toScale, method, aggLabel: AGG[method]?.label || 'เฉลี่ย' };
}

export const STATUS = {
  setup: { label: 'รอเริ่ม', cls: 'off' },
  open: { label: 'เปิดให้คะแนน', cls: 'ok live' },
  closed: { label: 'ปิดรับคะแนน', cls: 'warn' },
};
export const statusPill = s => { const m = STATUS[s] || STATUS.setup; return `<span class="pill ${m.cls}"><span class="dot"></span>${m.label}</span>`; };

export const DEFAULT_EVENT = {
  title: DEFAULT_TITLE, voteOpen: false, subtitle: '', round: 'รอบตัดสิน', status: 'setup', view: 'lowerthird', method: 'avg', scale: 10,
  decimals: 2, step: '0.1', allowEdit: false, judgeMode: 'follow',
  display: { bg: 'green', ltPos: 'bottom', ltScale: 100, showTitle: false },
  results: { title: 'สรุปผลการประกวด', subtitle: '', awards: ['ชนะเลิศ', 'รองชนะเลิศอันดับ 1', 'รองชนะเลิศอันดับ 2'], showJudges: false, limit: 0 },
};

// ---------- Sample data (placeholder artwork generated as SVG — replace with real photos) ----------
const svgURI = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
function entryArt(i, name) {
  const hues = [265, 195, 30, 150, 330, 210, 0, 95];
  const h = hues[i % hues.length], h2 = (h + 50) % 360;
  const blocks = Array.from({ length: 6 }, (_, k) => {
    const w = 70 + ((i * 37 + k * 53) % 90), hh = 160 + ((i * 71 + k * 29) % 260), x = 20 + k * 95;
    return `<rect x="${x}" y="${900 - hh}" width="${w}" height="${hh}" rx="6" fill="hsla(${h2},70%,${70 - k * 5}%,.55)"/>`;
  }).join('');
  return svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${h2},75%,18%)"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="450" cy="200" r="110" fill="hsla(${h2},90%,80%,.35)"/>${blocks}<text x="40" y="120" font-family="sans-serif" font-weight="800" font-size="96" fill="rgba(255,255,255,.9)">${String(i + 1).padStart(2, '0')}</text></svg>`);
}
function judgeArt(i, name) {
  const h = (i * 67 + 250) % 360;
  return svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},65%,55%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},70%,30%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="82" r="38" fill="rgba(255,255,255,.85)"/><path d="M30 200c6-48 36-72 70-72s64 24 70 72z" fill="rgba(255,255,255,.85)"/></svg>`);
}
const stageBg = svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><radialGradient id="a" cx=".5" cy=".1" r=".9"><stop offset="0" stop-color="#14532d"/><stop offset=".55" stop-color="#06200f"/><stop offset="1" stop-color="#05040d"/></radialGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(134,239,172,.45)"/><stop offset="1" stop-color="rgba(134,239,172,0)"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#a)"/><path d="M760 0 380 1080h260L960 0z" fill="url(#b)" opacity=".5"/><path d="M1160 0l380 1080h-260L960 0z" fill="url(#b)" opacity=".5"/><path d="M960 0 820 1080h280z" fill="url(#b)" opacity=".7"/><rect y="860" width="1920" height="220" fill="rgba(0,0,0,.35)"/></svg>`);

export function sampleData() {
  const e = {}, j = {}, c = {}, pins = {}, media = { bg: stageBg };
  [['ศูนย์การเรียนรู้ชุมชนริมน้ำ', 'ทีม Riverline'], ['อาคารสำนักงานประหยัดพลังงาน', 'ทีม Zero Watt'],
   ['สถานีไฟฟ้าย่อยต้นแบบ', 'ทีม Grid Form'], ['พาวิลเลียนไม้ไผ่', 'ทีม Bamboo Lab'],
   ['ห้องสมุดลอยฟ้า', 'ทีม Skyshelf'], ['ตลาดชุมชนอัจฉริยะ', 'ทีม Smart Bazaar']]
    .forEach(([name, owner], i) => {
      const id = 'e' + (i + 1);
      e[id] = { name, owner, code: 'A' + String(i + 1).padStart(2, '0'), order: i + 1, photo: 'p_' + id };
      media['p_' + id] = entryArt(i, name);
    });
  ['คุณสมชาย', 'คุณวิภา', 'คุณธนพล', 'คุณกมลวรรณ', 'คุณอรรถพล'].forEach((name, i) => {
    const id = 'j' + (i + 1);
    j[id] = { name, order: i + 1, photo: 'p_' + id }; pins[id] = String(1111 * (i + 1)).slice(0, 4);
    media['p_' + id] = judgeArt(i, name);
  });
  [['ความคิดสร้างสรรค์', 10], ['ความสวยงามของแบบ', 10], ['การใช้งานได้จริง', 10], ['การนำเสนอ', 10]]
    .forEach(([name, max], i) => { c['c' + (i + 1)] = { name, max, order: i + 1 }; });
  return { entries: e, judges: j, criteria: c, pins, media };
}

// ---------- Image upload helper: resize in-browser, return data URL ----------
export function fileToDataURL(file, maxSide = 900, keepAlpha = false, quality = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext('2d');
      if (!keepAlpha) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(keepAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('ไฟล์รูปไม่ถูกต้อง')); };
    img.src = url;
  });
}

// ---------- Background media (image / GIF / video) ----------
export const MAX_BGM_BYTES = 7 * 1024 * 1024;   // per file stored in the database
export function mediaKind(file) {
  const t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(n)) return 'video';
  if (t === 'image/gif' || n.endsWith('.gif')) return 'gif';
  if (t.startsWith('image/')) return 'image';
  return null;
}
export const kindFromUrl = u => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u) ? 'video' : /\.gif(\?|#|$)/i.test(u) ? 'gif' : 'image';
export const fmtBytes = b => b == null ? '' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
export const KIND_LABEL = { image: 'รูป', gif: 'GIF', video: 'วิดีโอ' };
/** Read a file as a data URL without re-encoding (keeps GIF animation / video). */
export const fileToRaw = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
/** Turn a background-media file into {meta, data}. Still images are resized; GIF/video kept as-is. */
export async function prepareBgMedia(file) {
  const kind = mediaKind(file);
  if (!kind) throw new Error('รองรับเฉพาะรูป, GIF, MP4 หรือ WebM');
  if (kind === 'image') { const data = await fileToDataURL(file, 1920, false, 0.85); return { kind, data, size: Math.round(data.length * 0.75), name: file.name }; }
  if (file.size > MAX_BGM_BYTES) throw new Error(`ไฟล์ ${fmtBytes(file.size)} ใหญ่เกิน 7 MB — ย่อไฟล์ หรือใส่ไฟล์ไว้ในโฟลเดอร์ media/ ของเว็บแล้วใช้ "ลิงก์"`);
  return { kind, data: await fileToRaw(file), size: file.size, name: file.name };
}
/** Match an uploaded filename to a team: by code (A01), order number (1 / 01) or exact name. */
export function matchEntry(entries, filename) {
  const base = filename.replace(/\.[^.]+$/, '').trim().toLowerCase();
  return entries.find(e => (e.code || '').toLowerCase() === base)
    || entries.find(e => String(e.order) === String(Number(base)) && /^\d+$/.test(base))
    || entries.find(e => (e.name || '').toLowerCase() === base) || null;
}
