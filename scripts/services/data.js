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

export const list   = (name)          => src().list(name);
export const get    = (name, id)      => src().get(name, id);
export const create = (name, item)    => src().create(name, item);
export const update = (name, id, item)=> src().update(name, id, item);
export const remove = (name, id)      => src().remove(name, id);
