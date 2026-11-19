// หน้าเลือกบทบาท (แสดงในแถบประกวดของเว็บภายใน)
// อ่านข้อมูลครั้งเดียวแล้วตัดการเชื่อมต่อ — พนักงานทุกคนเปิดหน้านี้ได้โดยไม่กินโควตาการเชื่อมต่อของ Firebase
import { $, esc, boot, list, statusPill } from './common.js';
import { intranet, myKey, titleOf } from './intranet.js';

const app = $('#app');
const store = await boot();
const [event, judges, me] = await Promise.all([store.once('event'), store.once('judges'), myKey()]);
store.disconnect();

const ev = event || {};
const myJudge = list(judges).find((j) => j.ek && j.ek === me);
const manager = !!intranet.manager;
const withKhun = (n) => (/^(คุณ|นาย|นาง|ดร\.|อ\.)/.test(String(n || '')) ? n : 'คุณ' + (n || ''));
const title = titleOf(ev);

const card = ({ href, c, ico, h, p, blank, extra = '' }) => `<a class="role" href="${href}"${blank ? ' target="_blank" rel="noopener"' : ''} style="--c:${c}">
  <span class="go">${blank ? '↗' : '→'}</span><div class="ico">${ico}</div><h2>${h}</h2><p>${p}</p>${extra}</a>`;

const cards = [];
if (myJudge) cards.push(card({ href: 'judge.html', c: '#22c55e', ico: '📱', h: 'กรรมการ',
  p: `${esc(withKhun(myJudge.name))} · ให้คะแนนทีละเกณฑ์แล้วกดยืนยัน (ใส่ PIN ครั้งแรกครั้งเดียวต่อเครื่อง)` }));
cards.push(card({ href: 'vote.html', c: '#f43f5e', ico: '❤️', h: 'โหวตขวัญใจ',
  p: 'พนักงานทุกคนโหวตได้ 1 สิทธิ์ เลือกทีมที่ชอบที่สุด',
  extra: `<div style="margin-top:12px">${ev.voteOpen ? '<span class="pill ok live"><span class="dot"></span>เปิดโหวตอยู่</span>' : '<span class="pill off"><span class="dot"></span>ยังไม่เปิดโหวต</span>'}</div>` }));
if (manager) {
  cards.push(card({ href: 'display.html', c: '#22d3ee', ico: '🖥', h: 'จอแสดงผล', blank: true,
    p: 'เปิดบนเครื่องที่ต่อโปรเจกเตอร์ แล้วกด F เต็มจอ · แถบคะแนน อันดับสด ประกาศผล' }));
  cards.push(card({ href: 'admin.html', c: '#f6c453', ico: '⚙', h: 'ควบคุมการประกวด', blank: true,
    p: 'ทีม กรรมการ เกณฑ์ ทีมถัดไป ล็อกคะแนน เปิด/ปิดโหวต' }));
}

app.innerHTML = `
  <span class="eyebrow">${statusPill(ev.status)} ${ev.round ? esc(ev.round) : ''}</span>
  <h1>${esc(title)}</h1>
  <p class="lead">สวัสดี${esc(withKhun(intranet.name))} · เลือกสิ่งที่ต้องการทำ</p>
  <div class="role-grid">${cards.join('')}</div>
  ${store.mode === 'demo' ? '<p class="dim" style="margin-top:28px">โหมดทดลอง: ยังไม่ได้วางค่า Firebase ที่หน้าจัดการข้อมูล → 🧩 ฟังก์ชันเสริม ข้อมูลจึงอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น</p>' : ''}`;
