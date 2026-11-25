import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * A native <dialog>: focus trapping, Escape and the backdrop come for free.
 * Closing plays the exit animation first, then tells the parent.
 */
export function Modal({
  title,
  onClose,
  className = '',
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function close() {
    const dialog = ref.current;
    if (!dialog) return onClose();
    dialog.classList.add('is-closing');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialog.close();
      onClose();
    };
    dialog.addEventListener('animationend', finish, { once: true });
    window.setTimeout(finish, 250); // reduced motion, or no animation ran
  }

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close(); // click on the backdrop
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      {children(close)}
    </dialog>
  );
}
