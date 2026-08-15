import { useState, useCallback } from 'react';
import { aiService } from '../services/ai/aiService';
import type { Item } from '../types';

export type AILoadingState = {
  itemSuggestions: boolean;
  priceOptimisation: Record<string, boolean>;
  fraudDetection: boolean;
  descriptionGeneration: boolean;
  discountOptimisation: boolean;
};

export type AIErrorState = {
  itemSuggestions: string | null;
  priceOptimisation: Record<string, string>;
  fraudDetection: string | null;
  descriptionGeneration: string | null;
  discountOptimisation: string | null;
};

export interface AISuggestionItem {
  id: string;
  name: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AIPriceOptimisation {
  suggestedPrice: number;
  currentPrice: number;
  margin: number;
  reasoning: string;
}

export interface AIFraudFlag {
  level: 'info' | 'warning' | 'critical';
  message: string;
  detail: string;
}

export interface AIDiscountSuggestion {
  suggestedDiscount: number;
  maxDiscount: number;
  reasoning: string;
}

export function useOrderFormAI() {
  const [loading, setLoading] = useState<AILoadingState>({
    itemSuggestions: false,
    priceOptimisation: {},
    fraudDetection: false,
    descriptionGeneration: false,
    discountOptimisation: false,
  });

  const [errors, setErrors] = useState<AIErrorState>({
    itemSuggestions: null,
    priceOptimisation: {},
    fraudDetection: null,
    descriptionGeneration: null,
    discountOptimisation: null,
  });

  const setPriceLoading = (itemId: string, val: boolean) =>
    setLoading(prev => ({ ...prev, priceOptimisation: { ...prev.priceOptimisation, [itemId]: val } }));

  const setPriceError = (itemId: string, err: string | null) =>
    setErrors(prev => ({ ...prev, priceOptimisation: { ...prev.priceOptimisation, [itemId]: err } }));

  const suggestItems = useCallback(async (
    customerName: string,
    customers: any[],
    invoices: any[],
    inventory: any[]
  ): Promise<AISuggestionItem[]> => {
    if (!customerName) return [];
    setLoading(prev => ({ ...prev, itemSuggestions: true }));
    setErrors(prev => ({ ...prev, itemSuggestions: null }));
    try {
      const context = {
        customerName,
        recentInvoices: invoices
          .filter((i: any) => i.customerName?.toLowerCase().includes(customerName.toLowerCase()))
          .slice(0, 10)
          .map((i: any) => ({
            date: i.date,
            items: (i.items || []).map((it: any) => ({ name: it.name || it.productName, qty: it.quantity, price: it.unitPrice || it.price })),
            total: i.totalAmount,
          })),
        availableItems: inventory
          .filter((i: Item) => i.type !== 'Service' && i.type !== 'Raw Material')
          .slice(0, 50)
          .map((i: any) => ({ name: i.name, category: i.category, price: i.price, stock: i.stock })),
      };
      const prompt = `You are a sales intelligence AI. Based on this customer's purchase history and available inventory, suggest up to 5 items they are most likely to purchase.

Customer: ${customerName}

Recent purchase history:
${JSON.stringify(context.recentInvoices, null, 2)}

Available inventory (top 50):
${JSON.stringify(context.availableItems, null, 2)}

Return a JSON array of objects with fields:
- "name": item name (must match exactly from available inventory)
- "reason": short why this item is a good suggestion
- "confidence": "high", "medium", or "low"

Return ONLY valid JSON array, no markdown or explanation.`;

      const text = await aiService.generateAIResponse(prompt);
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      const suggestions: AISuggestionItem[] = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
      return suggestions.map((s: any) => {
        const match = inventory.find((i: any) => i.name === s.name);
        return { id: match?.id || s.name, name: s.name, reason: s.reason || '', confidence: s.confidence || 'medium' };
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to get suggestions';
      setErrors(prev => ({ ...prev, itemSuggestions: msg }));
      return [];
    } finally {
      setLoading(prev => ({ ...prev, itemSuggestions: false }));
    }
  }, []);

  const optimisePrice = useCallback(async (
    item: any,
    cost: number
  ): Promise<AIPriceOptimisation | null> => {
    const itemId = item.id || item.name;
    setPriceLoading(itemId, true);
    setPriceError(itemId, null);
    try {
      const totalCost = Number(cost || item.cost || 0) || 0;
      const result = await aiService.suggestProductPricing(item.name, totalCost, item.category || 'General', 0);
      const suggested = Number(result.suggestedPrice) || totalCost * 1.5;
      return {
        suggestedPrice: Math.round(suggested * 100) / 100,
        currentPrice: Number(item.price || item.selling_price || 0),
        margin: totalCost > 0 ? Math.round(((suggested - totalCost) / suggested) * 100 * 10) / 10 : 0,
        reasoning: result.reasoning || `AI-optimised based on cost ${totalCost} and category ${item.category || 'General'}`,
      };
    } catch (err: any) {
      setPriceError(itemId, err?.message || 'Price optimisation failed');
      return null;
    } finally {
      setPriceLoading(itemId, false);
    }
  }, []);

  const detectAnomalies = useCallback(async (
    items: any[],
    totalAmount: number,
    customerName: string,
    invoices: any[],
    customers: any[]
  ): Promise<AIFraudFlag[]> => {
    if (!customerName || items.length === 0) return [];
    setLoading(prev => ({ ...prev, fraudDetection: true }));
    setErrors(prev => ({ ...prev, fraudDetection: null }));
    try {
      const customerHistory = invoices
        .filter((i: any) => i.customerName?.toLowerCase() === customerName.toLowerCase())
        .slice(0, 20);
      const avgOrderValue = customerHistory.length > 0
        ? customerHistory.reduce((s: number, i: any) => s + (Number(i.totalAmount) || 0), 0) / customerHistory.length
        : 0;
      const flags: AIFraudFlag[] = [];

      if (avgOrderValue > 0 && totalAmount > avgOrderValue * 3) {
        flags.push({
          level: 'warning',
          message: 'Unusual order value',
          detail: `This order (${totalAmount.toFixed(2)}) is ${(totalAmount / avgOrderValue).toFixed(1)}x the customer's average (${avgOrderValue.toFixed(2)})`,
        });
      }
      if (customerHistory.length === 0 && totalAmount > 0) {
        flags.push({
          level: 'info',
          message: 'New customer — first order',
          detail: 'No prior transaction history found for this customer.',
        });
      }
      items.forEach((item: any) => {
        const idx = items.indexOf(item);
        const sameName = items.filter((i: any) => i.name === item.name);
        if (sameName.length > 1 && idx === items.indexOf(sameName[0])) {
          flags.push({
            level: 'info',
            message: 'Duplicate item detected',
            detail: `${item.name} appears ${sameName.length} times in this order.`,
          });
        }
        if (Number(item.price) > Number(item.cost) * 10 && Number(item.cost) > 0) {
          flags.push({
            level: 'warning',
            message: 'Price anomaly',
            detail: `${item.name}: price (${item.price}) is 10x cost (${item.cost}).`,
          });
        }
      });

      const flagJSON = flags.length > 0
        ? await aiService.generateAIResponse(
            `Analyse these order flags for genuine concern vs normal business. Customer: ${customerName}. Total: ${totalAmount}. Flags: ${JSON.stringify(flags)}. Return a JSON array of {level, message, detail} — only keep flags that are genuinely suspicious.`
          ).catch(() => JSON.stringify(flags))
        : JSON.stringify(flags);

      try {
        const parsed = JSON.parse(flagJSON.replace(/```json|```/g, '').trim());
        return Array.isArray(parsed) ? parsed : flags;
      } catch {
        return flags;
      }
    } catch (err: any) {
      setErrors(prev => ({ ...prev, fraudDetection: err?.message || 'Detection failed' }));
      return [];
    } finally {
      setLoading(prev => ({ ...prev, fraudDetection: false }));
    }
  }, []);

  const generateDescription = useCallback(async (
    items: any[],
    customerName: string,
    type: string
  ): Promise<string> => {
    if (items.length === 0) return '';
    setLoading(prev => ({ ...prev, descriptionGeneration: true }));
    setErrors(prev => ({ ...prev, descriptionGeneration: null }));
    try {
      const summary = items.map((i: any) => `${i.quantity}x ${i.name} @ ${i.price}`).join(', ');
      const prompt = `Generate a professional description for a ${type} document.

Customer: ${customerName}
Items: ${summary}

Return a single paragraph (2-3 sentences) that professionally describes this transaction. Do not include any formatting, markdown, or prefixes.`;
      const text = await aiService.generateAIResponse(prompt);
      return text.trim();
    } catch (err: any) {
      setErrors(prev => ({ ...prev, descriptionGeneration: err?.message || 'Generation failed' }));
      return '';
    } finally {
      setLoading(prev => ({ ...prev, descriptionGeneration: false }));
    }
  }, []);

  const optimiseDiscount = useCallback(async (
    totalAmount: number,
    items: any[],
    customerName: string,
    currentDiscount: number,
    customerSegment: string
  ): Promise<AIDiscountSuggestion | null> => {
    if (totalAmount <= 0 || items.length === 0) return null;
    setLoading(prev => ({ ...prev, discountOptimisation: true }));
    setErrors(prev => ({ ...prev, discountOptimisation: null }));
    try {
      const costTotal = items.reduce((s: number, i: any) => s + (Number(i.cost) || 0) * (Number(i.quantity) || 0), 0);
      const margin = totalAmount > 0 ? ((totalAmount - costTotal) / totalAmount) * 100 : 0;
      const prompt = `You are a pricing strategy AI. Given this order:
- Total: ${totalAmount}
- Cost: ${costTotal}
- Margin: ${margin.toFixed(1)}%
- Items: ${items.length}
- Customer: ${customerName}
- Segment: ${customerSegment}
- Current discount: ${currentDiscount}

Return a JSON object ONLY (no markdown):
{
  "suggestedDiscount": number (optimal discount amount to incentivise the sale while preserving healthy margin),
  "maxDiscount": number (absolute maximum discount before margin becomes negative),
  "reasoning": "string explaining the recommendation"
}`;
      const text = await aiService.generateAIResponse(prompt);
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        suggestedDiscount: Math.max(0, Number(parsed.suggestedDiscount) || 0),
        maxDiscount: Math.max(0, Number(parsed.maxDiscount) || totalAmount * 0.2),
        reasoning: parsed.reasoning || 'AI-optimised discount recommendation.',
      };
    } catch (err: any) {
      setErrors(prev => ({ ...prev, discountOptimisation: err?.message || 'Optimisation failed' }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, discountOptimisation: false }));
    }
  }, []);

  return {
    loading,
    errors,
    suggestItems,
    optimisePrice,
    detectAnomalies,
    generateDescription,
    optimiseDiscount,
  };
}
