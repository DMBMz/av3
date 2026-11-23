import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateApiKey, requireApiKeyPermission } from '../middlewares/apiKeyAuth';
import { EquipamentoService } from '../services/EquipamentoService';
import { LoteService } from '../services/LoteService';
import { AnalyticsService } from '../services/AnalyticsService';
import { FilaRelatorioService } from '../services/FilaRelatorioService';
import { PermissaoApiKey } from '../types';

/**
 * Pilares 2 e 3 (AV3): Controlador da API Pública para Parceiros Externos (/api/v1/public)
 * - Segregado das rotas internas (/api/v1/internal e /api/v1/admin).
 * - Autenticado via Chave de API (X-API-Key) com verificação granular de escopos de permissão.
 * - Protegido por Rate Limiting dinâmico por parceiro (@fastify/rate-limit).
 * - Suporta versionamento semântico explícito na URL (/api/v1/public) e no cabeçalho (X-API-Version).
 * - Integra fila assíncrona (BullMQ / Worker) para relatórios pesados com Polling e Download CSV/JSON.
 */
export class PublicApiController {
  private equipService: EquipamentoService;
  private loteService: LoteService;
  private analyticsService: AnalyticsService;
  private filaService: FilaRelatorioService;

  constructor() {
    this.equipService = new EquipamentoService();
    this.loteService = new LoteService();
    this.analyticsService = new AnalyticsService();
    this.filaService = FilaRelatorioService.getInstance();
  }

