'use client';

import { BACKDROPS, THEMES, type Settings } from '@/lib/themes';
import { IconImage } from './Icons';
import type { VoiceOption } from '@/hooks/useSpeech';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onClearChat: () => void;
  voices: VoiceOption[];
  serverVoiceLabel: string | null;
  serverProvider: string | null;
  ttsError: string;
  onPreviewVoice: () => void;
};

// 업로드한 사진을 최대 1080px로 줄여 data URL로 만든다 (브라우저 저장 용량 절약).
async function resizeImage(file: File, max = 1080): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SettingsSheet({ settings, onChange, onClose, onClearChat, voices, serverVoiceLabel, serverProvider, ttsError, onPreviewVoice }: Props) {
  const idHelp: Record<string, string> = {
    typecast: 'Typecast 목소리 ID (tc_로 시작). studio.typecast.ai/developers/api/voices 에서 복사해요.',
    google: 'Google 목소리 이름 (예: ko-KR-Chirp3-HD-Puck)',
    elevenlabs: 'ElevenLabs 목소리 ID',
  };
  const initial = (settings.name.trim() || '?').charAt(0);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      onChange({ photo: await resizeImage(f) });
    } catch {
      alert('사진을 불러오지 못했어요. 다른 사진으로 시도해 주세요.');
    }
    e.target.value = '';
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button type="button" className="backdrop-btn" aria-label="닫기" onClick={onClose} />
      <div className="sheet">
        <div className="grip" />
        <div className="row">
          <h2 id="sheet-title">대화방 꾸미기</h2>
          <button type="button" className="done" onClick={onClose}>완료</button>
        </div>

        <div className="photo-row">
          <div className="thumb">
            {settings.photo ? <img src={settings.photo} alt="지금 쓰는 사진" /> : initial}
          </div>
          <div className="actions">
            <label className="upload">
              <IconImage />
              주인공 사진 올리기
              <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
            </label>
            <span className="hint">사진은 이 브라우저 안에만 저장돼요</span>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="name-input">부를 이름</label>
          <input
            id="name-input" className="text-input" type="text" maxLength={12}
            value={settings.name} onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        <div className="field">
          <span className="label" id="theme-label">테마 색</span>
          <div className="swatches" role="group" aria-labelledby="theme-label">
            {THEMES.map((t) => (
              <button
                key={t.id} type="button" className="swatch" aria-label={t.name}
                aria-pressed={settings.themeId === t.id}
                style={{ background: t.color, ['--sw' as string]: t.color }}
                onClick={() => onChange({ themeId: t.id })}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label" id="bd-label">화면 톤</span>
          <div className="backdrops" role="group" aria-labelledby="bd-label">
            {BACKDROPS.map((b) => (
              <button
                key={b.id} type="button" className="bd" aria-pressed={settings.backdropId === b.id}
                onClick={() => onChange({ backdropId: b.id })}
              >
                <span className="chip" style={{ background: `rgb(${b.scrim})` }} />
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="voice-select">목소리</label>
          {serverVoiceLabel ? (
            <>
              <span className="hint">고품질 음성({serverVoiceLabel})을 쓰고 있어요.</span>
              <input
                id="voice-select" className="text-input" type="text" spellCheck={false} autoComplete="off"
                placeholder=".env.local의 목소리 사용 (비워 두기)"
                value={settings.ttsVoiceId}
                onChange={(e) => onChange({ ttsVoiceId: e.target.value.trim() })}
              />
              <span className="hint">{idHelp[serverProvider ?? ''] ?? ''} 다른 목소리를 바로 비교해 볼 때 넣어 보세요.</span>
            </>
          ) : (
            <>
              <select
                id="voice-select" className="text-input" value={settings.voiceURI}
                onChange={(e) => onChange({ voiceURI: e.target.value })}
              >
                <option value="">자동 (가장 자연스러운 음성)</option>
                {voices.map((v) => (
                  <option key={v.uri} value={v.uri}>{v.name}{v.quality >= 3 ? ' ★' : ''}</option>
                ))}
              </select>
              <span className="hint">
                {voices.some((v) => v.quality >= 3)
                  ? '★ 표시가 고품질 음성이에요.'
                  : 'Mac이라면 시스템 설정 › 손쉬운 사용 › 읽기 및 말하기 › 시스템 음성 › 음성 관리에서 한국어 "프리미엄" 음성을 내려받으면 훨씬 자연스러워져요.'}
              </span>
            </>
          )}
          <div className="rate-row">
            <label className="label" htmlFor="rate">빠르기</label>
            <input
              id="rate" type="range" min={0.8} max={1.3} step={0.05} value={settings.rate}
              onChange={(e) => onChange({ rate: Number(e.target.value) })}
            />
            <span className="hint" style={{ width: 40, textAlign: 'right' }}>{settings.rate.toFixed(2)}×</span>
          </div>
          <button type="button" className="upload" onClick={onPreviewVoice}>목소리 미리 듣기</button>
          {ttsError && <span className="hint" role="status" style={{ color: '#B3261E' }}>{ttsError} — 이 문장은 자막으로만 보여 드렸어요.</span>}
        </div>

        <button type="button" className="reset" onClick={onClearChat}>대화 기록 지우기</button>
      </div>
    </div>
  );
}
