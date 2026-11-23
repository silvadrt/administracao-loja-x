# Administração Loja X

Sistema web de gestão administrativa desenvolvido em Node.js, Express e PostgreSQL, adaptado para trabalho acadêmico com banco de dados próprio e fluxo de primeiro acesso integrado.

---

## Visão geral e módulos

- **Autenticação e controle de acesso:** login com senha em hash bcrypt, tokens JWT de acesso curto, refresh tokens rotacionados em hash SHA-256, bloqueio por excesso de tentativas e auditoria de ações.
- **Primeiro acesso integrado:** ao iniciar com o banco vazio, o sistema abre diretamente a tela de criação do primeiro administrador.
- **Perfis de acesso:** Administrador, Venerável Mestre, Secretário, Chanceler, Tesoureiro, Fraternidade Feminina e Irmão, com validação em duas camadas (API e interface).
- **Venerância:** gestão de mandatos e quadro de oficiais.
- **Secretaria:** livro de atas (com impressão/PDF e travamento após arquivamento), sessões/eventos, calendário, comunicados e controle de envios.
- **Tesouraria:** financeiro (mensalidades, cobranças em lote, pagamento parcial, entradas e saídas avulsas, exportação CSV), solicitações de correção com aprovação, caixa com balancete e relatório por membro.
- **Chancelaria e Unidade:** cadastro completo de membros, familiares, frequência em sessões, visitações, relatórios e dados institucionais da Administração Loja X.

---

## Pré-requisitos

- **Node.js 20+**
- Banco **PostgreSQL 13+** (local via `embedded-postgres` incluso ou instância externa como Neon/Supabase)

---

## Como executar localmente do zero

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

No `.env`, ajuste `DATABASE_URL` e gere um `JWT_SECRET` aleatório:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Iniciar o banco PostgreSQL local de desenvolvimento

Em um terminal dedicado, inicie o banco embutido da nova versão (isolado na pasta `.devdb/`, porta `55433`, banco `administracao_loja_x`):

```bash
npm run dev:db
```

### 4. Criar a estrutura do banco e iniciar o sistema

Em outro terminal:

```bash
npm start
```

O comando `npm start` executa automaticamente `npm run db:init` (`prestart`) para criar/verificar as tabelas em `sql/schema.sql` e sobe o servidor.

- Painel web: <http://localhost:3000>
- Verificação de saúde: <http://localhost:3000/health>

### 5. Primeiro acesso e primeiro cadastro

1. Ao abrir <http://localhost:3000> com o banco vazio, o sistema exibe automaticamente a tela **Configuração do primeiro acesso** para cadastrar o usuário administrador inicial.
2. Caso prefira criar usuários manualmente via terminal:
   ```bash
   npm run user:create -- "Administrador" admin@exemplo.com "SenhaForte@2026" admin
   ```
3. Após entrar no painel, utilize os módulos (como **Irmãos**, **Sessões**, **Financeiro**, **Livro de Atas** ou **Loja**) para registrar os primeiros dados do zero.

---

## Comandos disponíveis

| Comando | Descrição |
| --- | --- |
| `npm start` | Executa `db:init` e inicia o servidor |
| `npm run dev` | Inicia o servidor em modo watch |
| `npm run dev:db` | Inicia o PostgreSQL embutido local (`.devdb/`, porta `55433`) |
| `npm run db:init` | Cria ou atualiza as tabelas do banco (`sql/schema.sql`) |
| `npm run user:create -- "Nome" email senha perfil` | Cria um usuário pelo terminal |
| `npm run user:reset -- email ["nova senha"]` | Redefine a senha de um usuário |
| `npm run seed:demo` | Carrega dados fictícios opcionais para testes (não é executado automaticamente) |
| `npm run seed:demo:remover` | Remove os dados fictícios do `seed:demo` |
| `npm run verificar` | Testa saúde e autenticação na API em execução |
| `npm test` | Executa a suíte de testes automatizados (`node --test`) |

---

## Estrutura do projeto

```text
administracao-loja-x/
├── public/               → interface web estática (HTML, CSS, JS, SVG)
├── scripts/              → script de verificação da API
├── sql/schema.sql        → schema idempotente do PostgreSQL
├── src/
│   ├── server.js         → ponto de entrada HTTP
│   ├── app.js            → configuração Express, Helmet, CSP e rotas
│   ├── config.js         → leitura e validação do .env
│   ├── db.js             → pool de conexão PostgreSQL
│   ├── schemas.js        → validação Zod de entradas e regras
│   ├── middleware/       → autenticação, autorização, erros e rate limit
│   ├── routes/           → endpoints REST por módulo
│   ├── lib/              → tokens JWT, auditoria, tesouraria e utilidades
│   └── scripts/          → inicialização do banco, usuários e banco local
├── tests/                → testes automatizados com node:test
├── .env.example          → modelo de variáveis de ambiente
└── render.yaml           → blueprint de deploy
```
