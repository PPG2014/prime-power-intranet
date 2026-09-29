/** คัดลอกข้อความลงคลิปบอร์ด — ใช้ API ใหม่ก่อน ถ้าเบราว์เซอร์ไม่ยอมค่อยใช้วิธีเดิม */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

/**
 * ปุ่มคัดลอก (ใช้คู่กับ bindCopyButtons) — <button data-copy="ข้อความ">
 * label ว่าง = ปุ่มไอคอนอย่างเดียว (ใช้ในการ์ดที่แคบ)
 * กดแล้วเปลี่ยนเป็น "คัดลอกแล้ว ✓" ชั่วครู่
 */
export const copyButton = (text, label = 'คัดลอก') =>
  `<button type="button" class="copy-btn" data-copy="${String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
    title="คัดลอก ${String(text).replace(/"/g, '&quot;')}" aria-label="คัดลอก">⧉${label ? ` ${label}` : ''}</button>`;

export function bindCopyButtons(root = document) {
  root.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();          // อยู่ในการ์ดที่กดเปิดหน้าต่างได้ อย่าให้เปิดหน้าต่างซ้อน
      const ok = await copyText(b.dataset.copy);
      const old = b.dataset.label || b.innerHTML;
      b.dataset.label = old;
      if (!b.dataset.short) b.dataset.short = b.textContent.trim() === '⧉' ? '1' : '0';
      const short = b.dataset.short === '1';
      b.innerHTML = ok ? (short ? '✓' : '✓ คัดลอกแล้ว') : (short ? '✕' : 'คัดลอกไม่ได้');
      b.classList.toggle('done', ok);
      clearTimeout(b._t);
      b._t = setTimeout(() => { b.innerHTML = old; b.classList.remove('done'); }, 1500);
    };
  });
}
