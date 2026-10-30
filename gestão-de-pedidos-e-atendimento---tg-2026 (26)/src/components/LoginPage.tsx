import React, { useState } from 'react';
import { ViewMode, User, RestaurantConfig, UserRole } from '../types';
import { Lock, Mail, AlertCircle, UtensilsCrossed, ChefHat, ShieldCheck, Flame } from 'lucide-react';
import { api } from '../services/api';

interface LoginPageProps {
  onNavigate: (view: ViewMode) => void;
  onLogin: (user: User, restaurant?: RestaurantConfig) => void;
  users: User[];
  restaurants: RestaurantConfig[];
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigate,
  onLogin,
  restaurants,
}) => {
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigateByRole = (usr: User) => {
    if (usr.role === 'garcom') {
      onNavigate('waiter_orders');
    } else if (usr.role === 'kitchen') {
      onNavigate('kitchen_kds');
    } else {
      // manager, owner, admin
      onNavigate('admin');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    const trimmedEmail = loginEmail.trim().toLowerCase();

    try {
      const res = await api.login(trimmedEmail, loginPassword);
      onLogin(res.user, res.restaurant);
      navigateByRole(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = async (userEmail: string, pass: string) => {
    setLoginEmail(userEmail);
    setLoginPassword(pass);
    setLoginError('');
    setLoading(true);

    try {
      const res = await api.login(userEmail, pass);
      onLogin(res.user, res.restaurant);
      navigateByRole(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Falha ao autenticar com as credenciais selecionadas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Bar */}
      <header className="w-full bg-[#0d0d11] border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-white text-sm tracking-tight block">
              Sistema Web para Gerenciamento de Pedidos para Restaurantes
            </span>
            <span className="text-[10px] text-zinc-400">
              Controle de Salão, Comandas e Esteira de Cozinha (KDS)
            </span>
          </div>
        </div>
        <span className="font-mono text-zinc-400 text-[11px] hidden sm:inline bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">
          FATEC FRANCA - TG 2026
        </span>
      </header>

      {/* Main Container - Centered Single Auth Card */}
      <main className="max-w-md mx-auto px-4 py-10 flex-1 w-full flex items-center justify-center">
        <div className="bg-[#111115] border border-zinc-800 rounded-3xl p-7 sm:p-8 w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-center text-rose-400 mx-auto mb-3 shadow-lg shadow-rose-950/20">
              <Lock className="w-6 h-6" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Acesso ao Sistema
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Informe suas credenciais para entrar no módulo operacional
            </p>
          </div>

          {loginError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                E-mail de Acesso
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="usuario@saborbrasa.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#09090c] border border-zinc-800 rounded-xl text-white text-xs sm:text-sm placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#09090c] border border-zinc-800 rounded-xl text-white text-xs sm:text-sm placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition shadow-lg shadow-rose-950/40 active:scale-98 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'AUTENTICANDO...' : 'ENTRAR NO SISTEMA'}
            </button>
          </form>

          {/* Quick Demo Access Buttons - Somente em ambiente de desenvolvimento (import.meta.env.DEV) */}
          {Boolean((import.meta as any).env?.DEV) && (
            <div className="mt-6 pt-5 border-t border-zinc-800/80">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-2.5">
                Acesso Demonstrativo por Função
              </span>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('garcom@saborbrasa.com', 'Garcom@2026')}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#17171d] hover:bg-amber-950/30 hover:border-amber-500/50 border border-zinc-800 text-left text-xs flex items-center justify-between text-zinc-200 transition group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-white group-hover:text-amber-400 transition">Perfil: Garçom</strong>
                      <span className="text-[10px] text-zinc-400">Módulo: Atendimento & Mesas</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-amber-400 font-semibold">Acessar →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('cozinha@saborbrasa.com', 'Cozinha@2026')}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#17171d] hover:bg-rose-950/30 hover:border-rose-500/50 border border-zinc-800 text-left text-xs flex items-center justify-between text-zinc-200 transition group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-white group-hover:text-rose-400 transition">Perfil: Cozinha</strong>
                      <span className="text-[10px] text-zinc-400">Módulo: Esteira KDS</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-rose-400 font-semibold">Acessar →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('gerente@saborbrasa.com', 'Gerente@2026')}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#17171d] hover:bg-cyan-950/30 hover:border-cyan-500/50 border border-zinc-800 text-left text-xs flex items-center justify-between text-zinc-200 transition group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-white group-hover:text-cyan-400 transition">Perfil: Gerente</strong>
                      <span className="text-[10px] text-zinc-400">Módulo: Gestão Administrativa</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-semibold">Acessar →</span>
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 text-center">
            <span className="text-[11px] text-zinc-500">
              Novos colaboradores são cadastrados exclusivamente pelo Gerente (RF001).
            </span>
          </div>
        </div>
      </main>

      <footer className="w-full bg-[#09090c] border-t border-zinc-900 py-3.5 px-6 text-center text-xs text-zinc-500">
        <p>Sistema Web para Gerenciamento de Pedidos para Restaurantes • Autenticação Segura JWT • Banco Relacional SQLite • FATEC Franca 2026</p>
      </footer>
    </div>
  );
};
