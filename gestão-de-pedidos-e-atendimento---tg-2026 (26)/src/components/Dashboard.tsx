import React, { useState, useEffect } from 'react';
import { ViewMode, User, RestaurantConfig, MenuItem, Order, OrderStatus, RestaurantTable, TableStatus, UserRole } from '../types';
import { INITIAL_TABLES } from '../data/initialData';
import { api } from '../services/api';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  LogOut,
  UtensilsCrossed,
  ChefHat,
  Tags,
  Coffee,
  CheckCircle2,
  Clock,
  Layers,
  ShieldAlert,
  Save,
  Check,
  AlertCircle,
  ShieldCheck,
  Flame,
  User as UserIcon
} from 'lucide-react';

interface DashboardProps {
  user: User;
  restaurant: RestaurantConfig;
  onUpdateRestaurant: (updated: RestaurantConfig) => void;
  orders: Order[];
  tables?: RestaurantTable[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onCloseOrder?: (orderId: string) => Promise<any> | void;
  onCreateTable?: (table: Partial<RestaurantTable>) => Promise<any>;
  onUpdateTable?: (id: string, table: Partial<RestaurantTable>) => Promise<any>;
  onUpdateTableStatus?: (id: string, status: TableStatus, orderId?: string) => Promise<any>;
  onDeleteTable?: (id: string) => Promise<any>;
  onNavigate: (view: ViewMode) => void;
  onLogout: () => void;
  users?: User[];
}

const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Recebido': ['Em Preparação', 'Cancelado'],
  'Em Preparação': ['Pronto', 'Cancelado'],
  'Pronto': ['Entregue'],
  'Entregue': [],
  'Cancelado': [],
};

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  restaurant,
  onUpdateRestaurant,
  orders,
  onUpdateOrderStatus,
  onCloseOrder,
  onNavigate,
  onLogout,
  users: initialUsers = [],
  tables = [],
  onCreateTable,
  onUpdateTable,
  onUpdateTableStatus,
  onDeleteTable,
}) => {
  // SECURITY CHECK: Garçom e Cozinha NÃO podem acessar o Painel do Gerente
  const isManagerOrAdmin = user.role === 'manager' || user.role === 'admin' || user.role === 'owner';

  // Navigation tab inside Dashboard
  const [activeTab, setActiveTab] = useState<'employees' | 'products' | 'categories' | 'tables' | 'orders'>('employees');

  // Employee Management State
  const [teamList, setTeamList] = useState<User[]>(initialUsers);
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empRole, setEmpRole] = useState<UserRole>('garcom');
  const [empPhone, setEmpPhone] = useState('');
  const [empError, setEmpError] = useState('');
  const [empSuccess, setEmpSuccess] = useState('');
  const [loadingEmp, setLoadingEmp] = useState(false);

  // Categories Management State
  const [categoriesList, setCategoriesList] = useState<string[]>(
    restaurant.categories && restaurant.categories.length > 0
      ? restaurant.categories
      : ['Burgers', 'Pizzas', 'Acompanhamentos', 'Bebidas', 'Sobremesas']
  );
  const [newCatName, setNewCatName] = useState('');
  const [catMsg, setCatMsg] = useState('');

  // Products Management State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState<string>('');
  const [prodCategory, setProdCategory] = useState<string>('Burgers');
  const [prodImage, setProdImage] = useState('');
  const [prodPrepTime, setProdPrepTime] = useState<number>(12);
  const [prodSearchFilter, setProdSearchFilter] = useState('');
  const [prodCategoryFilter, setProdCategoryFilter] = useState('ALL');

  // Tables State
  const restaurantTables: RestaurantTable[] = tables && tables.length > 0
    ? tables.filter((t) => t.restaurantId === restaurant.id)
    : INITIAL_TABLES.filter((t) => t.restaurantId === restaurant.id);

  const [newTableNum, setNewTableNum] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');
  const [newTableLoc, setNewTableLoc] = useState('Salão Principal');
  const [isAddingTable, setIsAddingTable] = useState(false);

  // Orders Filter for Manager
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const restaurantOrders = orders.filter((o) => o.restaurantId === restaurant.id);
  const filteredOrders = restaurantOrders.filter((o) => {
    if (orderStatusFilter === 'ALL') return true;
    return o.status === orderStatusFilter;
  });

  // Load backend employees and categories on mount
  useEffect(() => {
    if (isManagerOrAdmin) {
      api.listEmployees().then((data) => {
        if (data && data.length > 0) setTeamList(data);
      }).catch(() => {});

      api.getCategories().then((cats) => {
        if (cats && cats.length > 0) setCategoriesList(cats);
      }).catch(() => {});
    }
  }, [isManagerOrAdmin]);

  // Handler: Cadastrar Funcionário
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError('');
    setEmpSuccess('');

    if (!empName.trim() || !empEmail.trim() || !empPassword) {
      setEmpError('Preencha nome, e-mail e senha do funcionário.');
      return;
    }

    setLoadingEmp(true);
    try {
      const created = await api.createEmployee({
        name: empName.trim(),
        email: empEmail.trim(),
        password: empPassword,
        role: empRole,
        phone: empPhone.trim() || undefined,
      });

      setTeamList((prev) => [created, ...prev.filter((u) => u.email.toLowerCase() !== created.email.toLowerCase())]);
      setEmpSuccess(`Funcionário ${created.name} cadastrado com sucesso com perfil ${empRole}!`);
      setEmpName('');
      setEmpEmail('');
      setEmpPassword('');
      setEmpPhone('');
      setTimeout(() => setEmpSuccess(''), 4000);
    } catch (err: any) {
      setEmpError(err.message || 'Erro ao cadastrar funcionário.');
    } finally {
      setLoadingEmp(false);
    }
  };

  // Handler: Excluir Funcionário
  const handleDeleteEmployee = async (email: string) => {
    if (confirm(`Deseja realmente remover o acesso do funcionário (${email})?`)) {
      try {
        await api.deleteEmployee(email);
        setTeamList((prev) => prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir funcionário.');
      }
    }
  };

  // Handler: Cadastrar Categoria
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const updated = await api.createCategory(newCatName.trim());
      setCategoriesList(updated);
      onUpdateRestaurant({ ...restaurant, categories: updated });
      setNewCatName('');
      setCatMsg('Categoria cadastrada com sucesso!');
      setTimeout(() => setCatMsg(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar categoria.');
    }
  };

  // Handler: Excluir Categoria
  const handleDeleteCategory = async (catName: string) => {
    if (confirm(`Excluir a categoria "${catName}"?`)) {
      try {
        const updated = await api.deleteCategory(catName);
        setCategoriesList(updated);
        onUpdateRestaurant({ ...restaurant, categories: updated });
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir categoria.');
      }
    }
  };

  // Handler: Cadastrar / Editar Produto
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) return;

    try {
      if (editingItem) {
        const updatedItem = await api.updateProduct(editingItem.id, {
          name: prodName.trim(),
          description: prodDesc.trim(),
          price: Number(prodPrice),
          category: prodCategory,
          imageUrl: prodImage.trim() || editingItem.imageUrl,
          prepTimeMinutes: prodPrepTime,
        });

        const newMenu = restaurant.menu.map((m) => (m.id === editingItem.id ? updatedItem : m));
        onUpdateRestaurant({ ...restaurant, menu: newMenu });
      } else {
        const created = await api.createProduct({
          name: prodName.trim(),
          description: prodDesc.trim(),
          price: Number(prodPrice),
          category: prodCategory,
          imageUrl: prodImage.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
          prepTimeMinutes: prodPrepTime,
        });

        const newMenu = [...restaurant.menu, created];
        onUpdateRestaurant({ ...restaurant, menu: newMenu });
      }

      setIsItemModalOpen(false);
      setEditingItem(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar produto.');
    }
  };

  // Handler: Excluir Produto
  const handleDeleteProduct = async (id: string) => {
    if (confirm('Deseja excluir este item do cardápio?')) {
      try {
        await api.deleteProduct(id);
        const newMenu = restaurant.menu.filter((m) => m.id !== id);
        onUpdateRestaurant({ ...restaurant, menu: newMenu });
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir produto.');
      }
    }
  };

  // Handler: Nova Mesa
  const handleCreateNewTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNum) return;
    if (onCreateTable) {
      await onCreateTable({
        restaurantId: restaurant.id,
        number: newTableNum,
        name: newTableName || `Mesa ${String(newTableNum).padStart(2, '0')}`,
        capacity: Number(newTableCap) || 4,
        location: newTableLoc || 'Salão Principal',
        status: 'livre',
      });
      setNewTableNum('');
      setNewTableName('');
      setIsAddingTable(false);
    }
  };

  // BLOCK SCREEN FOR UNAUTHORIZED ROLES (Garçom / Cozinha)
  if (!isManagerOrAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black mb-2">Acesso Restrito ao Gerente</h2>
        <p className="text-zinc-400 text-sm max-w-md mb-6">
          Seu perfil atual (<strong>{user.role}</strong>) não possui permissão para acessar a administração do restaurante.
        </p>
        <button
          onClick={() => onNavigate(user.role === 'kitchen' ? 'kitchen_kds' : 'waiter_orders')}
          className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow-lg"
        >
          {user.role === 'kitchen' ? 'Ir para KDS da Cozinha' : 'Ir para Lançamento de Pedidos'}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col justify-between font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Header Bar */}
      <header className="w-full bg-[#0a0a0c] border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between text-xs sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-white text-base tracking-tight leading-none">
                Sistema Web para Gerenciamento de Pedidos para Restaurantes
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                Painel do Gerente
              </span>
              <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                SQLite WAL
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-0.5 font-semibold">
              Usuário: {user.name || user.email}
            </p>
          </div>
        </div>

        {/* Quick Nav & Logout */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('waiter_orders')}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition flex items-center gap-1.5"
            title="Acessar tela do Garçom"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Garçom</span>
          </button>

          <button
            onClick={() => onNavigate('kitchen_kds')}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
            title="Acessar tela da Cozinha"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Cozinha (KDS)</span>
          </button>

          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold transition flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* Navigation Tabs Bar - Otimizado para não quebrar ou cortar em 1280px */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-[#101014] p-1.5 rounded-2xl border border-zinc-800/80 mb-8 text-xs">
          <button
            onClick={() => setActiveTab('employees')}
            className={`py-2 px-3 rounded-xl font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              activeTab === 'employees'
                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-950/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Funcionários</span>
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`py-2 px-3 rounded-xl font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              activeTab === 'products'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>2. Cardápio</span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`py-2 px-3 rounded-xl font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-950/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>3. Categorias ({categoriesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`py-2 px-3 rounded-xl font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              activeTab === 'tables'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-950/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>4. Mesas ({restaurantTables.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`py-2 px-3 rounded-xl font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-950/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>5. Comandas & Pedidos ({restaurantOrders.length})</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: CADASTRO E GESTÃO DE FUNCIONÁRIOS (GARÇOM, COZINHA, GERENTE) */}
        {/* ========================================================================= */}
        {activeTab === 'employees' && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Info Banner */}
            <div className="bg-[#121216] border border-cyan-500/30 rounded-3xl p-6 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-400" />
                    <span>Controle de Funcionários e Perfis de Acesso</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                    Cadastre novos membros da equipe atribuindo os cargos de <strong>Garçom</strong> (lançamento de pedidos nas mesas), <strong>Cozinha</strong> (painel KDS) ou <strong>Gerente</strong> (administração).
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono font-bold text-xs">
                  {teamList.length} colaboradores
                </span>
              </div>

              {/* Form to Register Employee */}
              <form onSubmit={handleAddEmployeeSubmit} className="mt-6 pt-6 border-t border-zinc-800/80 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Cadastrar Novo Colaborador no Servidor</span>
                </h3>

                {empError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{empError}</span>
                  </div>
                )}

                {empSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{empSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Cargo / Perfil *</label>
                    <select
                      value={empRole}
                      onChange={(e) => setEmpRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white font-semibold focus:outline-none focus:border-cyan-500"
                    >
                      <option value="garcom">🧑‍🍳 Garçom (Lançamento)</option>
                      <option value="kitchen">🍳 Cozinha (KDS)</option>
                      <option value="manager">👔 Gerente (Administração)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      placeholder="Ex: Carlos Oliveira"
                      className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">E-mail de Login *</label>
                    <input
                      type="email"
                      required
                      value={empEmail}
                      onChange={(e) => setEmpEmail(e.target.value)}
                      placeholder="carlos@restaurante.com"
                      className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Senha de Acesso *</label>
                    <input
                      type="password"
                      required
                      value={empPassword}
                      onChange={(e) => setEmpPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={loadingEmp}
                    className="py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow-lg active:scale-98 disabled:opacity-50 cursor-pointer"
                  >
                    {loadingEmp ? 'Salvando no Servidor...' : '+ Salvar Funcionário'}
                  </button>
                </div>
              </form>
            </div>

            {/* Employees List */}
            <div className="bg-[#121216] border border-zinc-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white mb-4">
                Colaboradores Ativos ({teamList.length})
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {teamList.map((emp) => {
                  const isGarcom = emp.role === 'garcom';
                  const isKitchen = emp.role === 'kitchen';

                  return (
                    <div
                      key={emp.email}
                      className="p-4 rounded-2xl bg-[#0a0a0c] border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                            isGarcom
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              : isKitchen
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          }`}>
                            {isGarcom ? <ChefHat className="w-3 h-3" /> : isKitchen ? <Flame className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                            <span>{isGarcom ? 'Garçom' : isKitchen ? 'Cozinha' : 'Gerente'}</span>
                          </span>

                          {emp.email.toLowerCase() !== user.email.toLowerCase() && (
                            <button
                              onClick={() => handleDeleteEmployee(emp.email)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Remover Funcionário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <h4 className="font-extrabold text-white text-sm">{emp.name || emp.email}</h4>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">{emp.email}</p>
                      </div>

                      <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                        <span>Acesso ao sistema:</span>
                        <strong className="text-zinc-300">
                          {isGarcom ? 'Lançamento' : isKitchen ? 'KDS Cozinha' : 'Administração'}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PRODUTOS DO CARDÁPIO */}
        {/* ========================================================================= */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-fade-in">
            {/* Action Bar */}
            <div className="bg-[#121216] border border-rose-500/30 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-rose-400" />
                  <span>Produtos do Cardápio</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Gerencie os pratos, bebidas e preços que os garçons lançam nas comandas das mesas.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingItem(null);
                  setProdName('');
                  setProdDesc('');
                  setProdPrice('');
                  setProdCategory(categoriesList[0] || 'Burgers');
                  setProdImage('');
                  setProdPrepTime(12);
                  setIsItemModalOpen(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider transition shadow-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Novo Produto</span>
              </button>
            </div>

            {/* Filter and Products Grid */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <input
                type="text"
                value={prodSearchFilter}
                onChange={(e) => setProdSearchFilter(e.target.value)}
                placeholder="Buscar produto por nome..."
                className="w-full sm:w-72 px-3 py-2 bg-[#0e0e12] border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
                <button
                  onClick={() => setProdCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    prodCategoryFilter === 'ALL' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setProdCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                      prodCategoryFilter === cat ? 'bg-rose-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {restaurant.menu
                .filter((p) => {
                  const matchesSearch = p.name.toLowerCase().includes(prodSearchFilter.toLowerCase());
                  const matchesCat = prodCategoryFilter === 'ALL' || p.category === prodCategoryFilter;
                  return matchesSearch && matchesCat;
                })
                .map((prod) => (
                  <div
                    key={prod.id}
                    className="p-4 rounded-2xl bg-[#0e0e12] border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between gap-3"
                  >
                    <div className="flex gap-3">
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-16 h-16 rounded-xl object-cover border border-zinc-800 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          {prod.category}
                        </span>
                        <h4 className="font-extrabold text-white text-sm truncate">{prod.name}</h4>
                        <p className="text-zinc-400 text-xs line-clamp-2 mt-0.5">{prod.description}</p>
                        <div className="text-emerald-400 font-mono font-black text-sm mt-1">
                          R$ {prod.price.toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                      <span className="text-zinc-500 text-[11px]">Preparo: ~{prod.prepTimeMinutes || 12} min</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingItem(prod);
                            setProdName(prod.name);
                            setProdDesc(prod.description);
                            setProdPrice(String(prod.price));
                            setProdCategory(prod.category);
                            setProdImage(prod.imageUrl);
                            setProdPrepTime(prod.prepTimeMinutes || 12);
                            setIsItemModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CATEGORIAS DO CARDÁPIO */}
        {/* ========================================================================= */}
        {activeTab === 'categories' && (
          <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
            <div className="bg-[#121216] border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-xl">
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2 mb-1">
                <Tags className="w-5 h-5 text-amber-400" />
                <span>Categorias de Produtos do Restaurante</span>
              </h2>
              <p className="text-xs text-zinc-400 mb-6">
                Organize seu cardápio em categorias (ex.: Burgers, Pizzas, Bebidas, Acompanhamentos, Sobremesas).
              </p>

              {catMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{catMsg}</span>
                </div>
              )}

              {/* Form to Add Category */}
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Nome da nova categoria (ex: Massas, Sobremesas, Petiscos)"
                  className="flex-1 px-4 py-2.5 bg-[#09090b] border border-zinc-700 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow cursor-pointer whitespace-nowrap"
                >
                  + Adicionar Categoria
                </button>
              </form>

              {/* Categories Badges Grid */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                  Categorias Ativas ({categoriesList.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {categoriesList.map((cat) => {
                    const count = restaurant.menu.filter((m) => m.category === cat).length;
                    return (
                      <div
                        key={cat}
                        className="p-3.5 rounded-2xl bg-[#09090b] border border-zinc-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span className="font-extrabold text-white text-sm">{cat}</span>
                          <span className="text-[11px] text-zinc-500">({count} pratos)</span>
                        </div>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Excluir Categoria"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MESAS DO SALÃO */}
        {/* ========================================================================= */}
        {activeTab === 'tables' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[#121216] border border-emerald-500/30 rounded-3xl p-6 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
                    <span>Controle e Cadastro de Mesas</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Ao abrir um pedido para a mesa, ela fica <strong className="text-rose-400">Ocupada</strong>; ao entregar o pedido, ela volta a <strong className="text-emerald-400">Livre</strong>.
                  </p>
                </div>

                <button
                  onClick={() => setIsAddingTable(!isAddingTable)}
                  className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{isAddingTable ? 'Fechar Formulário' : '+ Cadastrar Mesa'}</span>
                </button>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 my-6">
                <div className="p-4 rounded-2xl bg-[#09090b] border border-zinc-800 text-center">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block">Total de Mesas</span>
                  <span className="text-2xl font-black text-white font-mono">{restaurantTables.length}</span>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Mesas Livres</span>
                  <span className="text-2xl font-black text-emerald-300 font-mono">
                    {restaurantTables.filter((t) => t.status !== 'ocupada').length}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-center">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block">Mesas Ocupadas</span>
                  <span className="text-2xl font-black text-rose-300 font-mono">
                    {restaurantTables.filter((t) => t.status === 'ocupada').length}
                  </span>
                </div>
              </div>

              {/* Form to Add Table */}
              {isAddingTable && (
                <form onSubmit={handleCreateNewTableSubmit} className="mb-8 p-5 rounded-2xl bg-[#09090b] border border-emerald-500/40 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Cadastrar Nova Mesa no Servidor</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Número *</label>
                      <input
                        type="text"
                        required
                        value={newTableNum}
                        onChange={(e) => setNewTableNum(e.target.value)}
                        placeholder="Ex: 5"
                        className="w-full px-3 py-2 bg-[#141418] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Nome / Rótulo</label>
                      <input
                        type="text"
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        placeholder="Ex: Mesa 05"
                        className="w-full px-3 py-2 bg-[#141418] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Capacidade (Lugares)</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newTableCap}
                        onChange={(e) => setNewTableCap(e.target.value)}
                        className="w-full px-3 py-2 bg-[#141418] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Localização / Setor</label>
                      <input
                        type="text"
                        value={newTableLoc}
                        onChange={(e) => setNewTableLoc(e.target.value)}
                        placeholder="Ex: Salão, Varanda"
                        className="w-full px-3 py-2 bg-[#141418] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTable(false)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
                    >
                      Salvar Mesa
                    </button>
                  </div>
                </form>
              )}

              {/* Tables Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {restaurantTables.map((t) => {
                  const isOccupied = t.status === 'ocupada';
                  const activeOrder = orders.find(
                    (o) =>
                      o.status !== 'Entregue' &&
                      o.status !== 'Cancelado' &&
                      (o.tableId === t.id || (o.tableNumber && o.tableNumber === (t.name || `Mesa ${t.number}`)))
                  );

                  return (
                    <div
                      key={t.id}
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                        isOccupied
                          ? 'bg-rose-950/20 border-rose-900/60 shadow-lg shadow-rose-950/20'
                          : 'bg-[#09090b] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-extrabold text-white text-base">
                            {t.name || `Mesa ${t.number}`}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              isOccupied
                                ? 'bg-rose-500 text-black'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {isOccupied ? '🔴 Ocupada' : '🟢 Livre'}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 space-y-1">
                          <div className="flex justify-between">
                            <span>Capacidade:</span>
                            <strong className="text-zinc-200">{t.capacity || 4} lugares</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Setor:</span>
                            <span className="text-zinc-300">{t.location || 'Salão'}</span>
                          </div>
                        </div>

                        {activeOrder && (
                          <div className="mt-3 p-2 rounded-xl bg-black/60 border border-zinc-800 text-[11px]">
                            <div className="text-amber-400 font-bold font-mono">
                              Comanda: {activeOrder.id}
                            </div>
                            <div className="text-zinc-300 truncate">
                              {activeOrder.customerName}
                            </div>
                            <div className="text-emerald-400 font-mono font-bold mt-0.5">
                              R$ {activeOrder.total.toFixed(2).replace('.', ',')} ({activeOrder.status})
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (onUpdateTableStatus) {
                              onUpdateTableStatus(t.id, isOccupied ? 'livre' : 'ocupada');
                            }
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-center ${
                            isOccupied
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                              : 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/50'
                          }`}
                        >
                          {isOccupied ? 'Liberar Mesa' : 'Ocupar Manual'}
                        </button>

                        {onDeleteTable && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Excluir ${t.name || t.number}?`)) {
                                onDeleteTable(t.id);
                              }
                            }}
                            className="p-1.5 rounded-xl bg-zinc-900 hover:bg-rose-950 text-zinc-500 hover:text-rose-400 transition"
                            title="Excluir Mesa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: COMANDAS & PEDIDOS (STATUS: Recebido, Em Preparação, Pronto, Entregue, Cancelado) */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[#121216] border border-purple-500/30 rounded-3xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-400" />
                    <span>Acompanhamento de Comandas & Salão</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Visualização de todos os pedidos com os 5 status oficiais do sistema.
                  </p>
                </div>

                {/* Filter buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-xs w-full sm:w-auto">
                  {['ALL', 'Recebido', 'Em Preparação', 'Pronto', 'Entregue', 'Cancelado'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                        orderStatusFilter === st
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {st === 'ALL' ? 'Todos' : st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  Nenhuma comanda encontrada para este filtro.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-4 rounded-2xl bg-[#09090b] border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-amber-400">{ord.id}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="font-bold text-white text-sm">{ord.customerName}</span>
                          {ord.tableNumber && (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 font-mono text-[11px]">
                              {ord.tableNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 mt-1">
                          {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <span className="font-mono font-black text-emerald-400 text-base">
                          R$ {ord.total.toFixed(2).replace('.', ',')}
                        </span>

                        {ord.status === 'Entregue' ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                                ord.closedAt
                                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {ord.closedAt ? 'Encerrado' : 'Entregue (Mesa)'}
                            </span>
                            {!ord.closedAt && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`Deseja encerrar o atendimento da ${ord.tableNumber || 'mesa'} (${ord.id}) e liberar a mesa no salão?`)) {
                                    if (onCloseOrder) {
                                      await onCloseOrder(ord.id);
                                    } else {
                                      await api.closeOrder(ord.id);
                                    }
                                  }
                                }}
                                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase transition shadow flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Encerrar Atendimento</span>
                              </button>
                            )}
                          </div>
                        ) : ord.status === 'Cancelado' ? (
                          <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Cancelado
                          </span>
                        ) : (
                          <select
                            value={ord.status}
                            onChange={(e) => onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                            className="bg-zinc-900 border border-zinc-700 text-white rounded-xl py-1.5 px-3 text-xs font-bold focus:outline-none"
                          >
                            <option value={ord.status}>{ord.status}</option>
                            {(ALLOWED_STATUS_TRANSITIONS[ord.status] || []).map((nextSt) => (
                              <option key={nextSt} value={nextSt}>
                                Avançar: {nextSt}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal: Adicionar / Editar Produto */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121216] border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <h4 className="text-lg font-bold text-white mb-4">
              {editingItem ? 'Editar Produto do Cardápio' : 'Novo Produto no Cardápio'}
            </h4>

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Nome do Item *</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Ex: Burger Bacon Artesanal"
                  className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.10"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    placeholder="34.90"
                    className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Categoria *</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white font-semibold focus:outline-none focus:border-rose-500"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Ingredientes e detalhes..."
                  className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-bold mb-1">URL da Foto</label>
                <input
                  type="url"
                  value={prodImage}
                  onChange={(e) => setProdImage(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-[#09090b] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full bg-[#0a0a0c] border-t border-zinc-800/80 py-4 px-6 text-center text-xs text-zinc-500">
        <p>Sistema Web para Gerenciamento de Pedidos para Restaurantes • Painel do Gerente • Banco Relacional SQLite • FATEC Franca 2026</p>
      </footer>
    </div>
  );
};
