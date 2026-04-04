// Telegram Mini App utilities

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme: 'light' | 'dark';
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    setText: (text: string) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export function getTMA(): TelegramWebApp | null {
  return window.Telegram?.WebApp || null;
}

export function initTMA(): void {
  const tma = getTMA();
  if (tma) {
    tma.ready();
    tma.expand();
  }
}

export function getTelegramUser(): { id: number; firstName: string } | null {
  const tma = getTMA();
  const user = tma?.initDataUnsafe?.user;
  if (user) {
    return { id: user.id, firstName: user.first_name };
  }
  return null;
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    getTMA()?.HapticFeedback?.impactOccurred(style);
  } catch {}
}

export function hapticNotification(type: 'success' | 'error' | 'warning'): void {
  try {
    getTMA()?.HapticFeedback?.notificationOccurred(type);
  } catch {}
}

export function hapticSelection(): void {
  try {
    getTMA()?.HapticFeedback?.selectionChanged();
  } catch {}
}
