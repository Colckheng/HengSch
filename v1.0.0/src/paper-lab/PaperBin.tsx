import type { Rect } from './gesture';

/** Two depth layers let a released ball disappear behind the front wall. */
export function PaperBin({ visible, hot, rect }: { visible: boolean; hot: boolean; rect: Rect }): JSX.Element {
  const position = { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
  return <>
    <div className={`paper-bin ${visible ? 'is-visible' : ''} ${hot ? 'is-hot' : ''}`} style={position} aria-hidden={!visible} data-testid="paper-bin" data-hot={hot}>
      <svg className="basket-back" viewBox="0 0 176 184" aria-hidden="true">
        <defs>
          <radialGradient id="basket-shadow"><stop stopColor="#61615f" stopOpacity=".19" /><stop offset="1" stopColor="#61615f" stopOpacity="0" /></radialGradient>
          <linearGradient id="basket-inner" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a4a4a2" /><stop offset=".6" stopColor="#bcbcba" /><stop offset="1" stopColor="#cdcdcb" /></linearGradient>
          <linearGradient id="basket-back-wall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e8e8e6" /><stop offset="1" stopColor="#c3c3c1" /></linearGradient>
        </defs>
        <ellipse cx="88" cy="148" rx="70" ry="17" fill="url(#basket-shadow)" />
        <ellipse className="basket-landing" cx="88" cy="147" rx="70" ry="19" fill="none" stroke="#b8b8b6" strokeWidth="1" />
        <path d="M33 39L46 138Q88 157 130 138L143 39Z" fill="url(#basket-back-wall)" />
        <ellipse cx="88" cy="39" rx="55" ry="19" fill="#f1f1ef" stroke="#c6c6c4" strokeWidth="1" />
        <ellipse className="basket-opening" cx="88" cy="40" rx="49" ry="14" fill="url(#basket-inner)" />
        <path d="M41 42Q88 19 135 42" fill="none" stroke="#898987" strokeOpacity=".22" strokeWidth="2" />
      </svg>
    </div>
    <svg className={`basket-front ${visible ? 'is-visible' : ''} ${hot ? 'is-hot' : ''}`} style={position} viewBox="0 0 176 184" aria-hidden="true">
      <defs>
        <linearGradient id="basket-wall" x1="0" y1="0" x2="1" y2=".15"><stop stopColor="#d2d2d0" /><stop offset=".16" stopColor="#ececea" /><stop offset=".48" stopColor="#f6f6f4" /><stop offset=".8" stopColor="#dededc" /><stop offset="1" stopColor="#c4c4c2" /></linearGradient>
        <linearGradient id="basket-ribs" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#bdbdbb" stopOpacity=".25" /><stop offset=".5" stopColor="#afafad" stopOpacity=".38" /><stop offset="1" stopColor="#afafad" stopOpacity=".12" /></linearGradient>
      </defs>
      <path d="M33 39Q88 76 143 39L130 138Q88 158 46 138Z" fill="url(#basket-wall)" stroke="#c4c4c2" strokeWidth=".7" />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 40 + i * 9.6;
        const startY = 44 + 14 * Math.sin((i / 10) * Math.PI);
        const endX = 51 + i * 7.4;
        const endY = 138 + 9 * Math.sin((i / 10) * Math.PI);
        return <path key={i} d={`M${x} ${startY}L${endX} ${endY}`} fill="none" stroke="url(#basket-ribs)" strokeWidth="1.2" />;
      })}
      <path d="M34 39Q88 75 142 39" fill="none" stroke="#fcfcfa" strokeWidth="3" />
      <path d="M35 43Q88 78 141 43" fill="none" stroke="#b7b7b5" strokeOpacity=".45" strokeWidth=".7" />
      <path d="M47 138Q88 155 129 138" fill="none" stroke="#fcfcfa" strokeOpacity=".7" strokeWidth="1.5" />
    </svg>
  </>;
}
