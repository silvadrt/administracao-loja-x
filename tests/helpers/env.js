// Prepara as variáveis de ambiente para os testes.
// Este arquivo DEVE ser importado antes de qualquer módulo do sistema.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "segredo-de-teste-com-mais-de-32-bytes-de-comprimento-ok";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.JWT_EXPIRES_IN = "30m";
process.env.REFRESH_EXPIRES_IN = "7d";
