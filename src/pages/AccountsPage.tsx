import { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowUpRight, ArrowDownLeft, Landmark, RotateCcw, Send } from 'lucide-react';
import { getAccounts, getTransactions } from '../api';
import { formatAmount, formatDate, darkenHex, getSettings } from '../store';
import { Transaction, BankAccount } from '../types';

interface AccountsPageProps {
  userId: string;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onTransfer: () => void;
  onNewAccount: () => void;
  refreshKey: number;
}

function getTxIcon(type: Transaction['type']) {
  switch (type) {
    case 'income':
      return <ArrowDownLeft className="w-5 h-5" />;
    case 'expense':
      return <ArrowUpRight className="w-5 h-5" />;
    case 'credit':
      return <Landmark className="w-5 h-5" />;
    case 'credit_repay':
      return <RotateCcw className="w-5 h-5" />;
  }
}

function getTxColor(type: Transaction['type']) {
  switch (type) {
    case 'income':
    case 'credit':
      return { bg: 'bg-success-light', text: 'text-success' };
    case 'expense':
    case 'credit_repay':
      return { bg: 'bg-error-light', text: 'text-error' };
  }
}

export default function AccountsPage({
  userId,
  selectedAccountId,
  onSelectAccount,
  onTransfer,
  onNewAccount,
  refreshKey,
}: AccountsPageProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { incognitoMode } = getSettings();

  const activeAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getAccounts(userId);
      setAccounts(data);
    } catch {}
  }, [userId]);

  const fetchTransactions = useCallback(async () => {
    if (!activeAccount) {
      setTransactions([]);
      return;
    }
    try {
      const data = await getTransactions(activeAccount.id);
      setTransactions(data);
    } catch {}
  }, [activeAccount?.id]);

  useEffect(() => {
    setLoading(true);
    fetchAccounts().finally(() => setLoading(false));
  }, [fetchAccounts, refreshKey]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, refreshKey]);

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
        <button
          onClick={onNewAccount}
          className="bg-primary text-white px-6 py-3 rounded-full font-semibold"
        >
          Создать счёт
        </button>
      </div>
    );
  }

  const cardBg = activeAccount
    ? `linear-gradient(135deg, ${activeAccount.color} 0%, ${darkenHex(activeAccount.color)} 100%)`
    : 'linear-gradient(135deg, #4285f4 0%, #1a5cc8 100%)';

  return (
    <div className="px-4 pt-2 pb-24 animate-fade-in">
      <h1 className="text-2xl font-bold text-on-surface mb-4">Счета</h1>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5 -mx-4 px-4">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccount?.id;
          return (
            <button
              key={acc.id}
              onClick={() => onSelectAccount(acc.id)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                isActive ? 'text-white shadow-md' : 'bg-white text-on-surface-variant border border-outline/50'
              }`}
              style={isActive ? { background: acc.color } : {}}
            >
              {acc.name}
            </button>
          );
        })}
        {accounts.length < 2 && (
          <button
            onClick={onNewAccount}
            className="px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium flex-shrink-0
              bg-primary-surface text-primary border border-primary/20 active:bg-primary-light
              flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Новый
          </button>
        )}
      </div>

      {activeAccount && (
        <div
          className="rounded-[28px] p-6 text-white shadow-xl mb-6"
          style={{ background: cardBg, boxShadow: `0 12px 40px ${activeAccount.color}40` }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-white/70">{activeAccount.name}</span>
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
              <span className="text-xs font-bold">₡</span>
            </div>
          </div>
          <p
            className={`text-4xl font-extrabold tracking-tight transition-all ${
              incognitoMode ? 'blur-md select-none' : ''
            }`}
          >
            {formatAmount(activeAccount.balance)}
          </p>
          <p className="text-sm text-white/60 mt-1 font-medium">CBC</p>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onTransfer}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 active:bg-white/10
                backdrop-blur-sm px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
            >
              <Send className="w-4 h-4" /> Перевести
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-on-surface mb-3">Последние операции</h2>
        {transactions.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-outline/20">
            <p className="text-on-surface-variant text-sm">Операций пока нет</p>
            <p className="text-on-surface-variant/50 text-xs mt-1">
              Сделайте первый перевод или оформите кредит
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const color = getTxColor(tx.type);
              const isPositive = tx.type === 'income' || tx.type === 'credit';
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-outline/10 shadow-sm"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg} ${color.text}`}
                  >
                    {getTxIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {tx.description}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-bold flex-shrink-0 ${color.text} ${
                      incognitoMode ? 'blur-md select-none' : ''
                    }`}
                  >
                    {isPositive ? '+' : '-'}
                    {formatAmount(tx.amount)}
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
