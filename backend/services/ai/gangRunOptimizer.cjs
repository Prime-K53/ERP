const BaseAIService = require('./baseService.cjs');

class GangRunOptimizer extends BaseAIService {
  async optimize( options = {}) {
    const workOrders = await this._all(
      `SELECT wo.*, wc.name as work_center_name, wc.hourly_rate
       FROM work_orders wo
       LEFT JOIN work_centers wc ON wo.work_center_id = wc.idwo.status NOT IN ('completed','cancelled')
       ORDER BY wo.due_date ASC`,
      []
    );

    const productionBatches = await this._all(
      `SELECT pb.*, wo.product_name, wo.quantity_planned
       FROM production_batches pb
       JOIN work_orders wo ON pb.work_order_id = wo.idpb.status NOT IN ('completed','cancelled')`,
      []
    );

    const boms = await this._all(
      `SELECT * FROM bill_of_materials`,
      []
    );

    const workCenters = await this._all(
      `SELECT * FROM work_centers`,
      []
    );

    const groups = this._groupJobs(workOrders, productionBatches, boms, workCenters, options);
    const metrics = this._calculateMetrics(groups, workOrders);

    return { groups, metrics, unoptimizedJobs: workOrders.length, optimizedGroups: groups.length };
  }

  _groupJobs(workOrders, productionBatches, boms, workCenters, options) {
    const threshold = options.similarityThreshold || 0.6;
    const maxGroupSize = options.maxGroupSize || 10;
    const groups = [];
    const assigned = new Set();

    for (let i = 0; i < workOrders.length; i++) {
      if (assigned.has(i)) continue;
      const group = { jobs: [workOrders[i]], commonMaterials: [], totalSetupSavings: 0, sharedWorkCenter: null };
      assigned.add(i);

      for (let j = i + 1; j < workOrders.length; j++) {
        if (assigned.has(j) || group.jobs.length >= maxGroupSize) continue;
        const similarity = this._calcSimilarity(workOrders[i], workOrders[j], boms);
        if (similarity >= threshold) {
          group.jobs.push(workOrders[j]);
          assigned.add(j);
        }
      }

      if (group.jobs.length > 1) {
        const centerIds = [...new Set(group.jobs.map(j => j.work_center_id).filter(Boolean))];
        group.sharedWorkCenter = centerIds.length === 1
          ? (workCenters.find(w => w.id === centerIds[0])?.name || 'Mixed')
          : 'Multiple Centers';
        group.totalSetupSavings = (group.jobs.length - 1) * 45;
        group.commonMaterials = this._findCommonMaterials(group.jobs, boms);
        groups.push(group);
      } else {
        groups.push({ jobs: group.jobs, commonMaterials: [], totalSetupSavings: 0, sharedWorkCenter: null });
      }
    }
    return groups;
  }

  _calcSimilarity(jobA, jobB, boms) {
    let score = 0;
    let factors = 0;

    if (jobA.work_center_id && jobB.work_center_id) {
      score += jobA.work_center_id === jobB.work_center_id ? 0.4 : 0;
      factors += 0.4;
    }
    if (jobA.product_name && jobB.product_name) {
      const a = jobA.product_name.toLowerCase();
      const b = jobB.product_name.toLowerCase();
      const common = [...new Set(a.split(' '))].filter(w => b.includes(w)).length;
      const max = Math.max(a.split(' ').length, b.split(' ').length);
      score += max > 0 ? (common / max) * 0.3 : 0;
      factors += 0.3;
    }
    if (jobA.bom_id && jobB.bom_id) {
      score += jobA.bom_id === jobB.bom_id ? 0.3 : 0;
      factors += 0.3;
    }
    return factors > 0 ? score / factors : 0;
  }

  _findCommonMaterials(jobs, boms) {
    const materialSets = jobs.map(job => {
      const bom = boms.find(b => b.id === job.bom_id);
      if (!bom || !bom.items) return [];
      const items = typeof bom.items === 'string' ? JSON.parse(bom.items) : bom.items;
      return Array.isArray(items) ? items.map(i => i.item_name || i.name) : [];
    });
    if (materialSets.length < 2) return [];
    const common = materialSets.reduce((a, b) => a.filter(x => b.includes(x)));
    return [...new Set(common)];
  }

  _calculateMetrics(groups, allOrders) {
    const ganged = groups.filter(g => g.jobs.length > 1);
    const totalSetupHours = allOrders.length * 1;
    const optimizedSetupHours = groups.length * 1;
    return {
      totalJobs: allOrders.length,
      gangedJobs: ganged.reduce((s, g) => s + g.jobs.length, 0),
      groupCount: ganged.length,
      setupHoursSaved: totalSetupHours - optimizedSetupHours,
      setupCostSaved: (totalSetupHours - optimizedSetupHours) * 45,
      utilizationRate: allOrders.length > 0 ? Math.round((ganged.reduce((s, g) => s + g.jobs.length, 0) / allOrders.length) * 100) : 0
    };
  }
}

module.exports = GangRunOptimizer;
