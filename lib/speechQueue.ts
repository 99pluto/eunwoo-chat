// 문장 단위 재생 큐.
// - 문장이 도착하면 외부 TTS 음성을 "한 번에 하나씩 순서대로" 미리 받아 둔다 (동시 요청으로 429에 걸리지 않게).
// - 실패하면 잠깐 쉬었다가 다시 시도한다 (최대 3번).
// - 재생은 사용자가 처음 누를 때 "잠금 해제"해 둔 오디오 플레이어 하나로 한다 (브라우저 자동 재생 차단 방지).
// - 외부 TTS가 설정돼 있으면 기기 음성으로 절대 바꾸지 않는다. 끝내 실패한 문장은 자막만 보여 주고 넘어간다.
// - 외부 TTS가 없을 때만 기기(브라우저) 음성을 쓴다.

type Options = {
  useServerTts: () => boolean;
  ttsParams: () => { voiceId: string; rate: number };
  onServerError?: (message: string) => void;
  soundOn: () => boolean;
  player: () => HTMLAudioElement | null;
  browserSpeak: (text: string, onEnd: () => void) => void;
  browserStop: () => void;
  onSentenceStart: (text: string) => void;
  onDrain: () => void;
};

type Item = { text: string; audio: Promise<Blob | null> | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAudio(
  text: string,
  previousText: string,
  params: { voiceId: string; rate: number },
  isStopped: () => boolean,
  onError?: (message: string) => void,
): Promise<Blob | null> {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (isStopped()) return null;
    if (attempt > 0) await sleep(attempt === 1 ? 500 : 1500);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, previousText, ...params }),
      });
      if (res.status === 200) {
        const blob = await res.blob();
        if (blob.size > 0) return blob;
        lastError = '빈 음성 파일을 받았어요';
        continue;
      }
      if (res.status === 204) return null; // 외부 TTS 꺼짐
      lastError = await res.text();
      // 키·목소리 ID 오류는 다시 해도 같으니 바로 멈춘다
      if (/\((401|402|403|404|422)/.test(lastError)) break;
    } catch {
      lastError = '음성 서버에 연결하지 못했어요';
    }
  }
  if (!isStopped()) onError?.(lastError || '음성을 만들지 못했어요');
  return null;
}

export class SpeechQueue {
  private items: Item[] = [];
  private playing = false;
  private closed = false;
  private stopped = false;
  private playId = 0;
  private fetchChain: Promise<unknown> = Promise.resolve();
  private objectUrl: string | null = null;
  private spokenSoFar = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private usingBrowser = false;

  constructor(private opts: Options) {}

  /** 문장 하나를 큐에 넣는다. */
  push(text: string) {
    if (this.stopped) return;
    const context = this.spokenSoFar;
    this.spokenSoFar += (this.spokenSoFar ? ' ' : '') + text;
    let audio: Promise<Blob | null> | null = null;
    if (this.opts.useServerTts()) {
      // 앞 문장 요청이 끝난 뒤에 다음 문장을 요청한다 (순서 보장 + 동시 요청 1개)
      audio = this.fetchChain.then(() =>
        fetchAudio(text, context, this.opts.ttsParams(), () => this.stopped, this.opts.onServerError),
      );
      this.fetchChain = audio.catch(() => null);
    }
    this.items.push({ text, audio });
    if (!this.playing) void this.next();
  }

  /** 더 들어올 문장이 없다고 알린다. 남은 문장을 다 읽으면 onDrain이 호출된다. */
  close() {
    this.closed = true;
    if (!this.playing && this.items.length === 0 && !this.stopped) this.opts.onDrain();
  }

  /** 지금 문장만 건너뛴다 (소리를 끌 때 사용). */
  skipCurrent() {
    if (!this.playing) return;
    this.silenceCurrent();
    void this.next();
  }

  /** 전부 멈추고 비운다 (끼어들기·통화 종료). */
  stop() {
    this.stopped = true;
    this.items = [];
    this.silenceCurrent();
    this.playing = false;
  }

  private releaseUrl() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private silenceCurrent() {
    this.playId++;
    clearTimeout(this.timer);
    const p = this.opts.player();
    if (p) {
      p.onended = null;
      p.onerror = null;
      p.pause();
    }
    this.releaseUrl();
    if (this.usingBrowser) this.opts.browserStop();
    this.usingBrowser = false;
  }

  /** 소리 없이 읽는 시간만큼 자막만 보여 주고 넘어간다. */
  private silent(text: string, done: () => void) {
    this.timer = setTimeout(done, Math.min(7000, 700 + text.length * 95));
  }

  private async playBlob(blob: Blob, id: number): Promise<boolean> {
    const p = this.opts.player();
    if (!p) return false;
    this.releaseUrl();
    this.objectUrl = URL.createObjectURL(blob);
    p.src = this.objectUrl;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await p.play();
        return true;
      } catch {
        if (id !== this.playId || this.stopped) return false;
        await sleep(250);
      }
    }
    return false;
  }

  private async next() {
    if (this.stopped) return;
    const item = this.items.shift();
    if (!item) {
      this.playing = false;
      if (this.closed) this.opts.onDrain();
      return;
    }
    this.playing = true;
    const id = ++this.playId;
    const done = () => { if (id === this.playId && !this.stopped) void this.next(); };

    const blob = item.audio ? await item.audio : null;
    if (this.stopped || id !== this.playId) return;
    this.opts.onSentenceStart(item.text);

    if (!this.opts.soundOn()) return this.silent(item.text, done);

    // 외부 TTS 모드: 기기 음성으로 바꾸지 않는다
    if (item.audio) {
      if (!blob) return this.silent(item.text, done);
      const p = this.opts.player();
      if (p) {
        p.onended = () => { this.releaseUrl(); done(); };
        p.onerror = () => { this.releaseUrl(); this.silent(item.text, done); };
      }
      const ok = await this.playBlob(blob, id);
      if (!ok && id === this.playId && !this.stopped) {
        this.opts.onServerError?.('브라우저가 소리 재생을 막았어요. 화면을 한 번 누른 뒤 다시 시도해 주세요');
        this.silent(item.text, done);
      }
      return;
    }

    // 외부 TTS가 없을 때만 기기 음성
    this.usingBrowser = true;
    this.opts.browserSpeak(item.text, done);
  }
}
