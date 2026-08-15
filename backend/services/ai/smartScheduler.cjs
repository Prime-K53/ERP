const BaseAIService = require('./baseService.cjs');

class SmartScheduler extends BaseAIService {
  async optimize( options = {}) {
    const workOrders = await this._all(
      `SELECT * FROM work_ordersstatus NOT IN ('completed','cancelled')`,
      []
    );

    const workCenters = await this._all(
      `SELECT * FROM work_centers`,
      []
    );

    const resources = await this._all(
      `SELECT * FROM production_resources`,
      []
    );

    const batches = await this._all(
      `SELECT * FROM production_batches`,
      []
    );

    const employees = await this._all(
      `SELECT * FROM employeesstatus = 'active'`,
      []
    );

    const schedule = this._buildSchedule(workOrders, workCenters, resources, employees, options);

    return {
      schedule,
      metrics: this._calculateScheduleMetrics(schedule, workOrders),
      bottlenecks: this._identifyBottlenecks(schedule, workCenters),
      recommendations: this._generateRecommendations(schedule, workOrders, workCenters),
      generatedAt: new Date().toISOString()
    };
  }

  _buildSchedule(workOrders, workCenters, resources, employees, options) {
    const sorted = [...workOrders].sort((a, b) => {
      const priority = { High: 0, Medium: 1, Low: 2 };
      const ap = priority[a.priority] ?? 1;
      const bp = priority[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;
      return new Date(a.due_date || 0) - new Date(b.due_date || 0);
    });

    const schedule = [];
    const centerLoads = {};

    for (const wo of sorted) {
      const center = workCenters.find(c => c.id === wo.work_center_id);
      if (!center) {
        schedule.push({
          workOrderId: wo.id,
          workOrderName: wo.product_name || wo.customer_name || 'Unknown',
          status: 'unassigned',
          reason: 'No work center assigned'
        });
        continue;
      }

      const centerKey = center.id;
      if (!centerLoads[centerKey]) centerLoads[centerKey] = { jobs: [], totalHours: 0 };

      const estimatedHours = this._estimateJobHours(wo, center, resources);
      const startDay = this._findEarliestSlot(centerLoads[centerKey], estimatedHours, center.capacity_per_day);
      const endDay = startDay + Math.ceil(estimatedHours / Math.max(1, this._safeNumber(center.capacity_per_day) || 8));

      centerLoads[centerKey].jobs.push({ wo, startDay, endDay, hours: estimatedHours });
      centerLoads[centerKey].totalHours += estimatedHours;

      const assignedResources = resources.filter(r =>
        r.work_center_id === center.id && r.status === 'available'
      ).slice(0, Math.ceil(estimatedHours / 8));

      schedule.push({
        workOrderId: wo.id,
        workOrderName: wo.product_name || wo.customer_name || 'Unknown',
        priority: wo.priority || 'Medium',
        dueDate: wo.due_date,
        workCenter: center.name,
        estimatedHours: Math.round(estimatedHours * 10) / 10,
        suggestedStartDay: `Day ${startDay + 1}`,
        suggestedEndDay: `Day ${endDay + 1}`,
        suggestedStartDate: this._daysFromNow(startDay),
        suggestedEndDate: this._daysFromNow(endDay),
        assignedResources: assignedResources.map(r => r.name),
        assignedStaff: Math.min(assignedResources.length + 1, employees.length),
        status: 'scheduled'
      });
    }

    return schedule;
  }

  _estimateJobHours(wo, center, resources) {
    const baseHours = this._safeNumber(wo.quantity_planned) * 0.5;
    const setupHours = 1;
    const capacity = Math.max(1, this._safeNumber(center.capacity_per_day) || 8);
    return Math.max(1, (baseHours + setupHours) / capacity);
  }

  _findEarliestSlot(centerLoad, hours, capacityPerDay) {
    const capacity = Math.max(1, this._safeNumber(capacityPerDay) || 8);
    const daysNeeded = Math.ceil(hours / capacity);
    if (centerLoad.jobs.length === 0) return 0;

    let candidateDay = 0;
    for (const job of centerLoad.jobs) {
      candidateDay = Math.max(candidateDay, job.endDay);
    }
    return candidateDay;
  }

  _daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  _calculateScheduleMetrics(schedule, allWorkOrders) {
    const scheduled = schedule.filter(s => s.status === 'scheduled');
    const totalHours = scheduled.reduce((s, j) => s + j.estimatedHours, 0);
    const overdue = allWorkOrders.filter(wo => {
      if (!wo.due_date) return false;
      return new Date(wo.due_date) < new Date() && wo.status !== 'completed';
    });

    return {
      totalScheduled: scheduled.length,
      totalUnscheduled: schedule.filter(s => s.status !== 'scheduled').length,
      totalEstimatedHours: Math.round(totalHours * 10) / 10,
      averageJobHours: scheduled.length > 0 ? Math.round((totalHours / scheduled.length) * 10) / 10 : 0,
      overdueJobs: overdue.length,
      estimatedCompletionDays: Math.round(totalHours / 8)
    };
  }

  _identifyBottlenecks(schedule, workCenters) {
    const centerJobCounts = {};
    for (const job of schedule) {
      if (job.status !== 'scheduled') continue;
      if (!centerJobCounts[job.workCenter]) centerJobCounts[job.workCenter] = [];
      centerJobCounts[job.workCenter].push(job);
    }

    return Object.entries(centerJobCounts)
      .map(([name, jobs]) => ({
        workCenter: name,
        scheduledJobs: jobs.length,
        totalHours: Math.round(jobs.reduce((s, j) => s + j.estimatedHours, 0) * 10) / 10,
        bottleneckScore: jobs.length > 5 ? Math.round((jobs.length / 10) * 100) : 0
      }))
      .filter(b => b.bottleneckScore > 0)
      .sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  }

  _generateRecommendations(schedule, workOrders, workCenters) {
    const recs = [];
    const overdue = workOrders.filter(wo => {
      if (!wo.due_date) return false;
      return new Date(wo.due_date) < new Date() && wo.status !== 'completed';
    });

    if (overdue.length > 0) {
      recs.push(`Prioritize ${overdue.length} overdue work orders`);
    }

    const scheduled = schedule.filter(s => s.status === 'scheduled');
    const centerLoads = {};
    for (const job of scheduled) {
      if (!centerLoads[job.workCenter]) centerLoads[job.workCenter] = 0;
      centerLoads[job.workCenter] += job.estimatedHours;
    }

    const overloaded = Object.entries(centerLoads)
      .filter(([, hours]) => hours > 80)
      .sort(([, a], [, b]) => b - a);

    for (const [center, hours] of overloaded.slice(0, 3)) {
      recs.push(`Consider redistributing load from "${center}" (${Math.round(hours)}h scheduled)`);
    }

    if (scheduled.length > 0) {
      recs.push('Schedule optimization complete — review suggested start dates for conflicts');
    }

    return recs;
  }
}

module.exports = SmartScheduler;
