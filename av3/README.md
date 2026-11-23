# GreenCode - Plataforma Analítica, API Pública B2B e Filas Assíncronas (AV3)

Projeto desenvolvido para a **Atividade de Avaliação Individual 3 (AV3)** pelo Prof. Eng. Dr. Gerson Penha.

---

## 1. Características Implementadas na AV3

- **Pilar 1 — Camada Analítica e Inteligência de Negócios (`simple-statistics` + `node-cron`)**:
  - **Análise de Eficiência Operacional**: Cálculo estatístico de tempo médio, mediano e desvio padrão entre a entrada de lotes e a conclusão da triagem, identificação automática de gargalos operacionais (> 36h), ranking comparativo entre operadores e análise de sazonalidade por trimestre (`RelatorioEficiencia`).
  - **Análise de Rentabilidade por Tipo de Equipamento**: Estimativa de recuperação financeira com base no estado físico, marca, modelo e peso, gerando o índice de priorização ($\text{R\$}/\text{kg}$ e ticket médio) e persistindo em `RelatorioRentabilidade`.
  - **Análise Preditiva de Vida Útil Remanescente (OLS + Suavização Exponencial)**: Implementação do **Método dos Mínimos Quadrados Ordinários (OLS)** ($\hat{Y} = \beta_1 X + \beta_0$ e coeficiente $R^2$) combinado à **Suavização Exponencial Simples (SES)** para projetar quando cada categoria e equipamento atingirá o estado `INSERVIVEL`, persistindo os resultados em `RelatorioPreditivo` para comparação histórica.
  - **Agendamento em Segundo Plano (`node-cron`)**: Execução periódica automatizada dos cálculos analíticos e endpoint administrativo para disparo sob demanda.

- **Pilar 2 — API Pública Documentada, Chaves de API e Rate Limiting**:
  - **Segregação Estrita de Rotas**: Separação entre endpoints públicos de parceiros (`/api/v1/public/*`), endpoints internos de operação e BI (`/api/v1/internal/*`) e endpoints administrativos (`/api/v1/admin/*`).
  - **Gestão de Chaves de API (`X-API-Key`)**: Módulo no serviço de autenticação que gera chaves únicas (`gc_live_...`), armazena apenas o hash SHA-256 em repouso (`ApiKeyParceiro`) e valida escopos granulares (`READ_RASTREABILIDADE`, `WRITE_LOTES`, `READ_ANALYTICS`).
  - **Rate Limiting por Cliente (`@fastify/rate-limit`)**: Limitação dinâmica de requisições por minuto configurada individualmente por chave de parceiro, retornando `HTTP 429 Too Many Requests`.
  - **Versionamento Semântico**: Suporte explícito à versão na URL (`/api/v1/public`) e no cabeçalho `X-API-Version: 1.0.0`.
  - **Documentação OpenAPI 3.0 Interativa (`@fastify/swagger` & `@fastify/swagger-ui`)**: Interface interativa em `/docs` com exemplos de requisição/resposta, esquemas de segurança (`bearerAuth` e `apiKeyAuth`) e códigos de erro (`400`, `401`, `403`, `404`, `409`, `429`).

- **Pilar 3 — Orquestração de Tarefas Assíncronas com Filas (`BullMQ` / Worker)**:
  - **Geração Assíncrona de Relatórios Pesados (CSV e JSON)**: Endpoint `POST /api/v1/public/relatorios/assincrono` que publica a tarefa na fila e retorna imediatamente `HTTP 202 Accepted` com `tarefaId`, `pollingUrl` e `downloadUrl`.
  - **Política de Retry com Backoff Exponencial**: Reexecução automática de tarefas com falha transitória (até 3 tentativas com atraso exponencial $2^{k-1}$) e registro diagnóstico em `TarefaRelatorio`.
  - **Polling e Download**: Endpoints `GET /api/v1/public/relatorios/tarefas/:tarefaId` e `GET /api/v1/public/relatorios/tarefas/:tarefaId/download`.

---

## 2. Como Executar

### Pré-requisitos
- Node.js versão 18+ (testado em v24)
- NPM versão 9+

### Instalação e Inicialização do Banco de Dados
```bash
cd av3
npm install
npm run prisma:push
npm run prisma:seed
```

### Executar a Suíte Completa de Testes Automatizados da AV3 (16 Cenários)
```bash
npm run test:av3
```

### Iniciar o Servidor HTTP e Worker Assíncrono
```bash
npm run dev
```

O servidor estará disponível em:
- **API Base**: `http://localhost:3000`
- **Swagger OpenAPI Interativo**: `http://localhost:3000/docs`
- **Health Check**: `http://localhost:3000/health`

---

## 3. Credenciais e Chaves de API Pré-configuradas no Seed

### Usuários Internos (Autenticação JWT em `/api/v1/internal/auth/login`)
| Usuário | Senha | Papel |
|---|---|---|
| `admin` | `admin123` | `ADMINISTRADOR` |
| `operador_cad` | `cad123` | `OPERADOR_CADASTRO` |
| `gestor_almox` | `almox123` | `GESTOR_ALMOXARIFADO` |
| `auditor_fiscal` | `audit123` | `AUDITOR` |

### Chaves de API Pública (Cabeçalho `X-API-Key` em `/api/v1/public/*`)
| Parceiro | Chave (`X-API-Key`) | Permissões | Limite |
|---|---|---|---|
| **Telecom Brasil ERP** | `gc_live_parceiro_telecom_full_2025` | `READ_RASTREABILIDADE`, `WRITE_LOTES`, `READ_ANALYTICS` | 100 req/min |
| **Cooperativa EcoVerde** | `gc_live_cooperativa_ecoverde_readonly_2025` | `READ_RASTREABILIDADE` | 30 req/min |

---

## 4. Documentação Técnica e Diagramas
- **Relatório Técnico Arquitetural (AV3)**: [`docs/AV3_ARQUITETURA_ANALITICA_API.md`](docs/AV3_ARQUITETURA_ANALITICA_API.md)
- **Diagrama de Classes UML (PlantUML)**: [`diagramas/av3_diagrama_classes.puml`](diagramas/av3_diagrama_classes.puml)
- **Diagrama Entidade-Relacionamento (PlantUML)**: [`diagramas/av3_diagrama_er.puml`](diagramas/av3_diagrama_er.puml)

---

## 5. 🎁 Easter Egg
- **Mensagem**: `"Oi prof. Gerson :)"`
- **Onde encontrar**:
  - No endpoint `GET /health` (campo `easterEgg`).
  - Na rota dedicada `GET /easteregg`.
  - No banner do console ao iniciar o servidor (`src/server.ts`).
