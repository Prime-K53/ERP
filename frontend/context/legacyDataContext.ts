export interface LegacyDataSlices {
  auth?: Record<string, any> | null;
  finance?: Record<string, any> | null;
  inventory?: Record<string, any> | null;
  production?: Record<string, any> | null;
  sales?: Record<string, any> | null;
  procurement?: Record<string, any> | null;
  orders?: Record<string, any> | null;
  examination?: Record<string, any> | null;
  banking?: Record<string, any> | null;
}

export const runLegacyRefreshTasks = async (slices: LegacyDataSlices, silent = false) => {
  const tasks = [
    () => slices.finance?.fetchFinanceData?.(silent),
    () => slices.sales?.fetchSalesData?.(silent),
    () => slices.inventory?.fetchInventoryData?.(silent),
    () => slices.procurement?.fetchProcurementData?.(silent),
    () => slices.production?.fetchProductionData?.(silent),
    () => slices.orders?.fetchOrders?.(silent),
    () => slices.banking?.fetchBankingData?.(silent),
  ];

  return Promise.allSettled(tasks.map((task) => task()));
};
