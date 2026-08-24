# Impressão térmica automática + aceite automático de pedidos online

## Contexto

O cliente (Rei do Suco) comprou uma impressora térmica de rede (Taicon TA-TP510W,
conectividade Wi-Fi + USB, emulação ESC/POS, porta padrão 9100/TCP) pra imprimir os
tickets de produção automaticamente, em vez de a equipe só olhar a tela da Cozinha/
Suqueiros. Junto disso, veio um segundo pedido: hoje um pedido online (delivery/
retirada) chega com status `PENDING` e precisa de um clique manual de "aceitar" antes
de aparecer na fila de produção — o cliente quer poder desligar essa exigência, porque
atrapalha a equipe na correria.

O backend do GestRest roda num servidor cloud (Hetzner, fora da rede do restaurante),
então a impressora — que fica na rede Wi-Fi local da loja — não pode ser acionada
diretamente pelo servidor. É necessário um pequeno programa ("ponte") rodando num
computador dentro do próprio restaurante, na mesma rede da impressora, que se
comunica com o GestRest pela internet e com a impressora pela rede local.

## Objetivo

1. Tornar o aceite de pedidos online configurável por restaurante (automático ou
   manual, como já existe hoje).
2. Sempre que um item novo entrar na fila de produção (Cozinha ou Suqueiros) — seja
   de uma comanda de mesa ou de um pedido online — gerar um ticket de impressão
   pronto, de forma confiável (não pode se perder se a ponte/impressora estiver fora
   do ar por um tempo).
3. Fornecer uma ponte local simples e seu protocolo de comunicação com o GestRest.

## Escopo

**Dentro do escopo:**
- Campo de configuração de aceite automático por restaurante.
- Fila de trabalhos de impressão no banco de dados (`PrintJob`), com endpoints
  dedicados pra a ponte local consumir.
- Renderização do conteúdo do ticket em ESC/POS no backend.
- Autenticação própria e escopada pra ponte local (não é login de funcionário).
- Especificação do programa-ponte (o que ele faz, não necessariamente a
  implementação de um instalador/serviço do sistema operacional).
- Alerta simples pro ADMIN quando há tickets pendentes há muito tempo sem confirmação
  de impressão.

**Fora do escopo (nesta entrega):**
- Múltiplas impressoras por restaurante (uma impressora por estação). O desenho não
  impede isso no futuro, mas não é implementado agora — confirmado com o cliente que,
  por ora, é uma impressora só, compartilhada entre Cozinha e Suqueiros.
- Detecção de "impressora sem papel" — limitação de hardware/protocolo (impressão
  crua via socket não lê status da impressora); a tela da Cozinha/Suqueiros continua
  sendo a fonte confiável independentemente disso.
- Instalador nativo (serviço do Windows, etc.) pra a ponte iniciar sozinha no boot —
  fica como instrução de configuração manual por enquanto.
- Reimpressão manual de um ticket já impresso pela tela do GestRest (pode ser um
  incremento futuro).

## Modelo de dados

### `Restaurant` (campos novos)

```prisma
model Restaurant {
  // ...campos existentes...

  // Aceite automático de pedidos online (delivery/retirada) — quando true, um pedido
  // criado pelo site público já nasce em OPEN em vez de PENDING, sem precisar de
  // clique manual de "aceitar". Configurável só por ADMIN (mesmo critério já usado
  // pro modo automático/manual do tempo estimado).
  autoAcceptOnlineOrders Boolean @default(false)

  // Impressora térmica de rede (ESC/POS via TCP) usada pra imprimir os tickets de
  // produção — uma só, compartilhada entre Cozinha e Suqueiros (cada ticket indica
  // a estação no cabeçalho). Nulo = impressão automática desligada pra esse
  // restaurante (nenhum PrintJob é gerado).
  printerHost String?
  printerPort Int?    @default(9100)

  // Hash (bcrypt, mesmo padrão de senha de usuário) da chave de acesso da ponte de
  // impressão local — nunca guardamos a chave em texto puro. Nulo = nenhuma ponte
  // configurada ainda. Ver seção "Autenticação da ponte" abaixo.
  printerAgentKeyHash String?

  printJobs PrintJob[]
}
```

### `PrintJob` (tabela nova)

```prisma
enum PrintJobStatus {
  PENDING
  PRINTED
}

model PrintJob {
  id           String         @id @default(uuid())
  restaurantId String
  restaurant   Restaurant     @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  orderId      String
  order        Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  station      Station        // KITCHEN ou JUICE_BAR — nunca NONE (itens NONE não imprimem)
  // Conteúdo do ticket já renderizado em bytes ESC/POS, pronto pra mandar direto pra
  // impressora — a ponte local não precisa saber nada sobre formatação, só repassar.
  payload      Bytes
  status       PrintJobStatus @default(PENDING)
  createdAt    DateTime       @default(now())
  printedAt    DateTime?

  @@index([restaurantId, status])
  @@map("print_jobs")
}
```

