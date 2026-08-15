export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export type ContentPart = TextContentPart | ImageContentPart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface AIConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemInstruction?: string;
  apiKey?: string;
  baseUrl?: string;
  provider?: ProviderName;
}

export interface AIProvider {
  generateChat(messages: ChatMessage[], config?: AIConfig): Promise<string>;
  generateChatStream(messages: ChatMessage[], config?: AIConfig): AsyncGenerator<string>;
}

export type ProviderName = 'ollama' | 'local' | 'openai' | 'openrouter' | 'custom';
