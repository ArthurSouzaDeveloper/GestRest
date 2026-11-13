# Inspiralle · Agendamento online + Controle de pacientes

Sistema da clínica Inspiralle Odontologia, ligado à landing page
(`../inspiralle-landing`). **Um banco só** guarda serviços, profissionais,
pacientes, consultas e prontuário: o paciente agenda pelo site e a consulta
aparece na hora na agenda do painel, já com a ficha do paciente criada.

## Rodar a demonstração (2 minutos)

```bash
cd inspiralle-sistema
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask --app run init-db      # cria o banco e os dados de exemplo (apaga o anterior)
python run.py
```

- Site com agendamento: http://localhost:5000/#agendar
- Painel da clínica: http://localhost:5000/painel

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@inspiralle.demo | admin123 |
| Recepção | recepcao@inspiralle.demo | recepcao123 |
| Dentista | helena@inspiralle.demo | dentista123 |

> Os dados de exemplo são gerados em volta do dia em que você roda o
> `init-db` (30 dias de histórico + 14 dias de agenda). Rode de novo no dia
> da apresentação para a agenda de "hoje" ficar cheia.

Roteiro sugerido para a apresentação:
1. No site, agende uma consulta (Agendar online → serviço → profissional → horário → dados).
2. No painel, a consulta aparece em **Novos pedidos pelo site**; clique em *Confirmar*.
3. Abra a agenda do dia (colunas por dentista, horários livres clicáveis).
4. Abra a ficha do paciente: histórico, anamnese, prontuário e botão de WhatsApp.

## Módulos

| Módulo | Rota | O que faz |
|---|---|---|
| Agendamento online | `/api/public/*` + `inspiralle-landing/agendamento.js` | Serviços, profissionais, dias e horários livres em tempo real; cria paciente + consulta. |
| Início | `/painel/` | Indicadores, agenda de hoje, pedidos do site para confirmar, ocupação da semana. |
| Agenda | `/painel/agenda/` | Visão do dia por dentista, nova consulta com sugestão de horários, status, remarcação, mensagem de confirmação no WhatsApp. |
| Pacientes | `/painel/pacientes/` | Busca, cadastro, anamnese, histórico de consultas, prontuário (evolução clínica), arquivamento sem perder dados. |
| Cadastros | `/painel/cadastros/` | Serviços (duração, valor, online sim/não), profissionais (dias, serviços, cor) e usuários. |

Regras importantes:
- Conflito de horário verificado no servidor (site e recepção usam a mesma função, `app/services/availability.py`).
- Antecedência mínima de 2 h e janela de 30 dias para agendamento online (`config.py`).
- Horário de funcionamento em `config.py → BUSINESS_HOURS`.
- Perfis: admin (tudo), recepção (agenda e pacientes), dentista (agenda e prontuário).
- Paciente é identificado pelo telefone: quem agenda de novo pelo site cai na mesma ficha.
- A API pública não devolve nenhum dado de paciente.

## Estrutura

```
inspiralle-sistema/
├── run.py, config.py, requirements.txt
├── app/
│   ├── __init__.py          # app factory, blueprints, filtros, CSRF, serve a landing em /
│   ├── models/              # User, Dentist, Service, Patient, Appointment, ClinicalNote
│   ├── services/availability.py
│   ├── modules/             # auth, public_api, dashboard, scheduling, patients, settings
│   ├── templates/  static/  # painel (PWA, mobile-first)
│   └── seed.py              # dados de demonstração
└── tests/                   # pytest
```

## Testes

```bash
pip install -r requirements.txt && pytest -q
```

## Antes de ir para produção

- Trocar `SECRET_KEY` e usar PostgreSQL (`DATABASE_URL`); `APP_ENV=prod`.
- Adicionar Flask-Migrate (hoje o `init-db` recria o banco do zero, só para demo).
- Cadastrar profissionais, serviços e horários reais; criar usuários reais.
- Lembretes automáticos por WhatsApp (API oficial ou Z-API) e e-mail.
- Termo de privacidade/LGPD revisado pela clínica.
- Se a landing ficar em outro domínio, preencher `data-api` em `#booking` no `index.html`.
