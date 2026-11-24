type P = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconSliders = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconSend = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const IconWave = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg>
);
export const IconMic = ({ size = 30 }: P) => (
  <svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
);
export const IconCaptions = ({ size = 22 }: P) => (
  <svg {...base(size)}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 12h4M13 12h4M7 15.5h10" /></svg>
);
export const IconSpeaker = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></svg>
);
export const IconMute = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
);
export const IconHangup = ({ size = 24 }: P) => (
  <svg {...base(size)}><path d="M3 14.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.4-1.4v-2.3a10.5 10.5 0 00-6.4 0v2.3l-3.4 1.4z" /></svg>
);
export const IconImage = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>
);
export const IconStop = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
