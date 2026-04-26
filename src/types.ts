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

export interface Office {
  id: string;
  region: string;
  city: string;
  address: string;
  name: string;
}

export type ParcelStatus = 'created' | 'sent' | 'delivered' | 'received';

export interface Parcel {
  id: string;
  ttn: string;
  senderNickname: string;
  recipientNickname: string;
  description: string;
  fromOfficeId: string;
  toOfficeId: string;
  cashOnDelivery: boolean;
  cashAmount: number;
  cashPaid: boolean;
  status: ParcelStatus;
  createdAt: string;
}

export type TabType = 'accounts' | 'credits' | 'settings';
export type MailTabType = 'parcels' | 'create' | 'settings';
export type AppMode = 'bank' | 'mail';
export type OverlayType = 'transfer' | 'new-account' | null;
