# Relatório Técnico de Arquitetura: Inteligência Analítica, API Pública B2B e Processamento Assíncrono (AV3)

**Projeto**: GreenCode - Plataforma Analítica e Ecossistema de Integração para Logística Reversa  
**Disciplina**: Atividade de Avaliação Individual 3 (AV3)  
**Professor**: Eng. Dr. Gerson Penha  
**Pilha Tecnológica**: Node.js, TypeScript, Fastify, Prisma ORM, `simple-statistics`, `node-cron`, `@fastify/rate-limit`, `@fastify/swagger`, `BullMQ` & `Redis`.

---

## 1. Visão Geral da Evolução Arquitetural (AV1 $\rightarrow$ AV2 $\rightarrow$ AV3)

Ao longo das três etapas do projeto, o **GreenCode** percorreu uma trajetória de maturidade técnica e estratégica:
1. **AV1 (Núcleo CLI Criptografado)**: Estabeleceu as invariantes de domínio, validação oficial de CNPJ, regras de triagem e estado físico, controle de acesso baseado em papéis (RBAC) e persistência em arquivos AES-256 com journaling imutável.
2. **AV2 (Monólito Servidor Web com Prisma ORM)**: Transportou o domínio para a arquitetura em camadas (*Controller - Service - Repository*) com Fastify, banco de dados relacional (PostgreSQL / SQLite), transações ACID (`prisma.$transaction`), controle de concorrência otimista (`versao`) e autenticação stateless JWT.
3. **AV3 (Plataforma Analítica e Ecossistema B2B Integrado via API Pública)**: Transforma dados operacionais brutos em inteligência acionável (Business Intelligence e Análise Preditiva), abre o ecossistema para parceiros externos com chaves de API dedicadas e controle de taxa (*Rate Limiting*), e introduz processamento assíncrono com filas para geração de relatórios pesados sem bloqueio de conexões HTTP.

---

## 2. Justificativa da Escolha da Biblioteca Estatística e Modelos Matemáticos

### 2.1. Por que `simple-statistics` combinada à implementação explícita de OLS?
Para a camada analítica, avaliamos duas bibliotecas de software livre amplamente consolidadas no ecossistema JavaScript/TypeScript: **`simple-statistics`** e **`mathjs`**.

| Critério Arquitetural | `simple-statistics` (Escolhida) | `mathjs` (Alternativa Avaliada) |
|---|---|---|
| **Pegada de Memória e Bundle** | Leve (~30 KB), zero dependências transitivas pesadas | Pesada (> 1 MB), inclui parser simbólico de álgebra e matrizes complexas |
| **Tipagem e Integração TypeScript** | Funções puras que operam diretamente sobre arrays nativos `number[]` | Tipos polimórficos (`MathType`, `Matrix`, `BigNumber`) que exigem conversões constantes |
| **Foco no Domínio Analítico** | Especializada em estatística descritiva e inferencial (`mean`, `median`, `standardDeviation`, `linearRegression`, `rSquared`) | Voltada a cálculo simbólico, números complexos e física computacional |
| **Performance em Runtime V8** | Execução direta em arrays contíguos sem sobrecarga de parsing | Maior custo de CPU por operação devido à checagem dinâmica de tipos algébricos |

**Decisão Técnica**: Adotamos **`simple-statistics`** para o cálculo de médias, medianas, desvios padrão e coeficiente de determinação ($R^2$), combinada à implementação explícita do **Método dos Mínimos Quadrados Ordinários (Ordinary Least Squares — OLS)** e da **Suavização Exponencial Simples (Simple Exponential Smoothing — SES)** no serviço [`AnalyticsService.ts`](../src/services/AnalyticsService.ts).

### 2.2. Formulação Matemática da Análise Preditiva de Vida Útil
Para prever quando um tipo de equipamento atingirá o estado **`INSERVIVEL`** (definido pelo limiar crítico de degradação $Y_{\text{crit}} = 0.98$), modelamos a degradação acumulada $Y$ em função da idade $X$ (em anos) por regressão linear simples:

$$\hat{Y}(X) = \beta_1 X + \beta_0$$

