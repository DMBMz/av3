import { prisma } from '../config/prisma';

export class LoteRepository {
  public async findById(id: string) {
    return prisma.lote.findUnique({
      where: { id },
      include: {
        organizacao: true,
        equipamentos: {
          include: {
            movimentacoes: true
          }
        }
      }
    });
  }

  public async listAll(filtro?: { organizacaoId?: string; status?: string }) {
    return prisma.lote.findMany({
      where: {
        organizacaoId: filtro?.organizacaoId,
        statusProcessamento: filtro?.status
      },
      include: {
        organizacao: {
          select: { id: true, razaoSocial: true, cnpj: true }
        },
        equipamentos: true
      },
      orderBy: { dataEntrada: 'desc' }
    });
  }

  public async createWithEquipamentos(
    dadosLote: {
      id?: string;
      dataEntrada: Date;
      organizacaoId: string;
      notaFiscal: string;
      transportadora: string;
      observacoes?: string;
    },
    equipamentos: Array<{
      id?: string;
      codigoBarrasInterno: string;
      tipo: string;
      marca: string;
      modelo: string;
      anoFabricacao: number;
      estadoFisico: string;
      pesoQuilogramas: number;
      valorEstimadoRecuperacao?: number;
      posicaoNoLote: number;
    }>
  ) {
    return prisma.$transaction(async (tx) => {
      const lote = await tx.lote.create({
        data: {
          id: dadosLote.id,
          dataEntrada: dadosLote.dataEntrada,
          organizacaoId: dadosLote.organizacaoId,
          notaFiscal: dadosLote.notaFiscal,
          transportadora: dadosLote.transportadora,
          observacoes: dadosLote.observacoes,
          statusProcessamento: 'RECEBIDO'
        }
      });

      if (equipamentos.length > 0) {
        for (const eq of equipamentos) {
          const equipamentoCriado = await tx.equipamento.create({
            data: {
              id: eq.id,
              loteId: lote.id,
              codigoBarrasInterno: eq.codigoBarrasInterno,
              tipo: eq.tipo,
              marca: eq.marca,
              modelo: eq.modelo,
              anoFabricacao: eq.anoFabricacao,
              estadoFisico: eq.estadoFisico,
              pesoQuilogramas: eq.pesoQuilogramas,
              valorEstimadoRecuperacao: eq.valorEstimadoRecuperacao,
              posicaoNoLote: eq.posicaoNoLote,
              statusRastreamento: 'AGUARDANDO_TRIAGEM'
            }
          });

          await tx.movimentacao.create({
            data: {
              equipamentoId: equipamentoCriado.id,
              origem: 'RECEBIMENTO_LOTE',
              destino: 'ALMOXARIFADO_ENTRADA',
              responsavel: 'SISTEMA_RECEPCAO',
              observacao: `Entrada vinculada à NF ${lote.notaFiscal}`
            }
          });
        }
      }

      return tx.lote.findUnique({
        where: { id: lote.id },
        include: { equipamentos: true, organizacao: true }
      });
    });
  }

  public async completeTriage(loteId: string, operador: string = 'GESTOR_TRIAGEM', versaoEsperada?: number) {
    return prisma.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({
        where: { id: loteId },
        include: { equipamentos: true }
      });

      if (!lote) {
        throw new Error(`Lote '${loteId}' não encontrado.`);
      }

      if (versaoEsperada !== undefined && lote.versao !== versaoEsperada) {
        throw new Error('Conflito de concorrência: O lote foi modificado por outro operador.');
      }

      if (lote.equipamentos.length === 0) {
        throw new Error('Não é possível concluir a triagem de lote sem equipamentos cadastrados.');
      }

      const agora = new Date();
      const loteAtualizado = await tx.lote.update({
        where: { id: loteId },
        data: {
          statusProcessamento: 'TRIAGEM_CONCLUIDA',
          dataConclusaoTriagem: agora,
          operadorTriagem: operador,
          versao: { increment: 1 }
        }
      });

      await tx.equipamento.updateMany({
        where: {
          loteId: loteId,
          statusRastreamento: { in: ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM'] }
        },
        data: {
          statusRastreamento: 'AGUARDANDO_DESMONTE',
          versao: { increment: 1 }
        }
      });

      for (const eq of lote.equipamentos) {
        await tx.movimentacao.create({
          data: {
            equipamentoId: eq.id,
            origem: 'ALMOXARIFADO_ENTRADA',
            destino: 'SETOR_TRIAGEM_CONCLUIDA',
            responsavel: operador,
            observacao: 'Triagem técnica homologada'
          }
        });
      }

      return loteAtualizado;
    });
  }
}
