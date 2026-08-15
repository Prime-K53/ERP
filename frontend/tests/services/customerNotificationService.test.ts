
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customerNotificationService } from '../../services/customerNotificationService';
import { dbService } from '../../services/db';

vi.mock('../../services/db', () => ({
  dbService: {
    put: vi.fn().mockResolvedValue({}),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/geminiService', () => ({
  generateAIResponse: vi.fn().mockResolvedValue('AI Message'),
}));

describe('customerNotificationService', () => {
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      companyName: 'Test Corp',
      notificationSettings: { customerActivityNotifications: true }
    };
    
    const store: Record<string, string> = {
      'nexus_company_config': JSON.stringify(mockConfig)
    };
    
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value; }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const k in store) delete store[k]; })
    });

    vi.stubGlobal('open', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('should trigger notification when enabled', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789', amount: '$100' };
    
    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(dbService.put).toHaveBeenCalledWith('customerNotificationLogs', expect.objectContaining({
      customerName: 'John Doe',
      type: 'QUOTATION'
    }));
  });

  it('should not trigger notification when disabled', async () => {
    mockConfig.notificationSettings.customerActivityNotifications = false;
    localStorage.setItem('nexus_company_config', JSON.stringify(mockConfig));
    
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789' };
    
    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(globalThis.confirm).not.toHaveBeenCalled();
    expect(dbService.put).not.toHaveBeenCalled();
  });

  it('should rate limit notifications', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789' };
    
    vi.mocked(dbService.getAll).mockResolvedValue([{
      type: 'QUOTATION',
      entityId: '123',
      timestamp: new Date().toISOString()
    }]);

    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(globalThis.confirm).not.toHaveBeenCalled();
    expect(dbService.put).not.toHaveBeenCalled();
  });

  it('should log notification with internal delivery mode', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789', amount: '$50' };

    await customerNotificationService.triggerNotification('RECEIPT', data);

    expect(dbService.put).toHaveBeenCalledWith('customerNotificationLogs', expect.objectContaining({
      customerName: 'John Doe',
      type: 'RECEIPT'
    }));
  });
});
