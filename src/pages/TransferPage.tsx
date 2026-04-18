import { useState, useEffect } from 'react';
import { ArrowLeft, Send, Check } from 'lucide-react';
import { getAccounts, transfer, checkAccountExists } from '../api';
import { formatAmount, getSettings } from '../store';
import { hapticNotification, hapticImpact } from '../tma';
import { BankAccount } from '../types';

interface TransferPageProps {
  userId: string;
  selectedAccountId: string;
  onClose: () => void;
}

type Step = 'form' | 'confirm' | 'success';

export default function TransferPage({ userId, selectedAccountId, onClose }: TransferPageProps) {
  const [step, setStep] = useState<Step>('form');
  const [fromId, setFromId] = useState(selectedAccountId);
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const { incognitoMode } = getSettings();

  useEffect(() => { getAccounts(userId).then(setAccounts); }, [userId]);

  const fromAccount = accounts.find((a) => a.id === fromId);

  const handleSubmit = async () => {
    const trimAccount = toAccount.trim();
    const numAmount = parseFloat(amount);
    if (!trimAccount) { setError('Введите счёт получателя'); hapticNotification('error'); return; }
    if (isNaN(numAmount) || numAmount <= 0) { setError('Введите корректную сумму'); hapticNotification('error'); return; }
    if (!fromAccount || fromAccount.balance < numAmount) { setError('Недостаточно средств'); hapticNotification('error'); return; }
    setLoading(true);
    const exists = await checkAccountExists(trimAccount);
    setLoading(false);
    if (!exists) { setError('Счёт получателя не найден'); hapticNotification('error'); return; }
    setError('');
    hapticImpact('medium');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setLoading(true);
    const result = await transfer(fromId, toAccount.trim(), parseFloat(amount));
    setLoading(false);
    if (result.success) {
      hapticNotification('success');
      setStep('success');
      setTimeout(onClose, 1500);
    } else {
      setError(result.error || 'Ошибка перевода');
      hapticNotification('error');
      setStep('form');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 bg-bg animate-scale-in">
        <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Переведено!</h1>
        <p className="text-on-surface-variant text-center text-sm">
          {formatAmount(parseFloat(amount))} CBC → {toAccount.trim()}
        </p>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="min-h-full flex flex-col bg-bg animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={() => setStep('form')} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Подтверждение</h1>
        </div>
        <div className="flex-1 px-4 pt-6">
          <div className="bg-surface rounded-3xl p-6 border border-outline/20 space-y-4">
            <div className="text-center mb-4">
              <p className={`text-4xl font-extrabold text-on-surface ${incognitoMode ? 'blur-md select-none' : ''}`}>
                {formatAmount(parseFloat(amount))}
              </p>
              <p className="text-sm text-on-surface-variant mt-1">CBC</p>
            </div>
            <div className="space-y-3 pt-2 border-t border-outline/20">
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Откуда</span>
                <span className="text-sm font-medium text-on-surface">{fromAccount?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Счёт получателя</span>
                <span className="text-sm font-medium text-on-surface">{toAccount.trim()}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full mt-6 bg-primary text-white py-4 rounded-2xl font-semibold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Send className="w-5 h-5" /> Подтвердить перевод</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-bg animate-slide-up">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
          <ArrowLeft className="w-5 h-5 text-on-surface" />
        </button>
        <h1 className="text-xl font-bold text-on-surface">Перевод</h1>
      </div>
      <div className="flex-1 px-4 pt-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-on-surface-variant mb-2 block">Со счёта</label>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base text-on-surface focus:border-primary focus:outline-none transition-colors appearance-none"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name} — {formatAmount(acc.balance)} CBC</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface-variant mb-2 block">Счёт получателя</label>
          <input
            type="text"
            value={toAccount}
            onChange={(e) => { setToAccount(e.target.value.toLowerCase()); setError(''); }}
            placeholder="Введите счёт получателя"
            className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface-variant mb-2 block">Сумма (CBC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
          />
          {fromAccount && (
            <div className="flex justify-between mt-2">
              <p className="text-xs text-on-surface-variant">
                Доступно: <span className={`font-medium ${incognitoMode ? 'blur-sm select-none' : ''}`}>{formatAmount(fromAccount.balance)} CBC</span>
              </p>
              <button onClick={() => setAmount(fromAccount.balance.toString())} className="text-xs text-primary font-medium">Всё</button>
            </div>
          )}
        </div>
        {error && <p className="text-error text-sm font-medium animate-fade-in">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform mt-2 disabled:opacity-60"
        >
          {loading ? 'Проверка...' : 'Продолжить'}
        </button>
      </div>
    </div>
  );
}
