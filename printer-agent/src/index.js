require('dotenv').config();
const { createPollLoop } = require('./poll');
const { createUsbPrinter, createNetworkPrinter } = require('./printers');

/**
 * Ponte de impressão local do GestRest — roda num computador dentro do restaurante,
 * ligado o dia todo, com a impressora térmica ligada nesse computador (USB) OU na mesma
 * rede Wi-Fi (ver README.md, seção "Modo Wi-Fi/rede"). Não tem lógica de negócio nenhuma:
 * só busca os tickets prontos (bytes ESC/POS já montados pelo backend) e repassa pra
 * impressora, no modo configurado em PRINTER_MODE.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[erro] Faltou configurar ${name} no arquivo .env — veja o README.md.`);
    process.exit(1);
  }
  return value;
}

const API_URL = requireEnv('GESTREST_API_URL').replace(/\/+$/, '');
const PRINTER_KEY = requireEnv('PRINTER_AGENT_KEY');
// 'usb' (padrão, compatível com quem já tem a ponte instalada) ou 'network' (impressora
// Wi-Fi/Ethernet com IP próprio na rede do restaurante).
const PRINTER_MODE = (process.env.PRINTER_MODE || 'usb').toLowerCase();
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 4000);

let printJob;
if (PRINTER_MODE === 'network') {
  const PRINTER_HOST = requireEnv('PRINTER_HOST');
  const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
  printJob = createNetworkPrinter(PRINTER_HOST, PRINTER_PORT);
  console.log(`Modo de impressão: rede (${PRINTER_HOST}:${PRINTER_PORT}).`);
} else {
  const PRINTER_SHARE_NAME = requireEnv('PRINTER_SHARE_NAME');
  printJob = createUsbPrinter(PRINTER_SHARE_NAME);
  console.log(`Modo de impressão: USB (compartilhamento "${PRINTER_SHARE_NAME}").`);
}

async function ackJob(jobId) {
  const res = await fetch(`${API_URL}/print-agent/jobs/${jobId}/ack`, {
    method: 'POST',
    headers: { 'X-Printer-Key': PRINTER_KEY },
  });
  if (!res.ok) throw new Error(`confirmação falhou: HTTP ${res.status}`);
}

const loop = createPollLoop({ apiUrl: API_URL, printerKey: PRINTER_KEY, printJob, ackJob });

console.log('Ponte de impressão do GestRest iniciada.');
console.log(`Verificando tickets novos a cada ${POLL_INTERVAL_MS / 1000}s... (Ctrl+C para parar)`);
loop.tick();
setInterval(loop.tick, POLL_INTERVAL_MS);
