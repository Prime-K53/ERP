import { dbService } from './db';

interface LowStockItem {
  id: string;
  name: string;
  sku?: string;
  stock: number;
  reorderPoint: number;
}

interface AlertConfig {
  enabled: boolean;
  recipients: string[];
  threshold: number;
  lastAlertedAt: string | null;
}

const STORAGE_KEY = 'prime_erp_low_stock_alert_config';

export const getAlertConfig = async (): Promise<AlertConfig> => {
  try {
    const saved = await dbService.getSetting<AlertConfig>(STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  return { enabled: true, recipients: [], threshold: 10, lastAlertedAt: null };
};

export const saveAlertConfig = async (config: AlertConfig) => {
  await dbService.saveSetting(STORAGE_KEY, config);
};

export const checkAndSendLowStockAlerts = async (items: LowStockItem[]) => {
  const config = await getAlertConfig();
  if (!config.enabled || config.recipients.length === 0) return;

  const lowItems = items.filter(i => i.stock <= i.reorderPoint && i.reorderPoint > 0);
  if (lowItems.length === 0) return;

  const lastAlert = config.lastAlertedAt ? new Date(config.lastAlertedAt) : null;
  const now = new Date();
  const cooldownHours = 24;

  if (lastAlert && (now.getTime() - lastAlert.getTime()) < cooldownHours * 3600000) return;

  if (lowItems.length > 0) {
    console.info(`[LowStockAlert] ${lowItems.length} item(s) below reorder point. Timestamp recorded.`);
    await saveAlertConfig({ ...config, lastAlertedAt: now.toISOString() });
  }
};
