const test = require('node:test');
const assert = require('node:assert/strict');
const { createPollLoop } = require('./poll');

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

function noop() {}

test('imprime e confirma cada ticket pendente, em ordem', async () => {
  const printed = [];
  const acked = [];
  const jobs = [
    { id: 'a', station: 'KITCHEN', payload: 'x' },
    { id: 'b', station: 'JUICE_BAR', payload: 'y' },
  ];

  const loop = createPollLoop({
    apiUrl: 'http://api',
    printerKey: 'k',
    fetchImpl: async () => ({ ok: true, json: async () => jobs }),
    printJob: async (job) => {
      printed.push(job.id);
    },
    ackJob: async (id) => {
      acked.push(id);
    },
    log: noop,
    logError: noop,
  });

  await loop.tick();

  assert.deepEqual(printed, ['a', 'b']);
  assert.deepEqual(acked, ['a', 'b']);
});

test('não confirma um ticket que falhou ao imprimir, mas continua os seguintes', async () => {
  const acked = [];
  const jobs = [
    { id: 'a', station: 'KITCHEN', payload: 'x' },
    { id: 'b', station: 'KITCHEN', payload: 'y' },
  ];

  const loop = createPollLoop({
    apiUrl: 'http://api',
    printerKey: 'k',
    fetchImpl: async () => ({ ok: true, json: async () => jobs }),
    printJob: async (job) => {
      if (job.id === 'a') throw new Error('impressora offline');
    },
    ackJob: async (id) => {
      acked.push(id);
    },
    log: noop,
    logError: noop,
  });

  await loop.tick();

  assert.deepEqual(acked, ['b']);
});

test('uma falha ao buscar os tickets não derruba o processo', async () => {
  const loop = createPollLoop({
    apiUrl: 'http://api',
    printerKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => [] }),
    printJob: async () => {},
    ackJob: async () => {},
    log: noop,
    logError: noop,
  });

  await assert.doesNotReject(loop.tick());
});

test('regressão: um ciclo sobreposto NÃO reimprime o ticket que o ciclo anterior ainda não confirmou', async () => {
  // Reproduz o bug relatado pelo cliente: index.js chama tick() a cada
  // POLL_INTERVAL_MS via setInterval, sem esperar o tick anterior terminar. Se
  // imprimir+confirmar um ticket demora mais que o intervalo (impressora lenta,
  // rede lenta), o próximo tick buscava a mesma fila (o job ainda está PENDING,
  // porque o ack só acontece depois de imprimir) e imprimia o mesmo pedido de
  // novo — sem nenhuma "2a via", só o mesmo papel saindo duas vezes.
  let fetchCalls = 0;
  const printed = [];
  const printGate = deferred();

  const loop = createPollLoop({
    apiUrl: 'http://api',
    printerKey: 'k',
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => [{ id: 'only-job', station: 'KITCHEN', payload: 'x' }] };
    },
    printJob: async (job) => {
      printed.push(job.id);
      // Simula a impressora demorando mais que o intervalo de polling.
      await printGate.promise;
    },
    ackJob: async () => {},
    log: noop,
    logError: noop,
  });

  const firstTick = loop.tick();
  // O "setInterval" dispararia de novo aqui, antes do primeiro tick confirmar o job.
  const secondTick = loop.tick();

  assert.equal(loop.isRunning(), true);
  printGate.resolve();
  await Promise.all([firstTick, secondTick]);

  assert.equal(fetchCalls, 1, 'o segundo tick não deveria nem chegar a buscar a fila de novo');
  assert.deepEqual(printed, ['only-job'], 'o ticket só pode ter sido impresso uma vez');
});

test('regressão: ack falha DEPOIS da impressão ter sido feita com sucesso — próximo ciclo só tenta confirmar de novo, não reimprime', async () => {
  // Reproduz o duplicado relatado pelo cliente numa entrega (via do motoboy saindo 2x):
  // a impressão USB/rede local já tinha sido entregue com sucesso, mas o POST de ack pro
  // backend falhou (rede até o servidor, nada a ver com a impressora) — sem rastrear que
  // esse job já foi impresso, o próximo ciclo buscava o mesmo job (continua PENDING no
  // backend) e reimprimia a via inteira.
  const printed = [];
  const ackAttempts = [];
  let ackShouldFail = true;
  const jobs = [{ id: 'motoboy-1', station: 'KITCHEN', payload: 'x' }];

  const loop = createPollLoop({
    apiUrl: 'http://api',
    printerKey: 'k',
    fetchImpl: async () => ({ ok: true, json: async () => jobs }),
    printJob: async (job) => {
      printed.push(job.id);
    },
    ackJob: async (id) => {
      ackAttempts.push(id);
      if (ackShouldFail) throw new Error('rede caiu bem na hora do ack');
    },
    log: noop,
    logError: noop,
  });

  await loop.tick(); // imprime, ack falha
  ackShouldFail = false;
  await loop.tick(); // job ainda PENDING (ack nunca confirmou) — só deve tentar o ack de novo

  assert.deepEqual(printed, ['motoboy-1'], 'a via só pode ter sido impressa uma vez, mesmo com o ack falhando antes');
  assert.deepEqual(ackAttempts, ['motoboy-1', 'motoboy-1']);
});
