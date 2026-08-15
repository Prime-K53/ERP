import { create } from 'zustand';
import { logger } from '@/services/logger';
import type { ProductAttribute, AttributeValue } from '../types/attributes';
import { dbService } from '../services/db';

interface AttributeState {
  attributes: ProductAttribute[];
  isLoading: boolean;
  error: string | null;

  fetchAttributes: () => Promise<void>;
  addAttribute: (attr: ProductAttribute) => Promise<void>;
  updateAttribute: (id: string, patch: Partial<ProductAttribute>) => Promise<void>;
  deleteAttribute: (id: string) => Promise<void>;

  addAttributeValue: (attrId: string, value: AttributeValue) => Promise<void>;
  updateAttributeValue: (attrId: string, valueId: string, patch: Partial<AttributeValue>) => Promise<void>;
  removeAttributeValue: (attrId: string, valueId: string) => Promise<void>;
}

export const useAttributeStore = create<AttributeState>((set, get) => ({
  attributes: [],
  isLoading: false,
  error: null,

  fetchAttributes: async () => {
    set({ isLoading: true, error: null });
    try {
      const attrs = await dbService.getAll<ProductAttribute>('productAttributes');
      attrs.sort((a, b) => a.sortOrder - b.sortOrder);
      set({ attributes: attrs, isLoading: false });
    } catch (err: any) {
      logger.error('[AttributeStore] fetchAttributes failed:', err);
      set({ error: err?.message || 'Failed to load attributes', isLoading: false });
    }
  },

  addAttribute: async (attr) => {
    try {
      await dbService.put('productAttributes', attr);
      set((s) => ({ attributes: [...s.attributes, attr].sort((a, b) => a.sortOrder - b.sortOrder) }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to add attribute' });
    }
  },

  updateAttribute: async (id, patch) => {
    try {
      const existing = get().attributes.find((a) => a.id === id);
      if (!existing) throw new Error('Attribute not found');
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      await dbService.put('productAttributes', updated);
      set((s) => ({
        attributes: s.attributes.map((a) => (a.id === id ? updated : a)).sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to update attribute' });
    }
  },

  deleteAttribute: async (id) => {
    try {
      await dbService.delete('productAttributes', id);
      set((s) => ({ attributes: s.attributes.filter((a) => a.id !== id) }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to delete attribute' });
    }
  },

  addAttributeValue: async (attrId, value) => {
    try {
      const existing = get().attributes.find((a) => a.id === attrId);
      if (!existing) throw new Error('Attribute not found');
      const updated: ProductAttribute = {
        ...existing,
        values: [...existing.values, value],
        updatedAt: new Date().toISOString(),
      };
      await dbService.put('productAttributes', updated);
      set((s) => ({
        attributes: s.attributes.map((a) => (a.id === attrId ? updated : a)),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to add attribute value' });
    }
  },

  updateAttributeValue: async (attrId, valueId, patch) => {
    try {
      const existing = get().attributes.find((a) => a.id === attrId);
      if (!existing) throw new Error('Attribute not found');
      const updated: ProductAttribute = {
        ...existing,
        values: existing.values.map((v) => (v.id === valueId ? { ...v, ...patch } : v)),
        updatedAt: new Date().toISOString(),
      };
      await dbService.put('productAttributes', updated);
      set((s) => ({
        attributes: s.attributes.map((a) => (a.id === attrId ? updated : a)),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to update attribute value' });
    }
  },

  removeAttributeValue: async (attrId, valueId) => {
    try {
      const existing = get().attributes.find((a) => a.id === attrId);
      if (!existing) throw new Error('Attribute not found');
      const updated: ProductAttribute = {
        ...existing,
        values: existing.values.filter((v) => v.id !== valueId),
        updatedAt: new Date().toISOString(),
      };
      await dbService.put('productAttributes', updated);
      set((s) => ({
        attributes: s.attributes.map((a) => (a.id === attrId ? updated : a)),
      }));
    } catch (err: any) {
      set({ error: err?.message || 'Failed to remove attribute value' });
    }
  },
}));
