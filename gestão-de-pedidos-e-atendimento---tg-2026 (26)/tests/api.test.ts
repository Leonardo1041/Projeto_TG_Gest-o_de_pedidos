import test, { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'database.sqlite');

describe('5. Testes de Integração da API HTTP (Salão, KDS e Autenticação)', { concurrency: 1 }, () => {
  let garcomToken = '';
  let kitchenToken = '';
  let managerToken = '';

  before(async () => {
    // Aguardar o servidor estar respondendo antes de executar a bateria
    for (let i = 0; i < 15; i++) {
      try {
        const check = await fetch(`${BASE_URL}/api/health`);
        if (check.ok) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Fazer login prévio para obter os tokens necessários aos testes protegidos
    const resGarcom = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'garcom@saborbrasa.com',
        password: 'Garcom@2026'
      })
    });
    if (resGarcom.ok) {
      const data = await resGarcom.json();
      garcomToken = data.token;
    }

    const resKitchen = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'cozinha@saborbrasa.com',
        password: 'Cozinha@2026'
      })
    });
    if (resKitchen.ok) {
      const data = await resKitchen.json();
      kitchenToken = data.token;
    }

    const resManager = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'gerente@saborbrasa.com',
        password: 'Gerente@2026'
      })
    });
    if (resManager.ok) {
      const data = await resManager.json();
      managerToken = data.token;
    }
  });

  it('GET /api/health deve retornar 200 e status online', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
    assert.ok(data.metrics);
  });

  it('POST /api/auth/login com credenciais de Garçom (Garcom@2026)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'garcom@saborbrasa.com',
        password: 'Garcom@2026'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.role, 'garcom');
    assert.ok(data.token, 'Deve retornar token JWT');
  });

  it('POST /api/auth/login com senha incorreta deve retornar 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'garcom@saborbrasa.com',
        password: 'senha_completamente_incorreta'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Credenciais inválidas. Verifique seu e-mail e senha.');
  });

  it('GET /api/tables retorna lista de mesas cadastradas para o Garçom', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.tables), 'Resposta deve conter array tables');
    assert.ok(body.tables.length >= 6);
  });

  it('POST /api/orders SEM MESA DEVE SER REJEITADO COM 400', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${garcomToken}`
      },
      body: JSON.stringify({
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'A seleção da mesa é obrigatória para abertura de comanda no salão.');
  });

  it('POST /api/orders em mesa já ocupada deve retornar 409 Conflict', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${garcomToken}`
      },
      body: JSON.stringify({
        tableId: 'mesa-02',
        tableNumber: 'Mesa 02',
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('já está ocupada'));
  });

  it('RBAC: Garçom não pode acessar rotas administrativas (/api/users)', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Acesso negado'));
  });

  it('RBAC: Gerente pode acessar rotas administrativas (/api/users)', async () => {
    assert.ok(managerToken, 'Token do gerente deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.users), 'Resposta deve conter array users');
    assert.ok(body.users.length >= 4);
  });

  it('RN005: POST /api/products com preço zero ou negativo deve ser rejeitado com 400', async () => {
    assert.ok(managerToken, 'Token do gerente deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Item Preço Inválido',
        price: 0,
        category: 'Bebidas'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('RN005'));
  });

  it('RN005: PUT /api/products/:id com preço negativo deve ser rejeitado com 400', async () => {
    assert.ok(managerToken, 'Token do gerente deve estar preenchido');
    const res = await fetch(`${BASE_URL}/api/products/item-sb-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        price: -10
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('RN005'));
  });

  // =========================================================================
  // 6. TESTES DO ENCERRAMENTO DO ATENDIMENTO (POST /api/orders/:id/close)
  // =========================================================================

  it('POST /api/orders/:id/close sem token deve retornar 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/orders/CMD-1080/close`, {
      method: 'POST'
    });
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/orders/:id/close para pedido com status diferente de "Entregue" deve retornar 400', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    // CMD-1080 tem status 'Em Preparação' ou 'Recebido'
    const res = await fetch(`${BASE_URL}/api/orders/CMD-1080/close`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${garcomToken}`
      }
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Entregue'));
  });

  it('Encerramento do atendimento: Entrega NÃO libera a mesa; apenas POST /api/orders/:id/close libera a mesa', async () => {
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');
    assert.ok(kitchenToken, 'Token da cozinha deve estar preenchido');

    // 1. Liberar Mesa 03 caso esteja livre (via Gerente)
    await fetch(`${BASE_URL}/api/tables/mesa-03/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ status: 'livre' })
    });

    // 2. Abrir nova comanda na Mesa 03
    const resCreate = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${garcomToken}`
      },
      body: JSON.stringify({
        tableId: 'mesa-03',
        tableNumber: 'Mesa 03',
        customerName: 'Cliente Encerramento Teste',
        items: [{ itemId: 'item-sb-1', quantity: 1 }]
      })
    });
    assert.strictEqual(resCreate.status, 201);
    const createData = await resCreate.json();
    const testOrderId = createData.order.id;
    assert.ok(testOrderId);

    // 3. Cozinha aceita pedido (Em Preparação)
    const resAccept = await fetch(`${BASE_URL}/api/orders/${testOrderId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kitchenToken}`
      }
    });
    assert.strictEqual(resAccept.status, 200);

    // 4. Cozinha marca como Pronto
    const resReady = await fetch(`${BASE_URL}/api/orders/${testOrderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kitchenToken}`
      },
      body: JSON.stringify({ status: 'Pronto' })
    });
    assert.strictEqual(resReady.status, 200);

    // 5. Garçom entrega o pedido na mesa (status -> 'Entregue')
    const resDeliver = await fetch(`${BASE_URL}/api/orders/${testOrderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${garcomToken}`
      },
      body: JSON.stringify({ status: 'Entregue' })
    });
    assert.strictEqual(resDeliver.status, 200);

    // 5b. Validação de perfil prioritária sobre idempotência: Cozinha tentando enviar status 'Entregue'
    // em pedido que já está 'Entregue' DEVE ser recusada com HTTP 403 Forbidden
    const resKitchenEntregueIdempotent = await fetch(`${BASE_URL}/api/orders/${testOrderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kitchenToken}`
      },
      body: JSON.stringify({ status: 'Entregue' })
    });
    assert.strictEqual(resKitchenEntregueIdempotent.status, 403);
    const kitchenEntregueData = await resKitchenEntregueIdempotent.json();
    assert.ok(kitchenEntregueData.error.includes('Perfil Cozinha só pode alterar'));

    // 6. VERIFICAÇÃO CRÍTICA: Na entrega, a mesa NÃO é liberada (deve continuar ocupada)!
    const resTablesCheck = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const tablesData = await resTablesCheck.json();
    const table03AfterDeliver = tablesData.tables.find((t: any) => t.id === 'mesa-03');
    assert.strictEqual(
      table03AfterDeliver.status,
      'ocupada',
      'Na entrega do pedido a mesa DEVE PERMANECER OCUPADA aguardando o encerramento do atendimento'
    );

    // 7. Encerramento do atendimento pelo Garçom (POST /api/orders/:id/close)
    const resClose = await fetch(`${BASE_URL}/api/orders/${testOrderId}/close`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${garcomToken}`
      }
    });
    assert.strictEqual(resClose.status, 200);
    const closeData = await resClose.json();
    assert.strictEqual(closeData.success, true);
    assert.ok(closeData.order.closedAt, 'Pedido deve conter data/hora de encerramento (closedAt)');

    // 8. VERIFICAÇÃO FINAL: Agora sim a mesa deve estar LIBERADA (status: 'livre')
    const resTablesFinal = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const tablesFinalData = await resTablesFinal.json();
    const table03AfterClose = tablesFinalData.tables.find((t: any) => t.id === 'mesa-03');
    assert.strictEqual(
      table03AfterClose.status,
      'livre',
      'Após o encerramento do atendimento a mesa DEVE SER LIBERADA (status: livre)'
    );

    // 9. Tentativa de encerrar comanda já encerrada deve retornar 409 Conflict
    const resReclose = await fetch(`${BASE_URL}/api/orders/${testOrderId}/close`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${garcomToken}`
      }
    });
    assert.strictEqual(resReclose.status, 409);
    const recloseData = await resReclose.json();
    assert.ok(recloseData.error.includes('já foi encerrado'));

    // 10. Teardown confiável: remover comanda transitória de teste da base para manter o estado canônico
    const dbClean = new DatabaseSync(SQLITE_DB_PATH);
    try {
      dbClean.exec('PRAGMA foreign_keys = ON;');
      const delResult = dbClean.prepare('DELETE FROM Pedido WHERE id_pedido = ?').run(testOrderId);
      assert.strictEqual(
        Number(delResult.changes),
        1,
        `Falha na limpeza do teste: comanda temporária ${testOrderId} não foi encontrada para exclusão em ${SQLITE_DB_PATH}`
      );

      // Validar explicitamente o modo WAL
      const jModeRes = dbClean.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string } | undefined;
      const journalMode = (jModeRes?.journal_mode || '').toLowerCase();
      assert.strictEqual(journalMode, 'wal', `Banco em ${SQLITE_DB_PATH} deve estar em modo WAL`);

      // Validar checkpoint estrito após exclusão (busy === 0, log >= 0, checkpointed >= 0 e checkpointed === log)
      const cpRes = dbClean.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get() as { busy: number; log: number; checkpointed: number } | undefined;
      assert.ok(cpRes, `Falha no checkpoint SQLite durante o teardown em ${SQLITE_DB_PATH}: retorno nulo ou inválido`);
      assert.strictEqual(cpRes.busy, 0, `Falha no checkpoint SQLite durante o teardown em ${SQLITE_DB_PATH}: banco ocupado (busy=${cpRes.busy})`);
      assert.ok(cpRes.log >= 0, `Contador de log do checkpoint deve ser não-negativo (log=${cpRes.log})`);
      assert.ok(cpRes.checkpointed >= 0, `Contador de checkpointed deve ser não-negativo (checkpointed=${cpRes.checkpointed})`);
      assert.strictEqual(cpRes.checkpointed, cpRes.log, `Falha no checkpoint SQLite durante o teardown em ${SQLITE_DB_PATH}: consolidação incompleta (log=${cpRes.log}, checkpointed=${cpRes.checkpointed})`);
    } finally {
      try { dbClean.close(); } catch {}
    }
  });

  it('RN004: PUT /api/tables/:id restringe a dados cadastrais e impede liberação indevida de mesa ocupada', async () => {
    assert.ok(managerToken, 'Token do gerente deve estar preenchido');
    assert.ok(garcomToken, 'Token do garçom deve estar preenchido');

    // 1. Assegurar que Mesa 02 possui comanda ativa
    const resTablesCheck = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const tablesData = await resTablesCheck.json();
    let mesa02 = tablesData.tables.find((t: any) => t.id === 'mesa-02');
    assert.ok(mesa02, 'Mesa 02 deve existir');

    let activeOrderId = mesa02.currentOrderId;
    if (mesa02.status !== 'ocupada' || !activeOrderId) {
      const resOrder = await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${garcomToken}`
        },
        body: JSON.stringify({
          tableId: 'mesa-02',
          tableNumber: 'Mesa 02',
          items: [{ itemId: 'item-sb-1', quantity: 1 }]
        })
      });
      const orderData = await resOrder.json();
      activeOrderId = orderData.order.id;
    }

    // 2. Gerente tenta editar a Mesa 02 enviando status 'livre' e currentOrderId null na rota cadastral PUT /api/tables/:id
    const resBypass = await fetch(`${BASE_URL}/api/tables/mesa-02`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Mesa 02 VIP Executiva',
        capacity: 8,
        location: 'Salão Superior',
        status: 'livre',
        currentOrderId: null
      })
    });
    assert.strictEqual(resBypass.status, 200);
    const bypassData = await resBypass.json();

    // 3. Os dados cadastrais permitidos devem ser atualizados, mas STATUS e CURRENT_ORDER_ID DEVEM PERMANECER INTACTOS!
    assert.strictEqual(bypassData.table.name, 'Mesa 02 VIP Executiva');
    assert.strictEqual(bypassData.table.capacity, 8);
    assert.strictEqual(bypassData.table.location, 'Salão Superior');
    assert.strictEqual(
      bypassData.table.status,
      'ocupada',
      'Mesa com atendimento ativo DEVE permanecer ocupada mesmo após edição cadastral'
    );
    assert.strictEqual(
      bypassData.table.currentOrderId,
      activeOrderId,
      'Vínculo do pedido ativo DEVE ser preservado intacto pela rota cadastral'
    );

    // 4. Conferir também na listagem geral de mesas
    const resVerify = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    const verifyData = await resVerify.json();
    const mesa02After = verifyData.tables.find((t: any) => t.id === 'mesa-02');
    assert.strictEqual(mesa02After.status, 'ocupada');
    assert.strictEqual(mesa02After.currentOrderId, activeOrderId);

    // 5. Restauração cadastral: restabelecer nome oficial 'Mesa 02' e validar explicitamente a resposta
    const resRestore = await fetch(`${BASE_URL}/api/tables/mesa-02`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Mesa 02',
        capacity: 4,
        location: 'Salão Principal'
      })
    });
    assert.strictEqual(resRestore.status, 200, 'Restauração cadastral da Mesa 02 deve retornar HTTP 200');
    const restoreData = await resRestore.json();
    assert.strictEqual(restoreData.table.name, 'Mesa 02', 'Nome da mesa deve ser restaurado para Mesa 02');
    assert.strictEqual(restoreData.table.capacity, 4);
    assert.strictEqual(restoreData.table.location, 'Salão Principal');
    assert.strictEqual(restoreData.table.status, 'ocupada', 'Status deve permanecer ocupado após restauração cadastral');
    assert.strictEqual(restoreData.table.currentOrderId, activeOrderId, 'Vínculo do pedido ativo deve permanecer intacto');

    // 6. Confirmação na listagem geral de mesas
    const resVerifyFinal = await fetch(`${BASE_URL}/api/tables`, {
      headers: { Authorization: `Bearer ${garcomToken}` }
    });
    assert.strictEqual(resVerifyFinal.status, 200);
    const verifyFinalData = await resVerifyFinal.json();
    const mesa02Restored = verifyFinalData.tables.find((t: any) => t.id === 'mesa-02');
    assert.strictEqual(mesa02Restored.name, 'Mesa 02');
    assert.strictEqual(mesa02Restored.status, 'ocupada');
    assert.strictEqual(mesa02Restored.currentOrderId, activeOrderId);
  });
});
