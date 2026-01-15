'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface ModalOptions {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ToastOptions {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface ModalContextType {
  showModal: (options: ModalOptions) => Promise<boolean>;
  showToast: (options: ToastOptions) => void;
  confirm: (message: string, title?: string) => Promise<boolean>;
  alert: (message: string, title?: string, type?: 'info' | 'success' | 'warning' | 'error') => Promise<void>;
}

const ModalContext = createContext<ModalContextType | null>(null);

// Hook
export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
};

// Toast Component
const Toast = ({ message, type = 'info', onClose }: { message: string; type: string; onClose: () => void }) => {
  const colors = {
    info: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400',
    success: 'from-green-500/20 to-emerald-500/20 border-green-500/30 text-green-400',
    warning: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400',
    error: 'from-red-500/20 to-pink-500/20 border-red-500/30 text-red-400'
  };

  const icons = {
    info: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl bg-gradient-to-r ${colors[type as keyof typeof colors]} shadow-lg`}
    >
      {icons[type as keyof typeof icons]}
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
};

// Modal Component
const Modal = ({
  options,
  onClose,
  onConfirm
}: {
  options: ModalOptions;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  const { title, message, type = 'info', confirmText = '确定', cancelText = '取消' } = options;
  const isConfirm = type === 'confirm';

  const colors = {
    info: { bg: 'from-blue-500 to-cyan-500', shadow: 'shadow-blue-500/30', icon: 'text-blue-400' },
    success: { bg: 'from-green-500 to-emerald-500', shadow: 'shadow-green-500/30', icon: 'text-green-400' },
    warning: { bg: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/30', icon: 'text-amber-400' },
    error: { bg: 'from-red-500 to-pink-500', shadow: 'shadow-red-500/30', icon: 'text-red-400' },
    confirm: { bg: 'from-purple-500 to-pink-500', shadow: 'shadow-purple-500/30', icon: 'text-purple-400' }
  };

  const icons = {
    info: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    confirm: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  const handleConfirm = async () => {
    if (options.onConfirm) {
      setLoading(true);
      try {
        await options.onConfirm();
      } finally {
        setLoading(false);
      }
    }
    onConfirm();
  };

  const color = colors[type];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm"
      >
        {/* Glow effect */}
        <div className={`absolute -inset-1 bg-gradient-to-r ${color.bg} rounded-2xl blur opacity-30`} />

        {/* Content */}
        <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-5">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -top-1/2 -left-1/2 w-full h-full"
            >
              <div className={`w-full h-full bg-gradient-to-br ${color.bg} rounded-full blur-3xl`} />
            </motion.div>
          </div>

          <div className="relative p-6">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${color.bg} ${color.shadow} shadow-lg flex items-center justify-center text-white`}>
                {icons[type]}
              </div>
            </motion.div>

            {/* Title */}
            {title && (
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-xl font-bold text-white text-center mb-2"
              >
                {title}
              </motion.h3>
            )}

            {/* Message */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/70 text-center mb-6"
            >
              {message}
            </motion.p>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={`flex gap-3 ${isConfirm ? '' : 'justify-center'}`}
            >
              {isConfirm && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all border border-white/10"
                >
                  {cancelText}
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                onClick={handleConfirm}
                disabled={loading}
                className={`${isConfirm ? 'flex-1' : 'px-8'} py-3 bg-gradient-to-r ${color.bg} text-white font-bold rounded-xl ${color.shadow} shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    处理中...
                  </>
                ) : (
                  confirmText
                )}
              </motion.button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Provider Component
export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modal, setModal] = useState<{ options: ModalOptions; resolve: (value: boolean) => void } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; options: ToastOptions }[]>([]);
  let toastId = 0;

  const showModal = useCallback((options: ModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({ options, resolve });
    });
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, options }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options.duration || 3000);
  }, []);

  const confirm = useCallback((message: string, title?: string): Promise<boolean> => {
    return showModal({ message, title, type: 'confirm' });
  }, [showModal]);

  const alert = useCallback((message: string, title?: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): Promise<void> => {
    return showModal({ message, title, type }).then(() => {});
  }, [showModal]);

  const handleClose = useCallback(() => {
    if (modal) {
      modal.resolve(false);
      modal.options.onCancel?.();
      setModal(null);
    }
  }, [modal]);

  const handleConfirm = useCallback(() => {
    if (modal) {
      modal.resolve(true);
      setModal(null);
    }
  }, [modal]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ModalContext.Provider value={{ showModal, showToast, confirm, alert }}>
      {children}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.options.message}
              type={toast.options.type || 'info'}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <Modal
            options={modal.options}
            onClose={handleClose}
            onConfirm={handleConfirm}
          />
        )}
      </AnimatePresence>
    </ModalContext.Provider>
  );
};

export default ModalProvider;
