import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, ArrowUpRight, ArrowDownLeft, Landmark, RotateCcw, Send, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { getAccounts, getTransactions, deleteAccount, updateAccount, ACCOUNT_COLORS } from '../api';
import { formatAmount, formatDate, darkenHex, getSettings } from '../store';
import { Transaction, BankAccount, User } from '../types';
import { hapticImpact, hapticNotification } from '../tma';

interface AccountsPageProps {
  user: User;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onTransfer: () => void;
  onNewAccount: () => void;
  refreshKey: number;
  onRefresh: () => void;
}

function getTxIcon(type: Transaction['type']) {
  switch (type) {
    case 'income': return <ArrowDownLeft className="w-5 h-5" />;
    case 'expense': return <ArrowUpRight className="w-5 h-5" />;
    case 'credit': return <Landmark className="w-5 h-5" />;
    case 'credit_repay': return <RotateCcw className="w-5 h-5" />;
    default: return <ArrowUpRight className="w-5 h-5" />;
  }
}

function getTxColor(type: Transaction['type']) {
  if (type === 'income' || type === 'credit') return { bg: 'bg-success-light', text: 'text-success' };
  return { bg: 'bg-error-light', text: 'text-error' };
}

type MenuState = { accountId: string; top: number } | null;
type EditState = { accountId: string; name: string; color: string } | null;

