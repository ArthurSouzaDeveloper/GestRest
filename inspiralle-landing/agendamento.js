// Inspiralle — agendamento online integrado ao sistema da clínica.
// Conversa com a API pública (/api/public). Se a landing for hospedada em
// outro domínio, preencha data-api="https://sistema.seudominio.com.br" em #booking.
(function () {
  const root = document.getElementById('booking');
  if (!root) return;

  const API = (root.dataset.api || '').replace(/\/$/, '') + '/api/public';
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const $ = (sel) => root.querySelector(sel);
  // pref = profissional escolhido (ou null = sem preferência); dentist = quem vai atender
  const state = { step: 1, service: null, pref: null, dentist: null, dentists: [], date: null, time: null };

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const longDate = (iso) => { const d = parseDate(iso); return `${['domingo','segunda','terça','quarta','quinta','sexta','sábado'][d.getDay()]}, ${d.getDate()} de ${['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][d.getMonth()]}`; };

  async function api(path, opts) {
    let r;
    try { r = await fetch(API + path, opts); } catch (e) { throw new Error('O agendamento online está indisponível no momento.'); }
    const j = await r.json().catch(() => ({ success: false, error: 'Não foi possível falar com a clínica agora.' }));
    if (!r.ok || !j.success) throw new Error(j.error || 'Erro inesperado.');
    return j.data;
  }

  function go(step) {
    state.step = step;
    root.querySelectorAll('.bk-panel').forEach((p) => p.classList.toggle('on', Number(p.dataset.panel) === step));
    root.querySelectorAll('.bk-steps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('on', n === step);
      li.classList.toggle('done', n < step);
    });
    $('#bkBack').hidden = step === 1 || step === 5;
    $('.bk-steps').hidden = step === 5;
    const top = root.getBoundingClientRect().top + window.scrollY - 100;
    if (Math.abs(window.scrollY - top) > 200) window.scrollTo({ top, behavior: 'smooth' });
  }

  function failBox(el, err) {
    el.innerHTML = `<p class="bk-loading">${esc(err.message)} <a href="https://wa.me/5519999393772" target="_blank" rel="noopener">Agende pelo WhatsApp</a>.</p>`;
  }

  // 1. Serviços
  async function loadServices() {
    const box = $('#bkServices');
    try {
      const list = await api('/servicos');
      box.innerHTML = list.map((s) => `
        <button type="button" class="bk-opt" data-id="${s.id}">
          <strong>${esc(s.nome)}</strong>
          <span>${esc(s.descricao || '')}</span>
          <em>${s.duracao} min</em>
        </button>`).join('');
      box.querySelectorAll('.bk-opt').forEach((b) => b.addEventListener('click', () => {
        state.service = list.find((s) => s.id === Number(b.dataset.id));
        loadDentists();
      }));
    } catch (e) { failBox(box, e); }
  }

  // 2. Profissionais
  async function loadDentists() {
    const box = $('#bkDentists');
    box.innerHTML = '<p class="bk-loading">Carregando…</p>';
    go(2);
    try {
      const list = await api(`/dentistas?servico=${state.service.id}`);
      state.dentists = list;
      const any = list.length > 1 ? `<button type="button" class="bk-opt bk-any" data-id=""><strong>Sem preferência</strong><span>Mostrar o primeiro horário livre com qualquer profissional</span></button>` : '';
      box.innerHTML = any + list.map((d) => `
        <button type="button" class="bk-opt" data-id="${d.id}">
          <i class="bk-avatar" style="--c:${esc(d.cor)}">${esc(d.nome.replace(/^Dra?\.\s*/, '').charAt(0))}</i>
          <strong>${esc(d.nome)}</strong>
          <span>${esc(d.especialidade || '')}</span>
        </button>`).join('');
      box.querySelectorAll('.bk-opt').forEach((b) => b.addEventListener('click', () => {
        state.pref = b.dataset.id ? list.find((d) => d.id === Number(b.dataset.id)) : null;
        loadDays();
      }));
    } catch (e) { failBox(box, e); }
  }

  // 3. Dias e horários
  async function loadDays() {
    const box = $('#bkDays');
    box.innerHTML = '<p class="bk-loading">Buscando dias disponíveis…</p>';
    $('#bkTimes').innerHTML = '';
    $('#bkTimesTitle').hidden = true;
    go(3);
    try {
      const q = `servico=${state.service.id}` + (state.pref ? `&dentista=${state.pref.id}` : '');
      const days = await api(`/dias?${q}`);
      if (!days.length) { box.innerHTML = '<p class="bk-loading">Sem horários livres nos próximos dias. Fale com a gente pelo WhatsApp.</p>'; return; }
      box.innerHTML = days.map((d) => {
        const dt = parseDate(d.data);
        return `<button type="button" class="bk-day" data-d="${d.data}"><small>${WD[dt.getDay()]}</small><strong>${dt.getDate()}</strong><small>${MO[dt.getMonth()]}</small></button>`;
      }).join('');
      box.querySelectorAll('.bk-day').forEach((b) => b.addEventListener('click', () => {
        box.querySelectorAll('.bk-day').forEach((x) => x.classList.toggle('on', x === b));
        loadTimes(b.dataset.d);
      }));
      box.querySelector('.bk-day').click();
    } catch (e) { failBox(box, e); }
  }

  async function loadTimes(date) {
    state.date = date;
    const box = $('#bkTimes');
    $('#bkTimesTitle').hidden = false;
    $('#bkTimesTitle').textContent = 'Horários disponíveis · ' + longDate(date);
    box.innerHTML = '<p class="bk-loading">Carregando horários…</p>';
    try {
      const q = `servico=${state.service.id}&data=${date}` + (state.pref ? `&dentista=${state.pref.id}` : '');
      const list = await api(`/horarios?${q}`);
      box.innerHTML = list.map((t) => `<button type="button" class="bk-time" data-h="${t.hora}" data-den="${t.dentistas[0]}">${t.hora}</button>`).join('')
        || '<p class="bk-loading">Sem horários neste dia.</p>';
      box.querySelectorAll('.bk-time').forEach((b) => b.addEventListener('click', () => {
        state.time = b.dataset.h;
        state.dentist = state.pref || state.dentists.find((d) => d.id === Number(b.dataset.den));
        showForm();
      }));
    } catch (e) { failBox(box, e); }
  }

  // 4. Dados do paciente
  function showForm() {
    $('#bkSummary').innerHTML = `
      <div><small>Tratamento</small><strong>${esc(state.service.nome)}</strong></div>
      <div><small>Profissional</small><strong>${esc(state.dentist.nome)}</strong></div>
      <div><small>Quando</small><strong>${esc(longDate(state.date))} às ${esc(state.time)}</strong></div>`;
    $('#bkError').hidden = true;
    go(4);
  }

  const form = $('#bkForm');
  const tel = form.elements.telefone;
  tel.addEventListener('input', () => {
    const d = tel.value.replace(/\D/g, '').slice(0, 11);
    tel.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('#bkError');
    const f = form.elements;
    const msg = f.nome.value.trim().split(/\s+/).length < 2 ? 'Informe seu nome e sobrenome.'
      : ![10, 11].includes(f.telefone.value.replace(/\D/g, '').length) ? 'Informe um WhatsApp válido com DDD.'
      : !f.aceite.checked ? 'Marque a autorização de uso dos dados para continuar.' : '';
    if (msg) { err.textContent = msg; err.hidden = false; return; }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Agendando…';
    try {
      const data = await api('/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servico: state.service.id, dentista: state.dentist.id, data: state.date, hora: state.time,
          nome: f.nome.value, telefone: f.telefone.value, email: f.email.value,
          observacoes: f.observacoes.value, aceite: f.aceite.checked, website: f.website.value,
        }),
      });
      $('#bkCode').textContent = data.codigo;
      $('#bkDoneText').innerHTML = `${esc(data.servico)} com <strong>${esc(data.dentista)}</strong><br>${esc(longDate(state.date))} às <strong>${esc(state.time)}</strong>`;
      const txt = `Olá! Acabei de agendar pelo site: ${data.servico} com ${data.dentista}, ${longDate(state.date)} às ${state.time}. Código ${data.codigo}.`;
      $('#bkWhats').href = `https://wa.me/${data.whatsapp}?text=${encodeURIComponent(txt)}`;
      form.reset();
      go(5);
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      if (/ocupado/.test(e.message)) setTimeout(() => loadDays(), 1500);
    } finally {
      btn.disabled = false; btn.textContent = 'Confirmar agendamento';
    }
  });

  $('#bkBack').addEventListener('click', () => {
    if (state.step === 4) { go(3); return; }
    if (state.step === 3) { go(2); return; }
    go(1);
  });
  $('#bkRestart').addEventListener('click', () => { Object.assign(state, { service: null, pref: null, dentist: null, date: null, time: null }); go(1); });

  loadServices();
})();
