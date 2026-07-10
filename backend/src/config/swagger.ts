/** Minimal OpenAPI 3 document describing the core GestRest API surface. */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'GestRest API',
    version: '1.0.0',
    description:
      'Sistema profissional de gestão de restaurante (sucos, pastéis e mini pizzas). ' +
      'Autenticação via Bearer JWT. Eventos em tempo real via Socket.IO.',
  },
  servers: [{ url: '/api', description: 'API base' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': { get: { summary: 'Health check', security: [], responses: { 200: { description: 'OK' } } } },
    '/auth/login': {
      post: {
        summary: 'Login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string' }, password: { type: 'string' } },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: { 200: { description: 'Access token + user' }, 401: { description: 'Credenciais inválidas' } },
      },
    },
    '/auth/me': { get: { summary: 'Usuário autenticado', responses: { 200: { description: 'OK' } } } },
    '/tables': {
      get: { summary: 'Lista de mesas', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Cria mesa (ADMIN/MANAGER)', responses: { 201: { description: 'Criada' } } },
    },
    '/catalog/products': {
      get: { summary: 'Lista de produtos', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Cria produto (ADMIN/MANAGER)', responses: { 201: { description: 'Criado' } } },
    },
    '/catalog/categories': { get: { summary: 'Categorias', responses: { 200: { description: 'OK' } } } },
    '/catalog/additionals': { get: { summary: 'Adicionais', responses: { 200: { description: 'OK' } } } },
    '/orders': {
      get: { summary: 'Lista pedidos (filtra por status/tableId)', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Abre mesa / cria comanda (WAITER)', responses: { 201: { description: 'Criado' } } },
    },
    '/orders/{id}/items': {
      post: { summary: 'Adiciona itens (roteamento automático por estação)', responses: { 201: { description: 'OK' } } },
    },
    '/orders/items/{itemId}/status': {
      post: { summary: 'Atualiza status de produção (JUICER/COOK)', responses: { 200: { description: 'OK' } } },
    },
    '/orders/{id}/pay': {
      post: { summary: 'Recebe pagamento (CASHIER) — suporta pagamento misto', responses: { 200: { description: 'OK' } } },
    },
    '/production/kitchen': { get: { summary: 'Fila da cozinha', responses: { 200: { description: 'OK' } } } },
    '/production/juice-bar': { get: { summary: 'Fila dos suqueiros', responses: { 200: { description: 'OK' } } } },
    '/dashboard': { get: { summary: 'Métricas (ADMIN/MANAGER)', responses: { 200: { description: 'OK' } } } },
    '/users': { get: { summary: 'Lista usuários (ADMIN/MANAGER)', responses: { 200: { description: 'OK' } } } },
    '/audit': { get: { summary: 'Logs de auditoria (ADMIN/MANAGER)', responses: { 200: { description: 'OK' } } } },
  },
};
