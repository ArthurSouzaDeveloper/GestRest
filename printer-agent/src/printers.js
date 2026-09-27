const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * As duas formas de mandar os bytes ESC/POS já prontos (vindos do backend) pra impressora
 * física — extraídas do index.js pra dar pra testar sem depender de nada real (Windows de
 * verdade, impressora de verdade na rede), mesmo espírito de poll.js.
 */

/**
 * Impressora USB, compartilhada no Windows (ver README.md) — jeito original, mantido
 * como padrão pra não quebrar quem já tem a ponte instalada assim. Escreve os bytes num
 * arquivo temporário e usa `copy /b` pra jogar esse arquivo cru dentro do
 * compartilhamento — é assim que sistemas de PDV no Windows imprimem ESC/POS numa
 * impressora USB sem precisar de driver especial.
 */
function createUsbPrinter(shareName, { exec = require('child_process').exec } = {}) {
  return function printJob(job) {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(job.payload, 'base64');
      const tempFile = path.join(os.tmpdir(), `gestrest-ticket-${job.id}.bin`);
      fs.writeFileSync(tempFile, buffer);

      const command = `copy /b "${tempFile}" "\\\\localhost\\${shareName}"`;
      exec(command, (error, _stdout, stderr) => {
        fs.unlink(tempFile, () => {});
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve();
      });
    });
  };
}

/**
 * Impressora de rede (Wi-Fi ou cabo Ethernet, já com IP na mesma rede do computador que
 * roda esta ponte) — manda os bytes crus direto por um socket TCP na porta 9100 (padrão
 * "RAW"/JetDirect que praticamente toda impressora térmica de rede aceita, sem precisar
 * de driver nenhum instalado no Windows). Pra chegar nesse ponto a impressora já precisa
 * ter sido configurada (normalmente pelo utilitário que vem no CD do fabricante) pra
 * entrar na rede Wi-Fi do restaurante e ficar com um IP fixo — ver README.md.
 */
function createNetworkPrinter(host, port, { connect = require('net').connect, timeoutMs = 5000 } = {}) {
  return function printJob(job) {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(job.payload, 'base64');
      const socket = connect({ host, port }, () => {
        socket.end(buffer);
      });
      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`impressora ${host}:${port} não respondeu em ${timeoutMs}ms (rede fora do ar ou IP errado?)`));
      });
      socket.once('error', (err) => reject(new Error(`não consegui conectar em ${host}:${port} — ${err.message}`)));
      socket.once('close', (hadError) => {
        if (!hadError) resolve();
      });
    });
  };
}

module.exports = { createUsbPrinter, createNetworkPrinter };
