import * as crypto from 'crypto';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { ApiKeyRepository } from '../repositories/ApiKeyRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { PapelUsuario, ParceiroApiKeyPayload, PermissaoApiKey } from '../types';

export class AuthService {
  private usuarioRepo: UsuarioRepository;
  private apiKeyRepo: ApiKeyRepository;
  private journalRepo: JournalRepository;

  constructor() {
    this.usuarioRepo = new UsuarioRepository();
    this.apiKeyRepo = new ApiKeyRepository();
    this.journalRepo = new JournalRepository();
  }

  public static hashPassword(senhaPlana: string, salt: string): string {
    return crypto.createHash('sha256').update(senhaPlana + salt).digest('hex');
  }

  public static hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  public async authenticate(usuario: string, senhaPlana: string) {
    const user = await this.usuarioRepo.findByUsername(usuario);
    if (!user || !user.ativo) {
      throw new Error('Credenciais inválidas ou usuário inativo.');
    }

    const hashCalculado = AuthService.hashPassword(senhaPlana, user.salt);
    const hashesIguais = crypto.timingSafeEqual(
      Buffer.from(hashCalculado),
      Buffer.from(user.hashSenha)
    );

    if (!hashesIguais) {
      throw new Error('Credenciais inválidas ou usuário inativo.');
    }

    await this.usuarioRepo.updateLastAccess(user.id);

    return {
      id: user.id,
      usuario: user.usuario,
      papel: user.papel
    };
  }

