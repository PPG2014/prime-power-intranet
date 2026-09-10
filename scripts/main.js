/** จุดเริ่มต้นของแอป — โหลดไฟล์เดียวนี้จาก index.html */
import { startRouter } from './core/router.js';
import { render, startRendering } from './core/render.js';
import { setState } from './core/state.js';
import { currentUser, startLogin, signOut, ALLOWED_DOMAIN } from './services/auth.js';
import { renderLogin, clearLogin } from './components/login-screen.js';
import { showAnnouncements } from './components/announcement-popup.js';
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
        console.error(err);
        showLogin(explain(err));
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

  // ประกาศเด้งขึ้นหลังหน้าแรกวาดเสร็จ เพื่อไม่ให้บังตอนหน้ายังโหลดไม่เสร็จ
  showAnnouncements();
}

/** แปลรหัสผิดพลาดของไมโครซอฟท์เป็นข้อความที่บอกได้ว่าต้องทำอะไรต่อ */
function explain(err) {
  const msg = String(err && (err.errorCode || err.message) || err);

  if (/AADSTS50011|redirect_uri/i.test(msg))
    return `URL ที่เด้งกลับไม่ตรงกับที่ลงทะเบียนไว้ใน Entra ID<br>
            ต้องเพิ่ม <b>${location.origin + location.pathname.replace(/[^/]*$/, '')}</b>
            ไว้ในหน้า Authentication แบบ Single-page application`;

  if (/AADSTS65001|consent_required|interaction_required/i.test(msg))
    return `ยังไม่ได้รับอนุมัติสิทธิ์เข้าถึงข้อมูล — ต้องให้ผู้ดูแล Microsoft 365 ขององค์กรอนุมัติสิทธิ์ให้ระบบก่อน
            จึงจะใช้งานได้`;

  if (/access_denied/i.test(msg))
    return `การเข้าสู่ระบบถูกปฏิเสธ เป็นได้สองกรณี<br>
            <b>1.</b> กดยกเลิกในหน้าขออนุญาตของไมโครซอฟท์ — ลองกดปุ่มด้านล่างอีกครั้งแล้วกดยอมรับ<br>
            <b>2.</b> องค์กรกำหนดให้ผู้ดูแลเป็นผู้อนุมัติเท่านั้น — ต้องส่งเรื่องให้ฝ่ายไอที`;

  if (/AADSTS50020|AADSTS50105|user_not_in/i.test(msg))
    return `บัญชีนี้ไม่มีสิทธิ์เข้าใช้ระบบ ต้องใช้บัญชีอีเมลของบริษัทที่ลงท้ายด้วย @primepower.co.th`;

  if (/msal-browser|โหลดไลบรารี/i.test(msg))
    return `โหลดไลบรารีเข้าสู่ระบบไม่สำเร็จ — ตรวจว่าไฟล์ assets/vendor/msal-browser.min.js
            อัปโหลดขึ้นเซิร์ฟเวอร์ครบแล้ว`;

  return esc(msg);
}

async function boot() {
  try {
    const user = await currentUser();
    if (user) enter(user);
    else showLogin();
  } catch (err) {
    console.error(err);
    showLogin(explain(err));
  }
}

boot();
