import * as fs from 'fs';
import * as path from 'path';
import { Queue, Worker } from 'bullmq';
import { ENV } from '../config/env';
import { TarefaRelatorioRepository } from '../repositories/TarefaRelatorioRepository';
import { AnalyticsService } from './AnalyticsService';

export interface RelatorioJobPayload {
  tarefaId: string;
  tipoRelatorio: string;
  formatoSaida: 'JSON' | 'CSV';
  solicitante: string;
  organizacaoFiltroId?: string | null;
  parametros?: any;
  simularFalhaTransitoria?: boolean;
}

/**
 * Pilar 3 (AV3): Orquestração de Tarefas Assíncronas com Filas (BullMQ + Redis & Fallback Resiliente In-Memory)
 * - Publica tarefas de geração de relatórios pesados (JSON ou CSV) e retorna imediatamente o identificador (Job ID) com HTTP 202 Accepted.
 * - Implementa política de Retry com Backoff Exponencial (3 tentativas: 500ms, 1000ms, 2000ms).
 * - Compatível com BullMQ + Redis em cluster de produção e com worker in-memory automático caso o Redis não esteja ativo no ambiente local.
 */
export class FilaRelatorioService {
  private static instance: FilaRelatorioService;
  private tarefaRepo: TarefaRelatorioRepository;
  private analyticsService: AnalyticsService;
  private bullQueue: Queue | null = null;
  private bullWorker: Worker | null = null;
  private modoExecucao: 'BULLMQ_REDIS' | 'IN_MEMORY_WORKER' = 'IN_MEMORY_WORKER';
  private exportDir: string;

  private constructor() {
    this.tarefaRepo = new TarefaRelatorioRepository();
    this.analyticsService = new AnalyticsService();
    this.exportDir = path.resolve(process.cwd(), 'exports');
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
    this.inicializarFila();
  }

  public static getInstance(): FilaRelatorioService {
    if (!FilaRelatorioService.instance) {
      FilaRelatorioService.instance = new FilaRelatorioService();
    }
    return FilaRelatorioService.instance;
  }

