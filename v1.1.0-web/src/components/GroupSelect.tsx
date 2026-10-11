import { useEffect, useRef, useState } from 'react';
import type { Group } from '../types';

interface GroupSelectProps {
  groups: Group[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
}

export function GroupSelect({ groups, value, onChange, id }: GroupSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
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

  const selected = groups.find((group) => group.id === value) ?? groups[0];

  return (
    <div className={`group-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className="group-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="gs-dot" style={{ backgroundColor: selected.color }} />
        <span className="gs-name">{selected.name}</span>
        <svg className="gs-caret" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul className="group-select-menu" role="listbox">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                role="option"
                aria-selected={group.id === value}
                className={`group-select-option ${group.id === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(group.id);
                  setOpen(false);
                }}
              >
                <span className="gs-dot" style={{ backgroundColor: group.color }} />
                <span className="gs-name">{group.name}</span>
                {group.id === value && <span className="gs-check">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