`PrintJob.order` usa `onDelete: Cascade` (não `Restrict`) — diferente da correção da
auditoria QA: um trabalho de impressão é um artefato operacional efêmero, não um
registro financeiro histórico, então não há razão pra bloquear a exclusão de um
pedido por causa dele.

## Fluxo 1 — Aceite automático

Novo endpoint `PATCH /catalog/auto-accept` (ADMIN-only, mesmo padrão de
`/catalog/eta-settings`) grava `autoAcceptOnlineOrders`.

Em `publicOrder.service.ts` / `order.service.ts#openPublic()`: hoje o pedido sempre
nasce com `status: PENDING`. Passa a checar `restaurant.autoAcceptOnlineOrders`:
- **Desligado (padrão):** comportamento inalterado — `PENDING`, precisa do
  `POST /orders/:id/accept` manual, como hoje.
- **Ligado:** o pedido já nasce com `status: OPEN` e `acceptedAt: now()` (pulando
  `PENDING`), e o fluxo segue direto pro Fluxo 2 abaixo (geração de ticket), do mesmo
  jeito que `accept()` já faz hoje pra pedidos aceitos manualmente.

## Fluxo 2 — Geração do trabalho de impressão

Novo helper compartilhado, `printJobService.enqueueForItems(tx, tenantId, orderId,
items)`, chamado nos quatro pontos onde itens passam a existir/ficar visíveis na fila
de produção pela primeira vez:

1. `orderService.open()` — comanda de mesa nova (itens recém-criados).
2. `orderService.addItems()` — itens adicionados a uma comanda já aberta (só os itens
   novos daquela chamada, não o histórico do pedido).
3. `orderService.accept()` — pedido online aceito manualmente (todos os itens do
   pedido, que até então nunca tinham ficado visíveis).
4. `orderService.openPublic()` — pedido online com aceite automático ligado (mesmo
   caso do item 3, mas disparado na criação).

O helper agrupa os itens recebidos por `station` (ignorando `NONE`), monta o texto do
ticket (mesa/tipo de pedido, número do pedido, nome do cliente se houver, cada item
com quantidade/observações/adicionais, hora), renderiza em ESC/POS (ver próxima
seção) e insere uma linha em `PrintJob` por estação tocada — tudo dentro da mesma
transação que já cria os itens, então a geração do ticket nunca fica dessincronizada
do pedido em si.

Depois do commit, emite o mesmo evento de socket que já avisa a tela da Cozinha/
Suqueiros em tempo real (`production:updated`, nas rooms `ROOMS.KITCHEN`/
`ROOMS.JUICE_BAR`) — a ponte local também escuta essas rooms (autenticando com a
chave de impressão, não um login de funcionário) só como um aviso de "vá conferir se
tem ticket novo"; o conteúdo de verdade sempre vem da API REST (próxima seção), o
socket é só o gatilho de latência baixa.

## Renderização ESC/POS

Novo módulo `backend/src/application/services/escpos.helpers.ts`, sem dependência
nova — ESC/POS é só uma sequência de bytes bem documentada (inicializar impressora,
negrito/tamanho de fonte pro cabeçalho, texto normal pros itens, comando de corte de
papel no final). Função pura `renderTicket(input): Buffer`, testável sem hardware
real (confere a estrutura dos bytes gerados, não a impressão em si).

Acentuação (nomes de produtos em português): usa a codepage CP860 (Português) via
`ESC t 3`, que é suportada pela maioria das impressoras ESC/POS térmicas nacionais —
fica como uma suposição a validar assim que a impressora física chegar; se o
Taicon TA-TP510W usar uma codepage diferente, é uma troca de uma constante só.

## Autenticação da ponte de impressão

