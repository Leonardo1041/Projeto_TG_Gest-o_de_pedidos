-- =============================================================================
-- TRABALHO DE GRADUAÇÃO (TG) - FATEC FRANCA 2026
-- MODELO FÍSICO RELACIONAL DO BANCO DE DADOS (SQLITE / SCRIPT DDL OFICIAL)
-- Sistema Operacional e de Gestão para Restaurantes: Salão, KDS e Gerência
-- Entidades: Restaurante, Funcionario, Mesa, Categoria, Produto, Pedido, ItemPedido, HistoricoStatus
-- Status dos Pedidos: Recebido, Em Preparação, Pronto, Entregue, Cancelado
-- =============================================================================
-- NOTA ARQUITETURAL:
-- Este script define a estrutura física relacional em SQLite (data/database.sqlite).
-- A camada de dados utiliza chaves estrangeiras ativas (PRAGMA foreign_keys = ON)
-- e modo WAL (Write-Ahead Logging) para garantir integridade referencial,
-- atomicidade em transações e alta performance no Node.js/Express.
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- -----------------------------------------------------------------------------
-- 1. TABELA: Restaurante (Estabelecimento)
-- Representa a unidade do restaurante onde operam os funcionários e o salão.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. TABELA: Funcionario (Equipe e Controle de Acesso RBAC)
-- Restringe o sistema aos colaboradores autorizados:
--   - 'garcom'  : Lançamento de comandas e encerramento de atendimento no salão
--   - 'kitchen' : Visualização e avanço de pedidos no Kitchen Display System (KDS)
--   - 'manager' : Gestão de colaboradores, cardápio, categorias e encerramento
--   - 'admin'   : Acesso administrativo geral
-- Senhas criptografadas com hash bcrypt.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. TABELA: Mesa (Salão e Controle de Ocupação)
-- Gerencia as mesas físicas e posições de balcão do salão.
-- Status sincronizado com o ciclo de vida dos pedidos:
--   - 'livre'   : Mesa desocupada, disponível para nova comanda
--   - 'ocupada' : Mesa com comanda ativa em atendimento
-- REGRA DE SALÃO: A entrega do pedido ("Entregue") NÃO libera a mesa;
-- a mesa só é liberada no encerramento explícito do atendimento ou cancelamento.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. TABELA: Categoria (Organização do Cardápio)
-- Seções do cardápio gerenciadas exclusivamente pelo Gerente.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Categoria (
  id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
  id_restaurante TEXT NOT NULL,
  nome TEXT NOT NULL,
  ordem_exibicao INTEGER NOT NULL DEFAULT 0,
  data_criacao TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categoria_restaurante ON Categoria(id_restaurante);

-- -----------------------------------------------------------------------------
-- 5. TABELA: Produto (Itens do Cardápio)
-- Pratos, bebidas e itens produzidos na cozinha ou servidos no salão.
-- Preço validado por regra de negócio (RN005: preço estritamente positivo > 0).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Produto (
  id_produto TEXT PRIMARY KEY,
  id_restaurante TEXT NOT NULL,
  id_categoria INTEGER,
  nome_categoria TEXT,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco REAL NOT NULL CHECK(preco > 0),
  disponibilidade INTEGER NOT NULL DEFAULT 1,
  tempo_preparo_minutos INTEGER NOT NULL DEFAULT 12,
  imagem_url TEXT,
  data_cadastro TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (id_restaurante) REFERENCES Restaurante(id_restaurante) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES Categoria(id_categoria) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_produto_restaurante ON Produto(id_restaurante);
CREATE INDEX IF NOT EXISTS idx_produto_categoria ON Produto(id_categoria);

-- -----------------------------------------------------------------------------
-- 6. TABELA: Pedido (Comandas e Esteira Operacional com Encerramento)
-- Registra as comandas abertas pelos garçons e despachadas para o KDS.
-- Status estritos definidos no modelo operacional:
--   - 'Recebido'      : Pedido aberto pelo garçom / mesa ocupada
--   - 'Em Preparação' : Pedido aceito e em preparo na cozinha
--   - 'Pronto'        : Prato finalizado pela cozinha, aguardando servir
--   - 'Entregue'      : Servido na mesa pelo garçom (mesa permanece ocupada)
--   - 'Cancelado'     : Pedido cancelado (libera a mesa)
-- Encerramento: data_encerramento e closed_at preenchidos via POST /api/orders/:id/close
-- liberando a mesa para novos atendimentos.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 7. TABELA: ItemPedido (Itens da Comanda)
-- Detalhamento dos produtos que compõem cada pedido.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 8. TABELA: HistoricoStatus (Auditoria da Esteira KDS e Atendimento)
-- Registro cronológico de todas as transições de status e encerramento.
-- -----------------------------------------------------------------------------
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

-- View de compatibilidade com nomes legados
CREATE VIEW IF NOT EXISTS HistoricoStatusPedido AS SELECT * FROM HistoricoStatus;

-- =============================================================================
-- DADOS INICIAIS (SEED DO BANCO SQLITE)
-- =============================================================================

INSERT OR REPLACE INTO Restaurante (id_restaurante, nome, descricao, endereco, telefone, culinaria, layout_cor_primaria) VALUES
('rest-sabor-brasa', 'Sabor & Brasa', 'Hamburgueria Artesanal e Grelhados com Gestão de Salão e KDS', 'Av. Dr. Thomaz Novelino, 100 - Franca/SP', '(16) 99123-4567', 'Hamburgueria & Grelhados', '#e11d48');

-- Colaboradores (Senhas padrão com hash bcrypt: 'Garcom@2026', 'Cozinha@2026', 'Gerente@2026', 'admin123')
INSERT OR REPLACE INTO Funcionario (id_funcionario, id_restaurante, nome, email, senha_hash, cargo, telefone) VALUES
(1, 'rest-sabor-brasa', 'Lucas Silveira', 'garcom@saborbrasa.com', '$2b$10$RBEK7D5caBHvuO0fCxDtk.wmGl29IO6NpK4aPrzEJg2Bhcsj2/Ns.', 'garcom', '(16) 99123-1111'),
(2, 'rest-sabor-brasa', 'Chef Marcos', 'cozinha@saborbrasa.com', '$2b$10$m7bqbzpyjySih334T7Df2O/WmbAO9xmkB4KLjwygWlrm.rkb/iZcm', 'kitchen', '(16) 99123-2222'),
(3, 'rest-sabor-brasa', 'Mariana Gerente', 'gerente@saborbrasa.com', '$2b$10$1/2Zk2PHZScVr0M/cycCHOjZNvVtVTCpvU7SWGJx8i7XIO704lKZu', 'manager', '(16) 99123-3333'),
(4, 'rest-sabor-brasa', 'Gerente Geral Master', 'admin@admin.com', '$2b$10$2IrUSuKEwtzni.Ilt33pzuC2PSpDy17kYYggZBdrEepOc6B/RT9TK', 'admin', '(16) 99444-5566');

-- Mesas do Salão
INSERT OR REPLACE INTO Mesa (id_mesa, id_restaurante, numero, nome, capacidade, localizacao, status, id_pedido_atual) VALUES
('mesa-01', 'rest-sabor-brasa', '1', 'Mesa 01', 4, 'Salão Principal', 'livre', NULL),
('mesa-02', 'rest-sabor-brasa', '2', 'Mesa 02', 4, 'Salão Principal', 'ocupada', 'CMD-1080'),
('mesa-03', 'rest-sabor-brasa', '3', 'Mesa 03', 2, 'Janela', 'livre', NULL),
('mesa-04', 'rest-sabor-brasa', '4', 'Mesa 04', 6, 'Salão Principal', 'ocupada', 'CMD-1083'),
('mesa-05', 'rest-sabor-brasa', '5', 'Mesa 05', 4, 'Varanda', 'ocupada', 'CMD-1081'),
('mesa-06', 'rest-sabor-brasa', '6', 'Mesa 06', 8, 'Espaço Família', 'livre', NULL),
('mesa-balcao-1', 'rest-sabor-brasa', 'B1', 'Balcão 01', 1, 'Balcão', 'livre', NULL);

-- Categorias do Cardápio
INSERT OR IGNORE INTO Categoria (id_categoria, id_restaurante, nome, ordem_exibicao) VALUES
(1, 'rest-sabor-brasa', 'Burgers', 1),
(2, 'rest-sabor-brasa', 'Pizzas', 2),
(3, 'rest-sabor-brasa', 'Acompanhamentos', 3),
(4, 'rest-sabor-brasa', 'Bebidas', 4),
(5, 'rest-sabor-brasa', 'Sobremesas', 5);

-- Produtos do Cardápio
INSERT OR REPLACE INTO Produto (id_produto, id_restaurante, id_categoria, nome_categoria, nome, descricao, preco, disponibilidade, tempo_preparo_minutos) VALUES
('item-sb-1', 'rest-sabor-brasa', 1, 'Burgers', 'Burger Artesanal', 'Pão brioche, carne artesanal 180g, queijo e molho especial da casa.', 32.90, 1, 12),
('item-sb-2', 'rest-sabor-brasa', 2, 'Pizzas', 'Pizza Especial', 'Massa artesanal italiana, molho pomodoro rústico e queijo selecionado.', 45.00, 1, 18),
('item-sb-3', 'rest-sabor-brasa', 1, 'Burgers', 'Double Bacon Smash', '2x burger 100g prensado, cheddar cremoso duplo e tiras crocantes de bacon.', 38.00, 1, 10),
('item-sb-4', 'rest-sabor-brasa', 3, 'Acompanhamentos', 'Batata Rústica com Alecrim', 'Batatas corte artesanal temperadas com alecrim fresco e sal marinho.', 18.00, 1, 8),
('item-sb-5', 'rest-sabor-brasa', 4, 'Bebidas', 'Refrigerante Lata 350ml', 'Coca-Cola, Guaraná Antarctica ou Citrus bem gelado.', 7.00, 1, 2);
