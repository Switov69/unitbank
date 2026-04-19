import { useState, useCallback, useEffect } from 'react';
import { getAvatarUrl } from '../store';
import { getLockoutData, saveLockoutData, clearLockoutData } from '../store';
import { User } from '../types';
import PinPad from '../components/PinPad';

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface PinEntryProps {
  user: User;
  onSuccess: () => void;
}

function getRemainingLockout(lockedUntil: number | null): number {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil - Date.now());
}

function formatLockoutTime(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function PinEntry({ user, onSuccess }: PinEntryProps) {
  const [error, setError] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    const lockout = getLockoutData();
    const remaining = getRemainingLockout(lockout.lockedUntil);
    if (remaining > 0) {
      setLockoutRemaining(remaining);
    }
  }, []);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          clearLockoutData();
          setError('');
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const handleComplete = useCallback(
    (pin: string) => {
      const lockout = getLockoutData();
      const remaining = getRemainingLockout(lockout.lockedUntil);
      if (remaining > 0) return;

      if (pin === user.pin) {
        clearLockoutData();
        setError('');
        onSuccess();
      } else {
        const newAttempts = lockout.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          const lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
          saveLockoutData({ attempts: newAttempts, lockedUntil });
          setLockoutRemaining(LOCKOUT_DURATION_MS);
          setError('Аккаунт заблокирован на 15 минут');
        } else {
          saveLockoutData({ attempts: newAttempts, lockedUntil: null });
          const attemptsLeft = MAX_ATTEMPTS - newAttempts;
          setError(`Неверный код. Осталось попыток: ${attemptsLeft}`);
        }
      }
    },
    [user.pin, onSuccess]
  );

  const isLocked = lockoutRemaining > 0;

  return (
    <div className="min-h-full flex flex-col animate-fade-in">
      <div className="flex flex-col items-center pt-16 pb-4">
        <img
          src={getAvatarUrl(user.nickname, 80)}
          alt={user.nickname}
          className="w-16 h-16 rounded-2xl shadow-md mb-3"
        />
        <p className="text-sm text-on-surface-variant">
          Привет,{' '}
          <span className="font-semibold text-on-surface">{user.nickname}</span>
        </p>
      </div>

      {isLocked ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="w-16 h-16 bg-error-light rounded-full flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>
          <p className="text-base font-semibold text-error text-center">Аккаунт заблокирован</p>
          <p className="text-on-surface-variant text-sm text-center">
            Слишком много неверных попыток. Попробуйте через
          </p>
          <div className="bg-error-light rounded-2xl px-8 py-4">
            <p className="text-3xl font-bold text-error text-center">
              {formatLockoutTime(lockoutRemaining)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <PinPad
            title="Введите код-пароль"
            compact={true}
            pinLength={4}
            error={error}
            onComplete={handleComplete}
          />
        </div>
      )}
    </div>
  );
}
