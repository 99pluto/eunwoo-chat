import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/persona';

export const runtime = 'nodejs';

type InMessage = { role: 'user' | 'assistant'; content: string };

// Claude API는 user로 시작하고 user/assistant가 번갈아 와야 하므로 정리한다.
function normalize(messages: InMessage[]): InMessage[] {
  const out: InMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = String(m.content ?? '').slice(0, 4000).trim();
    if (!content) continue;
    if (out.length === 0 && m.role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n' + content;
    else out.push({ role: m.role, content });
  }
  return out.slice(-30);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('ANTHROPIC_API_KEY가 설정되지 않았어요. .env.local 파일을 확인해 주세요.', { status: 500 });
  }

  let body: { messages?: InMessage[]; name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('잘못된 요청이에요.', { status: 400 });
  }

  const messages = normalize(body.messages ?? []);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return new Response('보낼 메시지가 없어요.', { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = client.messages.stream({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 400,
          system: buildSystemPrompt(body.name ?? '은우'),
          messages,
        });
        for await (const ev of res) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error('[chat] Claude API 오류', err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
