import * as cron from 'node-cron';
import { AnalyticsService } from './AnalyticsService';

/**
 * Agendador de Tarefas Analíticas em Segundo Plano (node-cron - AV3)
 * Executa cálculos estatísticos periódicos de eficiência operacional, rentabilidade e regressão preditiva OLS.
 */
export class CronSchedulerService {
  private analyticsService: AnalyticsService;
  private task: cron.ScheduledTask | null = null;
  private ultimaExecucao: Date | null = null;
  private totalExecucoes: number = 0;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  public iniciarAgendamento(expressaoCron: string = '0 */6 * * *') {
    if (this.task) {
      return;
    }

    this.task = cron.schedule(expressaoCron, async () => {
      await this.executarCicloAnalitico('CRON_SCHEDULER_AUTO');
    });
  }

  public async executarCicloAnalitico(origem: string = 'CRON_MANUAL_TRIGGER') {
    const [eficiencia, rentabilidade, preditivo] = await Promise.all([
      this.analyticsService.analisarEficienciaOperacional('CRON_SNAPSHOT_2025', origem),
      this.analyticsService.analisarRentabilidadePorEquipamento(undefined, origem),
      this.analyticsService.analisarVidaUtilPreditiva(undefined, 0.35, origem)
    ]);

    this.ultimaExecucao = new Date();
    this.totalExecucoes += 1;

    return {
      origem,
      executadoEm: this.ultimaExecucao.toISOString(),
      totalExecucoesAcumuladas: this.totalExecucoes,
      resumo: {
        eficienciaRelatorioId: eficiencia.relatorioId,
        categoriasRentabilidadeProcessadas: rentabilidade.rankingRentabilidade.length,
        modelosPreditivosAtualizados: preditivo.totalCategoriasProjetadas
      }
    };
  }

  public pararAgendamento() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  public obterStatus() {
    return {
      ativo: this.task !== null,
      expressaoCron: '0 */6 * * * (a cada 6 horas)',
      ultimaExecucao: this.ultimaExecucao ? this.ultimaExecucao.toISOString() : null,
      totalExecucoes: this.totalExecucoes
    };
  }
}
