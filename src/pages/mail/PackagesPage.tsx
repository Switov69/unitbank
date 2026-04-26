import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Archive, ChevronDown, ChevronUp } from 'lucide-react';
import { getParcels, payParcelCash, updateParcelStatus, getAccounts, OFFICES } from '../../api';
import { Parcel, User, BankAccount } from '../../types';
import { formatAmount } from '../../store';
import { hapticImpact, hapticNotification } from '../../tma';

interface PackagesPageProps {
  user: User;
  refreshKey: number;
}

function getStatusLabel(status: Parcel['status']) {
  const map: Record<string, string> = {
    created: 'Ожидает отправки',
    sent: 'В пути',
    delivered: 'Доставлена',
    received: 'Получена',
  };
  return map[status] || status;
}

function getStatusColor(status: Parcel['status']) {
  if (status === 'created') return 'bg-warning-light text-warning';
  if (status === 'sent') return 'bg-primary-surface text-primary';
  if (status === 'delivered') return 'bg-success-light text-success';
  return 'bg-outline/20 text-on-surface-variant';
}

function officeName(id: string) {
  const o = OFFICES.find((x) => x.id === id);
  return o ? `${o.name}, ${o.city}` : id;
}

export default function PackagesPage({ user, refreshKey }: PackagesPageProps) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [copiedTtn, setCopiedTtn] = useState<string | null>(null);
  const [payPopup, setPayPopup] = useState<Parcel | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [payFromId, setPayFromId] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ps, accs] = await Promise.all([getParcels(user.nickname), getAccounts(user.id)]);
      setParcels(ps);
      setAccounts(accs);
      if (accs.length && !payFromId) setPayFromId(accs[0].id);
    } finally {
      setLoading(false);
    }
  }, [user.nickname, user.id]);

  useEffect(() => { setLoading(true); load(); }, [load, refreshKey]);

  const copyTtn = (ttn: string) => {
    navigator.clipboard.writeText(ttn).catch(() => {});
    setCopiedTtn(ttn);
    hapticImpact('light');
    setTimeout(() => setCopiedTtn(null), 1800);
  };

  const handleAction = async (parcel: Parcel, status: string) => {
    setActionLoading(parcel.id + status);
    try {
      await updateParcelStatus(parcel.id, status);
      hapticNotification('success');
      await load();
    } catch { hapticNotification('error'); }
    finally { setActionLoading(null); }
  };

  const handlePay = async () => {
    if (!payPopup) return;
    setPaying(true);
    setPayError('');
    const res = await payParcelCash(payPopup.id, payFromId);
    if (res.success) {
      hapticNotification('success');
      setPayPopup(null);
      await load();
    } else {
      setPayError(res.error || 'Ошибка оплаты');
      hapticNotification('error');
    }
    setPaying(false);
  };

  const active = parcels.filter((p) => p.status !== 'received');
  const archived = parcels.filter((p) => p.status === 'received');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-28 animate-fade-in">
      <h1 className="text-2xl font-bold text-on-surface mb-4">Посылки</h1>

      {active.length === 0 && archived.length === 0 && (
        <div className="bg-surface rounded-3xl p-8 text-center border border-outline/20">
          <p className="text-on-surface-variant text-sm">Посылок пока нет</p>
          <p className="text-on-surface-variant/50 text-xs mt-1">Создайте первую посылку во вкладке «Создать»</p>
        </div>
      )}

      <div className="space-y-3">
        {active.map((p) => {
          const isSender = p.senderNickname === user.nickname;
          const counterNick = isSender ? p.recipientNickname : p.senderNickname;
          const fromO = officeName(p.fromOfficeId);
          const toO = officeName(p.toOfficeId);
          const isLoading = (s: string) => actionLoading === p.id + s;

          return (
            <div key={p.id} className="bg-surface rounded-2xl p-4 border border-outline/10 animate-tx">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-on-surface">{counterNick}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{isSender ? `→ ${toO}` : `← ${fromO}`}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(p.status)}`}>
                  {getStatusLabel(p.status)}
                </span>
              </div>

              {p.description && (
                <p className="text-xs text-on-surface-variant mb-2 truncate">{p.description}</p>
              )}

              <button
                onClick={() => copyTtn(p.ttn)}
                className="flex items-center gap-1.5 text-xs text-primary font-medium mb-3 active:opacity-70"
              >
                {copiedTtn === p.ttn ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                ТТН: {p.ttn}
              </button>

              {p.cashOnDelivery && (
                <div className="bg-warning-light rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                  <span className="text-xs text-warning font-medium">Наложенный платёж</span>
                  <span className="text-xs font-bold text-warning">{formatAmount(p.cashAmount)} CBC</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {isSender && p.status === 'created' && (
                  <button
                    onClick={() => handleAction(p, 'sent')}
                    disabled={!!isLoading('sent')}
                    className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-60"
                  >
                    {isLoading('sent') ? '...' : 'Отправил'}
                  </button>
                )}
                {!isSender && p.status === 'delivered' && (
                  <>
                    {p.cashOnDelivery && !p.cashPaid && (
                      <button
                        onClick={() => { setPayPopup(p); setPayError(''); }}
                        className="flex-1 bg-warning-light text-warning py-2.5 rounded-xl text-sm font-semibold active:opacity-80"
                      >
                        Оплатить
                      </button>
                    )}
                    {(!p.cashOnDelivery || p.cashPaid) && (
                      <button
                        onClick={() => handleAction(p, 'received')}
                        disabled={!!isLoading('received')}
                        className="flex-1 bg-success text-white py-2.5 rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-60"
                      >
                        {isLoading('received') ? '...' : 'Забрал'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-on-surface-variant mb-3 active:opacity-70"
          >
            <Archive className="w-4 h-4" />
            Архив ({archived.length})
            {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showArchive && (
            <div className="space-y-2">
              {archived.map((p) => {
                const isSender = p.senderNickname === user.nickname;
                return (
                  <div key={p.id} className="bg-surface rounded-2xl p-4 border border-outline/10 opacity-60">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-on-surface">
                        {isSender ? p.recipientNickname : p.senderNickname}
                      </p>
                      <span className="text-xs text-on-surface-variant px-2 py-0.5 bg-outline/20 rounded-full">Получена</span>
                    </div>
                    <button onClick={() => copyTtn(p.ttn)} className="flex items-center gap-1.5 text-xs text-primary font-medium active:opacity-70">
                      {copiedTtn === p.ttn ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {p.ttn}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {payPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-on-surface/30">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-sm animate-scale-in">
            <h2 className="text-lg font-bold text-on-surface mb-1">Оплата посылки</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              Наложенный платёж: <span className="font-semibold text-warning">{formatAmount(payPopup.cashAmount)} CBC</span>
            </p>
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">Со счёта</label>
            <select
              value={payFromId}
              onChange={(e) => setPayFromId(e.target.value)}
              className="w-full bg-bg border-2 border-outline/50 rounded-2xl px-4 py-3 text-sm text-on-surface mb-4 focus:outline-none appearance-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {formatAmount(a.balance)} CBC</option>
              ))}
            </select>
            {payError && <p className="text-error text-sm mb-3">{payError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setPayPopup(null)}
                className="flex-1 bg-bg border border-outline/50 text-on-surface py-3 rounded-2xl font-semibold text-sm"
              >
                Отмена
              </button>
              <button
                onClick={handlePay}
                disabled={paying}
                className="flex-1 bg-primary text-white py-3 rounded-2xl font-semibold text-sm disabled:opacity-60"
              >
                {paying ? '...' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
