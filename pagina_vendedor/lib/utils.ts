import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Rounds a number to 2 decimal places to prevent floating point errors.
 * Example: 10.10 + 1.20 = 11.3 (instead of 11.29999999)
 */
export function safeAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-EC', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Guayaquil',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-EC', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guayaquil',
  }).format(new Date(date));
}

export function generateSaleNumber(): string {
  // Use Ecuador timezone for consistent date-based numbering
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `VTA-${year}${month}${day}-${random}`;
}

export function calculateStockPercentage(current: number, min: number, max: number): number {
  if (max === min) return 100;
  return Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));
}

export function isLowStock(current: number, min: number): boolean {
  return current <= min;
}

export function getAccountColor(accountName: string | undefined) {
  if (!accountName) return {
    bg: 'bg-slate-600',
    text: 'text-white',
    // border: 'border-slate-700',
    // hover: 'hover:bg-slate-700',
    gradient: 'from-slate-700 to-slate-800'
  };

  const name = accountName.toLowerCase();

  if (name.includes('pichincha')) {
    return {
      bg: 'bg-yellow-400 dark:bg-yellow-500',
      text: 'text-yellow-950 dark:text-black', // Dark text on yellow background for better visibility
      border: 'border-yellow-500 dark:border-yellow-400',
      hover: 'hover:bg-yellow-500 dark:hover:bg-yellow-600',
      iconBg: 'bg-yellow-100 dark:bg-yellow-200', // Lighter bg for icon in dark mode to support dark text if needed
      iconColor: 'text-yellow-800 dark:text-yellow-900', // Darker icon color for contrast
      gradient: 'from-yellow-400 to-yellow-600 dark:from-yellow-500 dark:to-yellow-700'
    };
  }

  if (name.includes('guayaquil')) {
    return {
      bg: 'bg-fuchsia-500 dark:bg-fuchsia-600', // Lila fuerte
      text: 'text-white',
      border: 'border-fuchsia-600 dark:border-fuchsia-500',
      hover: 'hover:bg-fuchsia-600 dark:hover:bg-fuchsia-700',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40',
      iconColor: 'text-fuchsia-700 dark:text-fuchsia-300',
      gradient: 'from-fuchsia-500 to-purple-600 dark:from-fuchsia-700 dark:to-purple-900'
    };
  }

  if (name.includes('efectivo')) {
    return {
      bg: 'bg-amber-800 dark:bg-amber-900', // Café / Marrón
      text: 'text-amber-50',
      border: 'border-amber-900 dark:border-amber-700',
      hover: 'hover:bg-amber-900 dark:hover:bg-amber-950',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconColor: 'text-amber-800 dark:text-amber-400',
      gradient: 'from-amber-700 to-orange-900 dark:from-amber-800 dark:to-amber-950'
    };
  }

  if (name.includes('caja grande')) {
    return {
      bg: 'bg-emerald-600 dark:bg-emerald-700', // Verde fuerte
      text: 'text-emerald-50',
      border: 'border-emerald-700 dark:border-emerald-600',
      hover: 'hover:bg-emerald-700 dark:hover:bg-emerald-600',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconColor: 'text-emerald-800 dark:text-emerald-400',
      gradient: 'from-emerald-600 to-teal-800 dark:from-emerald-700 dark:to-teal-950'
    };
  }

  // Default blue fallback
  return {
    bg: 'bg-blue-600 dark:bg-blue-700',
    text: 'text-white',
    border: 'border-blue-700 dark:border-blue-600',
    hover: 'hover:bg-blue-700 dark:hover:bg-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-700 dark:text-blue-300',
    gradient: 'from-blue-600 to-blue-800 dark:from-blue-700 dark:to-blue-900'
  };
}
