/** ข้อความแจ้งสั้น ๆ มุมล่างของจอ หายเองใน 6 วินาที (แบบ 'bad' 10 วินาที) · กดเพื่อปิด */
export function toast(text, kind = 'ok') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = text;
  t.onclick = () => t.remove();
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 10000 : 6000);
}
