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
        try {
          await printJob(job);
          await ackJob(job.id);
          log(`[ok] Ticket impresso — ${job.station} (${job.id}).`);
        } catch (err) {
          // Não confirma (ack) quando falha — o ticket continua pendente e será
          // tentado de novo no próximo ciclo, nada se perde.
          logError(`[erro] Falha ao imprimir o ticket ${job.id}, vou tentar de novo:`, err.message);
        }
      }
    } finally {
      running = false;
    }
  }

  return { tick, isRunning: () => running };
}

module.exports = { createPollLoop };
