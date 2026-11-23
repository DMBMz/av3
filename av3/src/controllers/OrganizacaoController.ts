import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OrganizacaoService } from '../services/OrganizacaoService';
import { authenticate, authorize } from '../middlewares/auth';
import { PapelUsuario } from '../types';

export class OrganizacaoController {
  private orgService: OrganizacaoService;

  constructor() {
    this.orgService = new OrganizacaoService();
  }

  public registerRoutes(server: FastifyInstance) {
    for (const prefix of ['/api/v1/internal/organizacoes', '/api/organizacoes']) {
      const isLegacy = prefix === '/api/organizacoes';
      server.post(
        prefix,
        {
          preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR, PapelUsuario.OPERADOR_CADASTRO])],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Organizações e Contratos'],
            summary: 'Cadastra nova organização geradora e contrato de coleta',
            security: [{ bearerAuth: [] }]
          }
        },
        this.cadastrar.bind(this)
      );
      server.get(
        prefix,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Organizações e Contratos'],
            summary: 'Lista organizações ativas',
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
            tags: ['Internal / Organizações e Contratos'],
            summary: 'Busca organização por ID',
            security: [{ bearerAuth: [] }]
          }
        },
        this.buscarPorId.bind(this)
      );
      server.put(
        `${prefix}/:id/contrato`,
        {
          preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR, PapelUsuario.OPERADOR_CADASTRO])],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Organizações e Contratos'],
            summary: 'Renova contrato vigente com bloqueio otimista',
            security: [{ bearerAuth: [] }]
          }
        },
        this.renovarContrato.bind(this)
      );
    }
  }

  public async cadastrar(request: FastifyRequest, reply: FastifyReply) {
    try {
      const org = await this.orgService.cadastrarOrganizacao(
        request.body as any,
        request.user.usuario
      );
      return reply.status(201).send(org);
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async listar(request: FastifyRequest, reply: FastifyReply) {
    const orgs = await this.orgService.listar();
    return reply.send(orgs);
  }

  public async buscarPorId(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    try {
      const org = await this.orgService.buscarPorId(id);
      return reply.send(org);
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }

  public async renovarContrato(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    const { novoVencimento, versaoEsperada } = request.body as any;

    if (!novoVencimento) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campo novoVencimento é obrigatório.'
      });
    }

    try {
      const contrato = await this.orgService.renovarContrato(
        id,
        novoVencimento,
        request.user.usuario,
        versaoEsperada
      );
      return reply.send({
        message: 'Contrato renovado com sucesso!',
        contrato
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
