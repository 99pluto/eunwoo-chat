// Typecast 연결 확인용 스크립트.
// 실행: npm run tts:test
// .env.local의 TYPECAST_API_KEY, TYPECAST_VOICE_ID로 한 문장을 만들어 tts-test.mp3로 저장하고 바로 재생한다(Mac).

import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const key = process.env.TYPECAST_API_KEY;
const voice = process.env.TYPECAST_VOICE_ID;

if (!key || !voice) {
  console.error('✗ .env.local에 TYPECAST_API_KEY와 TYPECAST_VOICE_ID를 둘 다 넣어 주세요.');
  process.exit(1);
}
if (!/^(tc|uc)_/.test(voice)) {
  console.error(`✗ TYPECAST_VOICE_ID는 tc_ 또는 uc_로 시작해야 해요. 지금 값: ${voice.slice(0, 12)}…`);
  process.exit(1);
}

console.log('Typecast에 음성을 요청하는 중…');
const res = await fetch('https://api.typecast.ai/v1/text-to-speech', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
  body: JSON.stringify({
    voice_id: voice,
    text: '안녕, 나야. 오늘 하루는 어땠어? 천천히 얘기해 줘.',
    model: process.env.TYPECAST_MODEL || 'ssfm-v30',
    language: 'kor',
    prompt: { emotion_type: 'smart' },
    output: { audio_format: 'mp3' },
  }),
});

if (!res.ok) {
  const hint = {
    401: 'API 키가 올바르지 않아요. 키를 다시 복사해 붙여 넣어 주세요.',
    402: '크레딧이 부족해요. Typecast 요금제·크레딧을 확인해 주세요.',
    404: '목소리 ID를 찾을 수 없어요. 목소리 목록에서 ID를 다시 복사해 주세요.',
    422: '요청 값이 올바르지 않아요. TYPECAST_MODEL 값을 비우거나 ssfm-v30으로 두세요.',
    429: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  }[res.status];
  console.error(`✗ 실패 (${res.status}) ${hint ?? ''}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
await writeFile('tts-test.mp3', buf);
console.log(`✓ 성공! tts-test.mp3 (${Math.round(buf.length / 1024)}KB)를 저장했어요. 재생합니다…`);
if (process.platform === 'darwin') execFile('afplay', ['tts-test.mp3'], () => {});
