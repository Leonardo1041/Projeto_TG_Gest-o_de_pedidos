/**
 * Script de Migração: database.json -> SQLite (data/database.sqlite)
 * Trabalho de Graduação (TG) - FATEC Franca 2026
 *
 * Converte o arquivo estruturado data/database.json no banco relacional SQLite,
 * criando e populando as tabelas:
 *   - Restaurante
 *   - Funcionario
 *   - Mesa
 *   - Categoria
 *   - Produto
 *   - Pedido
 *   - ItemPedido
 *   - HistoricoStatus
 */

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const DB_DIR = path.join(process.cwd(), 'data');
const JSON_FILE = path.join(DB_DIR, 'database.json');
const SQLITE_FILE = path.join(DB_DIR, 'database.sqlite');

function runMigration() {
  console.log('='.repeat(70));
  console.log(' INICIANDO MIGRAÇÃO DE DADOS: JSON -> SQLITE');
  console.log('='.repeat(70));
  console.log(`Origem  : ${JSON_FILE}`);
  console.log(`Destino : ${SQLITE_FILE}`);

  if (!fs.existsSync(JSON_FILE)) {
    console.error(`ERRO: Arquivo ${JSON_FILE} não encontrado!`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(JSON_FILE, 'utf-8');
  const data = JSON.parse(rawJson);

  // Inicializar banco SQLite
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(SQLITE_FILE);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Executar criação das tabelas conforme DER
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS Categoria (
      id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
      id_restaurante TEXT NOT NULL,
      nome TEXT NOT NULL,
      ordem_exibicao INTEGER NOT NULL DEFAULT 0,
      data_criacao TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_categoria_restaurante ON Categoria(id_restaurante);

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

    DROP VIEW IF EXISTS HistoricoStatusPedido;
    CREATE VIEW HistoricoStatusPedido AS SELECT * FROM HistoricoStatus;
  `);

  console.log('[1/4] Schema DDL verificado e tabelas preparadas.');

  // Inserir dados dentro de transação única
  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Restaurante
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

    let restCount = 0;
    let catCount = 0;
    let prodCount = 0;

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
      restCount++;

      const cats = r.categories || ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas'];
      let oIdx = 1;
      for (const c of cats) {
        insertCat.run(r.id, c, oIdx++);
        catCount++;
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
        prodCount++;
      }
    }

    // 2. Colaboradores (Funcionario)
    const insertFunc = db.prepare(`
      INSERT OR REPLACE INTO Funcionario (id_restaurante, nome, email, senha_hash, cargo, telefone, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let funcCount = 0;
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
      funcCount++;
    }

    // 3. Mesas
    const insertMesa = db.prepare(`
      INSERT OR REPLACE INTO Mesa (id_mesa, id_restaurante, numero, nome, capacidade, localizacao, status, id_pedido_atual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let mesaCount = 0;
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
      mesaCount++;
    }

    // 4. Pedidos, Itens e Histórico
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

    let pedCount = 0;
    let itemCount = 0;
    let histCount = 0;

    for (const o of data.orders || []) {
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
      pedCount++;

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
        itemCount++;
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
          histCount++;
        }
      } else {
        insertHist.run(
          o.id,
          o.status,
          o.timestamp || Date.now(),
          `Status do pedido: ${o.status}`,
          'Sistema'
        );
        histCount++;
      }
    }

    db.exec('COMMIT;');

    console.log('[2/4] Transação executada com sucesso.');
    console.log('='.repeat(70));
    console.log(' RESUMO DA MIGRAÇÃO PARA SQLITE');
    console.log('='.repeat(70));
    console.log(`- Restaurantes       : ${restCount}`);
    console.log(`- Colaboradores (RBAC): ${funcCount}`);
    console.log(`- Mesas & Salão      : ${mesaCount}`);
    console.log(`- Categorias         : ${catCount}`);
    console.log(`- Produtos Cardápio  : ${prodCount}`);
    console.log(`- Pedidos / Comandas : ${pedCount}`);
    console.log(`- Itens de Pedido    : ${itemCount}`);
    console.log(`- Histórico de Status: ${histCount}`);
    console.log('='.repeat(70));
    console.log('✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('ERRO FATAL NA MIGRAÇÃO:', err);
    process.exit(1);
  }
}

runMigration();
