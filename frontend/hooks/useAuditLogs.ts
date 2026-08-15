import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuditLogEntry } from '../types';

export const useAuditLogs = () => {
  const { auditLogs = [], addAuditLog, user } = useAuth();

  const captureAudit = useCallback(async (
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'REVERSE' | 'RESTORE',
    entityType: string,
    entityId: string,
    details: string,
    oldValue?: any,
    newValue?: any,
    reason?: string
  ) => {
    const newEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      action,
      entityType,
      entityId,
      userId: user?.id || 'SYSTEM',
      userRole: user?.role || 'SYSTEM',
      details,
      oldValue,
      newValue,
      reason,
      correlationId: `cid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    };

    // Persist via AuthContext
    addAuditLog(newEntry);
    
    return newEntry;
  }, [user, addAuditLog]);

  const getFilteredLogs = useCallback((filter: {
    entityId?: string;
    entityType?: string;
    userId?: string;
    action?: string;
  }) => {
    return auditLogs.filter(log => {
      let matches = true;
      if (filter.entityId && log.entityId !== filter.entityId) matches = false;
      if (filter.entityType && log.entityType !== filter.entityType) matches = false;
      if (filter.userId && log.userId !== filter.userId) matches = false;
      if (filter.action && log.action !== filter.action) matches = false;
      return matches;
    });
  }, [auditLogs]);

  return {
    auditLogs,
    captureAudit,
    getFilteredLogs
  };
};
