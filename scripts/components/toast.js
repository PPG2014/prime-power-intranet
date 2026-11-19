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

/** ข้อความแจ้งที่มีลิงก์ได้ (html ต้อง escape มาแล้ว) · ค้างนานกว่า · กด ✕ หรือกดลิงก์เพื่อปิด */
export function toastHtml(html, kind = 'warn', ms = 20000) {
  toast('', kind);
  const box = document.getElementById('toast-box');
  const t = box.lastElementChild;
  t.onclick = null;
  t.classList.add('toast-rich');
  t.innerHTML = `<button type="button" class="toast-x" aria-label="ปิด">✕</button><div>${html}</div>`;
  t.querySelector('.toast-x').onclick = () => t.remove();
  t.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => t.remove()));
  setTimeout(() => t.remove(), ms);
}