export default function AccountsPage({ user, selectedAccountId, onSelectAccount, onTransfer, onNewAccount, refreshKey, onRefresh }: AccountsPageProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<MenuState>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [cardAnimClass, setCardAnimClass] = useState('');
  const prevAccountIdxRef = useRef<number>(-1);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDataRef = useRef<{ balance: number; txCount: number } | null>(null);
  const { incognitoMode } = getSettings();

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  const fetchAll = useCallback(async (silent = false) => {
    try {
      const data = await getAccounts(user.id);
      setAccounts(data);
      if (!silent) setLoading(false);

      const active = data.find((a) => a.id === selectedAccountId) || data[0];
      if (active) {
        const txs = await getTransactions(active.id);
        const safeAmount = (v: unknown) => {
          const n = parseFloat(String(v));
          return isNaN(n) ? 0 : n;
        };
        const safeTxs = txs.map((t) => ({ ...t, amount: safeAmount(t.amount) }));
        const newBalance = safeAmount(active.balance);
        const newCount = safeTxs.length;
        if (!prevDataRef.current || prevDataRef.current.balance !== newBalance || prevDataRef.current.txCount !== newCount) {
          setTransactions(safeTxs);
          prevDataRef.current = { balance: newBalance, txCount: newCount };
        }
        setAccounts(data);
      }
    } catch {
      if (!silent) setLoading(false);
    }
  }, [user.id, selectedAccountId]);

  useEffect(() => {
    setLoading(true);
    prevDataRef.current = null;
    fetchAll();
  }, [fetchAll, refreshKey]);

  useEffect(() => {
    pollRef.current = setInterval(() => fetchAll(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  const handleSelectAccount = (id: string) => {
    const newIdx = accounts.findIndex((a) => a.id === id);
    const prevIdx = prevAccountIdxRef.current;
    if (prevIdx !== -1 && newIdx !== prevIdx) {
      const dir = newIdx > prevIdx ? 'animate-card-left' : 'animate-card-right';
      setCardAnimClass('');
      requestAnimationFrame(() => setCardAnimClass(dir));
    }
    prevAccountIdxRef.current = newIdx;
    onSelectAccount(id);
  };

  useEffect(() => {
    if (accounts.length > 0 && prevAccountIdxRef.current === -1) {
      prevAccountIdxRef.current = accounts.findIndex((a) => a.id === selectedAccountId);
    }
  }, [accounts, selectedAccountId]);

  const maxAccounts = user.isPremium ? 5 : 2;

  const openMenuFromBtn = (e: React.MouseEvent<HTMLButtonElement>, accountId: string) => {
    e.stopPropagation();
    hapticImpact('light');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ accountId, top: rect.bottom + 8 });
  };

  const openMenuFromChip = (e: React.MouseEvent<HTMLButtonElement>, accountId: string) => {
    e.preventDefault();
    hapticImpact('medium');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ accountId, top: rect.bottom + 8 });
  };

  const handleEditOpen = () => {
    if (!menu) return;
    const acc = accounts.find((a) => a.id === menu.accountId);
    if (!acc) return;
    setEditState({ accountId: acc.id, name: acc.name.replace(/^ub-/, ''), color: acc.color });
    setMenu(null);
  };

  const handleEditSave = async () => {
    if (!editState) return;
    setEditLoading(true);
    try {
      await updateAccount(editState.accountId, `ub-${editState.name}`, editState.color);
      hapticNotification('success');
      setEditState(null);
      onRefresh();
    } catch {
      hapticNotification('error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (accounts.length <= 1) { hapticNotification('error'); setDeleteConfirm(null); setMenu(null); return; }
    try {
      await deleteAccount(accountId);
      hapticNotification('success');
      setDeleteConfirm(null);
      setMenu(null);
      onRefresh();
    } catch {
      hapticNotification('error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 pt-16">
        <p className="text-on-surface-variant text-center mb-4">Нет счетов</p>
        <button onClick={onNewAccount} className="bg-primary text-white px-6 py-3 rounded-full font-semibold">Создать счёт</button>
      </div>
    );
  }

  const cardBg = activeAccount
    ? `linear-gradient(135deg, ${activeAccount.color} 0%, ${darkenHex(activeAccount.color)} 100%)`
    : 'linear-gradient(135deg, #4285f4 0%, #1a5cc8 100%)';

  return (
    <div className="px-4 pt-2 pb-24 animate-fade-in" onClick={() => menu && setMenu(null)}>
      <h1 className="text-2xl font-bold text-on-surface mb-4">Счета</h1>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5 -mx-4 px-4">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccount?.id;
          return (
            <button
              key={acc.id}
              onClick={() => handleSelectAccount(acc.id)}
              onContextMenu={(e) => openMenuFromChip(e as unknown as React.MouseEvent<HTMLButtonElement>, acc.id)}
              onTouchStart={(e) => {
                const target = e.currentTarget;
                const timer = setTimeout(() => {
                  const rect = target.getBoundingClientRect();
                  hapticImpact('medium');
                  setMenu({ accountId: acc.id, top: rect.bottom + 8 });
                }, 500);
                const cancel = () => clearTimeout(timer);
                target.addEventListener('touchend', cancel, { once: true });
                target.addEventListener('touchmove', cancel, { once: true });
              }}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                isActive ? 'text-white' : 'bg-surface text-on-surface-variant border border-outline/50'
              }`}
              style={isActive ? { background: acc.color } : {}}
            >
              {acc.name}
            </button>
          );
        })}
        {accounts.length < maxAccounts && (
          <button
            onClick={onNewAccount}
            className="px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium flex-shrink-0 bg-primary-surface text-primary border border-primary/20 active:bg-primary-light flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Новый
          </button>
        )}
      </div>

      {menu && (
        <div
          className="fixed z-50 bg-surface border border-outline/20 rounded-2xl overflow-hidden"
          style={{ top: menu.top, left: 16, right: 16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleEditOpen} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-bg transition-colors">
            <Pencil className="w-4 h-4 text-on-surface-variant" />
            <span className="text-sm font-medium text-on-surface">Изменить счёт</span>
          </button>
          <div className="h-px bg-outline/20 mx-4" />
          <button
            onClick={() => { setDeleteConfirm(menu.accountId); setMenu(null); }}
            disabled={accounts.length <= 1}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-bg transition-colors"
          >
            <Trash2 className="w-4 h-4 text-error" />
            <span className={`text-sm font-medium ${accounts.length <= 1 ? 'text-on-surface-variant/40' : 'text-error'}`}>
              {accounts.length <= 1 ? 'Нельзя удалить единственный счёт' : 'Удалить счёт'}
            </span>
          </button>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-on-surface/30">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-sm">
            <div className="w-14 h-14 bg-error-light rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-error" />
            </div>
            <h2 className="text-lg font-bold text-on-surface text-center mb-2">Удалить счёт?</h2>
            <p className="text-on-surface-variant text-sm text-center mb-6">
              Средства будут переведены на другой ваш счёт. Это действие необратимо.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-bg border border-outline/50 text-on-surface py-3 rounded-2xl font-semibold">Отмена</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-error text-white py-3 rounded-2xl font-semibold">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {editState && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-surface/30">
          <div className="bg-surface rounded-t-3xl p-6 w-full animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-on-surface">Изменить счёт</h2>
              <button onClick={() => setEditState(null)} className="w-8 h-8 rounded-xl flex items-center justify-center active:bg-bg">
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">Название</label>
            <div className="flex items-center bg-bg border-2 border-outline/50 rounded-2xl overflow-hidden focus-within:border-primary transition-colors mb-4">
              <span className="pl-4 text-on-surface-variant font-medium">ub-</span>
              <input
                type="text"
                value={editState.name}
                onChange={(e) => setEditState({ ...editState, name: e.target.value.toLowerCase() })}
                maxLength={20}
                className="flex-1 py-3.5 pr-4 text-base text-on-surface focus:outline-none bg-transparent"
              />
            </div>
            <label className="text-sm font-medium text-on-surface-variant mb-3 block">Цвет</label>
            <div className="grid grid-cols-4 gap-3 mb-5">
              {ACCOUNT_COLORS.map((c) => (
                <button key={c.hex} onClick={() => setEditState({ ...editState, color: c.hex })} className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-12 h-12 rounded-xl transition-all duration-200 flex items-center justify-center"
                    style={{
                      background: c.hex,
                      boxShadow: editState.color === c.hex ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${c.hex}` : 'none',
                      transform: editState.color === c.hex ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    {editState.color === c.hex && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={handleEditSave}
              disabled={editLoading || !editState.name.trim()}
              className="w-full bg-primary text-white py-4 rounded-2xl font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {editLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {activeAccount && (
        <div
          key={activeAccount.id}
          className={`rounded-[28px] p-6 text-white mb-6 ${cardAnimClass}`}
          style={{ background: cardBg, boxShadow: `0 12px 40px ${activeAccount.color}40` }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-white/70">{activeAccount.name}</span>
            <button
              onClick={(e) => openMenuFromBtn(e, activeAccount.id)}
              className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center"
            >
              <MoreVertical className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className={`text-4xl font-extrabold tracking-tight transition-all ${incognitoMode ? 'blur-md select-none' : ''}`}>
            {formatAmount(activeAccount.balance)}
          </p>
          <p className="text-sm text-white/60 mt-1 font-medium">CBC</p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={onTransfer}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 active:bg-white/10 backdrop-blur-sm px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
            >
              <Send className="w-4 h-4" /> Перевести
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-on-surface mb-3">Последние операции</h2>
        {transactions.length === 0 ? (
          <div className="bg-surface rounded-3xl p-8 text-center border border-outline/20">
            <p className="text-on-surface-variant text-sm">Операций пока нет</p>
            <p className="text-on-surface-variant/50 text-xs mt-1">Сделайте первый перевод или оформите кредит</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              if (!tx || !tx.id) return null;
              const color = getTxColor(tx.type);
              const isPositive = tx.type === 'income' || tx.type === 'credit';
              const amount = typeof tx.amount === 'number' && !isNaN(tx.amount) ? tx.amount : 0;
              return (
                <div
                  key={tx.id}
                  className="bg-surface rounded-2xl p-4 flex items-center gap-3 border border-outline/10"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg} ${color.text}`}>
                    {getTxIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{tx.description || '—'}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{tx.createdAt ? formatDate(tx.createdAt) : ''}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${color.text} ${incognitoMode ? 'blur-md select-none' : ''}`}>
                    {isPositive ? '+' : '-'}{formatAmount(amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
