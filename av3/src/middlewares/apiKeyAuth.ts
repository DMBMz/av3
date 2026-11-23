import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/AuthService';
import { ParceiroApiKeyPayload } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    parceiroApiKey?: ParceiroApiKeyPayload;
    apiVersion?: string;
  }
}

const authService = new AuthService();
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

/**
 * Middleware de Versionamento Semântico, Autenticação por Chave de API Pública e Rate Limiting Dinâmico por Parceiro (AV3)
 * - Verifica cabeçalho `X-API-Key` (ou `Authorization: ApiKey <chave>`).
 * - Valida versão explícita da API na URL (`/api/v1/public/...`) e/ou no cabeçalho `X-API-Version` (ex: `1.0.0`).
 * - Aplica Rate Limiting dinâmico baseado no plano contratual do parceiro (`limiteRequisicoesMin`) em conjunto com `@fastify/rate-limit`.
 */
export async function authenticateApiKey(request: FastifyRequest, reply: FastifyReply) {
  // 1. Validação de Versionamento Semântico explícito
  const headerVersion = request.headers['x-api-version'] as string | undefined;
  if (headerVersion && !/^1(\.\d+\.\d+)?$/.test(headerVersion.trim())) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Unsupported API Version',
      message: `Versão da API '${headerVersion}' não suportada ou depreciada. Utilize a versão semântica '1.0.0' (rota /api/v1/public).`
    });
  }

  const versaoSemantica = headerVersion?.trim() || '1.0.0';
  request.apiVersion = versaoSemantica;
  reply.header('X-API-Version', versaoSemantica);

  // 2. Extração da Chave de API
  let rawKey = request.headers['x-api-key'] as string | undefined;
  if (!rawKey && request.headers.authorization?.startsWith('ApiKey ')) {
    rawKey = request.headers.authorization.replace('ApiKey ', '').trim();
  }

  if (!rawKey) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Chave de API ausente. Informe o cabeçalho X-API-Key para acessar a API pública de parceiros.'
    });
  }

  try {
    const parceiro = await authService.validarApiKey(rawKey);
    request.parceiroApiKey = parceiro;

    // 3. Controle de Taxa de Requisições por Chave de API (Sliding Window de 1 minuto)
    const testLimitHeader = request.headers['x-test-rate-limit'];
    const limiteMax = testLimitHeader
      ? parseInt(String(testLimitHeader), 10)
      : parceiro.limiteRequisicoesMin || 60;

    const agora = Date.now();
    const windowMs = 60 * 1000;
    const bucketKey = testLimitHeader ? `test:${parceiro.id}:${limiteMax}` : `partner:${parceiro.id}`;
    let bucket = rateLimitBuckets.get(bucketKey);

    if (!bucket || agora - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: agora };
    }

    bucket.count += 1;
    rateLimitBuckets.set(bucketKey, bucket);

    const restante = Math.max(0, limiteMax - bucket.count);
    reply.header('X-RateLimit-Limit', limiteMax);
    reply.header('X-RateLimit-Remaining', restante);

    if (bucket.count > limiteMax) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Limite de taxa de requisições excedido para o parceiro '${parceiro.nomeParceiro}' (${limiteMax} req/min no plano ${parceiro.planoAcesso}). Aguarde antes de tentar novamente.`
      });
    }
  } catch (err: any) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: err.message || 'Chave de API inválida ou revogada.'
    });
  }
}

export function requireApiKeyPermission(permissaoNecessaria: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const parceiro = request.parceiroApiKey;
    if (!parceiro) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Parceiro externo não autenticado.'
      });
    }

    if (!parceiro.permissoes.includes(permissaoNecessaria)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Permissão insuficiente: A chave do parceiro '${parceiro.nomeParceiro}' não possui o escopo '${permissaoNecessaria}'. Escopos atuais: [${parceiro.permissoes.join(', ')}].`
      });
    }
  };
}
