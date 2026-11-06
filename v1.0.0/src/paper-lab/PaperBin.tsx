import type { Rect } from './gesture';

/** Split depth lets a released ball pass behind the front wall. */
export function PaperBin({ visible, hot, near = false, dropping = false, rect }: { visible: boolean; hot: boolean; near?: boolean; dropping?: boolean; rect: Rect }): JSX.Element {
  const feedback = `${visible ? 'is-visible' : ''} ${near ? 'is-near' : ''} ${hot ? 'is-hot' : ''} ${dropping ? 'is-dropping' : ''}`;
  const position = { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
  const opening = 'M22 40L29 29L43 20L65 13L88 11L110 13L132 20L147 30L154 42L143 54L117 63L89 66L61 63L36 54Z';
  const front = 'M22 40L36 54L61 63L89 66L117 63L143 54L154 42L132 146L112 160L88 166L62 162L43 151Z';
  return <>
    <div className={`paper-bin ${feedback}`} style={position} role="img" aria-label="折纸纸篓：将纸团拖到这里关闭本次提醒" aria-hidden={!visible} data-testid="paper-bin" data-hot={hot}>
      <svg className="basket-back" viewBox="0 0 176 184" aria-hidden="true">
        <defs>
          <radialGradient id="basket-shadow"><stop stopColor="#51483D" stopOpacity=".32" /><stop offset="1" stopColor="#51483D" stopOpacity="0" /></radialGradient>
          <linearGradient id="basket-inner" x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#E4DFD1" /><stop offset=".5" stopColor="#B8AF9D" /><stop offset="1" stopColor="#797160" /></linearGradient>
          <radialGradient id="basket-warm-light"><stop stopColor="#FFF5CE" stopOpacity=".85" /><stop offset="1" stopColor="#E8D5A5" stopOpacity="0" /></radialGradient>
          <clipPath id="basket-opening-clip"><path d={opening} /></clipPath>
        </defs>
        <ellipse cx="88" cy="166" rx="70" ry="17" fill="url(#basket-shadow)" />
        <ellipse className="basket-landing" cx="88" cy="166" rx="68" ry="15" fill="url(#basket-shadow)" />
        <path d={opening} fill="url(#basket-inner)" />
        <g clipPath="url(#basket-opening-clip)">
          <path d="M22 40L43 20L52 76L36 65Z" fill="#F2EEE3" />
          <path d="M43 20L65 13L72 80L52 76Z" fill="#D6CFC0" />
          <path d="M65 13L88 11L88 80L72 80Z" fill="#E5DFD0" opacity=".7" />
          <path d="M88 11L110 13L105 80L88 80Z" fill="#A79E8C" opacity=".45" />
          <path d="M110 13L132 20L120 77L105 80Z" fill="#BEB5A3" />
          <path d="M132 20L147 30L135 68L120 77Z" fill="#A69B87" />
          <path d="M147 30L154 42L143 61L135 68Z" fill="#E2DACA" />
          <path d="M43 20L52 76M65 13L72 80M88 11L88 80M110 13L105 80M132 20L120 77" fill="none" stroke="#746B59" strokeOpacity=".13" strokeWidth=".7" />
        </g>
        <ellipse className="basket-glow" cx="88" cy="42" rx="65" ry="28" fill="url(#basket-warm-light)" clipPath="url(#basket-opening-clip)" />
        <path className="basket-opening" d={opening} fill="none" stroke="#F4F0E6" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
    <svg className={`basket-front ${feedback}`} style={position} viewBox="0 0 176 184" aria-hidden="true">
      <defs>
        <linearGradient id="basket-wall" x1="0" y1="0" x2="1" y2=".3"><stop stopColor="#B5AC99" /><stop offset=".38" stopColor="#DED7C8" /><stop offset=".75" stopColor="#EEE8DC" /><stop offset="1" stopColor="#C5BCA9" /></linearGradient>
        <linearGradient id="basket-rim" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#F1ECDF" /><stop offset="1" stopColor="#CDC4B2" /></linearGradient>
        <clipPath id="basket-wall-clip"><path d={front} /></clipPath>
        <filter id="basket-paper-grain" x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="14" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="table" tableValues="0 .18" /></feComponentTransfer>
          <feComposite in2="SourceAlpha" operator="in" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter="url(#basket-paper-grain)">
        <path d={front} fill="url(#basket-wall)" />
        <g clipPath="url(#basket-wall-clip)">
          <path d="M22 40L36 54L43 151L34 139Z" fill="#9E9583" opacity=".5" />
          <path d="M36 54L61 63L62 162L43 151Z" fill="#C6BDAA" />
          <path d="M36 54L62 162L47 137Z" fill="#A79D89" opacity=".55" />
          <path d="M61 63L89 66L88 166L62 162Z" fill="#DDD6C7" />
          <path d="M61 63L75 120L62 162Z" fill="#F4EFE3" opacity=".46" />
          <path d="M89 66L117 63L112 160L88 166Z" fill="#E9E3D6" />
          <path d="M117 63L99 127L112 160Z" fill="#C6BCA8" opacity=".47" />
          <path d="M117 63L143 54L132 146L112 160Z" fill="#DFD7C7" />
          <path d="M143 54L122 121L132 146Z" fill="#F7F1E4" opacity=".55" />
          <path d="M143 54L154 42L132 146Z" fill="#B5AA95" opacity=".6" />
          <path d="M36 54L43 151M61 63L62 162M89 66L88 166M117 63L112 160M143 54L132 146" fill="none" stroke="#FFF9EB" strokeOpacity=".35" strokeWidth=".65" />
          <path d="M29 54L39 68L62 78L89 81L116 78L140 68L150 54" fill="none" stroke="#776B55" strokeOpacity=".16" strokeWidth="2.5" />
        </g>
        <path d="M22 40L36 54L61 63L89 66L117 63L143 54L154 42L151 54L140 67L116 77L89 80L61 77L34 67L23 55Z" fill="url(#basket-rim)" />
        <path d="M22 40L36 54L34 67L23 55Z" fill="#B9AF9C" />
        <path d="M36 54L61 63L52 75L34 67Z" fill="#DED6C6" />
        <path d="M61 63L61 77L52 75Z" fill="#B9AD98" />
        <path d="M89 66L117 63L116 77L89 80Z" fill="#E8E0D1" />
        <path d="M143 54L151 54L140 67Z" fill="#ABA08C" />
        <path d="M117 63L143 54L140 67L125 73Z" fill="#EDE6D7" />
        <path d="M22 40L36 54L61 63L89 66L117 63L143 54L154 42" fill="none" stroke="#FFFBF1" strokeWidth="1" />
        <path d="M36 54L34 67M61 63L52 75M89 66L89 80M117 63L125 73M143 54L140 67" fill="none" stroke="#8F826B" strokeOpacity=".3" strokeWidth=".6" />
        <path d="M43 151L62 162L88 166L112 160L132 146" fill="none" stroke="#A69B85" strokeOpacity=".45" strokeWidth=".7" />
      </g>
    </svg>
    <div className={`basket-cue ${feedback}`} style={{ left: rect.x + rect.width / 2, top: rect.y - 38 }} aria-hidden="true">
      <span className="basket-cue-arrow">↓</span><strong>{dropping ? '轻轻放下了' : hot ? '松手放入' : '放进纸篓'}</strong>
      <small>只关闭提醒，待办仍保留</small>
    </div>
  </>;
}
