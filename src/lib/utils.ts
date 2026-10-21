import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function triggerPrintDialog(className?: string) {
  if (className) {
    document.body.classList.add(className);
  }
  const cleanup = () => {
    if (className) {
      document.body.classList.remove(className);
    }
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => {
    try {
      window.print();
    } catch (e) {
      console.warn('Print error:', e);
    }
    setTimeout(cleanup, 2000);
  }, 150);
}
