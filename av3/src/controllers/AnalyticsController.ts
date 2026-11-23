import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AnalyticsService } from '../services/AnalyticsService';
import { CronSchedulerService } from '../services/CronSchedulerService';
import { FilaRelatorioService } from '../services/FilaRelatorioService';
import { authenticate, authorize } from '../middlewares/auth';
import { PapelUsuario } from '../types';

export class AnalyticsController {
  private analyticsService: AnalyticsService;
  private cronService: CronSchedulerService;
  private filaService: FilaRelatorioService;

  constructor(cronService: CronSchedulerService) {
    this.analyticsService = new AnalyticsService();
    this.cronService = cronService;
    this.filaService = FilaRelatorioService.getInstance();
  }

  public registerRoutes(server: FastifyInstance) {
    // 1. Análise de Eficiência Operacional (Pilar 1 - Categoria 1)
    server.get(
      '/api/v1/internal/analytics/eficiencia-operacional',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Calcula e persiste análise de eficiência operacional de triagem',
          description:
            'Calcula tempo médio, mediano e desvio padrão (simple-statistics) entre recepção e conclusão da triagem, identificando gargalos e comparando operadores e períodos do ano.',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              periodo: { type: 'string', example: '2025-Q1' },
              organizacaoId: { type: 'string', example: 'ORG-TELECOM-01' }
            }
          }
        }
      },
      this.eficienciaOperacional.bind(this)
    );

    // 2. Análise de Rentabilidade por Tipo de Equipamento (Pilar 1 - Categoria 2)
    server.get(
      '/api/v1/internal/analytics/rentabilidade',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Calcula e persiste análise de rentabilidade por tipo de equipamento, marca, modelo e estado físico',
          description:
            'Estima o valor médio e mediano de recuperação de materiais e gera o índice de priorização financeira para tomada de decisão.',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              tipoEquipamento: {
                type: 'string',
                enum: [
                  'COMPUTADOR_MESA',
                  'NOTEBOOK',
                  'MONITOR',
                  'IMPRESSORA',
                  'SERVIDOR',
                  'ROTEADOR',
                  'CABO_ESTRUTURADO',
                  'FONTE_ALIMENTACAO'
                ]
              },
              organizacaoId: { type: 'string' }
            }
          }
        }
      },
      this.rentabilidade.bind(this)
    );

    // 3. Análise Preditiva de Vida Útil Remanescente com OLS e Suavização Exponencial (Pilar 1 - Categoria 3)
    server.get(
      '/api/v1/internal/analytics/preditivo-vida-util',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Projeta vida útil remanescente via Mínimos Quadrados Ordinários (OLS) e Suavização Exponencial',
          description:
            'Aplica regressão linear OLS e suavização exponencial simples sobre dados históricos de depreciação e falhas para prever quando cada categoria e equipamento atingirá o estado INSERVIVEL, persistindo os resultados para comparação histórica.',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              tipoEquipamento: { type: 'string', example: 'NOTEBOOK' },
              alfa: { type: 'number', example: 0.35 }
            }
          }
        }
      },
      this.preditivoVidaUtil.bind(this)
    );

    // 4. Histórico de Relatórios Analíticos Persistidos
    server.get(
      '/api/v1/internal/analytics/historico',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Consulta o histórico de relatórios analíticos e preditivos armazenados no banco de dados',
          description:
            'Permite comparar previsões passadas com realizações futuras e auditar a evolução dos coeficientes OLS.',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              limite: { type: 'integer', example: 10 }
            }
          }
        }
      },
      this.historicoAnalitico.bind(this)
    );

    // 5. Disparo Manual / Status do Agendador node-cron
    server.post(
      '/api/v1/admin/analytics/cron/executar',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Dispara imediatamente um ciclo completo do agendador analítico em segundo plano (node-cron)',
          security: [{ bearerAuth: [] }]
        }
      },
      this.executarCronManual.bind(this)
    );

    server.get(
      '/api/v1/admin/analytics/cron/status',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Pilar 1 (AV3) / Camada Analítica e Inteligência de Negócios'],
          summary: 'Consulta status do agendador node-cron e fila BullMQ',
          security: [{ bearerAuth: [] }]
        }
      },
      this.statusCronEFila.bind(this)
    );
  }

  public async eficienciaOperacional(request: FastifyRequest, reply: FastifyReply) {
    const { periodo, organizacaoId } = request.query as any;
    const relatorio = await this.analyticsService.analisarEficienciaOperacional(
      periodo || 'GLOBAL_2025',
      request.user.usuario,
      organizacaoId
    );
    return reply.send(relatorio);
  }

  public async rentabilidade(request: FastifyRequest, reply: FastifyReply) {
    const { tipoEquipamento, organizacaoId } = request.query as any;
    const relatorio = await this.analyticsService.analisarRentabilidadePorEquipamento(
      tipoEquipamento,
      request.user.usuario,
      organizacaoId
    );
    return reply.send(relatorio);
  }

  public async preditivoVidaUtil(request: FastifyRequest, reply: FastifyReply) {
    const { tipoEquipamento, alfa } = request.query as any;
    const alfaNum = alfa ? parseFloat(alfa) : 0.35;
    const relatorio = await this.analyticsService.analisarVidaUtilPreditiva(
      tipoEquipamento,
      alfaNum,
      request.user.usuario
    );
    return reply.send(relatorio);
  }

  public async historicoAnalitico(request: FastifyRequest, reply: FastifyReply) {
    const { limite } = request.query as any;
    const historico = await this.analyticsService.consultarHistoricoAnalitico(
      limite ? parseInt(limite, 10) : 10
    );
    return reply.send(historico);
  }

  public async executarCronManual(request: FastifyRequest, reply: FastifyReply) {
    const resultado = await this.cronService.executarCicloAnalitico(`ADMIN_${request.user.usuario}`);
    return reply.send({
      message: 'Ciclo analítico de segundo plano executado e persistido com sucesso!',
      ...resultado
    });
  }

  public async statusCronEFila(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      cronScheduler: this.cronService.obterStatus(),
      modoFilaAssincrona: this.filaService.getModoExecucao(),
      tarefasRecentes: await this.filaService.listarTarefas(10)
    });
  }
}
