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
