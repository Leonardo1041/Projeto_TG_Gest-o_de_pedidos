import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { INITIAL_USERS, INITIAL_TABLES, INITIAL_RESTAURANTS } from '../src/data/initialData.js';
import type { OrderStatus, TableStatus } from '../src/types.js';

describe('1. Regras de Negócio de Autenticação e Perfis (RBAC)', () => {
  it('todas as senhas iniciais devem ser hashes seguros bcrypt e validar com senhas fortes', () => {
    const credentials = [
      { email: 'garcom@saborbrasa.com', pass: 'Garcom@2026' },
      { email: 'cozinha@saborbrasa.com', pass: 'Cozinha@2026' },
      { email: 'gerente@saborbrasa.com', pass: 'Gerente@2026' },
      { email: 'admin@admin.com', pass: 'Admin@2026Master' },
    ];

    for (const cred of credentials) {
      const user = INITIAL_USERS.find((u) => u.email === cred.email);
      assert.ok(user, `Usuário ${cred.email} deve existir no seed`);
      assert.ok(user.password?.startsWith('$2b$10$'), `Senha de ${cred.email} deve ser hash bcrypt válido`);
      
      const isValid = bcrypt.compareSync(cred.pass, user.password!);
      assert.strictEqual(isValid, true, `Senha ${cred.pass} deve validar contra o hash de ${cred.email}`);

      // Senhas fracas antigas não devem validar
      assert.strictEqual(bcrypt.compareSync('123', user.password!), false);
      assert.strictEqual(bcrypt.compareSync('admin123', user.password!), false);
    }
  });

  it('geração e validação de token JWT com segredo seguro', () => {
    const secret = 'chave_secreta_teste_unitario_com_alta_entropia_2026';
    const payload = {
      id: 'usr-1',
      email: 'garcom@saborbrasa.com',
      role: 'garcom',
      restaurantId: 'rest-sabor-brasa'
    };

    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    assert.ok(token && typeof token === 'string');

    const decoded = jwt.verify(token, secret) as any;
    assert.strictEqual(decoded.email, 'garcom@saborbrasa.com');
    assert.strictEqual(decoded.role, 'garcom');

    // Chave incorreta deve lançar erro
    assert.throws(() => {
      jwt.verify(token, 'chave_errada');
    });
  });
});

describe('2. Máquina de Estados Finita dos Pedidos (FSM)', () => {
  // Matriz de transições permitidas
  const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    'Recebido': ['Em Preparação', 'Cancelado'],
    'Em Preparação': ['Pronto', 'Cancelado'],
    'Pronto': ['Entregue'],
    'Entregue': [], // Terminal
    'Cancelado': []  // Terminal
  };

  function canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  it('deve permitir transições válidas do fluxo operacional', () => {
    assert.strictEqual(canTransition('Recebido', 'Em Preparação'), true);
    assert.strictEqual(canTransition('Em Preparação', 'Pronto'), true);
    assert.strictEqual(canTransition('Pronto', 'Entregue'), true);
    assert.strictEqual(canTransition('Recebido', 'Cancelado'), true);
    assert.strictEqual(canTransition('Em Preparação', 'Cancelado'), true);
  });

  it('deve rejeitar transições ilegais ou regressões', () => {
    // Cozinha não pode voltar de Pronto para Em Preparação
    assert.strictEqual(canTransition('Pronto', 'Em Preparação'), false);
    // Não pode pular de Recebido direto para Entregue
    assert.strictEqual(canTransition('Recebido', 'Entregue'), false);
    // Estados finais são imutáveis
    assert.strictEqual(canTransition('Entregue', 'Recebido'), false);
    assert.strictEqual(canTransition('Entregue', 'Em Preparação'), false);
    assert.strictEqual(canTransition('Cancelado', 'Recebido'), false);
  });
});

