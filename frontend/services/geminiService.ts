/**
 * AI Service — Backward-Compatible Facade
 *
 * All exports match the original signatures so consuming components
 * work without changes. Under the hood it delegates to the local-only
 * AI service layer.
 */

import { aiService } from './ai/aiService';
import type { ProviderName } from './ai/types';

export function setAIProvider(_name: ProviderName) {}

export function configureAI(config: { model?: string; baseUrl?: string }) {
  aiService.configure(config);
}

export const AI_PROVIDER_OPTIONS = [];

export async function fetchModels(): Promise<{ value: string; label: string; tier: string }[]> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      return (data.models || []).map((m: any) => ({
        value: m.name,
        label: m.name + (m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''),
        tier: 'local',
      }));
    }
  } catch {}
  return [
    { value: 'llama3', label: 'Llama 3', tier: 'local' },
    { value: 'llama3.1', label: 'Llama 3.1', tier: 'local' },
    { value: 'mistral', label: 'Mistral', tier: 'local' },
    { value: 'gemma3', label: 'Gemma 3', tier: 'local' },
    { value: 'qwen3', label: 'Qwen 3', tier: 'local' },
    { value: 'phi3', label: 'Phi-3', tier: 'local' },
  ];
}

export const STATIC_MODELS: Record<string, any[]> = {};

export const CONNECTION_OK = Symbol('ai_connected');

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  return aiService.testConnection(
    await (await import('./ai/providers/local')).localProvider,
    '', 'llama3', 'http://localhost:11434/v1'
  );
}

/* ───────── Re-export all AI service methods ───────── */

export const generateAIResponse = (prompt: string, system?: string) => aiService.generateAIResponse(prompt, system);
export const extractInvoiceData = (img: string) => aiService.extractInvoiceData(img);
export const extractPaymentProofData = (img: string) => aiService.extractPaymentProofData(img);
export const extractDeliveryNoteData = (img: string) => aiService.extractDeliveryNoteData(img);
export const extractFileData = (img: string, sys: string, user: string) => aiService.extractFileData(img, sys, user);
export const performOCR = (imgs: string[], p?: string) => aiService.performOCR(imgs, p);
export const suggestRestock = (inv: any[], sales: any[]) => aiService.suggestRestock(inv, sales);
export const suggestProductPricing = (n: string, c: number, cat: string, w: number) => aiService.suggestProductPricing(n, c, cat, w);
export const generateBusinessHealthReport = (f: any, s: any, i: any) => aiService.generateBusinessHealthReport(f, s, i);
export const analyzeForecastingData = (t: any, d: any) => aiService.analyzeForecastingData(t, d);
export const analyzeExpenses = (e: any[]) => aiService.analyzeExpenses(e);
export const askBusinessQuestion = (q: string, c: any) => aiService.askBusinessQuestion(q, c);
export const generateDailyBrief = (d: any) => aiService.generateDailyBrief(d);
export const detectSalesOpportunities = (c: any[], i: any[]) => aiService.detectSalesOpportunities(c, i);
export const detectInventoryRisks = (i: any[]) => aiService.detectInventoryRisks(i);
export const analyzeCashFlow = (d: any) => aiService.analyzeCashFlow(d);
export const generateCustomerInsight = (c: any, i: any[], p: any[]) => aiService.generateCustomerInsight(c, i, p);
export const generateSupplierScorecard = (s: any, p: any[], pm: any[]) => aiService.generateSupplierScorecard(s, p, pm);
export const summarizeDocument = (d: string, dt: any) => aiService.summarizeDocument(d, dt);
export const generateArchitectDoc = (p: string) => aiService.generateArchitectDoc(p);
export const generateBusinessMessage = (c: string, r: string) => aiService.generateBusinessMessage(c, r);
export const askFullAssistant = (c: string, q: string) => aiService.askFullAssistant(c, q);
export const analyzePredictiveMaintenance = (m: string, t: number, v: number, e: number, u: number) => aiService.analyzePredictiveMaintenance(m, t, v, e, u);
export const analyzeInkDensity = () => aiService.analyzeInkDensity();
export const generateSupplyChainStrategy = (n: string, s: number, a: number, d: number, m: number) => aiService.generateSupplyChainStrategy(n, s, a, d, m);
export const generatePricingStrategy = (n: string, p: number, lb: boolean, bd: string, bc: number, lc: number, wp: number, lc2: number) => aiService.generatePricingStrategy(n, p, lb, bd, bc, lc, wp, lc2);
export const generateBillingEmail = (t: string, id: string, cn: string, tot: number, cur: string, dd: string | undefined, st: string, comp: string) => aiService.generateBillingEmail(t, id, cn, tot, cur, dd, st, comp);
export const generateCollectionsStrategy = (cn: string, id: string, ta: number, cur: string, dd: string, st: string) => aiService.generateCollectionsStrategy(cn, id, ta, cur, dd, st);
export const runPreflightAudit = (j: string, jd: string, a: string) => aiService.runPreflightAudit(j, jd, a);
export const askFloatingAssistant = (c: string, q: string) => aiService.askFloatingAssistant(c, q);
export const testConnection_ = (p: any, k: string, m: string, b?: string) => aiService.testConnection(p, k, m, b);
