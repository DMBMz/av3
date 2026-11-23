import { prisma } from '../config/prisma';

export class ApiKeyRepository {
  public async create(data: {
    id?: string;
    nomeParceiro: string;
    organizacaoId?: string | null;
    prefixoChave: string;
    hashChave: string;
    permissoesJson: string;
    limiteRequisicoesMin?: number;
    planoAcesso?: string;
    expiraEm?: Date | null;
  }) {
    return prisma.apiKeyParceiro.create({
      data: {
        id: data.id,
        nomeParceiro: data.nomeParceiro,
        organizacaoId: data.organizacaoId || null,
        prefixoChave: data.prefixoChave,
        hashChave: data.hashChave,
        permissoesJson: data.permissoesJson,
        limiteRequisicoesMin: data.limiteRequisicoesMin ?? 60,
        planoAcesso: data.planoAcesso ?? 'STANDARD',
        expiraEm: data.expiraEm || null
      },
      include: {
        organizacao: {
          select: { id: true, razaoSocial: true, cnpj: true }
        }
      }
    });
  }

  public async findByHash(hashChave: string) {
    return prisma.apiKeyParceiro.findUnique({
      where: { hashChave },
      include: {
        organizacao: {
          select: { id: true, razaoSocial: true, cnpj: true }
        }
      }
    });
  }

  public async findById(id: string) {
    return prisma.apiKeyParceiro.findUnique({
      where: { id },
      include: {
        organizacao: {
          select: { id: true, razaoSocial: true, cnpj: true }
        }
      }
    });
  }

  public async incrementUsage(id: string) {
    return prisma.apiKeyParceiro.update({
      where: { id },
      data: {
        totalRequisicoes: { increment: 1 },
        ultimoUsoEm: new Date()
      }
    });
  }

  public async revoke(id: string) {
    return prisma.apiKeyParceiro.update({
      where: { id },
      data: { ativa: false }
    });
  }

  public async listAll() {
    return prisma.apiKeyParceiro.findMany({
      include: {
        organizacao: {
          select: { id: true, razaoSocial: true, cnpj: true }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });
  }
}
