export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // NÃO usar Object.setPrototypeOf(this, AppError.prototype) aqui: isso reseta o
    // protótipo de QUALQUER subclasse (ConflictError, NotFoundError...) de volta pra
    // AppError, quebrando `instanceof ConflictError` etc. em todo o código (bug real
    // encontrado ao escrever teste de integração — `instanceof AppError` continuava
    // funcionando, por isso passou despercebido). Alvo de compilação é ES2021, onde
    // `class extends Error` já funciona nativamente sem esse workaround (que só era
    // necessário compilando pra ES5).
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409, 'CONFLICT');
  }
}
