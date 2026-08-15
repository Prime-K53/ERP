import { BaseRepository } from './baseRepository';
import type { Customer } from '../../types';

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() {
    super('customers');
  }

  async getByEmail(email: string): Promise<(Customer & import('./baseRepository').SyncMetadata) | null> {
    const all = await this.getAll();
    return all.find((c: any) => c.email === email) || null;
  }

  async getByPhone(phone: string): Promise<(Customer & import('./baseRepository').SyncMetadata) | null> {
    const all = await this.getAll();
    return all.find((c: any) => c.phone === phone) || null;
  }
}

export const customerRepository = new CustomerRepository();