Onde os estimadores de Mínimos Quadrados Ordinários ($\beta_1$ e $\beta_0$) são calculados sobre as $n$ observações históricas $(x_i, y_i)$:

$$\beta_1 = \frac{n \sum_{i=1}^{n} x_i y_i - \left(\sum_{i=1}^{n} x_i\right)\left(\sum_{i=1}^{n} y_i\right)}{n \sum_{i=1}^{n} x_i^2 - \left(\sum_{i=1}^{n} x_i\right)^2}, \qquad \beta_0 = \bar{y} - \beta_1 \bar{x}$$

A vida útil total projetada ($X_{\text{inservível}}$) e a vida útil remanescente média ($V_{\text{rem}}$) são obtidas invertendo a equação da reta no limiar $Y_{\text{crit}} = 0.98$:

$$X_{\text{inservível}} = \frac{0.98 - \beta_0}{\beta_1}, \qquad V_{\text{rem}} = \max\left(0,\; X_{\text{inservível}} - \bar{X}_{\text{atual}}\right)$$

Complementarmente, aplicamos a **Suavização Exponencial Simples** com fator de amortecimento $\alpha = 0.35$ sobre a série cronológica de severidade de falhas para capturar acelerações recentes na degradação de lotes:

$$S_t = \alpha Y_t + (1 - \alpha) S_{t-1}$$

---

## 3. Modelagem das Tabelas para Armazenamento dos Resultados Analíticos

Um requisito estratégico da AV3 é persistir os relatórios gerados para permitir auditoria histórica e comparação entre previsões passadas e realizações futuras (*backtesting* dos modelos preditivos). Modelamos três tabelas analíticas dedicadas no arquivo [`prisma/schema.prisma`](../prisma/schema.prisma), além das tabelas de governança de API Keys e fila assíncrona:

1. **`RelatorioEficiencia` (`relatorios_eficiencia`)**:
   - Armazena `periodoReferencia`, `totalLotesAnalisados`, `tempoMedioTriagemHoras`, `tempoMedianoTriagemHoras`, `desvioPadraoTriagemHoras`, `operadorMaisEficiente` e `gargaloIdentificado`.
   - Campos estruturados `metricasPorOperadorJson` e `metricasPorPeriodoJson` preservam o *snapshot* completo do ranking de produtividade por operador e da sazonalidade por trimestre (`2025-Q1`, `2025-Q2`, `2025-Q3`).
2. **`RelatorioRentabilidade` (`relatorios_rentabilidade`)**:
   - Armazena `tipoEquipamento`, `totalUnidadesAmostra`, `pesoMedioKg`, `valorMedioRecuperacaoBRL`, `valorMedianoRecuperacaoBRL`, `desvioPadraoRecuperacaoBRL`, `valorTotalPotencialBRL` e o `indicePriorizacao` (score ponderado entre ticket médio unitário e densidade financeira por quilograma $\text{R\$}/\text{kg}$).
   - O campo `detalhamentoPorEstadoMarcaJson` preserva a matriz cruzada `Marca x Modelo x Estado Físico`.
3. **`RelatorioPreditivo` (`relatorios_preditivos`)**:
   - Armazena os parâmetros matemáticos da regressão OLS: `coeficienteAngularOLS` ($\beta_1$), `interceptoOLS` ($\beta_0$), `coeficienteDeterminacaoR2` ($R^2$), `suavizacaoExponencialAlfa` ($\alpha$) e `taxaFalhaSuavizada`.
   - Registra as projeções temporais (`idadeMediaAtualAnos`, `vidaUtilTotalEstimadaAnos`, `vidaUtilRemanescenteMediaAnos`, `anoProjetadoInservivel`) e o vetor detalhado por ativo em `projecoesDetalhadasJson`.

**Vantagem Arquitetural da Modelagem Híbrida (Colunas Escalares Indexáveis + Snapshots JSON)**:
- As métricas escalares principais ($\beta_1$, $R^2$, tempo médio, valor médio) ficam em colunas tipadas (`Float`, `Int`), permitindo consultas SQL diretas de evolução temporal (`SELECT criadoEm, coeficienteAngularOLS, vidaUtilRemanescenteMediaAnos FROM relatorios_preditivos WHERE tipoEquipamento = 'NOTEBOOK'`).
- Os desdobramentos granulares ficam encapsulados em colunas JSON, evitando dezenas de *joins* custosos durante a leitura de relatórios históricos.

