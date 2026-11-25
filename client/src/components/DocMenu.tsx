import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
}

/** A small "more" menu. Closes on outside click, Escape, or after choosing an item. */
export function DocMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        className="icon-button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={index === 0 ? firstItem : undefined}
              role="menuitem"
              className={`menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
