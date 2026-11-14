// Inspiralle — área do paciente: ampliar fotos da evolução
(function () {
  document.querySelectorAll('.flash').forEach((el) => setTimeout(() => el.classList.add('hide'), 6000));
  const lb = document.getElementById('lightbox');
  if (!lb || typeof lb.showModal !== 'function') return;
  const img = lb.querySelector('img');
  const cap = lb.querySelector('.lb-cap');
  document.querySelectorAll('.zoom').forEach((b) => b.addEventListener('click', () => {
    img.src = b.dataset.full;
    img.alt = b.dataset.caption || 'Foto do tratamento';
    cap.textContent = b.dataset.caption || '';
    lb.showModal();
  }));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-close')) lb.close(); });
})();
