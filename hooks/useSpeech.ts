'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 내장 Web Speech API를 쓰는 음성 인식(STT)·음성 합성(TTS) 훅.
// - 음성 인식: Chrome, Edge, Safari에서 동작 (Firefox 미지원)
// - 음성 합성: OS에 설치된 한국어 음성 중 가장 품질이 좋은 것을 자동으로 고른다.
//   Mac은 "프리미엄/향상됨" 음성을 내려받으면 훨씬 자연스러워진다 (README 참고).
//   외부 TTS(/api/tts)가 설정돼 있으면 브라우저 음성은 그게 실패했을 때만 쓰인다.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export type VoiceOption = { uri: string; name: string; quality: number };

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 음성 이름으로 품질을 짐작한다. 높을수록 자연스러운 음성. */
function voiceQuality(v: SpeechSynthesisVoice): number {
  const s = `${v.name} ${v.voiceURI}`.toLowerCase();
  let q = 0;
  if (s.includes('premium') || s.includes('프리미엄')) q += 4;
  if (s.includes('enhanced') || s.includes('향상')) q += 3;
  if (s.includes('siri')) q += 2;
  if (s.includes('neural') || s.includes('natural') || s.includes('online')) q += 2;
  if (s.includes('google')) q += 1;
  if (s.includes('compact')) q -= 2;
  return q;
}

export function useSpeech(preferredVoiceURI = '', rateMultiplier = 1) {
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [interim, setInterim] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef('');
  const allVoices = useRef<SpeechSynthesisVoice[]>([]);
  const preferredRef = useRef(preferredVoiceURI);
  preferredRef.current = preferredVoiceURI;
  const rateRef = useRef(rateMultiplier);
  rateRef.current = rateMultiplier;

  useEffect(() => {
    setSttSupported(!!getRecognitionCtor());
    const hasTts = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setTtsSupported(hasTts);
    if (!hasTts) return;
    const load = () => {
      const ko = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'));
      ko.sort((a, b) => voiceQuality(b) - voiceQuality(a));
      allVoices.current = ko;
      setVoices(ko.map((v) => ({ uri: v.voiceURI, name: v.name, quality: voiceQuality(v) })));
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const currentVoice = () =>
    allVoices.current.find((v) => v.voiceURI === preferredRef.current) ?? allVoices.current[0] ?? null;

  /** 듣기 시작. 말이 끝나면 onFinal(최종 문장)이 한 번 호출된다. */
  const listen = useCallback((onFinal: (text: string) => void, onError?: (msg: string) => void) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      onError?.('이 브라우저는 음성 인식을 지원하지 않아요. Chrome이나 Safari를 써 주세요.');
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = '';
    setInterim('');
    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) finalRef.current = finalText;
      setInterim((finalText || '') + interimText);
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed') onError?.('마이크 권한이 필요해요. 브라우저 주소창의 권한 설정을 확인해 주세요.');
      else if (e?.error !== 'aborted' && e?.error !== 'no-speech') onError?.('음성 인식 중 문제가 생겼어요. 다시 눌러 주세요.');
    };
    rec.onend = () => {
      recRef.current = null;
      const text = finalRef.current.trim();
      setInterim('');
      onFinal(text);
    };
    recRef.current = rec;
    rec.start();
  }, []);

  const stopListening = useCallback(() => { recRef.current?.stop(); }, []);

  const abortListening = useCallback(() => {
    finalRef.current = '';
    recRef.current?.abort();
  }, []);

  /** 브라우저 음성으로 문장을 읽는다. 다 읽으면(또는 멈추면) onEnd가 호출된다. */
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const v = currentVoice();
    if (v) u.voice = v;
    // 고품질 음성은 원래 속도가 자연스럽고, 기본 음성은 살짝 낮고 느리게 하면 덜 기계적이다
    const hq = v ? voiceQuality(v) >= 3 : false;
    u.rate = (hq ? 1.0 : 0.96) * (rateRef.current || 1);
    u.pitch = hq ? 1.0 : 0.88;
    let ended = false;
    const finish = () => { if (!ended) { ended = true; onEnd?.(); } };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  }, []);

  const hush = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => () => {
    recRef.current?.abort();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { sttSupported, ttsSupported, voices, interim, listen, stopListening, abortListening, speak, hush };
}
