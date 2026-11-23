import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/AuthService';
import { authenticate, authorize } from '../middlewares/auth';
import { PapelUsuario } from '../types';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  public registerRoutes(server: FastifyInstance) {
    // Rotas internas de autenticação e administração (/api/v1/internal e /api/v1/admin + alias legado /api)
    const loginSchema = {
      tags: ['Internal / Auth & Admin'],
      summary: 'Autentica usuário interno e retorna token JWT',
      description: 'Fluxo de login com validação SHA-256 + Salt e emissão de token Bearer JWT de 8 horas.',
      body: {
        type: 'object',
        required: ['usuario', 'senha'],
        properties: {
          usuario: { type: 'string', example: 'admin' },
          senha: { type: 'string', example: 'admin123' }
        }
      }
    };

    server.post('/api/v1/internal/auth/login', { schema: loginSchema }, this.login.bind(this));
    server.post('/api/auth/login', { schema: { ...loginSchema, hide: true } }, this.login.bind(this));

    server.get(
      '/api/v1/internal/auth/me',
      {
        preHandler: [authenticate],
        schema: {
          tags: ['Internal / Auth & Admin'],
          summary: 'Retorna perfil do operador autenticado via JWT',
          security: [{ bearerAuth: [] }]
        }
      },
      this.me.bind(this)
    );
    server.get('/api/auth/me', { preHandler: [authenticate], schema: { hide: true } }, this.me.bind(this));

    server.post(
      '/api/v1/admin/usuarios',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])],
        schema: {
          tags: ['Internal / Auth & Admin'],
          summary: 'Cadastra novo usuário interno com RBAC (Apenas ADMINISTRADOR)',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['usuario', 'senha', 'papel'],
            properties: {
              usuario: { type: 'string', example: 'novo_auditor' },
              senha: { type: 'string', example: 'senha123' },
              papel: {
                type: 'string',
                enum: ['ADMINISTRADOR', 'OPERADOR_CADASTRO', 'GESTOR_ALMOXARIFADO', 'AUDITOR']
              }
            }
          }
        }
      },
      this.criarUsuario.bind(this)
    );
    server.post(
      '/api/usuarios',
      { preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])], schema: { hide: true } },
      this.criarUsuario.bind(this)
    );

    server.get(
      '/api/v1/admin/usuarios',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])],
        schema: {
          tags: ['Internal / Auth & Admin'],
          summary: 'Lista usuários internos cadastrados',
          security: [{ bearerAuth: [] }]
        }
      },
      this.listarUsuarios.bind(this)
    );
    server.get(
      '/api/usuarios',
      { preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])], schema: { hide: true } },
      this.listarUsuarios.bind(this)
    );

    // ========================================================================
    // GESTÃO ADMINISTRATIVA DE CHAVES DE API PÚBLICA (PARCEIROS EXTERNOS - AV3)
    // ========================================================================
    server.post(
      '/api/v1/admin/api-keys',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])],
        schema: {
          tags: ['Admin / Gestão de Chaves de API Pública (AV3)'],
          summary: 'Gera uma nova chave de API única para parceiro externo',
          description:
            'Cria uma chave de API vinculada a permissões específicas (READ_RASTREABILIDADE, WRITE_LOTES, READ_ANALYTICS) e limite customizado de requisições por minuto.',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['nomeParceiro', 'permissoes'],
            properties: {
              nomeParceiro: { type: 'string', example: 'EcoRecicla Cooperativa Nacional' },
              organizacaoId: { type: 'string', nullable: true, example: 'ORG-TELECOM-01' },
              permissoes: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['READ_RASTREABILIDADE', 'WRITE_LOTES', 'READ_ANALYTICS']
                },
                example: ['READ_RASTREABILIDADE', 'WRITE_LOTES', 'READ_ANALYTICS']
              },
              limiteRequisicoesMin: { type: 'integer', example: 60 },
              planoAcesso: { type: 'string', enum: ['BASIC', 'STANDARD', 'ENTERPRISE'], example: 'ENTERPRISE' },
              diasValidade: { type: 'integer', example: 365 }
            }
          }
        }
      },
      this.gerarApiKey.bind(this)
    );

    server.get(
      '/api/v1/admin/api-keys',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR, PapelUsuario.AUDITOR])],
        schema: {
          tags: ['Admin / Gestão de Chaves de API Pública (AV3)'],
          summary: 'Lista todas as chaves de API de parceiros e métricas de consumo',
          security: [{ bearerAuth: [] }]
        }
      },
      this.listarApiKeys.bind(this)
    );

    server.delete(
      '/api/v1/admin/api-keys/:id',
      {
        preHandler: [authenticate, authorize([PapelUsuario.ADMINISTRADOR])],
        schema: {
          tags: ['Admin / Gestão de Chaves de API Pública (AV3)'],
          summary: 'Revoga imediatamente a chave de API de um parceiro externo',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID da chave de API' }
            }
          }
        }
      },
      this.revogarApiKey.bind(this)
    );
  }

  public async login(request: FastifyRequest, reply: FastifyReply) {
    const { usuario, senha } = request.body as any;
    if (!usuario || !senha) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campos usuario e senha são obrigatórios.'
      });
    }

    try {
      const userPayload = await this.authService.authenticate(usuario, senha);
      const token = (request.server as any).jwt.sign(userPayload, { expiresIn: '8h' });

      return reply.send({
        message: 'Autenticado com sucesso!',
        token,
        usuario: userPayload
      });
    } catch (err: any) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err.message
      });
    }
  }

  public async me(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      usuarioLogado: request.user
    });
  }

  public async criarUsuario(request: FastifyRequest, reply: FastifyReply) {
    const { usuario, senha, papel } = request.body as any;
    if (!usuario || !senha || !papel) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campos usuario, senha e papel são obrigatórios.'
      });
    }

    try {
      const novo = await this.authService.createUser({
        usuario,
        senhaPlana: senha,
        papel,
        operadorResponsavel: request.user.usuario
      });
      return reply.status(201).send(novo);
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async listarUsuarios(request: FastifyRequest, reply: FastifyReply) {
    const usuarios = await this.authService.listUsers();
    return reply.send(usuarios);
  }

  public async gerarApiKey(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    try {
      const novaChave = await this.authService.gerarApiKeyParceiro({
        nomeParceiro: body.nomeParceiro,
        organizacaoId: body.organizacaoId,
        permissoes: body.permissoes || ['READ_RASTREABILIDADE'],
        limiteRequisicoesMin: body.limiteRequisicoesMin,
        planoAcesso: body.planoAcesso,
        diasValidade: body.diasValidade,
        operadorResponsavel: request.user.usuario
      });
      return reply.status(201).send({
        message: 'Chave de API gerada com sucesso! Guarde o campo chaveApi em local seguro.',
        apiKey: novaChave
      });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message
      });
    }
  }

  public async listarApiKeys(request: FastifyRequest, reply: FastifyReply) {
    const lista = await this.authService.listarApiKeys();
    return reply.send({
      totalChaves: lista.length,
      chaves: lista
    });
  }

  public async revogarApiKey(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    try {
      const revogada = await this.authService.revogarApiKey(id, request.user.usuario);
      return reply.send({
        message: 'Chave de API revogada com sucesso!',
        id: revogada.id,
        ativa: revogada.ativa
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message
      });
    }
  }
}
