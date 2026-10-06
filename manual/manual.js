/* คู่มือ: ไฮไลต์หัวข้อที่กำลังอ่าน · เปิด/ปิดสารบัญบนมือถือ · กดรูปเพื่อขยาย · ปุ่มกลับขึ้นบน */
(function () {
  const toc = document.querySelector('.toc');
  const btn = document.querySelector('.toc-btn');
  if (btn && toc) {
    btn.addEventListener('click', () => toc.classList.toggle('open'));
    toc.addEventListener('click', (e) => { if (e.target.closest('a')) toc.classList.remove('open'); });
  }

  // หัวข้อที่อยู่บนจอ → ไฮไลต์ในสารบัญ
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const a = byId.get(en.target.id);
        if (!a) return;
        links.forEach((l) => l.classList.remove('on'));
        a.classList.add('on');
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // กดรูปหน้าจอ → ขยายเต็มจอ · กดอีกครั้งหรือ Esc เพื่อปิด
  const close = () => { const z = document.querySelector('.zoom'); if (z) z.remove(); };
  document.addEventListener('click', (e) => {
    const img = e.target.closest('figure.shot img');
    if (!img) return;
    const z = document.createElement('div');
    z.className = 'zoom';
    z.innerHTML = `<img src="${img.currentSrc || img.src}" alt="">`;
    z.querySelector('img').alt = img.alt;
    z.addEventListener('click', close);
    document.body.appendChild(z);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  const top = document.querySelector('.top-btn');
  if (top) {
    const show = () => { top.hidden = scrollY < 600; };
    addEventListener('scroll', show, { passive: true }); show();
    top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }
})();
