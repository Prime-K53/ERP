import { useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmReturn {
  openConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  ConfirmComponent: React.FC;
}

export function useConfirmDialog(): ConfirmReturn {
  const [state, setState] = useState<ConfirmOptions & { open: boolean }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'primary',
  });
  const [resolve, setResolve] = useState<(value: boolean) => void>(() => () => {});

  const openConfirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((res) => {
      setState({ ...opts, open: true });
      setResolve(() => res);
    });
  }, []);

  const handleConfirm = () => {
    setState((prev) => ({ ...prev, open: false }));
    resolve(true);
  };

  const handleCancel = () => {
    setState((prev) => ({ ...prev, open: false }));
    resolve(false);
  };

  const ConfirmComponent = () => (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { openConfirm, ConfirmComponent };
}