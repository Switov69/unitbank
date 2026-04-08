import { Wallet, ScrollText, Settings } from 'lucide-react';
import { TabType } from '../types';
import { hapticSelection } from '../tma';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: typeof Wallet }[] = [
  { id: 'accounts', label: 'Счета', icon: Wallet },
  { id: 'credits', label: 'Кредиты', icon: ScrollText },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-outline/30 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                hapticSelection();
                onTabChange(tab.id);
              }}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative"
            >
              <div
                className={`flex items-center justify-center w-16 h-8 rounded-full transition-all duration-200 ${
                  isActive ? 'bg-primary-light' : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    isActive ? 'text-primary-dark' : 'text-on-surface-variant'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </div>
              <span
                className={`text-[11px] font-medium transition-colors duration-200 ${
                  isActive ? 'text-primary-dark' : 'text-on-surface-variant'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
