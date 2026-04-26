import { useState, useEffect, useCallback } from 'react';
import { User, TabType, MailTabType, AppMode, OverlayType } from './types';
import { getSettings, getSelectedAccountId, setSelectedAccountId as saveSelectedAccountId, clearLocalData, applyTheme } from './store';
import { getUserByTelegramId, getAccounts } from './api';
import { initTMA, getTelegramUser } from './tma';

import DockNav from './components/DockNav';
import Registration from './pages/Registration';
import PinEntry from './pages/PinEntry';
import AccountsPage from './pages/AccountsPage';
import CreditsPage from './pages/CreditsPage';
import SettingsPage from './pages/SettingsPage';
import TransferPage from './pages/TransferPage';
import NewAccountPage from './pages/NewAccountPage';
import PackagesPage from './pages/mail/PackagesPage';
import CreateParcelPage from './pages/mail/CreateParcelPage';
import logo from './assets/logo.png';

type Screen = 'loading' | 'registration' | 'pin' | 'main';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [appMode, setAppMode] = useState<AppMode>('bank');
  const [bankTab, setBankTab] = useState<TabType>('accounts');
  const [mailTab, setMailTab] = useState<MailTabType>('parcels');
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mailRefreshKey, setMailRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const mailRefresh = useCallback(() => setMailRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const settings = getSettings();
    applyTheme(settings.theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (getSettings().theme === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    async function init() {
      initTMA();
      const tgUser = getTelegramUser();
      if (!tgUser) { setScreen('registration'); return; }
      const existingUser = await getUserByTelegramId(tgUser.id);
      if (existingUser) {
        setUser(existingUser);
        const accounts = await getAccounts(existingUser.id);
        const savedId = getSelectedAccountId();
        if (savedId && accounts.find((a) => a.id === savedId)) {
          setSelectedAccountId(savedId);
        } else if (accounts.length > 0) {
          setSelectedAccountId(accounts[0].id);
          saveSelectedAccountId(accounts[0].id);
        }
        const settings = getSettings();
        setScreen(settings.pinEnabled ? 'pin' : 'main');
      } else {
        setScreen('registration');
      }
    }
    init();
  }, []);

  const handleRegistrationComplete = useCallback((newUser: User, firstAccountId: string) => {
    setUser(newUser);
    setSelectedAccountId(firstAccountId);
    saveSelectedAccountId(firstAccountId);
    setScreen('main');
  }, []);

  const handlePinSuccess = useCallback(() => setScreen('main'), []);
  const handleSelectAccount = useCallback((id: string) => { setSelectedAccountId(id); saveSelectedAccountId(id); }, []);
  const handleLogout = useCallback(() => setScreen('pin'), []);
  const handleDeleteAccount = useCallback(() => { clearLocalData(); setUser(null); setSelectedAccountId(null); setScreen('registration'); }, []);
  const handleNewAccountCreated = useCallback((accountId: string) => { setSelectedAccountId(accountId); saveSelectedAccountId(accountId); setOverlay(null); refresh(); }, [refresh]);
  const handleTransferClose = useCallback(() => { setOverlay(null); refresh(); }, [refresh]);

  const activeTab = appMode === 'mail' ? mailTab : bankTab;
  const showSettings = (appMode === 'bank' && bankTab === 'settings') || (appMode === 'mail' && mailTab === 'settings');

  if (screen === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center animate-fade-in">
          <img src={logo} alt="UnitBank" className="w-16 h-16 rounded-2xl mb-4" />
          <p className="text-sm text-on-surface-variant">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (screen === 'registration') {
    return <div className="h-full bg-bg"><Registration onComplete={handleRegistrationComplete} /></div>;
  }

  if (screen === 'pin' && user) {
    return <div className="h-full bg-bg"><PinEntry user={user} onSuccess={handlePinSuccess} /></div>;
  }

  if (screen === 'main' && user) {
    const dockHeight = 80;

    return (
      <div className="h-full bg-bg flex flex-col relative">
        <div className="flex-1 overflow-y-auto pt-2" style={{ paddingBottom: `${dockHeight}px` }}>
          {appMode === 'bank' && bankTab === 'accounts' && (
            <AccountsPage user={user} selectedAccountId={selectedAccountId} onSelectAccount={handleSelectAccount} onTransfer={() => setOverlay('transfer')} onNewAccount={() => setOverlay('new-account')} refreshKey={refreshKey} onRefresh={refresh} />
          )}
          {appMode === 'bank' && bankTab === 'credits' && (
            <CreditsPage user={user} refreshKey={refreshKey} onRefresh={refresh} />
          )}
          {showSettings && (
            <SettingsPage user={user} onLogout={handleLogout} onDeleteAccount={handleDeleteAccount} onUserUpdate={(u) => setUser(u)} />
          )}
          {appMode === 'mail' && mailTab === 'parcels' && (
            <PackagesPage user={user} refreshKey={mailRefreshKey} />
          )}
          {appMode === 'mail' && mailTab === 'create' && (
            <CreateParcelPage user={user} onCreated={() => { setMailTab('parcels'); mailRefresh(); }} />
          )}
        </div>

        <DockNav
          mode={appMode}
          bankTab={bankTab}
          mailTab={mailTab}
          onBankTabChange={setBankTab}
          onMailTabChange={setMailTab}
          onModeChange={setAppMode}
        />

        {overlay === 'transfer' && selectedAccountId && (
          <div className="fixed inset-0 z-50 bg-bg">
            <TransferPage userId={user.id} selectedAccountId={selectedAccountId} onClose={handleTransferClose} />
          </div>
        )}
        {overlay === 'new-account' && (
          <div className="fixed inset-0 z-50 bg-bg">
            <NewAccountPage userId={user.id} isPremium={user.isPremium} onClose={() => { setOverlay(null); refresh(); }} onCreated={handleNewAccountCreated} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
