interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
});

export function IconPlus({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconGroups({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </svg>
  );
}

export function IconPin({ size = 16, filled = false }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3l4 4-1.5 1.5.5 4.5-3 3-3-3 .5-4.5L8 7l4-4z" />
      <path d="M12 15v6" />
    </svg>
  );
}

export function IconCompact({ size = 16, filled = false }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="16" height="16" />
      <rect x="13" y="13" width="7" height="7" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

export function IconSnap({ size = 16, hidden = false }: IconProps & { hidden?: boolean }): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="10" height="14" />
      {hidden ? (
        <path d="M17 9l3 3-3 3M20 12h-6" />
      ) : (
        <path d="M20 9l-3 3 3 3M17 12h6" />
      )}
    </svg>
  );
}

export function IconPower({ size = 16, filled = false }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3v8" />
      <path d="M7.5 6.5a7 7 0 1 0 9 0" fill="none" />
    </svg>
  );
}

export function IconMinimize({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconMaximize({ size = 16, restore = false }: IconProps & { restore?: boolean }): JSX.Element {
  return (
    <svg {...base(size)}>
      {restore ? (
        <>
          <rect x="4" y="7" width="13" height="13" />
          <path d="M7 4h13v13" />
        </>
      ) : (
        <rect x="5" y="5" width="14" height="14" />
      )}
    </svg>
  );
}

export function IconClose({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconEdit({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M4 20l4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function IconTrash({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
