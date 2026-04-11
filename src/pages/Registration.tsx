import { useState, useCallback } from 'react';
import { User as UserIcon, CreditCard, Check, ChevronRight } from 'lucide-react';
import { getAvatarUrl } from '../store';
import { getTelegramUser, hapticImpact, hapticNotification } from '../tma';
import { User } from '../types';
import { createUser, createAccount, checkNicknameExists, checkAccountExists, ACCOUNT_COLORS } from '../api';
import PinPad from '../components/PinPad';
import logo from '../assets/logo.png';

interface RegistrationProps {
  onComplete: (user: User, firstAccountId: string) => void;
}

type Step = 'welcome' | 'nickname' | 'account' | 'color' | 'pin' | 'confirm-pin' | 'done';

export default function Registration({ onComplete }: RegistrationProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [nickname, setNickname] = useState('');
  const [accountName, setAccountName] = useState('');
  const [selectedColor, setSelectedColor] = useState(ACCOUNT_COLORS[0].hex);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  const goNext = useCallback((nextStep: Step) => {
    hapticImpact('light');
    setFieldError('');
    setStep(nextStep);
  }, []);

  const handleNicknameSubmit = async () => {
    const trimmed = nickname.trim();
    if (trimmed.length < 3) {
      setFieldError('Минимум 3 символа');
      hapticNotification('error');
      return;
    }
    if (trimmed.length > 16) {
      setFieldError('Максимум 16 символов');
      hapticNotification('error');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setFieldError('Только латинские буквы, цифры и _');
      hapticNotification('error');
      return;
    }
    setLoading(true);
    const exists = await checkNicknameExists(trimmed);
    setLoading(false);
    if (exists) {
      setFieldError('Этот никнейм уже занят');
      hapticNotification('error');
      return;
    }
    goNext('account');
  };

  const handleAccountSubmit = async () => {
    const trimmed = accountName.trim().toLowerCase();
    if (trimmed.length < 1) {
      setFieldError('Введите название счёта');
      hapticNotification('error');
      return;
    }
    if (trimmed.length > 20) {
      setFieldError('Максимум 20 символов');
      hapticNotification('error');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setFieldError('Только латинские буквы, цифры, - и _');
      hapticNotification('error');
      return;
    }
    const fullName = `ub-${trimmed}`;
    setLoading(true);
    const exists = await checkAccountExists(fullName);
    setLoading(false);
    if (exists) {
      setFieldError('Такой счёт уже существует');
      hapticNotification('error');
      return;
    }
    setAccountName(trimmed);
    goNext('color');
  };

  const handlePinSet = (enteredPin: string) => {
    setPin(enteredPin);
    setPinError('');
    goNext('confirm-pin');
  };

  const handlePinConfirm = async (confirmedPin: string) => {
    if (confirmedPin !== pin) {
      setPinError('Коды не совпадают · попробуйте снова');
      return;
    }
    setLoading(true);
    try {
      const tgUser = getTelegramUser();
      const user = await createUser(
        nickname.trim(),
        pin,
        tgUser?.id ?? null,
        tgUser?.firstName ?? ''
      );
      const account = await createAccount(user.id, accountName, selectedColor);
      hapticNotification('success');
      setStep('done');
      setTimeout(() => {
        onComplete(user, account.id);
      }, 1500);
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Ошибка регистрации';
      setPinError(msg + ' — ' + new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 animate-fade-in">
        <img
          src={logo}
          alt="UnitBank"
          className="w-20 h-20 rounded-3xl shadow-lg shadow-primary/30 mb-6"
        />
        <h1 className="text-3xl font-bold text-on-surface mb-2">UnitBank</h1>
        <p className="text-on-surface-variant text-center text-sm mb-10 max-w-[260px]">
          Виртуальный банк для вашего Minecraft-сервера
        </p>
        <button
          onClick={() => goNext('nickname')}
          className="bg-primary text-white px-10 py-3.5 rounded-full font-semibold text-base
            shadow-lg shadow-primary/30 active:scale-95 transition-transform"
        >
          Создать аккаунт
        </button>
      </div>
    );
  }

  if (step === 'nickname') {
    return (
      <div className="flex flex-col min-h-full px-6 pt-16 animate-fade-in">
        <div className="w-14 h-14 bg-primary-light rounded-2xl flex items-center justify-center mb-6">
          <UserIcon className="w-7 h-7 text-primary-dark" />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Ваш никнейм</h1>
        <p className="text-on-surface-variant text-sm mb-8">Введите ваш никнейм из Minecraft</p>

        <div className="relative">
          <input
            type="text"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setFieldError('');
            }}
            placeholder="Например: Steve"
            autoFocus
            maxLength={16}
            className="w-full bg-white border-2 border-outline/50 rounded-2xl px-5 py-4 text-base
              text-on-surface placeholder:text-on-surface-variant/50
              focus:border-primary focus:outline-none transition-colors"
          />
          {nickname.length >= 3 && (
            <img
              src={getAvatarUrl(nickname.trim(), 40)}
              alt=""
              className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg"
            />
          )}
        </div>
        {fieldError && (
          <p className="text-error text-sm mt-2 animate-fade-in">{fieldError}</p>
        )}

        <button
          onClick={handleNicknameSubmit}
          disabled={loading}
          className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold
            flex items-center justify-center gap-2 self-end
            shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-60"
        >
          {loading ? 'Проверка...' : <>Далее <ChevronRight className="w-5 h-5" /></>}
        </button>
      </div>
    );
  }

  if (step === 'account') {
    return (
      <div className="flex flex-col min-h-full px-6 pt-16 animate-fade-in">
        <div className="w-14 h-14 bg-primary-light rounded-2xl flex items-center justify-center mb-6">
          <CreditCard className="w-7 h-7 text-primary-dark" />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Первый счёт</h1>
        <p className="text-on-surface-variant text-sm mb-8">
          Придумайте название для вашего первого счёта
        </p>

        <div className="flex items-center bg-white border-2 border-outline/50 rounded-2xl overflow-hidden focus-within:border-primary transition-colors">
          <span className="pl-5 text-on-surface-variant font-medium text-base">ub-</span>
          <input
            type="text"
            value={accountName}
            onChange={(e) => {
              setAccountName(e.target.value.toLowerCase());
              setFieldError('');
            }}
            placeholder="main"
            autoFocus
            maxLength={20}
            className="flex-1 py-4 pr-5 text-base text-on-surface placeholder:text-on-surface-variant/50
              focus:outline-none bg-transparent"
          />
        </div>
        {fieldError && (
          <p className="text-error text-sm mt-2 animate-fade-in">{fieldError}</p>
        )}
        <p className="text-on-surface-variant/60 text-xs mt-3">
          Полное имя:{' '}
          <span className="font-medium text-on-surface-variant">
            ub-{accountName || '...'}
          </span>
        </p>

        <button
          onClick={handleAccountSubmit}
          disabled={loading}
          className="mt-8 bg-primary text-white px-8 py-3.5 rounded-full font-semibold
            flex items-center justify-center gap-2 self-end
            shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-60"
        >
          {loading ? 'Проверка...' : <>Далее <ChevronRight className="w-5 h-5" /></>}
        </button>
      </div>
    );
  }

  if (step === 'color') {
    return (
      <div className="flex flex-col min-h-full px-6 pt-16 animate-fade-in">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300"
          style={{ background: selectedColor }}
        >
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Цвет карточки</h1>
        <p className="text-on-surface-variant text-sm mb-8">
          Выберите цвет для вашего счёта
        </p>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => {
                setSelectedColor(c.hex);
                hapticImpact('light');
              }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className="w-14 h-14 rounded-2xl transition-all duration-200 flex items-center justify-center"
                style={{
                  background: c.hex,
                  boxShadow:
                    selectedColor === c.hex
                      ? `0 0 0 3px white, 0 0 0 5px ${c.hex}`
                      : 'none',
                  transform: selectedColor === c.hex ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {selectedColor === c.hex && (
                  <div className="w-3 h-3 bg-white rounded-full" />
                )}
              </div>
              <span className="text-xs text-on-surface-variant">{c.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => goNext('pin')}
          className="mt-auto bg-primary text-white px-8 py-3.5 rounded-full font-semibold
            flex items-center justify-center gap-2 self-end
            shadow-lg shadow-primary/30 active:scale-95 transition-transform"
        >
          Далее <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  if (step === 'pin') {
    return (
      <div className="min-h-full animate-fade-in">
        <PinPad
          title="Придумайте код-пароль"
          subtitle="4 цифры для быстрого входа"
          pinLength={4}
          onComplete={handlePinSet}
        />
      </div>
    );
  }

  if (step === 'confirm-pin') {
    return (
      <div className="min-h-full animate-fade-in">
        <PinPad
          title="Повторите код-пароль"
          subtitle="Введите код ещё раз"
          pinLength={4}
          error={pinError}
          onComplete={handlePinConfirm}
          disabled={loading}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 animate-scale-in">
      <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-6">
        <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
      </div>
      <h1 className="text-2xl font-bold text-on-surface mb-2">Готово!</h1>
      <p className="text-on-surface-variant text-center text-sm">
        Добро пожаловать в UnitBank
      </p>
    </div>
  );
}
