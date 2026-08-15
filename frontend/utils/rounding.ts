export const roundCurrency = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const roundQuantity = (value: number): number => {
  return Math.round(value * 1000) / 1000;
};

export const roundUnitCost = (value: number): number => {
  return Math.round(value * 10000) / 10000;
};

export const roundPercentage = (value: number): number => {
  return Math.round(value * 100) / 100;
};