A ponte local **não** usa login de funcionário — ela recebe uma chave própria,
gerada uma vez pelo ADMIN em Configurações (`POST /catalog/printer-agent-key`,
ADMIN-only), mostrada em texto puro só naquele momento (mesmo padrão de "mostra a
senha uma vez só"), e guardada no banco só como hash (bcrypt). O ADMIN pode gerar uma
nova chave a qualquer momento (invalida a anterior automaticamente).

Formato da chave: `<restaurantId>.<segredo aleatório>` — o prefixo identifica o
tenant sem precisar varrer a tabela inteira de restaurantes a cada requisição, o
sufixo é conferido por hash.

Novo middleware `authenticatePrinterAgent`: lê o header `X-Printer-Key`, resolve o
restaurante pelo prefixo, confere o hash do sufixo. Nunca concede acesso a nenhuma
outra rota do sistema — só às duas abaixo.

## Endpoints novos

Router `printAgentRouter`, montado em `/print-agent` (fora do `/api` de staff),
autenticado só por `authenticatePrinterAgent`:

- `GET /print-agent/jobs` — lista até N (ex.: 20) `PrintJob` com `status: PENDING`
  do restaurante da chave, mais antigos primeiro. Cada item retorna `id`, `station`,
  `payload` (base64), `createdAt`.
- `POST /print-agent/jobs/:id/ack` — marca como `PRINTED` (com `printedAt: now()`).
  Confere que o job pertence ao restaurante da chave (evita um restaurante confirmar
  o job de outro — mesmo cuidado de isolamento multi-tenant já aplicado no resto do
  sistema).

Staff (ADMIN, JWT normal):
- `PATCH /catalog/auto-accept` — liga/desliga o aceite automático.
- `PATCH /catalog/printer-settings` — define `printerHost`/`printerPort`.
- `POST /catalog/printer-agent-key` — gera/regenera a chave da ponte.
- `GET /catalog/printer-status` — conta quantos `PrintJob` estão `PENDING` há mais de
  X minutos, pro ADMIN perceber se a ponte/impressora parou de responder.

## O programa-ponte (bridge)

Script Node.js pequeno e "burro" (não tem lógica de negócio, só repassa bytes),
mantido como pacote próprio (`printer-agent/`), fora do build do backend/frontend.
Configuração via variáveis de ambiente: `GESTREST_API_URL`, `PRINTER_AGENT_KEY`,
`PRINTER_HOST`, `PRINTER_PORT`.

Laço de funcionamento:
1. Conecta ao socket do GestRest com a chave de impressão, entra nas rooms de
   Cozinha/Suqueiros.
2. Ao receber qualquer aviso (ou a cada poucos segundos, como reforço caso o aviso
   se perca), chama `GET /print-agent/jobs`.
3. Pra cada trabalho pendente: abre uma conexão TCP crua com a impressora
   (`PRINTER_HOST:PRINTER_PORT`), escreve o `payload` (já em ESC/POS), fecha a
   conexão, chama `POST /print-agent/jobs/:id/ack`.
4. Se a impressora não responder, tenta de novo no próximo ciclo — o trabalho
   continua `PENDING` até dar certo, nunca é descartado.

Instruções de execução ficam documentadas (README do pacote); iniciar
automaticamente no boot do computador do restaurante (Agendador de Tarefas do
Windows, por exemplo) é uma configuração manual, não algo que o código resolve
sozinho.

## Tratamento de erros e casos de borda

| Situação | Comportamento |
|---|---|
| Impressora desligada/sem rede | `PrintJob` fica `PENDING`, ponte tenta de novo no próximo ciclo. Tela da Cozinha/Suqueiros não é afetada. |
| Ponte offline (computador desligado, reiniciando) | Mesma coisa — ao voltar, busca tudo que acumulou via `GET /print-agent/jobs`. |
| Impressora sem papel | Não detectável via socket cru (fora do escopo desta entrega) — o trabalho é considerado enviado; a tela continua sendo a fonte confiável. |
| Chave de acesso vazada | ADMIN gera uma nova a qualquer momento; a antiga para de funcionar na hora. |
| Muitos `PrintJob` pendentes há muito tempo | `GET /catalog/printer-status` expõe a contagem pro ADMIN notar o problema. |
| Pedido apagado com trabalho de impressão pendente | `PrintJob` cai em cascata junto (não é dado histórico/financeiro, ver nota no modelo de dados). |

## Testes

- **Unitário:** `escpos.helpers.ts` — dado um input conhecido, confere a estrutura
  dos bytes gerados (comandos de inicialização, negrito, corte).
- **Integração (banco real, seguindo o padrão já usado no projeto):**
  - Item novo em comanda de mesa / item adicionado / aceite manual / aceite
    automático — cada um gera o(s) `PrintJob` esperado(s), agrupado corretamente por
    estação.
  - Aceite automático desligado → comportamento `PENDING` inalterado.
  - Autenticação da ponte: chave válida só acessa os dois endpoints de impressão;
    chave de um restaurante não consegue confirmar (`ack`) o job de outro tenant
    (mesmo tipo de teste de isolamento já usado no resto do sistema).
- **Não automatizável nesta sessão:** entrega física do ticket pela impressora real —
  validado manualmente com o cliente assim que a impressora e o computador-ponte
  estiverem no restaurante.

## Decisões confirmadas com o cliente durante o desenho

- Aceite automático é configurável por restaurante (não uma mudança global), restrito
  a ADMIN.
- Impressão automática vale pra **todos** os pedidos (comanda de mesa e online), não
  só pedidos online.
- Uma impressora só, compartilhada entre Cozinha e Suqueiros.
- Existirá um computador dedicado no restaurante do cliente pra rodar a ponte local.
