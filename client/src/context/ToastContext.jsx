import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircleIcon, XCircleIcon } from '../components/icons.jsx';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.type === 'error' ? XCircleIcon : CheckCircleIcon;
          return (
            <div
              key={t.id}
              className={`flex animate-fade-in items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${
                t.type === 'error'
                  ? 'border-red-100 bg-red-50/95 text-red-700'
                  : 'border-slate-200 bg-white/95 text-slate-800'
              }`}
            >
              <Icon className={`h-[1.1rem] w-[1.1rem] shrink-0 ${t.type === 'error' ? 'text-red-500' : 'text-green-500'}`} />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
