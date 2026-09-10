/**
 * เราเตอร์แบบ hash (#/route/param)
 * ใช้ hash เพราะ GitHub Pages ไม่มีเซิร์ฟเวอร์คอยส่งกลับมาที่ index.html
 * ถ้าใช้ path ปกติ พอผู้ใช้กด refresh กลางทางจะเจอ 404
 */
import { setState } from './state.js';

export function parseHash(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { route: parts[0] || 'home', params: { id: parts[1] || null } };
}

export function go(route, id) {
  location.hash = '#/' + route + (id ? '/' + id : '');
}

export function startRouter(onChange) {
  const apply = () => {
    const { route, params } = parseHash();
    setState({ route, params, overlay: null }, { silent: true });
    onChange();
  };
  addEventListener('hashchange', apply);
  apply();
}
