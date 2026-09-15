# Ponte de impressão do GestRest

Programa pequeno que fica rodando no computador do restaurante, ligado o dia
todo, e é responsável por pegar os tickets de produção (Cozinha/Suqueiros) que
o GestRest já deixa prontos e mandar pra impressora térmica conectada nesse
computador. Sem ele, os tickets ficam esperando na fila — o sistema continua
funcionando normalmente na tela, só não imprime sozinho.

## Passo 1 — Compartilhar a impressora no Windows

Como a impressora está ligada por cabo USB (não é impressora de rede), o
Windows precisa "compartilhar" ela pra esse programa conseguir mandar os
dados direto, sem passar pelo processamento normal de impressão (que
estragaria o formato do ticket).

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
   - `PRINTER_SHARE_NAME` — o nome que você deu no Passo 1 (ex.: `TICKET`).
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
4. Vai aparecer uma mensagem tipo `Ponte de impressão do GestRest iniciada.`
   — é isso, está funcionando. **Deixe essa janela aberta** enquanto o
   restaurante estiver funcionando.

Quando um pedido chegar na Cozinha ou nos Suqueiros, o ticket deve imprimir
sozinho em poucos segundos.

## Como saber se deu certo

Na mesma janela onde o programa está rodando, cada ticket impresso aparece
como uma linha `[ok] Ticket impresso — ...`. Se algo der errado (impressora
sem papel, nome do compartilhamento errado, etc.), aparece uma linha
`[erro]` explicando o motivo — o ticket **não se perde**, ele continua na
fila e o programa tenta imprimir de novo sozinho no próximo ciclo (a cada
poucos segundos).

## Deixar rodando sempre (opcional, pra não esquecer de abrir manualmente)

Isso pode ser configurado depois, quando o funcionamento manual (Passo 5)
já estiver validado — dá pra usar o **Agendador de Tarefas** do Windows pra
esse programa iniciar sozinho quando o computador ligar, sem precisar abrir
nada na mão todo dia.
