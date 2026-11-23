import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RelatorioService } from '../services/RelatorioService';
import { authenticate } from '../middlewares/auth';

export class RelatorioController {
  private relatorioService: RelatorioService;

  constructor() {
    this.relatorioService = new RelatorioService();
  }

  public registerRoutes(server: FastifyInstance) {
    for (const prefix of ['/api/v1/internal/relatorios', '/api/relatorios']) {
      const isLegacy = prefix === '/api/relatorios';
      server.get(
        `${prefix}/organizacao/:id`,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Relatórios Transacionais'],
            summary: 'Relatório de sustentabilidade e créditos de carbono por organização',
            security: [{ bearerAuth: [] }]
          }
        },
        this.relatorioOrganizacao.bind(this)
      );
      server.get(
        `${prefix}/status`,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Relatórios Transacionais'],
            summary: 'Relatório de inventário por status operacional',
            security: [{ bearerAuth: [] }]
          }
        },
        this.relatorioStatus.bind(this)
      );
      server.get(
        `${prefix}/financeiro`,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Relatórios Transacionais'],
            summary: 'Relatório financeiro de MRR e valor estimado de recicláveis',
            security: [{ bearerAuth: [] }]
          }
        },
        this.relatorioFinanceiro.bind(this)
      );
      server.get(
        `${prefix}/auditoria`,
        {
          preHandler: [authenticate],
          schema: {
            hide: isLegacy,
            tags: ['Internal / Relatórios Transacionais'],
            summary: 'Trilha de auditoria do Journal Transacional',
            security: [{ bearerAuth: [] }]
          }
        },
        this.relatorioAuditoria.bind(this)
      );
    }
  }

  public async relatorioOrganizacao(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    try {
      const relatorio = await this.relatorioService.relatorioPorOrganizacao(id);
      return reply.send(relatorio);
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }

  public async relatorioStatus(request: FastifyRequest, reply: FastifyReply) {
    const { status } = request.query as any;
    const relatorio = await this.relatorioService.relatorioPorStatus(status);
    return reply.send(relatorio);
  }

  public async relatorioFinanceiro(request: FastifyRequest, reply: FastifyReply) {
    const relatorio = await this.relatorioService.relatorioFinanceiro();
    return reply.send(relatorio);
  }

  public async relatorioAuditoria(request: FastifyRequest, reply: FastifyReply) {
    const { limite } = request.query as any;
    const relatorio = await this.relatorioService.relatorioAuditoria(limite ? parseInt(limite, 10) : 30);
    return reply.send(relatorio);
  }
}
