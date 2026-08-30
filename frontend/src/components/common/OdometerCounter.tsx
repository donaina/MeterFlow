import React, { useEffect, useState, useRef } from 'react';

interface OdometerCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  digitCount?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const OdometerCounter: React.FC<OdometerCounterProps> = ({
  value,
  prefix = '',
  suffix = '',
  className = '',
  size = 'md',
}) => {
  const [prevValue, setPrevValue] = useState(value);
  const [hasPulse, setHasPulse] = useState(false);
  const pulseTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (value !== prevValue) {
      setHasPulse(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => setHasPulse(false), 800);
      setPrevValue(value);
    }
  }, [value, prevValue]);

  // Format number as formatted string (e.g. "1,234")
  const formattedString = Math.floor(value).toLocaleString();
  const characters = formattedString.split('');

  const sizeClasses = {
    sm: 'text-lg font-bold tracking-tight',
    md: 'text-2xl font-bold tracking-tight',
    lg: 'text-3xl font-extrabold tracking-tight',
    xl: 'text-5xl font-black tracking-tight',
  }[size];

  return (
    <div
      className={`inline-flex items-center font-mono tabular-nums select-none ${sizeClasses} ${className} ${
        hasPulse ? 'text-copper-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'text-slate-100'
      } transition-colors duration-300`}
    >
      {prefix && <span className="mr-1 opacity-70 font-sans font-semibold text-xs tracking-normal">{prefix}</span>}
      <div className="flex items-center overflow-hidden h-[1.25em] bg-ink-950/60 px-2 py-0.5 rounded border border-ink-700/80 shadow-inner">
        {characters.map((char, index) => {
          if (char === ',') {
            return (
              <span key={`comma-${index}`} className="text-slate-500 mx-0.5 self-end mb-0.5">
                ,
              </span>
            );
          }

          const digit = parseInt(char, 10);
          if (isNaN(digit)) {
            return <span key={`char-${index}`}>{char}</span>;
          }

          return (
            <div key={`col-${index}`} className="odometer-digit-container w-[0.62em] text-center">
              <div
                className="odometer-digit"
                style={{
                  transform: `translateY(-${digit * 10}%)`,
                  height: '1000%',
                }}
              >
                {DIGITS.map((d) => (
                  <div key={d} className="h-[10%] flex items-center justify-center">
                    {d}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {suffix && <span className="ml-1 opacity-70 font-sans font-medium text-xs tracking-normal">{suffix}</span>}
      {hasPulse && (
        <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-copper-400 animate-ping" />
      )}
    </div>
  );
};
