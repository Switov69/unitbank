import { useState, useRef } from 'react';
import { Wallet, ScrollText, Settings, Package, PackagePlus, Mail } from 'lucide-react';
import { TabType, MailTabType, AppMode } from '../types';
import { hapticImpact } from '../tma';

interface DockNavProps {
  mode: AppMode;
  bankTab: TabType;
  mailTab: MailTabType;
  onBankTabChange: (t: TabType) => void;
  onMailTabChange: (t: MailTabType) => void;
  onModeChange: (m: AppMode) => void;
}

const bankTabs: { id: TabType; label: string; Icon: typeof Wallet }[] = [
  { id: 'accounts', label: 'Счета', Icon: Wallet },
  { id: 'credits', label: 'Кредиты', Icon: ScrollText },
  { id: 'settings', label: 'Настройки', Icon: Settings },
];

const mailTabs: { id: MailTabType; label: string; Icon: typeof Package }[] = [
  { id: 'parcels', label: 'Посылки', Icon: Package },
  { id: 'create', label: 'Создать', Icon: PackagePlus },
  { id: 'settings', label: 'Настройки', Icon: Settings },
];

type AnimState = 'idle' | 'bank-out' | 'mail-in' | 'mail-out' | 'bank-in';

export default function DockNav({ mode, bankTab, mailTab, onBankTabChange, onMailTabChange, onModeChange }: DockNavProps) {
  const [anim, setAnim] = useState<AnimState>('idle');
  const transitioning = useRef(false);

  const switchToMail = () => {
    if (transitioning.current) return;
    transitioning.current = true;
    hapticImpact('medium');
    setAnim('bank-out');
    setTimeout(() => {
      onModeChange('mail');
      setAnim('mail-in');
      setTimeout(() => { setAnim('idle'); transitioning.current = false; }, 300);
    }, 280);
  };

  const switchToBank = () => {
    if (transitioning.current) return;
    transitioning.current = true;
    hapticImpact('medium');
    setAnim('mail-out');
    setTimeout(() => {
      onModeChange('bank');
      setAnim('bank-in');
      setTimeout(() => { setAnim('idle'); transitioning.current = false; }, 300);
    }, 280);
  };

  const bankAnimClass = anim === 'bank-out' ? 'dock-slide-out-left' : anim === 'bank-in' ? 'dock-slide-in-left' : '';
  const mailAnimClass = anim === 'mail-out' ? 'dock-slide-out-right' : anim === 'mail-in' ? 'dock-slide-in-right' : '';

  const safeBottom = 'env(safe-area-inset-bottom, 8px)';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center items-end"
      style={{ paddingBottom: safeBottom, paddingLeft: '12px', paddingRight: '12px', paddingTop: '8px' }}
    >
      <div className="flex items-end gap-2 w-full max-w-sm">
        <div className="relative flex-1 overflow-hidden" style={{ minHeight: '60px' }}>
          {mode === 'bank' && (
            <div
              key="bank-dock"
              className={`absolute inset-0 bg-surface rounded-[20px] flex items-center justify-around px-1 ${bankAnimClass}`}
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}
            >
              {bankTabs.map(({ id, label, Icon }) => {
                const active = bankTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { hapticImpact('light'); onBankTabChange(id); }}
                    className="flex flex-col items-center justify-center gap-0.5 flex-1 h-14"
                  >
                    <div className={`flex items-center justify-center w-14 h-7 rounded-full transition-all duration-200 ${active ? 'bg-primary-light' : ''}`}>
                      <Icon className={`w-5 h-5 transition-colors duration-200 ${active ? 'text-primary-dark' : 'text-on-surface-variant'}`} strokeWidth={active ? 2.2 : 1.8} />
                    </div>
                    <span className={`text-[10px] font-medium ${active ? 'text-primary-dark' : 'text-on-surface-variant'}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {mode === 'mail' && (
            <div
              key="mail-dock"
              className={`absolute inset-0 bg-surface rounded-[20px] flex items-center justify-around px-1 ${mailAnimClass}`}
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}
            >
              {mailTabs.map(({ id, label, Icon }) => {
                const active = mailTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { hapticImpact('light'); onMailTabChange(id); }}
                    className="flex flex-col items-center justify-center gap-0.5 flex-1 h-14"
                  >
                    <div className={`flex items-center justify-center w-14 h-7 rounded-full transition-all duration-200 ${active ? 'bg-primary-light' : ''}`}>
                      <Icon className={`w-5 h-5 transition-colors duration-200 ${active ? 'text-primary-dark' : 'text-on-surface-variant'}`} strokeWidth={active ? 2.2 : 1.8} />
                    </div>
                    <span className={`text-[10px] font-medium ${active ? 'text-primary-dark' : 'text-on-surface-variant'}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={mode === 'bank' ? switchToMail : switchToBank}
          className="w-14 h-14 rounded-full bg-surface flex-shrink-0 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all duration-200"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}
        >
          <Mail className={`w-5 h-5 transition-colors duration-200 ${mode === 'mail' ? 'text-primary-dark' : 'text-on-surface-variant'}`} strokeWidth={mode === 'mail' ? 2.2 : 1.8} />
          <span className={`text-[10px] font-medium ${mode === 'mail' ? 'text-primary-dark' : 'text-on-surface-variant'}`}>
            {mode === 'mail' ? 'Банк' : 'Почта'}
          </span>
        </button>
      </div>
    </div>
  );
}
