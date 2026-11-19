// โหวตขวัญใจ: พนักงานที่ล็อกอินเว็บภายในโหวตได้คนละ 1 สิทธิ์ (เปลี่ยนไม่ได้)
// สิทธิ์ผูกกับรหัสแทนอีเมล (js/intranet.js emailKey) · ผู้ดูแลเปิด/ปิดโหวตที่ ควบคุมการประกวด
// อ่านข้อมูลครั้งเดียวแล้วตัดการเชื่อมต่อ ไม่กินโควตาการเชื่อมต่อพร้อมกันของ Firebase
import { $, $$, esc, boot, list, initials, toast, vibrate } from './common.js';
import { myKey, backLink, titleOf } from './intranet.js';

const app = $('#app');
const store = await boot();
const key = await myKey();
let ev = {}, entries = [], photos = {}, mine = null, pick = null, busy = false;

async function load() {
  const [event, ents, vote] = await Promise.all([store.once('event'), store.once('entries'), key ? store.once('votes/' + key) : null]);
  ev = event || {};
  entries = list(ents);
  mine = vote;
  // รูปทีมทีละรูป (ไม่โหลด media ทั้งก้อน ซึ่งมีพื้นหลัง/คลิปขนาดใหญ่)
  const refs = entries.map((e) => e.photo).filter((r) => r && !/^(https?:|data:)/.test(r));
  const got = await Promise.all(refs.map((r) => store.once('media/' + r).catch(() => null)));
  refs.forEach((r, i) => { photos[r] = got[i] || ''; });
  store.disconnect();
}
const src = (ref) => (!ref ? '' : /^(https?:|data:)/.test(ref) ? ref : photos[ref] || '');
const pic = (e, cls = '') => { const s = src(e.photo); return s ? `<img class="${cls}" src="${esc(s)}" alt="">` : `<span class="v-ini ${cls}">${esc(initials(e.name))}</span>`; };

function render() {
  const head = `<div class="v-head">${backLink()}<h1 class="j-title">❤️ โหวตขวัญใจ</h1>
    <p class="muted">${esc(titleOf(ev))}</p></div>`;
  if (!key) { app.innerHTML = head + '<div class="notice">ไม่พบบัญชีผู้ใช้ — เปิดหน้านี้จากแถบประกวดในเว็บภายใน</div>'; return; }
  if (mine) {
    const e = entries.find((x) => x.id === mine.e);
    app.innerHTML = `${head}<div class="v-done card">
      <div class="v-big">✓</div><h2>โหวตเรียบร้อยแล้ว</h2>
      ${e ? `<div class="v-pickd">${pic(e, 'v-th')}<div><b>${esc((e.code ? e.code + ' · ' : '') + e.name)}</b><div class="muted">${esc(e.owner || '')}</div></div></div>` : ''}
      <p class="muted">1 คนโหวตได้ 1 สิทธิ์ · ขอบคุณที่ร่วมสนุก</p></div>`;
    return;
  }
  if (!ev.voteOpen) {
    app.innerHTML = `${head}<div class="v-done card"><div class="v-big">⏳</div><h2>ยังไม่เปิดโหวต</h2>
      <p class="muted">รอผู้จัดประกาศเปิดโหวต แล้วกดปุ่มด้านล่างเพื่อตรวจอีกครั้ง</p>
      <button class="btn btn-primary" id="again">↻ ตรวจอีกครั้ง</button></div>`;
    $('#again').onclick = () => location.reload();
    return;
  }
  app.innerHTML = `${head}
    <p class="v-hint">แตะเลือกทีมที่ชอบที่สุด <b>1 ทีม</b> แล้วกดยืนยัน · โหวตแล้วเปลี่ยนไม่ได้</p>
    <div class="v-grid">${entries.map((e) => `<button class="v-card${pick === e.id ? ' on' : ''}" data-e="${e.id}">
      ${pic(e, 'v-img')}<div class="v-nm"><b>${esc((e.code ? e.code + ' · ' : '') + e.name)}</b><small>${esc(e.owner || '')}</small></div>
      <span class="v-check">❤</span></button>`).join('') || '<p class="muted">ยังไม่มีทีม</p>'}</div>
    <div class="v-bar"><button class="btn btn-primary btn-lg btn-block" id="send" ${pick ? '' : 'disabled'}>${pick
      ? `ยืนยันโหวต ${esc(entries.find((x) => x.id === pick)?.name || '')}` : 'เลือกทีมก่อน'}</button></div>`;
  $$('.v-card').forEach((b) => b.onclick = () => { pick = b.dataset.e; vibrate(8); render(); });
  $('#send').onclick = send;
}

async function send() {
  if (!pick || busy) return;
  const e = entries.find((x) => x.id === pick);
  if (!confirm(`ยืนยันโหวตให้ "${e?.name || ''}" ?\nโหวตแล้วเปลี่ยนไม่ได้`)) return;
  busy = true;
  try {
    await store.castVote(key, pick);
    mine = { e: pick };
    vibrate(30); toast('โหวตเรียบร้อย ขอบคุณครับ', 'ok');
  } catch (err) {
    console.warn(err);
    // ปิดโหวตไปแล้ว หรือเคยโหวตจากเครื่องอื่น → อ่านสถานะล่าสุดมาแสดง
    toast(/already/.test(err.message) ? 'คุณโหวตไปแล้ว' : 'โหวตไม่สำเร็จ — ผู้จัดอาจปิดโหวตแล้ว', 'err');
    location.reload();
    return;
  } finally { busy = false; }
  render();
}

await load();
render();
