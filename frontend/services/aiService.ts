import { logger } from '@/services/logger';
import { patchStoredCompanyConfig } from '@/utils/companyConfigSync';

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter';
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
}

export interface SmartReplySuggestion {
  text: string;
  label: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: 'openai',
  apiKey: '',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  enabled: false,
};

const PROVIDER_DEFAULTS: Record<string, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' },
  ollama: { endpoint: 'http://localhost:11434/v1', model: 'llama3' },
  openrouter: { endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
};

class AIService {
  private config: AIConfig = DEFAULT_CONFIG;
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = localStorage.getItem('nexus_company_config');
      if (raw) {
        const companyConfig = JSON.parse(raw);
        const aiConfig = companyConfig?.aiConfig;
        if (aiConfig) {
          this.config = {
            provider: aiConfig.provider || DEFAULT_CONFIG.provider,
            apiKey: aiConfig.apiKey || aiConfig.openrouterApiKey || DEFAULT_CONFIG.apiKey,
            endpoint: aiConfig.endpoint || aiConfig.baseUrl || DEFAULT_CONFIG.endpoint,
            model: aiConfig.model || aiConfig.openrouterModel || DEFAULT_CONFIG.model,
            enabled: true,
          };
          this.loaded = true;
          return;
        }
      }
      this.config = { ...DEFAULT_CONFIG };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    this.loaded = true;
  }

  async getConfig(): Promise<AIConfig> {
    await this.ensureLoaded();
    return { ...this.config };
  }

  async saveConfig(config: Partial<AIConfig>): Promise<void> {
    await this.ensureLoaded();
    const merged = { ...this.config, ...config };
    this.config = { ...merged, enabled: true };
    try {
      const raw = localStorage.getItem('nexus_company_config');
      if (raw) {
        const existing = JSON.parse(raw);
        existing.aiConfig = { ...(existing.aiConfig || {}), ...config, enabled: true };
        localStorage.setItem('nexus_company_config', JSON.stringify(existing));
      }
      // Sync through the authoritative company-config store so the change
      // propagates to every device of the company.
      void patchStoredCompanyConfig({ aiConfig: { ...this.config, enabled: true } } as unknown as Partial<import('../types').CompanyConfig>).catch((e) => {
        logger.error('Failed to sync AI config to company store', e instanceof Error ? e : new Error('Unknown'));
      });
    } catch (e) { logger.error("Operation failed", e as Error); }
  }

  private buildSystemPrompt(context: string): string {
    const prompts: Record<string, string> = {
      smartReply: `You are a professional WhatsApp business assistant for a print shop / ERP system. 
Given the conversation history, suggest 3 concise, helpful reply options for the business owner to send.
Each reply should be: friendly, professional, under 100 characters, and use placeholders like {{name}} where appropriate.
Return exactly 3 suggestions as a JSON array of objects with keys: "text" (the reply message) and "label" (a short label like "Friendly", "Professional", "Short").
Format: [{"label":"...","text":"..."}]`,

      generateTemplate: `You are a WhatsApp marketing template expert for a print shop ERP.
Generate a professional WhatsApp message template based on the user's description.
The template should use placeholders like {{name}}, {{company}}, {{product}}, etc.
Return a JSON object with keys: "name" (short template name), "content" (the message), "category" (one of: Welcome, Promotions, Follow-up, Orders, Billing, Support, General, CTA), and "variables" (array of placeholder names without braces).
Format: {"name":"...","content":"...","category":"...","variables":["name","company"]}`,

      analyzeSentiment: `Analyze the sentiment of this customer message and return a JSON object with keys: "sentiment" (one of: positive, neutral, negative, urgent), "priority" (one of: high, normal, low), "summary" (one sentence describing the message), and "suggestedTags" (array of 1-3 tag strings).
Format: {"sentiment":"...","priority":"...","summary":"...","suggestedTags":["..."]}`,
    };
    return prompts[context] || prompts.smartReply;
  }

  private async callAPI(messages: { role: string; content: string }[]): Promise<string> {
    const { provider, apiKey, endpoint, model } = this.config;

    if (!apiKey && provider !== 'ollama') {
      throw new Error('AI API key not configured. Go to Marketing Messages > AI Settings to configure.');
    }

    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    switch (provider) {
      case 'anthropic': {
        url = `${endpoint}/messages`;
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model,
          max_tokens: 1024,
          messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        };
        break;
      }
      case 'openai':
      case 'ollama':
      case 'openrouter':
      default: {
        url = `${endpoint}/chat/completions`;
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model, messages, max_tokens: 1024, temperature: 0.7 };
        break;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`AI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (provider === 'anthropic') {
      return data.content?.[0]?.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  }

  async generateSmartReplies(chat: { customerName: string; messages: { content: string; direction: string }[] }): Promise<SmartReplySuggestion[]> {
    await this.ensureLoaded();
    if (!this.config.enabled || !this.config.apiKey) {
      return this.fallbackReplies(chat);
    }

    const history = chat.messages.slice(-6).map(m =>
      `${m.direction === 'inbound' ? chat.customerName : 'You'}: ${m.content}`
    ).join('\n');

    try {
      const response = await this.callAPI([
        { role: 'system', content: this.buildSystemPrompt('smartReply') },
        { role: 'user', content: `Conversation with ${chat.customerName}:\n${history}\n\nSuggest 3 replies:` },
      ]);

      const cleaned = response.replace(/```json?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed.slice(0, 3).map((s: any) => ({
          text: s.text || s.reply || '',
          label: s.label || 'Reply',
        }));
      }
    } catch {
      // Fallback to template-based suggestions
    }
    return this.fallbackReplies(chat);
  }

  private fallbackReplies(chat: { customerName: string; messages: { content: string; direction: string }[] }): SmartReplySuggestion[] {
    const name = chat.customerName || 'there';
    const lastMsg = chat.messages?.[chat.messages.length - 1]?.content?.toLowerCase() || '';

    if (lastMsg.includes('price') || lastMsg.includes('cost') || lastMsg.includes('how much')) {
      return [
        { label: 'Quote', text: `Thank you for your interest, {{name}}! I'll prepare a price quote for you right away.` },
        { label: 'More Info', text: `Great question {{name}}! Could you tell me more about what you need so I can give you an accurate price?` },
        { label: 'Call', text: `Hi {{name}}, I'd love to discuss pricing in detail. Would you prefer a quick phone call?` },
      ];
    }
    if (lastMsg.includes('hello') || lastMsg.includes('hi') || lastMsg.includes('hey')) {
      return [
        { label: 'Greeting', text: `Hello {{name}}! Welcome to {{company}}. How can I assist you today?` },
        { label: 'Services', text: `Hi {{name}}! We offer printing, binding, and design services. What are you looking for?` },
        { label: 'Help', text: `Hey {{name}}! Great to hear from you. What can we help you with today?` },
      ];
    }
    if (lastMsg.includes('thank')) {
      return [
        { label: 'Welcome', text: `You're welcome {{name}}! Happy to help. Let me know if you need anything else!` },
        { label: 'Feedback', text: `Our pleasure {{name}}! We'd love your feedback on our service.` },
        { label: 'Follow-up', text: `Anytime {{name}}! I'll follow up next week to see how everything is going.` },
      ];
    }
    if (lastMsg.includes('order') || lastMsg.includes('track') || lastMsg.includes('delivery')) {
      return [
        { label: 'Status', text: `Let me check your order status {{name}}. One moment please.` },
        { label: 'Tracking', text: `I'll send you the tracking details for your order right away {{name}}.` },
        { label: 'Support', text: `I've looked up your order {{name}}. Let me give you an update.` },
      ];
    }

    return [
      { label: 'Friendly', text: `Thank you for reaching out {{name}}! How can I assist you today?` },
      { label: 'Professional', text: `Dear {{name}}, thank you for your message. How may I help you?` },
      { label: 'Short', text: `Thanks {{name}}! What can I help you with?` },
    ];
  }

  async generateTemplate(description: string): Promise<{ name: string; content: string; category: string; variables: string[] } | null> {
    await this.ensureLoaded();
    if (!this.config.enabled || !this.config.apiKey) return null;

    try {
      const response = await this.callAPI([
        { role: 'system', content: this.buildSystemPrompt('generateTemplate') },
        { role: 'user', content: `Create a WhatsApp template for: ${description}` },
      ]);

      const cleaned = response.replace(/```json?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.name && parsed.content) {
        return {
          name: parsed.name,
          content: parsed.content,
          category: parsed.category || 'General',
          variables: parsed.variables || ['name', 'company'],
        };
      }
    } catch {
      // Return null if generation fails
    }
    return null;
  }

  async analyzeSentiment(text: string): Promise<{ sentiment: string; priority: string; summary: string; suggestedTags: string[] } | null> {
    await this.ensureLoaded();
    if (!this.config.enabled || !this.config.apiKey) {
      return {
        sentiment: 'neutral',
        priority: 'normal',
        summary: 'AI analysis not configured',
        suggestedTags: [],
      };
    }

    try {
      const response = await this.callAPI([
        { role: 'system', content: this.buildSystemPrompt('analyzeSentiment') },
        { role: 'user', content: `Analyze this customer message: "${text}"` },
      ]);

      const cleaned = response.replace(/```json?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        sentiment: 'neutral',
        priority: 'normal',
        summary: 'Analysis unavailable',
        suggestedTags: [],
      };
    }
  }
}

export const aiService = new AIService();
