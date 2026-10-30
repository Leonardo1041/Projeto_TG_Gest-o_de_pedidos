import express from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { sqliteRepo, getSqliteDb } from './src/db/sqlite';
import { User, RestaurantConfig, Order, OrderItem, OrderStatus, RestaurantTable, TableStatus, MenuItem, UserRole } from './src/types';

// Carregar variáveis de ambiente do .env
dotenv.config();

// Inicializar banco de dados SQLite oficial do TG
getSqliteDb();

// JWT Secret Key - Obrigatório em produção; chave controlada em desenvolvimento/testes
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (isProduction) {
    throw new Error('FATAL: A variável de ambiente JWT_SECRET é estritamente obrigatória em ambiente de produção.');
  }
  console.warn('[AVISO DE SEGURANÇA] JWT_SECRET não configurado no ambiente. Utilizando chave de homologação local.');
}
const ACTIVE_JWT_SECRET = JWT_SECRET || 'jwt_secret_dev_local_exemplo_sem_segredos';

function hashPassword(password: string): string {
  if (password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$')) {
    return password;
  }
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(plain, hash);
    } catch {
      return false;
    }
  }
  return plain === hash;
}

// =========================================================================
// AUTHENTICATION & SECURITY MIDDLEWARE
// =========================================================================

interface AuthenticatedUser {
  email: string;
  name?: string;
  role: UserRole;
  restaurantId?: string;
}

