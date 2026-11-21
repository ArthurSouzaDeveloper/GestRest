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
| Dentista (Dr. Lúcio) | lucio@inspiralle.demo | dentista123 |
| **Paciente** (portal, em http://localhost:5000/portal) | CPF 123.456.789-09 | paciente123 |

> Os dados de exemplo são gerados em volta do dia em que você roda o
> `init-db` (30 dias de histórico + 14 dias de agenda). Rode de novo no dia
> da apresentação para a agenda de "hoje" ficar cheia.

Roteiro sugerido para a apresentação:
1. No site, agende uma consulta (Agendar online → serviço → profissional → horário → dados).
2. No painel, a consulta aparece em **Novos pedidos pelo site**; clique em *Confirmar*.
3. Abra a agenda do dia (colunas por dentista, horários livres clicáveis).
4. Abra a ficha do paciente: histórico, anamnese, prontuário e botão de WhatsApp.
5. Marque uma consulta como **Concluído** e abra **Financeiro**: o valor entra na hora no dia, na semana e no mês.
6. Na ficha da Juliana Ribeiro, veja a evolução com fotos; depois entre em `/portal` como ela (no celular) e mostre o mesmo tratamento do ponto de vista do paciente, sem nenhum valor.

## Módulos

| Módulo | Rota | O que faz |
|---|---|---|
| Agendamento online | `/api/public/*` + `inspiralle-landing/agendamento.js` | Serviços, profissionais, dias e horários livres em tempo real; cria paciente + consulta. |
| Início | `/painel/` | Indicadores, agenda de hoje, pedidos do site para confirmar, ocupação da semana. |
| Agenda | `/painel/agenda/` | Visão do dia por dentista, nova consulta com sugestão de horários, status, remarcação, mensagem de confirmação no WhatsApp. |
| Pacientes | `/painel/pacientes/` | Busca, cadastro, anamnese, histórico de consultas, prontuário (evolução clínica), arquivamento sem perder dados. |
| Financeiro | `/painel/financeiro/` | Relatório diário, semanal e mensal (faturamento, consultas, ticket médio, comparação com o período anterior, por profissional e por tratamento), exportação em planilha, tabela de preços por dentista e ajuste manual de valor. |
| Portal do paciente | `/portal/` | Login próprio (CPF ou celular + senha). Evolução do tratamento liberada pela equipe, com fotos e descrição, e próximas consultas. Somente leitura. |
| Cadastros | `/painel/cadastros/` | Serviços (duração, valor, online sim/não), profissionais (dias, serviços, cor) e usuários. |

Regras importantes:
- Conflito de horário verificado no servidor (site e recepção usam a mesma função, `app/services/availability.py`).
- Antecedência mínima de 2 h e janela de 30 dias para agendamento online (`config.py`).
- Horário de funcionamento em `config.py → BUSINESS_HOURS`.
- Perfis: admin (tudo), recepção (agenda e pacientes), dentista (agenda e prontuário).
- Paciente é identificado pelo telefone: quem agenda de novo pelo site cai na mesma ficha.
- A API pública não devolve nenhum dado de paciente.
- **Financeiro automático:** ao marcar uma consulta como *Concluído* é criado um lançamento com o preço do dentista para aquele tratamento (ou o valor padrão do serviço). Se o status sair de *Concluído*, o lançamento some. Mudar a tabela de preços não altera o que já foi lançado. Tratamento sem preço entra como R$ 0,00 e aparece um aviso no relatório.
- **Quem vê valores:** administrador (tudo) e cada dentista (só a própria produção). Recepção e pacientes não veem nenhum valor; o portal nem carrega dados financeiros.
- **Portal:** a recepção libera o acesso na ficha (gera senha provisória de 6 dígitos e já monta a mensagem de WhatsApp); o paciente troca a senha no primeiro acesso. 5 tentativas erradas bloqueiam o login por 5 minutos.
- **Imagens da evolução:** JPG/PNG/WEBP (conferidos pelo conteúdo do arquivo), até 10 MB cada e 8 por evolução, guardadas em `instance/uploads` fora da pasta pública. Só saem por rota com login: equipe, ou o próprio paciente se a evolução estiver marcada como "No portal". Anotações internas ficam marcadas como "Só equipe".

## Estrutura

```
inspiralle-sistema/
├── run.py, config.py, requirements.txt
├── app/
│   ├── __init__.py          # app factory, blueprints, filtros, CSRF, serve a landing em /
│   ├── models/              # User, Dentist, Service, Patient, Appointment, ClinicalNote, NoteImage, DentistPrice, FinancialEntry
│   ├── services/            # availability.py, finance.py, uploads.py
│   ├── modules/             # auth, public_api, dashboard, scheduling, patients, settings, finance, portal
│   ├── seed_assets/         # imagens ilustrativas usadas só nos dados de demonstração
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
- Adicionar Flask-Migrate (hoje o `init-db` recria o banco do zero, só para demo). Quem já tinha rodado a versão anterior precisa rodar `init-db` de novo, porque há tabelas e colunas novas.
- Guardar as imagens da evolução num armazenamento com backup (ex.: S3) via `UPLOAD_DIR`, e servir tudo em HTTPS.
- Recuperação de senha do portal por e-mail/WhatsApp (hoje a recepção gera uma nova).
- Limite de tentativas de login por IP (ex.: Flask-Limiter); hoje o bloqueio do portal é por sessão, suficiente para a demo.
- Cadastrar profissionais, serviços e horários reais; criar usuários reais.
- Lembretes automáticos por WhatsApp (API oficial ou Z-API) e e-mail.
- Termo de privacidade/LGPD revisado pela clínica.
- Se a landing ficar em outro domínio, preencher `data-api` em `#booking` no `index.html`.

## Módulos clínicos e de gestão (prévia)

| Módulo | Rota | Quem acessa |
| --- | --- | --- |
| Odontograma | `/painel/clinico/paciente/<id>/odontograma` | dentista marca, recepção vê |
| Plano de tratamento e orçamento | `/painel/clinico/orcamentos` | dentista monta, recepção registra a decisão |
| Termo de consentimento | `/painel/clinico/plano/<id>/termo` | assinado na tela, guardado no prontuário |
| Contas a receber | `/painel/contas/receber` | recepção dá baixa; totais só para admin/dentista |
| Contas a pagar e caixa | `/painel/contas/pagar` | só admin |
| Comissão e repasse | `/painel/contas/comissao` | admin vê todos, dentista vê o próprio |
| Mensagens (WhatsApp) | `/painel/mensagens/` | recepção e dentista |
| Lista de espera e encaixe | `/painel/mensagens/espera` | recepção e dentista |
| Recall por procedimento | `/painel/mensagens/recall` | recepção e dentista |
| Indicadores | `/painel/indicadores/` | admin e dentista |
| Estoque e ficha técnica | `/painel/estoque/` | recepção e dentista |
| Convênios e guias TISS | `/painel/convenios/` | recepção e dentista |
| Trilha de auditoria | `/painel/cadastros/auditoria` | só admin |
| Portal: anamnese, orçamento e termo | `/portal/anamnese`, `/portal/orcamentos` | paciente |

Regras que atravessam os módulos:

- O odontograma nunca apaga: a marcação mais recente de cada dente/face é a que vale, o resto fica no histórico.
- Aprovar um orçamento gera as parcelas em contas a receber; reparcelar apaga só as parcelas ainda em aberto.
- Executar um item do plano atualiza o odontograma (cárie vira restaurado, canal indicado vira canal tratado).
- Consulta concluída lança o valor no financeiro **e** dá baixa no material da ficha técnica, uma vez só.
- O repasse do dentista desconta material (ficha técnica), laboratório do período e a taxa de cartão das parcelas recebidas.
- A régua de cobrança dispara em 1, 7 e 20 dias de atraso, uma mensagem por parcela.
- Nenhuma mensagem sai sem a clínica revisar: o sistema monta a fila, a clínica envia.
- Toda ação sobre dado de paciente entra na trilha de auditoria, com usuário, IP e data.

O envio real de WhatsApp exige conta na API oficial da Meta (cobrada por mensagem); aqui a fila, os
textos e o controle de resposta já funcionam ponta a ponta.
