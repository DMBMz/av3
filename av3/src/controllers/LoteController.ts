import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LoteService } from '../services/LoteService';
import { authenticate, authorize } from '../middlewares/auth';
import { PapelUsuario } from '../types';

export class LoteController {
  private loteService: LoteService;

  constructor() {
    this.loteService = new LoteService();
  }

  public registerRoutes(server: FastifyInstance) {
    for (const prefix of ['/api/v1/internal/lotes', '/api/lotes']) {
      const isLegacy = prefix === '/api/lotes';
      server.post(
        prefix,
        {
          preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR, PapelUsuario.GESTOR_ALMOXARIFADO])],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Lotes e Triagem'],
            summary: 'Cria novo lote de equipamentos em transação atômica',
            security: [{ bearerAuth: [] }]
          }
        },
        this.criar.bind(this)
      );
      server.get(
        prefix,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Lotes e Triagem'],
            summary: 'Lista lotes recebidos e em processamento',
            security: [{ bearerAuth: [] }]
          }
        },
        this.listar.bind(this)
      );
      server.get(
        `${prefix}/:id`,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Lotes e Triagem'],
            summary: 'Consulta lote por ID',
            security: [{ bearerAuth: [] }]
          }
        },
        this.buscarPorId.bind(this)
      );
      server.post(
        `${prefix}/:id/triagem`,
        {
          preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR, PapelUsuario.GESTOR_ALMOXARIFADO])],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Lotes e Triagem'],
            summary: 'Homologa triagem completa do lote e libera equipamentos para desmonte',
            security: [{ bearerAuth: [] }]
          }
        },
        this.concluirTriagem.bind(this)
      );
    }
  }

  public async criar(request: FastifyRequest, reply: FastifyReply) {
    try {
      const lote = await this.loteService.criarLote(
        request.body as any,
        request.user.usuario
      );
      return reply.status(201).send(lote);
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async listar(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const lotes = await this.loteService.listar(query);
    return reply.send(lotes);
  }

  public async buscarPorId(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    try {
      const lote = await this.loteService.buscarPorId(id);
      return reply.send(lote);
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }

  public async concluirTriagem(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    const { versaoEsperada } = (request.body as any) || {};

    try {
      const lote = await this.loteService.concluirTriagem(
        id,
        request.user.usuario,
        versaoEsperada
      );
      return reply.send({
        message: 'Triagem concluída com sucesso! Equipamentos liberados para desmonte.',
        lote
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }
}
