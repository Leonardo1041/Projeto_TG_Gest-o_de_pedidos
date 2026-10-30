import React, { useState } from 'react';
import { ViewMode, User, RestaurantConfig, Order, OrderItem, MenuItem, RestaurantTable, TableStatus } from '../types';
import { INITIAL_TABLES } from '../data/initialData';
import {
  UtensilsCrossed,
  Plus,
  Minus,
  Trash2,
  Send,
  Clock,
  ChefHat,
  Bell,
  CheckCircle2,
  Search,
  Filter,
  DollarSign,
  Coffee,
  Pizza,
  Flame,
  LogOut,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Eye,
  Check,
  RotateCcw,
  Users,
  FileText
} from 'lucide-react';

interface WaiterOrdersPageProps {
  user: User;
  restaurant: RestaurantConfig;
  orders: Order[];
  tables?: RestaurantTable[];
  onPlaceOrder: (order: Order) => Promise<Order | void> | void;
  onUpdateOrderStatus: (orderId: string, status: any, note?: string) => Promise<void> | void;
  onCloseOrder?: (orderId: string) => Promise<any> | void;
  onUpdateTableStatus?: (tableId: string, status: TableStatus) => void;
  onNavigate: (view: ViewMode) => void;
  onLogout: () => void;
}

interface CartItemData {
  quantity: number;
  observation: string;
}

