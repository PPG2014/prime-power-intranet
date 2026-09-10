/**
 * เข้าสู่ระบบด้วยบัญชี Microsoft 365
 * ใช้ MSAL Browser แบบ Authorization Code + PKCE ซึ่งไม่ต้องมี client secret
 * เหมาะกับเว็บที่ทำงานบนเบราว์เซอร์ล้วนและโฮสต์บน GitHub Pages
 *
 * ตอน dataSource = 'mock' จะข้ามการล็อกอินทั้งหมด พัฒนาได้โดยไม่ต้องต่อของจริง
 */
import { CONFIG } from '../core/config.js';

/**
 * ไฟล์ MSAL เก็บไว้ในโปรเจกต์เอง ไม่ดึงจาก CDN
 * เพราะเครือข่ายองค์กรหลายแห่งบล็อก CDN ภายนอก และเพื่อให้เวอร์ชันนิ่ง
 * อัปเดตด้วย: npm pack @azure/msal-browser แล้วคัดลอก lib/msal-browser.min.js มาทับ
 */
const MSAL_SRC = 'assets/vendor/msal-browser.min.js';

let msal = null;
let account = null;

/** โหลด MSAL เมื่อถึงเวลาใช้จริงเท่านั้น */
async function loadMsal() {
  if (window.msal) return window.msal;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MSAL_SRC;
    s.onload = resolve;
    s.onerror = () => reject(new Error(
      'โหลดไลบรารีเข้าสู่ระบบไม่สำเร็จ — ตรวจว่าไฟล์ assets/vendor/msal-browser.min.js อัปโหลดขึ้นเซิร์ฟเวอร์แล้ว'));
    document.head.appendChild(s);
  });
  if (!window.msal) throw new Error('ไลบรารีเข้าสู่ระบบโหลดแล้วแต่เรียกใช้ไม่ได้');
  return window.msal;
}

async function client() {
  if (msal) return msal;
  const lib = await loadMsal();
  msal = new lib.PublicClientApplication({
    auth: {
      clientId: CONFIG.auth.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.auth.tenantId}`,
      redirectUri: CONFIG.auth.redirectUri,
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  });
  await msal.initialize();
  await msal.handleRedirectPromise();   // รับผลกลับมาหลังเด้งไปล็อกอิน
  return msal;
}

/**
 * คืนข้อมูลผู้ใช้ที่ล็อกอินอยู่
 * ถ้ายังไม่ได้ล็อกอิน จะพาไปหน้าล็อกอินของ Microsoft แล้วเด้งกลับมา
 */
/** โดเมนที่อนุญาตให้ใช้ระบบ */
export const ALLOWED_DOMAIN = 'primepower.co.th';

/**
 * ตรวจว่ามีบัญชีที่ล็อกอินค้างอยู่หรือไม่ โดยไม่พาไปหน้าล็อกอิน
 * คืน null ถ้ายังไม่ได้ล็อกอิน เพื่อให้หน้าเว็บแสดงหน้าเข้าสู่ระบบก่อน
 */
export async function currentUser() {
  if (CONFIG.dataSource === 'mock') return null;

  const app = await client();
  const found = app.getAllAccounts();
  if (!found.length) return null;

  account = found[0];
  app.setActiveAccount(account);

  const email = (account.username || '').toLowerCase();
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    await app.logoutRedirect({ postLogoutRedirectUri: CONFIG.auth.redirectUri });
    return null;
  }

  return { name: account.name || account.username, email, isAdmin: false, account };
}

/** พาไปหน้าเข้าสู่ระบบของ Microsoft — เรียกเมื่อผู้ใช้กดปุ่มเท่านั้น */
export async function startLogin() {
  if (CONFIG.dataSource === 'mock') {
    return { name: 'ผู้ใช้ทดสอบ', email: 'demo@primepower.co.th', isAdmin: true };
  }
  const app = await client();
  await app.loginRedirect({
    scopes: CONFIG.auth.scopes,
    prompt: 'select_account',
    /** ช่วยข้ามหน้าเลือกประเภทบัญชี ไปที่หน้าล็อกอินขององค์กรเลย */
    domainHint: ALLOWED_DOMAIN,
  });
  return null;
}

/** ขอ token สำหรับเรียก Graph — ต่ออายุเองอัตโนมัติ */
export async function getToken() {
  if (CONFIG.dataSource === 'mock') return 'mock-token';

  const app = await client();
  const acct = app.getActiveAccount() || app.getAllAccounts()[0];
  if (!acct) throw new Error('ยังไม่ได้เข้าสู่ระบบ');

  try {
    const res = await app.acquireTokenSilent({ scopes: CONFIG.auth.scopes, account: acct });
    return res.accessToken;
  } catch (err) {
    // token หมดอายุหรือยังไม่เคยยินยอมสิทธิ์ ต้องให้ผู้ใช้กดยืนยัน
    await app.acquireTokenRedirect({ scopes: CONFIG.auth.scopes, account: acct });
    return null;
  }
}

export async function signOut() {
  if (CONFIG.dataSource === 'mock') {
    location.reload();   // โหมดตัวอย่างไม่มีเซสชันจริง แค่กลับไปหน้าเข้าสู่ระบบ
    return;
  }
  const app = await client();
  await app.logoutRedirect({ postLogoutRedirectUri: CONFIG.auth.redirectUri });
}
