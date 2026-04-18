import { useState, useEffect } from 'react';
import { ArrowLeft, Landmark, Check, AlertCircle, ChevronRight, Wallet, Clock } from 'lucide-react';
import { User, Credit, BankAccount } from '../types';
import { getCredits, requestCredit, repayCredit, getAccounts } from '../api';
import { formatAmount, formatShortDate, getSettings } from '../store';
import { calcCurrentInterest } from '../api';
import { hapticNotification } from '../tma';

interface CreditsPageProps {
  user: User;
  refreshKey: number;
  onRefresh: () => void;
}

const CREDIT_LIMIT = 50;
const INTEREST_RATE = 0.02;

function getTotalDebt(credits: Credit[]): number {
  return credits
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (c.amount - c.paidAmount), 0);
}

function getAvailableCredit(credits: Credit[]): number {
  return Math.max(0, Math.round((CREDIT_LIMIT - getTotalDebt(credits)) * 100) / 100);
}

type View = 'list' | 'form' | 'repay' | 'pending';

export default function CreditsPage({ user, refreshKey, onRefresh }: CreditsPageProps) {
  const [view, setView] = useState<View>('list');
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const { incognitoMode } = getSettings();

  useEffect(() => {
    Promise.all([getCredits(user.id), getAccounts(user.id)]).then(([c, a]) => {
      setCredits(c);
      setAccounts(a);
      if (a.length > 0 && !selectedAccountId) setSelectedAccountId(a[0].id);
    });
  }, [user.id, refreshKey]);

  const totalDebt = getTotalDebt(credits);
  const available = getAvailableCredit(credits);

  const resetForm = () => {
    setAmount('');
    setPurpose('');
    setError('');
    setSuccess('');
  };

  const openForm = () => {
    resetForm();
    setView('form');
  };

  const openRepay = (creditId: string) => {
    resetForm();
    setSelectedCreditId(creditId);
    setView('repay');
  };

  const handleTakeCredit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Введите корректную сумму');
      hapticNotification('error');
      return;
    }
    if (num > available) {
      setError(`Максимум: ${formatAmount(available)} CBC`);
      hapticNotification('error');
      return;
    }
    if (!purpose.trim()) {
      setError('Укажите цель кредита');
      hapticNotification('error');
      return;
    }
    if (!selectedAccountId) {
      setError('Выберите счёт');
      hapticNotification('error');
      return;
    }
    setLoading(true);
    try {
      await requestCredit(user.id, selectedAccountId, num, purpose.trim());
      hapticNotification('success');
      onRefresh();
      setView('pending');
    } catch (e: unknown) {
      setError((e as Error).message || 'Ошибка оформления кредита');
      hapticNotification('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRepay = async () => {
    if (!selectedCreditId) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Введите корректную сумму');
      hapticNotification('error');
      return;
    }
    setLoading(true);
    const result = await repayCredit(selectedCreditId, num, selectedAccountId);
    setLoading(false);
    if (result.success) {
      hapticNotification('success');
      setSuccess('Платёж принят!');
      onRefresh();
      setTimeout(() => {
        setView('list');
        setSuccess('');
      }, 1500);
    } else {
      setError(result.error || 'Ошибка погашения');
      hapticNotification('error');
    }
  };

  if (view === 'pending') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 bg-bg animate-scale-in gap-4">
        <div className="w-20 h-20 bg-warning-light rounded-full flex items-center justify-center">
          <Clock className="w-10 h-10 text-warning" />
        </div>
        <h1 className="text-xl font-bold text-on-surface text-center">Заявка отправлена!</h1>
        <p className="text-on-surface-variant text-sm text-center max-w-[280px]">
          Ваш кредит проходит проверку. Администратор рассмотрит заявку в ближайшее время.
          Вы получите уведомление в Telegram.
        </p>
        <button
          onClick={() => setView('list')}
          className="mt-4 bg-primary text-white px-8 py-3.5 rounded-full font-semibold
            shadow-lg shadow-primary/30 active:scale-95 transition-transform"
        >
          Понятно
        </button>
      </div>
    );
  }

  if (view === 'repay' && selectedCreditId) {
    const credit = credits.find((c) => c.id === selectedCreditId);
    if (!credit) return null;
    const remaining = Math.round((credit.amount - credit.paidAmount) * 100) / 100;
    const currentInterest = calcCurrentInterest(credit);
    const totalToPay = Math.round((remaining + currentInterest) * 100) / 100;
    const fromAccount = accounts.find((a) => a.id === selectedAccountId);

    return (
      <div className="min-h-full flex flex-col bg-bg animate-slide-up px-4 pt-4 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20"
          >
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Погашение кредита</h1>
        </div>

        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-scale-in">
            <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-4">
              <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
            </div>
            <p className="text-lg font-semibold text-on-surface">{success}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface rounded-3xl p-5 border border-outline/20">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-on-surface-variant">Основной долг</span>
                <span className={`text-sm font-medium ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                  {formatAmount(remaining)} CBC
                </span>
              </div>
              {currentInterest > 0 && (
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-on-surface-variant">Начисленный процент</span>
                  <span className={`text-sm font-medium text-warning ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                    +{formatAmount(currentInterest)} CBC
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-outline/20 pt-2">
                <span className="text-sm font-semibold text-on-surface-variant">Итого к оплате</span>
                <span className={`text-sm font-bold text-error ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                  {formatAmount(totalToPay)} CBC
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-2 block">Со счёта</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base
                  text-on-surface focus:border-primary focus:outline-none transition-colors appearance-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} — {formatAmount(acc.balance)} CBC
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-on-surface-variant mb-2 block">
                Сумма погашения (CBC)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base
                  text-on-surface placeholder:text-on-surface-variant/50
                  focus:border-primary focus:outline-none transition-colors"
              />
              <div className="flex justify-between mt-2">
                <p className="text-xs text-on-surface-variant">
                  Остаток: {formatAmount(remaining)} CBC
                </p>
                {fromAccount && (
                  <button
                    onClick={() =>
                      setAmount(Math.min(totalToPay, fromAccount.balance).toString())
                    }
                    className="text-xs text-primary font-medium"
                  >
                    Погасить всё
                  </button>
                )}
              </div>
            </div>

            {error && <p className="text-error text-sm font-medium animate-fade-in">{error}</p>}

            <button
              onClick={handleRepay}
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-base
                shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {loading ? 'Обработка...' : 'Погасить'}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'form') {
    return (
      <div className="min-h-full flex flex-col bg-bg animate-slide-up px-4 pt-4 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20"
          >
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Оформить кредит</h1>
        </div>

        <div className="space-y-4">
          <div className="bg-primary-surface rounded-3xl p-5 border border-primary/10">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-on-surface">Условия кредита</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Максимальная сумма: {CREDIT_LIMIT} CBC. Ставка: {INTEREST_RATE * 100}% в неделю.
                  Проценты автоматически переводятся на счёт банка при погашении.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">На какой счёт</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base
                text-on-surface focus:border-primary focus:outline-none transition-colors appearance-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {formatAmount(acc.balance)} CBC
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">
              Сумма кредита (CBC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError('');
              }}
              placeholder="0.00"
              min="0"
              max={available}
              step="0.01"
              className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base
                text-on-surface placeholder:text-on-surface-variant/50
                focus:border-primary focus:outline-none transition-colors"
            />
            <p className="text-xs text-on-surface-variant mt-2">
              Доступно:{' '}
              <span className="font-medium">{formatAmount(available)} CBC</span> из{' '}
              {CREDIT_LIMIT}.00 CBC
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">Цель кредита</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                setError('');
              }}
              placeholder="Например: покупка ресурсов"
              maxLength={100}
              className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-3.5 text-base
                text-on-surface placeholder:text-on-surface-variant/50
                focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {error && <p className="text-error text-sm font-medium animate-fade-in">{error}</p>}

          <button
            onClick={handleTakeCredit}
            disabled={available <= 0 || loading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-base
              shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform
              disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? 'Отправка заявки...' : 'Оформить кредит'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-24 animate-fade-in">
      <h1 className="text-2xl font-bold text-on-surface mb-4">Кредиты</h1>

      <div className="bg-surface rounded-3xl p-5 border border-outline/20 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-on-surface-variant">Общий долг</p>
            <p className={`text-2xl font-bold text-on-surface ${incognitoMode ? 'blur-md select-none' : ''}`}>
              {formatAmount(totalDebt)}{' '}
              <span className="text-base font-medium text-on-surface-variant">CBC</span>
            </p>
          </div>
          <div className="w-12 h-12 bg-primary-surface rounded-2xl flex items-center justify-center">
            <Landmark className="w-6 h-6 text-primary" />
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-on-surface-variant mb-1.5">
            <span>Использовано</span>
            <span>
              {formatAmount(totalDebt)} / {CREDIT_LIMIT}.00 CBC
            </span>
          </div>
          <div className="h-2 bg-outline/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (totalDebt / CREDIT_LIMIT) * 100)}%` }}
            />
          </div>
        </div>

        <button
          onClick={openForm}
          disabled={available <= 0}
          className="w-full bg-primary text-white py-3 rounded-2xl font-semibold text-sm
            active:scale-[0.98] transition-transform disabled:opacity-50 mt-2"
        >
          {available > 0
            ? `Оформить кредит (до ${formatAmount(available)} CBC)`
            : 'Лимит исчерпан'}
        </button>
      </div>

      {credits.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-on-surface mb-3">История кредитов</h2>
          <div className="space-y-2">
            {credits
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((credit) => {
                const remaining = credit.amount - credit.paidAmount;
                const isActive = credit.status === 'active';
                const isPending = credit.status === 'pending';
                const currentInterest = calcCurrentInterest(credit);

                return (
                  <div
                    key={credit.id}
                    className="bg-surface rounded-2xl p-4 border border-outline/10 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isPending
                              ? 'bg-primary'
                              : isActive
                              ? 'bg-warning'
                              : credit.status === 'rejected'
                              ? 'bg-error'
                              : 'bg-success'
                          }`}
                        />
                        <span className={`text-sm font-medium text-on-surface ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                          {formatAmount(credit.amount)} CBC
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          isPending
                            ? 'bg-primary-surface text-primary'
                            : isActive
                            ? 'bg-warning-light text-warning'
                            : credit.status === 'rejected'
                            ? 'bg-error-light text-error'
                            : 'bg-success-light text-success'
                        }`}
                      >
                        {isPending
                          ? 'На проверке'
                          : isActive
                          ? 'Активный'
                          : credit.status === 'rejected'
                          ? 'Отклонён'
                          : 'Погашен'}
                      </span>
                    </div>

                    <div className="text-xs text-on-surface-variant space-y-1">
                      {credit.purpose && (
                        <div className="flex justify-between">
                          <span>Цель</span>
                          <span className="font-medium text-on-surface max-w-[180px] truncate text-right">
                            {credit.purpose}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Дата</span>
                        <span>{formatShortDate(credit.createdAt)}</span>
                      </div>
                      {isActive && (
                        <>
                          <div className="flex justify-between">
                            <span>Основной долг</span>
                            <span className={`font-medium text-error ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                              {formatAmount(remaining)} CBC
                            </span>
                          </div>
                          {currentInterest > 0 && (
                            <div className="flex justify-between">
                              <span>Проценты</span>
                              <span className={`font-medium text-warning ${incognitoMode ? 'blur-sm select-none' : ''}`}>
                                +{formatAmount(currentInterest)} CBC
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {isActive && (
                      <button
                        onClick={() => openRepay(credit.id)}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                          bg-primary-surface text-primary text-sm font-semibold
                          active:bg-primary-light transition-colors"
                      >
                        <Wallet className="w-4 h-4" /> Погасить <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {credits.length === 0 && (
        <div className="bg-surface rounded-3xl p-8 text-center border border-outline/20">
          <p className="text-on-surface-variant text-sm">У вас пока нет кредитов</p>
          <p className="text-on-surface-variant/50 text-xs mt-1">
            Вы можете взять до {CREDIT_LIMIT} CBC под {INTEREST_RATE * 100}% в неделю
          </p>
        </div>
      )}
    </div>
  );
}
