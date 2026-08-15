import { AIProvider, ChatMessage, AIConfig } from '../types';

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

function resolveBaseUrl(config?: AIConfig): string {
  return config?.baseUrl || DEFAULT_BASE;
}

function resolveModel(config?: AIConfig): string {
  return config?.model || 'openai/gpt-4o-mini';
}

function resolveApiKey(config?: AIConfig): string {
  return config?.apiKey || '';
}

function normalizeMessages(messages: ChatMessage[]) {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const other = messages.filter((m) => m.role !== 'system');

  const system = systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n');

  const normalized = other.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : m.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            }
            return { type: 'image_url', image_url: { url: part.image_url.url } };
          }),
  }));

  return { system, messages: normalized };
}

function buildRequestBody(messages: ChatMessage[], config?: AIConfig) {
  const { system, messages: normalized } = normalizeMessages(messages);
  return {
    model: resolveModel(config),
    messages: normalized,
    max_tokens: config?.maxTokens ?? 4096,
    temperature: config?.temperature ?? 0.7,
    ...(system ? { system } : {}),
  };
}

async function openrouterFetch(
  body: unknown,
  config?: AIConfig,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = resolveBaseUrl(config);
  const apiKey = resolveApiKey(config);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://prime-erp-system.com',
    'X-Title': 'Prime ERP System',
  };
  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured. Go to Settings > AI to configure it.');
  }
  return fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
}

function extractContent(choice: any): string {
  const content = choice?.message?.content || choice?.delta?.content || '';
  return typeof content === 'string' ? content : '';
}

export const openrouterProvider: AIProvider = {
  async generateChat(messages, config) {
    const body = buildRequestBody(messages, config);
    const res = await openrouterFetch(body, config);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return extractContent(data.choices?.[0]) || '';
  },

  async *generateChatStream(messages, config) {
    const body = { ...buildRequestBody(messages, config), stream: true };
    const res = await openrouterFetch(body, config);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter stream error ${res.status}: ${err}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield '';
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;
          try {
            const parsed = JSON.parse(payload);
            const content = extractContent(parsed.choices?.[0]);
            if (content) yield content;
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