---

## 4. Segregação da API Pública, Segurança de API Keys e Versionamento Semântico

### 4.1. Segregação Estrita de Rotas
Aplicamos o princípio da segregação de preocupações (*Separation of Concerns*) dividindo o espaço de rotas em três domínios independentes:
- **`/api/v1/public/*`**: Camada externa exclusiva para sistemas parceiros (ERPs de organizações geradoras, cooperativas de reciclagem e plataformas de auditoria ambiental). Autenticada via cabeçalho `X-API-Key`.
- **`/api/v1/internal/*`**: Camada de operação e BI interno consumida pelo front-end SPA e analistas da startup. Autenticada via token Bearer JWT.
- **`/api/v1/admin/*`**: Camada administrativa restrita ao papel `ADMINISTRADOR` para gestão de contas, emissão/revogação de chaves de API de parceiros e disparo manual de jobs `node-cron`.

### 4.2. Segurança das Chaves de API em Repouso e Escopos Granulares
- As chaves emitidas seguem o padrão identificável `gc_live_<36_hex_chars>`.
- **Proteção contra vazamento de banco**: A chave em texto plano é exibida **uma única vez** no momento da criação (`POST /api/v1/admin/api-keys`). No banco de dados (`api_keys_parceiros`), armazenamos apenas o prefixo público (`prefixoChave`, ex: `gc_live_9f8a1b`) para identificação visual e o **hash SHA-256** (`hashChave`) da chave completa.
- **Permissões Baseadas em Escopo**: Cada chave possui um array de escopos (`READ_RASTREABILIDADE`, `WRITE_LOTES`, `READ_ANALYTICS`) validado pelo middleware `requireApiKeyPermission` antes da execução do controller.
- **Rate Limiting por Cliente (`@fastify/rate-limit`)**: O extrator de chave (`keyGenerator`) agrupa a contagem de requisições por `X-API-Key` e aplica dinamicamente o teto contratual do parceiro (`limiteRequisicoesMin`, ex: 30 req/min no plano `BASIC`, 100 req/min no plano `ENTERPRISE`), devolvendo `HTTP 429 Too Many Requests` com cabeçalhos `X-RateLimit-Remaining` e `Retry-After`.
- **Versionamento Semântico**: Suportado explicitamente no prefixo da URL (`/api/v1/public`) e no cabeçalho `X-API-Version: 1.0.0`, rejeitando versões incompatíveis com `HTTP 400 Unsupported API Version`.

---

## 5. Orquestração de Filas Assíncronas e Política de Retry para Tarefas com Falha

### 5.1. Arquitetura do Fluxo Assíncrono (BullMQ / Worker + Polling)
Quando um parceiro solicita um relatório preditivo ou consolidado completo (`POST /api/v1/public/relatorios/assincrono`), o processamento de milhares de equipamentos e a serialização para CSV ou JSON não ocorrem na thread da requisição HTTP:
1. O servidor registra a entidade `TarefaRelatorio` com status `AGUARDANDO`, publica o job na fila (`FilaRelatorioService`) e responde imediatamente em menos de 15ms com **`HTTP 202 Accepted`**, informando o `tarefaId`, a `pollingUrl` e a `downloadUrl`.
2. O worker processa os cálculos estatísticos em background, atualiza o progresso percentual (`0% -> 25% -> 75% -> 100%`), grava o arquivo no diretório `exports/` e transiciona o status para `CONCLUIDO`.
3. O cliente consulta `GET /api/v1/public/relatorios/tarefas/:tarefaId` (*Polling*) e, quando `disponivelParaDownload: true`, baixa o relatório final em `GET /api/v1/public/relatorios/tarefas/:tarefaId/download` com `Content-Type: text/csv` ou `application/json`.

