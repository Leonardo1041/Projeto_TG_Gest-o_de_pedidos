import React, { useState, useEffect } from 'react';
import { ViewMode, User, RestaurantConfig, Order, OrderStatus, RestaurantTable, TableStatus } from './types';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/Dashboard';
import { WaiterOrdersPage } from './components/WaiterOrdersPage';
import { KitchenKDSPage } from './components/KitchenKDSPage';
import { INITIAL_RESTAURANTS, INITIAL_ORDERS, INITIAL_USERS, INITIAL_TABLES } from './data/initialData';
import { api, BackendHealthResponse } from './services/api';

export default function App() {
  // Current View - defaults to login for staff
  const [currentView, setCurrentView] = useState<ViewMode>('login');

  // Backend connection status
  const [backendHealth, setBackendHealth] = useState<BackendHealthResponse | null>(null);

  // Core App State (Servidor é a única fonte de verdade)
  const [restaurants, setRestaurants] = useState<RestaurantConfig[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Current active restaurant
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantConfig>(() => {
    return INITIAL_RESTAURANTS[0];
  });

  // Logged-in user
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Fetch initial data from backend and restore session
  useEffect(() => {
    const initBackend = async () => {
      try {
        const health = await api.checkHealth();
        if (health) {
          setBackendHealth(health);
        }

        // Try restoring user session via token
        const meRes = await api.getMe();
        if (meRes && meRes.user) {
          setCurrentUser(meRes.user);
          if (meRes.restaurant) setSelectedRestaurant(meRes.restaurant);
          navigateByRole(meRes.user.role);
        }

        const [serverRest, serverOrdersList, serverTablesList] = await Promise.all([
          api.getRestaurants(),
          api.getOrders(),
          api.getTables(),
        ]);

        if (serverRest && serverRest.length > 0) {
          setRestaurants(serverRest);
          setSelectedRestaurant(serverRest[0]);
        }

        if (serverOrdersList && serverOrdersList.length > 0) {
          setOrders(serverOrdersList);
        }

        if (serverTablesList && serverTablesList.length > 0) {
          setTables(serverTablesList);
        }
      } catch (err) {
        console.warn('Could not sync initial data with backend, using local store', err);
      }
    };

    initBackend();

    // Background polling every 3.5 seconds for real-time synchronization between clients and backend
    const syncInterval = setInterval(async () => {
      try {
        const [serverOrdersList, serverRestList, serverTablesList, health] = await Promise.all([
          api.getOrders(),
          api.getRestaurants(),
          api.getTables(),
          api.checkHealth(),
        ]);

        if (serverOrdersList && serverOrdersList.length > 0) {
          setOrders(serverOrdersList);
        }

        if (serverTablesList && serverTablesList.length > 0) {
          setTables(serverTablesList);
        }

        if (serverRestList && serverRestList.length > 0) {
          setRestaurants(serverRestList);
          setSelectedRestaurant((prev) => {
            const fresh = serverRestList.find((r) => r.id === prev.id);
            return fresh || prev;
          });
        }

        if (health) {
          setBackendHealth(health);
        }
      } catch (err) {
        // silent sync fallback
      }
    }, 3500);

    return () => clearInterval(syncInterval);
  }, []);

  // Listener para navegação programática em testes e demonstração
  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail && ['login', 'waiter_orders', 'kitchen_kds', 'admin'].includes(e.detail)) {
        setCurrentView(e.detail as ViewMode);
      }
    };
    window.addEventListener('navigate-view', handleNav);
    return () => window.removeEventListener('navigate-view', handleNav);
  }, []);

  // Route user to the appropriate screen based on their profile role
  const navigateByRole = (role?: string) => {
    if (role === 'garcom') {
      setCurrentView('waiter_orders');
    } else if (role === 'kitchen') {
      setCurrentView('kitchen_kds');
    } else {
      // manager, owner, admin
      setCurrentView('admin');
    }
  };

  // Redireciona para o login caso não haja usuário autenticado
  useEffect(() => {
    if (!currentUser && currentView !== 'login') {
      setCurrentView('login');
    }
  }, [currentUser, currentView]);

  // Handlers with Back-end Express calls
  const handleLogin = (user: User, restaurant?: RestaurantConfig) => {
    setCurrentUser(user);
    if (restaurant) {
      setSelectedRestaurant(restaurant);
    } else {
      const found = restaurants.find(
        (r) => r.ownerEmail.toLowerCase() === user.email.toLowerCase() || r.id === user.restaurantId
      );
      if (found) {
        setSelectedRestaurant(found);
      }
    }

    navigateByRole(user.role);
  };

  const handleUpdateRestaurant = async (updated: RestaurantConfig) => {
    try {
      await api.updateRestaurant(updated);
    } catch (e) {
      console.warn('Backend update restaurant fallback:', e);
    }

    setRestaurants((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
    setSelectedRestaurant(updated);
  };

  // Status update with backend call (Recebido, Em Preparação, Pronto, Entregue, Cancelado)
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus, note?: string) => {
    let updatedOrder: Order | undefined;
    try {
      updatedOrder = await api.updateOrderStatus(orderId, status, note);
    } catch (e: any) {
      console.error('Backend update order status error:', e);
      alert(e.message || 'Erro ao atualizar status do pedido no servidor');
      return;
    }

    const orderToUse = updatedOrder || orders.find((o) => o.id === orderId);

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          return updatedOrder ? updatedOrder : { ...o, status };
        }
        return o;
      })
    );

    // REGRA DE SALÃO: Apenas o Cancelamento ou o Encerramento explícito libera a mesa.
    // Na entrega ("Entregue") a mesa permanece ocupada enquanto o cliente consome no salão.
    if (status === 'Cancelado') {
      setTables((prev) =>
        prev.map((t) =>
          t.currentOrderId === orderId || (orderToUse && orderToUse.tableId && t.id === orderToUse.tableId)
            ? { ...t, status: 'livre', currentOrderId: undefined, updatedAt: Date.now() }
            : t
        )
      );
    }
  };

  // Encerramento do atendimento (Garçom e Gerente) - POST /api/orders/:id/close
  const handleCloseOrder = async (orderId: string) => {
    try {
      const res = await api.closeOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.order : o)));

      // Liberar a mesa vinculada
      if (res.table) {
        setTables((prev) => prev.map((t) => (t.id === res.table!.id ? res.table! : t)));
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.currentOrderId === orderId || (res.order.tableId && t.id === res.order.tableId)
              ? { ...t, status: 'livre', currentOrderId: undefined, updatedAt: Date.now() }
              : t
          )
        );
      }
      return res.order;
    } catch (e: any) {
      console.error('Backend close order error:', e);
      alert(e.message || 'Erro ao encerrar atendimento da comanda.');
      throw e;
    }
  };

  // Direct Accept Order (Kitchen action)
  const handleAcceptOrder = async (orderId: string) => {
    try {
      const updated = await api.acceptOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch (e: any) {
      console.error('Backend accept order error:', e);
      alert(e.message || 'Erro ao aceitar pedido na cozinha.');
    }
  };

  // Create order with server-side persistence and table occupation
  const handlePlaceOrder = async (newOrder: Order) => {
    try {
      const created = await api.createOrder(newOrder);
      setOrders((prev) => [created, ...prev]);

      // Ocupar a mesa no estado do app
      if (created.tableId || created.tableNumber) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === created.tableId || (created.tableNumber && (t.name === created.tableNumber || String(t.number) === String(created.tableNumber)))
              ? { ...t, status: 'ocupada', currentOrderId: created.id, updatedAt: Date.now() }
              : t
          )
        );
      }
      return created;
    } catch (e: any) {
      console.error('Backend place order error:', e);
      alert(e.message || 'Erro ao abrir comanda no servidor.');
      throw e;
    }
  };

  // Table Management Handlers
  const handleCreateTable = async (tableData: Partial<RestaurantTable>) => {
    try {
      const created = await api.createTable({
        ...tableData,
        restaurantId: tableData.restaurantId || selectedRestaurant.id,
      });
      setTables((prev) => [...prev, created]);
      return created;
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar mesa');
      throw err;
    }
  };

  const handleUpdateTable = async (id: string, tableData: Partial<RestaurantTable>) => {
    try {
      const updated = await api.updateTable(id, tableData);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar mesa');
      throw err;
    }
  };

  const handleUpdateTableStatus = async (id: string, status: TableStatus, orderId?: string) => {
    try {
      const updated = await api.updateTableStatus(id, status, orderId);
      setTables((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err) {
      console.warn('Fallback local table status update:', err);
      setTables((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, status, currentOrderId: status === 'livre' ? undefined : (orderId || t.currentOrderId), updatedAt: Date.now() }
            : t
        )
      );
    }
  };

  const handleDeleteTable = async (id: string) => {
    try {
      await api.deleteTable(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir mesa');
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setCurrentUser(null);
    setCurrentView('login');
  };

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 selection:bg-rose-500 selection:text-white font-sans flex flex-col justify-between">
      <div className="flex-1 flex flex-col">
        {/* Se não houver usuário logado ou a view for login, renderizar estritamente o Login */}
        {!currentUser || currentView === 'login' ? (
          <LoginPage
            onNavigate={setCurrentView}
            onLogin={handleLogin}
            users={users.length > 0 ? users : INITIAL_USERS}
            restaurants={restaurants.length > 0 ? restaurants : [INITIAL_RESTAURANTS[0]]}
          />
        ) : (
          <>
            {/* Módulo do Garçom: Lançamento de Pedidos & Comandas */}
            {currentView === 'waiter_orders' && (
              <WaiterOrdersPage
                user={currentUser}
                restaurant={selectedRestaurant}
                orders={orders}
                tables={tables}
                onPlaceOrder={handlePlaceOrder}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onUpdateTableStatus={handleUpdateTableStatus}
                onCloseOrder={handleCloseOrder}
                onNavigate={setCurrentView}
                onLogout={handleLogout}
              />
            )}

            {/* Módulo da Cozinha: Kitchen Display System (KDS) */}
            {currentView === 'kitchen_kds' && (
              <KitchenKDSPage
                user={currentUser}
                restaurant={selectedRestaurant}
                orders={orders}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onAcceptOrder={handleAcceptOrder}
                onNavigate={setCurrentView}
                onLogout={handleLogout}
              />
            )}

            {/* Painel Administrativo do Gerente */}
            {currentView === 'admin' && (
              <Dashboard
                user={currentUser}
                restaurant={selectedRestaurant}
                onUpdateRestaurant={handleUpdateRestaurant}
                orders={orders}
                tables={tables}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onCloseOrder={handleCloseOrder}
                onCreateTable={handleCreateTable}
                onUpdateTable={handleUpdateTable}
                onUpdateTableStatus={handleUpdateTableStatus}
                onDeleteTable={handleDeleteTable}
                onNavigate={setCurrentView}
                onLogout={handleLogout}
                users={users}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
