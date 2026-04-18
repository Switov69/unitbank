import { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Check } from 'lucide-react';
import { createAccount, checkAccountExists, getAccounts, ACCOUNT_COLORS } from '../api';
import { darkenHex } from '../store';
import { hapticNotification, hapticImpact } from '../tma';

interface NewAccountPageProps {
  userId: string;
  isPremium: boolean;
  onClose: () => void;
  onCreated: (accountId: string) => void;
}

export default function NewAccountPage({ userId, isPremium, onClose, onCreated }: NewAccountPageProps) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(ACCOUNT_COLORS[1].hex);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [atLimit, setAtLimit] = useState(false);

  const maxAccounts = isPremium ? 5 : 2;

  useEffect(() => {
    getAccounts(userId).then((accs) => { if (accs.length >= maxAccounts) setAtLimit(true); });
  }, [userId, maxAccounts]);

  const handleCreate = async () => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) { setError('Введите название счёта'); hapticNotification('error'); return; }
    if (trimmed.length > 20) { setError('Максимум 20 символов'); hapticNotification('error'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) { setError('Только латинские буквы, цифры, - и _'); hapticNotification('error'); return; }
    const fullName = `ub-${trimmed}`;
    setLoading(true);
    const exists = await checkAccountExists(fullName);
    if (exists) { setError('Такой счёт уже существует'); hapticNotification('error'); setLoading(false); return; }
    try {
      const account = await createAccount(userId, fullName, selectedColor);
      hapticNotification('success');
      setSuccess(true);
      setTimeout(() => onCreated(account.id), 1200);
    } catch (e: unknown) {
      setError((e as Error).message || 'Ошибка создания счёта');
      hapticNotification('error');
    } finally {
      setLoading(false);
    }
  };

  if (atLimit) {
    return (
      <div className="min-h-full flex flex-col bg-bg animate-slide-up">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Новый счёт</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 bg-warning-light rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <p className="text-lg font-semibold text-on-surface text-center mb-2">Лимит счетов</p>
          <p className="text-on-surface-variant text-sm text-center">
            Максимальное количество счетов — {maxAccounts}{isPremium ? ' (Premium)' : ''}. Удалите один из существующих, чтобы создать новый.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 bg-bg animate-scale-in">
        <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-bold text-on-surface mb-2">Счёт создан!</h1>
        <p className="text-on-surface-variant text-sm">ub-{name.trim().toLowerCase()}</p>
      </div>
    );
  }

  const cardBg = `linear-gradient(135deg, ${selectedColor} 0%, ${darkenHex(selectedColor)} 100%)`;

  return (
    <div className="min-h-full flex flex-col bg-bg animate-slide-up">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
          <ArrowLeft className="w-5 h-5 text-on-surface" />
        </button>
        <h1 className="text-xl font-bold text-on-surface">Новый счёт</h1>
      </div>
      <div className="flex-1 px-4 pt-4 space-y-5">
        <div className="rounded-[24px] p-5 text-white flex items-center gap-4 transition-all duration-300" style={{ background: cardBg }}>
          <CreditCard className="w-8 h-8 text-white/80" />
          <div>
            <p className="text-white/60 text-xs">Новый счёт</p>
            <p className="text-white font-bold text-base">ub-{name || '...'}</p>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface-variant mb-2 block">Название счёта</label>
          <div className="flex items-center bg-surface border-2 border-outline/50 rounded-2xl overflow-hidden focus-within:border-primary transition-colors">
            <span className="pl-5 text-on-surface-variant font-medium text-base">ub-</span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value.toLowerCase()); setError(''); }}
              placeholder="savings"
              autoFocus
              maxLength={20}
              className="flex-1 py-4 pr-5 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none bg-transparent"
            />
          </div>
          {error && <p className="text-error text-sm mt-2 animate-fade-in">{error}</p>}
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface-variant mb-3 block">Цвет карточки</label>
          <div className="grid grid-cols-4 gap-3">
            {ACCOUNT_COLORS.map((c) => (
              <button key={c.hex} onClick={() => { setSelectedColor(c.hex); hapticImpact('light'); }} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-14 h-14 rounded-2xl transition-all duration-200 flex items-center justify-center"
                  style={{ background: c.hex, boxShadow: selectedColor === c.hex ? `0 0 0 3px var(--color-bg), 0 0 0 5px ${c.hex}` : 'none', transform: selectedColor === c.hex ? 'scale(1.1)' : 'scale(1)' }}
                >
                  {selectedColor === c.hex && <div className="w-3 h-3 bg-white rounded-full" />}
                </div>
                <span className="text-xs text-on-surface-variant">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {loading ? 'Создание...' : 'Создать счёт'}
        </button>
      </div>
    </div>
  );
}
