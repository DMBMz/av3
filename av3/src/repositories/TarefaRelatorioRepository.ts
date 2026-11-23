import { prisma } from '../config/prisma';

export class TarefaRelatorioRepository {
  public async create(data: {
    id?: string;
    tipoRelatorio: string;
    formatoSaida: string;
    solicitante: string;
    organizacaoFiltroId?: string | null;
    parametrosJson?: string;
    maxTentativas?: number;
    webhookUrl?: string | null;
  }) {
    return prisma.tarefaRelatorio.create({
      data: {
        id: data.id,
        tipoRelatorio: data.tipoRelatorio,
        formatoSaida: data.formatoSaida,
        status: 'AGUARDANDO',
        solicitante: data.solicitante,
        organizacaoFiltroId: data.organizacaoFiltroId || null,
        parametrosJson: data.parametrosJson || '{}',
        maxTentativas: data.maxTentativas ?? 3,
        webhookUrl: data.webhookUrl || null
      }
    });
  }

  public async findById(id: string) {
    return prisma.tarefaRelatorio.findUnique({
      where: { id }
    });
  }

  public async updateStatus(
    id: string,
    data: {
      status?: string;
      tentativas?: number;
      progressoPercentual?: number;
      caminhoArquivo?: string | null;
      conteudoResultado?: string | null;
      erroMensagem?: string | null;
      iniciadoEm?: Date;
      concluidoEm?: Date;
    }
  ) {
    return prisma.tarefaRelatorio.update({
      where: { id },
      data
    });
  }

  public async listRecent(limite: number = 30, solicitante?: string) {
    return prisma.tarefaRelatorio.findMany({
      where: solicitante ? { solicitante } : undefined,
      orderBy: { criadoEm: 'desc' },
      take: limite
    });
  }
}