> **Design Resiliente Multiplataforma**: O `FilaRelatorioService` integra nativamente o **BullMQ + Redis** (`USE_BULLMQ_REDIS=true` via `docker compose up -d`) e conta com um **Worker Assíncrono In-Memory de Fallback Automático** quando o Redis não está ativo na máquina local, garantindo que qualquer avaliador possa executar `npm test` ou `npm run dev` instantaneamente em Windows ou Linux sem dependências externas obrigatórias.

### 5.2. Política de Retry com Backoff Exponencial
Falhas transitórias (como *locks* momentâneos de banco de dados ou picos de I/O em disco) são tratadas por uma política de **Retry com Backoff Exponencial**:
- **Máximo de Tentativas (`maxTentativas`)**: 3 tentativas por job.
- **Fórmula de Atraso Exponencial**:
  $$\text{Delay}(k) = \text{Delay}_{\text{base}} \times 2^{k - 1}$$
  Onde $k \in \{1, 2, 3\}$ é o número da tentativa que falhou.
- **Comportamento em Caso de Exaustão (*Dead Letter State*)**: Se a 3ª tentativa falhar, a tarefa não é descartada silenciosamente; ela é marcada como `status = 'FALHA'` na tabela `tarefas_relatorios`, preservando o número de tentativas executadas (`tentativas = 3`) e o rastreio diagnóstico em `erroMensagem`.

---

## 6. Plano de Evolução Arquitetural para Centenas ou Milhares de Parceiros

À medida que o ecossistema do **GreenCode** escalar de dezenas para **centenas ou milhares de organizações parceiras e cooperativas**, conectadas simultaneamente via API Pública, a arquitetura atual foi projetada para evoluir em quatro estágios sem quebra de contrato (*zero breaking changes* na API `/api/v1/public`):

1. **Separação Física entre API Nodes e Worker Nodes (Escalabilidade Horizontal)**:
   - Hoje o servidor HTTP Fastify e o consumidor da fila podem rodar no mesmo processo ou em processos separados. Sob alta carga (milhares de parceiros solicitando relatórios CSV), basta instanciar $N$ containers dedicados exclusivamente ao `BullMQ Worker` consumindo da mesma instância Redis Cluster, enquanto os nós da API HTTP permanecem 100% livres para responder consultas leves de rastreabilidade com latência sub-10ms.
2. **Réplicas de Leitura (*Read Replicas*) e CQRS para a Camada Analítica**:
   - Consultas analíticas agregadas (`AnalyticsService`) realizam varreduras em lotes e equipamentos históricos. Em escala de milhões de ativos, o Prisma Client da camada analítica deve apontar para uma **Read Replica** do PostgreSQL (ou para um Data Warehouse colunar como ClickHouse / TimescaleDB), isolando completamente o banco transacional primário (OLTP) das cargas analíticas (OLAP).
3. **API Gateway Distribuído e Cache de Rate Limiting no Redis**:
   - Para múltiplas instâncias da aplicação Fastify atrás de um Load Balancer, o plugin `@fastify/rate-limit` passa a utilizar o store distribuído no Redis (`redis: ioredisInstance`), garantindo que o limite de requisições por minuto de cada `X-API-Key` seja contabilizado globalmente em todo o cluster.
4. **Notificações Ativas via Webhooks Assinados (HMAC-SHA256) e Object Storage (S3)**:
   - Em vez de exigir que milhares de parceiros façam *polling* repetitivo em `/api/v1/public/relatorios/tarefas/:id`, o worker utilizará o campo `webhookUrl` já modelado na tabela `TarefaRelatorio` para disparar um `POST` HTTP assinado com HMAC-SHA256 assim que o relatório for concluído, entregando uma URL pré-assinada (*Presigned URL*) de download direto do Amazon S3 / Google Cloud Storage.

---

## 7. Compatibilidade Multiplataforma

O sistema mantém 100% de compatibilidade com **Windows 10 ou superior**, **Linux Ubuntu 24.04.03 LTS** e distribuições derivadas:
- Caminhos de exportação de arquivos CSV/JSON normalizados com `path.resolve` e `path.join`.
- Execução imediata com SQLite e Worker Assíncrono embarcado, ou em cluster completo PostgreSQL 16 + Redis 7 via [`docker-compose.yml`](../docker-compose.yml).
