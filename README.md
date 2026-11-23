# GreenCode - Plataforma de Logística Reversa e Economia Circular

Repositório contendo a entrega completa das atividades avaliativas **AV1**, **AV2** e **AV3** da disciplina ministrada pelo **Prof. Eng. Dr. Gerson Penha**.

---

## 🌿 Estrutura das Branches do Repositório

Este repositório foi organizado em **branches dedicadas** para cada uma das avaliações:

| Branch | Conteúdo | Descrição |
|---|---|---|
| [`main`](https://github.com/DMBMz/av3/tree/main) | `README.md`, `.gitignore` e `av3/` | Visão geral, documentação central e código-fonte completo da **Atividade 3 (AV3)** |
| [`av1`](https://github.com/DMBMz/av3/tree/av1) | Pasta `av1/` | **Atividade 1 (AV1)**: Sistema de linha de comando (CLI) seguro com persistência em arquivos criptografados (AES-256), journaling transacional e RBAC |
| [`av2`](https://github.com/DMBMz/av3/tree/av2) | Pasta `av2/` | **Atividade 2 (AV2)**: Monólito servidor web com API RESTful em Fastify, TypeScript, Prisma ORM, controle de concorrência otimista (`versao`) e autenticação JWT |
| [`av3`](https://github.com/DMBMz/av3/tree/av3) | Pasta `av3/` | **Atividade 3 (AV3)**: Plataforma analítica e preditiva (OLS + Suavização Exponencial + `simple-statistics`), API Pública segregada (`/api/v1/public`) com API Keys e Rate Limiting, e processamento assíncrono de relatórios com filas (`BullMQ` / Worker) |

---

## 🔄 Como Navegar Entre as Branches

Para clonar o repositório e alternar entre as atividades:

```bash
# Clonar o repositório
git clone https://github.com/DMBMz/av3.git
cd av3

# Acessar os arquivos e código da AV1:
git checkout av1

# Acessar os arquivos e código da AV2:
git checkout av2

# Acessar os arquivos e código da AV3:
git checkout av3
```

---

## 🚀 Como Executar Cada Atividade

### 1. Executando a AV1 (Branch `av1`)

Após alternar para a branch `av1` (`git checkout av1`):

```bash
cd av1
npm install

# Executar a jornada completa de testes automatizados (100% dos requisitos do PDF):
npm run test:journey

# Iniciar o terminal interativo CLI:
npm start
```

* **Credenciais padrão do primeiro acesso:** Usuário `admin` | Senha `admin123`.
* **Easter Egg:** Localizado no banner inicial da CLI (`iniciarLoop`) e via comando secreto `gerson` em [`av1/src/cli/CLIInterface.ts`](https://github.com/DMBMz/av-tec1/blob/av1/av1/src/cli/CLIInterface.ts). Mensagem: `"Oi prof. Gerson :)"`.
* **Diagrama de Classes:** Disponível em [`av1/diagrama/`](https://github.com/DMBMz/av-tec1/tree/av1/av1/diagrama).
* **Documentação de Segurança:** [`av1/docs/AV1_ARQUITETURA_SEGURANCA.md`](https://github.com/DMBMz/av-tec1/blob/av1/av1/docs/AV1_ARQUITETURA_SEGURANCA.md).

---

### 2. Executando a AV2 (Branch `av2`)

Após alternar para a branch `av2` (`git checkout av2`):

```bash
cd av2
npm install

# Inicializar o banco de dados e aplicar a carga inicial (seed):
npm run prisma:push
npm run prisma:seed

# Executar a suíte de testes automatizados da API REST (100% dos requisitos do PDF):
npm run test:api

# Iniciar o servidor HTTP Fastify em modo desenvolvimento:
npm run dev
```

* **API Base:** [http://localhost:3000](http://localhost:3000)
* **Swagger UI Interativo:** [http://localhost:3000/docs](http://localhost:3000/docs)
* **Health Check:** [http://localhost:3000/health](http://localhost:3000/health)
* **Easter Egg:** Localizado no endpoint `GET /health` (campo `easterEgg`), na rota `GET /easteregg` e no banner do servidor em [`av2/src/server.ts`](https://github.com/DMBMz/av-tec1/blob/av2/av2/src/server.ts). Mensagem: `"Oi prof. Gerson :)"`.
* **Diagramas Monólito e ER:** Disponíveis em [`av2/diagramas/`](https://github.com/DMBMz/av-tec1/tree/av2/av2/diagramas).
* **Documentação Técnica:** [`av2/docs/AV2_ARQUITETURA_MONOLITO.md`](https://github.com/DMBMz/av-tec1/blob/av2/av2/docs/AV2_ARQUITETURA_MONOLITO.md).

---

### 3. Executando a AV3 (Branch `av3`)

Após alternar para a branch `av3` (`git checkout av3`):

```bash
cd av3
npm install

# Inicializar o banco de dados com as novas tabelas analíticas e aplicar o seed:
npm run prisma:push
npm run prisma:seed

# Executar a suíte de testes automatizados da AV3 (16 cenários cobrindo Analytics, API Pública e Filas):
npm run test:av3

# Iniciar o servidor HTTP Fastify, Agendador node-cron e Worker de Relatórios:
npm run dev
```

* **API Base:** [http://localhost:3000](http://localhost:3000)
* **Swagger OpenAPI 3.0 Interativo:** [http://localhost:3000/docs](http://localhost:3000/docs)
* **API Pública de Parceiros:** `http://localhost:3000/api/v1/public` (Autenticação via header `X-API-Key`)
* **API Analítica Interna:** `http://localhost:3000/api/v1/internal/analytics` (Autenticação via JWT Bearer)
* **Health Check:** [http://localhost:3000/health](http://localhost:3000/health)
* **Easter Egg:** Localizado no endpoint `GET /health` (campo `easterEgg`), na rota `GET /easteregg` e no banner do servidor em [`av3/src/server.ts`](https://github.com/DMBMz/av3/blob/av3/av3/src/server.ts). Mensagem: `"Oi prof. Gerson :)"`.
* **Diagramas UML e ER Expandidos:** Disponíveis em [`av3/diagramas/`](https://github.com/DMBMz/av3/tree/av3/av3/diagramas).
* **Relatório Técnico Arquitetural:** [`av3/docs/AV3_ARQUITETURA_ANALITICA_API.md`](https://github.com/DMBMz/av3/blob/av3/av3/docs/AV3_ARQUITETURA_ANALITICA_API.md).

---

## 📊 Matriz Comparativa de Evolução Arquitetural (AV1 $\rightarrow$ AV2 $\rightarrow$ AV3)

| Requisito Avaliado | AV1 (Branch `av1`) | AV2 (Branch `av2`) | AV3 (Branch `av3`) |
|---|---|---|---|
| **Linguagem & Runtime** | Node.js + TypeScript | Node.js + TypeScript | Node.js + TypeScript |
| **Persistência de Dados** | Arquivos criptografados (AES-256) | Prisma ORM (PostgreSQL / SQLite) | Prisma ORM + Tabelas Históricas de BI e Filas |
| **Autenticação & Segurança** | SHA-256 + Salt e sessão de 30 min | JWT stateless (`@fastify/jwt`) | JWT Interno + Chaves de API (`X-API-Key`) com hash SHA-256 e Rate Limiting (`@fastify/rate-limit`) |
| **Segregação de Rotas e Versionamento** | Comandos CLI adaptativos por papel | Rotas REST `/api/*` | Segregação `/api/v1/public`, `/api/v1/internal` e `/api/v1/admin` + Header `X-API-Version` |
| **Inteligência Analítica & Preditiva** | Relatórios descritivos básicos | Métricas de carbono e MRR | Eficiência Operacional, Rentabilidade e Regressão Preditiva OLS + Suavização Exponencial (`simple-statistics` + `node-cron`) |
| **Processamento Assíncrono** | Síncrono em linha de comando | Síncrono HTTP | Fila Assíncrona (`BullMQ` / Worker) com Retry Exponencial, Polling e Download CSV/JSON |
| **Documentação Técnica** | Arquitetura de Segurança | Arquitetura Monolítica e Trade-offs | Relatório Técnico de BI, OLS, Política de Retry e Escalabilidade para Milhares de Parceiros |
