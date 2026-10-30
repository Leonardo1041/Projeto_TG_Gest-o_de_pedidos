import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { User, RestaurantConfig, Order, OrderItem, OrderStatus, RestaurantTable, TableStatus, MenuItem, UserRole } from '../types';
import { INITIAL_RESTAURANTS, INITIAL_USERS, INITIAL_TABLES, INITIAL_ORDERS } from '../data/initialData';
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { DatabaseSync } = req('node:sqlite');

const DB_DIR = path.join(process.cwd(), 'data');
const SQLITE_FILE = process.env.SQLITE_DB_PATH || path.join(DB_DIR, 'database.sqlite');
const JSON_FILE = path.join(DB_DIR, 'database.json');

let dbInstance: any = null;

export function getSqliteDb(): any {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  dbInstance = new DatabaseSync(SQLITE_FILE);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  initSqliteSchema(dbInstance);
  checkAndSeedData(dbInstance);

  return dbInstance;
}

/**
 * Criação física das tabelas relacionais conforme DER do TG:
 * Funcionario, Mesa, Categoria, Produto, Pedido, ItemPedido, HistoricoStatus e Restaurante
 */
export function initSqliteSchema(db: any): void {
  db.exec(`
    -- 1. Tabela Restaurante
    CREATE TABLE IF NOT EXISTS Restaurante (
      id_restaurante TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      endereco TEXT,
      telefone TEXT,
      culinaria TEXT NOT NULL DEFAULT 'Geral',
      layout_cor_primaria TEXT NOT NULL DEFAULT '#e11d48',
      logo_url TEXT,
      banner_url TEXT,
      data_criacao TEXT DEFAULT (datetime('now'))
    );

    -- 2. Tabela Funcionario (Equipe e Controle de Acesso RBAC)
    CREATE TABLE IF NOT EXISTS Funcionario (
      id_funcionario INTEGER PRIMARY KEY AUTOINCREMENT,
      id_restaurante TEXT NOT NULL,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      cargo TEXT NOT NULL CHECK(cargo IN ('garcom', 'kitchen', 'manager', 'admin', 'owner')),
      telefone TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      data_cadastro TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_funcionario_email ON Funcionario(email);
    CREATE INDEX IF NOT EXISTS idx_funcionario_cargo ON Funcionario(cargo);
    CREATE INDEX IF NOT EXISTS idx_funcionario_restaurante ON Funcionario(id_restaurante);

    -- 3. Tabela Mesa (Salão e Controle de Ocupação)
    CREATE TABLE IF NOT EXISTS Mesa (
      id_mesa TEXT PRIMARY KEY,
      id_restaurante TEXT NOT NULL,
      numero TEXT NOT NULL,
      nome TEXT NOT NULL,
      capacidade INTEGER NOT NULL DEFAULT 4,
      localizacao TEXT NOT NULL DEFAULT 'Salão Principal',
      status TEXT NOT NULL DEFAULT 'livre' CHECK(status IN ('livre', 'ocupada')),
      id_pedido_atual TEXT,
      data_atualizacao TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mesa_restaurante ON Mesa(id_restaurante);
    CREATE INDEX IF NOT EXISTS idx_mesa_status ON Mesa(status);

    -- 4. Tabela Categoria (Organização do Cardápio)
    CREATE TABLE IF NOT EXISTS Categoria (
      id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
      id_restaurante TEXT NOT NULL,
      nome TEXT NOT NULL,
      ordem_exibicao INTEGER NOT NULL DEFAULT 0,
      data_criacao TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_categoria_restaurante ON Categoria(id_restaurante);

    -- 5. Tabela Produto (Itens do Cardápio)
    CREATE TABLE IF NOT EXISTS Produto (
      id_produto TEXT PRIMARY KEY,
      id_restaurante TEXT NOT NULL,
      id_categoria INTEGER,
      nome_categoria TEXT,
      nome TEXT NOT NULL,
      descricao TEXT,
      preco REAL NOT NULL,
      disponibilidade INTEGER NOT NULL DEFAULT 1,
      tempo_preparo_minutos INTEGER NOT NULL DEFAULT 12,
      imagem_url TEXT,
      data_cadastro TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE,
      FOREIGN KEY (id_categoria) REFERENCES Categoria(id_categoria) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_produto_restaurante ON Produto(id_restaurante);
    CREATE INDEX IF NOT EXISTS idx_produto_categoria ON Produto(id_categoria);

    -- 6. Tabela Pedido (Comandas e Esteira Operacional com Encerramento de Atendimento)
    CREATE TABLE IF NOT EXISTS Pedido (
      id_pedido TEXT PRIMARY KEY,
      id_restaurante TEXT NOT NULL,
      id_mesa TEXT NOT NULL,
      id_funcionario_abertura INTEGER,
      numero_mesa TEXT NOT NULL,
      identificacao_cliente TEXT NOT NULL,
      local_atendimento TEXT NOT NULL DEFAULT 'Salão Principal',
      status TEXT NOT NULL DEFAULT 'Recebido' CHECK(status IN ('Recebido', 'Em Preparação', 'Pronto', 'Entregue', 'Cancelado')),
      valor_total REAL NOT NULL DEFAULT 0.00,
      observacoes TEXT,
      tempo_preparo_estimado INTEGER DEFAULT 15,
      data_abertura TEXT DEFAULT (datetime('now')),
      timestamp INTEGER NOT NULL,
      data_aceite_cozinha TEXT,
      aceito_por TEXT,
      data_conclusao TEXT,
      data_encerramento TEXT,
      closed_at INTEGER,
      closed_by TEXT,
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE,
      FOREIGN KEY (id_mesa) REFERENCES Mesa(id_mesa) ON DELETE RESTRICT,
      FOREIGN KEY (id_funcionario_abertura) REFERENCES Funcionario(id_funcionario) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pedido_restaurante ON Pedido(id_restaurante);
    CREATE INDEX IF NOT EXISTS idx_pedido_mesa ON Pedido(id_mesa);
    CREATE INDEX IF NOT EXISTS idx_pedido_status ON Pedido(status);
    CREATE INDEX IF NOT EXISTS idx_pedido_timestamp ON Pedido(timestamp);

    -- 7. Tabela ItemPedido (Itens de cada Comanda)
    CREATE TABLE IF NOT EXISTS ItemPedido (
      id_item_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
      id_pedido TEXT NOT NULL,
      id_produto TEXT,
      nome_produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      observacao TEXT,
      FOREIGN KEY (id_pedido) REFERENCES Pedido(id_pedido) ON DELETE CASCADE,
      FOREIGN KEY (id_produto) REFERENCES Produto(id_produto) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_item_pedido ON ItemPedido(id_pedido);
    CREATE INDEX IF NOT EXISTS idx_item_produto ON ItemPedido(id_produto);

    -- 8. Tabela HistoricoStatus (Auditoria e Transições da Esteira KDS)
    CREATE TABLE IF NOT EXISTS HistoricoStatus (
      id_historico INTEGER PRIMARY KEY AUTOINCREMENT,
      id_pedido TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Recebido', 'Em Preparação', 'Pronto', 'Entregue', 'Cancelado')),
      data_evento TEXT DEFAULT (datetime('now')),
      timestamp INTEGER NOT NULL,
      nota_observacao TEXT,
      registrado_por TEXT,
      FOREIGN KEY (id_pedido) REFERENCES Pedido(id_pedido) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_historico_pedido ON HistoricoStatus(id_pedido);

    -- View de compatibilidade com nomes legados da documentação
    DROP VIEW IF EXISTS HistoricoStatusPedido;
    CREATE VIEW HistoricoStatusPedido AS SELECT * FROM HistoricoStatus;
  `);
}

