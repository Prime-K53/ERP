import { AIProvider, ChatMessage, ProviderName, AIConfig } from './types';
import { logger } from '@/services/logger';
import { localProvider, parseJSON } from './providers/local';
import { openrouterProvider } from './providers/openrouter';
import * as P from './prompts';
import { patchStoredCompanyConfig } from '@/utils/companyConfigSync';

function getProvider(name: ProviderName): AIProvider {
  switch (name) {
    case 'openrouter':
      return openrouterProvider;
    case 'local':
    case 'ollama':
    case 'openai':
    case 'custom':
    default:
      return localProvider;
  }
}

function selectProvider(): AIProvider {
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (raw) {
      const cfg = JSON.parse(raw)?.aiConfig;
      if (cfg?.provider) return getProvider(cfg.provider);
    }
  } catch { /* ignore */ }
  return localProvider;
}

function buildImageMessages(imageBase64: string, prompt: string): ChatMessage[] {
  return [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageBase64 } }] }];
}

function buildMultiImageMessages(images: string[], prompt: string): ChatMessage[] {
  const parts: any[] = [{ type: 'text', text: prompt }];
  for (const img of images) parts.push({ type: 'image_url', image_url: { url: img } });
  return [{ role: 'user', content: parts }];
}

class AIService {
  private provider: AIProvider;
  private providerName: ProviderName = 'local';
  private currentModel = '';
  private currentBaseUrl = '';
  private currentApiKey = '';