  public async createUser(dados: {
    usuario: string;
    senhaPlana: string;
    papel: string;
    operadorResponsavel: string;
  }) {
    if (dados.senhaPlana.length < 6) {
      throw new Error('A senha deve conter no mínimo 6 caracteres.');
    }

    if (!Object.values(PapelUsuario).includes(dados.papel as any)) {
      throw new Error(`Papel inválido. Valores aceitos: ${Object.values(PapelUsuario).join(', ')}`);
    }

    const existente = await this.usuarioRepo.findByUsername(dados.usuario);
    if (existente) {
      throw new Error(`Usuário '${dados.usuario}' já está cadastrado.`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hashSenha = AuthService.hashPassword(dados.senhaPlana, salt);

    const novo = await this.usuarioRepo.create({
      usuario: dados.usuario,
      hashSenha,
      salt,
      papel: dados.papel
    });

    await this.journalRepo.record(
      'CRIAR',
      'Usuario',
      dados.operadorResponsavel,
      null,
      { id: novo.id, usuario: novo.usuario, papel: novo.papel }
    );

    return {
      id: novo.id,
      usuario: novo.usuario,
      papel: novo.papel,
      criadoEm: novo.criadoEm
    };
  }

  public async listUsers() {
    return this.usuarioRepo.listAll();
  }

  // ==========================================================================
  // MÓDULO DE GESTÃO DE CHAVES DE API PÚBLICA (PARCEIROS EXTERNOS - AV3)
  // ==========================================================================

  public async gerarApiKeyParceiro(dados: {
    nomeParceiro: string;
    organizacaoId?: string | null;
    permissoes: string[];
    limiteRequisicoesMin?: number;
    planoAcesso?: string;
    diasValidade?: number;
    operadorResponsavel: string;
    chaveExplicitaParaSeed?: string;
  }) {
    if (!dados.nomeParceiro || dados.nomeParceiro.trim().length < 2) {
      throw new Error('O nome do parceiro externo é obrigatório.');
    }

    const permissoesValidas = Object.values(PermissaoApiKey);
    for (const p of dados.permissoes) {
      if (!permissoesValidas.includes(p as any)) {
        throw new Error(`Permissão '${p}' inválida. Permissões aceitas: ${permissoesValidas.join(', ')}`);
      }
    }

    const rawKey =
      dados.chaveExplicitaParaSeed ||
      `gc_live_${crypto.randomBytes(18).toString('hex')}`;
    const prefixoChave = rawKey.substring(0, 14);
    const hashChave = AuthService.hashApiKey(rawKey);

    const expiraEm = dados.diasValidade
      ? new Date(Date.now() + dados.diasValidade * 24 * 60 * 60 * 1000)
      : null;

    const criada = await this.apiKeyRepo.create({
      nomeParceiro: dados.nomeParceiro.trim(),
      organizacaoId: dados.organizacaoId || null,
      prefixoChave,
      hashChave,
      permissoesJson: JSON.stringify(dados.permissoes),
      limiteRequisicoesMin: dados.limiteRequisicoesMin ?? 60,
      planoAcesso: dados.planoAcesso ?? 'STANDARD',
      expiraEm
    });

    await this.journalRepo.record(
      'GERAR_API_KEY',
      'ApiKeyParceiro',
      dados.operadorResponsavel,
      null,
      {
        id: criada.id,
        nomeParceiro: criada.nomeParceiro,
        prefixoChave: criada.prefixoChave,
        permissoes: dados.permissoes,
        limiteRequisicoesMin: criada.limiteRequisicoesMin
      }
    );

    return {
      id: criada.id,
      nomeParceiro: criada.nomeParceiro,
      organizacaoId: criada.organizacaoId,
      organizacao: criada.organizacao,
      chaveApi: rawKey, // Exibida apenas no momento da geração
      prefixoChave: criada.prefixoChave,
      permissoes: dados.permissoes,
      limiteRequisicoesMin: criada.limiteRequisicoesMin,
      planoAcesso: criada.planoAcesso,
      ativa: criada.ativa,
      expiraEm: criada.expiraEm,
      criadoEm: criada.criadoEm
    };
  }

  public async validarApiKey(rawKey: string): Promise<ParceiroApiKeyPayload> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('Chave de API ausente.');
    }

    const hashChave = AuthService.hashApiKey(rawKey.trim());
    const apiKeyRecord = await this.apiKeyRepo.findByHash(hashChave);

    if (!apiKeyRecord || !apiKeyRecord.ativa) {
      throw new Error('Chave de API inválida ou revogada.');
    }

    if (apiKeyRecord.expiraEm && apiKeyRecord.expiraEm.getTime() < Date.now()) {
      throw new Error('Chave de API expirada.');
    }

    await this.apiKeyRepo.incrementUsage(apiKeyRecord.id);

    let permissoes: string[] = [];
    try {
      permissoes = JSON.parse(apiKeyRecord.permissoesJson);
    } catch {
      permissoes = ['READ_RASTREABILIDADE'];
    }

    return {
      id: apiKeyRecord.id,
      nomeParceiro: apiKeyRecord.nomeParceiro,
      organizacaoId: apiKeyRecord.organizacaoId,
      permissoes,
      limiteRequisicoesMin: apiKeyRecord.limiteRequisicoesMin,
      planoAcesso: apiKeyRecord.planoAcesso
    };
  }

  public async revogarApiKey(id: string, operadorResponsavel: string) {
    const existente = await this.apiKeyRepo.findById(id);
    if (!existente) {
      throw new Error(`Chave de API '${id}' não encontrada.`);
    }

    const revogada = await this.apiKeyRepo.revoke(id);
    await this.journalRepo.record(
      'REVOGAR_API_KEY',
      'ApiKeyParceiro',
      operadorResponsavel,
      { id: existente.id, ativa: true },
      { id: revogada.id, ativa: false }
    );

    return revogada;
  }

  public async listarApiKeys() {
    const keys = await this.apiKeyRepo.listAll();
    return keys.map(k => ({
      id: k.id,
      nomeParceiro: k.nomeParceiro,
      organizacaoId: k.organizacaoId,
      organizacao: k.organizacao,
      prefixoChave: `${k.prefixoChave}...`,
      permissoes: JSON.parse(k.permissoesJson),
      limiteRequisicoesMin: k.limiteRequisicoesMin,
      planoAcesso: k.planoAcesso,
      ativa: k.ativa,
      totalRequisicoes: k.totalRequisicoes,
      ultimoUsoEm: k.ultimoUsoEm,
      expiraEm: k.expiraEm,
      criadoEm: k.criadoEm
    }));
  }
}
