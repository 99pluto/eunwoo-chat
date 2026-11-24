# 은우와 대화 (eunwoo-chat)

사진 속 캐릭터와 영상통화하듯 대화하는 웹 앱 프로토타입입니다.
캔버스 시안 "B. 영상통화형 — 은우"를 실제로 동작하게 옮긴 것입니다.

## 할 수 있는 것

- **문자 대화**: 사진이 화면을 가득 채우고, 아래쪽 반투명 말풍선으로 대화합니다. 답변은 Claude API로 실시간 생성됩니다.
- **음성 대화**: 입력창 옆 파형 버튼 → 마이크를 눌러 말하고, 은우가 목소리로 답합니다. 답의 첫 문장이 만들어지는 즉시 읽기 시작하고, 말하는 중이나 생각하는 중에도 마이크를 눌러 끼어들 수 있습니다. 자막, 소리 켜기·끄기, 통화 종료를 지원합니다. 음성 인식이 안 되는 브라우저나 마이크를 허용하지 않은 경우에는 음성 모드에 입력창이 나타나고, 입력한 말에 목소리로 답합니다.
- **꾸미기**: 주인공 사진 올리기, 부를 이름, 테마 색 6종, 화면 톤 4종, 목소리·빠르기 선택과 미리 듣기. 설정과 대화 기록은 브라우저(localStorage)에 저장됩니다.
- **안전 장치**: 화면에 "AI" 표시를 하고, 위기 신호가 담긴 말을 하면 109·1577-0199 상담 전화 안내를 띄웁니다. 캐릭터 프롬프트에도 같은 원칙이 들어 있습니다.

## 실행 방법

필요한 것: Node.js 20 이상, Anthropic API 키

```bash
cd eunwoo-chat
npm install
cp .env.example .env.local     # 파일을 열어 ANTHROPIC_API_KEY 입력
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 음성 인식은 **Chrome 또는 Safari**에서 됩니다.
휴대폰에서 음성 기능을 쓰려면 HTTPS가 필요합니다 (배포하거나 ngrok 같은 터널 사용).

## Typecast 연결하기

1. `.env.local`을 열어 두 값을 채웁니다 (따옴표·공백 없이).
   ```
   TYPECAST_API_KEY=발급받은_키
   TYPECAST_VOICE_ID=tc_로_시작하는_목소리_ID
   ```
   목소리 ID는 https://studio.typecast.ai/developers/api/voices 에서 복사합니다.
2. 연결 확인: `npm run tts:test` → "✓ 성공!"과 함께 은우 목소리가 재생되면 끝. 실패하면 이유(키 오류, 목소리 ID 오류, 크레딧 부족 등)가 나옵니다.
3. `npm run dev`로 실행 → 꾸미기 › 목소리에 "고품질 음성(Typecast)"이 보이면 적용된 것입니다.
   - 꾸미기에서 목소리 ID를 넣으면 `.env.local`을 고치지 않고 다른 목소리를 바로 비교할 수 있습니다.
   - 빠르기 슬라이더는 Typecast 음성에도 적용됩니다.
   - Typecast 호출이 실패하면 그 문장은 기기 음성으로 읽고, 꾸미기에 실패 이유가 표시됩니다.

## 목소리를 자연스럽게 (3단계)

1. **무료 — 기기 음성 개선** (설정 없이 자동)
   - 설치된 한국어 음성 중 "프리미엄/향상됨" 음성을 자동으로 골라 씁니다. 꾸미기 › 목소리에서 직접 고르고 미리 들어 볼 수 있습니다.
   - Mac: 시스템 설정 › 손쉬운 사용 › 읽기 및 말하기 › 시스템 음성 › **음성 관리**에서 한국어 "프리미엄" 음성을 내려받으세요. 그다음 브라우저를 다시 열면 목록에 ★로 표시됩니다.
   - 은우의 말투도 소리 내어 읽기 좋게 짧은 문장, 쉼표, 가끔의 추임새로 쓰도록 맞춰 두었습니다 (`lib/persona.ts`).
2. **유료 — 고품질 음성 API**: `.env.local`에 Typecast, Google Chirp 3 HD, ElevenLabs 중 하나의 키를 넣으면 자동으로 그 음성을 씁니다 (`.env.example` 참고). 실패하면 그 문장만 기기 음성으로 읽습니다.
   - Typecast는 앞 문장 맥락을 보고 감정·억양을 맞추는 "스마트 감정" 옵션을 켜 두었습니다.
3. **빠른 응답 — 문장 단위 스트리밍**: Claude의 답을 받는 동안 문장이 완성될 때마다 바로 음성을 만들어, 첫 문장부터 읽기 시작합니다 (`lib/sentences.ts`, `lib/speechQueue.ts`).

## 구조

```
app/
  page.tsx            첫 화면
  layout.tsx          폰트·메타 정보
  globals.css         모든 스타일 (테마 색은 CSS 변수 --accent 등)
  api/chat/route.ts   Claude API 호출 (스트리밍 응답)
  api/tts/route.ts    고품질 음성 API 프록시 (Typecast / Google / ElevenLabs)
components/
  ChatScreen.tsx      메인 화면: 문자 모드 + 음성 모드
  SettingsSheet.tsx   꾸미기 시트 (사진·이름·테마·화면 톤)
  Icons.tsx           선 아이콘
hooks/
  useSpeech.ts        음성 인식(STT)·음성 합성(TTS) — 브라우저 Web Speech API
lib/
  persona.ts          은우 캐릭터 시스템 프롬프트, 첫 인사
  themes.ts           테마 색·화면 톤·기본 설정
  safety.ts           위기 신호 키워드와 상담 전화
  sentences.ts        스트리밍 글자에서 완성된 문장 잘라 내기
  speechQueue.ts      문장 단위 음성 재생 큐 (미리 받기, 끼어들기, 실패 시 기기 음성)
public/
  eunwoo.webp         기본 캐릭터 그림
scripts/
  tts-test.mjs        Typecast 연결 확인 (npm run tts:test)
```

## 바꾸기 쉬운 곳

| 바꾸고 싶은 것 | 파일 |
| --- | --- |
| 말투, 성격 | `lib/persona.ts` |
| 기본 이름·사진·색 | `lib/themes.ts`의 `DEFAULT_SETTINGS` |
| 고품질 음성 서비스·목소리 | `.env.local`의 `TTS_PROVIDER`, `*_VOICE_ID` 등 |
| 기기 음성 높낮이·속도 | `hooks/useSpeech.ts`의 `speak()` (`rate`, `pitch`) |
| 사용할 Claude 모델 | `.env.local`의 `ANTHROPIC_MODEL` |

## 다음 단계로 해 볼 만한 것

- 말이 끝나는 순간을 더 빨리 알아채기 (서버형 음성 인식 API로 교체)
- 로그인과 서버 저장 (지금은 브라우저에만 저장)
- 배포 (Vercel 등) — `ANTHROPIC_API_KEY` 환경 변수 설정 필요

## 주의

- 실존 인물(연예인, 지인 등)의 사진이나 그 사진을 바탕으로 그린 그림은 대화 상대로 쓰지 마세요. 초상권·퍼블리시티권 문제가 생길 수 있습니다.
- 이 앱은 전문 상담이나 치료를 대신하지 않습니다.
