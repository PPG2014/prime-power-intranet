/**
 * เรียก Microsoft Graph แบบสุภาพ — ใช้แทน fetch ตรง ๆ ทุกที่ที่คุยกับ SharePoint
 *
 * 1) จำกัดจำนวนคำขอที่วิ่งพร้อมกันต่อเครื่อง (MAX_PARALLEL)
 *    ตอนเข้าระบบเว็บโหลดข้อมูลหลายรายการพร้อมกัน ถ้าปล่อยยิงหมด 300 เครื่องพร้อมกันตอนเช้า
 *    จะชนเพดานของ SharePoint เร็วขึ้น การต่อคิวในเครื่องทำให้ภาระเกลี่ยออกไปเอง
 *
 * 2) เจอ 429 (ขอถี่เกิน) หรือ 503 (เซิร์ฟเวอร์ไม่ว่าง) → รอตามที่ SharePoint บอก (Retry-After) แล้วลองใหม่
 *    ไม่มี Retry-After ใช้รอแบบทวีคูณ 1, 2, 4, 8 วินาที + สุ่มเพิ่มเล็กน้อย เพื่อไม่ให้ทุกเครื่องกลับมายิงพร้อมกัน
 *    ผู้ใช้จะเห็นแค่ "ช้าลงนิดหน่อย" แทนข้อความ error
 *    504 / เน็ตหลุด ลองใหม่เฉพาะการอ่าน (GET) — การเขียนอาจสำเร็จไปแล้ว ส่งซ้ำจะได้ข้อมูลซ้ำ
 */
const MAX_PARALLEL = 6;
const MAX_TRIES = 5;
const MAX_WAIT = 30000;

let running = 0;
const queue = [];

function acquire() {
  if (running < MAX_PARALLEL) { running += 1; return Promise.resolve(); }
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  const next = queue.shift();
  if (next) next(); else running -= 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** เวลาที่ต้องรอ (ms) — ใช้ Retry-After ถ้ามี */
function waitFor(res, attempt) {
  const ra = res && res.headers && res.headers.get('Retry-After');
  const sec = ra != null ? Number(ra) : NaN;
  const base = !isNaN(sec) ? sec * 1000 : 1000 * 2 ** (attempt - 1);
  return Math.min(MAX_WAIT, base + Math.random() * 1000);
}

/**
 * fetch ที่ต่อคิว + ลองใหม่อัตโนมัติ · คืน Response เหมือน fetch ปกติ
 * init.body ต้องเป็นค่าที่ส่งซ้ำได้ (string, Blob, File) — ไม่ใช่ stream
 */
export async function graphFetch(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  for (let attempt = 1; ; attempt += 1) {
    await acquire();
    let res = null;
    let netErr = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      netErr = e;
    } finally {
      release();
    }
    const last = attempt >= MAX_TRIES;
    if (netErr) {
      if (!isRead || last) throw netErr;
      await sleep(waitFor(null, attempt));
      continue;
    }
    const retryable = res.status === 429 || res.status === 503 || (isRead && res.status === 504);
    if (!retryable || last) return res;
    await sleep(waitFor(res, attempt));
  }
}
