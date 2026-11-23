import { EquipamentoRepository } from '../repositories/EquipamentoRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { ORDEM_ESTADO_FISICO, StatusRastreamento } from '../types';

export class EquipamentoService {
  private equipRepo: EquipamentoRepository;
  private loteRepo: LoteRepository;
  private journalRepo: JournalRepository;

  constructor() {
    this.equipRepo = new EquipamentoRepository();
    this.loteRepo = new LoteRepository();
    this.journalRepo = new JournalRepository();
  }

  public static calcularDepreciacao(anoFabricacao: number, estadoFisico: string): number {
    const anoAtual = new Date().getFullYear();
    const idadeAnos = Math.max(0, anoAtual - anoFabricacao);
    const depreciacaoTemporal = Math.min(0.90, idadeAnos * 0.14);

    const fatorEstado: Record<string, number> = {
      NOVO: 0.0,
      BOM_ESTADO: 0.12,
      USADO_LEVE: 0.28,
      USADO_MODERADO: 0.48,
      DANIFICADO_LEVE: 0.68,
      DANIFICADO_GRAVE: 0.86,
      INSERVIVEL: 0.98
    };

    const depreciacaoFisica = fatorEstado[estadoFisico] ?? 0.50;
    const depreciacaoTotal = Math.min(1.0, (depreciacaoTemporal * 0.45) + (depreciacaoFisica * 0.55));
    return Number(depreciacaoTotal.toFixed(4));
  }

  public static estimarValorRecuperacaoBRL(
    tipo: string,
    marca: string,
    estadoFisico: string,
    pesoQuilogramas: number,
    anoFabricacao: number
  ): number {
    const valorBasePorKg: Record<string, number> = {
      SERVIDOR: 115.0,
      NOTEBOOK: 95.0,
      COMPUTADOR_MESA: 65.0,
      ROTEADOR: 72.0,
      MONITOR: 45.0,
      IMPRESSORA: 38.0,
      FONTE_ALIMENTACAO: 52.0,
      CABO_ESTRUTURADO: 68.0 // cobre de alta pureza
    };

    const multiplicadorMarca: Record<string, number> = {
      Dell: 1.18,
      Apple: 1.35,
      Lenovo: 1.15,
      HP: 1.12,
      Cisco: 1.25,
      Samsung: 1.08,
      LG: 1.05
    };

    const multiplicadorEstado: Record<string, number> = {
      NOVO: 1.50,
      BOM_ESTADO: 1.25,
      USADO_LEVE: 1.05,
      USADO_MODERADO: 0.85,
      DANIFICADO_LEVE: 0.65,
      DANIFICADO_GRAVE: 0.45,
      INSERVIVEL: 0.30 // recuperação pura de metais nobres (ouro, cobre, terras raras)
    };

    const baseKg = valorBasePorKg[tipo] ?? 50.0;
    const fatorMarca = multiplicadorMarca[marca] ?? 1.0;
    const fatorEstado = multiplicadorEstado[estadoFisico] ?? 0.75;
    const depreciacao = EquipamentoService.calcularDepreciacao(anoFabricacao, estadoFisico);
    const fatorRetencao = Math.max(0.25, 1.0 - depreciacao * 0.5);

    const valor = pesoQuilogramas * baseKg * fatorMarca * fatorEstado * fatorRetencao;
    return Number(valor.toFixed(2));
  }

  public async buscarPorIdOuCodigo(idOuCodigo: string) {
    let eq = await this.equipRepo.findById(idOuCodigo);
    if (!eq) {
      eq = await this.equipRepo.findByBarcode(idOuCodigo);
    }
    if (!eq) {
      throw new Error(`Equipamento '${idOuCodigo}' não encontrado.`);
    }
    return eq;
  }

  public async rastrear(idOuCodigo: string) {
    const eq = await this.buscarPorIdOuCodigo(idOuCodigo);
    const depreciacao = EquipamentoService.calcularDepreciacao(eq.anoFabricacao, eq.estadoFisico);
    const valorRecuperacao =
      eq.valorEstimadoRecuperacao ??
      EquipamentoService.estimarValorRecuperacaoBRL(
        eq.tipo,
        eq.marca,
        eq.estadoFisico,
        eq.pesoQuilogramas,
        eq.anoFabricacao
      );

    return {
      equipamento: eq,
      depreciacaoPercentual: Number((depreciacao * 100).toFixed(2)),
      valorEstimadoRecuperacaoBRL: valorRecuperacao,
      historicoMovimentacoes: eq.movimentacoes
    };
  }

  public async atualizarStatus(
    id: string,
    novoStatus: string,
    justificativa: string | undefined,
    operador: string,
    versaoEsperada?: number
  ) {
    const eq = await this.buscarPorIdOuCodigo(id);

    const statusDesmonte = [
      StatusRastreamento.AGUARDANDO_DESMONTE,
      StatusRastreamento.EM_DESMONTE,
      StatusRastreamento.PECAS_REAPROVEITADAS,
      StatusRastreamento.MATERIAL_RECICLAVEL,
      StatusRastreamento.DESCARTE_SEGURO
    ];

    if (statusDesmonte.includes(novoStatus as any)) {
      const lote = await this.loteRepo.findById(eq.loteId);
      if (lote && !['TRIAGEM_CONCLUIDA', 'ENCAMINHADO', 'FINALIZADO'].includes(lote.statusProcessamento)) {
        throw new Error(
          `Restrição de Negócio: O equipamento só pode ir para desmonte após o Lote '${eq.loteId}' passar por triagem completa (Status do lote: ${lote.statusProcessamento}).`
        );
      }
    }

    const ultimaMov = eq.movimentacoes.length > 0 ? eq.movimentacoes[eq.movimentacoes.length - 1] : null;
    const origem = ultimaMov ? ultimaMov.destino : 'RECEBIMENTO_LOTE';
    const destino = `SETOR_${novoStatus}`;

    const res = await this.equipRepo.updateStatusWithMovement(
      eq.id,
      novoStatus,
      justificativa,
      {
        origem,
        destino,
        responsavel: operador,
        observacao: justificativa || `Transição de status para ${novoStatus}`
      },
      versaoEsperada
    );

    await this.journalRepo.record('ATUALIZAR_STATUS_EQUIP', 'Equipamento', operador, eq, res.equipamento);
    return res;
  }

  public async atualizarEstadoFisico(
    id: string,
    novoEstado: string,
    justificativa: string | undefined,
    operador: string,
    versaoEsperada?: number
  ) {
    const eq = await this.buscarPorIdOuCodigo(id);
    const nivelAnterior = ORDEM_ESTADO_FISICO[eq.estadoFisico] ?? 3;
    const nivelNovo = ORDEM_ESTADO_FISICO[novoEstado] ?? 3;

    if (nivelAnterior - nivelNovo >= 2) {
      if (!justificativa || justificativa.trim().length < 5) {
        throw new Error(
          `Queda acentuada de integridade física (${eq.estadoFisico} -> ${novoEstado}) exige justificativa técnica obrigatória de no mínimo 5 caracteres.`
        );
      }
    }

    const atualizado = await this.equipRepo.updateEstadoFisicoWithMovement(
      eq.id,
      novoEstado,
      justificativa,
      operador,
      versaoEsperada
    );

    await this.journalRepo.record('ATUALIZAR_ESTADO_EQUIP', 'Equipamento', operador, eq, atualizado);
    return atualizado;
  }

  public async listar(filtro?: { tipo?: string; status?: string; loteId?: string; organizacaoId?: string }) {
    return this.equipRepo.listAll(filtro);
  }
}
