require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Ponte de impressão local do GestRest — roda num computador dentro do restaurante,
 * ligado o dia todo, com a impressora térmica USB compartilhada no Windows (ver
 * README.md). Não tem lógica de negócio nenhuma: só busca os tickets prontos (bytes
 * ESC/POS já montados pelo backend) e repassa pra impressora.
 *
 * Impressora é USB, não Wi-Fi — por isso não dá pra mandar os bytes direto por um IP
 * de rede (o jeito original pensado pra impressoras de rede). Em vez disso, escreve os
 * bytes num arquivo temporário e usa o comando `copy /b` do Windows pra jogar esse
 * arquivo cru dentro do compartilhamento da impressora — é assim que sistemas de PDV
 * no Windows imprimem ESC/POS numa impressora USB sem precisar de driver especial.
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
const PRINTER_SHARE_NAME = requireEnv('PRINTER_SHARE_NAME');
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 4000);

function printJob(job) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(job.payload, 'base64');
    const tempFile = path.join(os.tmpdir(), `gestrest-ticket-${job.id}.bin`);
    fs.writeFileSync(tempFile, buffer);

    const command = `copy /b "${tempFile}" "\\\\localhost\\${PRINTER_SHARE_NAME}"`;
    exec(command, (error, _stdout, stderr) => {
      fs.unlink(tempFile, () => {});
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve();
    });
  });
}

async function ackJob(jobId) {
  const res = await fetch(`${API_URL}/print-agent/jobs/${jobId}/ack`, {
    method: 'POST',
    headers: { 'X-Printer-Key': PRINTER_KEY },
  });
  if (!res.ok) throw new Error(`confirmação falhou: HTTP ${res.status}`);
}

async function pollAndPrint() {
  let jobs;
  try {
    const res = await fetch(`${API_URL}/print-agent/jobs`, {
      headers: { 'X-Printer-Key': PRINTER_KEY },
    });
    if (!res.ok) {
      console.error(`[erro] Não consegui buscar tickets: HTTP ${res.status}`);
      return;
    }
    jobs = await res.json();
  } catch (err) {
    console.error('[erro] Não consegui falar com o GestRest:', err.message);
    return;
  }

  for (const job of jobs) {
    try {
      await printJob(job);
      await ackJob(job.id);
      console.log(`[ok] Ticket impresso — ${job.station} (${job.id}).`);
    } catch (err) {
      // Não confirma (ack) quando falha — o ticket continua pendente e será
      // tentado de novo no próximo ciclo, nada se perde.
      console.error(`[erro] Falha ao imprimir o ticket ${job.id}, vou tentar de novo:`, err.message);
    }
  }
}

console.log('Ponte de impressão do GestRest iniciada.');
console.log(`Verificando tickets novos a cada ${POLL_INTERVAL_MS / 1000}s... (Ctrl+C para parar)`);
pollAndPrint();
setInterval(pollAndPrint, POLL_INTERVAL_MS);