  public registerRoutes(server: FastifyInstance) {
    // 1. Consulta Pública de Rastreabilidade de Equipamento
    server.get(
      '/api/v1/public/rastreabilidade/:idOuCodigo',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.READ_RASTREABILIDADE)
        ],
        schema: {
          tags: ['Pilar 2 (AV3) / API Pública de Parceiros (/api/v1/public)'],
          summary: 'Consulta status de rastreabilidade e ciclo de vida de um equipamento',
          description:
            'Permite que parceiros externos e sistemas ERP clientes consultem a trilha auditável de um ativo pelo ID ou código de barras interno. Requer permissão READ_RASTREABILIDADE.',
          security: [{ apiKeyAuth: [] }],
          headers: {
            type: 'object',
            properties: {
              'x-api-key': { type: 'string', description: 'Chave de API única do parceiro externo' },
              'x-api-version': { type: 'string', description: 'Versão semântica da API (ex: 1.0.0)', default: '1.0.0' }
            }
          },
          params: {
            type: 'object',
            required: ['idOuCodigo'],
            properties: {
              idOuCodigo: { type: 'string', example: 'EQP-NBK-001' }
            }
          },
          response: {
            200: {
              description: 'Dados de rastreabilidade e histórico de movimentações do equipamento',
              type: 'object',
              properties: {
                versaoApi: { type: 'string', example: '1.0.0' },
                parceiroAutenticado: { type: 'string', example: 'Telecom Brasil ERP Integration' },
                depreciacaoPercentual: { type: 'number', example: 42.5 },
                valorEstimadoRecuperacaoBRL: { type: 'number', example: 185.4 },
                equipamento: { type: 'object', additionalProperties: true },
                historicoMovimentacoes: { type: 'array', items: { type: 'object', additionalProperties: true } }
              }
            },
            401: {
              description: 'Chave de API ausente, inválida ou revogada',
              type: 'object',
              properties: {
                statusCode: { type: 'integer', example: 401 },
                error: { type: 'string', example: 'Unauthorized' },
                message: { type: 'string' }
              }
            },
            403: {
              description: 'Chave de API sem permissão para o escopo solicitado',
              type: 'object',
              properties: {
                statusCode: { type: 'integer', example: 403 },
                error: { type: 'string', example: 'Forbidden' },
                message: { type: 'string' }
              }
            },
            404: {
              description: 'Equipamento não encontrado',
              type: 'object',
              properties: {
                statusCode: { type: 'integer', example: 404 },
                error: { type: 'string', example: 'Not Found' },
                message: { type: 'string' }
              }
            },
            429: {
              description: 'Limite de taxa de requisições excedido (Rate Limit)',
              type: 'object',
              properties: {
                statusCode: { type: 'integer', example: 429 },
                error: { type: 'string', example: 'Too Many Requests' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      this.consultarRastreabilidade.bind(this)
    );

    // 2. Submissão Pública de Novo Lote por Parceiro Externo
    server.post(
      '/api/v1/public/lotes',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.WRITE_LOTES)
        ],
        schema: {
          tags: ['Pilar 2 (AV3) / API Pública de Parceiros (/api/v1/public)'],
          summary: 'Submete um novo lote de equipamentos via integração B2B de parceiro',
          description:
            'Permite que organizações parceiras importem inventários e criem lotes de coleta diretamente de seus sistemas de gestão de ativos. Requer permissão WRITE_LOTES.',
          security: [{ apiKeyAuth: [] }],
          body: {
            type: 'object',
            required: ['notaFiscal', 'transportadora', 'equipamentos'],
            properties: {
              id: { type: 'string', example: 'LOT-PARTNER-2025-10' },
              organizacaoId: { type: 'string', example: 'ORG-TELECOM-01' },
              dataEntrada: { type: 'string', format: 'date-time', example: '2026-11-22T12:00:00Z' },
              notaFiscal: { type: 'string', example: 'NF-EXT-778899' },
              transportadora: { type: 'string', example: 'Logística Reversa Express' },
              observacoes: { type: 'string', example: 'Lote enviado automaticamente via API Pública B2B' },
              equipamentos: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['tipo', 'marca', 'modelo', 'anoFabricacao', 'estadoFisico', 'pesoQuilogramas'],
                  properties: {
                    id: { type: 'string' },
                    tipo: { type: 'string', example: 'NOTEBOOK' },
                    marca: { type: 'string', example: 'Dell' },
                    modelo: { type: 'string', example: 'Latitude 7420' },
                    anoFabricacao: { type: 'integer', example: 2022 },
                    estadoFisico: { type: 'string', example: 'BOM_ESTADO' },
                    pesoQuilogramas: { type: 'number', example: 1.45 }
                  }
                }
              }
            }
          }
        }
      },
      this.submeterLoteParceiro.bind(this)
    );

    // 3. Consulta Síncrona Rápida de Insights Analíticos para Parceiros
    server.get(
      '/api/v1/public/analytics/resumo',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.READ_ANALYTICS)
        ],
        schema: {
          tags: ['Pilar 2 (AV3) / API Pública de Parceiros (/api/v1/public)'],
          summary: 'Obtém resumo executivo dos indicadores analíticos e preditivos',
          description: 'Requer permissão READ_ANALYTICS na chave de API do parceiro.',
          security: [{ apiKeyAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              tipoEquipamento: { type: 'string', example: 'NOTEBOOK' }
            }
          }
        }
      },
      this.resumoAnaliticoParceiro.bind(this)
    );

    // ========================================================================
    // PILAR 3 (AV3): PROCESSAMENTO ASSÍNCRONO COM FILAS (POLLING & DOWNLOAD)
    // ========================================================================

    // 4. Solicitar Geração Assíncrona de Relatório Pesado (Publica na Fila e retorna Job ID com HTTP 202)
    server.post(
      '/api/v1/public/relatorios/assincrono',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.READ_ANALYTICS)
        ],
        schema: {
          tags: ['Pilar 3 (AV3) / Processamento Assíncrono com Filas e Polling'],
          summary: 'Enfileira geração assíncrona de relatório analítico/preditivo completo (JSON ou CSV)',
          description:
            'Publica um job na fila assíncrona (BullMQ/Worker) e retorna imediatamente HTTP 202 Accepted com o identificador único da tarefa (tarefaId) e URLs de polling e download.',
          security: [{ apiKeyAuth: [] }],
          body: {
            type: 'object',
            required: ['tipoRelatorio'],
            properties: {
              tipoRelatorio: {
                type: 'string',
                enum: [
                  'PREDITIVO_COMPLETO',
                  'EFICIENCIA_OPERACIONAL',
                  'RENTABILIDADE_EQUIPAMENTOS',
                  'CONSOLIDADO_PARCEIRO'
                ],
                example: 'PREDITIVO_COMPLETO'
              },
              formatoSaida: {
                type: 'string',
                enum: ['JSON', 'CSV'],
                default: 'CSV',
                example: 'CSV'
              },
              parametros: {
                type: 'object',
                properties: {
                  tipoEquipamento: { type: 'string', example: 'NOTEBOOK' },
                  alfaSuavizacao: { type: 'number', example: 0.35 },
                  simularFalhaTransitoria: {
                    type: 'boolean',
                    description: 'Simula falha na 1ª tentativa para testar recuperação automática via retry exponencial',
                    default: false
                  }
                }
              },
              webhookUrl: {
                type: 'string',
                nullable: true,
                example: 'https://parceiro.exemplo.com.br/webhooks/greencode'
              }
            }
          }
        }
      },
      this.solicitarRelatorioAssincrono.bind(this)
    );

    // 5. Endpoint de Polling de Status da Tarefa
    server.get(
      '/api/v1/public/relatorios/tarefas/:tarefaId',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.READ_ANALYTICS)
        ],
        schema: {
          tags: ['Pilar 3 (AV3) / Processamento Assíncrono com Filas e Polling'],
          summary: 'Consulta status e progresso percentual de uma tarefa na fila (Polling)',
          description:
            'Retorna o estado atual da tarefa (AGUARDANDO, PROCESSANDO, CONCLUIDO ou FALHA), número de tentativas de retry realizadas e link para download quando concluída.',
          security: [{ apiKeyAuth: [] }],
          params: {
            type: 'object',
            required: ['tarefaId'],
            properties: {
              tarefaId: { type: 'string', description: 'UUID da tarefa retornado no enfileiramento' }
            }
          }
        }
      },
      this.consultarStatusTarefa.bind(this)
    );

    // 6. Endpoint de Download do Relatório Gerado (CSV ou JSON)
    server.get(
      '/api/v1/public/relatorios/tarefas/:tarefaId/download',
      {
        preHandler: [
          authenticateApiKey,
          requireApiKeyPermission(PermissaoApiKey.READ_ANALYTICS)
        ],
        schema: {
          tags: ['Pilar 3 (AV3) / Processamento Assíncrono com Filas e Polling'],
          summary: 'Faz o download do arquivo de relatório gerado (CSV ou JSON) após conclusão do job',
          security: [{ apiKeyAuth: [] }],
          params: {
            type: 'object',
            required: ['tarefaId'],
            properties: {
              tarefaId: { type: 'string', description: 'UUID da tarefa concluída' }
            }
          }
        }
      },
      this.downloadRelatorioTarefa.bind(this)
    );
  }

  public async consultarRastreabilidade(request: FastifyRequest, reply: FastifyReply) {
    const { idOuCodigo } = request.params as any;
    const parceiro = request.parceiroApiKey!;

    try {
      const rastreio = await this.equipService.rastrear(idOuCodigo);
      return reply.send({
        versaoApi: request.apiVersion || '1.0.0',
        parceiroAutenticado: parceiro.nomeParceiro,
        ...rastreio
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }

  public async submeterLoteParceiro(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const parceiro = request.parceiroApiKey!;

    const organizacaoId = body.organizacaoId || parceiro.organizacaoId;
    if (!organizacaoId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campo organizacaoId é obrigatório quando a chave de API não está vinculada a uma organização fixa.'
      });
    }

    try {
      const loteCriado = await this.loteService.criarLote(
        {
          id: body.id,
          dataEntrada: body.dataEntrada || new Date().toISOString(),
          organizacaoId,
          notaFiscal: body.notaFiscal,
          transportadora: body.transportadora,
          observacoes: body.observacoes || `Importado via API Pública por ${parceiro.nomeParceiro}`,
          equipamentos: body.equipamentos
        },
        `API_KEY:${parceiro.nomeParceiro}`
      );

      return reply.status(201).send({
        versaoApi: request.apiVersion || '1.0.0',
        parceiroAutenticado: parceiro.nomeParceiro,
        message: 'Lote recebido e registrado com sucesso via API Pública!',
        lote: loteCriado
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async resumoAnaliticoParceiro(request: FastifyRequest, reply: FastifyReply) {
    const { tipoEquipamento } = request.query as any;
    const parceiro = request.parceiroApiKey!;

    const [rentabilidade, preditivo] = await Promise.all([
      this.analyticsService.analisarRentabilidadePorEquipamento(
        tipoEquipamento,
        `API_KEY:${parceiro.nomeParceiro}`,
        parceiro.organizacaoId || undefined
      ),
      this.analyticsService.analisarVidaUtilPreditiva(
        tipoEquipamento,
        0.35,
        `API_KEY:${parceiro.nomeParceiro}`,
        parceiro.organizacaoId || undefined
      )
    ]);

    return reply.send({
      versaoApi: request.apiVersion || '1.0.0',
      parceiroAutenticado: parceiro.nomeParceiro,
      rentabilidade,
      preditivo
    });
  }

  public async solicitarRelatorioAssincrono(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const parceiro = request.parceiroApiKey!;

    try {
      const jobInfo = await this.filaService.enfileirarRelatorio({
        tipoRelatorio: body.tipoRelatorio,
        formatoSaida: body.formatoSaida || 'CSV',
        solicitante: `PARCEIRO:${parceiro.nomeParceiro}`,
        organizacaoFiltroId: body.organizacaoId || parceiro.organizacaoId,
        parametros: body.parametros || {},
        webhookUrl: body.webhookUrl
      });

      return reply.status(202).send({
        versaoApi: request.apiVersion || '1.0.0',
        message: 'Tarefa de geração de relatório enfileirada para processamento assíncrono.',
        ...jobInfo
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async consultarStatusTarefa(request: FastifyRequest, reply: FastifyReply) {
    const { tarefaId } = request.params as any;
    try {
      const status = await this.filaService.consultarStatusTarefa(tarefaId);
      return reply.send({
        versaoApi: request.apiVersion || '1.0.0',
        ...status
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }

  public async downloadRelatorioTarefa(request: FastifyRequest, reply: FastifyReply) {
    const { tarefaId } = request.params as any;
    try {
      const arquivo = await this.filaService.obterDownloadTarefa(tarefaId);
      reply.header('Content-Type', arquivo.contentType);
      reply.header('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);

      if (arquivo.formatoSaida === 'JSON') {
        return reply.send(JSON.parse(arquivo.conteudo));
      }
      return reply.send(arquivo.conteudo);
    } catch (err: any) {
      const codigo = err.message.includes('não encontrada') ? 404 : 409;
      return reply.status(codigo).send({
        statusCode: codigo,
        error: codigo === 404 ? 'Not Found' : 'Conflict (Job Not Ready)',
        message: err.message
      });
    }
  }
}
