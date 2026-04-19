import { useState, useEffect, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { hapticImpact, hapticNotification } from '../tma';

interface PinPadProps {
  title: string;
  subtitle?: string;
  pinLength?: number;
  error?: string;
  disabled?: boolean;
  compact?: boolean;
  onComplete: (pin: string) => void;
}

export default function PinPad({ title, subtitle, pinLength = 4, error, disabled, compact = false, onComplete }: PinPadProps) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);
  const [lastError, setLastError] = useState('');

  useEffect(() => {
    if (error && error !== lastError) {
      setLastError(error);
      setShaking(true);
      hapticNotification('error');
      const t = setTimeout(() => {
        setShaking(false);
        setPin('');
      }, 500);
      return () => clearTimeout(t);
    }
  }, [error, lastError]);

  useEffect(() => {
    if (pin.length === pinLength) {
      const captured = pin;
      const t = setTimeout(() => {
        setPin('');
        onComplete(captured);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [pin, pinLength, onComplete]);

  const handleDigit = useCallback((digit: string) => {
    if (disabled) return;
    hapticImpact('light');
    setPin((prev) => prev.length >= pinLength ? prev : prev + digit);
  }, [pinLength, disabled]);

  const handleDelete = useCallback(() => {
    if (disabled) return;
    hapticImpact('light');
    setPin((prev) => prev.slice(0, -1));
  }, [disabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      if (e.key === 'Backspace') handleDelete();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [disabled, handleDigit, handleDelete]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  const dotSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const gridMax = compact ? 'max-w-[248px]' : 'max-w-[300px]';
  const textSize = compact ? 'text-xl' : 'text-2xl';
  const gap = compact ? 'gap-2' : 'gap-3';
  const titleSize = compact ? 'text-xl' : 'text-2xl';
  const py = compact ? 'py-4' : 'py-6';

  return (
    <div className={`flex flex-col items-center justify-center min-h-full px-6 ${py}`}>
      <div className="text-center mb-6">
        <h1 className={`${titleSize} font-bold text-on-surface`}>{title}</h1>
        {subtitle && <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>}
      </div>

      <div className={`flex gap-4 mb-2 ${shaking ? 'animate-shake' : ''}`}>
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={`${dotSize} rounded-full transition-all duration-200 ${
              i < pin.length ? 'bg-primary scale-110' : 'bg-outline/40'
            }`}
          />
        ))}
      </div>

      <div className="h-5 mb-5">
        {error && <p className="text-error text-xs font-medium animate-fade-in text-center">{error}</p>}
      </div>

      <div className={`grid grid-cols-3 ${gap} w-full ${gridMax}`}>
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
                <Delete className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} text-on-surface-variant`} />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(digit)}
              disabled={disabled}
              className={`aspect-square rounded-2xl bg-surface text-on-surface ${textSize} font-medium
                border border-outline/30
                active:bg-primary-light active:border-primary/30 active:scale-95
                transition-all duration-100 flex items-center justify-center disabled:opacity-40`}
            >
              {digit}
            </button>
          );
        })}
      </div>
    </div>
  );
}
