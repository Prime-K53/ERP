const axios = require('axios');

const PROVIDER_CONFIGS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1:free',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://prime-erp-system.com',
      'X-Title': 'Prime ERP System'
    })
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  }
};

class LLMClient {
  constructor(config = {}) {
    this.provider = config.provider || process.env.AI_PROVIDER || 'openrouter';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || '';
    this.model = config.model || process.env.AI_MODEL || '';
    this.providerConfig = PROVIDER_CONFIGS[this.provider] || PROVIDER_CONFIGS.openrouter;
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    if (!this.apiKey) return this._fallbackResponse(userPrompt);

    const model = options.model || this.model || this.providerConfig.defaultModel;
    const temperature = options.temperature ?? 0.1;

    try {
      const response = await axios.post(
        `${this.providerConfig.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: options.maxTokens || 4096
        },
        {
          headers: this.providerConfig.headers(this.apiKey),
          timeout: 60000
        }
      );
      return response.data.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[LLM] API error:', err?.response?.data || err.message);
      return this._fallbackResponse(userPrompt);
    }
  }

  async generateJSON(systemPrompt, userPrompt, options = {}) {
    const content = await this.generate(systemPrompt, userPrompt, {
      ...options,
      temperature: 0.05
    });
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      return JSON.parse(jsonStr.trim());
    } catch {
      return null;
    }
  }

  _fallbackResponse(userPrompt) {
    return `[AI Service Unavailable] Configure AI_API_KEY and AI_PROVIDER in environment. Received query: ${userPrompt.substring(0, 100)}`;
  }
}

module.exports = LLMClient;
