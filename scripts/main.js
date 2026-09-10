/** จุดเริ่มต้นของแอป — โหลดไฟล์เดียวนี้จาก index.html */
import { startRouter } from './core/router.js';
import { render, startRendering } from './core/render.js';
import { setState } from './core/state.js';
import { signIn } from './services/auth.js';
import { $ } from './core/dom.js';

async function boot() {
  try {
    const user = await signIn();
    setState({ user, isAdmin: user.isAdmin }, { silent: true });
    $('#topbar-actions').innerHTML = `<span>👤 ${user.name}</span>`;
  } catch (err) {
    console.warn('ยังไม่ได้เข้าสู่ระบบ:', err.message);
  }

  $('#burger').onclick = function () {
    const open = $('#nav').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  };

  startRendering();
  startRouter(render);
}

boot();
