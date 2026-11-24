'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, findBackdrop, findTheme, type Settings } from '@/lib/themes';
import { greeting } from '@/lib/persona';
import { HELP_LINES, hasCrisisSignal } from '@/lib/safety';
import { useSpeech } from '@/hooks/useSpeech';
import { SentenceSplitter } from '@/lib/sentences';
import { SpeechQueue } from '@/lib/speechQueue';
import SettingsSheet from './SettingsSheet';
import {
  IconCaptions, IconHangup, IconMic, IconMute, IconSend, IconSliders, IconSpeaker, IconStop, IconWave,
} from './Icons';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; error?: boolean };
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const SETTINGS_KEY = 'eunwoo-chat:settings';
const MESSAGES_KEY = 'eunwoo-chat:messages';
const VOICE_OPEN = '응, 나 여기 있어. 편하게 말해.';

function splitAll(text: string): string[] {
  const sp = new SentenceSplitter();
  const out = sp.push(text);
  const last = sp.flush();
  if (last) out.push(last);
  return out;
}

// 0.1초짜리 무음 WAV. 사용자가 처음 누를 때 재생해 오디오 플레이어의 "자동 재생 잠금"을 풀어 둔다.
function silentWavUrl(): string {
  const n = 2205; // 22.05kHz × 0.1s
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const uid = () => Math.random().toString(36).slice(2, 10);
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function ChatScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'hello', role: 'assistant', content: greeting(DEFAULT_SETTINGS.name) },
  ]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [phase, setPhase] = useState<Phase>('idle');
  const [caption, setCaption] = useState<{ who: 'me' | 'them'; text: string } | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [notice, setNotice] = useState('');

  const [serverTts, setServerTts] = useState<{ provider: string; label: string } | null>(null);

  const [ttsError, setTtsError] = useState('');
  const [typedInVoice, setTypedInVoice] = useState('');
  const [micDenied, setMicDenied] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null); // 문자 모드에서 읽어 주는 중인 말풍선

  const speech = useSpeech(settings.voiceURI, settings.rate);
  const settingsRef = useRef(settings);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  settingsRef.current = settings;
  const messagesRef = useRef(messages);
  const modeRef = useRef(mode);
  const soundRef = useRef(soundOn);
  const serverTtsRef = useRef(serverTts);
  const queueRef = useRef<SpeechQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  messagesRef.current = messages;
  modeRef.current = mode;
  soundRef.current = soundOn;
  serverTtsRef.current = serverTts;

  /** 버튼을 누른 순간에 호출: 오디오 플레이어를 만들고 자동 재생 잠금을 푼다. */
  function unlockAudio() {
    if (typeof window === 'undefined') return;
    if (!playerRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      playerRef.current = a;
    }
    if (unlockedRef.current) return;
    const a = playerRef.current;
    a.src = silentWavUrl();
    a.play().then(() => { unlockedRef.current = true; }).catch(() => {});
  }

  // 화면을 떠나면 말하던 것·받아 오던 답을 멈춘다
  useEffect(() => () => {
    abortRef.current?.abort();
    queueRef.current?.stop();
  }, []);

  // 서버에 고품질 음성(외부 TTS)이 설정돼 있는지 확인
  useEffect(() => {
    fetch('/api/tts')
      .then((r) => r.json())
      .then((d) => setServerTts(d?.provider ? { provider: d.provider, label: d.label } : null))
      .catch(() => {});
  }, []);

  // 저장된 설정·대화 불러오기
  useEffect(() => {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      const m = localStorage.getItem(MESSAGES_KEY);
      if (m) {
        const parsed = JSON.parse(m) as Msg[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    catch { /* 사진이 너무 크면 저장 실패 — 화면에는 그대로 보임 */ }
  }, [settings, loaded]);

  useEffect(() => {
    if (!loaded || busy) return;
    try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.filter((m) => !m.error).slice(-60))); } catch {}
  }, [messages, busy, loaded]);

  // 통화 시간
  useEffect(() => {
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, mode]);

  const theme = findTheme(settings.themeId);
  const backdrop = findBackdrop(settings.backdropId);
  const displayName = settings.name.trim() || '상대방';

  /** Claude에게 묻고 답을 스트리밍으로 받아 화면에 채운다. 최종 답을 돌려준다. */
  const ask = useCallback(async (
    text: string,
    opts: { onDelta?: (acc: string) => void; signal?: AbortSignal } = {},
  ): Promise<string> => {
    const userMsg: Msg = { id: uid(), role: 'user', content: text };
    const replyId = uid();
    const history = [...messagesRef.current.filter((m) => !m.error), userMsg];
    setMessages([...history, { id: replyId, role: 'assistant', content: '' }]);
    setBusy(true);

    const patch = (content: string, error = false) =>
      setMessages((ms) => ms.map((m) => (m.id === replyId ? { ...m, content, error } : m)));

    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: opts.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.name,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        patch((await res.text()) || '답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', true);
        return '';
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patch(acc);
        opts.onDelta?.(acc);
      }
      acc = acc.trim();
      if (!acc) patch('답을 받지 못했어요. 다시 한 번 말해 줄래?', true);
      return acc;
    } catch {
      if (opts.signal?.aborted) {
        // 끼어들기로 멈춘 답: 들은 데까지만 남긴다
        if (acc.trim()) patch(acc.trim() + '…');
        else setMessages((ms) => ms.filter((m) => m.id !== replyId));
        return acc.trim();
      }
      patch('연결이 끊겼어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
      return '';
    } finally {
      setBusy(false);
    }
  }, [settings.name]);

  // ---------- 문자 대화 ----------
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t || busy) return;
    setDraft('');
    if (hasCrisisSignal(t)) setShowHelp(true);
    await ask(t);
  }

  // ---------- 음성 대화 ----------
  // 흐름: 듣기(STT) → Claude 답을 스트리밍으로 받으며 문장이 완성될 때마다 큐에 넣기
  //      → 큐가 문장별로 고품질 음성을 미리 받아 이어서 재생 → 다 읽으면 내 차례

  function makeQueue(onDrain: () => void, showInVoiceUi = true) {
    return new SpeechQueue({
      useServerTts: () => !!serverTtsRef.current,
      ttsParams: () => ({ voiceId: settingsRef.current.ttsVoiceId, rate: settingsRef.current.rate }),
      onServerError: (msg) => {
        setTtsError(msg || '음성을 만들지 못했어요');
        if (modeRef.current === 'voice') setNotice('목소리를 만들지 못한 문장은 자막으로 보여 드렸어요');
      },
      player: () => playerRef.current,
      soundOn: () => soundRef.current,
      browserSpeak: (t, end) => {
        if (speech.ttsSupported) speech.speak(t, end);
        else setTimeout(end, Math.min(7000, 700 + t.length * 95));
      },
      browserStop: speech.hush,
      onSentenceStart: (t) => {
        if (!showInVoiceUi || modeRef.current !== 'voice') return;
        setPhase('speaking');
        setCaption({ who: 'them', text: t });
      },
      onDrain,
    });
  }

  /** 말하던 것, 받아 오던 답을 모두 멈춘다. */
  function stopTalking() {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current?.stop();
    queueRef.current = null;
    speech.hush();
    setReadingId(null);
  }

  /** 정해진 문장을 읽는다 (첫 인사, 미리 듣기). */
  function sayLines(text: string, showInVoiceUi = true, onDone?: () => void) {
    stopTalking();
    const q = makeQueue(() => {
      if (queueRef.current !== q) return;
      queueRef.current = null;
      if (showInVoiceUi) setPhase((p) => (p === 'speaking' ? 'idle' : p));
      onDone?.();
    }, showInVoiceUi);
    queueRef.current = q;
    splitAll(text).forEach((line) => q.push(line));
    q.close();
  }

  /** 내 말에 답하고, 답을 문장 단위로 바로바로 읽는다. */
  async function respond(userText: string) {
    setPhase('thinking');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const splitter = new SentenceSplitter();
    const q = makeQueue(() => {
      if (queueRef.current !== q) return;
      queueRef.current = null;
      setPhase((p) => (p === 'speaking' || p === 'thinking' ? 'idle' : p));
    });
    queueRef.current = q;

    let seen = 0;
    const reply = await ask(userText, {
      signal: ctrl.signal,
      onDelta: (acc) => {
        const chunk = acc.slice(seen);
        seen = acc.length;
        splitter.push(chunk).forEach((line) => q.push(line));
      },
    });
    if (ctrl.signal.aborted || modeRef.current !== 'voice') return;
    abortRef.current = null;
    const last = splitter.flush();
    if (last) q.push(last);
    if (!reply) {
      q.stop();
      if (queueRef.current === q) queueRef.current = null;
      setPhase('idle');
      setNotice('답을 받지 못했어요. 다시 말해 주세요.');
      return;
    }
    q.close();
  }

  function beginListening() {
    setNotice('');
    setPhase('listening');
    setCaption({ who: 'me', text: '' });
    speech.listen(
      (finalText) => {
        if (modeRef.current !== 'voice') return;
        if (!finalText) { setPhase('idle'); setCaption(null); return; }
        setCaption({ who: 'me', text: finalText });
        if (hasCrisisSignal(finalText)) setShowHelp(true);
        void respond(finalText);
      },
      (msg) => {
        setNotice(msg);
        setPhase('idle');
        if (msg.includes('권한') || msg.includes('지원하지')) setMicDenied(true);
      },
    );
  }

  function startVoice() {
    unlockAudio();
    setSheet(false);
    setMode('voice');
    modeRef.current = 'voice';
    setNotice(speech.sttSupported ? '' : '이 브라우저는 음성 인식을 지원하지 않아서, 입력한 말에 목소리로 답해요.');
    setMessages((ms) => [...ms, { id: uid(), role: 'assistant', content: VOICE_OPEN }]);
    setPhase('speaking');
    setCaption({ who: 'them', text: VOICE_OPEN });
    sayLines(VOICE_OPEN);
  }

  function endVoice() {
    stopTalking();
    speech.abortListening();
    setMode('text');
    modeRef.current = 'text';
    setPhase('idle');
    setCaption(null);
    setNotice('');
  }

  function mainPress() {
    unlockAudio();
    if (phase === 'listening') { speech.stopListening(); return; }
    stopTalking(); // 말하는 중이거나 생각하는 중이면 끼어들기
    beginListening();
  }

  function toggleSound() {
    const next = !soundOn;
    soundRef.current = next;
    setSoundOn(next);
    if (!next) queueRef.current?.skipCurrent();
  }

  function onTypedInVoice(e: React.FormEvent) {
    e.preventDefault();
    const t = typedInVoice.trim();
    if (!t) return;
    setTypedInVoice('');
    unlockAudio();
    stopTalking();
    setCaption({ who: 'me', text: t });
    if (hasCrisisSignal(t)) setShowHelp(true);
    void respond(t);
  }

  /** 문자 모드: 말풍선의 스피커 버튼 — 그 말을 은우 목소리로 읽는다. 다시 누르면 멈춘다. */
  function readMessage(m: Msg) {
    unlockAudio();
    if (readingId === m.id) { stopTalking(); return; }
    setTtsError('');
    const text = m.content.replace(/…$/, '').trim();
    if (!text) return;
    sayLines(text, false, () => setReadingId((id) => (id === m.id ? null : id)));
    setReadingId(m.id);
  }

  function previewVoice() {
    unlockAudio();
    setTtsError('');
    sayLines('안녕, 나야. 오늘 하루는 어땠어? 천천히 얘기해 줘.', false);
  }

  function clearChat() {
    setMessages([{ id: uid(), role: 'assistant', content: greeting(settings.name) }]);
    setSheet(false);
  }

  // ---------- 화면 ----------
  const lastIsEmptyReply = busy && messages[messages.length - 1]?.content === '';
  const captionText = caption?.who === 'me' && phase === 'listening' ? speech.interim : caption?.text ?? '';
  const phaseLabel: Record<Phase, string> = {
    speaking: `${displayName}이(가) 말하는 중 · 눌러서 끼어들 수 있어요`,
    idle: '네 차례야 · 마이크를 눌러 말해 보세요',
    listening: '듣고 있어요 · 다 말하면 한 번 더 눌러 주세요',
    thinking: `${displayName}이(가) 생각하는 중…`,
  };
  const mainLabel: Record<Phase, string> = {
    speaking: '끼어들기', idle: '눌러서 말하기', listening: '다 말했어', thinking: '끼어들기',
  };
  const status = busy && mode === 'text'
    ? '입력 중…'
    : `${mode === 'voice' ? '음성 통화 중' : '영상통화 중'} · ${mmss(seconds)}`;

  return (
    <div
      className="screen"
      style={{
        ['--accent' as string]: theme.color,
        ['--accent-soft' as string]: theme.soft,
        ['--scrim' as string]: backdrop.scrim,
      }}
    >
      {settings.photo ? (
        <img className="photo" src={settings.photo} alt={`${displayName} 사진`} />
      ) : (
        <div className="photo-empty">
          <div className="initial">{displayName.charAt(0)}</div>
          <button type="button" className="glass-btn" style={{ width: 'auto', padding: '0 18px' }} onClick={() => setSheet(true)}>
            사진 올리기
          </button>
        </div>
      )}
      <div className="scrim-top" />
      <div className="scrim-bottom" />
      {mode === 'voice' && phase === 'speaking' && <div className="glow" />}

      <header className="header">
        <div className="who">
          <span className="name">{displayName}<span className="ai-chip">AI</span></span>
          <span className="status"><span className="live-dot" />{status}</span>
        </div>
        <button type="button" className="glass-btn" aria-label="대화방 꾸미기" onClick={() => setSheet(true)}>
          <IconSliders />
        </button>
      </header>

      {showHelp && (
        <div className="help" role="alert">
          <p>지금 많이 힘들다면, 전문 상담사와 바로 이야기할 수 있어요.</p>
          <div className="lines">
            {HELP_LINES.map((h) => (
              <a key={h.number} href={`tel:${h.number}`}>
                {h.label} · {h.note}
                <strong>{h.number}</strong>
              </a>
            ))}
          </div>
          <button type="button" className="close" onClick={() => setShowHelp(false)}>닫기</button>
        </div>
      )}

      {mode === 'text' ? (
        <div className="bottom">
          <div className="log" ref={logRef} aria-live="polite">
            {messages.map((m, i) => {
              if (m.content === '') return null;
              const isThem = m.role === 'assistant' && !m.error;
              const streaming = busy && i === messages.length - 1;
              if (!isThem) {
                return (
                  <div key={m.id} className={`bubble ${m.error ? 'error' : 'me'}`}>{m.content}</div>
                );
              }
              const reading = readingId === m.id;
              return (
                <div key={m.id} className="them-row">
                  <div className="bubble them">{m.content}</div>
                  {!streaming && (
                    <button
                      type="button" className={`say-btn ${reading ? 'on' : ''}`}
                      aria-label={reading ? '읽기 멈추기' : `${displayName} 목소리로 듣기`}
                      aria-pressed={reading}
                      onClick={() => readMessage(m)}
                    >
                      {reading ? <IconStop size={14} /> : <IconSpeaker size={16} />}
                    </button>
                  )}
                </div>
              );
            })}
            {lastIsEmptyReply && (
              <div className="bubble them" aria-label="입력 중"><span className="dots"><span /><span /><span /></span></div>
            )}
          </div>
          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="msg" className="sr-only">메시지</label>
            <input
              id="msg" type="text" autoComplete="off" value={draft}
              placeholder={`${displayName}에게 말하기`}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="button" className="glass-btn" style={{ width: 50, height: 50, borderRadius: 25 }} aria-label="음성 대화 시작" onClick={startVoice}>
              <IconWave />
            </button>
            <button type="submit" className="send-btn" aria-label="보내기" disabled={!draft.trim() || busy}>
              <IconSend />
            </button>
          </form>
        </div>
      ) : (
        <div className="bottom voice">
          <div
            className={`wave ${phase === 'speaking' || phase === 'listening' ? 'live' : ''}`}
            style={{ color: phase === 'listening' ? '#D9E2A6' : '#FFFFFF' }}
            aria-hidden="true"
          >
            <span /><span /><span /><span /><span /><span /><span />
          </div>
          <p className="phase" aria-live="polite">{notice || phaseLabel[phase]}</p>
          {(!speech.sttSupported || micDenied) && (
            <form className="composer" style={{ width: '100%', marginTop: 0 }} onSubmit={onTypedInVoice}>
              <label htmlFor="vmsg" className="sr-only">말 대신 입력</label>
              <input
                id="vmsg" type="text" autoComplete="off" value={typedInVoice}
                placeholder="여기에 입력하면 목소리로 답해요"
                onChange={(e) => setTypedInVoice(e.target.value)}
              />
              <button type="submit" className="send-btn" aria-label="보내기" disabled={!typedInVoice.trim()}>
                <IconSend />
              </button>
            </form>
          )}
          {captionsOn && captionText && (
            <div className="caption">
              {caption?.who === 'me' && <span className="who-me">나</span>}
              {captionText}
            </div>
          )}
          <div className="controls">
            <div className="control">
              <button type="button" className={`round ${captionsOn ? 'on' : ''}`} aria-label="자막" aria-pressed={captionsOn} onClick={() => setCaptionsOn(!captionsOn)}>
                <IconCaptions />
              </button>
              자막
            </div>
            <div className="control">
              <button type="button" className={`round ${soundOn ? 'on' : ''}`} aria-label={`${displayName} 목소리`} aria-pressed={soundOn} onClick={toggleSound}>
                {soundOn ? <IconSpeaker /> : <IconMute />}
              </button>
              소리
            </div>
            <div className="control" style={{ width: 96 }}>
              <button
                type="button" className={`main-btn ${phase === 'listening' ? 'listening' : ''}`}
                aria-label={mainLabel[phase]} onClick={mainPress}
              >
                <IconMic />
              </button>
              <strong>{mainLabel[phase]}</strong>
            </div>
            <div className="control">
              <button type="button" className="round end" aria-label="통화 종료" onClick={endVoice}>
                <IconHangup />
              </button>
              종료
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <SettingsSheet
          settings={settings}
          onChange={(p) => setSettings((s) => ({ ...s, ...p }))}
          onClose={() => setSheet(false)}
          onClearChat={clearChat}
          voices={speech.voices}
          serverVoiceLabel={serverTts?.label ?? null}
          serverProvider={serverTts?.provider ?? null}
          ttsError={ttsError}
          onPreviewVoice={previewVoice}
        />
      )}
    </div>
  );
}
