import type { VariantUnit, UnitConversion } from '../types';

export interface ConversionPath {
  fromUnit: string;
  toUnit: string;
  factor: number;
  steps: { fromUnit: string; toUnit: string; factor: number }[];
}

function findDirectConversion(conversions: UnitConversion[], from: string, to: string): number | null {
  for (const c of conversions) {
    if (c.fromUnit === from && c.toUnit === to) return c.factor;
    if (c.fromUnit === to && c.toUnit === from) return 1 / c.factor;
  }
  return null;
}

export class UnitConversionService {
  /**
   * Find a conversion path between two units within a variant's unit set.
   */
  static findPath(units: VariantUnit[], fromUnit: string, toUnit: string): ConversionPath | null {
    if (fromUnit === toUnit) {
      return { fromUnit, toUnit, factor: 1, steps: [] };
    }

    // Build adjacency map of all conversions across all variant units
    const adj = new Map<string, { target: string; forwardFactor: number }[]>();
    for (const vu of units) {
      for (const c of vu.conversions) {
        if (!adj.has(c.fromUnit)) adj.set(c.fromUnit, []);
        if (!adj.has(c.toUnit)) adj.set(c.toUnit, []);
        adj.get(c.fromUnit)!.push({ target: c.toUnit, forwardFactor: c.factor });
        adj.get(c.toUnit)!.push({ target: c.fromUnit, forwardFactor: 1 / c.factor });
      }
    }

    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: { unit: string; factor: number; steps: { fromUnit: string; toUnit: string; factor: number }[] }[] = [
      { unit: fromUnit, factor: 1, steps: [] },
    ];
    visited.add(fromUnit);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current.unit) || [];
      for (const n of neighbors) {
        if (visited.has(n.target)) continue;
        visited.add(n.target);
        const newFactor = current.factor * n.forwardFactor;
        const newSteps = [
          ...current.steps,
          { fromUnit: current.unit, toUnit: n.target, factor: n.forwardFactor },
        ];
        if (n.target === toUnit) {
          return { fromUnit, toUnit, factor: newFactor, steps: newSteps };
        }
        queue.push({ unit: n.target, factor: newFactor, steps: newSteps });
      }
    }

    return null;
  }

  /**
   * Convert a quantity from one unit to another.
   */
  static convert(
    units: VariantUnit[],
    quantity: number,
    fromUnit: string,
    toUnit: string
  ): { quantity: number; path: ConversionPath } | null {
    const path = UnitConversionService.findPath(units, fromUnit, toUnit);
    if (!path) return null;
    return { quantity: quantity * path.factor, path };
  }

  /**
   * Get the stocking unit for a variant's unit set.
   */
  static getStockingUnit(units: VariantUnit[]): string | null {
    const su = units.find(u => u.isStockingUnit);
    return su?.unit || null;
  }

  /**
   * Get the purchase unit for a variant's unit set.
   */
  static getPurchaseUnit(units: VariantUnit[]): string | null {
    const pu = units.find(u => u.isPurchaseUnit);
    return pu?.unit || null;
  }

  /**
   * Convert a quantity from purchase unit to stocking unit.
   */
  static purchaseToStocking(
    units: VariantUnit[],
    purchaseQuantity: number
  ): { stockingQuantity: number; path: ConversionPath } | null {
    const from = UnitConversionService.getPurchaseUnit(units);
    const to = UnitConversionService.getStockingUnit(units);
    if (!from || !to) return null;
    const result = UnitConversionService.convert(units, purchaseQuantity, from, to);
    if (!result) return null;
    return { stockingQuantity: result.quantity, path: result.path };
  }

  /**
   * Build a chain of conversions linking two units through the stocking unit.
   */
  static buildChain(
    units: VariantUnit[],
    fromUnit: string,
    toUnit: string
  ): UnitConversion[] | null {
    const path = UnitConversionService.findPath(units, fromUnit, toUnit);
    if (!path) return null;
    return path.steps.map(s => ({
      fromUnit: s.fromUnit,
      toUnit: s.toUnit,
      factor: s.factor,
    }));
  }
}

export const unitConversionService = new UnitConversionService();
