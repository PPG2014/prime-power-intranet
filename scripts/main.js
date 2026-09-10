/** จุดเริ่มต้นของแอป — โหลดไฟล์เดียวนี้จาก index.html */
import { startRouter } from './core/router.js';
import { render, startRendering } from './core/render.js';
import { setState } from './core/state.js';
import { currentUser, startLogin, signOut, ALLOWED_DOMAIN } from './services/auth.js';
import { renderLogin, clearLogin } from './components/login-screen.js';
import { CONFIG } from './core/config.js';
import { esc, $ } from './core/dom.js';

/** แสดงหน้าเข้าสู่ระบบ พร้อมข้อความผิดพลาดถ้ามี */
function showLogin(error) {
  renderLogin({
    error,
    onSignIn: async () => {
      try {
        const user = await startLogin();
        if (user) enter(user);            // โหมดข้อมูลตัวอย่าง ไม่ต้องเด้งออกไป
      } catch (err) {
        showLogin(esc(err.message));
      }
    },
  });
}

/** เข้าสู่หน้าเว็บหลักหลังยืนยันตัวตนแล้ว */
function enter(user) {
  clearLogin();
  setState({ user, isAdmin: user.isAdmin }, { silent: true });

  $('#topbar-actions').innerHTML = `
    ${CONFIG.dataSource === 'mock' ? '<span class="mode-tag">โหมดข้อมูลตัวอย่าง</span>' : ''}
    <span class="who">👤 ${esc(user.name)}</span>
    <button id="signout" class="signout-btn">ออกจากระบบ</button>`;
  $('#signout').onclick = () => signOut();

  $('#burger').onclick = function () {
    const open = $('#nav').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  };

  startRendering();
  startRouter(render);
}

async function boot() {
  try {
    const user = await currentUser();
    if (user) enter(user);
    else showLogin();
  } catch (err) {
    console.error(err);
    const denied = /consent|permission|AADSTS65001/i.test(err.message);
    showLogin(denied
      ? `ยังไม่ได้รับอนุมัติสิทธิ์เข้าถึงข้อมูล — ต้องให้ผู้ดูแล Microsoft 365 อนุมัติสิทธิ์ให้ระบบก่อน`
      : esc(err.message));
  }
}

boot();
