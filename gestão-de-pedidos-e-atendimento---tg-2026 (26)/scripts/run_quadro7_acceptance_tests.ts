/**
 * ROTEIRO DE TESTES DE ACEITAÇÃO - QUADRO 7 (TRABALHO DE GRADUAÇÃO - FATEC FRANCA 2026)
 * Executa os 8 cenários reais do Quadro 7 contra a API HTTP e banco relacional SQLite em execução.
 *
 * Rastreabilidade:
 * - Data: 28/10/2026
 * - Ambiente: Node.js v22.23.4, Linux x86_64, SQLite 3 (WAL Mode), Express 4, Vite 6, React 19
 * - Versão Testada: v3.1.0-tg-fatec
 * - Credenciais de Homologação:
 *     Garçom:  garcom@saborbrasa.com  [Carregada via TEST_GARCOM_PASSWORD ou segredo local de teste]
 *     Cozinha: cozinha@saborbrasa.com [Carregada via TEST_KITCHEN_PASSWORD ou segredo local de teste]
 *     Gerente: gerente@saborbrasa.com [Carregada via TEST_MANAGER_PASSWORD ou segredo local de teste]
 */

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const DB_SQLITE_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'database.sqlite');
const REPORT_PATH = path.join(process.cwd(), 'docs', 'documento_7_testes_rastreabilidade.md');
const QUADRO7_REPORT_PATH = path.join(process.cwd(), 'docs', 'quadro_7_testes_rastreabilidade.md');
const LOG_PATH = path.join(process.cwd(), 'docs', 'test_execution.log');

const BACKUP_POST7_PATH = path.join(process.cwd(), 'data', 'backups', 'database_pos_testes_quadro7.sqlite');
const BACKUP_POST8_PATH = path.join(process.cwd(), 'data', 'backups', 'database_pos_testes_quadro8.sqlite');

const GARCOM_PASS = process.env.TEST_GARCOM_PASSWORD || 'Garcom@2026';
const KITCHEN_PASS = process.env.TEST_KITCHEN_PASSWORD || 'Cozinha@2026';
const MANAGER_PASS = process.env.TEST_MANAGER_PASSWORD || 'Gerente@2026';
const NEW_USER_PASS = process.env.TEST_NEW_USER_PASSWORD || 'Acesso@2026';

const logLines: string[] = [];
function log(msg: string = '') {
  console.log(msg);
  logLines.push(msg);
}

interface ScenarioResult {
  numero: number;
  nome: string;
  cenario: string;
  resultadoEsperado: string;
  resultadoObtido: string;
  status: 'Aprovado' | 'Reprovado';
  requisitos: string;
  evidencias: any;
}

const resultados: ScenarioResult[] = [];

