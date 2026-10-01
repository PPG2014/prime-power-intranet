import { list } from './services/data.js';
/** จุดเริ่มต้นของแอป — โหลดไฟล์เดียวนี้จาก index.html */
import { startRouter } from './core/router.js';
import { render, startRendering } from './core/render.js';
import { setState } from './core/state.js';
import { currentUser, startLogin, signOut, ALLOWED_DOMAIN } from './services/auth.js';
import { renderLogin, clearLogin } from './components/login-screen.js';
import { showAnnouncements } from './components/announcement-popup.js';
import { CONFIG } from './core/config.js';
import { resolveAdmin } from './utils/admin.js';
import { esc, $ } from './core/dom.js';
import { watchVersion } from './core/version-check.js';
import { startIdleLogout, IDLE_FLAG } from './services/idle-logout.js';

console.info('[Prime Power] build', CONFIG.build);
watchVersion();

/** แสดงหน้าเข้าสู่ระบบ พร้อมข้อความผิดพลาดถ้ามี */
function showLogin(error) {
  renderLogin({
    error,
    onSignIn: async () => {
      try {
        const user = await startLogin();
        if (user) await enter(user);      // โหมดข้อมูลตัวอย่าง ไม่ต้องเด้งออกไป
      } catch (err) {
        console.error(err);
        showLogin(explain(err));
      }
    },
  });
}

/** เข้าสู่หน้าเว็บหลักหลังยืนยันตัวตนแล้ว */
async function enter(user) {
  clearLogin();

  // โหมดข้อมูลตัวอย่างให้เป็นผู้ดูแลเสมอ จะได้ทดสอบหน้าจัดการข้อมูลได้
  const role = CONFIG.dataSource === 'mock'
    ? { isAdmin: true, isHR: true, unconfigured: false }
    : await resolveAdmin(user.email);

  setState({ user, isAdmin: role.isAdmin, isHR: role.isHR, adminUnconfigured: role.unconfigured }, { silent: true });

  $('#topbar-actions').innerHTML = `
    ${CONFIG.dataSource === 'mock' ? '<span class="mode-tag">โหมดข้อมูลตัวอย่าง</span>' : ''}
    ${role.unconfigured ? '<span class="mode-tag">ยังไม่ได้กำหนดผู้ดูแลระบบ</span>' : ''}
    <span class="who">👤 ${esc(user.name)}</span>
    <button id="signout" class="signout-btn">ออกจากระบบ</button>`;
  $('#signout').onclick = () => signOut();

  $('#burger').onclick = function () {
    const open = $('#nav').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  };

  startRendering();
  startRouter(render);
  startIdleLogout();

  // ตัวเลขเตือนบนเมนู: นับทันทีที่เข้าระบบ แล้วนับซ้ำราวทุก 5 นาที เผื่อมีคำขอใหม่ระหว่างเปิดค้าง
  // สุ่มรอบละ 5–6 นาที ไม่ให้ทุกเครื่องในบริษัทดึงข้อมูลพร้อมกันเป๊ะ
  // แท็บที่ซ่อนอยู่ (ไม่ได้ดู) ไม่ดึง — พอกลับมาดูแท็บ ถ้าเลยรอบแล้วค่อยนับใหม่ทันที
  import('./services/badges.js').then((m) => {
    m.refreshBadges({ force: true });
    let lastAt = Date.now();
    const recount = () => {
      lastAt = Date.now();
      import('./services/data.js').then((d) => ['requests', 'appraisals', 'appraisalCycles'].forEach((n) => d.clearDataCache(n)));
      m.refreshBadges({ force: true });
    };
    const tick = () => {
      if (!document.hidden) recount();
      setTimeout(tick, 5 * 60 * 1000 + Math.random() * 60 * 1000);
    };
    setTimeout(tick, 5 * 60 * 1000 + Math.random() * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastAt > 5 * 60 * 1000) recount();
    });
  });

  // ประกาศเด้งขึ้นหลังหน้าแรกวาดเสร็จ เพื่อไม่ให้บังตอนหน้ายังโหลดไม่เสร็จ
  showAnnouncements();

  // โหลดข้อมูลที่ใช้บ่อยรอไว้เบื้องหลัง พอกดเมนูไหนก็ขึ้นได้ทันที
  // เฉพาะรายการที่เกือบทุกหน้าต้องใช้ (คำขอ/เส้นทางอนุมัติ ตัวเลขเตือนโหลดให้แล้ว)
  // นโยบาย คู่มือ ห้องประชุม โหลดตอนเปิดหน้านั้นจริง · หน่วงแบบสุ่ม 2–6 วินาที กระจายภาระช่วงเช้าที่คนเข้าพร้อมกัน
  const warm = () => ['directory', 'formCatalog', 'departments', 'sections']
    .forEach((n) => list(n).catch(() => {}));
  setTimeout(() => (window.requestIdleCallback || ((f) => f()))(warm), 2000 + Math.random() * 4000);
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
    if (user) await enter(user);
    else {
      // กลับมาจากการออกจากระบบอัตโนมัติ บอกเหตุผลบนหน้าเข้าสู่ระบบ
      let idle = false;
      try { idle = sessionStorage.getItem(IDLE_FLAG) === '1'; sessionStorage.removeItem(IDLE_FLAG); } catch (e) { /* ข้าม */ }
      showLogin(idle ? `ออกจากระบบอัตโนมัติ เพราะไม่มีการใช้งานนานเกิน ${Number(CONFIG.idleMinutes) || 60} นาที
        เพื่อความปลอดภัยของข้อมูล · กดเข้าสู่ระบบอีกครั้งเพื่อใช้งานต่อ` : undefined);
    }
  } catch (err) {
    console.error(err);
    showLogin(explain(err));
  }
}

boot();