export const WaiterOrdersPage: React.FC<WaiterOrdersPageProps> = ({
  user,
  restaurant,
  orders,
  tables = [],
  onPlaceOrder,
  onUpdateOrderStatus,
  onCloseOrder,
  onUpdateTableStatus,
  onNavigate,
  onLogout,
}) => {
  // Registered tables for this restaurant
  const restaurantTables: RestaurantTable[] = (tables && tables.length > 0)
    ? tables.filter((t) => t.restaurantId === restaurant.id)
    : INITIAL_TABLES.filter((t) => t.restaurantId === restaurant.id);

  // Order entry form state
  const [selectedTableId, setSelectedTableId] = useState<string>(restaurantTables[0]?.id || 'mesa-01');
  const selectedTable = restaurantTables.find((t) => t.id === selectedTableId) || restaurantTables[0];
  const selectedTableLabel = selectedTable ? (selectedTable.name || `Mesa ${selectedTable.number}`) : 'Mesa 01';

  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartItems, setCartItems] = useState<Record<string, CartItemData>>({});
  
  // Menu navigation state
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'launch' | 'active_orders'>('launch');
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filter restaurant orders
  const restaurantOrders = orders.filter((o) => o.restaurantId === restaurant.id);

  // Active orders (still in attendance: Recebido, Em Preparação, Pronto, Entregue sem encerramento)
  const activeOrders = restaurantOrders.filter(
    (o) => o.status !== 'Cancelado' && !o.closedAt
  );

  // Orders ready to be served to tables!
  const readyToServeOrders = restaurantOrders.filter((o) => o.status === 'Pronto');

  // Orders delivered awaiting closure
  const deliveredAwaitingClosure = restaurantOrders.filter(
    (o) => o.status === 'Entregue' && !o.closedAt
  );

  // Categories from restaurant menu
  const categories = ['todos', ...Array.from(new Set(restaurant.menu.map((m) => m.category || 'Geral')))];

  // Filter menu items
  const filteredMenuItems = restaurant.menu.filter((item) => {
    const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Cart operations
  const handleAddItem = (item: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev[item.id];
      if (existing) {
        return {
          ...prev,
          [item.id]: { ...existing, quantity: existing.quantity + 1 },
        };
      }
      return {
        ...prev,
        [item.id]: { quantity: 1, observation: '' },
      };
    });
  };

  const handleDecrementItem = (itemId: string) => {
    setCartItems((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return {
        ...prev,
        [itemId]: { ...existing, quantity: existing.quantity - 1 },
      };
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  const handleUpdateItemObservation = (itemId: string, obs: string) => {
    setCartItems((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      return {
        ...prev,
        [itemId]: { ...existing, observation: obs },
      };
    });
  };

  // Cart totals
  const cartEntries: [string, CartItemData][] = Object.entries(cartItems);
  const totalCartCount = cartEntries.reduce((sum, [_, data]) => sum + data.quantity, 0);
  const totalCartAmount = cartEntries.reduce((sum, [itemId, data]) => {
    const item = restaurant.menu.find((m) => m.id === itemId);
    return sum + (item ? item.price * data.quantity : 0);
  }, 0);

  // Submit order to kitchen (KDS)
  const handleSendOrderToKitchen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartEntries.length === 0) {
      alert('Selecione pelo menos um item para enviar para a cozinha!');
      return;
    }

    const orderItems: OrderItem[] = cartEntries.map(([itemId, data]) => {
      const item = restaurant.menu.find((m) => m.id === itemId)!;
      return {
        itemId: item.id,
        name: item.name,
        quantity: data.quantity,
        price: item.price,
        observation: data.observation || undefined,
      };
    });

    const newOrder: Order = {
      id: '', // Atribuído de forma sequencial pelo servidor backend (CMD-XXXX)
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      items: orderItems,
      total: totalCartAmount,
      status: 'Recebido',
      timestamp: Date.now(),
      customerName: customerName.trim() ? `${selectedTableLabel} (${customerName.trim()})` : selectedTableLabel,
      tableId: selectedTable?.id,
      tableNumber: selectedTableLabel,
      notes: orderNotes.trim() ? `[Garçom: ${user.name || 'Lucas'}] ${orderNotes.trim()}` : `[Garçom: ${user.name || 'Lucas'}]`,
      prepTimeMinutes: 18,
      statusHistory: [
        {
          status: 'Recebido',
          timestamp: Date.now(),
          note: `Comanda lançada pelo Garçom ${user.name || 'Lucas'} para a ${selectedTableLabel}. Mesa marcada como ocupada e enviada para a Cozinha.`
        }
      ]
    };

    try {
      const created = await onPlaceOrder(newOrder);
      const assignedId = (created && created.id) ? created.id : 'Enviada';

      if (onUpdateTableStatus && selectedTable) {
        onUpdateTableStatus(selectedTable.id, 'ocupada', assignedId);
      }
      setLastCreatedOrderId(assignedId);
      setSuccessBanner(`Comanda ${assignedId} para ${selectedTableLabel} enviada para a Cozinha com sucesso!`);
      setTimeout(() => setSuccessBanner(null), 5000);

      // Reset current ticket for next order
      setCartItems({});
      setOrderNotes('');
      setCustomerName('');
    } catch (err: any) {
      console.error('Erro ao enviar comanda:', err);
      // Cart items are preserved so waiter doesn't lose inputs
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Header for Garçom */}
      <header className="bg-[#0f0f13] border-b border-zinc-800/90 px-4 sm:px-8 py-3.5 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-amber-950/40">
            <UtensilsCrossed className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">
                Sistema Web para Gerenciamento de Pedidos para Restaurantes
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <ChefHat className="w-3.5 h-3.5" />
                <span>Perfil: Garçom</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Atendente: <strong className="text-zinc-200">{user.name || 'Lucas Silveira'}</strong> • Lançamento de Comandas & Mesas
            </p>
          </div>
        </div>

        {/* Header Actions & Quick Navigators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Ready to serve notification badge */}
          {readyToServeOrders.length > 0 && (
            <button
              onClick={() => setActiveTab('active_orders')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black animate-pulse flex items-center gap-1.5 shadow-lg shadow-emerald-950/30"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              <span>{readyToServeOrders.length} PRONTO PARA SERVIR!</span>
            </button>
          )}

          {/* Quick Profile View Switcher for demonstration */}
          <div className="hidden md:flex items-center bg-[#18181c] p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => setActiveTab('launch')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                activeTab === 'launch' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Lançar Pedido
            </button>
            <button
              onClick={() => setActiveTab('active_orders')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                activeTab === 'active_orders' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Comandas Ativas</span>
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] flex items-center justify-center font-mono">
                {activeOrders.length}
              </span>
            </button>
          </div>

          {/* Shortcut to view other screens */}
          {(user.role === 'manager' || user.role === 'admin') && (
            <button
              onClick={() => onNavigate('admin')}
              className="hidden lg:flex px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition items-center gap-1"
              title="Ir para Administração"
            >
              <span>Administração</span>
            </button>
          )}

          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-400 border border-zinc-800 text-zinc-400 text-xs font-bold transition flex items-center gap-1.5"
            title="Sair da sessão"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Success Notification Banner */}
      {successBanner && (
        <aside className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-300 font-semibold transition-all">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successBanner}</span>
            </div>
            <button
              onClick={() => setActiveTab('active_orders')}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black font-black text-[10px] uppercase hover:bg-emerald-400 transition"
            >
              Ver na Esteira →
            </button>
          </div>
        </aside>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-[1750px] mx-auto w-full p-3 sm:p-6">
        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex items-center bg-[#131317] p-1 rounded-2xl border border-zinc-800 mb-4 text-xs">
          <button
            onClick={() => setActiveTab('launch')}
            className={`flex-1 py-2 rounded-xl font-bold transition text-center ${
              activeTab === 'launch' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400'
            }`}
          >
            Lançar Pedido
          </button>
          <button
            onClick={() => setActiveTab('active_orders')}
            className={`flex-1 py-2 rounded-xl font-bold transition text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'active_orders' ? 'bg-amber-500 text-black shadow' : 'text-zinc-400'
            }`}
          >
            <span>Comandas da Mesa ({activeOrders.length})</span>
            {readyToServeOrders.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
        </div>

        {activeTab === 'launch' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Columns: Table Selector + Menu Catalog */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. Fast Table / Counter Selector */}
              <section className="bg-[#111115] border border-zinc-800/90 rounded-3xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                      1. Selecione a Mesa Cadastrada (Salão)
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-zinc-400 hidden sm:inline">
                      Total: <strong className="text-zinc-200">{restaurantTables.length}</strong> | 
                      Livres: <strong className="text-emerald-400">{restaurantTables.filter(t => t.status !== 'ocupada').length}</strong> | 
                      Ocupadas: <strong className="text-rose-400">{restaurantTables.filter(t => t.status === 'ocupada').length}</strong>
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Mesa Selecionada: <strong className="text-amber-400">{selectedTableLabel}</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {restaurantTables.map((t) => {
                    const isSelected = selectedTableId === t.id;
                    const isTableOccupied = t.status === 'ocupada';
                    const hasActiveOrder = activeOrders.some((o) => o.tableId === t.id || o.tableNumber === (t.name || `Mesa ${t.number}`));
                    const isReady = readyToServeOrders.some((o) => o.tableId === t.id || o.tableNumber === (t.name || `Mesa ${t.number}`));
                    const tableName = t.name || `Mesa ${t.number}`;

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTableId(t.id)}
                        className={`py-2.5 px-2 rounded-2xl text-xs font-black transition text-left relative border flex flex-col justify-between min-h-[72px] ${
                          isSelected
                            ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-950/40 ring-2 ring-amber-400 scale-[1.02]'
                            : isReady
                            ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200 animate-pulse'
                            : isTableOccupied || hasActiveOrder
                            ? 'bg-rose-950/20 border-rose-900/60 text-rose-300'
                            : 'bg-[#18181c] border-zinc-800 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-[12px] font-black tracking-tight ${isSelected ? 'text-black' : 'text-white'}`}>
                            {tableName}
                          </span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-black/20 text-black font-bold' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {t.capacity || 4}p
                          </span>
                        </div>

                        <div className="flex items-center justify-between w-full mt-1.5">
                          <span className={`text-[9px] truncate max-w-[55px] ${isSelected ? 'text-zinc-900 font-medium' : 'text-zinc-500'}`}>
                            {t.location || 'Salão'}
                          </span>

                          {isReady ? (
                            <span className="text-[9px] text-emerald-400 font-extrabold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/40">
                              PRONTO!
                            </span>
                          ) : isTableOccupied || hasActiveOrder ? (
                            <span className={`text-[9px] font-bold flex items-center gap-1 ${isSelected ? 'text-rose-950' : 'text-rose-400'}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                              Ocupada
                            </span>
                          ) : (
                            <span className={`text-[9px] font-bold ${isSelected ? 'text-emerald-950' : 'text-emerald-400'}`}>
                              ● Livre
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Optional Customer Name */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center gap-3">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Identificação do Cliente na Comanda (Opcional)
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Carlos (ou deixar em branco)"
                      className="w-full px-3.5 py-2 bg-[#09090b] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="w-full sm:w-1/2 text-xs text-zinc-500 bg-[#0d0d10] p-2.5 rounded-xl border border-zinc-800/60 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>O pedido entrará instantaneamente no <strong>KDS da Cozinha</strong> com a identificação <strong>{selectedTableLabel}</strong> e a mesa ficará <span className="text-rose-400 font-bold">Ocupada</span>.</span>
                  </div>
                </div>
              </section>

              {/* 2. Menu Catalog with Fast Touch Buttons */}
              <section className="bg-[#111115] border border-zinc-800/90 rounded-3xl p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                      2. Adicione os Itens do Cardápio
                    </h2>
                  </div>

                  {/* Search bar */}
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar no cardápio..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Categories Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-thin scrollbar-thumb-zinc-800">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition ${
                        selectedCategory === cat
                          ? 'bg-white text-black shadow'
                          : 'bg-[#18181c] text-zinc-400 hover:text-white border border-zinc-800/80'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Menu Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[620px] overflow-y-auto pr-1">
                  {filteredMenuItems.map((item) => {
                    const currentInCart = cartItems[item.id]?.quantity || 0;

                    return (
                      <div
                        key={item.id}
                        className={`bg-[#16161b] border rounded-2xl p-3 flex flex-col justify-between transition group hover:border-zinc-700 ${
                          currentInCart > 0 ? 'border-amber-500/50 shadow-md shadow-amber-950/20' : 'border-zinc-800/90'
                        }`}
                      >
                        <div className="flex gap-3">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded-xl object-cover bg-zinc-900 shrink-0 border border-zinc-800"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white text-xs truncate">
                              {item.name}
                            </h3>
                            <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                              {item.description}
                            </p>
                            <span className="inline-block mt-1 font-mono font-black text-emerald-400 text-xs">
                              R$ {item.price.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>

                        {/* Fast Add / Quantity Selector */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                          {currentInCart > 0 ? (
                            <div className="flex items-center gap-2 bg-[#09090b] px-2 py-1 rounded-xl border border-zinc-700">
                              <button
                                type="button"
                                onClick={() => handleDecrementItem(item.id)}
                                className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center font-bold"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-mono font-black text-amber-400 text-xs w-5 text-center">
                                {currentInCart}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddItem(item)}
                                className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center font-bold"
                              >
                                <Plus className="w-3 h-3 stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddItem(item)}
                              className="w-full py-2 px-3 rounded-xl bg-[#22222a] hover:bg-amber-500 hover:text-black text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Adicionar à Comanda</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Right 4 Columns: Live Order Cart & Dispatch to Kitchen */}
            <div className="lg:col-span-4 sticky top-20">
              <div className="bg-[#111115] border border-zinc-800/90 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between min-h-[580px]">
                <div>
                  {/* Comanda Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <div>
                      <span className="text-[10px] uppercase font-mono font-bold text-amber-400 tracking-wider">
                        COMANDA DE ATENDIMENTO
                      </span>
                      <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                        {selectedTableLabel}
                        {customerName && <span className="text-zinc-400 text-xs font-normal">({customerName})</span>}
                      </h2>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 font-mono font-black text-xs text-amber-400">
                      {totalCartCount} itens
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="my-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {cartEntries.length === 0 ? (
                      <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800/70 rounded-2xl p-4">
                        <UtensilsCrossed className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                        <p className="font-semibold text-zinc-400">Comanda vazia</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          Toque nos pratos e bebidas ao lado para lançar os pedidos desta mesa.
                        </p>
                      </div>
                    ) : (
                      cartEntries.map(([itemId, data]) => {
                        const item = restaurant.menu.find((m) => m.id === itemId);
                        if (!item) return null;
                        const itemTotal = item.price * data.quantity;

                        return (
                          <div
                            key={itemId}
                            className="bg-[#18181d] border border-zinc-800/80 rounded-2xl p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-bold text-white text-xs">
                                  {data.quantity}x {item.name}
                                </span>
                                <div className="text-emerald-400 font-mono font-bold text-[11px]">
                                  R$ {itemTotal.toFixed(2).replace('.', ',')}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDecrementItem(itemId)}
                                  className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center font-bold text-xs"
                                >
                                  -
                                </button>
                                <span className="font-mono font-bold text-xs w-4 text-center">
                                  {data.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddItem(item)}
                                  className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center font-bold text-xs"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(itemId)}
                                  className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center ml-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Observation / Special notes for Kitchen */}
                            <div>
                              <input
                                type="text"
                                value={data.observation}
                                onChange={(e) => handleUpdateItemObservation(itemId, e.target.value)}
                                placeholder="Obs: Sem cebola, ponto da carne, etc..."
                                className="w-full px-2.5 py-1 bg-[#09090b] border border-zinc-800/80 rounded-lg text-[11px] text-amber-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* General Order Notes */}
                  {cartEntries.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Observação Geral da Mesa para a Cozinha
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ex: Trazer bebidas antes dos pratos"
                        className="w-full px-3 py-1.5 bg-[#09090b] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>

                {/* Bottom Total & Dispatch Button */}
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                      Valor Total da Comanda:
                    </span>
                    <span className="font-mono font-black text-xl text-emerald-400">
                      R$ {totalCartAmount.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendOrderToKitchen}
                    disabled={cartEntries.length === 0}
                    className={`w-full py-4 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition shadow-xl flex items-center justify-center gap-2 ${
                      cartEntries.length > 0
                        ? 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black active:scale-98 shadow-amber-950/40 cursor-pointer'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4 stroke-[2.5]" />
                    <span>ENVIAR PEDIDO PARA A COZINHA 🚀</span>
                  </button>

                  <p className="text-[10px] text-zinc-500 text-center mt-2.5">
                    O pedido será enviado imediatamente ao <strong>KDS Cozinha</strong> do restaurante.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* TAB 2: ACTIVE ORDERS FOR WAITER (Acompanhamento das Comandas das Mesas) */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#111115] p-5 rounded-3xl border border-zinc-800 shadow-xl">
              <div>
                <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  Comandas & Mesas em Andamento
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                    {activeOrders.length} ativas
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Acompanhe em tempo real o status dos pratos preparados pela cozinha e saiba a hora exata de servir a mesa!
                </p>
              </div>

              <button
                onClick={() => setActiveTab('launch')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase transition shadow"
              >
                + Lançar Novo Pedido
              </button>
            </div>

            {/* Ready orders callout */}
            {readyToServeOrders.length > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between gap-4 shadow-xl shadow-emerald-950/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center font-black animate-bounce">
                    <Bell className="w-5 h-5 stroke-[3]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-emerald-300 text-sm">
                      {readyToServeOrders.length} Pedido(s) Pronto(s) na Cozinha!
                    </h3>
                    <p className="text-xs text-emerald-400/80">
                      Dirija-se ao balcão/pass da cozinha para recolher e servir na mesa do cliente.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Orders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeOrders.length === 0 ? (
                <div className="col-span-full py-16 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl p-6">
                  <CheckCircle2 className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                  <p className="font-bold text-zinc-400 text-sm">Nenhuma comanda ativa no momento</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Todas as mesas já foram atendidas ou não possuem pedidos pendentes.
                  </p>
                  <button
                    onClick={() => setActiveTab('launch')}
                    className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase transition"
                  >
                    Lançar Primeiro Pedido
                  </button>
                </div>
              ) : (
                activeOrders.map((order) => {
                  const isDelivered = order.status === 'Entregue';
                  const isReady = order.status === 'Pronto';
                  const inPrep = order.status === 'Em Preparação';
                  const isNew = order.status === 'Recebido';

                  return (
                    <div
                      key={order.id}
                      className={`bg-[#121216] border rounded-3xl p-5 shadow-xl flex flex-col justify-between transition ${
                        isDelivered
                          ? 'border-emerald-500/50 bg-[#0a1811] shadow-emerald-950/20'
                          : isReady
                          ? 'border-emerald-500/70 shadow-emerald-950/30 bg-[#071d13]'
                          : inPrep
                          ? 'border-amber-500/50 shadow-amber-950/20'
                          : 'border-cyan-500/40'
                      }`}
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                          <div>
                            <span className="font-mono font-black text-amber-400 text-xs">
                              {order.id}
                            </span>
                            <h3 className="font-black text-white text-base">
                              {order.customerName}
                            </h3>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isDelivered
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : isReady
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-950/40 animate-pulse'
                                : inPrep
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            }`}
                          >
                            {isDelivered && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {isReady && <Bell className="w-3.5 h-3.5 stroke-[3]" />}
                            {inPrep && <ChefHat className="w-3.5 h-3.5" />}
                            {isNew && <Clock className="w-3.5 h-3.5" />}
                            <span>{isDelivered ? 'Entregue (Mesa)' : order.status}</span>
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="my-3 space-y-1.5 text-xs">
                          {order.items.map((i, idx) => (
                            <div key={idx} className="flex justify-between text-zinc-300 py-0.5">
                              <span>
                                <strong className="text-white font-mono">{i.quantity}x</strong> {i.name}
                                {i.observation && (
                                  <span className="block text-[10px] text-amber-400 ml-4 font-normal">
                                    Obs: {i.observation}
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-zinc-400">
                                R$ {(i.price * i.quantity).toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="p-2 rounded-xl bg-black/40 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>{order.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3 border-t border-zinc-800 mt-4 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Total</span>
                          <span className="font-mono font-black text-emerald-400 text-sm">
                            R$ {order.total.toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        {isDelivered ? (
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Deseja encerrar o atendimento da ${order.tableNumber || 'mesa'} (${order.id}) e liberar a mesa para novos clientes?`)) {
                                if (onCloseOrder) {
                                  await onCloseOrder(order.id);
                                  setSuccessBanner(`Atendimento da ${order.tableNumber || 'mesa'} encerrado com sucesso! Mesa liberada.`);
                                }
                              }
                            }}
                            className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition shadow-lg flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Encerrar atendimento</span>
                          </button>
                        ) : isReady ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await onUpdateOrderStatus(
                                order.id,
                                'Entregue',
                                `Comanda servida e entregue na ${order.tableNumber || 'mesa'}. Pedido entregue ao cliente.`
                              );
                              setSuccessBanner(`Pedido ${order.id} entregue na ${order.tableNumber || 'mesa'}! Mesa permanece em atendimento.`);
                            }}
                            className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition shadow-lg flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>ENTREGAR PEDIDO</span>
                          </button>
                        ) : inPrep ? (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                              <Flame className="w-3.5 h-3.5 animate-spin" />
                              <span>Preparando</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Deseja realmente cancelar o pedido ${order.id}? A mesa será liberada.`)) {
                                  onUpdateOrderStatus(
                                    order.id,
                                    'Cancelado',
                                    `Comanda cancelada pelo garçom ${user.name || ''}. Mesa liberada.`
                                  );
                                  if (order.tableId && onUpdateTableStatus) {
                                    onUpdateTableStatus(order.tableId, 'livre');
                                  }
                                }
                              }}
                              className="py-1 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Aguardando</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Deseja realmente cancelar o pedido ${order.id}? A mesa será liberada.`)) {
                                  onUpdateOrderStatus(
                                    order.id,
                                    'Cancelado',
                                    `Comanda cancelada pelo garçom ${user.name || ''}. Mesa liberada.`
                                  );
                                  if (order.tableId && onUpdateTableStatus) {
                                    onUpdateTableStatus(order.tableId, 'livre');
                                  }
                                }
                              }}
                              className="py-1 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0a0a0d] border-t border-zinc-800/80 py-3.5 px-6 text-center text-xs text-zinc-500">
        <p>Sistema Web para Gerenciamento de Pedidos para Restaurantes • Módulo do Garçom • Banco Relacional SQLite • FATEC Franca 2026</p>
      </footer>
    </div>
  );
};