  private inicializarFila() {
    if (ENV.USE_BULLMQ_REDIS) {
      try {
        const connection = {
          host: ENV.REDIS_HOST,
          port: ENV.REDIS_PORT,
          maxRetriesPerRequest: null
        };

        this.bullQueue = new Queue('greencode-relatorios-queue', {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 500
            },
            removeOnComplete: 100,
            removeOnFail: 200
          }
        });

        this.bullWorker = new Worker(
          'greencode-relatorios-queue',
          async job => {
            await this.processarJob(job.data as RelatorioJobPayload);
          },
          { connection }
        );

        this.modoExecucao = 'BULLMQ_REDIS';
      } catch {
        this.modoExecucao = 'IN_MEMORY_WORKER';
      }
    } else {
      this.modoExecucao = 'IN_MEMORY_WORKER';
    }
  }

  public getModoExecucao(): string {
    return this.modoExecucao;
  }

  public async enfileirarRelatorio(dados: {
    tipoRelatorio: string;
    formatoSaida?: 'JSON' | 'CSV';
    solicitante: string;
    organizacaoFiltroId?: string | null;
    parametros?: any;
    webhookUrl?: string | null;
    maxTentativas?: number;
  }) {
    const formato = (dados.formatoSaida || 'JSON').toUpperCase() as 'JSON' | 'CSV';
    if (!['JSON', 'CSV'].includes(formato)) {
      throw new Error('Formato de saída inválido. Utilize JSON ou CSV.');
    }

    const tiposValidos = [
      'PREDITIVO_COMPLETO',
      'EFICIENCIA_OPERACIONAL',
      'RENTABILIDADE_EQUIPAMENTOS',
      'CONSOLIDADO_PARCEIRO'
    ];
    if (!tiposValidos.includes(dados.tipoRelatorio)) {
      throw new Error(`Tipo de relatório '${dados.tipoRelatorio}' inválido. Opções: ${tiposValidos.join(', ')}`);
    }

    const tarefa = await this.tarefaRepo.create({
      tipoRelatorio: dados.tipoRelatorio,
      formatoSaida: formato,
      solicitante: dados.solicitante,
      organizacaoFiltroId: dados.organizacaoFiltroId || null,
      parametrosJson: JSON.stringify(dados.parametros || {}),
      maxTentativas: dados.maxTentativas ?? 3,
      webhookUrl: dados.webhookUrl || null
    });

    const payload: RelatorioJobPayload = {
      tarefaId: tarefa.id,
      tipoRelatorio: tarefa.tipoRelatorio,
      formatoSaida: formato,
      solicitante: tarefa.solicitante,
      organizacaoFiltroId: tarefa.organizacaoFiltroId,
      parametros: dados.parametros || {},
      simularFalhaTransitoria: dados.parametros?.simularFalhaTransitoria === true
    };

    if (this.modoExecucao === 'BULLMQ_REDIS' && this.bullQueue) {
      await this.bullQueue.add('gerar-relatorio', payload, {
        jobId: tarefa.id,
        attempts: tarefa.maxTentativas,
        backoff: {
          type: 'exponential',
          delay: 500
        }
      });
    } else {
      // Dispara processamento assíncrono em background sem bloquear a resposta HTTP
      setImmediate(() => {
        this.executarComRetryExponencial(payload, tarefa.maxTentativas).catch(() => {});
      });
    }

    return {
      tarefaId: tarefa.id,
      tipoRelatorio: tarefa.tipoRelatorio,
      formatoSaida: tarefa.formatoSaida,
      status: tarefa.status,
      modoFila: this.modoExecucao,
      politicaRetry: {
        maxTentativas: tarefa.maxTentativas,
        estrategia: 'EXPONENTIAL_BACKOFF',
        atrasoInicialMs: 150
      },
      pollingUrl: `/api/v1/public/relatorios/tarefas/${tarefa.id}`,
      downloadUrl: `/api/v1/public/relatorios/tarefas/${tarefa.id}/download`,
      criadoEm: tarefa.criadoEm
    };
  }

  private async executarComRetryExponencial(payload: RelatorioJobPayload, maxTentativas: number) {
    let tentativaAtual = 0;
    const baseDelayMs = 80;

    while (tentativaAtual < maxTentativas) {
      tentativaAtual++;
      try {
        await this.tarefaRepo.updateStatus(payload.tarefaId, {
          status: 'PROCESSANDO',
          tentativas: tentativaAtual,
          progressoPercentual: 25,
          iniciadoEm: tentativaAtual === 1 ? new Date() : undefined
        });

        // Caso o teste solicite simulação de falha transitória na tentativa 1 para validar a política de retry
        if (payload.simularFalhaTransitoria && tentativaAtual === 1) {
          throw new Error('Falha transitória simulada na tentativa #1 (timeout temporário de leitura analítica).');
        }

        if (payload.parametros?.forcarFalhaPermanente === true) {
          throw new Error('Falha permanente simulada para teste de exaustão de tentativas (Dead Letter Queue).');
        }

        await this.processarJob(payload, tentativaAtual);
        return;
      } catch (err: any) {
        if (tentativaAtual >= maxTentativas) {
          await this.tarefaRepo.updateStatus(payload.tarefaId, {
            status: 'FALHA',
            tentativas: tentativaAtual,
            progressoPercentual: 0,
            erroMensagem: `Exaustão após ${tentativaAtual} tentativas: ${err.message}`,
            concluidoEm: new Date()
          });
          return;
        }

        // Backoff exponencial: delay = baseDelay * 2^(tentativa - 1)
        const backoffMs = baseDelayMs * Math.pow(2, tentativaAtual - 1);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  private async processarJob(payload: RelatorioJobPayload, tentativaRegistrada: number = 1) {
    const orgId = payload.organizacaoFiltroId || undefined;
    let resultadoDados: any;

    if (payload.tipoRelatorio === 'PREDITIVO_COMPLETO') {
      resultadoDados = await this.analyticsService.analisarVidaUtilPreditiva(
        payload.parametros?.tipoEquipamento,
        payload.parametros?.alfaSuavizacao || 0.35,
        payload.solicitante,
        orgId
      );
    } else if (payload.tipoRelatorio === 'EFICIENCIA_OPERACIONAL') {
      resultadoDados = await this.analyticsService.analisarEficienciaOperacional(
        payload.parametros?.periodo || 'GLOBAL_2025',
        payload.solicitante,
        orgId
      );
    } else if (payload.tipoRelatorio === 'RENTABILIDADE_EQUIPAMENTOS') {
      resultadoDados = await this.analyticsService.analisarRentabilidadePorEquipamento(
        payload.parametros?.tipoEquipamento,
        payload.solicitante,
        orgId
      );
    } else {
      // CONSOLIDADO_PARCEIRO: executa os 3 motores analíticos
      const [eficiencia, rentabilidade, preditivo] = await Promise.all([
        this.analyticsService.analisarEficienciaOperacional('CONSOLIDADO_2025', payload.solicitante, orgId),
        this.analyticsService.analisarRentabilidadePorEquipamento(undefined, payload.solicitante, orgId),
        this.analyticsService.analisarVidaUtilPreditiva(undefined, 0.35, payload.solicitante, orgId)
      ]);
      resultadoDados = {
        tipo: 'RELATORIO_CONSOLIDADO_360',
        geradoEm: new Date().toISOString(),
        eficienciaOperacional: eficiencia,
        rentabilidadePorEquipamento: rentabilidade,
        analisePreditivaVidaUtil: preditivo
      };
    }

    await this.tarefaRepo.updateStatus(payload.tarefaId, {
      progressoPercentual: 75
    });

    let conteudoFinal = '';
    let extensao = 'json';

    if (payload.formatoSaida === 'CSV') {
      extensao = 'csv';
      conteudoFinal = this.converterParaCSV(payload.tipoRelatorio, resultadoDados);
    } else {
      conteudoFinal = JSON.stringify(resultadoDados, null, 2);
    }

    const nomeArquivo = `relatorio_${payload.tipoRelatorio.toLowerCase()}_${payload.tarefaId}.${extensao}`;
    const caminhoCompleto = path.join(this.exportDir, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, conteudoFinal, 'utf-8');

    await this.tarefaRepo.updateStatus(payload.tarefaId, {
      status: 'CONCLUIDO',
      tentativas: tentativaRegistrada,
      progressoPercentual: 100,
      caminhoArquivo: caminhoCompleto,
      conteudoResultado: conteudoFinal,
      erroMensagem: null,
      concluidoEm: new Date()
    });
  }

  private converterParaCSV(tipoRelatorio: string, dados: any): string {
    const linhas: string[] = [];

    if (tipoRelatorio === 'PREDITIVO_COMPLETO' && Array.isArray(dados.modelosPreditivos)) {
      linhas.push(
        'tipo_equipamento,equipamento_id,codigo_barras,marca,modelo,ano_fabricacao,estado_fisico,idade_atual_anos,indice_degradacao,vida_util_remanescente_anos,data_projetada_inservivel,risco_falha,slope_ols,r2_ols'
      );
      for (const mod of dados.modelosPreditivos) {
        const slope = mod.parametrosEstatisticos?.coeficienteAngularSlope ?? 0;
        const r2 = mod.parametrosEstatisticos?.coeficienteDeterminacaoR2 ?? 0;
        for (const eq of mod.projecoesEquipamentos || []) {
          linhas.push(
            [
              mod.tipoEquipamento,
              eq.equipamentoId,
              eq.codigoBarrasInterno,
              `"${eq.marca}"`,
              `"${eq.modelo}"`,
              eq.anoFabricacao,
              eq.estadoFisicoAtual,
              eq.idadeAtualAnos,
              eq.indiceDegradacaoAtual,
              eq.vidaUtilRemanescenteEstimadaAnos,
              eq.dataProjetadaEstadoInservivel,
              eq.riscoFalhaImediata,
              slope,
              r2
            ].join(',')
          );
        }
      }
    } else if (tipoRelatorio === 'RENTABILIDADE_EQUIPAMENTOS' && Array.isArray(dados.rankingRentabilidade)) {
      linhas.push(
        'tipo_equipamento,total_unidades,peso_medio_kg,valor_medio_recuperacao_brl,valor_mediano_brl,desvio_padrao_brl,valor_total_potencial_brl,indice_priorizacao,recomendacao'
      );
      for (const r of dados.rankingRentabilidade) {
        linhas.push(
          [
            r.tipoEquipamento,
            r.totalUnidadesAmostra,
            r.pesoMedioKg,
            r.valorMedioRecuperacaoBRL,
            r.valorMedianoRecuperacaoBRL,
            r.desvioPadraoRecuperacaoBRL,
            r.valorTotalPotencialBRL,
            r.indicePriorizacao,
            r.recomendacaoPrioridade
          ].join(',')
        );
      }
    } else if (tipoRelatorio === 'EFICIENCIA_OPERACIONAL') {
      linhas.push('operador,lotes_processados,itens_triados,tempo_medio_horas,tempo_mediano_horas,produtividade_itens_por_hora');
      for (const op of dados.comparativoOperadores || []) {
        linhas.push(
          [
            op.operador,
            op.lotesProcessados,
            op.itensTriados,
            op.tempoMedioHoras,
            op.tempoMedianoHoras,
            op.produtividadeItensPorHora
          ].join(',')
        );
      }
    } else {
      linhas.push('chave,valor');
      linhas.push(`tipo_relatorio,${tipoRelatorio}`);
      linhas.push(`gerado_em,${new Date().toISOString()}`);
      linhas.push(`resumo_json,"${JSON.stringify(dados).replace(/"/g, '""')}"`);
    }

    return linhas.join('\n');
  }

  public async consultarStatusTarefa(tarefaId: string) {
    const tarefa = await this.tarefaRepo.findById(tarefaId);
    if (!tarefa) {
      throw new Error(`Tarefa de relatório '${tarefaId}' não encontrada.`);
    }

    return {
      tarefaId: tarefa.id,
      tipoRelatorio: tarefa.tipoRelatorio,
      formatoSaida: tarefa.formatoSaida,
      status: tarefa.status,
      progressoPercentual: tarefa.progressoPercentual,
      tentativasRealizadas: tarefa.tentativas,
      maxTentativas: tarefa.maxTentativas,
      solicitante: tarefa.solicitante,
      erroMensagem: tarefa.erroMensagem,
      disponivelParaDownload: tarefa.status === 'CONCLUIDO',
      downloadUrl:
        tarefa.status === 'CONCLUIDO'
          ? `/api/v1/public/relatorios/tarefas/${tarefa.id}/download`
          : null,
      iniciadoEm: tarefa.iniciadoEm,
      concluidoEm: tarefa.concluidoEm,
      criadoEm: tarefa.criadoEm
    };
  }

  public async obterDownloadTarefa(tarefaId: string) {
    const tarefa = await this.tarefaRepo.findById(tarefaId);
    if (!tarefa) {
      throw new Error(`Tarefa de relatório '${tarefaId}' não encontrada.`);
    }

    if (tarefa.status !== 'CONCLUIDO') {
      throw new Error(
        `O relatório ainda não está pronto para download (Status atual: ${tarefa.status}, Progresso: ${tarefa.progressoPercentual}%).`
      );
    }

    let conteudo = tarefa.conteudoResultado || '';
    if (!conteudo && tarefa.caminhoArquivo && fs.existsSync(tarefa.caminhoArquivo)) {
      conteudo = fs.readFileSync(tarefa.caminhoArquivo, 'utf-8');
    }

    return {
      tarefaId: tarefa.id,
      formatoSaida: tarefa.formatoSaida,
      contentType: tarefa.formatoSaida === 'CSV' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      nomeArquivo: `greencode_${tarefa.tipoRelatorio.toLowerCase()}_${tarefa.id}.${tarefa.formatoSaida.toLowerCase()}`,
      conteudo
    };
  }

  public async listarTarefas(limite: number = 20, solicitante?: string) {
    return this.tarefaRepo.listRecent(limite, solicitante);
  }

  public async encerrar() {
    if (this.bullWorker) {
      await this.bullWorker.close();
    }
    if (this.bullQueue) {
      await this.bullQueue.close();
    }
  }
}
