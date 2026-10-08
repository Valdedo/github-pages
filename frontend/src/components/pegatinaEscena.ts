/* Escena de la cabecera «pegatina» (logo + camión). Generada a partir del prototipo; los ids llevan el prefijo cfp-. */
export const ESCENA_PEGATINA = `<defs>
    <filter id="cfp-pega" x="-20%" y="-30%" width="140%" height="170%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>
      <feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="b"/>
      <feDropShadow id="cfp-sombraLogo" in="b" dx="0" dy="3" stdDeviation="3" flood-color="#123A26" flood-opacity=".22" result="bs"/>
      <feMerge><feMergeNode in="bs"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="cfp-pegaCam" x="-10%" y="-20%" width="120%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>
      <feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="b"/>
      <feDropShadow in="b" dx="0" dy="4" stdDeviation="3.5" flood-color="#123A26" flood-opacity=".22" result="bs"/>
      <feMerge><feMergeNode in="bs"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="cfp-dorso" x="-30%" y="-40%" width="160%" height="190%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>
      <feFlood flood-color="#E9ECE6"/><feComposite in2="d" operator="in" result="b"/>
      <feDropShadow in="b" dx="2" dy="5" stdDeviation="4" flood-color="#123A26" flood-opacity=".3"/>
    </filter>
    <g id="cfp-arte">
      <image href="/brand/logo-tejado.png" x="-28" y="-46" width="56" height="42.8"/>
      <image href="/brand/logo-palabra.png" x="-95" y="2" width="190" height="39.6"/>
    </g>
    <filter id="cfp-silB" x="-20%" y="-30%" width="140%" height="170%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>
      <feFlood flood-color="#fff"/><feComposite in2="d" operator="in"/>
    </filter>
    <mask id="cfp-silueta" maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400"><g filter="url(#cfp-silB)"><use href="#cfp-arte"/></g></mask>
    <linearGradient id="cfp-gDorso" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".18" stop-color="#F4F5F2"/><stop offset=".55" stop-color="#DADFD7"/><stop offset="1" stop-color="#E8EBE5"/>
    </linearGradient>
    <linearGradient id="cfp-gPliegue" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#123A26" stop-opacity=".28"/><stop offset="1" stop-color="#123A26" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="cfp-frente"><polygon id="cfp-pFrente"/></clipPath>
    <clipPath id="cfp-detras"><polygon id="cfp-pDetras"/></clipPath>
  </defs>
  <g id="cfp-camion">
    <g id="cfp-camCuerpo">
      <g filter="url(#cfp-pegaCam)">
    <defs><clipPath id="cfp-cab"><path d="M208 118 V34 Q208 18 224 18 H266 Q280 18 285 30 L307 88 Q311 98 308 118 Z"/></clipPath></defs>
    <rect x="40" y="108" width="262" height="15" rx="7.5" fill="#1E2621"/>
    <rect x="128" y="112" width="40" height="11" rx="5.5" fill="#3A4340"/>
    <rect x="122" y="125" width="110" height="5" rx="2.5" fill="#B9BFBA"/>
    <rect x="40" y="76" width="146" height="36" rx="8" fill="#C9CEC9"/>
    <rect x="40" y="76" width="146" height="8" rx="4" fill="#DDE1DC"/>
    <path d="M113 84 V110" stroke="#A9AFAA" stroke-width="3" stroke-linecap="round"/>
    <path d="M48 97 H178" stroke="#B3B9B4" stroke-width="2" stroke-linecap="round"/>
    <rect x="56" y="103" width="6" height="4" rx="1.5" fill="#9AA19C"/><rect x="90" y="103" width="6" height="4" rx="1.5" fill="#9AA19C"/><rect x="128" y="103" width="6" height="4" rx="1.5" fill="#9AA19C"/><rect x="162" y="103" width="6" height="4" rx="1.5" fill="#9AA19C"/>
    <rect x="186" y="30" width="18" height="82" rx="9" fill="#D93A30"/>
    <rect x="186" y="30" width="7" height="82" rx="3.5" fill="#B82E26"/>
    <rect x="176" y="20" width="12" height="70" rx="6" fill="#E2453C"/>
    <rect x="176" y="20" width="5" height="70" rx="2.5" fill="#C23A31"/>
    <circle cx="191" cy="30" r="6" fill="#B82E26"/><circle cx="191" cy="30" r="2.2" fill="#F4D9D6"/>
    <path d="M182 90 V97" stroke="#3A3F3A" stroke-width="2" stroke-linecap="round"/>
    <path d="M179 97 Q182 102 185 97" stroke="#3A3F3A" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="190" y="112" width="8" height="20" rx="2" fill="#fff"/>
    <path d="M190 117 L198 113 M190 123 L198 119 M190 129 L198 125" stroke="#D93A30" stroke-width="3"/>
    <path d="M208 118 V34 Q208 18 224 18 H266 Q280 18 285 30 L307 88 Q311 98 308 118 Z" fill="#FAFBF8"/>
    <g clip-path="url(#cfp-cab)">
      <path d="M200 64 L230 68.0 L258 98 H200 Z" fill="#1F5A3A"/>
      <path d="M214 73.9 L312 86.9 V92.9 L214 79.9 Z" fill="#1A1A1A"/>
      <path d="M214 79.9 L312 92.9 V101.9 L214 88.9 Z" fill="#2FAE66"/>
      <rect x="208" y="98" width="110" height="22" fill="#4A524E"/>
    </g>
    <path d="M240 28 H268 Q276 28 279 36 L290 56 H240 Z" fill="#BFE3EE"/>
    <path d="M250 31 H259 L252 54 H247 Z" fill="#fff" opacity=".6"/>
    <path d="M298 88 H309" stroke="#EAF7F0" stroke-width="4" stroke-linecap="round"/>
    <rect x="296" y="104" width="16" height="10" rx="4" fill="#3A4340"/>
    <rect x="276" y="110" width="16" height="3" rx="1.5" fill="#9AA19C"/>
        <g id="cfp-r1"></g><g id="cfp-r2"></g>
        <g id="cfp-calco" opacity="0"><g id="cfp-calcoEsc" filter="url(#cfp-pega)"><use href="#cfp-arte"/></g></g>
      </g>
    </g>
  </g>
  <g id="cfp-logo">
    <g id="cfp-logoFrente" clip-path="url(#cfp-frente)"><g filter="url(#cfp-pega)"><use href="#cfp-arte"/></g>
      <rect id="cfp-pliegue" x="-200" y="-200" width="400" height="400" fill="url(#cfp-gPliegue)" mask="url(#cfp-silueta)"/></g>
    <g id="cfp-logoDorso"><g clip-path="url(#cfp-detras)">
      <g filter="url(#cfp-dorso)"><use href="#cfp-arte"/></g>
      <rect x="-200" y="-200" width="400" height="400" fill="url(#cfp-gDorso)" mask="url(#cfp-silueta)"/>
    </g></g>
  </g>
  <g id="cfp-golpe" stroke="#123A26" stroke-width="2.6" stroke-linecap="round"></g>`;
