import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAccessToken } from '../../utils/auth';

/**
 * Funcionário logado conta pelo próprio usuário, não pelo IP: todas as telas do
 * restaurante (cozinha, suqueiros, caixa, garçons, motoboys no Wi-Fi) saem pelo mesmo IP
 * público do roteador, e no pico elas somam mais de 300 consultas/min — por IP, a equipe
 * inteira dividia um limite só e as telas paravam de atualizar com 429. Token inválido
 * ou ausente (site público, tentativa de abuso) continua contando por IP.
 */
export function staffOrIpKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      return `user:${verifyAccessToken(header.slice(7)).sub}`;
    } catch {
      // token inválido/expirado: cai no limite por IP
    }
  }
  return req.ip ?? 'unknown';
}

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: staffOrIpKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente.' } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas de login.' } },
});

// Site público de pedidos (sem login) — generoso o bastante pra um cliente de verdade
// nunca esbarrar nele, apertado o bastante pra travar um script batendo pedidos falsos.
export const publicOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitos pedidos em pouco tempo. Tente novamente em alguns minutos.' } },
});

// Autocomplete/detalhes de endereço e cotação de frete (modo por distância) — cada chamada
// custa dinheiro de verdade no Google, então o limite é mais apertado por IP que o do
// pedido em si, mas ainda generoso o bastante pra digitar um endereço inteiro sem travar.
export const mapsLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas buscas de endereço em pouco tempo. Tente novamente em alguns minutos.' } },
});

// Ponte de impressão local — faz polling contínuo (a cada poucos segundos, o dia
// inteiro), então o limite aqui é sobre volume normal de uso automatizado, não sobre
// tentativas humanas ocasionais como os limitadores acima. Generoso o bastante pra
// nunca travar o polling normal (mesmo com retentativas), apertado o bastante pra não
// virar um vetor de abuso caso uma chave vaze.
export const printAgentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente.' } },
});

// Login do site público (nome+telefone) — sem senha, então o limite existe pra dificultar
// alguém tentando adivinhar nome+telefone de outra pessoa por força bruta, não pra travar
// um cliente de verdade (que erra o telefone no máximo umas duas vezes).
export const customerLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente novamente em alguns minutos.' } },
});
