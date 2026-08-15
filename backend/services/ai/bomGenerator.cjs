const BaseAIService = require('./baseService.cjs');

class BOMGenerator extends BaseAIService {
  async generate( spec) {
    if (!spec || !spec.productName) {
      return { error: 'Product name is required', suggestions: await this._suggestFromExisting() };
    }

    const existingBoms = await this._all(
      `SELECT * FROM bill_of_materials ORDER BY created_at DESC LIMIT 20`,
      []
    );

    const inventory = await this._all(
      `SELECT * FROM inventory ORDER BY category, material`,
      []
    );

    const bomDefaults = await this._all(
      `SELECT * FROM bom_default_materials`,
      []
    );

    const workCenters = await this._all(
      `SELECT * FROM work_centers`,
      []
    );

    const bom = this._buildBOM(spec, inventory, bomDefaults, existingBoms, workCenters);

    return {
      bom,
      similarBoms: this._findSimilarBoms(spec, existingBoms),
      inventorySuggestions: this._suggestInventoryItems(spec, inventory),
      generatedAt: new Date().toISOString()
    };
  }

  _buildBOM(spec, inventory, bomDefaults, existingBoms, workCenters) {
    const name = spec.productName;
    const items = this._suggestComponents(spec, inventory, bomDefaults);
    const totalCost = items.reduce((s, i) => s + (i.quantity * i.unitCost), 0);
    const suggestedPrice = totalCost * 1.3;
    const suggestedWorkCenter = spec.workCenter || (workCenters.length > 0 ? workCenters[0].name : null);

    const similar = existingBoms
      .map(b => {
        try {
          const bi = typeof b.items === 'string' ? JSON.parse(b.items) : b.items;
          return { name: b.name, items: bi, totalCost: b.total_cost || 0 };
        } catch { return null; }
      })
      .filter(Boolean);

    let laborCost = 0;
    if (similar.length > 0) {
      const avgLaborRatio = similar.reduce((s, b) => {
        const tc = b.totalCost || 0;
        return tc > 0 ? s + (tc * 0.2) / tc : s;
      }, 0) / similar.length;
      laborCost = totalCost * (avgLaborRatio || 0.2);
    } else {
      laborCost = totalCost * 0.2;
    }

    const overhead = totalCost * 0.1;

    return {
      name,
      version: '1.0',
      status: 'draft',
      items,
      materialCost: Math.round(totalCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      overheadCost: Math.round(overhead * 100) / 100,
      totalCost: Math.round((totalCost + laborCost + overhead) * 100) / 100,
      suggestedSellingPrice: Math.round(suggestedPrice * 100) / 100,
      suggestedProfitMargin: '30%',
      suggestedWorkCenter,
      estimatedProductionHours: items.reduce((s, i) => s + i.estimatedHours || 0.5, 1)
    };
  }

  _suggestComponents(spec, inventory, bomDefaults) {
    const items = [];

    if (!spec.pages && !spec.materials) {
      const paperItems = inventory.filter(i =>
        i.category?.toLowerCase() === 'stationery' ||
        i.type?.toLowerCase() === 'stationery' ||
        i.material?.toLowerCase().includes('paper')
      );

      if (paperItems.length > 0) {
        const paper = paperItems[0];
        items.push({
          name: paper.material || paper.name,
          itemId: paper.id,
          quantity: spec.quantity || 100,
          unit: 'sheets',
          unitCost: this._safeNumber(paper.cost_per_unit || 0),
          category: 'raw_material',
          estimatedHours: 0.5,
          notes: 'Suggested from inventory'
        });
      }

      const tonerItems = inventory.filter(i =>
        i.material?.toLowerCase().includes('toner') ||
        i.name?.toLowerCase().includes('toner')
      );

      if (tonerItems.length > 0) {
        const toner = tonerItems[0];
        items.push({
          name: toner.material || toner.name,
          itemId: toner.id,
          quantity: 1,
          unit: 'unit',
          unitCost: this._safeNumber(toner.cost_per_unit || 0),
          category: 'consumable',
          estimatedHours: 0.25,
          notes: 'Estimated toner consumption'
        });
      }
    }

    if (items.length === 0) {
      items.push({
        name: 'Raw Material (estimate)',
        itemId: null,
        quantity: spec.quantity || 100,
        unit: 'units',
        unitCost: 5,
        category: 'raw_material',
        estimatedHours: 0.5,
        notes: 'Estimated cost — update from inventory'
      });
    }

    return items;
  }

  _findSimilarBoms(spec, existingBoms) {
    return existingBoms
      .filter(b => {
        if (!b.name) return false;
        const a = spec.productName?.toLowerCase() || '';
        const bName = b.name.toLowerCase();
        const aWords = a.split(' ');
        return aWords.some(w => w.length > 3 && bName.includes(w));
      })
      .map(b => ({
        name: b.name,
        id: b.id,
        totalCost: b.total_cost
      }));
  }

  _suggestInventoryItems(spec, inventory) {
    return inventory
      .filter(i => {
        const name = (i.material || i.name || '').toLowerCase();
        const specName = spec.productName?.toLowerCase() || '';
        return name.includes('paper') || name.includes('ink') || name.includes('toner') ||
               name.includes('binding') || name.includes('laminate') ||
               specName.split(' ').some(w => w.length > 3 && name.includes(w));
      })
      .map(i => ({
        id: i.id,
        name: i.material || i.name,
        category: i.category || i.type,
        currentStock: i.quantity,
        unitCost: i.cost_per_unit
      }));
  }

  async _suggestFromExisting() {
    const boms = await this._all(
      `SELECT name, total_cost FROM bill_of_materials ORDER BY created_at DESC LIMIT 5`,
      []
    );
    return boms.map(b => ({ name: b.name, totalCost: b.total_cost }));
  }
}

module.exports = BOMGenerator;
