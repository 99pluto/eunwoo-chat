// 스트리밍으로 들어오는 글자에서 "완성된 문장"만 잘라 낸다.
// 문장 끝(. ! ? … ~) 뒤에 공백이 오거나 줄바꿈이 나오면 문장이 끝난 것으로 본다.
// 마지막 문장은 끝 표시가 없을 수 있으니 스트림이 끝나면 flush()로 남은 걸 꺼낸다.

const ENDERS = new Set(['.', '!', '?', '…', '~', '。']);
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']']);

// "음…", "아." 처럼 너무 짧은 문장은 다음 문장과 붙여서 읽는다 (따로 읽으면 뚝뚝 끊겨 들린다).
const MIN_LEN = 6;

export class SentenceSplitter {
  private buf = '';
  private carry = '';

  private emit(s: string, out: string[]) {
    const joined = this.carry ? `${this.carry} ${s}` : s;
    if (joined.length < MIN_LEN) { this.carry = joined; return; }
    this.carry = '';
    out.push(joined);
  }

  /** 새로 들어온 조각을 넣고, 완성된 문장들을 돌려준다. */
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (c === '\n') {
        const s = this.buf.slice(start, i).trim();
        if (s) this.emit(s, out);
        start = i + 1;
        continue;
      }
      if (!ENDERS.has(c)) continue;
      let j = i + 1;
      while (j < this.buf.length && (ENDERS.has(this.buf[j]) || CLOSERS.has(this.buf[j]))) j++;
      if (j >= this.buf.length) break; // 아직 다음 글자가 안 와서 문장이 끝났는지 모름
      if (/\s/.test(this.buf[j])) {
        const s = this.buf.slice(start, j).trim();
        if (s) this.emit(s, out);
        start = j;
      }
      i = j - 1;
    }
    this.buf = this.buf.slice(start);
    return out;
  }

  /** 남은 글자를 마지막 문장으로 꺼낸다. */
  flush(): string | null {
    const rest = this.buf.trim();
    const s = [this.carry, rest].filter(Boolean).join(' ');
    this.buf = '';
    this.carry = '';
    return s || null;
  }
}
