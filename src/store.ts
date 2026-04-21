export function formatAmount(amount: number): string {
  const n = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${time}`;
  if (isYesterday) return `Вчера, ${time}`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + `, ${time}`;
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getAvatarUrl(nickname: string, size: number = 100): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(nickname)}/${size}`;
}

export function darkenHex(hex: string, amount = 40): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export type Theme = 'light' | 'dark' | 'system';

export interface AppSettings {
  pinEnabled: boolean;
  incognitoMode: boolean;
  theme: Theme;
  notificationsEnabled: boolean;
}

const SETTINGS_KEY = 'unitbank_settings_v3';

export function getSettings(): AppSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) return { pinEnabled: true, incognitoMode: false, theme: 'system', notificationsEnabled: true, ...JSON.parse(data) };
  } catch {}
  return { pinEnabled: true, incognitoMode: false, theme: 'system', notificationsEnabled: true };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

const LOCKOUT_KEY = 'unitbank_lockout_v2';
const SELECTED_ACCOUNT_KEY = 'unitbank_selected_account_v2';

export interface LockoutData {
  attempts: number;
  lockedUntil: number | null;
}

export function getLockoutData(): LockoutData {
  try {
    const data = localStorage.getItem(LOCKOUT_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return { attempts: 0, lockedUntil: null };
}

export function saveLockoutData(data: LockoutData): void {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
}

export function clearLockoutData(): void {
  localStorage.removeItem(LOCKOUT_KEY);
}

export function getSelectedAccountId(): string | null {
  return localStorage.getItem(SELECTED_ACCOUNT_KEY);
}

export function setSelectedAccountId(id: string): void {
  localStorage.setItem(SELECTED_ACCOUNT_KEY, id);
}

export function clearLocalData(): void {
  localStorage.removeItem(LOCKOUT_KEY);
  localStorage.removeItem(SELECTED_ACCOUNT_KEY);
  localStorage.removeItem(SETTINGS_KEY);
}
