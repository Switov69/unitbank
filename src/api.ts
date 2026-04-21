import { User, BankAccount, Transaction, Credit } from './types';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Нет связи с сервером.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
    throw new Error(data.error || 'Ошибка сервера');
  }
  return res.json() as Promise<T>;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  try { return await apiFetch<User>(`lookup?telegramId=${telegramId}`); }
  catch { return null; }
}

export async function checkNicknameExists(nickname: string): Promise<boolean> {
  try { await apiFetch(`lookup?nickname=${encodeURIComponent(nickname)}`); return true; }
  catch { return false; }
}

export async function createUser(nickname: string, pin: string, telegramId: number | null, telegramFirstName: string): Promise<User> {
  return apiFetch<User>('users', { method: 'POST', body: JSON.stringify({ nickname, pin, telegramId, telegramFirstName }) });
}

export async function updateUserPin(userId: string, pin: string): Promise<void> {
  await apiFetch(`users/${userId}`, { method: 'PUT', body: JSON.stringify({ pin }) });
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch(`users/${userId}`, { method: 'DELETE' });
}

export async function buyPremium(userId: string): Promise<User> {
  return apiFetch<User>('premium', { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function getAccounts(userId: string): Promise<BankAccount[]> {
  return apiFetch<BankAccount[]>(`accounts?userId=${encodeURIComponent(userId)}`);
}

export async function createAccount(userId: string, name: string, color: string): Promise<BankAccount> {
  return apiFetch<BankAccount>('accounts', { method: 'POST', body: JSON.stringify({ userId, name, color }) });
}

export async function updateAccount(accountId: string, name: string, color: string): Promise<BankAccount> {
  return apiFetch<BankAccount>(`accounts/${encodeURIComponent(accountId)}`, { method: 'PUT', body: JSON.stringify({ name, color }) });
}

export async function deleteAccount(accountId: string): Promise<void> {
  await apiFetch(`accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

export async function checkAccountExists(name: string): Promise<boolean> {
  try { await apiFetch(`accounts?exists=${encodeURIComponent(name)}`); return true; }
  catch { return false; }
}

export async function getTransactions(accountId: string): Promise<Transaction[]> {
  return apiFetch<Transaction[]>(`transactions?accountId=${encodeURIComponent(accountId)}`);
}

export async function transfer(fromAccountId: string, toAccountName: string, amount: number): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch('transfer', { method: 'POST', body: JSON.stringify({ fromAccountId, toAccountName, amount }) });
    return { success: true };
  } catch (e: unknown) { return { success: false, error: (e as Error).message }; }
}

export async function getCredits(userId: string): Promise<Credit[]> {
  return apiFetch<Credit[]>(`credits?userId=${encodeURIComponent(userId)}`);
}

export async function requestCredit(userId: string, accountId: string, amount: number, purpose: string): Promise<Credit> {
  return apiFetch<Credit>('credits', { method: 'POST', body: JSON.stringify({ userId, accountId, amount, purpose }) });
}

export async function repayCredit(creditId: string, amount: number, fromAccountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch(`credits/${encodeURIComponent(creditId)}?action=repay`, { method: 'POST', body: JSON.stringify({ amount, fromAccountId }) });
    return { success: true };
  } catch (e: unknown) { return { success: false, error: (e as Error).message }; }
}

export const ACCOUNT_COLORS = [
  { hex: '#4285f4', label: 'Синий', gradient: '' },
  { hex: '#7c3aed', label: 'Фиолетовый', gradient: '' },
  { hex: '#059669', label: 'Зелёный', gradient: '' },
  { hex: '#e11d48', label: 'Малиновый', gradient: '' },
  { hex: '#ea580c', label: 'Оранжевый', gradient: '' },
  { hex: '#0891b2', label: 'Бирюзовый', gradient: '' },
  { hex: '#d97706', label: 'Золотой', gradient: '' },
  { hex: '#475569', label: 'Тёмный', gradient: '' },
];

export const ACCOUNT_PATTERNS = [
  {
    id: 'p1',
    label: 'Аврора',
    premium: true,
    css: 'linear-gradient(135deg, #667eea 0%, #764ba2 40%, #f093fb 100%)',
    chip: '#764ba2',
  },
  {
    id: 'p2',
    label: 'Закат',
    premium: true,
    css: 'linear-gradient(135deg, #f7971e 0%, #ffd200 50%, #f7971e 100%)',
    chip: '#f7971e',
  },
  {
    id: 'p3',
    label: 'Океан',
    premium: true,
    css: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    chip: '#0072ff',
  },
  {
    id: 'p4',
    label: 'Лес',
    premium: true,
    css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    chip: '#71b280',
  },
  {
    id: 'p5',
    label: 'Лава',
    premium: true,
    css: 'linear-gradient(135deg, #f953c6 0%, #b91d73 100%)',
    chip: '#b91d73',
  },
  {
    id: 'p6',
    label: 'Мята',
    premium: true,
    css: 'linear-gradient(135deg, #0fd850 0%, #f9f047 100%)',
    chip: '#0fd850',
  },
  {
    id: 'p7',
    label: 'Космос',
    premium: true,
    css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 70%, #533483 100%)',
    chip: '#533483',
  },
  {
    id: 'p8',
    label: 'Лёд',
    premium: true,
    css: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 50%, #a8c0ff 100%)',
    chip: '#a8c0ff',
  },
];

export function getCardStyle(color: string): { background: string; chipColor: string } {
  const pattern = ACCOUNT_PATTERNS.find((p) => p.id === color);
  if (pattern) return { background: pattern.css, chipColor: pattern.chip };
  const hex = color || '#4285f4';
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - 40);
  const g = Math.max(0, ((num >> 8) & 0xff) - 40);
  const b = Math.max(0, (num & 0xff) - 40);
  const dark = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  return { background: `linear-gradient(135deg, ${hex} 0%, ${dark} 100%)`, chipColor: hex };
}

export function calcCurrentInterest(credit: Credit): number {
  if (credit.status !== 'active') return 0;
  const weeksPassed = Math.floor((Date.now() - new Date(credit.createdAt).getTime()) / (7 * 24 * 3600 * 1000));
  const totalInterest = Math.round(credit.amount * credit.interestRate * weeksPassed * 100) / 100;
  return Math.max(0, Math.round((totalInterest - credit.interestSent) * 100) / 100);
}