/**
 * Se o banco SQLite estiver vazio, realiza a migração dos dados do database.json
 * ou semeia com dados iniciais limpos.
 */
function checkAndSeedData(db: any): void {
  const countRow = db.prepare('SELECT COUNT(*) as total FROM Restaurante').get();
  if (countRow && countRow.total > 0) {
    return;
  }

  // Tentar migrar de database.json se existir
  if (fs.existsSync(JSON_FILE)) {
    try {
      const stats = migrateDataFromJson(db, JSON_FILE);
      console.log(`[SQLITE BOOT] Dados migrados com sucesso de database.json:`, stats);
      return;
    } catch (e) {
      console.error(`[SQLITE BOOT] Falha na migração automática de database.json:`, e);
    }
  }

  // Fallback para seed padrão
  seedDefaultData(db);
}

export function seedDefaultData(db: any): void {
  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Restaurante
    const insertRest = db.prepare(`
      INSERT OR REPLACE INTO Restaurante (id_restaurante, nome, descricao, endereco, telefone, culinaria, layout_cor_primaria, logo_url, banner_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of INITIAL_RESTAURANTS) {
      insertRest.run(
        r.id,
        r.name,
        r.description || '',
        r.address || '',
        r.phone || '',
        r.cuisine || 'Hamburgueria & Grelhados',
        r.primaryColor || '#e11d48',
        r.logoUrl || '',
        r.heroImageUrl || ''
      );

      // Categorias
      const insertCat = db.prepare(`INSERT INTO Categoria (id_restaurante, nome, ordem_exibicao) VALUES (?, ?, ?)`);
      const cats = r.categories || ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas'];
      let orderIndex = 1;
      for (const c of cats) {
        insertCat.run(r.id, c, orderIndex++);
      }

      // Produtos
      const insertProd = db.prepare(`
        INSERT INTO Produto (id_produto, id_restaurante, nome_categoria, nome, descricao, preco, disponibilidade, tempo_preparo_minutos, imagem_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of r.menu || []) {
        insertProd.run(
          m.id,
          r.id,
          m.category,
          m.name,
          m.description || '',
          m.price,
          m.available !== false ? 1 : 0,
          m.prepTimeMinutes || 12,
          m.imageUrl || ''
        );
      }
    }

    // 2. Colaboradores
    const insertFunc = db.prepare(`
      INSERT OR REPLACE INTO Funcionario (id_restaurante, nome, email, senha_hash, cargo, telefone, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of INITIAL_USERS) {
      insertFunc.run(
        u.restaurantId || 'rest-sabor-brasa',
        u.name || 'Colaborador',
        u.email.toLowerCase(),
        u.password || '$2b$10$RBEK7D5caBHvuO0fCxDtk.wmGl29IO6NpK4aPrzEJg2Bhcsj2/Ns.',
        u.role || 'garcom',
        u.phone || '',
        1
      );
    }

    // 3. Mesas
    const insertMesa = db.prepare(`
      INSERT OR REPLACE INTO Mesa (id_mesa, id_restaurante, numero, nome, capacidade, localizacao, status, id_pedido_atual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of INITIAL_TABLES) {
      insertMesa.run(
        t.id,
        t.restaurantId,
        String(t.number),
        t.name || `Mesa ${t.number}`,
        t.capacity || 4,
        t.location || 'Salão Principal',
        t.status || 'livre',
        t.currentOrderId || null
      );
    }

    // 4. Pedidos Iniciais
    const insertPed = db.prepare(`
      INSERT OR REPLACE INTO Pedido (id_pedido, id_restaurante, id_mesa, numero_mesa, identificacao_cliente, status, valor_total, observacoes, tempo_preparo_estimado, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO ItemPedido (id_pedido, id_produto, nome_produto, quantidade, preco_unitario, subtotal, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHist = db.prepare(`
      INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const o of INITIAL_ORDERS) {
      insertPed.run(
        o.id,
        o.restaurantId,
        o.tableId || 'mesa-01',
        o.tableNumber || 'Mesa 01',
        o.customerName || 'Mesa',
        o.status,
        o.total,
        o.notes || '',
        o.prepTimeMinutes || 15,
        o.timestamp || Date.now()
      );

      for (const item of o.items || []) {
        insertItem.run(
          o.id,
          item.itemId || null,
          item.name,
          item.quantity,
          item.price,
          Number((item.price * item.quantity).toFixed(2)),
          item.observation || null
        );
      }

      insertHist.run(
        o.id,
        o.status,
        o.timestamp || Date.now(),
        `Comanda inicial configurada com status ${o.status}`,
        'Sistema'
      );
    }

    db.exec('COMMIT;');
    console.log('[SQLITE SEED] Banco semeado com sucesso.');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('[SQLITE SEED ERROR]', err);
    throw err;
  }
}

