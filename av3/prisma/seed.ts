import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { EquipamentoService } from '../src/services/EquipamentoService';
import { AnalyticsService } from '../src/services/AnalyticsService';

const prisma = new PrismaClient();

function hashPassword(senhaPlana: string, salt: string): string {
  return crypto.createHash('sha256').update(senhaPlana + salt).digest('hex');
}

function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

async function main() {
  console.log('\n====================================================================');
  console.log('   SEEDING DO BANCO DE DADOS - GREENCODE ANALYTICS & PUBLIC API (AV3)');
  console.log('====================================================================');

  // Limpeza prévia idempotente
  await prisma.tarefaRelatorio.deleteMany();
  await prisma.relatorioPreditivo.deleteMany();
  await prisma.relatorioRentabilidade.deleteMany();
  await prisma.relatorioEficiencia.deleteMany();
  await prisma.apiKeyParceiro.deleteMany();
  await prisma.movimentacao.deleteMany();
  await prisma.equipamento.deleteMany();
  await prisma.lote.deleteMany();
  await prisma.contrato.deleteMany();
  await prisma.organizacao.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.journalTransacao.deleteMany();
  await prisma.parametroGlobal.deleteMany();

  // 1. Parâmetros Globais
  await prisma.parametroGlobal.create({
    data: {
      id: 'CONFIG_GLOBAL',
      aliquotaImpostoPadrao: 0.12,
      coeficienteDepreciacaoAnual: 0.20
    }
  });
  console.log('✔ Parâmetros globais inicializados.');

  // 2. Usuários do Sistema (4 Papéis)
  const saltAdmin = crypto.randomBytes(16).toString('hex');
  const saltCad = crypto.randomBytes(16).toString('hex');
  const saltAlmox = crypto.randomBytes(16).toString('hex');
  const saltAudit = crypto.randomBytes(16).toString('hex');

  await prisma.usuario.createMany({
    data: [
      {
        usuario: 'admin',
        hashSenha: hashPassword('admin123', saltAdmin),
        salt: saltAdmin,
        papel: 'ADMINISTRADOR',
        ativo: true
      },
      {
        usuario: 'operador_cad',
        hashSenha: hashPassword('cad123', saltCad),
        salt: saltCad,
        papel: 'OPERADOR_CADASTRO',
        ativo: true
      },
      {
        usuario: 'gestor_almox',
        hashSenha: hashPassword('almox123', saltAlmox),
        salt: saltAlmox,
        papel: 'GESTOR_ALMOXARIFADO',
        ativo: true
      },
      {
        usuario: 'auditor_fiscal',
        hashSenha: hashPassword('audit123', saltAudit),
        salt: saltAudit,
        papel: 'AUDITOR',
        ativo: true
      }
    ]
  });
  console.log('✔ 4 Usuários internos criados (admin, operador_cad, gestor_almox, auditor_fiscal).');

  // 3. Organizações e Contratos
  const org1 = await prisma.organizacao.create({
    data: {
      id: 'ORG-TELECOM-01',
      razaoSocial: 'Telecom Brasil SA',
      cnpj: '11.222.333/0001-81',
      inscricaoEstadual: '102.304.506-SP',
      enderecoCompleto: 'Av. das Nações Unidas, 12901 - Brooklin Novo, São Paulo - SP',
      telefone: '(11) 3847-9000',
      email: 'sustentabilidade@telecombrasil.com.br',
      contrato: {
        create: {
          dataAssinatura: new Date('2024-01-15'),
          dataVencimento: new Date('2027-01-15'),
          clausulasJson: JSON.stringify([
            'Logística reversa conforme Lei Federal 12.305/2010 (PNRS)',
            'Integração B2B via API Pública com chave dedicada',
            'Relatórios preditivos de vida útil e recuperação de metais nobres'
          ]),
          valorMensal: 4500.00,
          renovacaoAutomatica: true
        }
      }
    }
  });

  const org2 = await prisma.organizacao.create({
    data: {
      id: 'ORG-BANCO-02',
      razaoSocial: 'Banco Digital Futuro SA',
      cnpj: '22.333.444/0001-70',
      inscricaoEstadual: '304.506.708-RJ',
      enderecoCompleto: 'Av. Rio Branco, 156 - Centro, Rio de Janeiro - RJ',
      telefone: '(21) 2500-1000',
      email: 'patrimonio@bancofuturo.com.br',
      contrato: {
        create: {
          dataAssinatura: new Date('2024-06-01'),
          dataVencimento: new Date('2026-12-31'),
          clausulasJson: JSON.stringify([
            'Desmagnetização segura de discos rígidos e mídias de armazenamento',
            'Relatório de auditoria para fins de compliance bancário Bacen'
          ]),
          valorMensal: 8200.00,
          renovacaoAutomatica: true
        }
      }
    }
  });
  console.log('✔ Organizações clientes e contratos vigentes populados.');

  // 4. Chaves de API Pública para Parceiros Externos (AV3 - Pilar 2)
  const rawKeyParceiroFull = 'gc_live_parceiro_telecom_full_2025';
  const rawKeyCooperativaReadOnly = 'gc_live_cooperativa_ecoverde_readonly_2025';

  await prisma.apiKeyParceiro.createMany({
    data: [
      {
        id: 'KEY-PARTNER-01',
        nomeParceiro: 'Telecom Brasil ERP Integration',
        organizacaoId: org1.id,
        prefixoChave: rawKeyParceiroFull.substring(0, 14),
        hashChave: hashApiKey(rawKeyParceiroFull),
        permissoesJson: JSON.stringify(['READ_RASTREABILIDADE', 'WRITE_LOTES', 'READ_ANALYTICS']),
        limiteRequisicoesMin: 100,
        planoAcesso: 'ENTERPRISE',
        ativa: true
      },
      {
        id: 'KEY-PARTNER-02',
        nomeParceiro: 'Cooperativa EcoVerde Auditoria Ambiental',
        organizacaoId: null,
        prefixoChave: rawKeyCooperativaReadOnly.substring(0, 14),
        hashChave: hashApiKey(rawKeyCooperativaReadOnly),
        permissoesJson: JSON.stringify(['READ_RASTREABILIDADE']),
        limiteRequisicoesMin: 30,
        planoAcesso: 'BASIC',
        ativa: true
      }
    ]
  });
  console.log('✔ Chaves de API Pública de parceiros pré-configuradas:');
  console.log(`  - Parceiro Full (Rastreio + Lotes + Analytics): ${rawKeyParceiroFull}`);
  console.log(`  - Parceiro Read-Only (Apenas Rastreabilidade):  ${rawKeyCooperativaReadOnly}`);

  // 5. Lotes com tempos de triagem e operadores distintos para a Camada Analítica (Pilar 1)
  const lote1 = await prisma.lote.create({
    data: {
      id: 'LOT-2025-001',
      dataEntrada: new Date('2025-01-10T08:00:00Z'),
      dataConclusaoTriagem: new Date('2025-01-11T02:30:00Z'), // 18.5 horas
      operadorTriagem: 'gestor_almox',
      organizacaoId: org1.id,
      notaFiscal: 'NF-004812',
      transportadora: 'Expresso Verde Logística Ltda',
      statusProcessamento: 'TRIAGEM_CONCLUIDA',
      observacoes: 'Lote Q1 de desativação de call center - notebooks e monitores corporativos'
    }
  });

  const lote2 = await prisma.lote.create({
    data: {
      id: 'LOT-2025-002',
      dataEntrada: new Date('2025-04-15T09:00:00Z'),
      dataConclusaoTriagem: new Date('2025-04-17T03:00:00Z'), // 42 horas (gargalo > 36h)
      operadorTriagem: 'operador_triagem_sul',
      organizacaoId: org2.id,
      notaFiscal: 'NF-099411',
      transportadora: 'TransRapida Cargas',
      statusProcessamento: 'TRIAGEM_CONCLUIDA',
      observacoes: 'Lote Q2 de substituição bienal de servidores blade e notebooks bancários'
    }
  });

  const lote3 = await prisma.lote.create({
    data: {
      id: 'LOT-2025-003',
      dataEntrada: new Date('2025-07-20T10:00:00Z'),
      dataConclusaoTriagem: new Date('2025-07-21T00:00:00Z'), // 14 horas
      operadorTriagem: 'gestor_almox',
      organizacaoId: org1.id,
      notaFiscal: 'NF-102938',
      transportadora: 'EcoLog Transportes',
      statusProcessamento: 'TRIAGEM_CONCLUIDA',
      observacoes: 'Lote Q3 de renovação de parque tecnológico'
    }
  });
  console.log('✔ Lotes históricos distribuídos em múltiplos trimestres e operadores criados.');

  // 6. Massa de Equipamentos com diferentes idades, marcas, modelos e estados físicos para Regressão OLS e Rentabilidade
  const listaEquipamentosSeed = [
    {
      id: 'EQP-NBK-001',
      codigoBarrasInterno: 'GC-NOTEBOOK-2025-00001',
      tipo: 'NOTEBOOK',
      marca: 'Dell',
      modelo: 'Latitude 5420 Core i5',
      anoFabricacao: 2023,
      estadoFisico: 'BOM_ESTADO',
      pesoQuilogramas: 1.75,
      loteId: lote1.id,
      posicaoNoLote: 1,
      statusRastreamento: 'AGUARDANDO_DESMONTE'
    },
    {
      id: 'EQP-NBK-002',
      codigoBarrasInterno: 'GC-NOTEBOOK-2025-00002',
      tipo: 'NOTEBOOK',
      marca: 'Lenovo',
      modelo: 'ThinkPad T14 Gen 2',
      anoFabricacao: 2021,
      estadoFisico: 'USADO_MODERADO',
      pesoQuilogramas: 1.55,
      loteId: lote1.id,
      posicaoNoLote: 2,
      statusRastreamento: 'EM_DESMONTE'
    },
    {
      id: 'EQP-NBK-003',
      codigoBarrasInterno: 'GC-NOTEBOOK-2025-00003',
      tipo: 'NOTEBOOK',
      marca: 'HP',
      modelo: 'EliteBook 840 G5',
      anoFabricacao: 2019,
      estadoFisico: 'DANIFICADO_GRAVE',
      pesoQuilogramas: 1.68,
      loteId: lote2.id,
      posicaoNoLote: 1,
      statusRastreamento: 'PECAS_REAPROVEITADAS'
    },
    {
      id: 'EQP-SRV-001',
      codigoBarrasInterno: 'GC-SERVIDOR-2025-00004',
      tipo: 'SERVIDOR',
      marca: 'Dell',
      modelo: 'PowerEdge R740',
      anoFabricacao: 2022,
      estadoFisico: 'BOM_ESTADO',
      pesoQuilogramas: 21.50,
      loteId: lote2.id,
      posicaoNoLote: 2,
      statusRastreamento: 'AGUARDANDO_DESMONTE'
    },
    {
      id: 'EQP-SRV-002',
      codigoBarrasInterno: 'GC-SERVIDOR-2025-00005',
      tipo: 'SERVIDOR',
      marca: 'HP',
      modelo: 'ProLiant DL380 Gen10',
      anoFabricacao: 2018,
      estadoFisico: 'DANIFICADO_LEVE',
      pesoQuilogramas: 23.10,
      loteId: lote2.id,
      posicaoNoLote: 3,
      statusRastreamento: 'EM_DESMONTE'
    },
    {
      id: 'EQP-MON-001',
      codigoBarrasInterno: 'GC-MONITOR-2025-00006',
      tipo: 'MONITOR',
      marca: 'Samsung',
      modelo: 'SyncMaster 24 Pol',
      anoFabricacao: 2020,
      estadoFisico: 'DANIFICADO_LEVE',
      pesoQuilogramas: 3.40,
      loteId: lote3.id,
      posicaoNoLote: 1,
      statusRastreamento: 'MATERIAL_RECICLAVEL'
    },
    {
      id: 'EQP-MON-002',
      codigoBarrasInterno: 'GC-MONITOR-2025-00007',
      tipo: 'MONITOR',
      marca: 'Dell',
      modelo: 'UltraSharp U2422H',
      anoFabricacao: 2023,
      estadoFisico: 'BOM_ESTADO',
      pesoQuilogramas: 3.80,
      loteId: lote3.id,
      posicaoNoLote: 2,
      statusRastreamento: 'AGUARDANDO_DESMONTE'
    }
  ];

  for (const item of listaEquipamentosSeed) {
    const valorEstimado = EquipamentoService.estimarValorRecuperacaoBRL(
      item.tipo,
      item.marca,
      item.estadoFisico,
      item.pesoQuilogramas,
      item.anoFabricacao
    );

    await prisma.equipamento.create({
      data: {
        ...item,
        valorEstimadoRecuperacao: valorEstimado,
        movimentacoes: {
          createMany: {
            data: [
              {
                dataHora: new Date('2025-01-10T09:30:00Z'),
                origem: 'RECEBIMENTO_LOTE',
                destino: 'ALMOXARIFADO_ENTRADA',
                responsavel: 'gestor_almox',
                observacao: 'Recepção e triagem visual inicial'
              },
              {
                dataHora: new Date('2025-01-11T02:00:00Z'),
                origem: 'ALMOXARIFADO_ENTRADA',
                destino: 'BANCADA_TRIAGEM_CONCLUIDA',
                responsavel: 'gestor_almox',
                observacao: 'Triagem técnica elétrica e classificação de componentes concluída'
              }
            ]
          }
        }
      }
    });
  }
  console.log(`✔ ${listaEquipamentosSeed.length} Equipamentos multimarca com histórico de movimentações criados.`);

  // 7. Pré-computar snapshots analíticos iniciais para consulta imediata no histórico
  const analyticsService = new AnalyticsService();
  await analyticsService.analisarEficienciaOperacional('SEED_BASELINE_2025', 'SEED_INICIAL');
  await analyticsService.analisarRentabilidadePorEquipamento(undefined, 'SEED_INICIAL');
  await analyticsService.analisarVidaUtilPreditiva(undefined, 0.35, 'SEED_INICIAL');
  console.log('✔ Snapshots analíticos iniciais (Eficiência, Rentabilidade e Regressão Preditiva OLS) persistidos.');

  // 8. Registro no Journal Transacional
  await prisma.journalTransacao.create({
    data: {
      operacao: 'SEED_DATABASE_AV3',
      entidade: 'SistemaAnalitico',
      usuarioResponsavel: 'admin',
      dadosAntes: null,
      dadosDepois: JSON.stringify({
        mensagem: 'Banco de dados inicializado com massa analítica, API Keys e modelos preditivos OLS (AV3)'
      })
    }
  });

  console.log('\n✅ Seed da AV3 concluído com sucesso!');
  console.log('====================================================================\n');
}

main()
  .catch(e => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
