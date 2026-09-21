/**
 * ชั้นกลางระหว่างหน้าเว็บกับแหล่งข้อมูล
 * หน้าเว็บเรียกผ่านที่นี่เท่านั้น ห้ามเรียก Graph ตรงจากหน้า
 * ตอนพัฒนาอ่านจาก data/mock พอขึ้นจริงสลับ CONFIG.dataSource เป็น 'sharepoint'
 * โดยไม่ต้องแก้โค้ดหน้าเว็บแม้แต่บรรทัดเดียว
 */
import { CONFIG } from '../core/config.js';
import * as mock from './source.mock.js';
import * as spo from './source.sharepoint.js';

const src = () => (CONFIG.dataSource === 'sharepoint' ? spo : mock);

/**
 * แคชผลการอ่านรายการไว้ชั่วคราว
 * เดิมทุกครั้งที่เปลี่ยนหน้าจะยิงขอข้อมูลใหม่หมด ทำให้กดแล้วรู้สึกหน่วง
 * เก็บเป็น Promise จึงรวมคำขอที่เกิดพร้อมกันให้เหลือครั้งเดียวด้วย
 * ทุกครั้งที่มีการเขียนข้อมูล แคชของชุดนั้นจะถูกล้างทันที ข้อมูลจึงไม่ค้าง
 */
const TTL = 60000;            // อายุแคช 60 วินาที
const cache = new Map();      // name → { at, p }

export function clearDataCache(name) {
  if (name) cache.delete(name); else cache.clear();
}

export function list(name) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL) return hit.p;

  const p = src().list(name).catch((err) => {
    cache.delete(name);       // อ่านไม่สำเร็จ อย่าจำค่าเสียไว้
    throw err;
  });
  cache.set(name, { at: Date.now(), p });
  return p;
}

/** ล้างแคชของชุดที่เพิ่งเขียน (และชุดอ้างอิงที่อาจเปลี่ยนตาม) */
const afterWrite = (name, res) => { clearDataCache(name); return res; };

export const get    = (name, id)      => src().get(name, id);
export const create = async (name, item)     => afterWrite(name, await src().create(name, item));
export const update = async (name, id, item) => afterWrite(name, await src().update(name, id, item));
export const remove = async (name, id)       => afterWrite(name, await src().remove(name, id));
/** โครงสร้างคอลัมน์จริงของ List — คืน null ถ้าแหล่งข้อมูลไม่รองรับ */
export const schemaOf = (name) => (src().schemaOf ? src().schemaOf(name) : Promise.resolve(null));
