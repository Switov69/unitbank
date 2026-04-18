export interface User {
  id: string;
  nickname: string;
  telegramId: number | null;
  telegramFirstName: string;
  pin: string;
  isPremium: boolean;
  premiumUntil: string | null;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  userId: string;
  name: string;
  balance: number;
  color: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: 'income' | 'expense' | 'credit' | 'credit_repay';
  amount: number;
  description: string;
  createdAt: string;
}

export interface Credit {
  id: string;
  userId: string;
  targetAccountId: string;
  amount: number;
  paidAmount: number;
  interestSent: number;
  interestRate: number;
  purpose: string;
  status: 'pending' | 'active' | 'paid' | 'rejected';
  createdAt: string;
}

export type TabType = 'accounts' | 'credits' | 'settings';
export type OverlayType = 'transfer' | 'new-account' | null;
