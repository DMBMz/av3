process.env.NODE_ENV = 'test';
import { buildServer } from '../src/server';
import { prisma } from '../src/config/prisma';
import { FilaRelatorioService } from '../src/services/FilaRelatorioService';

async function aguardarTarefaConcluir(app: any, tarefaId: string, apiKey: string, timeoutMs: number = 6000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/relatorios/tarefas/${tarefaId}`,
      headers: {
        'x-api-key': apiKey,
        'x-api-version': '1.0.0'
      }
    });
    const body = res.json();
    if (body.status === 'CONCLUIDO' || body.status === 'FALHA') {
      return body;
    }
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error(`Timeout aguardando conclusão da tarefa assíncrona ${tarefaId}`);
}

async function runAv3Tests() {
  console.log('\n================================================================================');
  console.log('   SUÍTE DE TESTES DE INTEGRAÇÃO - GREENCODE ANALYTICS, PUBLIC API & FILAS (AV3)');
  console.log('================================================================================\n');

  const app = buildServer();
  await app.ready();

  // Limpeza de registros criados em execuções anteriores do teste
  await prisma.equipamento.deleteMany({ where: { loteId: 'LOT-PUBLIC-API-99' } });
  await prisma.lote.deleteMany({ where: { id: 'LOT-PUBLIC-API-99' } });
  await prisma.apiKeyParceiro.deleteMany({ where: { nomeParceiro: 'Parceiro Teste Automatizado AV3' } });

  let tokenAdmin = '';
  let novaApiKeyGerada = '';
  let novaApiKeyId = '';
  const apiKeyReadOnlySeed = 'gc_live_cooperativa_ecoverde_readonly_2025';

  // ==========================================================================
  // 1. HEALTH CHECK E EASTER EGG
  // ==========================================================================
  console.log('[TESTE 1] Verificando integridade (/health), fila assíncrona e Easter Egg...');
  const resHealth = await app.inject({
    method: 'GET',
    url: '/health'
  });
  if (resHealth.statusCode === 200 && resHealth.json().status === 'UP') {
    console.log('✔ Health check OK:', resHealth.json());
  } else {
    throw new Error(`Falha no health check: ${resHealth.body}`);
  }

  // ==========================================================================
  // 2. AUTENTICAÇÃO INTERNA JWT (/api/v1/internal/auth/login)
  // ==========================================================================
  console.log('\n[TESTE 2] Autenticando administrador na rota interna (/api/v1/internal/auth/login)...');
  const resLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/auth/login',
    payload: { usuario: 'admin', senha: 'admin123' }
  });
  if (resLogin.statusCode === 200 && resLogin.json().token) {
    tokenAdmin = resLogin.json().token;
    console.log(`✔ Administrador autenticado via JWT. Token: ${tokenAdmin.substring(0, 22)}...`);
  } else {
    throw new Error(`Falha no login interno: ${resLogin.body}`);
  }

  // ==========================================================================
  // 3. PILAR 1: CAMADA ANALÍTICA (EFICIÊNCIA, RENTABILIDADE E REGRESSÃO OLS)
  // ==========================================================================
  console.log('\n[TESTE 3] Pilar 1 - Categoria 1: Análise de Eficiência Operacional (simple-statistics)...');
  const resEficiencia = await app.inject({
    method: 'GET',
    url: '/api/v1/internal/analytics/eficiencia-operacional?periodo=2025-GLOBAL',
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (resEficiencia.statusCode === 200) {
    const ef = resEficiencia.json();
    console.log(`✔ Tempo Médio de Triagem: ${ef.metricasGlobais.tempoMedioTriagemHoras}h | Mediana: ${ef.metricasGlobais.tempoMedianoTriagemHoras}h | Desvio Padrão: ${ef.metricasGlobais.desvioPadraoTriagemHoras}h`);
    console.log(`✔ Operador Mais Eficiente: ${ef.metricasGlobais.operadorMaisEficiente}`);
    console.log(`✔ Gargalo Identificado: ${ef.metricasGlobais.gargaloIdentificado}`);
  } else {
    throw new Error(`Falha na análise de eficiência: ${resEficiencia.body}`);
  }

  console.log('\n[TESTE 4] Pilar 1 - Categoria 2: Análise de Rentabilidade por Tipo de Equipamento...');
  const resRentabilidade = await app.inject({
    method: 'GET',
    url: '/api/v1/internal/analytics/rentabilidade',
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (resRentabilidade.statusCode === 200) {
    const rent = resRentabilidade.json();
    for (const item of rent.rankingRentabilidade) {
      console.log(
        `✔ [${item.tipoEquipamento}] Unidades: ${item.totalUnidadesAmostra} | Valor Médio: R$ ${item.valorMedioRecuperacaoBRL} | Score Priorização: ${item.indicePriorizacao} (${item.recomendacaoPrioridade})`
      );
    }
  } else {
    throw new Error(`Falha na análise de rentabilidade: ${resRentabilidade.body}`);
  }

  console.log('\n[TESTE 5] Pilar 1 - Categoria 3: Análise Preditiva de Vida Útil (OLS + Suavização Exponencial)...');
  const resPreditivo = await app.inject({
    method: 'GET',
    url: '/api/v1/internal/analytics/preditivo-vida-util?alfa=0.35',
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (resPreditivo.statusCode === 200) {
    const pred = resPreditivo.json();
    for (const mod of pred.modelosPreditivos) {
      console.log(
        `✔ [${mod.tipoEquipamento}] Equação OLS: ${mod.equacaoRegressaoOLS} | R²: ${mod.parametrosEstatisticos.coeficienteDeterminacaoR2} | Vida Útil Remanescente Média: ${mod.projecaoCategoria.vidaUtilRemanescenteMediaAnos} anos (Inservível em ~${mod.projecaoCategoria.anoProjetadoEstadoInservivel})`
      );
    }
  } else {
    throw new Error(`Falha na análise preditiva OLS: ${resPreditivo.body}`);
  }

  console.log('\n[TESTE 6] Pilar 1 - Disparo do Agendador em Segundo Plano (node-cron) e Consulta Histórica...');
  const resCron = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/analytics/cron/executar',
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (resCron.statusCode === 200) {
    console.log('✔ Job analítico node-cron executado e persistido:', resCron.json().resumo);
  } else {
    throw new Error(`Falha no disparo do cron: ${resCron.body}`);
  }

  const resHistorico = await app.inject({
    method: 'GET',
    url: '/api/v1/internal/analytics/historico?limite=5',
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (
    resHistorico.statusCode === 200 &&
    resHistorico.json().totalPreditivosPersistidos > 0
  ) {
    console.log(
      `✔ Histórico persistido no banco validado: ${resHistorico.json().totalEficienciaPersistidos} relatórios de eficiência, ${resHistorico.json().totalRentabilidadePersistidos} de rentabilidade e ${resHistorico.json().totalPreditivosPersistidos} preditivos.`
    );
  } else {
    throw new Error(`Falha na consulta histórica: ${resHistorico.body}`);
  }

  // ==========================================================================
  // 4. PILAR 2: API PÚBLICA, GESTÃO DE API KEYS, VERSIONAMENTO E RATE LIMITING
  // ==========================================================================
  console.log('\n[TESTE 7] Pilar 2 - Geração de Nova Chave de API para Parceiro Externo...');
  const resCriarKey = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/api-keys',
    headers: { authorization: `Bearer ${tokenAdmin}` },
    payload: {
      nomeParceiro: 'Parceiro Teste Automatizado AV3',
      organizacaoId: 'ORG-TELECOM-01',
      permissoes: ['READ_RASTREABILIDADE', 'WRITE_LOTES', 'READ_ANALYTICS'],
      limiteRequisicoesMin: 50,
      planoAcesso: 'ENTERPRISE',
      diasValidade: 90
    }
  });
  if (resCriarKey.statusCode === 201 && resCriarKey.json().apiKey.chaveApi) {
    novaApiKeyGerada = resCriarKey.json().apiKey.chaveApi;
    novaApiKeyId = resCriarKey.json().apiKey.id;
    console.log(`✔ Chave de API gerada com sucesso: ${resCriarKey.json().apiKey.prefixoChave}... (Plano: ENTERPRISE)`);
  } else {
    throw new Error(`Falha ao gerar API Key: ${resCriarKey.body}`);
  }

  console.log('\n[TESTE 8] Pilar 2 - Consulta de Rastreabilidade na API Pública (/api/v1/public/rastreabilidade/:id)...');
  const resPublicRastreio = await app.inject({
    method: 'GET',
    url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
    headers: {
      'x-api-key': novaApiKeyGerada,
      'x-api-version': '1.0.0'
    }
  });
  if (resPublicRastreio.statusCode === 200) {
    const r = resPublicRastreio.json();
    console.log(
      `✔ Rastreabilidade pública retornada (v${r.versaoApi}) para '${r.parceiroAutenticado}': ${r.equipamento.codigoBarrasInterno} | Valor Recuperação: R$ ${r.valorEstimadoRecuperacaoBRL}`
    );
  } else {
    throw new Error(`Falha na rastreabilidade pública: ${resPublicRastreio.body}`);
  }

  console.log('\n[TESTE 9] Pilar 2 - Validação de Segregação de Permissões (Chave Read-Only tentando escrever lote)...');
  const resPermissaoNegada = await app.inject({
    method: 'POST',
    url: '/api/v1/public/lotes',
    headers: {
      'x-api-key': apiKeyReadOnlySeed,
      'x-api-version': '1.0.0'
    },
    payload: {
      notaFiscal: 'NF-BLOQUEADA',
      transportadora: 'TransTeste',
      equipamentos: []
    }
  });
  if (resPermissaoNegada.statusCode === 403) {
    console.log('✔ Parceiro Read-Only bloqueado de criar lotes com HTTP 403 Forbidden.');
  } else {
    throw new Error(`Falha: Esperado 403 para chave sem WRITE_LOTES, recebido ${resPermissaoNegada.statusCode}`);
  }

  console.log('\n[TESTE 10] Pilar 2 - Submissão de Novo Lote via API Pública B2B com Chave Autorizada...');
  const resPublicLote = await app.inject({
    method: 'POST',
    url: '/api/v1/public/lotes',
    headers: {
      'x-api-key': novaApiKeyGerada,
      'x-api-version': '1.0.0'
    },
    payload: {
      id: 'LOT-PUBLIC-API-99',
      dataEntrada: new Date().toISOString(),
      notaFiscal: 'NF-B2B-554433',
      transportadora: 'Logística Reversa B2B',
      observacoes: 'Lote submetido via integração externa de parceiro na AV3',
      equipamentos: [
        {
          tipo: 'NOTEBOOK',
          marca: 'Apple',
          modelo: 'MacBook Pro 14 M1',
          anoFabricacao: 2022,
          estadoFisico: 'BOM_ESTADO',
          pesoQuilogramas: 1.60
        }
      ]
    }
  });
  if (resPublicLote.statusCode === 201) {
    console.log(`✔ Lote B2B criado com sucesso via API Pública: ${resPublicLote.json().lote.id}`);
  } else {
    throw new Error(`Falha na criação de lote via API Pública: ${resPublicLote.body}`);
  }

  console.log('\n[TESTE 11] Pilar 2 - Validação de Versionamento Semântico e Rate Limiting (@fastify/rate-limit)...');
  const resVersaoInvalida = await app.inject({
    method: 'GET',
    url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
    headers: {
      'x-api-key': novaApiKeyGerada,
      'x-api-version': '2.5.0'
    }
  });
  if (resVersaoInvalida.statusCode === 400) {
    console.log('✔ Versão semântica incompatível (2.5.0) rejeitada com HTTP 400.');
  } else {
    throw new Error('Falha na validação de versão semântica!');
  }

  // Testando Rate Limit com header x-test-rate-limit = 2
  const keyRateLimitTest = apiKeyReadOnlySeed;
  await app.inject({
    method: 'GET',
    url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
    headers: { 'x-api-key': keyRateLimitTest, 'x-test-rate-limit': '2' }
  });
  await app.inject({
    method: 'GET',
    url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
    headers: { 'x-api-key': keyRateLimitTest, 'x-test-rate-limit': '2' }
  });
  const resRateLimited = await app.inject({
    method: 'GET',
    url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
    headers: { 'x-api-key': keyRateLimitTest, 'x-test-rate-limit': '2' }
  });
  if (resRateLimited.statusCode === 429) {
    console.log('✔ Rate Limiting (@fastify/rate-limit) acionado com HTTP 429 Too Many Requests:', resRateLimited.json().message);
  } else {
    throw new Error(`Falha no Rate Limit: esperado 429, recebido ${resRateLimited.statusCode}`);
  }

  // ==========================================================================
  // 5. PILAR 3: ORQUESTRAÇÃO ASSÍNCRONA COM FILAS, RETRY EXPONENCIAL, POLLING E DOWNLOAD CSV/JSON
  // ==========================================================================
  console.log('\n[TESTE 12] Pilar 3 - Enfileiramento Assíncrono de Relatório Preditivo CSV com Retry Automático...');
  const resEnqueue = await app.inject({
    method: 'POST',
    url: '/api/v1/public/relatorios/assincrono',
    headers: {
      'x-api-key': novaApiKeyGerada,
      'x-api-version': '1.0.0'
    },
    payload: {
      tipoRelatorio: 'PREDITIVO_COMPLETO',
      formatoSaida: 'CSV',
      parametros: {
        alfaSuavizacao: 0.35,
        simularFalhaTransitoria: true // Força falha na tentativa #1 para testar recuperação automática na tentativa #2
      }
    }
  });
  if (resEnqueue.statusCode !== 202) {
    throw new Error(`Falha no enfileiramento assíncrono: ${resEnqueue.body}`);
  }
  const jobData = resEnqueue.json();
  console.log(`✔ Job publicado na fila com HTTP 202 Accepted! Tarefa ID: ${jobData.tarefaId} | Modo: ${jobData.modoFila}`);

  console.log('[TESTE 13] Pilar 3 - Realizando Polling no endpoint de status até a conclusão...');
  const statusFinal = await aguardarTarefaConcluir(app, jobData.tarefaId, novaApiKeyGerada);
  if (statusFinal.status === 'CONCLUIDO' && statusFinal.tentativasRealizadas === 2) {
    console.log(
      `✔ Job concluído com sucesso após recuperação de falha transitória via Backoff Exponencial (Tentativas realizadas: ${statusFinal.tentativasRealizadas}/${statusFinal.maxTentativas})!`
    );
  } else {
    throw new Error(`Status inesperado da tarefa: ${JSON.stringify(statusFinal)}`);
  }

  console.log('[TESTE 14] Pilar 3 - Fazendo Download do arquivo CSV gerado pelo Worker...');
  const resDownloadCsv = await app.inject({
    method: 'GET',
    url: `/api/v1/public/relatorios/tarefas/${jobData.tarefaId}/download`,
    headers: {
      'x-api-key': novaApiKeyGerada,
      'x-api-version': '1.0.0'
    }
  });
  if (
    resDownloadCsv.statusCode === 200 &&
    resDownloadCsv.headers['content-type']?.toString().includes('text/csv') &&
    resDownloadCsv.body.includes('tipo_equipamento,equipamento_id,codigo_barras')
  ) {
    const linhasCsv = resDownloadCsv.body.trim().split('\n');
    console.log(`✔ Arquivo CSV baixado com sucesso (${linhasCsv.length} linhas). Cabeçalho: ${linhasCsv[0]}`);
  } else {
    throw new Error(`Falha no download do CSV: ${resDownloadCsv.body}`);
  }

  // ==========================================================================
  // 6. DOCUMENTAÇÃO INTERATIVA OPENAPI / SWAGGER E REVOGAÇÃO DE API KEY
  // ==========================================================================
  console.log('\n[TESTE 15] Verificando geração automática da especificação OpenAPI 3.0 (/docs/json)...');
  const resOpenApi = await app.inject({
    method: 'GET',
    url: '/docs/json'
  });
  if (resOpenApi.statusCode === 200 && resOpenApi.json().openapi) {
    const spec = resOpenApi.json();
    console.log(`✔ Especificação OpenAPI ${spec.openapi} validada! Título: "${spec.info.title}" | Rotas documentadas: ${Object.keys(spec.paths).length}`);
  } else {
    throw new Error('Falha ao carregar especificação OpenAPI do Swagger.');
  }

  console.log('\n[TESTE 16] Revogação administrativa de Chave de API e bloqueio imediato...');
  const resRevogar = await app.inject({
    method: 'DELETE',
    url: `/api/v1/admin/api-keys/${novaApiKeyId}`,
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  if (resRevogar.statusCode === 200) {
    const resAposRevogacao = await app.inject({
      method: 'GET',
      url: '/api/v1/public/rastreabilidade/EQP-NBK-001',
      headers: { 'x-api-key': novaApiKeyGerada }
    });
    if (resAposRevogacao.statusCode === 401) {
      console.log('✔ Chave de API revogada e acesso subsequente bloqueado com HTTP 401 Unauthorized.');
    } else {
      throw new Error('Falha: Chave revogada ainda permitiu acesso!');
    }
  }

  await FilaRelatorioService.getInstance().encerrar();
  await app.close();
  await prisma.$disconnect();

  console.log('\n================================================================================');
  console.log('   ✅ TODOS OS 16 CENÁRIOS DE TESTE DA AV3 PASSARAM COM 100% DE SUCESSO!');
  console.log('================================================================================\n');
  process.exit(0);
}

runAv3Tests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES DA AV3:', err);
  process.exit(1);
});
