import { useState } from 'react';
import { ArrowLeft, Lock, LogOut, Trash2, ChevronRight, Check, AlertTriangle, EyeOff, Bell, Shield, Send, Sun, Moon, Smartphone, Star } from 'lucide-react';
import { User } from '../types';
import { getAvatarUrl, formatShortDate, getSettings, saveSettings, applyTheme, Theme } from '../store';
import { updateUserPin, deleteUser, buyPremium } from '../api';
import { hapticNotification, hapticImpact } from '../tma';
import PinPad from '../components/PinPad';
import logo from '../assets/logo.png';

interface SettingsPageProps {
  user: User;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onUserUpdate: (user: User) => void;
}

type View = 'main' | 'change-pin-current' | 'change-pin-new' | 'change-pin-confirm' | 'delete-confirm' | 'theme' | 'premium';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => { hapticImpact('light'); onChange(!value); }}
      className={`w-12 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${value ? 'bg-primary' : 'bg-outline/50'}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${value ? 'translate-x-[26px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function SettingsPage({ user, onLogout, onDeleteAccount, onUserUpdate }: SettingsPageProps) {
  const [view, setView] = useState<View>('main');
  const [pinError, setPinError] = useState('');
  const [newPin, setNewPin] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState(getSettings());
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');

  const updateSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    if (patch.theme) applyTheme(patch.theme);
    hapticImpact('light');
  };

  const handleCurrentPin = (pin: string) => {
    if (pin === user.pin) { setPinError(''); setView('change-pin-new'); }
    else setPinError('Неверный код-пароль');
  };

  const handleNewPin = (pin: string) => { setNewPin(pin); setPinError(''); setView('change-pin-confirm'); };

  const handleConfirmPin = async (pin: string) => {
    if (pin !== newPin) { setPinError('Коды не совпадают'); return; }
    await updateUserPin(user.id, newPin);
    onUserUpdate({ ...user, pin: newPin });
    hapticNotification('success');
    setSuccess('Код-пароль изменён');
    setTimeout(() => { setView('main'); setSuccess(''); }, 1500);
  };

  const handleBuyPremium = async () => {
    setPremiumLoading(true);
    setPremiumError('');
    try {
      const updated = await buyPremium(user.id);
      onUserUpdate(updated);
      hapticNotification('success');
      setSuccess('Подписка оформлена!');
      setTimeout(() => { setView('main'); setSuccess(''); }, 2000);
    } catch (e: unknown) {
      setPremiumError((e as Error).message || 'Ошибка оформления');
      hapticNotification('error');
    } finally {
      setPremiumLoading(false);
    }
  };

  if (view === 'delete-confirm') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 bg-bg animate-fade-in">
        <div className="w-20 h-20 bg-error-light rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-error" />
        </div>
        <h1 className="text-xl font-bold text-on-surface mb-2 text-center">Удалить аккаунт?</h1>
        <p className="text-on-surface-variant text-center text-sm mb-8 max-w-[280px]">
          Все данные будут удалены безвозвратно: счета, транзакции, кредиты.
        </p>
        <div className="flex gap-3 w-full max-w-[300px]">
          <button onClick={() => setView('main')} className="flex-1 bg-surface border border-outline/50 text-on-surface py-3.5 rounded-2xl font-semibold">Отмена</button>
          <button onClick={async () => { await deleteUser(user.id); hapticNotification('success'); onDeleteAccount(); }} className="flex-1 bg-error text-white py-3.5 rounded-2xl font-semibold">Удалить</button>
        </div>
      </div>
    );
  }

  if (view === 'theme') {
    const themes: { id: Theme; label: string; icon: React.ReactNode; sub: string }[] = [
      { id: 'light', label: 'Светлая', icon: <Sun className="w-5 h-5" />, sub: 'Всегда светлая тема' },
      { id: 'dark', label: 'Тёмная', icon: <Moon className="w-5 h-5" />, sub: 'Всегда тёмная тема' },
      { id: 'system', label: 'Системная', icon: <Smartphone className="w-5 h-5" />, sub: 'Следует настройкам устройства' },
    ];
    return (
      <div className="min-h-full bg-bg animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-4">
          <button onClick={() => setView('main')} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Тема оформления</h1>
        </div>
        <div className="px-4">
          <div className="bg-surface rounded-3xl border border-outline/20 shadow-sm overflow-hidden">
            {themes.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <div className="h-px bg-outline/20 mx-5" />}
                <button
                  onClick={() => updateSettings({ theme: t.id })}
                  className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.theme === t.id ? 'bg-primary text-white' : 'bg-primary-surface text-primary'}`}>
                    {t.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-on-surface">{t.label}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{t.sub}</p>
                  </div>
                  {settings.theme === t.id && <Check className="w-5 h-5 text-primary" strokeWidth={2.5} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'premium') {
    const isPremium = user.isPremium;
    return (
      <div className="min-h-full bg-bg animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-4">
          <button onClick={() => setView('main')} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">UnitBank Premium</h1>
        </div>
        <div className="px-4 space-y-4">
          <div className="bg-surface rounded-3xl p-6 border border-warning/30">
            <div className="text-3xl mb-2">⭐</div>
            <h2 className="text-xl font-bold text-on-surface mb-1">Premium</h2>
            <p className="text-on-surface-variant text-sm">Расширенные возможности UnitBank на 1 месяц</p>
            <p className="text-2xl font-extrabold text-warning mt-4">2.5 CBC <span className="text-sm font-normal text-on-surface-variant">/ месяц</span></p>
          </div>
          <div className="bg-surface rounded-3xl p-5 border border-outline/20 space-y-3">
            {[
              ['⭐', 'Бейджик рядом с ником'],
              ['🏦', 'До 5 счетов вместо 2'],
              ['📉', 'Сниженная ставка по кредитам — 1% в неделю'],
              ['🎁', 'Пробный период в других сервисах Obsidian Group'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <p className="text-sm text-on-surface">{text}</p>
              </div>
            ))}
          </div>
          {success ? (
            <div className="flex flex-col items-center py-6">
              <div className="w-16 h-16 bg-success-light rounded-full flex items-center justify-center mb-3">
                <Check className="w-8 h-8 text-success" strokeWidth={2.5} />
              </div>
              <p className="text-lg font-semibold text-on-surface">{success}</p>
            </div>
          ) : isPremium ? (
            <div className="bg-warning-light rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-warning">⭐ Подписка активна</p>
              {user.premiumUntil && <p className="text-xs text-on-surface-variant mt-1">До {new Date(user.premiumUntil).toLocaleDateString('ru-RU')}</p>}
            </div>
          ) : (
            <>
              {premiumError && <p className="text-error text-sm text-center">{premiumError}</p>}
              <button
                onClick={handleBuyPremium}
                disabled={premiumLoading}
                className="w-full py-4 rounded-2xl font-semibold text-on-surface bg-warning-light active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {premiumLoading ? 'Оформление...' : 'Оформить за 2.5 CBC'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === 'change-pin-current' || view === 'change-pin-new' || view === 'change-pin-confirm') {
    if (success) {
      return (
        <div className="min-h-full flex flex-col items-center justify-center px-6 bg-bg animate-scale-in">
          <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mb-6">
            <Check className="w-10 h-10 text-success" strokeWidth={2.5} />
          </div>
          <p className="text-lg font-semibold text-on-surface">{success}</p>
        </div>
      );
    }
    const titles: Record<string, { title: string; subtitle: string }> = {
      'change-pin-current': { title: 'Текущий код', subtitle: 'Введите текущий код-пароль' },
      'change-pin-new': { title: 'Новый код', subtitle: 'Придумайте новый код-пароль' },
      'change-pin-confirm': { title: 'Подтверждение', subtitle: 'Повторите новый код-пароль' },
    };
    const handlers: Record<string, (pin: string) => void> = {
      'change-pin-current': handleCurrentPin,
      'change-pin-new': handleNewPin,
      'change-pin-confirm': handleConfirmPin,
    };
    return (
      <div className="min-h-full bg-bg animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={() => { setView('main'); setPinError(''); }} className="w-10 h-10 rounded-xl flex items-center justify-center active:bg-outline/20">
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold text-on-surface">Смена кода</h1>
        </div>
        <PinPad compact={true} title={titles[view].title} subtitle={titles[view].subtitle} pinLength={4} error={pinError} onComplete={handlers[view]} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-24 animate-fade-in">
      <h1 className="text-2xl font-bold text-on-surface mb-5">Настройки</h1>

      <div className="bg-surface rounded-3xl p-5 border border-outline/20 shadow-sm mb-4">
        <div className="flex items-center gap-4">
          <img src={getAvatarUrl(user.nickname, 100)} alt={user.nickname} className="w-16 h-16 rounded-2xl shadow-md" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-on-surface">
              {user.nickname}{user.isPremium && ' ⭐'}
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">В UnitBank с {formatShortDate(user.createdAt)}</p>
          </div>
        </div>
      </div>

      {user.telegramId && (
        <div className="bg-surface rounded-3xl border border-outline/20 shadow-sm overflow-hidden mb-4">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 bg-[#e8f4fd] dark:bg-[#0d2133] rounded-xl flex items-center justify-center flex-shrink-0">
              <Send className="w-5 h-5 text-[#0088cc]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface">Telegram</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {user.telegramFirstName && <span className="font-medium">{user.telegramFirstName} · </span>}
                ID: {user.telegramId}
              </p>
            </div>
            <span className="text-xs bg-success-light text-success font-medium px-2.5 py-1 rounded-full flex-shrink-0">Привязан</span>
          </div>
          <div className="h-px bg-outline/20 mx-5" />
          <button onClick={() => { hapticImpact('light'); setView('premium'); }} className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors">
            <div className="w-10 h-10 bg-warning-light rounded-xl flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-on-surface">Premium подписка</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {user.isPremium ? '⭐ Активна' : '2.5 CBC / месяц'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-on-surface-variant/50" />
          </button>
        </div>
      )}

      <div className="bg-surface rounded-3xl border border-outline/20 shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-3 flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-on-surface">Код-пароль при входе</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Запрашивать PIN при открытии приложения</p>
          </div>
          <Toggle value={settings.pinEnabled} onChange={(v) => updateSettings({ pinEnabled: v })} />
        </div>
        <div className="h-px bg-outline/20 mx-5" />
        <div className="px-5 py-3 flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
            <EyeOff className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-on-surface">Режим инкогнито</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Скрыть балансы и суммы операций</p>
          </div>
          <Toggle value={settings.incognitoMode} onChange={(v) => updateSettings({ incognitoMode: v })} />
        </div>
      </div>

      <div className="bg-surface rounded-3xl border border-outline/20 shadow-sm overflow-hidden mb-4">
        <button onClick={() => { hapticImpact('light'); setView('theme'); }} className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors">
          <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
            {settings.theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : settings.theme === 'light' ? <Sun className="w-5 h-5 text-primary" /> : <Smartphone className="w-5 h-5 text-primary" />}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-on-surface">Тема оформления</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {{ light: 'Светлая', dark: 'Тёмная', system: 'Системная' }[settings.theme]}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-on-surface-variant/50" />
        </button>
        <div className="h-px bg-outline/20 mx-5" />
        <button onClick={() => { hapticImpact('light'); setView('change-pin-current'); }} className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors">
          <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <span className="flex-1 text-left text-sm font-medium text-on-surface">Изменить код-пароль</span>
          <ChevronRight className="w-5 h-5 text-on-surface-variant/50" />
        </button>
        <div className="h-px bg-outline/20 mx-5" />
        <div className="px-5 py-3 flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-surface rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-on-surface">Уведомления</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Переводы и кредиты в Telegram</p>
          </div>
          <Toggle value={settings.notificationsEnabled} onChange={(v) => updateSettings({ notificationsEnabled: v })} />
        </div>
      </div>

      <div className="bg-surface rounded-3xl border border-outline/20 shadow-sm overflow-hidden mb-4">
        <button onClick={() => { hapticImpact('light'); onLogout(); }} className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors">
          <div className="w-10 h-10 bg-warning-light rounded-xl flex items-center justify-center">
            <LogOut className="w-5 h-5 text-warning" />
          </div>
          <span className="flex-1 text-left text-sm font-medium text-on-surface">Выйти</span>
          <ChevronRight className="w-5 h-5 text-on-surface-variant/50" />
        </button>
        <div className="h-px bg-outline/20 mx-5" />
        <button onClick={() => { hapticImpact('medium'); setView('delete-confirm'); }} className="w-full flex items-center gap-4 px-5 py-4 active:bg-bg transition-colors">
          <div className="w-10 h-10 bg-error-light rounded-xl flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-error" />
          </div>
          <span className="flex-1 text-left text-sm font-medium text-error">Удалить аккаунт</span>
          <ChevronRight className="w-5 h-5 text-on-surface-variant/50" />
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <img src={logo} alt="UnitBank" className="w-6 h-6 rounded-lg" />
        <div className="text-center">
          <p className="text-xs text-on-surface-variant/50">UnitBank v3.0.0</p>
          <p className="text-xs text-on-surface-variant/50">Minecraft Server Bank</p>
        </div>
      </div>
    </div>
  );
}