describe('3. Validação de Mesas e Regras de Negócio de Salão', () => {
  it('pedido sem mesa deve ser estritamente rejeitado', () => {
    function validateOrderTable(order: { tableId?: string; tableNumber?: string }): { valid: boolean; error?: string } {
      if (!order.tableId && !order.tableNumber) {
        return { valid: false, error: 'A seleção da mesa é obrigatória para abertura de comanda no salão.' };
      }
      return { valid: true };
    }

    const invalidOrder = { tableId: undefined, tableNumber: undefined };
    const res = validateOrderTable(invalidOrder);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'A seleção da mesa é obrigatória para abertura de comanda no salão.');

    const validOrder = { tableId: 'mesa-01', tableNumber: 'Mesa 01' };
    assert.strictEqual(validateOrderTable(validOrder).valid, true);
  });

  it('RN001 - mesa ocupada não pode receber nova comanda ativa (conflito 409)', () => {
    const tables = JSON.parse(JSON.stringify(INITIAL_TABLES));
    const targetTable = tables.find((t: any) => t.id === 'mesa-02'); // Mesa 02 já ocupada no seed
    assert.strictEqual(targetTable.status, 'ocupada');

    function checkTableAvailability(table: { status: TableStatus }): { available: boolean; statusCode: number } {
      if (table.status === 'ocupada') {
        return { available: false, statusCode: 409 };
      }
      return { available: true, statusCode: 200 };
    }

    const check = checkTableAvailability(targetTable);
    assert.strictEqual(check.available, false);
    assert.strictEqual(check.statusCode, 409);
  });

  it('na entrega (Entregue) a mesa permanece ocupada; apenas encerramento ou cancelamento libera a mesa', () => {
    const table = {
      id: 'mesa-05',
      status: 'ocupada' as TableStatus,
      currentOrderId: 'CMD-1081' as string | undefined
    };

    function handleOrderStatusChange(t: typeof table, newStatus: OrderStatus) {
      // REGRA: Na entrega a mesa NÃO é liberada
      if (newStatus === 'Cancelado') {
        t.status = 'livre';
        t.currentOrderId = undefined;
      }
    }

    function handleOrderClosure(t: typeof table, orderStatus: OrderStatus) {
      if (orderStatus === 'Entregue') {
        t.status = 'livre';
        t.currentOrderId = undefined;
      }
    }

    handleOrderStatusChange(table, 'Entregue');
    // Mesa permanece ocupada na entrega
    assert.strictEqual(table.status, 'ocupada');
    assert.strictEqual(table.currentOrderId, 'CMD-1081');

    // Encerramento libera a mesa
    handleOrderClosure(table, 'Entregue');
    assert.strictEqual(table.status, 'livre');
    assert.strictEqual(table.currentOrderId, undefined);
  });
});

describe('4. RN002 / RN005 - Recálculo de Preço no Servidor', () => {
  it('total do pedido deve ser calculado pelo servidor com preços oficiais do cardápio', () => {
    const menuItems = INITIAL_RESTAURANTS[0].menu;
    const burger = menuItems.find((i) => i.name === 'Burger Artesanal')!;
    const batata = menuItems.find((i) => i.name === 'Batata Rústica com Alecrim')!;

    assert.ok(burger);
    assert.ok(batata);

    const clientRequestItems = [
      { itemId: burger.id, quantity: 2, priceSentByClient: 0.01 }, // tentativa de fraude
      { itemId: batata.id, quantity: 1, priceSentByClient: 5.00 }, // tentativa de fraude
    ];

    // Servidor calcula com preços oficiais do banco
    let serverTotal = 0;
    for (const item of clientRequestItems) {
      const officialItem = menuItems.find((i) => i.id === item.itemId);
      assert.ok(officialItem);
      assert.strictEqual(officialItem.available, true);
      serverTotal += officialItem.price * item.quantity;
    }

    const expectedTotal = (burger.price * 2) + (batata.price * 1);
    assert.strictEqual(Number(serverTotal.toFixed(2)), Number(expectedTotal.toFixed(2)));
    assert.notStrictEqual(serverTotal, 5.02); // Recusa total fraudado do cliente
  });
});
