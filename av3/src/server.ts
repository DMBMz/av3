import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ENV } from './config/env';
import { prisma } from './config/prisma';
import { AuthController } from './controllers/AuthController';
import { OrganizacaoController } from './controllers/OrganizacaoController';
import { LoteController } from './controllers/LoteController';
import { EquipamentoController } from './controllers/EquipamentoController';
import { RelatorioController } from './controllers/RelatorioController';
import { AnalyticsController } from './controllers/AnalyticsController';
import { PublicApiController } from './controllers/PublicApiController';
import { CronSchedulerService } from './services/CronSchedulerService';
import { FilaRelatorioService } from './services/FilaRelatorioService';

export function buildServer() {
  const app = fastify({
    logger: ENV.NODE_ENV === 'test' ? false : { level: 'info' },
    ajv: {
      customOptions: {
        strict: false
      }
    }
  });

  // 1. CORS
  app.register(cors, {
    origin: true
  });

  // 2. JWT para API Interna e Administrativa
  app.register(jwt, {
    secret: ENV.JWT_SECRET
  });

  // 3. Rate Limiting (@fastify/rate-limit) configurado por Chave de API de parceiro ou IP
  app.register(rateLimit, {
    global: true,
    max: async (request) => {
      // Permite sobrescrever limite via header em testes ou usa o limite associado à API Key
      const testLimitHeader = request.headers['x-test-rate-limit'];
      if (testLimitHeader) {
        return parseInt(String(testLimitHeader), 10);
      }
      if (request.parceiroApiKey?.limiteRequisicoesMin) {
        return request.parceiroApiKey.limiteRequisicoesMin;
      }
      return 120;
    },
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'] as string | undefined;
      return apiKey ? `apikey:${apiKey}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Limite de taxa de requisições excedido (${context.max} req / ${context.after}). Aguarde antes de enviar novas chamadas à API pública do GreenCode.`
      };
    }
  });

  // 4. Documentação OpenAPI Interativa (@fastify/swagger & @fastify/swagger-ui)
  app.register(swagger, {
    openapi: {
      info: {
        title: 'GreenCode - Plataforma Analítica, API Pública B2B e Filas Assíncronas (AV3)',
        description:
          'Documentação OpenAPI 3.0 completa da Atividade 3 do GreenCode. Contempla a Camada Analítica Preditiva (OLS + Suavização Exponencial + simple-statistics), a API Pública segregada (/api/v1/public) com autenticação por API Key e Rate Limiting, e o Processamento Assíncrono de Relatórios com Filas (BullMQ/Worker).',
        version: '1.0.0'
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT para endpoints internos (/api/v1/internal e /api/v1/admin)'
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Chave de API exclusiva para parceiros externos (/api/v1/public)'
          }
        }
      }
    }
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  });

  const cronService = new CronSchedulerService();
  if (process.env.NODE_ENV !== 'test' && ENV.NODE_ENV !== 'test') {
    cronService.iniciarAgendamento('0 */6 * * *');
  }

  app.addHook('onClose', async () => {
    cronService.pararAgendamento();
  });

  // Rota de Health Check
  app.get('/health', async () => {
    return {
      status: 'UP',
      versao: '1.0.0-analytics-public-api-av3',
      banco: 'Conectado (Prisma ORM)',
      modoFilaAssincrona: FilaRelatorioService.getInstance().getModoExecucao(),
      cronAtivo: cronService.obterStatus().ativo,
      easterEgg: 'Oi prof. Gerson :)',
      timestamp: new Date().toISOString()
    };
  });

  // Rota Easter Egg
  app.get('/easteregg', async () => {
    return {
      mensagem: 'Oi prof. Gerson :)'
    };
  });

  // Registro dos Controladores (Segregação entre /api/v1/internal, /api/v1/admin e /api/v1/public)
  app.register(async (instance) => {
    const authController = new AuthController();
    const orgController = new OrganizacaoController();
    const loteController = new LoteController();
    const equipController = new EquipamentoController();
    const relatorioController = new RelatorioController();
    const analyticsController = new AnalyticsController(cronService);
    const publicApiController = new PublicApiController();

    authController.registerRoutes(instance);
    orgController.registerRoutes(instance);
    loteController.registerRoutes(instance);
    equipController.registerRoutes(instance);
    relatorioController.registerRoutes(instance);
    analyticsController.registerRoutes(instance);
    publicApiController.registerRoutes(instance);
  });

  return app;
}

async function start() {
  const app = buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`Recebido sinal ${signal}. Encerrando servidor e workers graciosamente...`);
    try {
      await FilaRelatorioService.getInstance().encerrar();
      await app.close();
      await prisma.$disconnect();
      app.log.info('Conexões e filas finalizadas com sucesso. Processo encerrado.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Erro durante encerramento gracioso.');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: ENV.PORT, host: ENV.HOST });
    console.log(`\n======================================================================`);
    console.log(`🚀 GreenCode Plataforma Analítica & API Pública (AV3) iniciada!`);
    console.log(`📡 URL Principal: http://${ENV.HOST}:${ENV.PORT}`);
    console.log(`📑 Swagger OpenAPI Interativo: http://${ENV.HOST}:${ENV.PORT}/docs`);
    console.log(`🔑 API Pública Parceiros: http://${ENV.HOST}:${ENV.PORT}/api/v1/public`);
    console.log(`📊 API Analítica Interna: http://${ENV.HOST}:${ENV.PORT}/api/v1/internal/analytics`);
    console.log(`❤️  Health Check: http://${ENV.HOST}:${ENV.PORT}/health`);
    console.log(`👋 Easter Egg: Oi prof. Gerson :)`);
    console.log(`======================================================================\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