  constructor() {
    this.provider = selectProvider();
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem('nexus_company_config');
      if (!raw) return;
      const cfg = JSON.parse(raw)?.aiConfig;
      if (!cfg) return;
      if (cfg.provider) {
        this.providerName = cfg.provider;
        this.provider = getProvider(cfg.provider);
      }
      if (cfg.model) this.currentModel = cfg.model;
      if (cfg.baseUrl) this.currentBaseUrl = cfg.baseUrl;
      if (cfg.apiKey) this.currentApiKey = cfg.apiKey;
    } catch { /* ignore */ }
  }

  getProviderName(): ProviderName {
    return this.providerName;
  }

  getConfig(): { provider: ProviderName; model: string; baseUrl: string; apiKey: string } {
    return {
      provider: this.providerName,
      model: this.currentModel,
      baseUrl: this.currentBaseUrl,
      apiKey: this.currentApiKey,
    };
  }

  saveConfig(config: { provider: ProviderName; model?: string; baseUrl?: string; apiKey?: string }) {
    try {
      const raw = localStorage.getItem('nexus_company_config');
      const existing = raw ? JSON.parse(raw) : {};
      existing.aiConfig = {
        ...(existing.aiConfig || {}),
        provider: config.provider,
        model: config.model ?? existing.aiConfig?.model ?? '',
        baseUrl: config.baseUrl ?? existing.aiConfig?.baseUrl ?? '',
        apiKey: config.apiKey ?? existing.aiConfig?.apiKey ?? '',
        enabled: true,
      };
      localStorage.setItem('nexus_company_config', JSON.stringify(existing));
      this.providerName = config.provider;
      this.provider = getProvider(config.provider);
      if (config.model) this.currentModel = config.model;
      if (config.baseUrl) this.currentBaseUrl = config.baseUrl;
      if (config.apiKey) this.currentApiKey = config.apiKey;
      // Sync the AI slice through the authoritative company-config store so
      // every device of the company receives it.
      const aiConfig = {
        provider: this.providerName,
        model: this.currentModel,
        baseUrl: this.currentBaseUrl,
        apiKey: this.currentApiKey,
        ...(existing.aiConfig || {}),
        enabled: true,
      };
      void patchStoredCompanyConfig({ aiConfig }).catch((e) => {
        logger.error('Failed to sync AI config to company store', e instanceof Error ? e : new Error('Unknown'));
      });
    } catch (e) { logger.error('Failed to save AI config', e as Error); }
  }

  configure(opts: { model?: string; baseUrl?: string; apiKey?: string }) {
    if (opts.model !== undefined) this.currentModel = opts.model;
    if (opts.baseUrl !== undefined) this.currentBaseUrl = opts.baseUrl;
    if (opts.apiKey !== undefined) this.currentApiKey = opts.apiKey;
  }

  setProvider(name: ProviderName) {
    this.providerName = name;
    this.provider = getProvider(name);
  }

  private cfg(overrides?: Partial<AIConfig>): AIConfig {
    const { model: overrideModel, ...rest } = overrides || {};
    return {
      model: this.currentModel || overrideModel || 'llama3',
      baseUrl: this.currentBaseUrl || undefined,
      apiKey: this.currentApiKey || undefined,
      ...rest,
    };
  }

  async *streamSystemDoc(prompt: string): AsyncGenerator<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.SYSTEM_DOC_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ];
      const stream = this.provider.generateChatStream(messages, this.cfg({ model: 'llama3' }));
      for await (const chunk of stream) yield chunk;
    } catch (error: any) {
      logger.error('AI Streaming Error:', error);
      yield 'Error generating stream. Make sure your local AI server is running.';
    }
  }

  async generateSystemDoc(prompt: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.SYSTEM_DOC_SYSTEM_INSTRUCTION_SHORT },
        { role: 'user', content: prompt },
      ];
      return await this.provider.generateChat(messages, this.cfg({ model: 'llama3' }));
    } catch (error: any) {
      logger.error('AI API Error:', error);
      return 'Error generating documentation. Make sure your local AI server is running.';
    }
  }

  async generateAIResponse(prompt: string, systemInstruction?: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemInstruction || P.AI_ASSISTANT_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ];
      return await this.provider.generateChat(messages, this.cfg({ model: 'llama3' }));
    } catch (error: any) {
      logger.error('AI API Error:', error);
      const msg = error?.message || '';
      if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch'))
        return 'AI service unavailable. Ensure your local AI server (e.g. Ollama) is running on http://localhost:11434.';
      return `AI error: ${msg.slice(0, 200)}`;
    }
  }

  async extractInvoiceData(imageBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(imageBase64, P.INVOICE_EXTRACTION_PROMPT), this.cfg({ model: 'llama3' }));
      return parseJSON(text);
    } catch (error) {
      logger.error('OCR Extraction Error:', error);
      return null;
    }
  }

  async extractPaymentProofData(imageBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(imageBase64, P.PAYMENT_PROOF_EXTRACTION_PROMPT), this.cfg({ model: 'llama3' }));
      return parseJSON(text);
    } catch (error) {
      logger.error('Payment Proof Extraction Error:', error);
      return null;
    }
  }

  async extractDeliveryNoteData(fileBase64: string): Promise<any> {
    try {
      const text = await this.provider.generateChat(buildImageMessages(fileBase64, P.DELIVERY_NOTE_EXTRACTION_PROMPT), this.cfg({ model: 'llama3' }));
      return parseJSON(text);
    } catch (error) {
      logger.error('DN Extraction Error:', error);
      return null;
    }
  }

  async extractFileData(fileBase64: string, systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: fileBase64 } }] },
      ];
      return await this.provider.generateChat(messages, this.cfg({ model: 'llama3' }));
    } catch (error) {
      logger.error('File Extraction Error:', error);
      throw error;
    }
  }

  async performOCR(images: string[], prompt?: string): Promise<string> {
    try {
      return await this.provider.generateChat(buildMultiImageMessages(images, prompt || P.OCR_DEFAULT_PROMPT), this.cfg({ model: 'llama3' }));
    } catch (error) {
      logger.error('OCR Error:', error);
      return 'Failed to perform OCR.';
    }
  }

  async suggestRestock(inventoryData: any[], salesData: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat([{ role: 'user', content: P.buildRestockPrompt(inventoryData, salesData) }], this.cfg({ model: 'llama3' }));
      const result = parseJSON(text);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      logger.error('Restock Suggestion Error:', error);
      return inventoryData.filter((item: any) => item.stock < 10).map((item: any) => ({
        sku: item.sku || item.id, name: item.name, reason: 'Fallback — low stock', suggestedQty: 50,
      }));
    }
  }

  async suggestProductPricing(productName: string, totalCost: number, category: string, wastePercentage = 0): Promise<any> {
    try {
      const text = await this.provider.generateChat([{ role: 'user', content: P.buildPricingPrompt(productName, totalCost, category, wastePercentage) }], this.cfg({ model: 'llama3' }));
      const fb = { suggestedPrice: totalCost * 1.5, margin: 33.3, reasoning: 'Fallback', tiers: { small: totalCost * 1.5, medium: totalCost * 1.4, large: totalCost * 1.3 } };
      const parsed = parseJSON(text);
      return parsed ? { suggestedPrice: parsed.suggestedPrice ?? fb.suggestedPrice, margin: parsed.margin ?? fb.margin, reasoning: parsed.reasoning ?? fb.reasoning, tiers: parsed.tiers ?? fb.tiers } : fb;
    } catch {
      const bp = totalCost * 1.5;
      return { suggestedPrice: bp, margin: 33.3, reasoning: 'Fallback', tiers: { small: bp, medium: bp * 0.95, large: bp * 0.9 } };
    }
  }

  async generateBusinessHealthReport(financeData: any, salesData: any, inventoryData: any): Promise<string> {
    try {
      const snapshot = {
        summary: { totalInvoices: financeData.invoices.length, totalExpenses: financeData.expenses.length, totalCustomers: salesData.customers.length, inventoryItems: inventoryData.inventory.length },
        recentPerformance: { last10Invoices: financeData.invoices.slice(0, 10).map((i: any) => ({ date: i.date, amount: i.totalAmount, status: i.status })), last10Expenses: financeData.expenses.slice(0, 10).map((e: any) => ({ date: e.date, amount: e.amount, category: e.category })) },
        inventoryStatus: inventoryData.inventory.filter((i: any) => i.stock <= i.minStockLevel).slice(0, 10).map((i: any) => ({ name: i.name, stock: i.stock })),
      };
      return await this.provider.generateChat([
        { role: 'system', content: P.BUSINESS_HEALTH_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBusinessHealthPrompt(snapshot) },
      ], this.cfg({ model: 'llama3' }));
    } catch {
      return '## Error Generating Report\nUnable to reach AI services.';
    }
  }

  async analyzeForecastingData(type: 'Inventory' | 'CashFlow', data: any): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.FORECASTING_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildForecastingPrompt(type, data) },
      ], this.cfg({ model: 'llama3' }));
    } catch { return 'Error analyzing data.'; }
  }

  async analyzeExpenses(expenses: any[]): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.EXPENSE_ANALYSIS_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildExpenseAnalysisPrompt(expenses) },
      ], this.cfg({ model: 'llama3' }));
    } catch { return 'Error analyzing expenses.'; }
  }

  async askBusinessQuestion(question: string, context: any): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.BUSINESS_QA_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBusinessQAPrompt(question, context) },
      ], this.cfg());
    } catch { return "Sorry, I'm having trouble."; }
  }

  async generateDailyBrief(data: {
    revenue: number; revenueTarget: number; unpaidInvoices: number; unpaidTotal: number;
    todaysCollection: number; expensesMonth: number; lowStockItems: number;
    activeJobs: number; customers: number; pendingOrders: number;
  }): Promise<{ bullets: string[] }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildDailyBriefPrompt(data) }], this.cfg()
      );
      const result = parseJSON(text);
      return { bullets: Array.isArray(result?.bullets) ? result.bullets : [] };
    } catch {
      return { bullets: [] };
    }
  }

  async detectSalesOpportunities(customers: any[], invoices: any[]): Promise<any[]> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildSalesOpportunityPrompt(customers, invoices) }], this.cfg()
      );
      const result = parseJSON(text);
      return Array.isArray(result) ? result : [];
    } catch { return []; }
  }

  async detectInventoryRisks(items: any[]): Promise<any[]> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildInventoryRiskPrompt(items) }], this.cfg()
      );
      const result = parseJSON(text);
      return Array.isArray(result) ? result : [];
    } catch { return []; }
  }

  async analyzeCashFlow(data: {
    pendingInvoicesTotal: number; upcomingExpensesTotal: number; currentBalance: number;
    pendingInvoicesCount: number; upcomingExpensesCount: number;
  }): Promise<{ status: string; projectedBalance: number; message: string }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildCashFlowWarningPrompt(data) }], this.cfg()
      );
      return parseJSON(text);
    } catch {
      return { status: 'cautious', projectedBalance: 0, message: 'Unable to analyze cash flow.' };
    }
  }

  async generateCustomerInsight(customer: any, invoices: any[], payments: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildCustomerInsightPrompt(customer, invoices, payments) }], this.cfg()
      );
      return parseJSON(text);
    } catch {
      return { reliability: 'medium', totalSpent: 0, averageInvoice: 0, lastOrderDate: '', paymentPunctuality: 'average', insight: 'Data unavailable.' };
    }
  }

  async generateSupplierScorecard(supplier: any, purchases: any[], payments: any[]): Promise<any> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildSupplierScorecardPrompt(supplier, purchases, payments) }], this.cfg()
      );
      return parseJSON(text);
    } catch {
      return { score: 50, reliability: 'average', totalSpend: 0, orderCount: 0, strengths: [], weaknesses: [], recommendation: 'Data unavailable.' };
    }
  }

  async summarizeDocument(docType: string, data: any): Promise<{ summary: string; keyNumbers: string[]; status: string }> {
    try {
      const text = await this.provider.generateChat(
        [{ role: 'user', content: P.buildDocumentSummaryPrompt(docType, data) }], this.cfg()
      );
      return parseJSON(text);
    } catch {
      return { summary: 'Unable to summarize.', keyNumbers: [], status: 'unknown' };
    }
  }

  async generateArchitectDoc(prompt: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.ARCHITECT_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ];
      return await this.provider.generateChat(messages, this.cfg());
    } catch { return ''; }
  }

  async generateBusinessMessage(context: string, requirement: string): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.BUSINESS_COMMUNICATION_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBusinessCommunicationPrompt(context, requirement) },
      ], this.cfg());
    } catch { return ''; }
  }

  async askFullAssistant(context: string, question: string): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.AI_ASSISTANT_FULL_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildAIAssistantPrompt(context, question) },
      ], this.cfg());
    } catch { return ''; }
  }

  async analyzePredictiveMaintenance(
    machineName: string, temperature: number, vibration: number, efficiency: number, uptime: number,
  ): Promise<{ risk: string; advice: string }> {
    try {
      const text = await this.provider.generateChat([
        { role: 'system', content: P.PREDICTIVE_MAINTENANCE_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildPredictiveMaintenancePrompt(machineName, temperature, vibration, efficiency, uptime) },
      ], this.cfg());
      return parseJSON(text);
    } catch {
      return { risk: 'Low', advice: 'Telemetry within normal operating parameters.' };
    }
  }

  async analyzeInkDensity(): Promise<{ cyan: number; magenta: number; yellow: number; black: number; totalCoverage: number } | null> {
    try {
      const text = await this.provider.generateChat([
        { role: 'system', content: P.INK_DENSITY_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.INK_DENSITY_ANALYSIS_PROMPT },
      ], this.cfg());
      const parsed = JSON.parse(text.replace(/```json|```/g, ''));
      return { cyan: parsed.cyan ?? 0, magenta: parsed.magenta ?? 0, yellow: parsed.yellow ?? 0, black: parsed.black ?? 0, totalCoverage: parsed.totalCoverage ?? 0 };
    } catch { return null; }
  }

  async generateSupplyChainStrategy(
    itemName: string, stock: number, adu: number, daysUntilStockout: number, marginPercent: number,
  ): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.SUPPLY_CHAIN_ANALYST_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildSupplyChainStrategyPrompt(itemName, stock, adu, daysUntilStockout, marginPercent) },
      ], this.cfg());
    } catch { return ''; }
  }

  async generatePricingStrategy(
    itemName: string, currentPrice: number, linkedBom: boolean, bomDetails: string,
    actualBomCost: number, laborCost: number, wastePct: number, lastCost: number,
  ): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.PRICING_STRATEGY_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildPricingStrategyPrompt(itemName, currentPrice, linkedBom, bomDetails, actualBomCost, laborCost, wastePct, lastCost) },
      ], this.cfg());
    } catch { return ''; }
  }

  async generateBillingEmail(
    type: string, id: string, customerName: string, total: number,
    currency: string, dueDate: string | undefined, status: string, companyName: string,
  ): Promise<{ subject: string; body: string }> {
    try {
      const text = await this.provider.generateChat([
        { role: 'system', content: P.BILLING_CLERK_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildBillingEmailPrompt(type, id, customerName, total, currency, dueDate, status, companyName) },
      ], this.cfg());
      return JSON.parse(text.replace(/```json|```/g, ''));
    } catch {
      return { subject: '', body: '' };
    }
  }

  async generateCollectionsStrategy(
    customerName: string, id: string, totalAmount: number,
    currency: string, dueDate: string, status: string,
  ): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.COLLECTIONS_SPECIALIST_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildCollectionsPrompt(customerName, id, totalAmount, currency, dueDate, status) },
      ], this.cfg());
    } catch { return ''; }
  }

  async runPreflightAudit(jobTitle: string, jobDescription: string, attachments: string): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.PREPRESS_TECHNICIAN_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildPreflightCheckPrompt(jobTitle, jobDescription, attachments) },
      ], this.cfg());
    } catch { return ''; }
  }

  async askFloatingAssistant(context: string, question: string): Promise<string> {
    try {
      return await this.provider.generateChat([
        { role: 'system', content: P.FLOATING_ASSISTANT_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.buildFloatingAssistantPrompt(context, question) },
      ], this.cfg());
    } catch { return ''; }
  }

  async testConnection(
    provider: AIProvider, apiKey: string, model: string, baseUrl?: string,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: P.CONNECTION_TEST_SYSTEM_INSTRUCTION },
        { role: 'user', content: P.CONNECTION_TEST_USER_PROMPT },
      ];
      const result = await provider.generateChat(messages, { apiKey, model, baseUrl });
      const trimmed = result.trim().toUpperCase();
      if (trimmed === 'OK' || trimmed.startsWith('OK')) return { ok: true, message: `Connected using ${model}` };
      return { ok: true, message: `Response: "${result.slice(0, 60)}..."` };
    } catch (err: any) {
      const msg = err?.message || 'Connection failed';
      if (msg.includes('400') || msg.includes('not a valid model')) return { ok: false, message: `Invalid model ID. Check the exact model name.` };
      return { ok: false, message: msg };
    }
  }
}

export const aiService = new AIService();
