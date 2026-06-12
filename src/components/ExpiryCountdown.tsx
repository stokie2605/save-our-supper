import { useEffect, useMemo, useState } from 'react';

interface ExpiryCountdownProps {
  expiresAt?: string | null;
  className?: string;
}

const getRemainingMilliseconds = (expiresAt?: string | null) => {
  if (!expiresAt) {
    return null;
  }

  const expiryTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expiryTime)) {
    return null;
  }

  return expiryTime - Date.now();
};

const formatRemainingTime = (remainingMilliseconds: number | null) => {
  if (remainingMilliseconds === null) {
    return 'Expiry time unavailable';
  }

  if (remainingMilliseconds <= 0) {
    return 'Expired';
  }

  const totalMinutes = Math.ceil(remainingMilliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${minutes}m left`;
};

export function ExpiryCountdown({ expiresAt, className = '' }: ExpiryCountdownProps) {
  const [remainingMilliseconds, setRemainingMilliseconds] = useState(() => getRemainingMilliseconds(expiresAt));

  useEffect(() => {
    setRemainingMilliseconds(getRemainingMilliseconds(expiresAt));

    const intervalId = window.setInterval(() => {
      setRemainingMilliseconds(getRemainingMilliseconds(expiresAt));
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  const isExpired = remainingMilliseconds !== null && remainingMilliseconds <= 0;
  const isUrgent = remainingMilliseconds !== null && remainingMilliseconds > 0 && remainingMilliseconds <= 60 * 60 * 1000;
  const label = useMemo(() => formatRemainingTime(remainingMilliseconds), [remainingMilliseconds]);

  const toneClasses = isExpired
    ? 'border-red-200 bg-red-50 text-red-700'
    : isUrgent
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${toneClasses} ${className}`}
      aria-label={`Expires in ${label}`}
    >
      {label}
    </span>
  );
}
