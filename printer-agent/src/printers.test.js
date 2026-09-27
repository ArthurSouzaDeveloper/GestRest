const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUsbPrinter, createNetworkPrinter } = require('./printers');

test('createUsbPrinter: chama `copy /b` pro compartilhamento e resolve quando o comando sai sem erro', async () => {
  const calls = [];
  const exec = (command, cb) => {
    calls.push(command);
    cb(null, '', '');
  };
  const printJob = createUsbPrinter('TICKET', { exec });

  await printJob({ id: 'job-1', payload: Buffer.from('abc').toString('base64') });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /copy \/b/);
  assert.match(calls[0], /\\\\localhost\\TICKET/);
});

test('createUsbPrinter: rejeita quando o comando falha (impressora sem papel, nome errado etc.)', async () => {
  const exec = (_command, cb) => cb(new Error('boom'), '', 'access denied');
  const printJob = createUsbPrinter('TICKET', { exec });

  await assert.rejects(
    () => printJob({ id: 'job-2', payload: Buffer.from('abc').toString('base64') }),
    /access denied/,
  );
});

/** Socket TCP falso, só o suficiente pra exercitar createNetworkPrinter sem rede real. */
function fakeSocket() {
  const socket = new EventEmitter();
  socket.setTimeout = () => {};
  socket.destroy = () => {};
  socket.end = (buffer) => {
    socket.written = buffer;
    // Simula o servidor (impressora) fechando a conexão depois de receber os bytes.
    process.nextTick(() => socket.emit('close', false));
  };
  return socket;
}

test('createNetworkPrinter: conecta no host:porta configurados e manda os bytes crus', async () => {
  const socket = fakeSocket();
  let connectedTo = null;
  const connect = (opts, onConnect) => {
    connectedTo = opts;
    process.nextTick(onConnect);
    return socket;
  };
  const printJob = createNetworkPrinter('192.168.0.50', 9100, { connect });

  await printJob({ id: 'job-3', payload: Buffer.from('ticket').toString('base64') });

  assert.deepEqual(connectedTo, { host: '192.168.0.50', port: 9100 });
  assert.equal(socket.written.toString(), 'ticket');
});

test('createNetworkPrinter: rejeita quando a conexão dá erro (impressora desligada/IP errado)', async () => {
  const socket = fakeSocket();
  const connect = () => {
    process.nextTick(() => socket.emit('error', new Error('ECONNREFUSED')));
    return socket;
  };
  const printJob = createNetworkPrinter('192.168.0.99', 9100, { connect });

  await assert.rejects(
    () => printJob({ id: 'job-4', payload: Buffer.from('x').toString('base64') }),
    /192\.168\.0\.99:9100/,
  );
});

test('createNetworkPrinter: rejeita por timeout quando a impressora não responde', async () => {
  const socket = fakeSocket();
  socket.destroy = () => {
    // Sem emitir erro nenhum — só fecha, como um socket travado que nunca conecta.
  };
  // Nunca chama onConnect — simula uma conexão que fica pendurada até o timeout disparar.
  const connect = () => {
    process.nextTick(() => socket.emit('timeout'));
    return socket;
  };
  const printJob = createNetworkPrinter('192.168.0.77', 9100, { connect, timeoutMs: 5 });

  await assert.rejects(
    () => printJob({ id: 'job-5', payload: Buffer.from('x').toString('base64') }),
    /não respondeu/,
  );
});
