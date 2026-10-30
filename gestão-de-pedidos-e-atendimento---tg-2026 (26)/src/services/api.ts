import { User, RestaurantConfig, Order, OrderStatus, RestaurantTable, TableStatus, MenuItem, UserRole } from '../types';
import { INITIAL_RESTAURANTS, INITIAL_ORDERS, INITIAL_USERS, INITIAL_TABLES } from '../data/initialData';

export interface HealthMetrics {
  totalRestaurants: number;
  totalOrders: number;
  activeOrders: number;
  totalUsers: number;
  verifiedUsers: number;
  totalTables?: number;
  occupiedTables?: number;
  freeTables?: number;
}

export interface BackendHealthResponse {
  status: string;
  message: string;
  version: string;
  timestamp: number;
  metrics: HealthMetrics;
}

// Token management in localStorage
let currentToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('tg_auth_token') : null;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  return headers;
}

/**
 * Função segura para decodificar respostas HTTP sem lançar
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 */
async function parseResponseJson<T>(res: Response): Promise<{ success: boolean; data?: T; error?: string; status: number }> {
  const status = res.status;
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return { success: false, status, error: `Servidor retornou corpo vazio (HTTP ${status}).` };
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
      return { success: false, status, error: 'O servidor retornou HTML em vez de JSON (rota de API não encontrada).' };
    }
    const data = JSON.parse(trimmed) as T;
    return { success: res.ok, status, data };
  } catch (err: any) {
    return { success: false, status, error: err?.message || 'Falha ao decodificar JSON.' };
  }
}

// =========================================================================
// ARMAZENAMENTO LOCAL DE CONTINGÊNCIA (PARA HOSPEDAGENS ESTÁTICAS COMO VERCEL)
// =========================================================================

function getLocalStore<T>(key: string, defaultVal: T): T {
  if (typeof localStorage === 'undefined') return defaultVal;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function setLocalStore<T>(key: string, val: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // no-op
  }
}

const LOCAL_USERS_KEY = 'tg_app_users_v3';
const LOCAL_TABLES_KEY = 'tg_app_tables_v3';
const LOCAL_ORDERS_KEY = 'tg_app_orders_v3';
const LOCAL_RESTAURANTS_KEY = 'tg_app_restaurants_v3';
const LOCAL_AUTH_USER_KEY = 'tg_app_current_user_v3';

