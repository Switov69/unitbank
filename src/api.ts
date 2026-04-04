import { User, BankAccount, Transaction, Credit } from './types';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
    throw new Error(err.error || 'Ошибка сервера');
  }
  return res.json() as Promise<T>;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  try {
    return await apiFetch<User>(`/users/by-telegram/${telegramId}`);
  } catch {
    return null;
  }
}

export async function createUser(
  nickname: string,
  pin: string,
  telegramId: number | null,
  telegramFirstName: string
): Promise<User> {
  return apiFetch<User>('/users', {
    method: 'POST',
    body: JSON.stringify({ nickname, pin, telegramId, telegramFirstName }),
  });
}

export async function updateUserPin(userId: string, pin: string): Promise<void> {
  await apiFetch(`/users/${userId}/pin`, {
    method: 'PUT',
    body: JSON.stringify({ pin }),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch(`/users/${userId}`, { method: 'DELETE' });
}

export async function getAccounts(userId: string): Promise<BankAccount[]> {
  return apiFetch<BankAccount[]>(`/accounts?userId=${encodeURIComponent(userId)}`);
}

export async function createAccount(
  userId: string,
  name: string,
  color: string
): Promise<BankAccount> {
  return apiFetch<BankAccount>('/accounts', {
    method: 'POST',
    body: JSON.stringify({ userId, name, color }),
  });
}

export async function checkAccountExists(name: string): Promise<boolean> {
  try {
    await apiFetch(`/accounts/exists/${encodeURIComponent(name)}`);
    return true;
  } catch {
    return false;
  }
}

export async function checkNicknameExists(nickname: string): Promise<boolean> {
  try {
    await apiFetch(`/users/nickname/${encodeURIComponent(nickname)}`);
    return true;
  } catch {
    return false;
  }
}

export async function getTransactions(accountId: string): Promise<Transaction[]> {
  return apiFetch<Transaction[]>(`/transactions?accountId=${encodeURIComponent(accountId)}`);
}

export async function transfer(
  fromAccountId: string,
  toAccountName: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch('/transfer', {
      method: 'POST',
      body: JSON.stringify({ fromAccountId, toAccountName, amount }),
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getCredits(userId: string): Promise<Credit[]> {
  return apiFetch<Credit[]>(`/credits?userId=${encodeURIComponent(userId)}`);
}

export async function requestCredit(
  userId: string,
  accountId: string,
  amount: number,
  purpose: string
): Promise<Credit> {
  return apiFetch<Credit>('/credits/request', {
    method: 'POST',
    body: JSON.stringify({ userId, accountId, amount, purpose }),
  });
}

export async function repayCredit(
  creditId: string,
  amount: number,
  fromAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch(`/credits/${encodeURIComponent(creditId)}/repay`, {
      method: 'POST',
      body: JSON.stringify({ amount, fromAccountId }),
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export const ACCOUNT_COLORS = [
  { hex: '#4285f4', label: 'Синий' },
  { hex: '#7c3aed', label: 'Фиолетовый' },
  { hex: '#059669', label: 'Зелёный' },
  { hex: '#e11d48', label: 'Малиновый' },
  { hex: '#ea580c', label: 'Оранжевый' },
  { hex: '#0891b2', label: 'Бирюзовый' },
  { hex: '#d97706', label: 'Золотой' },
  { hex: '#475569', label: 'Тёмный' },
];

export function calcCurrentInterest(credit: Credit): number {
  if (credit.status !== 'active') return 0;
  const now = Date.now();
  const created = new Date(credit.createdAt).getTime();
  const weeksPassed = Math.floor((now - created) / (7 * 24 * 3600 * 1000));
  const totalInterest = Math.round(credit.amount * credit.interestRate * weeksPassed * 100) / 100;
  return Math.max(0, Math.round((totalInterest - credit.interestSent) * 100) / 100);
}
