import React, { useState, useEffect } from 'react';
import { ViewMode, User, RestaurantConfig, Order, OrderStatus } from '../types';
import {
  ChefHat,
  Flame,
  Clock,
  PackageCheck,
  CheckCircle2,
  Bell,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Search,
  Filter,
  Check,
  LogOut,
  UtensilsCrossed,
  ArrowRight,
  Sparkles,
  Layers,
  MapPin,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';

interface KitchenKDSPageProps {
  user: User;
  restaurant: RestaurantConfig;
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, note?: string) => void;
  onAcceptOrder?: (orderId: string) => void;
  onNavigate: (view: ViewMode) => void;
  onLogout: () => void;
}

export const KitchenKDSPage: React.FC<KitchenKDSPageProps> = ({
  user,
  restaurant,
  orders,
  onUpdateOrderStatus,
  onAcceptOrder,
  onNavigate,
  onLogout,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);

  // Real-time tick for kitchen timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Filter orders for current restaurant
  const restOrders = orders.filter((o) => o.restaurantId === restaurant.id);

  const filteredOrders = restOrders.filter((o) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
      o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  });

  // Stage filters (Exact 3 kitchen stages)
  const newOrders = filteredOrders.filter((o) => o.status === 'Recebido');
  const inPrepOrders = filteredOrders.filter((o) => o.status === 'Em Preparação');
  const readyOrders = filteredOrders.filter((o) => o.status === 'Pronto');

  // Elapsed minutes helper (suporta timestamp numérico)
  const getElapsedMinutes = (timestamp: number) => {
    const ts = typeof timestamp === 'number' ? timestamp : Number(new Date(timestamp).getTime());
    const diffMs = currentTime - (isNaN(ts) ? currentTime : ts);
    return Math.max(1, Math.floor(diffMs / (1000 * 60)));
  };

  const handleAccept = async (orderId: string) => {
    setAcceptingOrderId(orderId);
    if (onAcceptOrder) {
      await onAcceptOrder(orderId);
    } else {
      onUpdateOrderStatus(orderId, 'Em Preparação', 'Comanda aceita pela equipe da cozinha no KDS.');
    }
    setAcceptingOrderId(null);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between font-sans selection:bg-rose-500 selection:text-white">
      {/* Top KDS Header */}
      <header className="bg-[#0f0f13] border-b border-zinc-800/90 px-4 sm:px-8 py-3.5 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-950/40">
            <ChefHat className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">
                Sistema Web para Gerenciamento de Pedidos para Restaurantes
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>Perfil: Cozinha (KDS)</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Operador: <strong className="text-zinc-200">{user.name || 'Chef Marcos'}</strong> • Kitchen Display System em Tempo Real
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search Ticket */}
          <div className="relative w-40 sm:w-56">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar comanda/mesa..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#18181c] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
              soundEnabled
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}
            title={soundEnabled ? 'Alerta sonoro ativado' : 'Alerta sonoro silenciado'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition"
            title="Tela Cheia"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Quick links to Waiter and Manager screens */}
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

      {/* Production Ribbon Stats */}
      <section className="bg-[#0b0b0e] border-b border-zinc-800/80 px-4 sm:px-8 py-2.5">
        <div className="max-w-[1750px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-zinc-400 font-semibold">Novos na Fila:</span>
              <strong className="text-white font-mono text-sm">{newOrders.length}</strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-zinc-400 font-semibold">Na Chapa/Produção:</span>
              <strong className="text-amber-400 font-mono text-sm">{inPrepOrders.length}</strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-zinc-400 font-semibold">Aguardando Expedição:</span>
              <strong className="text-emerald-400 font-mono text-sm">{readyOrders.length}</strong>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-mono">
            <span>Legenda:</span>
            <span className="text-emerald-400 font-semibold">● &lt; 10 min</span>
            <span className="text-amber-400 font-semibold">● 10-20 min</span>
            <span className="text-rose-400 font-semibold animate-pulse">● &gt; 20 min (Atrasado)</span>
          </div>
        </div>
      </section>

      {/* Main 3-Column KDS Board */}
      <main className="flex-1 max-w-[1750px] mx-auto w-full p-3 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* COLUMN 1: NOVOS PEDIDOS */}
          <div className="bg-[#101014] border border-cyan-500/30 rounded-3xl flex flex-col min-h-[640px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-cyan-500/20 bg-[#071318] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm tracking-tight">
                    1. Novos Pedidos (Fila)
                  </h2>
                  <p className="text-[11px] text-cyan-300/70">
                    Aguardando aceite da cozinha
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl font-mono font-black text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {newOrders.length}
              </span>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[calc(100vh-230px)]">
              {newOrders.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-800/80 rounded-2xl text-zinc-500">
                  <Clock className="w-8 h-8 text-zinc-700 mb-2" />
                  <span className="font-bold text-xs text-zinc-400">Nenhum novo pedido na fila</span>
                  <span className="text-[11px] text-zinc-600 mt-1">Comandas lançadas pelo garçom ou web entrarão aqui</span>
                </div>
              ) : (
                newOrders.map((order) => {
                  const elapsed = getElapsedMinutes(order.timestamp);

                  return (
                    <div
                      key={order.id}
                      className="bg-[#15151c] border border-cyan-500/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 animate-fade-in"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            {order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {elapsed} min atrás
                          </span>
                        </div>

                        {/* Customer & Mesa */}
                        <div className="mt-2 font-black text-white text-base">
                          {order.customerName}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                          {order.tableNumber && (
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{order.tableNumber}</span>
                            </span>
                          )}
                        </div>

                        {/* Items */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="bg-[#0b0b0e] p-2.5 rounded-xl border border-zinc-800/80">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-white text-sm">
                                  <strong className="text-amber-400 font-mono mr-1.5">{item.quantity}x</strong>
                                  {item.name}
                                </span>
                              </div>
                              {item.observation && (
                                <div className="mt-1 p-1 px-2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>OBS: {item.observation}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="mt-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>{order.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Giant Action Button */}
                      <button
                        onClick={() => handleAccept(order.id)}
                        disabled={acceptingOrderId === order.id}
                        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        <Flame className="w-4 h-4 stroke-[3]" />
                        <span>{acceptingOrderId === order.id ? 'INICIANDO...' : 'INICIAR PREPARO AGORA'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 2: EM PREPARAÇÃO */}
          <div className="bg-[#101014] border border-amber-500/30 rounded-3xl flex flex-col min-h-[640px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-amber-500/20 bg-[#1c1204] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Flame className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm tracking-tight">
                    2. Em Preparo (Chapa & Fogão)
                  </h2>
                  <p className="text-[11px] text-amber-300/70">
                    Produção ativa na linha de frente
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl font-mono font-black text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {inPrepOrders.length}
              </span>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[calc(100vh-230px)]">
              {inPrepOrders.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-800/80 rounded-2xl text-zinc-500">
                  <Flame className="w-8 h-8 text-zinc-700 mb-2" />
                  <span className="font-bold text-xs text-zinc-400">Nenhum prato sendo preparado</span>
                  <span className="text-[11px] text-zinc-600 mt-1">Aceite um pedido da fila para iniciar</span>
                </div>
              ) : (
                inPrepOrders.map((order) => {
                  const elapsed = getElapsedMinutes(order.timestamp);
                  const isLate = elapsed > 20;
                  const isAttention = elapsed >= 10 && elapsed <= 20;

                  return (
                    <div
                      key={order.id}
                      className={`bg-[#15151c] border rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 ${
                        isLate
                          ? 'border-rose-500/70 bg-[#200a0e] shadow-rose-950/40'
                          : isAttention
                          ? 'border-amber-500/50 shadow-amber-950/20'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            {order.id}
                          </span>
                          <span
                            className={`px-2.5 py-1 rounded-xl font-mono font-black text-xs flex items-center gap-1.5 ${
                              isLate
                                ? 'bg-rose-500 text-white animate-pulse'
                                : isAttention
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{elapsed} min</span>
                          </span>
                        </div>

                        {/* Customer & Mesa */}
                        <div className="mt-2 font-black text-white text-base">
                          {order.customerName}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                          {order.tableNumber && (
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{order.tableNumber}</span>
                            </span>
                          )}
                        </div>

                        {/* Items to prepare */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="bg-[#0b0b0e] p-2.5 rounded-xl border border-zinc-800/80">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-white text-sm">
                                  <strong className="text-amber-400 font-mono text-base mr-1.5">{item.quantity}x</strong>
                                  {item.name}
                                </span>
                              </div>
                              {item.observation && (
                                <div className="mt-1 p-1 px-2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>OBS: {item.observation}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="mt-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>{order.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Giant Finished Button */}
                      <button
                        onClick={() =>
                          onUpdateOrderStatus(
                            order.id,
                            'Pronto',
                            'Prato finalizado pela cozinha e encaminhado para expedição / garçom.'
                          )
                        }
                        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                        <span>PRATO PRONTO (AVISAR GARÇOM)</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 3: PRONTOS / EXPEDIÇÃO */}
          <div className="bg-[#101014] border border-emerald-500/30 rounded-3xl flex flex-col min-h-[640px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-emerald-500/20 bg-[#052216] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm tracking-tight">
                    3. Prontos (Expedição / Balcão)
                  </h2>
                  <p className="text-[11px] text-emerald-300/70">
                    Aguardando garçom servir na mesa ou balcão
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl font-mono font-black text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {readyOrders.length}
              </span>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[calc(100vh-230px)]">
              {readyOrders.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-800/80 rounded-2xl text-zinc-500">
                  <PackageCheck className="w-8 h-8 text-zinc-700 mb-2" />
                  <span className="font-bold text-xs text-zinc-400">Nenhum pedido aguardando expedição</span>
                  <span className="text-[11px] text-zinc-600 mt-1">Pratos finalizados na chapa ficarão visíveis aqui</span>
                </div>
              ) : (
                readyOrders.map((order) => {
                  const elapsed = getElapsedMinutes(order.timestamp);

                  return (
                    <div
                      key={order.id}
                      className="bg-[#15151c] border border-emerald-500/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 animate-fade-in"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            {order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" />
                            Pronto para Servir
                          </span>
                        </div>

                        {/* Customer & Mesa */}
                        <div className="mt-2 font-black text-white text-base">
                          {order.customerName}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                          {order.tableNumber && (
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{order.tableNumber}</span>
                            </span>
                          )}
                        </div>

                        {/* Items list */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 space-y-1 text-xs text-zinc-300">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between py-0.5">
                              <span>
                                <strong className="text-white font-mono">{item.quantity}x</strong> {item.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Status indicator: Prato pronto na praça aguardando garçom */}
                      <div className="w-full mt-2 py-3 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                        <span>PRONTO NA PRAÇA • AGUARDANDO GARÇOM</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0a0a0d] border-t border-zinc-800/80 py-3.5 px-6 text-center text-xs text-zinc-500">
        <p>Sistema Web para Gerenciamento de Pedidos para Restaurantes • Módulo KDS da Cozinha • Banco Relacional SQLite • FATEC Franca 2026</p>
      </footer>
    </div>
  );
};