export const api = {
  // Token handlers
  setToken(token: string | null) {
    currentToken = token;
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('tg_auth_token', token);
      } else {
        localStorage.removeItem('tg_auth_token');
        localStorage.removeItem(LOCAL_AUTH_USER_KEY);
      }
    }
  },

  getToken(): string | null {
    return currentToken;
  },

  // Check backend health
  async checkHealth(): Promise<BackendHealthResponse | null> {
    try {
      const res = await fetch('/api/health');
      const parsed = await parseResponseJson<BackendHealthResponse>(res);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  // Auth: Login
  async login(email: string, password: string): Promise<{ user: User; restaurant: RestaurantConfig; token: string }> {
    const trimmedEmail = email.trim().toLowerCase();

    // 1. Tentar autenticação via servidor Express/SQLite
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const parsed = await parseResponseJson<{ user: User; restaurant: RestaurantConfig; token: string; error?: string }>(res);

      if (parsed.success && parsed.data && parsed.data.token) {
        api.setToken(parsed.data.token);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(parsed.data.user));
        }
        return parsed.data;
      }

      // Se o servidor respondeu com erro explícito de credenciais (ex.: 401)
      if (parsed.status === 401 || (parsed.data && parsed.data.error && parsed.status < 500 && parsed.status !== 404 && parsed.status !== 405)) {
        throw new Error(parsed.data?.error || 'Credenciais inválidas. Verifique seu e-mail e senha.');
      }
    } catch (networkOrApiErr: any) {
      if (networkOrApiErr.message && !networkOrApiErr.message.includes('corpo vazio') && !networkOrApiErr.message.includes('HTML') && !networkOrApiErr.message.includes('Failed to fetch')) {
        throw networkOrApiErr;
      }
    }

    // 2. Fallback de contingência para hospedagem estática (Vercel / GitHub Pages)
    const localUsers = getLocalStore<User[]>(LOCAL_USERS_KEY, INITIAL_USERS);
    const matched = localUsers.find((u) => u.email.toLowerCase() === trimmedEmail);

    if (matched) {
      const demoPasswords: Record<string, string> = {
        'garcom@saborbrasa.com': 'Garcom@2026',
        'cozinha@saborbrasa.com': 'Cozinha@2026',
        'gerente@saborbrasa.com': 'Gerente@2026',
        'admin@admin.com': 'Admin@2026',
        'leonardo@email.com': 'Gerente@2026',
      };
      const expected = demoPasswords[matched.email.toLowerCase()];
      const isPasswordValid = expected ? password === expected : true;

      if (isPasswordValid) {
        const fallbackToken = `tg_demo_token_${matched.role}_${Date.now()}`;
        api.setToken(fallbackToken);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(matched));
        }
        const restaurants = getLocalStore<RestaurantConfig[]>(LOCAL_RESTAURANTS_KEY, INITIAL_RESTAURANTS);
        return {
          user: matched,
          restaurant: restaurants[0] || INITIAL_RESTAURANTS[0],
          token: fallbackToken,
        };
      }
    }

    throw new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
  },

  // Auth: Me
  async getMe(): Promise<{ user: User; restaurant: RestaurantConfig } | null> {
    if (!currentToken) return null;

    try {
      const res = await fetch('/api/auth/me', {
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ user: User; restaurant: RestaurantConfig }>(res);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
    } catch {
      // fallback
    }

    // Fallback: restaurar usuário salvo localmente
    if (typeof localStorage !== 'undefined') {
      const savedUserRaw = localStorage.getItem(LOCAL_AUTH_USER_KEY);
      if (savedUserRaw) {
        try {
          const user = JSON.parse(savedUserRaw) as User;
          const restaurants = getLocalStore<RestaurantConfig[]>(LOCAL_RESTAURANTS_KEY, INITIAL_RESTAURANTS);
          return { user, restaurant: restaurants[0] || INITIAL_RESTAURANTS[0] };
        } catch {
          // no-op
        }
      }
    }

    return null;
  },

  // Employees (Funcionários) - Gerente only
  async listEmployees(): Promise<User[]> {
    try {
      const res = await fetch('/api/users', {
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ users?: User[] }>(res);
      if (parsed.success && parsed.data?.users) {
        return parsed.data.users;
      }
    } catch {
      // fallback
    }
    return getLocalStore<User[]>(LOCAL_USERS_KEY, INITIAL_USERS);
  },

  async createEmployee(employeeData: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
  }): Promise<User> {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(employeeData),
      });

      const parsed = await parseResponseJson<{ user?: User; error?: string }>(res);
      if (parsed.success && parsed.data?.user) {
        return parsed.data.user;
      }
      if (parsed.data?.error && parsed.status === 400) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    // Fallback de contingência para ambiente estático
    const users = getLocalStore<User[]>(LOCAL_USERS_KEY, INITIAL_USERS);
    const existing = users.find((u) => u.email.toLowerCase() === employeeData.email.trim().toLowerCase());
    if (existing) {
      throw new Error('E-mail já cadastrado no sistema.');
    }

    const newUser: User = {
      email: employeeData.email.trim().toLowerCase(),
      name: employeeData.name.trim(),
      role: employeeData.role,
      phone: employeeData.phone,
      restaurantId: 'rest-sabor-brasa',
      isVerified: true,
    };
    users.push(newUser);
    setLocalStore(LOCAL_USERS_KEY, users);
    return newUser;
  },

  async deleteEmployee(email: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ success?: boolean; error?: string }>(res);
      if (parsed.success) return true;
      if (parsed.data?.error && parsed.status === 400) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const users = getLocalStore<User[]>(LOCAL_USERS_KEY, INITIAL_USERS);
    const filtered = users.filter((u) => u.email.toLowerCase() !== email.toLowerCase());
    setLocalStore(LOCAL_USERS_KEY, filtered);
    return true;
  },

  // Products & Menu (Produtos do Cardápio) - Gerente only
  async createProduct(productData: Partial<MenuItem>): Promise<MenuItem> {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(productData),
      });
      const parsed = await parseResponseJson<{ product?: MenuItem; error?: string }>(res);
      if (parsed.success && parsed.data?.product) {
        return parsed.data.product;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      name: productData.name || 'Novo Produto',
      description: productData.description || '',
      price: productData.price || 0,
      category: productData.category || 'Geral',
      prepTimeMinutes: productData.prepTimeMinutes || 15,
      imageUrl: productData.imageUrl || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
      available: productData.available ?? true,
    };
    return newItem;
  },

  async updateProduct(id: string, productData: Partial<MenuItem>): Promise<MenuItem> {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(productData),
      });
      const parsed = await parseResponseJson<{ product?: MenuItem; error?: string }>(res);
      if (parsed.success && parsed.data?.product) {
        return parsed.data.product;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    return {
      id,
      name: productData.name || '',
      description: productData.description || '',
      price: productData.price || 0,
      category: productData.category || 'Geral',
      prepTimeMinutes: productData.prepTimeMinutes || 15,
      available: productData.available ?? true,
    } as MenuItem;
  },

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ success?: boolean; error?: string }>(res);
      if (parsed.success) return true;
      if (parsed.data?.error) throw new Error(parsed.data.error);
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }
    return true;
  },

  // Categories (Categorias do Cardápio) - Gerente only
  async getCategories(): Promise<string[]> {
    try {
      const res = await fetch('/api/categories', {
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ categories?: string[] }>(res);
      if (parsed.success && parsed.data?.categories) {
        return parsed.data.categories;
      }
    } catch {
      // fallback
    }
    return ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas'];
  },

  async createCategory(name: string): Promise<string[]> {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name }),
      });
      const parsed = await parseResponseJson<{ categories?: string[]; error?: string }>(res);
      if (parsed.success && parsed.data?.categories) {
        return parsed.data.categories;
      }
      if (parsed.data?.error) throw new Error(parsed.data.error);
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }
    return ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas', name];
  },

  async deleteCategory(name: string): Promise<string[]> {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ categories?: string[]; error?: string }>(res);
      if (parsed.success && parsed.data?.categories) {
        return parsed.data.categories;
      }
      if (parsed.data?.error) throw new Error(parsed.data.error);
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }
    return ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas'].filter((c) => c !== name);
  },

  // Orders: Fetch all orders
  async getOrders(restaurantId?: string): Promise<Order[]> {
    try {
      const url = restaurantId ? `/api/orders?restaurantId=${restaurantId}` : '/api/orders';
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ orders?: Order[] }>(res);
      if (parsed.success && parsed.data?.orders) {
        return parsed.data.orders;
      }
    } catch {
      // fallback
    }
    return getLocalStore<Order[]>(LOCAL_ORDERS_KEY, INITIAL_ORDERS);
  },

  // Orders: Place / Create new order
  async createOrder(orderData: Partial<Order>): Promise<Order> {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(orderData),
      });

      const parsed = await parseResponseJson<{ order?: Order; error?: string }>(res);
      if (parsed.success && parsed.data?.order) {
        return parsed.data.order;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    // Fallback local
    const orders = getLocalStore<Order[]>(LOCAL_ORDERS_KEY, INITIAL_ORDERS);
    const newOrder: Order = {
      id: `CMD-${1080 + orders.length + 1}`,
      restaurantId: orderData.restaurantId || 'rest-sabor-brasa',
      restaurantName: 'Sabor & Brasa',
      items: orderData.items || [],
      total: orderData.total || 0,
      status: 'Recebido',
      timestamp: Date.now(),
      customerName: orderData.customerName || 'Mesa Balcão',
      tableId: orderData.tableId,
      tableNumber: orderData.tableNumber,
      prepTimeMinutes: orderData.prepTimeMinutes || 15,
      statusHistory: [{ status: 'Recebido', timestamp: Date.now(), note: 'Comanda criada no salão' }],
    };
    orders.unshift(newOrder);
    setLocalStore(LOCAL_ORDERS_KEY, orders);

    // Marcar mesa local como ocupada
    if (orderData.tableId) {
      const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
      const updatedTables = tables.map((t) =>
        t.id === orderData.tableId ? { ...t, status: 'ocupada' as TableStatus, currentOrderId: newOrder.id } : t
      );
      setLocalStore(LOCAL_TABLES_KEY, updatedTables);
    }

    return newOrder;
  },

  // Orders: Accept order in kitchen (KDS)
  async acceptOrder(orderId: string): Promise<Order> {
    try {
      const res = await fetch(`/api/orders/${orderId}/accept`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      const parsed = await parseResponseJson<{ order?: Order; error?: string }>(res);
      if (parsed.success && parsed.data?.order) {
        return parsed.data.order;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    return this.updateOrderStatus(orderId, 'Em Preparação', 'Aceito pela cozinha');
  },

  // Orders: Update status (Recebido, Em Preparação, Pronto, Entregue, Cancelado)
  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<Order> {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, note }),
      });

      const parsed = await parseResponseJson<{ order?: Order; error?: string }>(res);
      if (parsed.success && parsed.data?.order) {
        return parsed.data.order;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const orders = getLocalStore<Order[]>(LOCAL_ORDERS_KEY, INITIAL_ORDERS);
    let targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) {
      throw new Error('Pedido não encontrado.');
    }

    targetOrder.status = status;
    targetOrder.statusHistory = [
      ...(targetOrder.statusHistory || []),
      { status, timestamp: Date.now(), note: note || `Atualizado para ${status}` },
    ];
    setLocalStore(LOCAL_ORDERS_KEY, orders);
    return targetOrder;
  },

  // Orders: Close order attendance (Garçom e Gerente) - Libera mesa e registra encerramento
  async closeOrder(orderId: string): Promise<{ success: boolean; message: string; order: Order; table?: RestaurantTable }> {
    try {
      const res = await fetch(`/api/orders/${orderId}/close`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      const parsed = await parseResponseJson<{ success: boolean; message: string; order: Order; table?: RestaurantTable; error?: string }>(res);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const orders = getLocalStore<Order[]>(LOCAL_ORDERS_KEY, INITIAL_ORDERS);
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error('Pedido não encontrado.');
    }
    order.closedAt = Date.now();
    setLocalStore(LOCAL_ORDERS_KEY, orders);

    if (order.tableId) {
      const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
      const updatedTables = tables.map((t) =>
        t.id === order.tableId ? { ...t, status: 'livre' as TableStatus, currentOrderId: undefined } : t
      );
      setLocalStore(LOCAL_TABLES_KEY, updatedTables);
      const liberatedTable = updatedTables.find((t) => t.id === order.tableId);
      return { success: true, message: 'Comanda encerrada e mesa liberada.', order, table: liberatedTable };
    }

    return { success: true, message: 'Comanda encerrada com sucesso.', order };
  },

  // Restaurants: Fetch list
  async getRestaurants(): Promise<RestaurantConfig[]> {
    try {
      const res = await fetch('/api/restaurants');
      const parsed = await parseResponseJson<{ restaurants?: RestaurantConfig[] }>(res);
      if (parsed.success && parsed.data?.restaurants) {
        return parsed.data.restaurants;
      }
    } catch {
      // fallback
    }
    return getLocalStore<RestaurantConfig[]>(LOCAL_RESTAURANTS_KEY, INITIAL_RESTAURANTS);
  },

  // Restaurants: Update settings
  async updateRestaurant(restaurant: RestaurantConfig): Promise<RestaurantConfig> {
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(restaurant),
      });

      const parsed = await parseResponseJson<{ restaurant?: RestaurantConfig; error?: string }>(res);
      if (parsed.success && parsed.data?.restaurant) {
        return parsed.data.restaurant;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const list = getLocalStore<RestaurantConfig[]>(LOCAL_RESTAURANTS_KEY, INITIAL_RESTAURANTS);
    const updatedList = list.map((r) => (r.id === restaurant.id ? restaurant : r));
    setLocalStore(LOCAL_RESTAURANTS_KEY, updatedList);
    return restaurant;
  },

  // Tables / Mesas: Fetch all tables
  async getTables(restaurantId?: string): Promise<RestaurantTable[]> {
    try {
      const url = restaurantId ? `/api/tables?restaurantId=${restaurantId}` : '/api/tables';
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ tables?: RestaurantTable[] }>(res);
      if (parsed.success && parsed.data?.tables) {
        return parsed.data.tables;
      }
    } catch {
      // fallback
    }
    return getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
  },

  // Tables: Create new table
  async createTable(tableData: Partial<RestaurantTable>): Promise<RestaurantTable> {
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(tableData),
      });
      const parsed = await parseResponseJson<{ table?: RestaurantTable; error?: string }>(res);
      if (parsed.success && parsed.data?.table) {
        return parsed.data.table;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
    const newTable: RestaurantTable = {
      id: `mesa-${Date.now()}`,
      restaurantId: tableData.restaurantId || 'rest-sabor-brasa',
      number: tableData.number || tables.length + 1,
      name: tableData.name || `Mesa ${tables.length + 1}`,
      capacity: tableData.capacity || 4,
      status: 'livre',
      location: tableData.location || 'Salão Principal',
      updatedAt: Date.now(),
    };
    tables.push(newTable);
    setLocalStore(LOCAL_TABLES_KEY, tables);
    return newTable;
  },

  // Tables: Update table
  async updateTable(id: string, tableData: Partial<RestaurantTable>): Promise<RestaurantTable> {
    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(tableData),
      });
      const parsed = await parseResponseJson<{ table?: RestaurantTable; error?: string }>(res);
      if (parsed.success && parsed.data?.table) {
        return parsed.data.table;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
    const target = tables.find((t) => t.id === id);
    if (!target) throw new Error('Mesa não encontrada.');
    if (tableData.name) target.name = tableData.name;
    if (tableData.capacity) target.capacity = tableData.capacity;
    if (tableData.location) target.location = tableData.location;
    target.updatedAt = Date.now();
    setLocalStore(LOCAL_TABLES_KEY, tables);
    return target;
  },

  // Tables: Quick update status ('livre' | 'ocupada')
  async updateTableStatus(id: string, status: TableStatus, orderId?: string): Promise<RestaurantTable> {
    try {
      const res = await fetch(`/api/tables/${id}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, orderId }),
      });
      const parsed = await parseResponseJson<{ table?: RestaurantTable; error?: string }>(res);
      if (parsed.success && parsed.data?.table) {
        return parsed.data.table;
      }
      if (parsed.data?.error) {
        throw new Error(parsed.data.error);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
    const target = tables.find((t) => t.id === id);
    if (!target) throw new Error('Mesa não encontrada.');
    target.status = status;
    target.currentOrderId = status === 'livre' ? undefined : orderId || target.currentOrderId;
    target.updatedAt = Date.now();
    setLocalStore(LOCAL_TABLES_KEY, tables);
    return target;
  },

  // Tables: Delete table
  async deleteTable(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const parsed = await parseResponseJson<{ success?: boolean; error?: string }>(res);
      if (parsed.success) return true;
      if (parsed.data?.error) throw new Error(parsed.data.error);
    } catch (err: any) {
      if (err.message && !err.message.includes('corpo vazio') && !err.message.includes('HTML') && !err.message.includes('Failed to fetch')) {
        throw err;
      }
    }

    const tables = getLocalStore<RestaurantTable[]>(LOCAL_TABLES_KEY, INITIAL_TABLES);
    const filtered = tables.filter((t) => t.id !== id);
    setLocalStore(LOCAL_TABLES_KEY, filtered);
    return true;
  },

  // Database Reset
  async resetDatabase(): Promise<boolean> {
    try {
      const res = await fetch('/api/seed/reset', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },
};
