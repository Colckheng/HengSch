import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalFrameProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  describedBy?: string;
}

export function ModalFrame({
  label,
  onClose,
  children,
  className = 'modal-content',
  overlayClassName = 'modal-overlay',
  describedBy
}: ModalFrameProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [returnFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    // 原生 dialog 会把焦点放到首个可聚焦元素（关闭按钮），这里改回表单首字段。
    const field = dialog.querySelector<HTMLElement>('input, textarea, select');
    field?.focus();
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={overlayClassName}
      aria-label={label}
      aria-modal="true"
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        // 只拦 Escape：其余按键需冒泡到 window，保证桌面端闲置计时能被输入刷新。
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        if (!event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={className}>{children}</div>
    </dialog>,
    document.body
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '删除',
  cancelText = '取消',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  const messageId = useId();
  if (!isOpen) return <></>;

  return (
    <ModalFrame label={title} onClose={onCancel} className="confirm-box" overlayClassName="confirm-overlay" describedBy={messageId}>
      <div className="confirm-title">{title}</div>
      <p className="confirm-message" id={messageId}>{message}</p>
      <div className="confirm-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} autoFocus>
          {cancelText}
        </button>
        <button type="button" className="button button-danger" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    </ModalFrame>
  );
}
