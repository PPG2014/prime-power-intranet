/** ที่เก็บสถานะกลาง — หน้าไหนแก้ค่าก็เรียก setState แล้วระบบจะวาดใหม่ให้ */
const listeners = new Set();

export const state = {
  route: 'home',
  params: {},
  user: null,        // { name, email, isAdmin }
  isAdmin: false,
  overlay: null,     // { type:'form'|'reader'|'popup', ... }
};

export function setState(patch, { silent = false } = {}) {
  Object.assign(state, patch);
  if (!silent) listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
