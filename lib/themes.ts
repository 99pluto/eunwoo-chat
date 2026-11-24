export type Theme = { id: string; name: string; color: string; soft: string };
export type Backdrop = { id: string; name: string; swatch: string; scrim: string };

export const THEMES: Theme[] = [
  { id: 'olive', name: '올리브', color: '#5F6B2E', soft: '#E6E9D3' },
  { id: 'coral', name: '코랄', color: '#C4573D', soft: '#F6DED6' },
  { id: 'sage', name: '세이지', color: '#3F7350', soft: '#DCE9DF' },
  { id: 'blue', name: '블루', color: '#2F6DB5', soft: '#D9E5F4' },
  { id: 'lilac', name: '라일락', color: '#7452B0', soft: '#E6DDF4' },
  { id: 'charcoal', name: '차콜', color: '#2F3437', soft: '#E1E3E5' },
];

// 사진 위에 깔리는 어두운 막(scrim)의 색. 말풍선 글자가 어떤 사진 위에서도 읽히게 해 준다.
export const BACKDROPS: Backdrop[] = [
  { id: 'forest', name: '숲', swatch: '#E4ECE1', scrim: '22,42,28' },
  { id: 'cream', name: '크림', swatch: '#F7F3EC', scrim: '58,40,30' },
  { id: 'mist', name: '안개', swatch: '#E9EFF4', scrim: '22,36,56' },
  { id: 'night', name: '밤', swatch: '#1B2130', scrim: '14,17,26' },
];

export type Settings = {
  name: string;
  themeId: string;
  backdropId: string;
  photo: string; // URL 또는 data URL
  voiceURI: string; // 브라우저 음성 선택 ('' = 자동으로 가장 좋은 음성)
  rate: number; // 말 빠르기 배율 (0.8~1.3, 기본 1)
  ttsVoiceId: string; // 외부 TTS 목소리 ID ('' = .env.local 값 사용)
};

export const DEFAULT_SETTINGS: Settings = {
  name: '은우',
  themeId: 'olive',
  backdropId: 'forest',
  photo: '/eunwoo.webp',
  voiceURI: '',
  rate: 1,
  ttsVoiceId: '',
};

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function findBackdrop(id: string): Backdrop {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}
