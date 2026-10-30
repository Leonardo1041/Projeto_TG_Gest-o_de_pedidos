import { User, RestaurantConfig, Order, OrderStatus, RestaurantTable, TableStatus, MenuItem, UserRole } from '../types';

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

export const api = {
  // Token handlers
  setToken(token: string | null) {
    currentToken = token;
    if (token) {
      localStorage.setItem('tg_auth_token', token);
    } else {
      localStorage.removeItem('tg_auth_token');
    }
  },

  getToken(): string | null {
    return currentToken;
  },

  // Check backend health
  async checkHealth(): Promise<BackendHealthResponse | null> {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Backend healthcheck fallback:', e);
      return null;
    }
  },

  // Auth: Login
  async login(email: string, password: string): Promise<{ user: User; restaurant: RestaurantConfig; token: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Credenciais inválidas. Verifique seu e-mail e senha.');
    }

    if (data.token) {
      api.setToken(data.token);
    }

    return data;
  },

  // Auth: Me
  async getMe(): Promise<{ user: User; restaurant: RestaurantConfig } | null> {
    if (!currentToken) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Employees (Funcionários) - Gerente only
  async listEmployees(): Promise<User[]> {
    try {
      const res = await fetch('/api/users', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.users || [];
    } catch {
      return [];
    }
  },

  async createEmployee(employeeData: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
  }): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(employeeData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao cadastrar funcionário.');
    }
    return data.user;
  },

  async deleteEmployee(email: string): Promise<boolean> {
    const res = await fetch(`/api/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao excluir funcionário.');
    }
    return true;
  },

  // Products & Menu (Produtos do Cardápio) - Gerente only
  async createProduct(productData: Partial<MenuItem>): Promise<MenuItem> {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(productData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao cadastrar produto.');
    }
    return data.product;
  },

  async updateProduct(id: string, productData: Partial<MenuItem>): Promise<MenuItem> {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(productData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar produto.');
    }
    return data.product;
  },

  async deleteProduct(id: string): Promise<boolean> {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao excluir produto.');
    }
    return true;
  },

  // Categories (Categorias do Cardápio) - Gerente only
  async getCategories(): Promise<string[]> {
    try {
      const res = await fetch('/api/categories', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.categories || [];
    } catch {
      return [];
    }
  },

  async createCategory(name: string): Promise<string[]> {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao cadastrar categoria.');
    }
    return data.categories || [];
  },

  async deleteCategory(name: string): Promise<string[]> {
    const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao excluir categoria.');
    }
    return data.categories || [];
  },

  // Orders: Fetch all orders
  async getOrders(restaurantId?: string): Promise<Order[]> {
    try {
      const url = restaurantId ? `/api/orders?restaurantId=${restaurantId}` : '/api/orders';
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.orders || [];
    } catch {
      return [];
    }
  },

  // Orders: Place / Create new order
  async createOrder(orderData: Partial<Order>): Promise<Order> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(orderData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao abrir comanda.');
    }
    return data.order;
  },

  // Orders: Accept order in kitchen (KDS)
  async acceptOrder(orderId: string): Promise<Order> {
    const res = await fetch(`/api/orders/${orderId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao aceitar pedido na cozinha.');
    }
    return data.order;
  },

  // Orders: Update status (Recebido, Em Preparação, Pronto, Entregue, Cancelado)
  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<Order> {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, note }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar status do pedido.');
    }
    return data.order;
  },

  // Orders: Close order attendance (Garçom e Gerente) - Libera mesa e registra encerramento
  async closeOrder(orderId: string): Promise<{ success: boolean; message: string; order: Order; table?: RestaurantTable }> {
    const res = await fetch(`/api/orders/${orderId}/close`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao encerrar atendimento do pedido.');
    }
    return data;
  },

  // Restaurants: Fetch list
  async getRestaurants(): Promise<RestaurantConfig[]> {
    try {
      const res = await fetch('/api/restaurants');
      if (!res.ok) return [];
      const data = await res.json();
      return data.restaurants || [];
    } catch {
      return [];
    }
  },

  // Restaurants: Update settings
  async updateRestaurant(restaurant: RestaurantConfig): Promise<RestaurantConfig> {
    const res = await fetch(`/api/restaurants/${restaurant.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(restaurant),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar dados do restaurante.');
    }
    return data.restaurant;
  },

  // Tables / Mesas: Fetch all tables
  async getTables(restaurantId?: string): Promise<RestaurantTable[]> {
    try {
      const url = restaurantId ? `/api/tables?restaurantId=${restaurantId}` : '/api/tables';
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.tables || [];
    } catch {
      return [];
    }
  },

  // Tables: Create new table
  async createTable(tableData: Partial<RestaurantTable>): Promise<RestaurantTable> {
    const res = await fetch('/api/tables', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(tableData),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao cadastrar mesa no servidor.');
    }
    return data.table;
  },

  // Tables: Update table
  async updateTable(id: string, tableData: Partial<RestaurantTable>): Promise<RestaurantTable> {
    const res = await fetch(`/api/tables/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(tableData),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar mesa.');
    }
    return data.table;
  },

  // Tables: Quick update status ('livre' | 'ocupada')
  async updateTableStatus(id: string, status: TableStatus, orderId?: string): Promise<RestaurantTable> {
    const res = await fetch(`/api/tables/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, orderId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao alterar status da mesa.');
    }
    return data.table;
  },

  // Tables: Delete table
  async deleteTable(id: string): Promise<boolean> {
    const res = await fetch(`/api/tables/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
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
