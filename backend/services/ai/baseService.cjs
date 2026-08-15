const sq = require('../supabaseQuery.cjs');
const LLMClient = require('./llmClient.cjs');

class BaseAIService {
  constructor() {
    this.llm = new LLMClient();
  }

  _get(sql, params = []) {
    return sq.getOne(sql, params);
  }

  _all(sql, params = []) {
    return sq.getAll(sql, params);
  }

  _serializeDate(d) {
    if (!d) return null;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }

  _safeNumber(val, fallback = 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
}

module.exports = BaseAIService;
