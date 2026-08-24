import { SalesOrder } from '../types';
import { dbService } from './db.ts';

export const salesOrderService = {
  async create(order: SalesOrder) {
    await dbService.put('salesOrders', order);
    return order;
  },

  async update(id: string, patch: Partial<SalesOrder>) {
    const existing = await dbService.get<SalesOrder>('salesOrders', id);
    if (!existing) throw new Error('Not found');
    const updated: SalesOrder = Object.assign({}, existing, patch);
    await dbService.put('salesOrders', updated);
    return updated;
  },

  async getAll() {
    return await dbService.getAll<SalesOrder>('salesOrders');
  },

  async getById(id: string) {
    return await dbService.get<SalesOrder>('salesOrders', id);
  },

  async delete(id: string) {
    await dbService.delete('salesOrders', id);
  }
};