function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-auth-token'] as string);

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido. Acesso não autorizado.' });
  }

  try {
    const decoded = jwt.verify(token, ACTIVE_JWT_SECRET) as any;
    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const user = sqliteRepo.findUserByEmail(decoded.email);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou removido.' });
    }

    (req as any).user = {
      email: user.email,
      name: user.name,
      role: user.role || 'manager',
      restaurantId: user.restaurantId || decoded.restaurantId || 'rest-sabor-brasa',
    } as AuthenticatedUser;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const role = user.role;
    const isAllowed =
      allowedRoles.includes(role) ||
      (role === 'owner' && allowedRoles.includes('manager')) ||
      (role === 'admin');

    if (!isAllowed) {
      return res.status(403).json({
        error: `Acesso negado: Perfil "${role}" não possui permissão para este recurso. Permitidos: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logger
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API ${req.method}] ${req.path}`);
    }
    next();
  });

  // =========================================================================
  // 1. HEALTH & METRICS ENDPOINTS
  // =========================================================================
  app.get('/api/health', (req, res) => {
    const orders = sqliteRepo.listOrders();
    const tables = sqliteRepo.listTables();
    const users = sqliteRepo.listUsers();
    const restaurants = sqliteRepo.listRestaurants();

    const activeOrders = orders.filter(
      (o) => o.status !== 'Cancelado' && !o.closedAt
    ).length;
    const totalTables = tables.length;
    const occupiedTables = tables.filter((t) => t.status === 'ocupada').length;
    const freeTables = totalTables - occupiedTables;

    res.json({
      status: 'online',
      message: 'Servidor Operacional de Gestão de Restaurante (SQLite / WAL)',
      version: '3.1.0',
      releaseTag: 'v3.1.0-tg-fatec',
      database: 'SQLite',
      timestamp: Date.now(),
      metrics: {
        totalRestaurants: restaurants.length,
        totalOrders: orders.length,
        activeOrders,
        totalUsers: users.length,
        verifiedUsers: users.filter((u) => u.isVerified).length,
        totalTables,
        occupiedTables,
        freeTables,
      },
    });
  });

  // =========================================================================
  // 2. AUTHENTICATION & LOGIN
  // =========================================================================

  // Login: verifies bcrypt hash and returns JWT token
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = sqliteRepo.findUserByEmail(normalizedEmail);

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    const isMatch = verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    // Se senha estiver em texto puro legada, atualizar hash no SQLite
    if (!user.password.startsWith('$2')) {
      const newHash = hashPassword(password);
      sqliteRepo.updateUserPassword(user.email, newHash);
    }

    const restaurant = sqliteRepo.getRestaurant(user.restaurantId || 'rest-sabor-brasa') || sqliteRepo.listRestaurants()[0];

    const token = jwt.sign(
      {
        email: user.email,
        name: user.name,
        role: user.role || 'manager',
        restaurantId: user.restaurantId || restaurant.id,
      },
      ACTIVE_JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Autenticado com sucesso!',
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role || 'manager',
        restaurantId: user.restaurantId || restaurant.id,
        isVerified: true,
      },
      restaurant,
    });
  });

  // Me endpoint: get current authenticated user
  app.get('/api/auth/me', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const user = sqliteRepo.findUserByEmail(authUser.email);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const restaurant = sqliteRepo.getRestaurant(user.restaurantId || 'rest-sabor-brasa') || sqliteRepo.listRestaurants()[0];

    res.json({
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
        isVerified: user.isVerified,
      },
      restaurant,
    });
  });

  // =========================================================================
  // 3. GERENTE: CADASTRO E GESTÃO DE FUNCIONÁRIOS (PROTEGIDO)
  // =========================================================================

  // List all employees of the restaurant (Manager only)
  app.get('/api/users', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';

    const users = sqliteRepo.listUsers(authUser.role === 'admin' ? undefined : restId);
    const employees = users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role || 'manager',
      phone: u.phone,
      createdAt: u.createdAt,
      isVerified: u.isVerified,
    }));

    res.json({ users: employees, total: employees.length });
  });

  // Create new employee (Manager only)
  app.post('/api/users', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { email, name, password, role, phone } = req.body;

    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: 'Nome, e-mail, senha e perfil (cargo) são obrigatórios.' });
    }

    const allowedRoles: UserRole[] = ['garcom', 'kitchen', 'manager'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Perfil inválido. Permitidos: garcom, kitchen, manager.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = sqliteRepo.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um colaborador cadastrado com este e-mail.' });
    }

    const newEmployee = sqliteRepo.createUser({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: hashPassword(password),
      role,
      phone: phone ? phone.trim() : undefined,
      restaurantId: authUser.restaurantId || 'rest-sabor-brasa',
    });

    console.log(`[SQLITE FUNCIONÁRIO] Novo funcionário cadastrado: ${newEmployee.name} (${newEmployee.email}) com perfil ${newEmployee.role}`);

    res.status(201).json({
      success: true,
      message: `Funcionário ${newEmployee.name} cadastrado com sucesso!`,
      user: {
        email: newEmployee.email,
        name: newEmployee.name,
        role: newEmployee.role,
        phone: newEmployee.phone,
        createdAt: newEmployee.createdAt,
      },
    });
  });

  // Delete employee (Manager only)
  app.delete('/api/users/:email', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const targetEmail = req.params.email.trim().toLowerCase();

    if (targetEmail === authUser.email.toLowerCase()) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta enquanto estiver conectado.' });
    }

    const existing = sqliteRepo.findUserByEmail(targetEmail);
    if (!existing) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    sqliteRepo.deleteUser(targetEmail);
    console.log(`[SQLITE FUNCIONÁRIO] Funcionário excluído: ${existing.name} (${existing.email})`);

    res.json({
      success: true,
      message: `Funcionário ${existing.name} excluído com sucesso.`,
    });
  });

  // Alias para /api/employees para compatibilidade com documentação acadêmica e testes
  app.get('/api/employees', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';

    const users = sqliteRepo.listUsers(authUser.role === 'admin' ? undefined : restId);
    const employees = users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role || 'manager',
      phone: u.phone,
      createdAt: u.createdAt,
      isVerified: u.isVerified,
    }));

    res.json({ users: employees, total: employees.length });
  });

  app.post('/api/employees', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { email, name, password, role, phone } = req.body;

    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: 'Nome, e-mail, senha e perfil (cargo) são obrigatórios.' });
    }

    const allowedRoles: UserRole[] = ['garcom', 'kitchen', 'manager'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Perfil inválido. Permitidos: garcom, kitchen, manager.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = sqliteRepo.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um colaborador cadastrado com este e-mail.' });
    }

    const newEmployee = sqliteRepo.createUser({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: hashPassword(password),
      role,
      phone: phone ? phone.trim() : undefined,
      restaurantId: authUser.restaurantId || 'rest-sabor-brasa',
    });

    console.log(`[SQLITE FUNCIONÁRIO] Novo funcionário cadastrado via /api/employees: ${newEmployee.name} (${newEmployee.email})`);

    res.status(201).json({
      success: true,
      message: `Funcionário ${newEmployee.name} cadastrado com sucesso!`,
      user: {
        email: newEmployee.email,
        name: newEmployee.name,
        role: newEmployee.role,
        phone: newEmployee.phone,
        createdAt: newEmployee.createdAt,
      },
    });
  });

  // =========================================================================
  // 4. GERENTE: GESTÃO DE PRODUTOS E CATEGORIAS (PROTEGIDO)
  // =========================================================================

  // Get categories (Garçom, Cozinha e Gerente)
  app.get('/api/categories', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const categories = sqliteRepo.listCategories(restId);
    res.json({ categories });
  });

  // Add category (Manager only)
  app.post('/api/categories', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
    }

    const currentCats = sqliteRepo.listCategories(restId);
    if (currentCats.some((c) => c.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(409).json({ error: 'Esta categoria já existe.' });
    }

    const updated = sqliteRepo.createCategory(name.trim(), restId);
    res.status(201).json({ success: true, categories: updated });
  });

  // Delete category (Manager only)
  app.delete('/api/categories/:name', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const categoryName = decodeURIComponent(req.params.name).trim();

    const currentCats = sqliteRepo.listCategories(restId);
    if (!currentCats.some((c) => c.toLowerCase() === categoryName.toLowerCase())) {
      return res.status(404).json({ error: 'Categoria não encontrada.' });
    }

    const updated = sqliteRepo.deleteCategory(categoryName, restId);
    res.json({ success: true, categories: updated });
  });

  // Get menu products
  app.get('/api/products', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const products = sqliteRepo.listProducts(restId);
    res.json({ products });
  });

  // Add product to menu (Manager only)
  app.post('/api/products', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const { name, description, price, category, imageUrl, prepTimeMinutes } = req.body;

    const numericPrice = Number(price);
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    }

    // Regra de Negócio RN005: Preço deve ser estritamente maior que zero (R$ > 0.00)
    if (price === undefined || price === null || price === '' || isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ error: 'RN005: O preço do produto deve ser estritamente maior que zero (R$ > 0.00).' });
    }

    const newItem = sqliteRepo.createProduct(
      {
        name: name.trim(),
        description: description ? description.trim() : '',
        price: numericPrice,
        category: category ? category.trim() : 'Geral',
        imageUrl: imageUrl ? imageUrl.trim() : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        prepTimeMinutes: Number(prepTimeMinutes) || 12,
        available: true,
      },
      restId
    );

    const allProducts = sqliteRepo.listProducts(restId);
    console.log(`[SQLITE PRODUTO] Novo produto cadastrado: ${newItem.name} (R$ ${newItem.price})`);

    res.status(201).json({ success: true, product: newItem, menu: allProducts });
  });

  // Update product (Manager only)
  app.put('/api/products/:id', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const { id } = req.params;
    const { name, description, price, category, imageUrl, prepTimeMinutes, available } = req.body;

    const existing = sqliteRepo.getProduct(id);
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const updates: Partial<MenuItem> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (price !== undefined) {
      const numericPrice = Number(price);
      // Regra de Negócio RN005: Preço deve ser estritamente maior que zero (R$ > 0.00)
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: 'RN005: O preço do produto deve ser estritamente maior que zero (R$ > 0.00).' });
      }
      updates.price = numericPrice;
    }
    if (category !== undefined) updates.category = category.trim();
    if (imageUrl !== undefined) updates.imageUrl = imageUrl.trim();
    if (prepTimeMinutes !== undefined) updates.prepTimeMinutes = Number(prepTimeMinutes);
    if (available !== undefined) updates.available = Boolean(available);

    const updated = sqliteRepo.updateProduct(id, updates);
    const allProducts = sqliteRepo.listProducts(restId);

    console.log(`[SQLITE PRODUTO] Produto atualizado: ${updated?.name}`);
    res.json({ success: true, product: updated, menu: allProducts });
  });

  // Delete product (Manager only)
  app.delete('/api/products/:id', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const { id } = req.params;

    const existing = sqliteRepo.getProduct(id);
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    sqliteRepo.deleteProduct(id);
    const allProducts = sqliteRepo.listProducts(restId);
    console.log(`[SQLITE PRODUTO] Produto excluído: ${existing.name}`);

    res.json({ success: true, message: `Produto ${existing.name} excluído com sucesso.`, menu: allProducts });
  });

  // =========================================================================
  // 5. MESAS: CADASTRO E CONTROLE (STATUS LIVRE / OCUPADA)
  // =========================================================================

  // List tables (Authenticated: Garçom, Cozinha e Gerente)
  app.get('/api/tables', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = (req.query.restaurantId as string) || authUser.restaurantId || 'rest-sabor-brasa';
    const tables = sqliteRepo.listTables(restId);
    res.json({ tables });
  });

  // Create table (Manager only)
  app.post('/api/tables', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { number, name, capacity, location } = req.body;

    if (!number && !name) {
      return res.status(400).json({ error: 'Número ou identificação da mesa é obrigatório.' });
    }

    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const newTable = sqliteRepo.createTable({
      restaurantId: restId,
      number: number || 0,
      name: name ? name.trim() : `Mesa ${number}`,
      capacity: Number(capacity) || 4,
      location: location ? location.trim() : 'Salão Principal',
      status: 'livre',
    });

    console.log(`[SQLITE MESA] Nova mesa cadastrada: ${newTable.name} (${newTable.id})`);
    res.status(201).json({ success: true, table: newTable });
  });

  // Update table (Manager only - restrito estritamente a dados cadastrais)
  app.put('/api/tables/:id', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const { id } = req.params;
    const existing = sqliteRepo.getTable(id);
    if (!existing) {
      return res.status(404).json({ error: 'Mesa não encontrada.' });
    }

    const { number, name, capacity, location } = req.body;
    const updateData: Partial<RestaurantTable> = {};
    if (name !== undefined) updateData.name = typeof name === 'string' ? name.trim() : existing.name;
    if (capacity !== undefined) updateData.capacity = Number(capacity) || existing.capacity;
    if (location !== undefined) updateData.location = typeof location === 'string' ? location.trim() : existing.location;
    if (number !== undefined) updateData.number = isNaN(Number(number)) ? existing.number : Number(number);

    // Proteção estrita contra bypass (RN004): dados cadastrais não podem alterar o status operacional
    // da mesa nem desvincular comandas ativas. A liberação de mesas ocupadas ocorre estritamente
    // pelo encerramento (/close) ou cancelamento formal do pedido.
    updateData.status = existing.status;
    updateData.currentOrderId = existing.currentOrderId;

    const updated = sqliteRepo.updateTable(id, updateData);
    res.json({ success: true, table: updated });
  });

  // Update table status (Gerente/Admin only - Bloqueia liberação manual se houver atendimento ativo)
  app.put('/api/tables/:id/status', authenticateToken, requireRole(['manager', 'admin', 'owner']), (req, res) => {
    const { id } = req.params;
    const { status, orderId } = req.body;

    if (!status || !['livre', 'ocupada'].includes(status)) {
      return res.status(400).json({ error: 'Status de mesa inválido. Permitidos: livre, ocupada.' });
    }

    const existing = sqliteRepo.getTable(id);
    if (!existing) {
      return res.status(404).json({ error: 'Mesa não encontrada.' });
    }

    // Regra de Salão e Integridade: Impedir liberação manual quando houver comanda ativa vinculada
    if (status === 'livre') {
      const restId = existing.restaurantId || 'rest-sabor-brasa';
      const allOrders = sqliteRepo.listOrders(restId);
      const activeOrder = allOrders.find(
        (o) =>
          (o.tableId === id || o.tableNumber === existing.name || String(o.tableNumber) === String(existing.number)) &&
          !o.closedAt &&
          o.status !== 'Cancelado'
      );
      if (activeOrder || existing.currentOrderId) {
        return res.status(409).json({
          error: `Não é permitido liberar manualmente uma mesa com atendimento ativo (comanda ${activeOrder?.id || existing.currentOrderId}). A mesa deve ser liberada pelo encerramento (/api/orders/:id/close) ou cancelamento da comanda.`,
          activeOrderId: activeOrder?.id || existing.currentOrderId,
        });
      }
    }

    const updated = sqliteRepo.updateTableStatus(id, status, orderId);
    console.log(`[SQLITE MESA STATUS] Mesa ${existing.name || existing.number} alterada para: ${status}`);

    res.json({ success: true, table: updated });
  });

  // Delete table (Manager only)
  app.delete('/api/tables/:id', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const { id } = req.params;
    const existing = sqliteRepo.getTable(id);
    if (!existing) {
      return res.status(404).json({ error: 'Mesa não encontrada.' });
    }

    sqliteRepo.deleteTable(id);
    res.json({ success: true, message: `Mesa excluída com sucesso.` });
  });

  // =========================================================================
  // 6. PEDIDOS & KDS COZINHA (ESTEIRA OPERACIONAL)
  // =========================================================================

  const VALID_STATUSES: OrderStatus[] = ['Recebido', 'Em Preparação', 'Pronto', 'Entregue', 'Cancelado'];

  const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    'Recebido': ['Em Preparação', 'Cancelado'],
    'Em Preparação': ['Pronto', 'Cancelado'],
    'Pronto': ['Entregue'],
    'Entregue': [],
    'Cancelado': [],
  };

  // Get orders list (Filtered by restaurant)
  app.get('/api/orders', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = (req.query.restaurantId as string) || authUser.restaurantId || 'rest-sabor-brasa';
    const orders = sqliteRepo.listOrders(restId);
    res.json({ orders });
  });

  // Get single order by ID
  app.get('/api/orders/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const order = sqliteRepo.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    res.json({ order });
  });

  // Create new order (Garçom and Gerente)
  app.post('/api/orders', authenticateToken, requireRole(['garcom', 'manager', 'admin', 'owner']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const restId = authUser.restaurantId || 'rest-sabor-brasa';
    const restaurant = sqliteRepo.getRestaurant(restId);

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    const { items, customerName, tableId, tableNumber, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'O pedido deve conter ao menos um item selecionado do cardápio.' });
    }

    // REGRA DE SALÃO: Mesa é estritamente obrigatória
    if (!tableId && !tableNumber) {
      return res.status(400).json({
        error: 'A seleção da mesa é obrigatória para abertura de comanda no salão.',
      });
    }

    // Buscar a mesa correspondente
    const allTables = sqliteRepo.listTables(restId);
    const targetTable = allTables.find(
      (t) =>
        (tableId && (t.id === tableId || t.name === tableId || String(t.number) === String(tableId))) ||
        (tableNumber && (String(t.number) === String(tableNumber) || t.name === tableNumber || t.id === tableNumber))
    );

    if (!targetTable) {
      return res.status(404).json({
        error: `A mesa "${tableNumber || tableId}" não foi encontrada no cadastro do restaurante.`,
      });
    }

    // REGRA RN001: Mesa ocupada não pode receber nova comanda ativa
    if (targetTable.status === 'ocupada') {
      return res.status(409).json({
        error: `A ${targetTable.name || `Mesa ${targetTable.number}`} já está ocupada com uma comanda ativa em atendimento. Encerre ou libere a mesa antes de abrir um novo pedido.`,
      });
    }

    // Calcular preço real dos itens a partir do cardápio oficial (RN002 / RN005)
    let calculatedTotal = 0;
    const menuItems = sqliteRepo.listProducts(restId);
    const validatedItems: OrderItem[] = [];

    for (const rawItem of items) {
      const menuItem = menuItems.find((m) => m.id === rawItem.itemId || m.name.toLowerCase() === (rawItem.name || '').toLowerCase());
      if (!menuItem) {
        return res.status(400).json({
          error: `Item "${rawItem.name || rawItem.itemId}" não existe no cardápio do restaurante.`,
        });
      }

      const qty = Math.max(1, Number(rawItem.quantity) || 1);
      const officialPrice = Number(menuItem.price);
      calculatedTotal += officialPrice * qty;

      validatedItems.push({
        itemId: menuItem.id,
        name: menuItem.name,
        price: officialPrice,
        quantity: qty,
        observation: rawItem.observation ? String(rawItem.observation).trim() : undefined,
      });
    }

    const matchedTableId = targetTable.id;
    const matchedTableNumber = targetTable.name || `Mesa ${targetTable.number}`;

    // Gerar identificador sequencial único para o pedido (CMD-XXXX)
    const existingOrders = sqliteRepo.listOrders(restId);
    let maxSeq = 1000;
    for (const o of existingOrders) {
      const match = o.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
    const orderId = `CMD-${maxSeq + 1}`;

    const formattedCustomerName = customerName && String(customerName).trim()
      ? `${matchedTableNumber} (${String(customerName).trim()})`
      : matchedTableNumber;

    const newOrder = sqliteRepo.createOrder(
      {
        orderId,
        restaurantId: restId,
        tableId: matchedTableId,
        tableNumber: matchedTableNumber,
        customerName: formattedCustomerName,
        items: validatedItems,
        total: Number(calculatedTotal.toFixed(2)),
        notes: notes || `Lançado por ${authUser.name || authUser.email}`,
        prepTimeMinutes: 15,
      },
      authUser
    );

    console.log(`[SQLITE COMANDA] Nova comanda ${orderId} aberta na ${matchedTableNumber} | Total R$ ${calculatedTotal.toFixed(2)}`);

    res.status(201).json({
      success: true,
      message: 'Comanda aberta e enviada para a cozinha com sucesso!',
      order: newOrder,
    });
  });

  // Accept order in Kitchen (Moves to 'Em Preparação') - Cozinha e Gerente
  app.post('/api/orders/:id/accept', authenticateToken, requireRole(['kitchen', 'manager', 'admin']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { id } = req.params;
    const order = sqliteRepo.getOrder(id);

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    if (order.status !== 'Recebido') {
      return res.status(400).json({
        error: `Pedido não pode ser aceito na cozinha pois está com status "${order.status}". Aceite permitido apenas para pedidos "Recebido".`,
      });
    }

    const updated = sqliteRepo.acceptOrderInKitchen(id, authUser.name || 'Cozinha');
    console.log(`[SQLITE KDS] Pedido ${id} aceito para preparo na cozinha por ${authUser.name}`);

    res.json({
      success: true,
      message: 'Pedido em preparação na cozinha!',
      order: updated,
    });
  });

  // Update order status (Recebido -> Em Preparação -> Pronto -> Entregue, com Cancelado até Em Preparação)
  app.put('/api/orders/:id/status', authenticateToken, (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { id } = req.params;
    const { status, note } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Permitidos: ${VALID_STATUSES.join(', ')}` });
    }

    const order = sqliteRepo.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    // 1. Validação estrita por perfil de trabalho ANTES de qualquer retorno idempotente
    // Cozinha: apenas 'Em Preparação' e 'Pronto'
    // Garçom: apenas 'Entregue' e 'Cancelado'
    if (authUser.role === 'kitchen') {
      const allowedForKitchen: OrderStatus[] = ['Em Preparação', 'Pronto'];
      if (!allowedForKitchen.includes(status)) {
        return res.status(403).json({
          error: `Perfil Cozinha só pode alterar pedidos para: "Em Preparação" ou "Pronto". Entrega é de responsabilidade do Garçom.`,
        });
      }
    } else if (authUser.role === 'garcom') {
      const allowedForGarcom: OrderStatus[] = ['Entregue', 'Cancelado'];
      if (!allowedForGarcom.includes(status)) {
        return res.status(403).json({
          error: `Perfil Garçom só pode alterar pedidos para: "Entregue" ou "Cancelado". Produção é de responsabilidade da Cozinha.`,
        });
      }
    }

    // Retorno idempotente se o pedido já está no status solicitado (somente após validação de autorização)
    if (order.status === status) {
      return res.json({ success: true, message: `O pedido já está com status ${status}`, order });
    }

    // 2. Validação estrita da máquina de estados
    const allowedNext = ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Transição inválida: Não é permitido alterar o pedido de "${order.status}" para "${status}". Transições permitidas: ${allowedNext.length > 0 ? allowedNext.join(', ') : 'nenhuma (status final)'}.`,
      });
    }

    // Atualizar no banco SQLite
    // REGRA DO SISTEMA: Na entrega ("Entregue") a mesa NÃO é mais liberada;
    // apenas o encerramento do atendimento (POST /api/orders/:id/close) ou cancelamento libera.
    const updated = sqliteRepo.updateOrderStatus(id, status, note, authUser.name || authUser.email, authUser.role);

    console.log(`[SQLITE STATUS] Comanda ${id} atualizada para: ${status} por ${authUser.name}`);

    res.json({
      success: true,
      message: `Status do pedido atualizado para ${status}`,
      order: updated,
    });
  });

  // =========================================================================
  // NOVO: ENCERRAMENTO DO ATENDIMENTO (GARÇOM E GERENTE)
  // Rota: POST /api/orders/:id/close
  // =========================================================================
  app.post('/api/orders/:id/close', authenticateToken, requireRole(['garcom', 'manager', 'admin', 'owner']), (req, res) => {
    const authUser = (req as any).user as AuthenticatedUser;
    const { id } = req.params;

    const order = sqliteRepo.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    // Já encerrado anteriormente
    if (order.closedAt) {
      return res.status(409).json({
        error: 'O atendimento deste pedido já foi encerrado anteriormente.',
        closedAt: order.closedAt,
      });
    }

    // Só aceita pedido com status "Entregue"; caso contrário, erro 400
    if (order.status !== 'Entregue') {
      return res.status(400).json({
        error: `O atendimento só pode ser encerrado para pedidos com status "Entregue". Status atual do pedido: "${order.status}".`,
      });
    }

    try {
      const result = sqliteRepo.closeOrder(id, authUser.name || authUser.email);
      console.log(`[SQLITE ENCERRAMENTO] Atendimento do pedido ${id} encerrado com sucesso por ${authUser.name}`);

      res.json({
        success: true,
        message: 'Atendimento encerrado e mesa liberada com sucesso!',
        order: result.order,
        table: result.table,
      });
    } catch (err: any) {
      if (err.message === 'NOT_DELIVERED') {
        return res.status(400).json({ error: 'Apenas pedidos com status "Entregue" podem ter o atendimento encerrado.' });
      }
      if (err.message === 'ALREADY_CLOSED') {
        return res.status(409).json({ error: 'O atendimento deste pedido já foi encerrado anteriormente.' });
      }
      res.status(500).json({ error: 'Erro ao encerrar atendimento do pedido.' });
    }
  });

  // =========================================================================
  // 7. RESTAURANTS DATA (PROTECTED EDITING)
  // =========================================================================
  app.get('/api/restaurants', (req, res) => {
    const restaurants = sqliteRepo.listRestaurants();
    res.json({ restaurants });
  });

  app.get('/api/restaurants/:id', (req, res) => {
    const { id } = req.params;
    const restaurant = sqliteRepo.getRestaurant(id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }
    res.json({ restaurant });
  });

  // Update restaurant settings (Manager only)
  app.put('/api/restaurants/:id', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    const { id } = req.params;
    const updated = sqliteRepo.updateRestaurant(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Restaurante não encontrado.' });
    }

    res.json({
      success: true,
      message: 'Dados do restaurante atualizados com sucesso!',
      restaurant: updated,
    });
  });

  // Reset database back to default initial state - Protegido exclusivamente para Gerente/Admin
  app.post('/api/seed/reset', authenticateToken, requireRole(['manager', 'admin']), (req, res) => {
    sqliteRepo.resetToInitial();
    console.log('[SQLITE RESET] Banco restaurado para o estado inicial padrão.');

    res.json({
      success: true,
      message: 'Banco de dados restaurado para os dados de demonstração com sucesso!',
    });
  });

  // =========================================================================
  // VITE DEV SERVER / STATIC ASSETS SERVING
  // =========================================================================
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BACKEND SERVER] Rodando na porta ${PORT} com persistência relacional SQLite (WAL Mode)`);
  });
}

startServer().catch((err) => {
  console.error('[BACKEND FATAL] Erro ao inicializar o servidor Express:', err);
  process.exit(1);
});
