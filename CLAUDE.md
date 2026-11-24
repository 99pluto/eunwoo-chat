# CLAUDE.md — eunwoo-chat

Next.js 15 (App Router) + React 19 + TypeScript. 은우라는 가상 캐릭터와 영상통화하듯 대화하는 웹 앱.

## 명령어
- `npm run dev` — 개발 서버 (http://localhost:3000)
- `npm run build` — 프로덕션 빌드 (타입 검사 포함)
- `npm run typecheck` — 타입 검사만
- `npm run tts:test` — .env.local의 Typecast 키·목소리로 음성 한 문장 생성·재생 (연결 확인)

## 핵심 흐름
- `components/ChatScreen.tsx`의 `ask()`가 `/api/chat`에 대화 기록을 보내고, 스트리밍으로 받은 글자를 말풍선에 채운다.
- `app/api/chat/route.ts`는 메시지를 정리(user로 시작, 역할 교대)한 뒤 `@anthropic-ai/sdk`의 `messages.stream`으로 Claude를 호출한다. 시스템 프롬프트는 `lib/persona.ts`.
- 음성 모드: `useSpeech.listen()`(Web Speech 인식) → `respond()`가 `ask()`의 스트리밍 글자를 `SentenceSplitter`로 문장 단위로 잘라 `SpeechQueue`에 넣음 → 큐가 문장별로 `/api/tts`(외부 TTS) 음성을 미리 받아 순서대로 재생, 실패하면 `useSpeech.speak()`(speechSynthesis)로 대체. 단계는 `phase`(idle/listening/thinking/speaking). 끼어들기는 `stopTalking()`(AbortController + queue.stop()).
- `/api/tts`: env에 키가 있는 서비스를 고름(Typecast → Google → ElevenLabs, `TTS_PROVIDER`로 지정). 키가 없으면 GET은 provider null, POST는 204. POST body의 `voiceId`(설정의 ttsVoiceId, 비면 env 값)와 `rate`(설정의 빠르기 배율)를 각 서비스 파라미터로 변환.
- 설정·대화는 localStorage (`eunwoo-chat:settings`, `eunwoo-chat:messages`).

## 규칙
- UI 문구는 한국어. 캐릭터 답변은 짧게(2~3문장), 마크다운·이모지 없이 (음성으로 읽히므로).
- `lib/persona.ts`의 "안전 원칙"과 `lib/safety.ts`의 위기 안내는 제거하지 않는다. AI임을 숨기지 않는다.
- API 키(Claude, TTS)는 서버(route.ts)에서만 쓴다. 클라이언트 코드로 옮기지 않는다.
- 스타일은 `app/globals.css` 한 곳. 테마 색은 CSS 변수 `--accent`, `--accent-soft`, `--scrim`.
