import { prisma } from '../config/prisma';

export class AnalyticsRepository {
  public async saveRelatorioEficiencia(data: {
    periodoReferencia: string;
    totalLotesAnalisados: number;
    tempoMedioTriagemHoras: number;
    tempoMedianoTriagemHoras: number;
    desvioPadraoTriagemHoras: number;
    operadorMaisEficiente?: string | null;
    gargaloIdentificado: string;
    metricasPorOperadorJson: string;
    metricasPorPeriodoJson: string;
    geradoPor?: string;
  }) {
    return prisma.relatorioEficiencia.create({ data });
  }

  public async listRelatoriosEficiencia(limite: number = 10) {
    return prisma.relatorioEficiencia.findMany({
      orderBy: { criadoEm: 'desc' },
      take: limite
    });
  }

  public async saveRelatorioRentabilidade(data: {
    tipoEquipamento: string;
    marcaAnalisada: string;
    totalUnidadesAmostra: number;
    pesoMedioKg: number;
    valorMedioRecuperacaoBRL: number;
    valorMedianoRecuperacaoBRL: number;
    desvioPadraoRecuperacaoBRL: number;
    valorTotalPotencialBRL: number;
    indicePriorizacao: number;
    detalhamentoPorEstadoMarcaJson: string;
    geradoPor?: string;
  }) {
    return prisma.relatorioRentabilidade.create({ data });
  }

  public async listRelatoriosRentabilidade(limite: number = 20) {
    return prisma.relatorioRentabilidade.findMany({
      orderBy: { criadoEm: 'desc' },
      take: limite
    });
  }

  public async saveRelatorioPreditivo(data: {
    tipoEquipamento: string;
    modeloAnalisado?: string;
    totalAmostrasHistoricas: number;
    coeficienteAngularOLS: number;
    interceptoOLS: number;
    coeficienteDeterminacaoR2: number;
    idadeMediaAtualAnos: number;
    vidaUtilTotalEstimadaAnos: number;
    vidaUtilRemanescenteMediaAnos: number;
    anoProjetadoInservivel: number;
    suavizacaoExponencialAlfa: number;
    taxaFalhaSuavizada: number;
    projecoesDetalhadasJson: string;
    geradoPor?: string;
  }) {
    return prisma.relatorioPreditivo.create({ data });
  }

  public async listRelatoriosPreditivos(tipoEquipamento?: string, limite: number = 20) {
    return prisma.relatorioPreditivo.findMany({
      where: tipoEquipamento ? { tipoEquipamento } : undefined,
      orderBy: { criadoEm: 'desc' },
      take: limite
    });
  }
}
