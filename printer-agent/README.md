# Ponte de impressão do GestRest

Programa pequeno que fica rodando num computador do restaurante, ligado o dia
todo, e é responsável por pegar os tickets de produção (Cozinha/Suqueiros) que
o GestRest já deixa prontos e mandar pra impressora térmica. Sem ele, os
tickets ficam esperando na fila — o sistema continua funcionando normalmente
na tela, só não imprime sozinho.

A impressora pode estar ligada de dois jeitos — escolha **um** dos dois Passos
1 abaixo, conforme o caso:

- **Cabo USB** direto nesse computador → siga o **Passo 1A**.
- **Wi-Fi** (mesma rede do restaurante, sem cabo nenhum) → siga o **Passo 1B**.

## Passo 1A — Compartilhar a impressora no Windows (cabo USB)

O Windows precisa "compartilhar" a impressora pra esse programa conseguir
mandar os dados direto, sem passar pelo processamento normal de impressão
(que estragaria o formato do ticket).

1. Abra **Painel de Controle** → **Dispositivos e Impressoras** (ou digite
   "impressoras" no menu Iniciar).
2. Clique com o **botão direito** na impressora térmica → **Propriedades da
   impressora**.
3. Vá na aba **Compartilhamento**.
4. Marque **Compartilhar esta impressora**.
5. No campo **Nome do compartilhamento**, digite algo simples, **sem espaço**,
   por exemplo: `TICKET`.
6. Clique em **Aplicar** e depois **OK**.

Anote esse nome (`TICKET` no exemplo) — vai usar no Passo 4.

## Passo 1B — Colocar a impressora na rede Wi-Fi

Só funciona se a impressora **tiver Wi-Fi de verdade** (rádio próprio,
geralmente citado no manual/caixa como "Wi-Fi" ou "wireless") — uma impressora
só-USB não vira Wi-Fi sem um adaptador de rede específico.

1. **CD/utilitário que veio com a impressora**: é o programa do fabricante
   pra colocar a impressora dentro da rede Wi-Fi do restaurante (ele não
   "vira driver de impressão" no sentido do Windows — nesse modo a ponte
   manda os bytes direto pra impressora pela rede, sem usar driver nenhum do
   Windows). Instale esse utilitário no computador, conecte a impressora
   nele (normalmente via um cabo USB **temporário**, só pra configurar) e
   escolha a rede Wi-Fi do restaurante + a senha. Ao terminar, o utilitário
   mostra o **IP** que a impressora recebeu na rede (algo como
   `192.168.0.50`) — **anote esse IP**, vai usar no Passo 4. Se a impressora
   tiver uma função de "imprimir página de configuração" (geralmente
   segurando um botão dela ligada), isso também mostra o IP atual.
2. Depois de configurada, a impressora não precisa mais ficar perto de
   nenhum computador — só precisa estar ligada na tomada e dentro do alcance
   do Wi-Fi do restaurante. O computador que roda esta ponte (Passos 2-5)
   também só precisa estar na mesma rede, não precisa de cabo nenhum até a
   impressora.
3. **IP fixo**: a maioria dos roteadores pode mudar o IP de um aparelho de
   vez em quando (renovação de DHCP). Se puder, configure no roteador (ou no
   próprio utilitário da impressora) pra ela sempre receber o **mesmo IP** —
   senão a ponte para de achar a impressora quando o IP mudar, e é só voltar
   aqui e atualizar o `.env` (Passo 4) com o IP novo.

## Passo 2 — Instalar o Node.js

O programa da ponte roda em cima do Node.js (uma ferramenta gratuita, não é
nada além do necessário pra rodar esse programinha).

1. Acesse **https://nodejs.org**.
2. Baixe a versão **LTS** (a recomendada, tem esse aviso na própria página).
3. Instale normalmente (Avançar, Avançar, Concluir — as opções padrão servem).

## Passo 3 — Copiar essa pasta pro computador

Copie a pasta `printer-agent` inteira (a que tem este arquivo dentro) pro
computador do restaurante, por exemplo em `C:\GestRest\printer-agent`.

## Passo 4 — Configurar

1. Dentro da pasta, copie o arquivo `.env.example` e renomeie a cópia pra
   `.env` (sem o ".example").
2. Abra o `.env` num editor de texto simples (Bloco de Notas serve) e
   preencha:
   - `GESTREST_API_URL` — o endereço do GestRest (já vem preenchido com o de
     produção).
   - `PRINTER_AGENT_KEY` — a chave gerada em **Configurações → Impressora**
     dentro do GestRest (como ADMIN). Essa chave só aparece **uma vez** na
     tela — copie exatamente como veio.
   - Se seguiu o **Passo 1A** (USB): deixe `PRINTER_MODE=usb` e preencha
     `PRINTER_SHARE_NAME` com o nome que você deu no Passo 1A (ex.: `TICKET`).
   - Se seguiu o **Passo 1B** (Wi-Fi): troque pra `PRINTER_MODE=network`,
     tire o `#` da frente de `PRINTER_HOST` e preencha com o IP anotado no
     Passo 1B (ex.: `PRINTER_HOST=192.168.0.50`). `PRINTER_PORT` pode ficar
     comentado (usa 9100 por padrão, que é o que praticamente toda
     impressora térmica de rede usa).
3. Salve o arquivo.

## Passo 5 — Rodar

1. Dentro da pasta `printer-agent`, clique com o botão direito segurando
   **Shift** e escolha **Abrir janela do PowerShell aqui** (ou **Abrir
   Prompt de Comando aqui**, dependendo da versão do Windows).
2. Rode este comando (só precisa rodar uma vez):
   ```
   npm install
   ```
3. Depois, sempre que quiser ligar a ponte, rode:
   ```
   npm start
   ```
4. Vai aparecer uma linha `Modo de impressão: USB (...)` ou
   `Modo de impressão: rede (IP:porta)` — confirme que é o modo certo — e
   depois `Ponte de impressão do GestRest iniciada.` — é isso, está
   funcionando. **Deixe essa janela aberta** enquanto o restaurante estiver
   funcionando.

Quando um pedido chegar na Cozinha ou nos Suqueiros, o ticket deve imprimir
sozinho em poucos segundos.

## Como saber se deu certo

Na mesma janela onde o programa está rodando, cada ticket impresso aparece
como uma linha `[ok] Ticket impresso — ...`. Se algo der errado, aparece uma
linha `[erro]` explicando o motivo — o ticket **não se perde**, ele continua
na fila e o programa tenta imprimir de novo sozinho no próximo ciclo (a cada
poucos segundos). No modo Wi-Fi/rede, os erros mais comuns são:

- **"não consegui conectar" / ECONNREFUSED** — IP errado no `.env`, ou a
  impressora está desligada.
- **"não respondeu em Xms"** — o computador não está na mesma rede da
  impressora, ou o IP mudou (ver "IP fixo" no Passo 1B).

## Deixar rodando sempre (opcional, pra não esquecer de abrir manualmente)

Isso pode ser configurado depois, quando o funcionamento manual (Passo 5)
já estiver validado — dá pra usar o **Agendador de Tarefas** do Windows pra
esse programa iniciar sozinho quando o computador ligar, sem precisar abrir
nada na mão todo dia.
