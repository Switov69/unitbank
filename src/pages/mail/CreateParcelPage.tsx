import { useState } from 'react';
import { ChevronRight, ArrowLeft, Check, Package, ToggleLeft, ToggleRight } from 'lucide-react';
import { createParcel, OFFICES } from '../../api';
import { User } from '../../types';
import { hapticImpact, hapticNotification } from '../../tma';
import { formatAmount } from '../../store';

interface CreateParcelPageProps {
  user: User;
  onCreated: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 'review' | 'done';

export default function CreateParcelPage({ user, onCreated }: CreateParcelPageProps) {
  const [step, setStep] = useState<Step>(1);
  const [recipientNick, setRecipientNick] = useState('');
  const [description, setDescription] = useState('');
  const [fromOfficeId, setFromOfficeId] = useState('');
  const [toOfficeId, setToOfficeId] = useState('');
  const [cashOnDelivery, setCashOnDelivery] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fromOffice = OFFICES.find((o) => o.id === fromOfficeId);
  const toOffice = OFFICES.find((o) => o.id === toOfficeId);

  const next = (nextStep: Step) => {
    hapticImpact('light');
    setError('');
    setStep(nextStep);
  };

  const goStep2 = () => {
    if (!recipientNick.trim()) { setError('Введите никнейм получателя'); return; }
    if (recipientNick.trim().toLowerCase() === user.nickname.toLowerCase()) { setError('Нельзя отправить самому себе'); return; }
    next(2);
  };

  const goStep3 = () => {
    if (!description.trim()) { setError('Добавьте описание посылки'); return; }
    next(3);
  };

  const goStep4 = () => {
    if (!fromOfficeId) { setError('Выберите отделение отправки'); return; }
    next(4);
  };

  const goStep5 = () => {
    if (!toOfficeId) { setError('Выберите отделение доставки'); return; }
    next(5);
  };

  const goStep6 = () => {
    if (cashOnDelivery) {
      const n = parseFloat(cashAmount);
      if (isNaN(n) || n <= 0) { setError('Укажите сумму наложенного платежа'); return; }
    }
    next('review');
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createParcel({
        senderNickname: user.nickname,
        recipientNickname: recipientNick.trim(),
        description: description.trim(),
        fromOfficeId,
        toOfficeId,
        cashOnDelivery,
        cashAmount: cashOnDelivery ? parseFloat(cashAmount) : 0,
      });
      hapticNotification('success');
      setStep('done');
      setTimeout(onCreated, 1500);
    } catch (e: unknown) {
      setError((e as Error).message || 'Ошибка создания посылки');
      hapticNotification('error');
      setStep('review');
    } finally {
      setLoading(false);
    }
  };