/**
 * Migra dados do arquivo JSON estruturado para o SQLite relacional
 */
export function migrateDataFromJson(db: any, jsonPath: string): {
  restaurants: number;
  users: number;
  tables: number;
  categories: number;
  products: number;
  orders: number;
  items: number;
} {
  const content = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(content);

  const stats = {
    restaurants: 0,
    users: 0,
    tables: 0,
    categories: 0,
    products: 0,
    orders: 0,
    items: 0,
  };

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Restaurantes
    const insertRest = db.prepare(`
      INSERT OR REPLACE INTO Restaurante (id_restaurante, nome, descricao, endereco, telefone, culinaria, layout_cor_primaria, logo_url, banner_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO Categoria (id_restaurante, nome, ordem_exibicao)
      VALUES (?, ?, ?)
    `);
    const insertProd = db.prepare(`
      INSERT OR REPLACE INTO Produto (id_produto, id_restaurante, nome_categoria, nome, descricao, preco, disponibilidade, tempo_preparo_minutos, imagem_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of data.restaurants || []) {
      insertRest.run(
        r.id,
        r.name,
        r.description || '',
        r.address || '',
        r.phone || '',
        r.cuisine || 'Hamburgueria & Grelhados',
        r.primaryColor || '#e11d48',
        r.logoUrl || '',
        r.heroImageUrl || ''
      );
      stats.restaurants++;

      const cats = r.categories || ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas'];
      let idx = 1;
      for (const c of cats) {
        insertCat.run(r.id, c, idx++);
        stats.categories++;
      }

      for (const m of r.menu || []) {
        insertProd.run(
          m.id,
          r.id,
          m.category,
          m.name,
          m.description || '',
          m.price,
          m.available !== false ? 1 : 0,
          m.prepTimeMinutes || 12,
          m.imageUrl || ''
        );
        stats.products++;
      }
    }

    // 2. Colaboradores (Funcionario)
    const insertFunc = db.prepare(`
      INSERT OR REPLACE INTO Funcionario (id_restaurante, nome, email, senha_hash, cargo, telefone, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of data.users || []) {
      insertFunc.run(
        u.restaurantId || 'rest-sabor-brasa',
        u.name || 'Colaborador',
        u.email.toLowerCase(),
        u.password,
        u.role || 'garcom',
        u.phone || '',
        u.isVerified !== false ? 1 : 0
      );
      stats.users++;
    }

    // 3. Mesas (Mesa)
    const insertMesa = db.prepare(`
      INSERT OR REPLACE INTO Mesa (id_mesa, id_restaurante, numero, nome, capacidade, localizacao, status, id_pedido_atual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of data.tables || []) {
      insertMesa.run(
        t.id,
        t.restaurantId || 'rest-sabor-brasa',
        String(t.number),
        t.name || `Mesa ${t.number}`,
        t.capacity || 4,
        t.location || 'Salão Principal',
        t.status || 'livre',
        t.currentOrderId || null
      );
      stats.tables++;
    }

    // 4. Pedidos (Pedido, ItemPedido, HistoricoStatus)
    const insertPed = db.prepare(`
      INSERT OR REPLACE INTO Pedido (
        id_pedido, id_restaurante, id_mesa, numero_mesa, identificacao_cliente, status,
        valor_total, observacoes, tempo_preparo_estimado, timestamp,
        data_aceite_cozinha, aceito_por, data_conclusao, data_encerramento, closed_at, closed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO ItemPedido (id_pedido, id_produto, nome_produto, quantidade, preco_unitario, subtotal, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHist = db.prepare(`
      INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const o of data.orders || []) {
      const isClosed = o.closedAt ? 1 : 0;
      insertPed.run(
        o.id,
        o.restaurantId || 'rest-sabor-brasa',
        o.tableId || 'mesa-01',
        o.tableNumber || 'Mesa 01',
        o.customerName || 'Mesa',
        o.status,
        o.total,
        o.notes || '',
        o.prepTimeMinutes || 15,
        o.timestamp || Date.now(),
        o.acceptedAt ? new Date(o.acceptedAt).toISOString() : null,
        o.acceptedBy || null,
        o.status === 'Entregue' ? new Date(o.timestamp).toISOString() : null,
        o.closedAt ? new Date(o.closedAt).toISOString() : null,
        o.closedAt || null,
        o.closedBy || null
      );
      stats.orders++;

      for (const item of o.items || []) {
        insertItem.run(
          o.id,
          item.itemId || null,
          item.name,
          item.quantity,
          item.price,
          Number((item.price * item.quantity).toFixed(2)),
          item.observation || null
        );
        stats.items++;
      }

      if (Array.isArray(o.statusHistory) && o.statusHistory.length > 0) {
        for (const h of o.statusHistory) {
          insertHist.run(
            o.id,
            h.status,
            h.timestamp || Date.now(),
            h.note || `Transição para ${h.status}`,
            'Colaborador'
          );
        }
      } else {
        insertHist.run(
          o.id,
          o.status,
          o.timestamp || Date.now(),
          `Status do pedido: ${o.status}`,
          'Sistema'
        );
      }
    }

    db.exec('COMMIT;');
    return stats;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// =============================================================================
// REPOSITÓRIO E SERVIÇOS DE DADOS RELACIONAIS (SQLITE)
// =============================================================================

export const sqliteRepo = {
  // --- FUNCIONÁRIOS (User) ---
  findUserByEmail(email: string): User | null {
    const db = getSqliteDb();
    const row = db.prepare(`SELECT * FROM Funcionario WHERE LOWER(email) = LOWER(?)`).get(email.trim());
    if (!row) return null;
    return {
      email: row.email,
      name: row.nome,
      password: row.senha_hash,
      role: row.cargo as UserRole,
      restaurantId: row.id_restaurante,
      phone: row.telefone || undefined,
      isVerified: Boolean(row.ativo),
      createdAt: row.data_cadastro ? new Date(row.data_cadastro).getTime() : Date.now(),
    };
  },

  listUsers(restaurantId?: string): User[] {
    const db = getSqliteDb();
    let rows: any[];
    if (restaurantId) {
      rows = db.prepare(`SELECT * FROM Funcionario WHERE id_restaurante = ? ORDER BY id_funcionario DESC`).all(restaurantId);
    } else {
      rows = db.prepare(`SELECT * FROM Funcionario ORDER BY id_funcionario DESC`).all();
    }
    return rows.map((r) => ({
      email: r.email,
      name: r.nome,
      password: r.senha_hash,
      role: r.cargo as UserRole,
      restaurantId: r.id_restaurante,
      phone: r.telefone || undefined,
      isVerified: Boolean(r.ativo),
      createdAt: r.data_cadastro ? new Date(r.data_cadastro).getTime() : Date.now(),
    }));
  },

  createUser(u: { email: string; name: string; passwordHash: string; role: UserRole; phone?: string; restaurantId: string }): User {
    const db = getSqliteDb();
    const stmt = db.prepare(`
      INSERT INTO Funcionario (id_restaurante, nome, email, senha_hash, cargo, telefone, ativo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(u.restaurantId, u.name, u.email.trim().toLowerCase(), u.passwordHash, u.role, u.phone || null);
    return {
      email: u.email.trim().toLowerCase(),
      name: u.name,
      role: u.role,
      restaurantId: u.restaurantId,
      phone: u.phone,
      isVerified: true,
      createdAt: Date.now(),
    };
  },

  updateUserPassword(email: string, passwordHash: string): boolean {
    const db = getSqliteDb();
    const res = db.prepare(`UPDATE Funcionario SET senha_hash = ? WHERE LOWER(email) = LOWER(?)`).run(passwordHash, email);
    return res.changes > 0;
  },

  deleteUser(email: string): boolean {
    const db = getSqliteDb();
    const res = db.prepare(`DELETE FROM Funcionario WHERE LOWER(email) = LOWER(?)`).run(email);
    return res.changes > 0;
  },

  // --- RESTAURANTE ---
  getRestaurant(id: string): RestaurantConfig | null {
    const db = getSqliteDb();
    const row = db.prepare(`SELECT * FROM Restaurante WHERE id_restaurante = ?`).get(id);
    if (!row) return null;

    // Categorias
    const catRows = db.prepare(`SELECT nome FROM Categoria WHERE id_restaurante = ? ORDER BY ordem_exibicao ASC`).all(id);
    const categories = catRows.map((c: any) => c.nome);

    // Menu
    const prodRows = db.prepare(`SELECT * FROM Produto WHERE id_restaurante = ?`).all(id);
    const menu: MenuItem[] = prodRows.map((p: any) => ({
      id: p.id_produto,
      name: p.nome,
      description: p.descricao || '',
      price: Number(p.preco),
      category: p.nome_categoria || 'Geral',
      imageUrl: p.imagem_url || '',
      prepTimeMinutes: p.tempo_preparo_minutos,
      available: Boolean(p.disponibilidade),
    }));

    return {
      id: row.id_restaurante,
      name: row.nome,
      ownerEmail: 'gerente@saborbrasa.com',
      tagline: 'Gestão Operacional de Salão e Cozinha',
      description: row.descricao || '',
      primaryColor: row.layout_cor_primaria || '#e11d48',
      cuisine: row.culinaria || 'Hamburgueria & Grelhados',
      logoUrl: row.logo_url || '',
      heroImageUrl: row.banner_url || '',
      phone: row.telefone || '',
      address: row.endereco || '',
      menu,
      categories,
    };
  },

  listRestaurants(): RestaurantConfig[] {
    const db = getSqliteDb();
    const restRows = db.prepare(`SELECT id_restaurante FROM Restaurante`).all();
    const list: RestaurantConfig[] = [];
    for (const r of restRows) {
      const rest = this.getRestaurant(r.id_restaurante);
      if (rest) list.push(rest);
    }
    return list;
  },

  updateRestaurant(id: string, partial: Partial<RestaurantConfig>): RestaurantConfig | null {
    const db = getSqliteDb();
    const existing = this.getRestaurant(id);
    if (!existing) return null;

    const merged = { ...existing, ...partial };
    db.prepare(`
      UPDATE Restaurante
      SET nome = ?, descricao = ?, endereco = ?, telefone = ?, culinaria = ?, layout_cor_primaria = ?, logo_url = ?, banner_url = ?
      WHERE id_restaurante = ?
    `).run(
      merged.name,
      merged.description || '',
      merged.address || '',
      merged.phone || '',
      merged.cuisine || 'Geral',
      merged.primaryColor || '#e11d48',
      merged.logoUrl || '',
      merged.heroImageUrl || '',
      id
    );

    return this.getRestaurant(id);
  },

  // --- MESAS (Mesa) ---
  listTables(restaurantId?: string): RestaurantTable[] {
    const db = getSqliteDb();
    let rows: any[];
    if (restaurantId) {
      rows = db.prepare(`SELECT * FROM Mesa WHERE id_restaurante = ? ORDER BY numero ASC`).all(restaurantId);
    } else {
      rows = db.prepare(`SELECT * FROM Mesa ORDER BY numero ASC`).all();
    }
    return rows.map((r) => ({
      id: r.id_mesa,
      restaurantId: r.id_restaurante,
      number: isNaN(Number(r.numero)) ? r.numero : Number(r.numero),
      name: r.nome,
      capacity: r.capacidade,
      status: r.status as TableStatus,
      currentOrderId: r.id_pedido_atual || undefined,
      location: r.localizacao,
      updatedAt: r.data_atualizacao ? new Date(r.data_atualizacao).getTime() : Date.now(),
    }));
  },

  getTable(id: string): RestaurantTable | null {
    const db = getSqliteDb();
    const r = db.prepare(`SELECT * FROM Mesa WHERE id_mesa = ?`).get(id);
    if (!r) return null;
    return {
      id: r.id_mesa,
      restaurantId: r.id_restaurante,
      number: isNaN(Number(r.numero)) ? r.numero : Number(r.numero),
      name: r.nome,
      capacity: r.capacidade,
      status: r.status as TableStatus,
      currentOrderId: r.id_pedido_atual || undefined,
      location: r.localizacao,
      updatedAt: r.data_atualizacao ? new Date(r.data_atualizacao).getTime() : Date.now(),
    };
  },

  findTableByIdOrNumber(identifier: string, restaurantId?: string): RestaurantTable | null {
    const db = getSqliteDb();
    const query = restaurantId
      ? `SELECT * FROM Mesa WHERE id_restaurante = ? AND (id_mesa = ? OR LOWER(nome) = LOWER(?) OR numero = ?)`
      : `SELECT * FROM Mesa WHERE id_mesa = ? OR LOWER(nome) = LOWER(?) OR numero = ?`;
    const params = restaurantId ? [restaurantId, identifier, identifier, identifier] : [identifier, identifier, identifier];
    const r = db.prepare(query).get(...params);
    if (!r) return null;
    return {
      id: r.id_mesa,
      restaurantId: r.id_restaurante,
      number: isNaN(Number(r.numero)) ? r.numero : Number(r.numero),
      name: r.nome,
      capacity: r.capacidade,
      status: r.status as TableStatus,
      currentOrderId: r.id_pedido_atual || undefined,
      location: r.localizacao,
      updatedAt: r.data_atualizacao ? new Date(r.data_atualizacao).getTime() : Date.now(),
    };
  },

  createTable(t: Partial<RestaurantTable>): RestaurantTable {
    const db = getSqliteDb();
    const restId = t.restaurantId || 'rest-sabor-brasa';
    const num = t.number !== undefined ? String(t.number) : '0';
    const id = t.id || `mesa-${num.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const name = t.name || `Mesa ${num}`;

    db.prepare(`
      INSERT INTO Mesa (id_mesa, id_restaurante, numero, nome, capacidade, localizacao, status, id_pedido_atual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      restId,
      num,
      name,
      t.capacity || 4,
      t.location || 'Salão Principal',
      t.status || 'livre',
      t.currentOrderId || null
    );

    return this.getTable(id)!;
  },

  updateTable(id: string, partial: Partial<RestaurantTable>): RestaurantTable | null {
    const db = getSqliteDb();
    const existing = this.getTable(id);
    if (!existing) return null;

    // Proteção em profundidade (RN004): updateTable() é estritamente cadastral.
    // NUNCA altera o status operacional da mesa nem o vínculo de pedidos (id_pedido_atual).
    // O ciclo de vida do atendimento é controlado exclusivamente por updateTableStatus() e pelos fluxos de comanda.
    const numero = partial.number !== undefined ? String(partial.number) : String(existing.number);
    const nome = partial.name !== undefined ? partial.name : existing.name;
    const capacidade = partial.capacity !== undefined ? (Number(partial.capacity) || existing.capacity) : existing.capacity;
    const localizacao = partial.location !== undefined ? partial.location : existing.location;

    db.prepare(`
      UPDATE Mesa
      SET numero = ?, nome = ?, capacidade = ?, localizacao = ?, data_atualizacao = datetime('now')
      WHERE id_mesa = ?
    `).run(
      numero,
      nome,
      capacidade,
      localizacao,
      id
    );

    return this.getTable(id);
  },

  updateTableStatus(id: string, status: TableStatus, currentOrderId?: string | null): RestaurantTable | null {
    const db = getSqliteDb();
    const orderIdVal = status === 'livre' ? null : (currentOrderId !== undefined ? currentOrderId : null);
    db.prepare(`
      UPDATE Mesa
      SET status = ?, id_pedido_atual = ?, data_atualizacao = datetime('now')
      WHERE id_mesa = ?
    `).run(status, orderIdVal, id);
    return this.getTable(id);
  },

  deleteTable(id: string): boolean {
    const db = getSqliteDb();
    const res = db.prepare(`DELETE FROM Mesa WHERE id_mesa = ?`).run(id);
    return res.changes > 0;
  },

  // --- PRODUTOS (Produto) ---
  listProducts(restaurantId: string = 'rest-sabor-brasa'): MenuItem[] {
    const db = getSqliteDb();
    const rows = db.prepare(`SELECT * FROM Produto WHERE id_restaurante = ? ORDER BY nome ASC`).all(restaurantId);
    return rows.map((p: any) => ({
      id: p.id_produto,
      name: p.nome,
      description: p.descricao || '',
      price: Number(p.preco),
      category: p.nome_categoria || 'Geral',
      imageUrl: p.imagem_url || '',
      prepTimeMinutes: p.tempo_preparo_minutos,
      available: Boolean(p.disponibilidade),
    }));
  },

  getProduct(id: string): MenuItem | null {
    const db = getSqliteDb();
    const p = db.prepare(`SELECT * FROM Produto WHERE id_produto = ?`).get(id);
    if (!p) return null;
    return {
      id: p.id_produto,
      name: p.nome,
      description: p.descricao || '',
      price: Number(p.preco),
      category: p.nome_categoria || 'Geral',
      imageUrl: p.imagem_url || '',
      prepTimeMinutes: p.tempo_preparo_minutos,
      available: Boolean(p.disponibilidade),
    };
  },

  createProduct(prod: Partial<MenuItem>, restaurantId: string = 'rest-sabor-brasa'): MenuItem {
    const db = getSqliteDb();
    const id = prod.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT INTO Produto (id_produto, id_restaurante, nome_categoria, nome, descricao, preco, disponibilidade, tempo_preparo_minutos, imagem_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      restaurantId,
      prod.category || 'Geral',
      prod.name,
      prod.description || '',
      prod.price,
      prod.available !== false ? 1 : 0,
      prod.prepTimeMinutes || 12,
      prod.imageUrl || ''
    );

    return this.getProduct(id)!;
  },

  updateProduct(id: string, partial: Partial<MenuItem>): MenuItem | null {
    const db = getSqliteDb();
    const existing = this.getProduct(id);
    if (!existing) return null;

    const merged = { ...existing, ...partial };
    db.prepare(`
      UPDATE Produto
      SET nome = ?, descricao = ?, preco = ?, nome_categoria = ?, disponibilidade = ?, tempo_preparo_minutos = ?, imagem_url = ?
      WHERE id_produto = ?
    `).run(
      merged.name,
      merged.description || '',
      merged.price,
      merged.category,
      merged.available !== false ? 1 : 0,
      merged.prepTimeMinutes || 12,
      merged.imageUrl || '',
      id
    );

    return this.getProduct(id);
  },

  deleteProduct(id: string): boolean {
    const db = getSqliteDb();
    const res = db.prepare(`DELETE FROM Produto WHERE id_produto = ?`).run(id);
    return res.changes > 0;
  },

  // --- CATEGORIAS (Categoria) ---
  listCategories(restaurantId: string = 'rest-sabor-brasa'): string[] {
    const db = getSqliteDb();
    const rows = db.prepare(`SELECT nome FROM Categoria WHERE id_restaurante = ? ORDER BY ordem_exibicao ASC`).all(restaurantId);
    return rows.map((r: any) => r.nome);
  },

  createCategory(name: string, restaurantId: string = 'rest-sabor-brasa'): string[] {
    const db = getSqliteDb();
    const maxOrder = db.prepare(`SELECT MAX(ordem_exibicao) as max_ord FROM Categoria WHERE id_restaurante = ?`).get(restaurantId);
    const nextOrder = (maxOrder?.max_ord || 0) + 1;

    db.prepare(`INSERT INTO Categoria (id_restaurante, nome, ordem_exibicao) VALUES (?, ?, ?)`).run(restaurantId, name.trim(), nextOrder);
    return this.listCategories(restaurantId);
  },

  deleteCategory(name: string, restaurantId: string = 'rest-sabor-brasa'): string[] {
    const db = getSqliteDb();
    db.prepare(`DELETE FROM Categoria WHERE id_restaurante = ? AND LOWER(nome) = LOWER(?)`).run(restaurantId, name.trim());
    return this.listCategories(restaurantId);
  },

  // --- PEDIDOS (Pedido, ItemPedido, HistoricoStatus) ---
  listOrders(restaurantId?: string): Order[] {
    const db = getSqliteDb();
    const query = restaurantId
      ? `SELECT * FROM Pedido WHERE id_restaurante = ? ORDER BY timestamp DESC`
      : `SELECT * FROM Pedido ORDER BY timestamp DESC`;
    const params = restaurantId ? [restaurantId] : [];
    const orderRows = db.prepare(query).all(...params);

    const orders: Order[] = [];
    for (const r of orderRows) {
      // Itens
      const itemRows = db.prepare(`SELECT * FROM ItemPedido WHERE id_pedido = ?`).all(r.id_pedido);
      const items: OrderItem[] = itemRows.map((it: any) => ({
        itemId: it.id_produto || undefined,
        name: it.nome_produto,
        quantity: it.quantidade,
        price: Number(it.preco_unitario),
        observation: it.observacao || undefined,
      }));

      // Histórico
      const histRows = db.prepare(`SELECT * FROM HistoricoStatus WHERE id_pedido = ? ORDER BY timestamp ASC`).all(r.id_pedido);
      const statusHistory = histRows.map((h: any) => ({
        status: h.status as OrderStatus,
        timestamp: h.timestamp,
        note: h.nota_observacao || undefined,
      }));

      orders.push({
        id: r.id_pedido,
        restaurantId: r.id_restaurante,
        restaurantName: 'Sabor & Brasa',
        items,
        total: Number(r.valor_total),
        status: r.status as OrderStatus,
        timestamp: r.timestamp,
        customerName: r.identificacao_cliente,
        tableId: r.id_mesa || undefined,
        tableNumber: r.numero_mesa || undefined,
        notes: r.observacoes || undefined,
        prepTimeMinutes: r.tempo_preparo_estimado || 15,
        statusHistory,
        acceptedAt: r.data_aceite_cozinha ? new Date(r.data_aceite_cozinha).getTime() : undefined,
        acceptedBy: r.aceito_por || undefined,
        closedAt: r.closed_at ? Number(r.closed_at) : undefined,
        closedBy: r.closed_by || undefined,
      });
    }

    return orders;
  },

  getOrder(id: string): Order | null {
    const db = getSqliteDb();
    const r = db.prepare(`SELECT * FROM Pedido WHERE id_pedido = ?`).get(id);
    if (!r) return null;

    const itemRows = db.prepare(`SELECT * FROM ItemPedido WHERE id_pedido = ?`).all(id);
    const items: OrderItem[] = itemRows.map((it: any) => ({
      itemId: it.id_produto || undefined,
      name: it.nome_produto,
      quantity: it.quantidade,
      price: Number(it.preco_unitario),
      observation: it.observacao || undefined,
    }));

    const histRows = db.prepare(`SELECT * FROM HistoricoStatus WHERE id_pedido = ? ORDER BY timestamp ASC`).all(id);
    const statusHistory = histRows.map((h: any) => ({
      status: h.status as OrderStatus,
      timestamp: h.timestamp,
      note: h.nota_observacao || undefined,
    }));

    return {
      id: r.id_pedido,
      restaurantId: r.id_restaurante,
      restaurantName: 'Sabor & Brasa',
      items,
      total: Number(r.valor_total),
      status: r.status as OrderStatus,
      timestamp: r.timestamp,
      customerName: r.identificacao_cliente,
      tableId: r.id_mesa || undefined,
      tableNumber: r.numero_mesa || undefined,
      notes: r.observacoes || undefined,
      prepTimeMinutes: r.tempo_preparo_estimado || 15,
      statusHistory,
      acceptedAt: r.data_aceite_cozinha ? new Date(r.data_aceite_cozinha).getTime() : undefined,
      acceptedBy: r.aceito_por || undefined,
      closedAt: r.closed_at ? Number(r.closed_at) : undefined,
      closedBy: r.closed_by || undefined,
    };
  },

  /**
   * Cria nova comanda e ocupa a mesa correspondente no banco SQLite
   */
  createOrder(
    orderData: {
      orderId: string;
      restaurantId: string;
      tableId: string;
      tableNumber: string;
      customerName: string;
      items: OrderItem[];
      total: number;
      notes?: string;
      prepTimeMinutes?: number;
    },
    authUser: { name?: string; email?: string }
  ): Order {
    const db = getSqliteDb();
    const now = Date.now();

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Inserir Pedido
      db.prepare(`
        INSERT INTO Pedido (
          id_pedido, id_restaurante, id_mesa, numero_mesa, identificacao_cliente, status,
          valor_total, observacoes, tempo_preparo_estimado, timestamp
        ) VALUES (?, ?, ?, ?, ?, 'Recebido', ?, ?, ?, ?)
      `).run(
        orderData.orderId,
        orderData.restaurantId,
        orderData.tableId,
        orderData.tableNumber,
        orderData.customerName,
        orderData.total,
        orderData.notes || `Lançado por ${authUser.name || authUser.email}`,
        orderData.prepTimeMinutes || 15,
        now
      );

      // 2. Inserir Itens
      const insertItem = db.prepare(`
        INSERT INTO ItemPedido (id_pedido, id_produto, nome_produto, quantidade, preco_unitario, subtotal, observacao)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of orderData.items) {
        insertItem.run(
          orderData.orderId,
          it.itemId || null,
          it.name,
          it.quantity,
          it.price,
          Number((it.price * it.quantity).toFixed(2)),
          it.observation || null
        );
      }

      // 3. Inserir Histórico de Status inicial
      db.prepare(`
        INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
        VALUES (?, 'Recebido', ?, ?, ?)
      `).run(
        orderData.orderId,
        now,
        `Comanda aberta pelo colaborador ${authUser.name || 'Garçom'} para a ${orderData.tableNumber}. Mesa ocupada.`,
        authUser.name || 'Garçom'
      );

      // 4. Ocupar a Mesa
      db.prepare(`
        UPDATE Mesa
        SET status = 'ocupada', id_pedido_atual = ?, data_atualizacao = datetime('now')
        WHERE id_mesa = ?
      `).run(orderData.orderId, orderData.tableId);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.getOrder(orderData.orderId)!;
  },

  acceptOrderInKitchen(orderId: string, acceptedBy: string): Order | null {
    const db = getSqliteDb();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        UPDATE Pedido
        SET status = 'Em Preparação', data_aceite_cozinha = ?, aceito_por = ?
        WHERE id_pedido = ?
      `).run(nowIso, acceptedBy, orderId);

      db.prepare(`
        INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
        VALUES (?, 'Em Preparação', ?, ?, ?)
      `).run(
        orderId,
        now,
        `Comanda aceita na cozinha por ${acceptedBy} e enviada para preparo.`,
        acceptedBy
      );

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.getOrder(orderId);
  },

  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
    changedBy?: string,
    role?: string
  ): Order | null {
    const db = getSqliteDb();
    const order = this.getOrder(orderId);
    if (!order) return null;

    const now = Date.now();
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`UPDATE Pedido SET status = ? WHERE id_pedido = ?`).run(status, orderId);

      db.prepare(`
        INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        orderId,
        status,
        now,
        note || `Status alterado para ${status} por ${changedBy || 'Colaborador'} (${role || 'sistema'})`,
        changedBy || 'Colaborador'
      );

      // REGRA DO SISTEMA:
      // Na entrega (status "Entregue") a mesa NÃO é mais liberada!
      // Apenas o Cancelamento ('Cancelado') ou o Encerramento explícito (/api/orders/:id/close) libera a mesa.
      if (status === 'Cancelado') {
        db.prepare(`
          UPDATE Mesa
          SET status = 'livre', id_pedido_atual = NULL, data_atualizacao = datetime('now')
          WHERE id_pedido_atual = ? OR id_mesa = ?
        `).run(orderId, order.tableId || '');
        console.log(`[SQLITE MESA LIBERADA] Mesa liberada após cancelamento do pedido ${orderId}`);
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return this.getOrder(orderId);
  },

  /**
   * ENCERRAMENTO DO ATENDIMENTO (Garçom e Gerente)
   * - Só aceita pedido com status "Entregue"
   * - Libera a mesa (status livre, remove o pedido atual)
   * - Grava a data/hora de encerramento no pedido (closedAt e data_encerramento)
   */
  closeOrder(
    orderId: string,
    closedBy: string
  ): { success: boolean; order: Order; table?: RestaurantTable } {
    const db = getSqliteDb();
    const order = this.getOrder(orderId);
    if (!order) {
      throw new Error('NOT_FOUND');
    }

    if (order.closedAt) {
      throw new Error('ALREADY_CLOSED');
    }

    if (order.status !== 'Entregue') {
      throw new Error('NOT_DELIVERED');
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Gravar data/hora de encerramento no pedido
      db.prepare(`
        UPDATE Pedido
        SET closed_at = ?, closed_by = ?, data_encerramento = ?
        WHERE id_pedido = ?
      `).run(now, closedBy, nowIso, orderId);

      // 2. Adicionar histórico de status
      db.prepare(`
        INSERT INTO HistoricoStatus (id_pedido, status, timestamp, nota_observacao, registrado_por)
        VALUES (?, 'Entregue', ?, ?, ?)
      `).run(
        orderId,
        now,
        `Atendimento encerrado por ${closedBy}. Mesa liberada com sucesso.`,
        closedBy
      );

      // 3. Liberar a mesa vinculada (status: livre, remove o pedido atual)
      db.prepare(`
        UPDATE Mesa
        SET status = 'livre', id_pedido_atual = NULL, data_atualizacao = datetime('now')
        WHERE id_pedido_atual = ? OR id_mesa = ?
      `).run(orderId, order.tableId || '');

      db.exec('COMMIT;');
      console.log(`[SQLITE ENCERRAMENTO] Pedido ${orderId} encerrado por ${closedBy}. Mesa liberada.`);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const updatedOrder = this.getOrder(orderId)!;
    const freedTable = order.tableId ? this.getTable(order.tableId) || undefined : undefined;

    return {
      success: true,
      order: updatedOrder,
      table: freedTable,
    };
  },

  /**
   * Reseta o banco de dados SQLite para o estado inicial padrão
   */
  resetToInitial(): void {
    const db = getSqliteDb();
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      DELETE FROM HistoricoStatus;
      DELETE FROM ItemPedido;
      DELETE FROM Pedido;
      DELETE FROM Produto;
      DELETE FROM Categoria;
      DELETE FROM Mesa;
      DELETE FROM Funcionario;
      DELETE FROM Restaurante;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
    seedDefaultData(db);
  },
};