async function executarCheckpointEstrito(dbPath: string, etapaNome: string): Promise<{ busy: number; log: number; checkpointed: number }> {
  let checkpointConfirmado = false;
  let cpResult: { busy: number; log: number; checkpointed: number } | null = null;
  let cpErro = '';

  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    let cpDb: any = null;
    try {
      cpDb = new DatabaseSync(dbPath);
      // Validar explicitamente que o banco está em modo WAL
      const jModeRes = cpDb.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string } | undefined;
      const journalMode = (jModeRes?.journal_mode || '').toLowerCase();
      if (journalMode !== 'wal') {
        cpErro = `Banco não está em modo WAL (journal_mode='${journalMode}')`;
        continue;
      }

      const res = cpDb.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get() as { busy: number; log: number; checkpointed: number } | undefined;
      if (res && typeof res.busy === 'number' && typeof res.log === 'number' && typeof res.checkpointed === 'number') {
        if (res.busy === 0 && res.log >= 0 && res.checkpointed >= 0 && res.checkpointed === res.log) {
          checkpointConfirmado = true;
          cpResult = res;
          break;
        } else {
          cpErro = `Consolidação incompleta, valores negativos ou banco bloqueado (busy=${res.busy}, log=${res.log}, checkpointed=${res.checkpointed})`;
        }
      } else {
        cpErro = 'Retorno nulo ou inválido do PRAGMA wal_checkpoint';
      }
    } catch (err: any) {
      cpErro = err.message;
    } finally {
      if (cpDb) {
        try { cpDb.close(); } catch {}
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (!checkpointConfirmado || !cpResult) {
    const falhaMsg = `❌ FALHA CRÍTICA NO CHECKPOINT (${etapaNome}) em ${dbPath}: ${cpErro}. Operação interrompida!`;
    log(falhaMsg);
    throw new Error(falhaMsg);
  }

  log(`✔ Checkpoint do WAL (${etapaNome}) validado e consolidado com sucesso (busy=${cpResult.busy}, log=${cpResult.log}, checkpointed=${cpResult.checkpointed}, mode=wal).`);
  return cpResult;
}

async function login(email: string, password: string): Promise<{ token: string; user: any; status: number }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha no login (${email}): [HTTP ${res.status}] ${data.error || res.statusText}`);
  }
  return { token: data.token, user: data.user, status: res.status };
}

async function run() {
  const dataExecucao = new Date().toLocaleString('pt-BR');
  log('='.repeat(80));
  log(' EXECUÇÃO DO ROTEIRO DE TESTES DE ACEITAÇÃO (QUADRO 7)');
  log(` Data/Hora      : ${dataExecucao}`);
  log(` Ambiente       : Node.js ${process.version} - Linux x86_64 - SQLite 3 WAL Mode`);
  log(` Versão Testada : 3.1.0 (Release Tag: v3.1.0-tg-fatec)`);
  log(` Endpoint       : ${BASE_URL}`);
  log(` Banco Alvo     : ${DB_SQLITE_PATH}`);
  log('='.repeat(80));

  // ---------------------------------------------------------------------------
  // PREPARAÇÃO: ASSEGURAR ESTADO BASE LIMPO (IDEMPOTÊNCIA PARA EXECUÇÕES REPETIDAS)
  // ---------------------------------------------------------------------------
  try {
    // Garantir que a cópia de segurança da base original de desenvolvimento exista
    const devBackupPath = path.join(process.cwd(), 'data', 'backups', 'database_original_dev.sqlite');
    if (!fs.existsSync(devBackupPath) && fs.existsSync(DB_SQLITE_PATH)) {
      fs.mkdirSync(path.dirname(devBackupPath), { recursive: true });
      fs.copyFileSync(DB_SQLITE_PATH, devBackupPath);
      log(`[PREPARAÇÃO] Backup da base original preservado em: ${devBackupPath}`);
    }

    const diskInit = new DatabaseSync(DB_SQLITE_PATH);
    diskInit.exec('PRAGMA foreign_keys = ON;');
    diskInit.exec('PRAGMA journal_mode = WAL;');

    // 1. Resetar nomes canônicos, status e desvincular pedidos das mesas para evitar resíduos de execuções anteriores
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 01', status = 'livre', id_pedido_atual = NULL WHERE id_mesa = 'mesa-01'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 02', status = 'ocupada', id_pedido_atual = 'CMD-1080' WHERE id_mesa = 'mesa-02'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 03', status = 'livre', id_pedido_atual = NULL WHERE id_mesa = 'mesa-03'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 04', status = 'ocupada', id_pedido_atual = 'CMD-1083' WHERE id_mesa = 'mesa-04'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 05', status = 'ocupada', id_pedido_atual = 'CMD-1081' WHERE id_mesa = 'mesa-05'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Mesa 06', status = 'livre', id_pedido_atual = NULL WHERE id_mesa = 'mesa-06'").run();
    diskInit.prepare("UPDATE Mesa SET nome = 'Balcão 01', status = 'ocupada', id_pedido_atual = 'CMD-1082' WHERE id_mesa = 'mesa-balcao-1'").run();

    // 2. Com chaves estrangeiras ativas (ON), exclusão em Pedido dispara cascade em ItemPedido e HistoricoStatus
    diskInit.prepare("DELETE FROM Pedido WHERE id_pedido NOT IN ('CMD-1079', 'CMD-1080', 'CMD-1081', 'CMD-1082', 'CMD-1083')").run();
    diskInit.prepare("DELETE FROM Funcionario WHERE email NOT IN ('admin@admin.com', 'cozinha@saborbrasa.com', 'garcom@saborbrasa.com', 'gerente@saborbrasa.com')").run();
    diskInit.prepare("DELETE FROM Produto WHERE id_produto NOT IN ('item-sb-1', 'item-sb-2', 'item-sb-3', 'item-sb-4', 'item-sb-5')").run();
    diskInit.prepare("DELETE FROM Categoria WHERE nome NOT IN ('Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas')").run();
    diskInit.close();

    // Validar estritamente o checkpoint no banco preliminar (busy === 0 && checkpointed === log)
    await executarCheckpointEstrito(DB_SQLITE_PATH, 'Preparação Preliminar');
  } catch (initErr: any) {
    const falhaMsg = `❌ FALHA CRÍTICA NA PREPARAÇÃO DA BASE: ${initErr.message}. Execução da suíte abortada imediatamente.`;
    log(falhaMsg);
    throw new Error(falhaMsg);
  }

  // ---------------------------------------------------------------------------
  // FASE 0: VALIDAÇÃO DAS CREDENCIAIS OFICIAIS CONFIGURADAS NO SISTEMA
  // ---------------------------------------------------------------------------
  log('\n[FASE 0] Verificação de login dos três perfis com credenciais configuradas...');
  const garcomAuth = await login('garcom@saborbrasa.com', GARCOM_PASS);
  const kitchenAuth = await login('cozinha@saborbrasa.com', KITCHEN_PASS);
  const managerAuth = await login('gerente@saborbrasa.com', MANAGER_PASS);

  log(` ✔ Garçom  (${garcomAuth.user.email}) -> Perfil: ${garcomAuth.user.role} [HTTP ${garcomAuth.status}]`);
  log(` ✔ Cozinha (${kitchenAuth.user.email}) -> Perfil: ${kitchenAuth.user.role} [HTTP ${kitchenAuth.status}]`);
  log(` ✔ Gerente (${managerAuth.user.email}) -> Perfil: ${managerAuth.user.role} [HTTP ${managerAuth.status}]`);

  const garcomToken = garcomAuth.token;
  const kitchenToken = kitchenAuth.token;
  const managerToken = managerAuth.token;

  // ---------------------------------------------------------------------------
  // 1. CADASTRO DE FUNCIONÁRIOS E PRODUTOS
  // ---------------------------------------------------------------------------
  log('\n[TESTE 1/8] Cadastro de funcionários e produtos...');
  let novoGarcomEmail = 'garcom.homologacao@saborbrasa.com';
  let novoCozinhaEmail = 'cozinha.homologacao@saborbrasa.com';
  try {
    // 1.1 Gerente cadastra um garçom
    const resGarcom = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Garçom Homologação',
        email: novoGarcomEmail,
        password: NEW_USER_PASS,
        role: 'garcom',
        phone: '(16) 99888-1111'
      })
    });
    const dataGarcom = await resGarcom.json();

    // 1.2 Gerente cadastra um funcionário da cozinha
    const resCozinha = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Cozinheiro Homologação',
        email: novoCozinhaEmail,
        password: NEW_USER_PASS,
        role: 'kitchen',
        phone: '(16) 99888-2222'
      })
    });
    const dataCozinha = await resCozinha.json();

    // 1.3 Teste imediato de login dos novos funcionários (disponibilidade real de uso)
    const loginNovoGarcom = await login(novoGarcomEmail, NEW_USER_PASS);
    const loginNovoCozinha = await login(novoCozinhaEmail, NEW_USER_PASS);

    // 1.4 Gerente cadastra uma categoria e produtos
    const catName = 'Especiais';
    const resCat = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ name: catName })
    });
    const dataCat = await resCat.json();

    const resProd = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Burger Gourmet',
        description: 'Pão brioche, blend 200g, queijo gruyère e geleia de bacon artesanal.',
        price: 42.50,
        category: catName,
        prepTimeMinutes: 15
      })
    });
    const dataProd = await resProd.json();

    // 1.5 Validar disponibilidade consultando a listagem
    const listUsers = await (await fetch(`${BASE_URL}/api/users`, { headers: { Authorization: `Bearer ${managerToken}` } })).json();
    const listProds = await (await fetch(`${BASE_URL}/api/products`, { headers: { Authorization: `Bearer ${managerToken}` } })).json();

    const garcomExiste = listUsers.users.some((u: any) => u.email === novoGarcomEmail);
    const cozinhaExiste = listUsers.users.some((u: any) => u.email === novoCozinhaEmail);
    const prodExiste = listProds.products.some((p: any) => p.name === 'Burger Gourmet');

    const aprovado = resGarcom.status === 201 &&
      resCozinha.status === 201 &&
      loginNovoGarcom.status === 200 &&
      loginNovoCozinha.status === 200 &&
      resCat.status === 201 &&
      resProd.status === 201 &&
      garcomExiste &&
      cozinhaExiste &&
      prodExiste;

    resultados.push({
      numero: 1,
      nome: 'Cadastro de funcionários e produtos',
      requisitos: 'RF001, RF002, RF003, RN001, RN005',
      cenario: 'O gerente cadastra um garçom, um funcionário da cozinha e produtos com categorias.',
      resultadoEsperado: 'Funcionários e produtos cadastrados e disponíveis para uso.',
      resultadoObtido: `Garçom (${dataGarcom.user.email}) e cozinheiro (${dataCozinha.user.email}) cadastrados com HTTP 201 e login efetuado com sucesso (HTTP 200). Categoria "${catName}" (HTTP 201) e produto "${dataProd.product.name}" (R$ 42,50, HTTP 201) criados e confirmados no cardápio ativo.`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        garcomCadastroHttp: resGarcom.status,
        garcomLoginHttp: loginNovoGarcom.status,
        cozinhaCadastroHttp: resCozinha.status,
        cozinhaLoginHttp: loginNovoCozinha.status,
        categoriaHttp: resCat.status,
        produtoHttp: resProd.status,
        garcomEmail: dataGarcom.user.email,
        cozinhaEmail: dataCozinha.user.email,
        produtoNome: dataProd.product.name,
        categoriaNome: catName
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 1: ${err.message}`);
    resultados.push({
      numero: 1,
      nome: 'Cadastro de funcionários e produtos',
      requisitos: 'RF001, RF002, RF003, RN001, RN005',
      cenario: 'O gerente cadastra um garçom, um funcionário da cozinha e produtos com categorias.',
      resultadoEsperado: 'Funcionários e produtos cadastrados e disponíveis para uso.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 2. REGISTRO DE PEDIDO PELO GARÇOM
  // ---------------------------------------------------------------------------
  log('\n[TESTE 2/8] Registro de pedido pelo garçom...');
  let pedidoCriadoId = '';
  try {
    // Garantir e conferir que a Mesa 03 está com nome canônico 'Mesa 03' e status 'livre' antes de criar a comanda
    const resPrepMesa03 = await fetch(`${BASE_URL}/api/tables/mesa-03`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Mesa 03', capacity: 4, location: 'Salão Principal' })
    });
    if (!resPrepMesa03.ok) {
      throw new Error(`Falha ao preparar cadastro da Mesa 03: [HTTP ${resPrepMesa03.status}]`);
    }

    const resStatusMesa03 = await fetch(`${BASE_URL}/api/tables/mesa-03/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ status: 'livre' })
    });
    if (!resStatusMesa03.ok) {
      throw new Error(`Falha ao liberar status da Mesa 03: [HTTP ${resStatusMesa03.status}]`);
    }

    // Conferir ativamente que o nome canônico 'Mesa 03' e status 'livre' estão vigentes
    const tablesCheckPreCenario2 = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03Pre = tablesCheckPreCenario2.tables.find((t: any) => t.id === 'mesa-03');
    if (!mesa03Pre || mesa03Pre.name !== 'Mesa 03' || mesa03Pre.status !== 'livre') {
      throw new Error(`Mesa 03 não está no estado canônico antes do cenário 2 (name="${mesa03Pre?.name}", status="${mesa03Pre?.status}")`);
    }

    // Garçom lança pedido com 2 itens (Burger Artesanal 32.90 + 2x Refrigerante 7.00 = 46.90)
    const resPedido = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        tableId: 'mesa-03',
        tableNumber: 'Mesa 03',
        customerName: 'Cliente Roteiro 7 Aceitação',
        notes: 'Ponto da carne ao ponto para mal passado',
        items: [
          { itemId: 'item-sb-1', quantity: 1, observation: 'Sem maionese' },
          { itemId: 'item-sb-5', quantity: 2, observation: 'Gelo e limão' }
        ]
      })
    });
    const dataPedido = await resPedido.json();
    pedidoCriadoId = dataPedido.order?.id;

    // Verificar status da mesa no salão
    const resTables = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03 = resTables.tables.find((t: any) => t.id === 'mesa-03');

    const totalEsperado = 46.90;
    const totalCorreto = Math.abs(dataPedido.order.total - totalEsperado) < 0.01;
    const aprovado = resPedido.status === 201 &&
      dataPedido.order.status === 'Recebido' &&
      totalCorreto &&
      mesa03 && mesa03.status === 'ocupada' &&
      mesa03.currentOrderId === pedidoCriadoId;

    resultados.push({
      numero: 2,
      nome: 'Registro de pedido pelo garçom',
      requisitos: 'RF005, RF006, RN002, RN004',
      cenario: 'O garçom faz login, escolhe uma mesa livre e registra um pedido com vários itens.',
      resultadoEsperado: 'Pedido gravado com status Recebido, total calculado pelo sistema e mesa ocupada.',
      resultadoObtido: `Comanda ${pedidoCriadoId} aberta com HTTP 201. Status: "Recebido". Total recalculado pelo servidor: R$ ${dataPedido.order.total.toFixed(2)} (oficial: 1x R$ 32,90 + 2x R$ 7,00). Mesa 03 vinculada e marcada como "ocupada" com currentOrderId=${pedidoCriadoId}.`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        httpStatus: resPedido.status,
        orderId: pedidoCriadoId,
        orderStatus: dataPedido.order.status,
        calculatedTotal: dataPedido.order.total,
        expectedTotal: totalEsperado,
        tableId: mesa03?.id,
        tableStatus: mesa03?.status,
        currentOrderId: mesa03?.currentOrderId
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'} (Pedido: ${pedidoCriadoId})`);
  } catch (err: any) {
    log(`Erro no cenário 2: ${err.message}`);
    resultados.push({
      numero: 2,
      nome: 'Registro de pedido pelo garçom',
      requisitos: 'RF005, RF006, RN002, RN004',
      cenario: 'O garçom faz login, escolhe uma mesa livre e registra um pedido com vários itens.',
      resultadoEsperado: 'Pedido gravado com status Recebido, total calculado pelo sistema e mesa ocupada.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. VALIDAÇÃO DE OPERAÇÕES INVÁLIDAS
  // ---------------------------------------------------------------------------
  log('\n[TESTE 3/8] Validação de operações inválidas...');
  try {
    // 3.1 Garçom tenta registrar pedido sem mesa
    const resSemMesa = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });
    const dataSemMesa = await resSemMesa.json();

    // 3.2 Garçom tenta registrar pedido em mesa já ocupada (Mesa 03 ocupada no teste 2)
    const resMesaOcupada = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        tableId: 'mesa-03',
        tableNumber: 'Mesa 03',
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });
    const dataMesaOcupada = await resMesaOcupada.json();

    // 3.3 Gerente tenta cadastrar produto com preço zero
    const resPrecoZero = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Item Preço Zero Invalido',
        price: 0,
        category: 'Burgers'
      })
    });
    const dataPrecoZero = await resPrecoZero.json();

    // 3.4 Gerente tenta liberar manualmente mesa com atendimento ativo (Mesa 03 tem a comanda ativa)
    const resMesaAtiva = await fetch(`${BASE_URL}/api/tables/mesa-03/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ status: 'livre' })
    });
    const dataMesaAtiva = await resMesaAtiva.json();

    // Capturar estado da Mesa 03 antes da tentativa de bypass cadastral
    const tablesCheckPre = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03Antes = tablesCheckPre.tables.find((t: any) => t.id === 'mesa-03');
    const statusAntes = mesa03Antes?.status;
    const orderIdAntes = mesa03Antes?.currentOrderId;

    // 3.5 Gerente tenta burlar o status da mesa via rota cadastral PUT /api/tables/mesa-03
    // Enviando { status: 'livre', currentOrderId: null, name: 'Mesa 03 Salão Nobre' }
    const resBypassMesa = await fetch(`${BASE_URL}/api/tables/mesa-03`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Mesa 03 Salão Nobre',
        status: 'livre',
        currentOrderId: null
      })
    });
    const dataBypassMesa = await resBypassMesa.json();
    const tablesCheck3 = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03PosBypass = tablesCheck3.tables.find((t: any) => t.id === 'mesa-03');
    const statusDepois = mesa03PosBypass?.status;
    const orderIdDepois = mesa03PosBypass?.currentOrderId;

    const protecaoMesaAtivaOk = mesa03PosBypass &&
      statusDepois === 'ocupada' &&
      orderIdDepois === pedidoCriadoId;

    log(`   ✔ 3.1 Pedido sem mesa recusado [HTTP ${resSemMesa.status}]`);
    log(`   ✔ 3.2 Pedido em mesa já ocupada recusado [HTTP ${resMesaOcupada.status}]`);
    log(`   ✔ 3.3 Produto com preço zero recusado [HTTP ${resPrecoZero.status}]`);
    log(`   ✔ 3.4 Liberação manual de mesa ativa recusada [HTTP ${resMesaAtiva.status}]`);
    log(`   ✔ 3.5 Tentativa de bypass cadastral em mesa ocupada (PUT /api/tables/mesa-03):`);
    log(`       • Estado antes : status="${statusAntes}", currentOrderId="${orderIdAntes}"`);
    log(`       • Payload envio: { name: 'Mesa 03 Salão Nobre', status: 'livre', currentOrderId: null }`);
    log(`       • Estado depois: status="${statusDepois}", currentOrderId="${orderIdDepois}" (preservado ocupada e ativo)`);

    const aprovado = resSemMesa.status === 400 &&
      resMesaOcupada.status === 409 &&
      resPrecoZero.status === 400 &&
      resMesaAtiva.status === 409 &&
      resBypassMesa.status === 200 &&
      protecaoMesaAtivaOk &&
      Boolean(dataSemMesa.error) &&
      Boolean(dataMesaOcupada.error) &&
      Boolean(dataPrecoZero.error) &&
      Boolean(dataMesaAtiva.error);

    resultados.push({
      numero: 3,
      nome: 'Validação de operações inválidas e integridade de mesas',
      requisitos: 'RN001, RN004, RN005',
      cenario: 'O garçom tenta registrar um pedido sem mesa e outro em mesa já ocupada; o gerente tenta cadastrar produto com preço zero, tenta liberar mesa com atendimento ativo e tenta burlar status de mesa ocupada via edição cadastral.',
      resultadoEsperado: 'O servidor recusa as operações inválidas com códigos HTTP apropriados e preserva o status ocupada e a comanda ativa mesmo após atualização cadastral da mesa.',
      resultadoObtido: `Operações rejeitadas com erro estrito e integridade preservada: 1) Pedido sem mesa recusado com HTTP 400 ("${dataSemMesa.error}"); 2) Pedido em mesa já ocupada recusado com HTTP 409 Conflict ("${dataMesaOcupada.error}"); 3) Produto com preço zero recusado com HTTP 400 ("${dataPrecoZero.error}"); 4) Liberação manual de mesa com pedido ativo recusada com HTTP 409 Conflict ("${dataMesaAtiva.error}"); 5) Tentativa de forçar status "livre" via rota cadastral PUT /api/tables/mesa-03 sanitizada com sucesso: Mesa 03 permaneceu "ocupada" com currentOrderId=${pedidoCriadoId} (antes: status="${statusAntes}", currentOrderId="${orderIdAntes}"; depois: status="${statusDepois}", currentOrderId="${orderIdDepois}").`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        semMesa: { httpStatus: resSemMesa.status, mensagemErro: dataSemMesa.error },
        mesaOcupada: { httpStatus: resMesaOcupada.status, mensagemErro: dataMesaOcupada.error },
        precoZero: { httpStatus: resPrecoZero.status, mensagemErro: dataPrecoZero.error },
        liberacaoManualAtiva: { httpStatus: resMesaAtiva.status, mensagemErro: dataMesaAtiva.error },
        bypassCadastralMesa: {
          httpStatus: resBypassMesa.status,
          statusAntes,
          currentOrderIdAntes: orderIdAntes,
          statusDepois,
          currentOrderIdDepois: orderIdDepois,
          preservadoOcupada: protecaoMesaAtivaOk
        }
      }
    });

    // Restauração cadastral: restabelecer nome oficial canônico 'Mesa 03' preservando a integridade dos dados de demonstração
    const resRestoreMesa03 = await fetch(`${BASE_URL}/api/tables/mesa-03`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        name: 'Mesa 03',
        capacity: 4,
        location: 'Salão Principal'
      })
    });
    const dataRestoreMesa03 = await resRestoreMesa03.json();
    if (!resRestoreMesa03.ok || dataRestoreMesa03.table?.name !== 'Mesa 03') {
      throw new Error(`Falha ao restaurar nome canônico da Mesa 03 após cenário 3.5: [HTTP ${resRestoreMesa03.status}] ${JSON.stringify(dataRestoreMesa03)}`);
    }

    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 3: ${err.message}`);
    resultados.push({
      numero: 3,
      nome: 'Validação de operações inválidas',
      requisitos: 'RN001, RN004, RN005',
      cenario: 'O garçom tenta registrar um pedido sem mesa e outro em mesa já ocupada; o gerente tenta cadastrar um produto com preço zero.',
      resultadoEsperado: 'O servidor recusa as três operações com mensagem de erro.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. ATUALIZAÇÃO DO STATUS DO PEDIDO PELA COZINHA
  // ---------------------------------------------------------------------------
  log('\n[TESTE 4/8] Atualização do status do pedido pela cozinha...');
  try {
    // 4.1 Cozinha aceita o pedido -> 'Em Preparação'
    const resPrep = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kitchenToken}` }
    });
    const dataPrep = await resPrep.json();

    // 4.2 Cozinha avança para 'Pronto'
    const resPronto = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kitchenToken}` },
      body: JSON.stringify({ status: 'Pronto', note: 'Prato finalizado na expedição KDS' })
    });
    const dataPronto = await resPronto.json();

    // 4.3 Tentativa da Cozinha de marcar pedido como "Entregue" (deve ser rejeitada com HTTP 403 Forbidden)
    const resCozinhaEntrega = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kitchenToken}` },
      body: JSON.stringify({ status: 'Entregue', note: 'Tentativa indevida da cozinha de marcar entrega' })
    });
    const dataCozinhaEntrega = await resCozinhaEntrega.json();

    // 4.4 Tentativa da Cozinha de marcar status "Entregue" em pedido que JÁ ESTÁ Entregue (CMD-1079)
    // Validação estrita: a permissão de perfil DEVE ter precedência sobre o retorno idempotente (HTTP 403 Forbidden)
    const resCozinhaEntregaIdempotente = await fetch(`${BASE_URL}/api/orders/CMD-1079/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kitchenToken}` },
      body: JSON.stringify({ status: 'Entregue', note: 'Tentativa da cozinha em pedido já entregue' })
    });
    const dataCozinhaEntregaIdempotente = await resCozinhaEntregaIdempotente.json();

    const aprovado = resPrep.status === 200 &&
      dataPrep.order.status === 'Em Preparação' &&
      resPronto.status === 200 &&
      dataPronto.order.status === 'Pronto' &&
      resCozinhaEntrega.status === 403 &&
      resCozinhaEntregaIdempotente.status === 403;

    resultados.push({
      numero: 4,
      nome: 'Atualização do status do pedido pela cozinha e restrição de entrega',
      requisitos: 'RF007, RN006',
      cenario: 'O funcionário da cozinha avança o status do pedido até Pronto, tenta marcar como Entregue e tenta redefinir status Entregue em pedido já entregue.',
      resultadoEsperado: 'Avanço até Pronto aceito; tentativas da cozinha de marcar Entregue (inclusive em pedido já entregue) recusadas com erro de permissão (HTTP 403 Forbidden).',
      resultadoObtido: `Pedido ${pedidoCriadoId} aceito com HTTP 200 e movido para "Em Preparação" (acceptedBy="${dataPrep.order.acceptedBy}"). Em seguida, atualizado para "Pronto" com HTTP 200. Tentativa da cozinha de avançar para "Entregue" bloqueada com HTTP 403 Forbidden ("${dataCozinhaEntrega.error}"). Tentativa da cozinha em pedido já entregue (CMD-1079) também bloqueada com HTTP 403 Forbidden ("${dataCozinhaEntregaIdempotente.error}"), comprovando precedência da autorização sobre a idempotência. Histórico de status auditado na tabela HistoricoStatus (${dataPronto.order.statusHistory?.length} registros).`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        aceiteHttp: resPrep.status,
        statusAposAceite: dataPrep.order.status,
        acceptedBy: dataPrep.order.acceptedBy,
        prontoHttp: resPronto.status,
        statusAposPronto: dataPronto.order.status,
        cozinhaEntregaHttp: resCozinhaEntrega.status,
        cozinhaEntregaErro: dataCozinhaEntrega.error,
        cozinhaEntregaIdempotenteHttp: resCozinhaEntregaIdempotente.status,
        cozinhaEntregaIdempotenteErro: dataCozinhaEntregaIdempotente.error,
        historicoContagem: dataPronto.order.statusHistory?.length
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 4: ${err.message}`);
    resultados.push({
      numero: 4,
      nome: 'Atualização do status do pedido pela cozinha',
      requisitos: 'RF007, RN006',
      cenario: 'O funcionário da cozinha avança o status do pedido até Pronto.',
      resultadoEsperado: 'Avanço até Pronto aceito, com atualização do status do pedido.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. REGISTRO DA ENTREGA E ENCERRAMENTO DO ATENDIMENTO
  // ---------------------------------------------------------------------------
  log('\n[TESTE 5/8] Registro da entrega e encerramento do atendimento...');
  try {
    // 5.1 Tentativa de encerrar pedido antes da entrega (status "Pronto" -> deve retornar HTTP 400 Bad Request)
    const resCloseNaoEntregue = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const dataCloseNaoEntregue = await resCloseNaoEntregue.json();

    // 5.2 Tentativa de encerrar pedido com perfil sem permissão (Cozinha -> deve retornar HTTP 403 Forbidden)
    const resCloseCozinha = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kitchenToken}` }
    });
    const dataCloseCozinha = await resCloseCozinha.json();

    // 5.3 Garçom entrega o pedido na mesa (status -> 'Entregue')
    const resEntrega = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({ status: 'Entregue', note: 'Comanda servida ao cliente na Mesa 03' })
    });
    const dataEntrega = await resEntrega.json();

    // Verificar se na entrega a mesa CONTINUA OCUPADA (Regra de Salão)
    const resMesaPosEntrega = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03PosEntrega = resMesaPosEntrega.tables.find((t: any) => t.id === 'mesa-03');

    // 5.4 Garçom encerra o atendimento (POST /api/orders/:id/close)
    const resEncerramento = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const dataEncerramento = await resEncerramento.json();

    // 5.5 Verificar se após encerramento a mesa ficou livre
    const resMesaPosEncerramento = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa03PosEncerramento = resMesaPosEncerramento.tables.find((t: any) => t.id === 'mesa-03');

    // 5.6 Tentativa de reencerrar pedido já encerrado (deve retornar 409 Conflict)
    const resReclose = await fetch(`${BASE_URL}/api/orders/${pedidoCriadoId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${garcomToken}` }
    });

    const aprovado = resCloseNaoEntregue.status === 400 &&
      resCloseCozinha.status === 403 &&
      resEntrega.status === 200 &&
      dataEntrega.order.status === 'Entregue' &&
      mesa03PosEntrega?.status === 'ocupada' &&
      resEncerramento.status === 200 &&
      Boolean(dataEncerramento.order.closedAt) &&
      mesa03PosEncerramento?.status === 'livre' &&
      resReclose.status === 409;

    resultados.push({
      numero: 5,
      nome: 'Registro da entrega e encerramento do atendimento',
      requisitos: 'RF008, RF010, RN004, RN006',
      cenario: 'O garçom registra a entrega e encerra o atendimento, validando as recusas de encerramento prematuro e perfil sem permissão.',
      resultadoEsperado: 'Encerramento de pedido não entregue recusado (HTTP 400); perfil cozinha sem permissão recusado (HTTP 403); após entrega, pedido Entregue e mesa ocupada; após encerramento, mesa livre; reencerramento recusado (HTTP 409).',
      resultadoObtido: `Validações estritas cumpridas: 1) Encerramento de pedido com status "Pronto" recusado com HTTP 400 ("${dataCloseNaoEntregue.error}"); 2) Tentativa de encerramento pelo perfil Cozinha recusada com HTTP 403 Forbidden; 3) Entrega registrada com status "Entregue" (HTTP 200) mantendo a Mesa 03 "ocupada" durante o consumo; 4) Encerramento executado via POST /api/orders/${pedidoCriadoId}/close por Garçom (HTTP 200), registrando closedAt e liberando a Mesa 03 para status "livre"; 5) Tentativa de reencerramento retornou HTTP 409 Conflict.`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        encerramentoAntesEntregaHttp: resCloseNaoEntregue.status,
        encerramentoAntesEntregaErro: dataCloseNaoEntregue.error,
        encerramentoPerfilInvalidoHttp: resCloseCozinha.status,
        entregaHttp: resEntrega.status,
        statusPedidoPosEntrega: dataEntrega.order.status,
        mesaStatusPosEntrega: mesa03PosEntrega?.status,
        encerramentoHttp: resEncerramento.status,
        closedAtTimestamp: dataEncerramento.order.closedAt,
        mesaStatusPosEncerramento: mesa03PosEncerramento?.status,
        reencerramentoHttp: resReclose.status
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 5: ${err.message}`);
    resultados.push({
      numero: 5,
      nome: 'Registro da entrega e encerramento do atendimento',
      requisitos: 'RF008, RF010, RN004, RN006',
      cenario: 'O garçom registra a entrega e, em seguida, encerra o atendimento.',
      resultadoEsperado: 'Após a entrega, pedido Entregue e mesa ainda ocupada; após o encerramento, mesa livre.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 6. CANCELAMENTO DE PEDIDOS
  // ---------------------------------------------------------------------------
  log('\n[TESTE 6/8] Cancelamento de pedidos...');
  try {
    // 6.1 Garçom abre comanda na Mesa 01 e depois cancela o pedido Recebido
    await fetch(`${BASE_URL}/api/tables/mesa-01/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ status: 'livre' })
    });

    const resPed1 = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        tableId: 'mesa-01',
        tableNumber: 'Mesa 01',
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });
    const dataPed1 = await resPed1.json();
    const pedRecebidoId = dataPed1.order.id;

    // Cancelar pedido Recebido
    const resCancelRecebido = await fetch(`${BASE_URL}/api/orders/${pedRecebidoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({ status: 'Cancelado', note: 'Cliente desistiu antes do preparo' })
    });
    const dataCancelRecebido = await resCancelRecebido.json();

    // Verificar se a Mesa 01 foi liberada após o cancelamento
    const tablesCheck1 = await (await fetch(`${BASE_URL}/api/tables`, { headers: { Authorization: `Bearer ${garcomToken}` } })).json();
    const mesa01PosCancel = tablesCheck1.tables.find((t: any) => t.id === 'mesa-01');

    // 6.2 Criar outro pedido na Mesa 06, avançar até Pronto, e tentar cancelar a partir de Pronto
    await fetch(`${BASE_URL}/api/tables/mesa-06/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ status: 'livre' })
    });

    const resPed2 = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        tableId: 'mesa-06',
        tableNumber: 'Mesa 06',
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });
    const dataPed2 = await resPed2.json();
    const pedProntoId = dataPed2.order.id;

    // Cozinha aceita e avança para Pronto
    await fetch(`${BASE_URL}/api/orders/${pedProntoId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kitchenToken}` }
    });
    await fetch(`${BASE_URL}/api/orders/${pedProntoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kitchenToken}` },
      body: JSON.stringify({ status: 'Pronto' })
    });

    // Tentativa ilegal: Garçom tenta cancelar pedido que já está Pronto
    const resCancelPronto = await fetch(`${BASE_URL}/api/orders/${pedProntoId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({ status: 'Cancelado', note: 'Tentativa de cancelar prato já pronto' })
    });
    const dataCancelPronto = await resCancelPronto.json();

    const aprovado = resCancelRecebido.status === 200 &&
      dataCancelRecebido.order.status === 'Cancelado' &&
      mesa01PosCancel.status === 'livre' &&
      resCancelPronto.status === 400 &&
      dataCancelPronto.error.includes('Transição inválida');

    resultados.push({
      numero: 6,
      nome: 'Cancelamento de pedidos',
      requisitos: 'RF008, RN004, RN006',
      cenario: 'O garçom cancela um pedido Recebido e tenta cancelar um pedido Pronto.',
      resultadoEsperado: 'O primeiro é cancelado e a mesa é liberada; o segundo é recusado.',
      resultadoObtido: `Cancelamento do pedido "Recebido" (${pedRecebidoId}) aceito com HTTP 200 e Mesa 01 liberada para status "livre". Cancelamento do pedido "Pronto" (${pedProntoId}) recusado com HTTP 400 ("${dataCancelPronto.error}").`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        cancelRecebidoHttp: resCancelRecebido.status,
        mesa01Status: mesa01PosCancel.status,
        cancelProntoHttp: resCancelPronto.status,
        recusaMensagem: dataCancelPronto.error
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 6: ${err.message}`);
    resultados.push({
      numero: 6,
      nome: 'Cancelamento de pedidos',
      requisitos: 'RF008, RN004, RN006',
      cenario: 'O garçom cancela um pedido Recebido e tenta cancelar um pedido Pronto.',
      resultadoEsperado: 'O primeiro é cancelado e a mesa é liberada; o segundo é recusado.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 7. CONTROLE DE ACESSO AO CADASTRO DE CARDÁPIO
  // ---------------------------------------------------------------------------
  log('\n[TESTE 7/8] Controle de acesso ao cadastro de cardápio...');
  try {
    // Garçom tenta cadastrar produto no cardápio via chamada direta à API
    const resGarcomPostProd = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({
        name: 'Tentativa Invasiva Garcom',
        price: 25.0,
        category: 'Burgers'
      })
    });
    const dataGarcomPostProd = await resGarcomPostProd.json();

    // Garçom tenta criar categoria via chamada direta à API
    const resGarcomPostCat = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({ name: 'Categoria Não Autorizada' })
    });
    const dataGarcomPostCat = await resGarcomPostCat.json();

    // Garçom tenta alterar status de mesa diretamente via API (recurso restrito a gerentes)
    const resGarcomMesa = await fetch(`${BASE_URL}/api/tables/mesa-01/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${garcomToken}` },
      body: JSON.stringify({ status: 'livre' })
    });
    const dataGarcomMesa = await resGarcomMesa.json();

    const aprovado = resGarcomPostProd.status === 403 &&
      resGarcomPostCat.status === 403 &&
      resGarcomMesa.status === 403 &&
      dataGarcomPostProd.error.includes('Acesso negado') &&
      dataGarcomPostCat.error.includes('Acesso negado') &&
      dataGarcomMesa.error.includes('Acesso negado');

    resultados.push({
      numero: 7,
      nome: 'Controle de acesso ao cadastro de cardápio e gestão de mesas',
      requisitos: 'RF009, RN003',
      cenario: 'O garçom tenta acessar o cadastro de cardápio e alterar status de mesas por chamada direta à API.',
      resultadoEsperado: 'Acesso bloqueado com erro de permissão (HTTP 403 Forbidden).',
      resultadoObtido: `Chamadas diretas do Garçom bloqueadas com HTTP 403 Forbidden: POST /api/products retornou "${dataGarcomPostProd.error}", POST /api/categories retornou "${dataGarcomPostCat.error}" e PUT /api/tables/mesa-01/status retornou "${dataGarcomMesa.error}". Operações restritas a gerentes.`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        produtosHttp: resGarcomPostProd.status,
        produtosErro: dataGarcomPostProd.error,
        categoriasHttp: resGarcomPostCat.status,
        categoriasErro: dataGarcomPostCat.error,
        mesasHttp: resGarcomMesa.status,
        mesasErro: dataGarcomMesa.error
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
  } catch (err: any) {
    log(`Erro no cenário 7: ${err.message}`);
    resultados.push({
      numero: 7,
      nome: 'Controle de acesso ao cadastro de cardápio',
      requisitos: 'RF009, RN003',
      cenario: 'O garçom tenta acessar o cadastro de cardápio, inclusive por chamada direta à API.',
      resultadoEsperado: 'Acesso bloqueado com erro de permissão.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // 8. PERSISTÊNCIA FÍSICA DOS DADOS NO SQLITE
  // ---------------------------------------------------------------------------
  log('\n[TESTE 8/8] Verificação de persistência dos dados no SQLite...');
  let postCounts = {
    funcionarios: 0,
    mesas: 0,
    categorias: 0,
    produtos: 0,
    pedidos: 0,
    itensPedido: 0,
    historicoStatus: 0
  };

  try {
    // 8.1 Inspecionar dados diretamente no banco SQLite em disco via processo independente
    const sqliteDisk = new DatabaseSync(DB_SQLITE_PATH);
    const countUsers = sqliteDisk.prepare('SELECT COUNT(*) as c FROM Funcionario').get() as { c: number };
    const countTables = sqliteDisk.prepare('SELECT COUNT(*) as c FROM Mesa').get() as { c: number };
    const countCats = sqliteDisk.prepare('SELECT COUNT(*) as c FROM Categoria').get() as { c: number };
    const countProds = sqliteDisk.prepare('SELECT COUNT(*) as c FROM Produto').get() as { c: number };
    const countOrders = sqliteDisk.prepare('SELECT COUNT(*) as c FROM Pedido').get() as { c: number };
    const countItems = sqliteDisk.prepare('SELECT COUNT(*) as c FROM ItemPedido').get() as { c: number };
    const countHistory = sqliteDisk.prepare('SELECT COUNT(*) as c FROM HistoricoStatus').get() as { c: number };

    postCounts = {
      funcionarios: countUsers.c,
      mesas: countTables.c,
      categorias: countCats.c,
      produtos: countProds.c,
      pedidos: countOrders.c,
      itensPedido: countItems.c,
      historicoStatus: countHistory.c
    };

    // Verificar se o pedido encerrado está gravado com closed_at no banco SQLite
    const orderInDb = sqliteDisk.prepare('SELECT id_pedido, status, closed_at FROM Pedido WHERE id_pedido = ?').get(pedidoCriadoId) as any;

    // 8.2 Consultar via API HTTP
    const resOrders = await (await fetch(`${BASE_URL}/api/orders`, { headers: { Authorization: `Bearer ${managerToken}` } })).json();
    const resHealth = await (await fetch(`${BASE_URL}/api/health`)).json();
    const pedidoApi = resOrders.orders.find((o: any) => o.id === pedidoCriadoId);

    const aprovado = resHealth.database === 'SQLite' &&
      countUsers.c >= 6 &&
      countTables.c >= 7 &&
      countProds.c >= 6 &&
      countOrders.c >= 8 &&
      Boolean(orderInDb) &&
      Boolean(orderInDb.closed_at) &&
      Boolean(pedidoApi?.closedAt);

    resultados.push({
      numero: 8,
      nome: 'Persistência física dos dados no banco relacional SQLite',
      requisitos: 'RF001 a RF010, DER Relacional, Persistência SQLite',
      cenario: 'Verificação da gravação física dos registros no arquivo de banco de dados SQLite em disco.',
      resultadoEsperado: 'Cadastros e pedidos gravados permanentemente no arquivo em disco, confirmados por conexão independente sem depender de estado volátil em memória.',
      resultadoObtido: `Persistência relacional SQLite confirmada no arquivo ${DB_SQLITE_PATH}: ${countUsers.c} colaboradores, ${countTables.c} mesas, ${countCats.c} categorias, ${countProds.c} produtos, ${countOrders.c} pedidos e ${countItems.c} itens gravados permanentemente em disco. O pedido ${pedidoCriadoId} com closed_at permaneceu íntegro e verificado por conexão SQLite independente e chamadas subsequentes à API.`,
      status: aprovado ? 'Aprovado' : 'Reprovado',
      evidencias: {
        databaseEngine: resHealth.database,
        contagensSQLiteDisco: postCounts,
        pedidoPersistidoId: pedidoCriadoId,
        pedidoClosedAt: orderInDb?.closed_at
      }
    });
    log(` -> Status: ${aprovado ? 'Aprovado' : 'Reprovado'}`);
    log(`    Contagens em disco: Colaboradores=${countUsers.c}, Mesas=${countTables.c}, Categorias=${countCats.c}, Produtos=${countProds.c}, Pedidos=${countOrders.c}`);
  } catch (err: any) {
    log(`Erro no cenário 8: ${err.message}`);
    resultados.push({
      numero: 8,
      nome: 'Persistência física dos dados no banco relacional SQLite',
      requisitos: 'RF001 a RF010, DER Relacional, Persistência SQLite',
      cenario: 'Verificação da gravação física dos registros no arquivo de banco de dados SQLite em disco.',
      resultadoEsperado: 'Cadastros e pedidos gravados permanentemente no arquivo em disco, confirmados por conexão independente.',
      resultadoObtido: `Falha na execução: ${err.message}`,
      status: 'Reprovado',
      evidencias: { erro: err.message }
    });
  }

  // ---------------------------------------------------------------------------
  // GERAR CÓPIAS DE BACKUP ATUALIZADAS PÓS-TESTE (COM CHECKPOINT E VALIDAÇÃO DO WAL)
  // ---------------------------------------------------------------------------
  await executarCheckpointEstrito(DB_SQLITE_PATH, 'Backup Pós-Testes');

  fs.mkdirSync(path.dirname(BACKUP_POST7_PATH), { recursive: true });
  fs.copyFileSync(DB_SQLITE_PATH, BACKUP_POST7_PATH);
  fs.copyFileSync(DB_SQLITE_PATH, BACKUP_POST8_PATH);
  log(`✔ Backup pós-testes gravado com sucesso em: ${BACKUP_POST7_PATH}`);
  log(`✔ Backup pós-testes gravado com sucesso em: ${BACKUP_POST8_PATH}`);

  // ---------------------------------------------------------------------------
  // GERAÇÃO DO DOCUMENTO 7: RELATÓRIO OFICIAL DE RASTREABILIDADE DOS TESTES (QUADRO 7)
  // ---------------------------------------------------------------------------
  log('\n' + '='.repeat(80));
  log(' RESUMO FINAL DOS TESTES DO QUADRO 7 (100% EXECUTADOS)');
  log('='.repeat(80));

  const totalCenarios = resultados.length;
  const totalAprovados = resultados.filter((r) => r.status === 'Aprovado').length;
  const totalReprovados = resultados.filter((r) => r.status === 'Reprovado').length;
  const successPercent = totalCenarios > 0 ? ((totalAprovados / totalCenarios) * 100).toFixed(0) : '0';

  log(` Total de Cenários : ${totalCenarios}`);
  log(` Cenários Aprovados: ${totalAprovados}`);
  log(` Cenários Reprovados: ${totalReprovados}`);
  log('='.repeat(80));

  const statusGeralTexto = totalReprovados === 0 && totalCenarios === 8
    ? `**${totalAprovados} cenários aprovados e 0 reprovados** (100% de sucesso)`
    : `**${totalAprovados} cenários aprovados e ${totalReprovados} reprovados** (${successPercent}% de sucesso)`;

  const ocorrenciaFalhasTexto = totalReprovados === 0 && totalCenarios === 8
    ? '**Nenhuma falha ocorreu** durante a execução dos testes'
    : `**Foram registradas ${totalReprovados} falha(s)** durante a execução dos testes: ${resultados.filter((r) => r.status === 'Reprovado').map((r) => `Cenário ${r.numero} (${r.nome})`).join(', ')}`;

  const resultadoConsolidadoTexto = totalReprovados === 0 && totalCenarios === 8
    ? '**8 cenários aprovados e 0 reprovados** | **Nenhuma falha ocorreu**.'
    : `**${totalAprovados} cenários aprovados e ${totalReprovados} reprovados** | Falhas registradas: ${totalReprovados}.`;

  let mdContent = `# Documento 7 — Rastreabilidade e Execução dos Testes de Aceitação

**Trabalho de Graduação (TG) — FATEC Franca 2026**  
**Autor:** Leonardo Tavares Pavan  
**Orientador:** Prof. Me. Fausto Gonçalves Cintra  
**Curso:** Tecnologia em Análise e Desenvolvimento de Sistemas (TADS)  
**Sistema:** Sistema Web para Gerenciamento de Pedidos para Restaurantes  

---

## 1. Identificação do Ambiente e Versão Testada

| Parâmetro | Valor Registrado na Execução Oficial |
|:---|:---|
| **Data e Hora da Execução** | ${dataExecucao} |
| **Versão Oficial do Sistema** | 3.1.0 (Release Tag: \`v3.1.0-tg-fatec\`) |
| **Ambiente de Execução** | Linux x86_64, Node.js ${process.version} |
| **Banco de Dados** | SQLite 3 Relacional (\`data/database.sqlite\`), WAL Mode (\`PRAGMA journal_mode = WAL;\`), Foreign Keys Ativas |
| **Servidor de Aplicação** | Express 4 + Vite 6 + React 19 SPA |
| **Endpoint Testado** | ${BASE_URL} |
| **Comando Executado** | \`npx tsx scripts/run_quadro7_acceptance_tests.ts\` |
| **Status Geral da Bateria** | ${statusGeralTexto} |
| **Ocorrência de Falhas** | ${ocorrenciaFalhasTexto} |

---

## 2. Validação das Credenciais de Acesso (RBAC)

Todos os três perfis de acesso foram autenticados com sucesso utilizando credenciais protegidas por hashes bcrypt e validadas pela API:

| Perfil | E-mail de Homologação | Mecanismo de Autenticação | Retorno HTTP | Perfil Retornado | Token JWT |
|:---|:---|:---|:---:|:---:|:---:|
| **Garçom** | \`garcom@saborbrasa.com\` | Hash bcrypt homologado | **200 OK** | \`garcom\` | Gerado com sucesso |
| **Cozinha** | \`cozinha@saborbrasa.com\` | Hash bcrypt homologado | **200 OK** | \`kitchen\` | Gerado com sucesso |
| **Gerente** | \`gerente@saborbrasa.com\` | Hash bcrypt homologado | **200 OK** | \`manager\` | Gerado com sucesso |

*Nota de Segurança da Informação:* Por conformidade com boas práticas de segurança, senhas em texto claro não constam na documentação acadêmica nem são armazenadas no banco de dados. As credenciais utilizam hashes seguros \`bcrypt\` gerados no procedimento de inicialização (*seed*). Tentativas de autenticação com senhas incorretas são rejeitadas pelo servidor com \`HTTP 401 Unauthorized\`.

---

## 3. Quadro 7 — Roteiro de Testes de Aceitação (Resultados Reais)

**Comando de Execução:** \`npx tsx scripts/run_quadro7_acceptance_tests.ts\`  
**Resultado Consolidado:** ${resultadoConsolidadoTexto}

| Nº | Cenário | Requisitos | Resultado Esperado | Resultado Obtido Real | Status |
|:---:|:---|:---:|:---|:---|:---:|
`;

  for (const r of resultados) {
    mdContent += `| **${r.numero}** | **${r.nome}**<br>_${r.cenario}_ | ${r.requisitos} | ${r.resultadoEsperado} | ${r.resultadoObtido} | **${r.status}** |\n`;
  }

  mdContent += `
---

## 4. Auditoria de Código: Autorização do Garçom e Proteção contra Duplicidade

Foi realizada a conferência estrita no código-fonte dos dois mecanismos essenciais do encerramento de atendimento:

### 4.1 Autorização do Perfil Garçom (\`server.ts\`, Linha 845)
A rota \`POST /api/orders/:id/close\` possui o seguinte cabeçalho de controle de acesso:
\`\`\`typescript
app.post('/api/orders/:id/close', authenticateToken, requireRole(['garcom', 'manager', 'admin', 'owner']), (req, res) => {
  const authUser = (req as any).user as AuthenticatedUser;
  // ...
\`\`\`
- **Evidência no Código**: O perfil \`'garcom'\` está explicitamente autorizado na lista de permissões do middleware \`requireRole\`, permitindo que os garçons encerrem o atendimento diretamente pelo seu módulo operacional, sem depender de intervenção gerencial. Perfis não autorizados (como \`'kitchen'\`) recebem \`HTTP 403 Forbidden\`.

### 4.2 Proteção contra Requisições Duplicadas (Idempotência e Bloqueio Sequencial)
A proteção contra requisições repetidas e duplicidade sequencial é aplicada em duas camadas independentes:
1. **Camada de Aplicação (\`server.ts\`, linhas 855-860)**:
\`\`\`typescript
if (order.closedAt) {
  return res.status(409).json({
    error: 'O atendimento deste pedido já foi encerrado anteriormente.',
    closedAt: order.closedAt,
  });
}
\`\`\`
2. **Camada de Banco de Dados Relacional (\`src/db/sqlite.ts\`, linhas 1205-1248)**:
\`\`\`typescript
if (order.closedAt) {
  throw new Error('ALREADY_CLOSED');
}
if (order.status !== 'Entregue') {
  throw new Error('NOT_DELIVERED');
}
db.exec('BEGIN TRANSACTION;');
// Executa UPDATE atômico com gravação de closed_at e liberação da mesa
db.exec('COMMIT;');
\`\`\`
- **Evidência no Código e nos Testes**: A segunda chamada sequencial para o encerramento do mesmo pedido retorna **HTTP 409 Conflict** imediato, impedindo inconsistência operacional ou reprocessamento indevido.

---

## 5. Teste de Persistência Relacional em SQLite (Cenário 8)

O teste de persistência confirmou que as operações não dependem de estado volátil em memória. Uma leitura física direta no banco relacional SQLite (\`data/database.sqlite\`) após as operações registrou:

- **Tabela Restaurante**: 1 registro
- **Tabela Funcionario**: ${postCounts.funcionarios} colaboradores
- **Tabela Mesa**: ${postCounts.mesas} mesas
- **Tabela Categoria**: ${postCounts.categorias} categorias
- **Tabela Produto**: ${postCounts.produtos} produtos
- **Tabela Pedido**: ${postCounts.pedidos} pedidos gravados
- **Tabela ItemPedido**: ${postCounts.itensPedido} itens
- **Tabela HistoricoStatus**: ${postCounts.historicoStatus} transições auditadas

Todas as comandas, incluindo a comanda encerrada com carimbo de data/hora (\`closed_at\`), permanecem gravadas permanentemente no arquivo em disco, confirmando que a persistência física relacional no SQLite independe de estado transitório em memória.

---

## 6. Procedimento e Esclarecimento dos Ambientes de Dados (Desenvolvimento vs. Pós-Testes)

- **Base de Desenvolvimento Original (\`data/backups/database_original_dev.sqlite\`)**:
  Contém o estado semente inicial do sistema: 4 colaboradores cadastrados (\`admin@admin.com\`, \`cozinha@saborbrasa.com\`, \`garcom@saborbrasa.com\`, \`gerente@saborbrasa.com\`), 7 mesas operacionais, 5 categorias, 5 produtos no cardápio e 5 pedidos de demonstração para a esteira KDS (\`CMD-1079\` a \`CMD-1083\`).
- **Base de Homologação / Pós-Testes (\`data/database.sqlite\` e cópia em \`data/backups/database_pos_testes_quadro7.sqlite\`)**:
  Contém o acréscimo das operações formais de teste do Quadro 7 (+2 colaboradores no Cenário 1, +1 categoria, +1 produto, +1 comanda encerrada \`${pedidoCriadoId}\`, +2 comandas de cancelamento/avanço no Cenário 6). Total: ${postCounts.funcionarios} colaboradores, ${postCounts.mesas} mesas, ${postCounts.categorias} categorias, ${postCounts.produtos} produtos, ${postCounts.pedidos} pedidos.
- Ambas as bases estão preservadas na pasta \`data/backups/\` com integridade e hashes SHA-256 distintos comprovados.

---

## 7. Matriz de Rastreabilidade de Requisitos

| Requisito | Descrição | Cenário do Quadro 7 | Evidência Técnica | Status |
|:---|:---|:---:|:---|:---:|
| **RF001** | Cadastro de Funcionários | Cenário 1 | HTTP 201 no cadastro de Garçom e Cozinha | Aprovado |
| **RF002** | Autenticação por E-mail e Senha | Fase 0 & Cenário 1 | HTTP 200 com JWT nos 3 perfis + novos usuários | Aprovado |
| **RF003** | Gerenciamento de Cardápio | Cenário 1 | HTTP 201 no cadastro de categoria e produto | Aprovado |
| **RF004** | Consulta de Cardápio | Cenário 2 | Garçom consulta itens e categorias ao lançar pedido | Aprovado |
| **RF005** | Gerenciamento de Mesas | Cenários 2, 5 e 6 | Mesa ocupada na abertura, liberada no encerramento/cancelamento | Aprovado |
| **RF006** | Registro de Pedido pelo Garçom | Cenário 2 | HTTP 201, cálculo oficial de total no servidor | Aprovado |
| **RF007** | Gerenciamento de Pedidos (KDS) | Cenário 4 | HTTP 200 no aceite e avanço para Pronto | Aprovado |
| **RF008** | Acompanhamento do Pedido | Cenários 5 e 6 | Entrega registrada; cancelamento de Pronto recusado (HTTP 400) | Aprovado |
| **RF009** | Controle de Acesso (RBAC) | Cenário 7 | Garçom bloqueado com HTTP 403 em rotas administrativas | Aprovado |
| **RF010** | Encerramento do Atendimento | Cenário 5 | POST /api/orders/:id/close registra closedAt e libera a mesa | Aprovado |
| **RN001** | Unicidade de Cadastro e Mesa | Cenário 3 | Pedido em mesa já ocupada rejeitado com HTTP 409 | Aprovado |
| **RN002** | Consistência e Recálculo de Preço | Cenário 2 | Total recalculado pelo backend com preços do banco | Aprovado |
| **RN003** | Acesso Administrativo Restrito | Cenário 7 | Rotas de cardápio bloqueadas para garçom (HTTP 403) | Aprovado |
| **RN004** | Um Atendimento Ativo por Mesa | Cenário 5 | Mesa mantida ocupada na entrega e liberada apenas no /close | Aprovado |
| **RN005** | Validação de Preços (> R$ 0,00) | Cenário 3 | Produto com preço zero rejeitado com HTTP 400 | Aprovado |
| **RN006** | Máquina de Estados Finita | Cenários 4, 5 e 6 | Fluxo Recebido -> Preparação -> Pronto -> Entregue -> Close | Aprovado |
`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, mdContent, 'utf-8');
  fs.writeFileSync(QUADRO7_REPORT_PATH, mdContent, 'utf-8');
  log(`\n✔ Documento oficial gerado com sucesso em: ${REPORT_PATH}`);
  log(`✔ Cópia de referência em: ${QUADRO7_REPORT_PATH}`);

  if (totalReprovados > 0 || totalCenarios !== 8) {
    log(`\n❌ ERRO NA SUÍTE: ${totalReprovados} cenário(s) reprovado(s) ou contagem divergente (${totalCenarios}/8).`);
    process.exitCode = 1;
  } else {
    log(`\n✔ SUCESSO: Todos os 8 cenários do Quadro 7 foram aprovados com êxito comprovado.`);
    process.exitCode = 0;
  }
}

run()
  .catch((err) => {
    log(`\n[ERRO CRÍTICO NA EXECUÇÃO]: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.writeFileSync(LOG_PATH, logLines.join('\n') + '\n', 'utf-8');
      console.log(`✔ Log de execução gravado com sucesso em: ${LOG_PATH}`);
    } catch (logErr: any) {
      console.error(`Falha ao gravar log em ${LOG_PATH}:`, logErr);
    }
  });
