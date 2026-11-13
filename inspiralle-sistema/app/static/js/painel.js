// Inspiralle — interações do painel
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js', { scope: '/static/' }).catch(() => {});
  }

  // Some com as mensagens depois de alguns segundos
  document.querySelectorAll('.flash').forEach((el) => setTimeout(() => el.classList.add('hide'), 5000));

  // Botões de formulário com estado de carregamento
  document.querySelectorAll('form').forEach((f) => f.addEventListener('submit', () => {
    const b = f.querySelector('button[type=submit], button:not([type])');
    if (b) { b.disabled = true; b.classList.add('loading'); }
  }));

  // Formulário de consulta: sugere horários livres
  const box = document.getElementById('slotSuggest');
  if (box) {
    const sel = (id) => document.getElementById(id);
    const load = async () => {
      const params = new URLSearchParams({ servico: sel('servicoSel').value, dentista: sel('dentistaSel').value, data: sel('dataInp').value });
      box.innerHTML = '<span class="muted small">Buscando horários livres…</span>';
      try {
        const r = await fetch(box.dataset.url + '?' + params);
        const j = await r.json();
        if (!j.data.length) { box.innerHTML = '<span class="muted small">Sem horários livres neste dia para este profissional.</span>'; return; }
        box.innerHTML = '<span class="muted small">Horários livres:</span>' + j.data.map((h) => `<button type="button" class="chip" data-h="${h}">${h}</button>`).join('');
        box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
          sel('horaInp').value = c.dataset.h;
          box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
        }));
      } catch (e) { box.innerHTML = ''; }
    };
    ['servicoSel', 'dentistaSel', 'dataInp'].forEach((id) => sel(id).addEventListener('change', load));
    load();
  }
})();
