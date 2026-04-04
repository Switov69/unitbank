import { useState, useEffect, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { hapticImpact, hapticNotification } from '../tma';

interface PinPadProps {
  title: string;
  subtitle?: string;
  pinLength?: number;
  error?: string;
  disabled?: boolean;
  onComplete: (pin: string) => void;
}

export default function PinPad({
  title,
  subtitle,
  pinLength = 4,
  error,
  disabled,
  onComplete,
}: PinPadProps) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (error) {
      setShaking(true);
      hapticNotification('error');
      const t = setTimeout(() => {
        setShaking(false);
        setPin('');
      }, 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (pin.length === pinLength) {
      const t = setTimeout(() => onComplete(pin), 150);
      return () => clearTimeout(t);
    }
  }, [pin, pinLength, onComplete]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (disabled) return;
      hapticImpact('light');
      setPin((prev) => {
        if (prev.length >= pinLength) return prev;
        return prev + digit;
      });
    },
    [pinLength, disabled]
  );

  const handleDelete = useCallback(() => {
    if (disabled) return;
    hapticImpact('light');
    setPin((prev) => prev.slice(0, -1));
  }, [disabled]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-8">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
        {subtitle && <p className="text-sm text-on-surface-variant mt-2">{subtitle}</p>}
      </div>

      <div className={`flex gap-4 mb-3 ${shaking ? 'animate-shake' : ''}`}>
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all duration-200 ${
              i < pin.length ? 'bg-primary scale-110' : 'bg-outline/40'
            }`}
          />
        ))}
      </div>

      <div className="h-6 mb-6">
        {error && <p className="text-error text-sm font-medium animate-fade-in">{error}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {digits.map((digit, i) => {
          if (digit === '') return <div key={i} />;
          if (digit === 'del') {
            return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={disabled}
                className="aspect-square rounded-2xl flex items-center justify-center active:bg-outline/20 transition-colors disabled:opacity-40"
              >
                <Delete className="w-6 h-6 text-on-surface-variant" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(digit)}
              disabled={disabled}
              className="aspect-square rounded-2xl bg-white text-on-surface text-2xl font-medium
                shadow-sm border border-outline/30
                active:bg-primary-light active:border-primary/30 active:scale-95
                transition-all duration-100
                flex items-center justify-center disabled:opacity-40"
            >
              {digit}
            </button>
          );
        })}
      </div>
    </div>
  );
}
