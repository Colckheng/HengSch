import { useEffect, useRef, useState } from 'react';

export interface SwissSelectOption {
  value: string;
  label: string;
}

interface SwissSelectProps {
  options: SwissSelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** 终态卡/不可编辑场景：触发器与菜单禁用 */
  disabled?: boolean;
}

export function SwissSelect({ options, value, onChange, id, placeholder, disabled = false }: SwissSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const selected = options.find((option) => option.value === value);

  const toggle = (): void => {
    if (disabled) return;
    if (!open) {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setUp(window.innerHeight - rect.bottom < 240 && rect.top > 240);
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className={`group-select ${open ? 'open' : ''} ${up ? 'up' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className="group-select-trigger"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={`gs-name ${selected ? '' : 'placeholder'}`}>{selected?.label ?? placeholder ?? '请选择'}</span>
        <svg className="gs-caret" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul className="group-select-menu" role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`group-select-option ${option.value === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="gs-name">{option.label}</span>
                {option.value === value && <span className="gs-check">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