  const progressWidth = () => {
    const map: Record<string, number> = { 1: 14, 2: 28, 3: 42, 4: 57, 5: 71, review: 100, done: 100 };
    return map[String(step)] ?? 85;
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 animate-scale-in">
        <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Посылка создана!</h1>
        <p className="text-on-surface-variant text-sm text-center max-w-[260px]">
          Перейдите в отделение и положите посылку. Не забудьте нажать «Отправил».
        </p>
      </div>
    );
  }

  const renderStep = () => {
    if (step === 1) {
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">1/5</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Получатель</p>
              <p className="text-xs text-on-surface-variant">Никнейм игрока в Minecraft</p>
            </div>
          </div>
          <input
            type="text"
            value={recipientNick}
            onChange={(e) => { setRecipientNick(e.target.value); setError(''); }}
            placeholder="Например: Steve"
            autoFocus
            maxLength={16}
            className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-5 py-4 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
          />
          {error && <p className="text-error text-sm mt-2">{error}</p>}
          <button onClick={goStep2} className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold flex items-center gap-2 self-end">
            Далее <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <button onClick={() => next(1)} className="flex items-center gap-2 text-on-surface-variant mb-6 active:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">2/5</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Описание</p>
              <p className="text-xs text-on-surface-variant">Что находится в посылке?</p>
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setError(''); }}
            placeholder="Например: алмазный меч, 64 камня..."
            autoFocus
            maxLength={200}
            rows={4}
            className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-5 py-4 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors resize-none"
          />
          {error && <p className="text-error text-sm mt-2">{error}</p>}
          <button onClick={goStep3} className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold flex items-center gap-2 self-end">
            Далее <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <button onClick={() => next(2)} className="flex items-center gap-2 text-on-surface-variant mb-6 active:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">3/5</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Отделение отправки</p>
              <p className="text-xs text-on-surface-variant">Откуда отправляете посылку</p>
            </div>
          </div>
          <div className="space-y-3">
            {OFFICES.map((o) => (
              <button
                key={o.id}
                onClick={() => { setFromOfficeId(o.id); setError(''); }}
                className={`w-full rounded-2xl p-4 border-2 text-left transition-all duration-200 ${fromOfficeId === o.id ? 'border-primary bg-primary-surface' : 'border-outline/50 bg-surface'}`}
              >
                <p className={`text-sm font-semibold ${fromOfficeId === o.id ? 'text-primary-dark' : 'text-on-surface'}`}>{o.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{o.region}, {o.city}, {o.address}</p>
              </button>
            ))}
          </div>
          {error && <p className="text-error text-sm mt-2">{error}</p>}
          <button onClick={goStep4} className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold flex items-center gap-2 self-end">
            Далее <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === 4) {
      const available = OFFICES.filter((o) => o.id !== fromOfficeId);
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <button onClick={() => next(3)} className="flex items-center gap-2 text-on-surface-variant mb-6 active:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">4/5</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Отделение доставки</p>
              <p className="text-xs text-on-surface-variant">Куда доставить посылку</p>
            </div>
          </div>
          <div className="space-y-3">
            {available.map((o) => (
              <button
                key={o.id}
                onClick={() => { setToOfficeId(o.id); setError(''); }}
                className={`w-full rounded-2xl p-4 border-2 text-left transition-all duration-200 ${toOfficeId === o.id ? 'border-primary bg-primary-surface' : 'border-outline/50 bg-surface'}`}
              >
                <p className={`text-sm font-semibold ${toOfficeId === o.id ? 'text-primary-dark' : 'text-on-surface'}`}>{o.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{o.region}, {o.city}, {o.address}</p>
              </button>
            ))}
          </div>
          {error && <p className="text-error text-sm mt-2">{error}</p>}
          <button onClick={goStep5} className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold flex items-center gap-2 self-end">
            Далее <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <button onClick={() => next(4)} className="flex items-center gap-2 text-on-surface-variant mb-6 active:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
              <span className="text-primary font-bold text-sm">5/5</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Наложенный платёж</p>
              <p className="text-xs text-on-surface-variant">Получатель оплачивает при получении</p>
            </div>
          </div>
          <div className="bg-surface rounded-2xl border border-outline/20 px-5 py-4 flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-on-surface">Включить услугу</p>
            <button onClick={() => { setCashOnDelivery((v) => !v); hapticImpact('light'); }}>
              {cashOnDelivery
                ? <ToggleRight className="w-8 h-8 text-primary" />
                : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
            </button>
          </div>
          {cashOnDelivery && (
            <div className="animate-fade-in">
              <label className="text-sm font-medium text-on-surface-variant mb-2 block">Сумма (CBC)</label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => { setCashAmount(e.target.value); setError(''); }}
                placeholder="0.00"
                min="0"
                step="0.01"
                autoFocus
                className="w-full bg-surface border-2 border-outline/50 rounded-2xl px-4 py-4 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
              />
            </div>
          )}
          {error && <p className="text-error text-sm mt-2">{error}</p>}
          <button onClick={goStep6} className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold flex items-center gap-2 self-end">
            Проверить <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      );
    }

    if (step === 'review') {
      return (
        <div className="flex flex-col min-h-full px-4 pt-6 animate-fade-in pb-8">
          <button onClick={() => next(5)} className="flex items-center gap-2 text-on-surface-variant mb-6 active:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Назад
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-success-light rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">Проверьте данные</p>
              <p className="text-xs text-on-surface-variant">Убедитесь, что всё верно</p>
            </div>
          </div>
          <div className="bg-surface rounded-2xl border border-outline/20 divide-y divide-outline/20 mb-6">
            {[
              ['От', user.nickname],
              ['Кому', recipientNick.trim()],
              ['Описание', description.trim()],
              ['Отправка', fromOffice ? `${fromOffice.name}, ${fromOffice.city}` : '—'],
              ['Доставка', toOffice ? `${toOffice.name}, ${toOffice.city}` : '—'],
              cashOnDelivery ? ['Наложенный платёж', `${formatAmount(parseFloat(cashAmount || '0'))} CBC`] : null,
            ].filter(Boolean).map(([label, value]) => (
              <div key={label} className="flex justify-between px-4 py-3">
                <span className="text-sm text-on-surface-variant">{label}</span>
                <span className="text-sm font-medium text-on-surface text-right max-w-[55%] truncate">{value}</span>
              </div>
            ))}
          </div>
          {error && <p className="text-error text-sm mb-3">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {loading ? 'Создание...' : 'Готово — создать посылку'}
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-on-surface">Новая посылка</h1>
        <div className="mt-3 h-1.5 bg-outline/20 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-400" style={{ width: `${progressWidth()}%` }} />
        </div>
      </div>
      {renderStep()}
    </div>
  );
}
