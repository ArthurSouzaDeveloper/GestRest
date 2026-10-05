/**
 * Um ciclo de "buscar tickets pendentes -> imprimir -> confirmar", isolado do resto
 * (fetch de rede, exec do Windows) pra dar pra testar sem depender de nada real — ver
 * poll.test.js. Toda dependência externa entra por parâmetro (injeção simples, sem
 * framework de DI).
 *
 * Ponto central deste módulo: o `running` guard. setInterval no index.js dispara `tick`
 * de tempo em tempo (fixo), sem esperar o ciclo anterior terminar — se um ciclo demorar
 * mais que o intervalo (impressora lenta, rede lenta, fila grande), o próximo disparo
 * cairia em cima do anterior e buscaria os MESMOS tickets ainda pendentes (o ack do
 * primeiro ciclo só acontece depois de imprimir, então um ciclo sobreposto não vê esse
 * ack a tempo) — cada um imprime a via de novo, gerando os duplicados relatados pelo
 * cliente. O guard faz o ciclo novo ser ignorado (não enfileirado, não atrasado — só
 * pulado) enquanto o anterior ainda está rodando.
 */
function createPollLoop({ apiUrl, printerKey, printJob, ackJob, fetchImpl = fetch, log = console.log, logError = console.error }) {
  let running = false;
  // Ids já mandados pra impressora física nesta execução, mas cujo ack ainda não foi
  // confirmado pelo backend (ex.: a rede até o servidor falhou bem na hora do POST de
  // confirmação, depois do `copy /b`/socket já ter entregue os bytes pra impressora —
  // esse envio não tem como ser desfeito). Sem isso, o job continua PENDING no backend e
  // o próximo ciclo (sem sobrepor o anterior, já coberto pelo guard `running` acima)
  // buscaria o MESMO job de novo e reimprimiria a via — era exatamente o duplicado
  // relatado pelo cliente numa entrega (via do motoboy saindo 2x). Agora, pra um id já
  // nesta lista, só se tenta confirmar de novo — nunca reimprimir.
  const printedPendingAck = new Set();

  async function fetchPendingJobs() {
    const res = await fetchImpl(`${apiUrl}/print-agent/jobs`, {
      headers: { 'X-Printer-Key': printerKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function tick() {
    if (running) {
      log('[aviso] Ciclo anterior ainda em andamento (impressão ou rede lenta) — pulando esta rodada pra não imprimir em dobro.');
      return;
    }
    running = true;
    try {
      let jobs;
      try {
        jobs = await fetchPendingJobs();
      } catch (err) {
        logError('[erro] Não consegui buscar tickets:', err.message);
        return;
      }

      for (const job of jobs) {
        const alreadyPrinted = printedPendingAck.has(job.id);
        try {
          if (!alreadyPrinted) {
            await printJob(job);
            printedPendingAck.add(job.id);
          }
          await ackJob(job.id);
          printedPendingAck.delete(job.id);
          log(
            alreadyPrinted
              ? `[ok] Ticket ${job.id} já tinha sido impresso — confirmação pendente resolvida agora.`
              : `[ok] Ticket impresso — ${job.station} (${job.id}).`,
          );
        } catch (err) {
          if (alreadyPrinted) {
            // Já saiu na impressora antes — NÃO tenta imprimir de novo, só avisa que a
            // confirmação continua falhando (vai tentar de novo no próximo ciclo).
            logError(`[erro] Ticket ${job.id} já impresso, mas a confirmação falhou de novo:`, err.message);
          } else {
            // Não confirma (ack) quando falha ao IMPRIMIR — o ticket continua pendente e
            // será tentado de novo no próximo ciclo, nada se perde.
            logError(`[erro] Falha ao imprimir o ticket ${job.id}, vou tentar de novo:`, err.message);
          }
        }
      }
    } finally {
      running = false;
    }
  }

  return { tick, isRunning: () => running };
}

module.exports = { createPollLoop };
