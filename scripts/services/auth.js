/**
 * เข้าสู่ระบบด้วยบัญชี Microsoft 365 (MSAL Browser, Authorization Code + PKCE)
 * ไม่มี client secret เพราะเว็บฝั่งหน้าบ้านเก็บความลับไม่ได้
 * ตอน dataSource = 'mock' จะข้ามการล็อกอินทั้งหมด
 */
import { CONFIG } from '../core/config.js';

let msal = null;

export async function signIn() {
  if (CONFIG.dataSource === 'mock') {
    return { name: 'ผู้ใช้ทดสอบ', email: 'demo@primepower.co.th', isAdmin: true };
  }
  // TODO ระยะที่ 1: โหลด @azure/msal-browser แล้วเรียก loginRedirect
  throw new Error('ยังไม่ได้ต่อ MSAL — ดูขั้นตอนที่ 1.1 ในเอกสาร sharepoint-list-schema.md');
}

export async function getToken() {
  if (CONFIG.dataSource === 'mock') return 'mock-token';
  // TODO ระยะที่ 1: acquireTokenSilent แล้ว fallback เป็น acquireTokenRedirect
  throw new Error('ยังไม่ได้ต่อ MSAL');
}

export const signOut = () => msal?.logoutRedirect();
