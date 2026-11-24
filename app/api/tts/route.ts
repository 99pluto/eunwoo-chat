// 외부 TTS(음성 합성) 프록시. API 키는 서버에만 두고, 브라우저에는 음성 파일만 돌려준다.
// .env.local에 키를 넣은 서비스 하나를 자동으로 고른다 (TTS_PROVIDER로 강제 지정 가능).
// 키가 하나도 없으면 GET은 { provider: null }을, POST는 204를 돌려주고 브라우저 음성을 쓰게 된다.

export const runtime = 'nodejs';

type Provider = 'typecast' | 'google' | 'elevenlabs';

function pickProvider(): Provider | null {
  const forced = (process.env.TTS_PROVIDER || '').toLowerCase();
  const ready: Record<Provider, boolean> = {
    typecast: !!(process.env.TYPECAST_API_KEY && process.env.TYPECAST_VOICE_ID),
    google: !!process.env.GOOGLE_TTS_API_KEY,
    elevenlabs: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
  };
  if (forced === 'browser') return null;
  if (forced in ready) return ready[forced as Provider] ? (forced as Provider) : null;
  return (['typecast', 'google', 'elevenlabs'] as Provider[]).find((p) => ready[p]) ?? null;
}

const LABEL: Record<Provider, string> = {
  typecast: 'Typecast',
  google: 'Google Chirp 3 HD',
  elevenlabs: 'ElevenLabs',
};

export async function GET() {
  const p = pickProvider();
  return Response.json({ provider: p, label: p ? LABEL[p] : null });
}

type Opts = { previousText: string; voiceId: string; rate: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

async function typecast(text: string, o: Opts): Promise<Response> {
  return fetch('https://api.typecast.ai/v1/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.TYPECAST_API_KEY! },
    body: JSON.stringify({
      voice_id: o.voiceId || process.env.TYPECAST_VOICE_ID,
      text,
      model: process.env.TYPECAST_MODEL || 'ssfm-v30',
      language: 'kor',
      // "스마트" 감정: 앞 문장 맥락을 보고 감정·억양을 자동으로 맞춘다
      prompt: { emotion_type: 'smart', previous_text: o.previousText.slice(-2000) },
      output: {
        audio_format: 'mp3',
        audio_tempo: clamp(Number(process.env.TYPECAST_TEMPO || 1) * o.rate, 0.5, 2),
        audio_pitch: Number(process.env.TYPECAST_PITCH || 0),
      },
    }),
  });
}

async function google(text: string, o: Opts): Promise<Response> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY!)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'ko-KR', name: o.voiceId || process.env.GOOGLE_TTS_VOICE || 'ko-KR-Chirp3-HD-Charon' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: clamp(o.rate, 0.25, 2) },
      }),
    },
  );
  if (!res.ok) return res;
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) return new Response('no audio', { status: 502 });
  return new Response(Buffer.from(data.audioContent, 'base64'), { headers: { 'Content-Type': 'audio/mpeg' } });
}

async function elevenlabs(text: string, o: Opts): Promise<Response> {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(o.voiceId || process.env.ELEVENLABS_VOICE_ID!)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
        voice_settings: { speed: clamp(o.rate, 0.7, 1.2) },
      }),
    },
  );
}

export async function POST(req: Request) {
  const provider = pickProvider();
  if (!provider) return new Response(null, { status: 204 });

  let body: { text?: string; previousText?: string; voiceId?: string; rate?: number };
  try {
    body = await req.json();
  } catch {
    return new Response('잘못된 요청이에요.', { status: 400 });
  }
  const text = String(body.text ?? '').trim().slice(0, 1000);
  if (!text) return new Response('읽을 문장이 없어요.', { status: 400 });

  // 화면에서 고른 목소리 ID (영문·숫자·_·- 만 허용), 빠르기 배율
  const rawId = String(body.voiceId ?? '').trim();
  const voiceId = /^[A-Za-z0-9_-]{3,80}$/.test(rawId) ? rawId : '';
  const rate = clamp(Number(body.rate) || 1, 0.5, 2);
  const o: Opts = { previousText: String(body.previousText ?? ''), voiceId, rate };

  try {
    const call = () =>
      provider === 'typecast' ? typecast(text, o)
      : provider === 'google' ? google(text, o)
      : elevenlabs(text, o);
    // 일시적인 오류(요청 과다 429, 서버 오류 5xx)는 잠깐 쉬었다가 두 번까지 다시 시도
    let res = await call();
    for (let i = 0; i < 2 && (res.status === 429 || res.status >= 500); i++) {
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      res = await call();
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(`[tts] ${provider} 오류 ${res.status}:`, detail);
      const hint: Record<number, string> = {
        401: 'API 키가 올바르지 않아요', 402: '크레딧이 부족해요', 403: '이 키로는 쓸 수 없는 기능이에요',
        404: '목소리 ID를 찾을 수 없어요', 422: '요청 값이 올바르지 않아요', 429: '요청이 너무 많아요',
      };
      return new Response(`음성 생성 실패 (${res.status}${hint[res.status] ? ': ' + hint[res.status] : ''})`, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: { 'Content-Type': res.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error(`[tts] ${provider} 연결 오류`, err);
    return new Response('음성 생성 실패', { status: 502 });
  }
}
