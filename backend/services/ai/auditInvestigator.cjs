const BaseAIService = require('./baseService.cjs');
const LLMClient = require('./llmClient.cjs');

class AuditInvestigator extends BaseAIService {
  constructor() {
    super();
    this.llm = new LLMClient();
  }

  async investigate( query, options = {}) {
    const auditLogs = await this._getAuditLogs( options);
    const pricingAudits = await this._getPricingAudits( options);
    const marginAudits = await this._getMarginAudits( options);

    const findings = [];

    findings.push(...await this._analyzeIntegrityChain(auditLogs));
    findings.push(...await this._analyzeWorkflowAnomalies(pricingAudits));
    findings.push(...this._analyzeMarginChanges(marginAudits));

    let answer = '';
    if (query) {
      const context = this._formatAuditContext(findings, auditLogs, pricingAudits);
      if (process.env.AI_API_KEY) {
        answer = await this.llm.generate(
          'You are an AI audit investigator. Analyze the audit trail data and answer the question concisely.',
          `Audit Context:\n${context}\n\nQuestion: ${query}`
        );
      } else {
        answer = this._ruleBasedInvestigation(query, findings, auditLogs);
      }
    }

    return {
      findings: findings.sort((a, b) => b.severity - a.severity),
      totalFindings: findings.length,
      highSeverity: findings.filter(f => f.severity >= 7).length,
      mediumSeverity: findings.filter(f => f.severity >= 4 && f.severity < 7).length,
      lowSeverity: findings.filter(f => f.severity < 4).length,
      answer: answer || 'No specific query provided. Review the findings below.',
      auditPeriod: `${options.daysBack || 90} days`,
      generatedAt: new Date().toISOString()
    };
  }

  async _getAuditLogs( options) {
    const daysBack = options.daysBack || 90;
    return this._all(
      `SELECT * FROM audit_logs WHERE created_at >= datetime('now', ? || ' days')
       ORDER BY created_at DESC LIMIT 1000`,
      [String(-daysBack)]
    );
  }

  async _getPricingAudits( options) {
    const daysBack = options.daysBack || 90;
    return this._all(
      `SELECT * FROM examination_pricing_audit WHERE created_at >= 
datetime('now', ? || ' days')
       ORDER BY created_at DESC LIMIT 500`,
      [String(-daysBack)]
    );
  }

  async _getMarginAudits( options) {
    const daysBack = options.daysBack || 90;
    return this._all(
      `SELECT * FROM profit_margin_audit_logs WHERE created_at >= 
datetime('now', ? || ' days')
       ORDER BY created_at DESC LIMIT 500`,
      [String(-daysBack)]
    );
  }

  async _analyzeIntegrityChain(auditLogs) {
    const findings = [];
    if (auditLogs.length < 2) return findings;

    for (let i = 1; i < auditLogs.length; i++) {
      const current = auditLogs[i];
      const previous = auditLogs[i - 1];
      if (current.previous_hash && previous.integrity_hash &&
          current.previous_hash !== previous.integrity_hash) {
        findings.push({
          id: `chain-broken-${current.id || i}`,
          type: 'integrity_chain_break',
          title: 'Audit Integrity Chain Broken',
          description: `Hash mismatch between audit entries at ${current.created_at}`,
          severity: 10,
          entityId: current.id,
          entityType: 'audit_log',
          action: current.action,
          timestamp: current.created_at
        });
      }
    }

    if (findings.length === 0 && auditLogs.length > 10) {
      findings.push({
        id: 'chain-verified',
        type: 'integrity_verified',
        title: 'Audit Integrity Chain Verified',
        description: `All ${auditLogs.length} audit entries have valid integrity hashes`,
        severity: 0,
        entityType: 'audit_log',
        timestamp: new Date().toISOString()
      });
    }

    return findings;
  }

  async _analyzeWorkflowAnomalies(pricingAudits) {
    const findings = [];
    if (pricingAudits.length < 5) return findings;

    const overrideCount = pricingAudits.filter(a => a.event_type === 'MANUAL_OVERRIDE').length;
    if (overrideCount > pricingAudits.length * 0.3) {
      findings.push({
        id: 'high-override-rate',
        type: 'excessive_overrides',
        title: 'High Pricing Override Rate',
        description: `${overrideCount} of ${pricingAudits.length} pricing events are manual overrides (${Math.round(overrideCount / pricingAudits.length * 100)}%)`,
        severity: 6,
        entityType: 'examination_pricing_audit',
        count: overrideCount,
        total: pricingAudits.length,
        timestamp: new Date().toISOString()
      });
    }

    const largeOverrides = pricingAudits.filter(
      a => a.event_type === 'MANUAL_OVERRIDE' && Math.abs(this._safeNumber(a.percentage_difference)) > 50
    );
    for (const o of largeOverrides) {
      findings.push({
        id: `large-override-${o.id}`,
        type: 'large_override',
        title: 'Suspicious Large Override',
        description: `Override of ${o.percentage_difference}% on batch ${o.batch_id} (${o.previous_cost_per_learner} → ${o.new_cost_per_learner})`,
        severity: 8,
        entityId: o.batch_id,
        entityType: 'examination_batch',
        percentageDifference: o.percentage_difference,
        oldValue: o.previous_cost_per_learner,
        newValue: o.new_cost_per_learner,
        timestamp: o.created_at
      });
    }

    return findings;
  }

  _analyzeMarginChanges(marginAudits) {
    const findings = [];
    const recentChanges = marginAudits.filter(a => {
      const d = new Date(a.created_at || 0);
      return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
    });

    if (recentChanges.length > 10) {
      findings.push({
        id: 'margin-change-spike',
        type: 'margin_change_spike',
        title: 'Unusual Margin Change Activity',
        description: `${recentChanges.length} profit margin changes in the last 7 days`,
        severity: 5,
        entityType: 'profit_margin_audit_logs',
        count: recentChanges.length,
        timestamp: new Date().toISOString()
      });
    }

    return findings;
  }

  _formatAuditContext(findings, auditLogs, pricingAudits) {
    const parts = [];
    parts.push(`Total audit entries: ${auditLogs.length}`);
    parts.push(`Total pricing audit entries: ${pricingAudits.length}`);
    parts.push(`Findings: ${findings.length} (High: ${findings.filter(f => f.severity >= 7).length}, Medium: ${findings.filter(f => f.severity >= 4 && f.severity < 7).length}, Low: ${findings.filter(f => f.severity < 4).length})`);

    const recentActions = auditLogs.slice(0, 20).map(l => `${l.action} on ${l.entity_type} (${l.created_at})`).join('\n');
    parts.push(`\nRecent Activity:\n${recentActions}`);

    return parts.join('\n');
  }

  _ruleBasedInvestigation(query, findings, auditLogs) {
    const q = query.toLowerCase();

    if (q.includes('override') || q.includes('pricing') || q.includes('margin')) {
      const overrides = findings.filter(f => f.type === 'large_override' || f.type === 'excessive_overrides' || f.type === 'margin_change_spike');
      if (overrides.length > 0) {
        return `**Pricing Investigation Results:**\n\n${overrides.map(f => `- **${f.title}**: ${f.description}`).join('\n')}`;
      }
      return 'No significant pricing anomalies found in the audit period.';
    }

    if (q.includes('integrity') || q.includes('tamper') || q.includes('hash') || q.includes('chain')) {
      const chainFindings = findings.filter(f => f.type === 'integrity_chain_break');
      if (chainFindings.length > 0) {
        return `**⚠ Integrity Chain Issues Found:**\n\n${chainFindings.map(f => `- ${f.description}`).join('\n')}\n\nInvestigate immediately.`;
      }
      return 'Audit integrity chain is intact. No tampering detected.';
    }

    if (q.includes('user') || q.includes('who') || q.includes('action')) {
      const actionTypes = [...new Set(auditLogs.map(l => l.action))];
      const topUsers = this._getTopUsers(auditLogs);
      return `**Activity Summary:**\n\nActions performed: ${actionTypes.join(', ')}\n\nMost Active Users:\n${topUsers.slice(0, 5).map(u => `- ${u.user}: ${u.count} actions`).join('\n')}`;
    }

    const sev7 = findings.filter(f => f.severity >= 7);
    if (sev7.length > 0) {
      return `**Audit Findings Summary:**\n\n${sev7.map(f => `- **${f.title}** (Severity: ${f.severity}/10): ${f.description}`).join('\n')}`;
    }

    return `**Audit Complete:** ${findings.length} findings (${findings.filter(f => f.severity >= 7).length} high, ${findings.filter(f => f.severity >= 4 && f.severity < 7).length} medium, ${findings.filter(f => f.severity < 4).length} low). Review the detailed findings for more information.`;
  }

  _getTopUsers(auditLogs) {
    const userCounts = {};
    for (const log of auditLogs) {
      const user = log.user_id || log.performed_by || 'system';
      userCounts[user] = (userCounts[user] || 0) + 1;
    }
    return Object.entries(userCounts)
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count);
  }
}

module.exports = AuditInvestigator;
