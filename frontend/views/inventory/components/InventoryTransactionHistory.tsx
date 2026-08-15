/**
 * Inventory Transaction History Component
 * 
 * Displays audit trail for inventory transactions including:
 * - All deductions (production consumption, sales, adjustments)
 * - All additions (purchases, returns, adjustments)
 * - Batch/lot tracking information
 * - User who performed each action
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useAuth } from '../../../context/AuthContext';
import { InventoryTransaction, MaterialBatch, WarehouseInventory } from '../../../types';
import { getDefaultDate } from '../../../utils/financialYearUtils';

interface InventoryTransactionHistoryProps {
  itemId?: string;
  warehouseId?: string;
  title?: string;
}

const InventoryTransactionHistory: React.FC<InventoryTransactionHistoryProps> = ({ 
  itemId, 
  warehouseId,
  title = 'Inventory Transaction History' 
}) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [itemId, warehouseId]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      // For now, load from local storage/IndexedDB via dbService
      // In production, this would call the API
      const stored = localStorage.getItem('inventoryTransactions');
      if (stored) {
        let txns = JSON.parse(stored) as InventoryTransaction[];
        
        // Apply filters
        if (itemId) {
          txns = txns.filter(t => t.itemId === itemId);
        }
        if (warehouseId) {
          txns = txns.filter(t => t.warehouseId === warehouseId);
        }
        if (filter !== 'ALL') {
          txns = txns.filter(t => t.type === filter);
        }
        
        // Sort by timestamp descending
        txns.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        setTransactions(txns);
      }
    } catch (error) {
      logger.error('[InventoryTransactionHistory] Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'IN':
        return 'bg-green-100 text-green-800';
      case 'OUT':
        return 'bg-red-100 text-red-800';
      case 'ADJUSTMENT':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatQuantity = (qty: number, type: string) => {
    if (type === 'OUT') {
      return `-${Math.abs(qty)}`;
    }
    return `+${qty}`;
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-MW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        
        {/* Filter Controls */}
        <div className="flex gap-2">
          {(['ALL', 'IN', 'OUT', 'ADJUSTMENT'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => {
                setFilter(filterType);
                // Reload with new filter
                setTimeout(loadTransactions, 0);
              }}
              className={`px-3 py-1 rounded text-sm ${
                filter === filterType 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filterType}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-sm text-blue-600">Total Transactions</div>
          <div className="text-2xl font-bold text-blue-800">{transactions.length}</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-sm text-green-600">Total In</div>
          <div className="text-2xl font-bold text-green-800">
            {transactions.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0)}
          </div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg">
          <div className="text-sm text-red-600">Total Out</div>
          <div className="text-2xl font-bold text-red-800">
            {Math.abs(transactions.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0))}
          </div>
        </div>
        <div className="bg-yellow-50 p-3 rounded-lg">
          <div className="text-sm text-yellow-600">Net Change</div>
          <div className="text-2xl font-bold text-yellow-800">
            {transactions.reduce((sum, t) => sum + t.quantity, 0)}
          </div>
        </div>
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No transactions found{itemId ? ' for this item' : ''}
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {transactions.map((tx) => (
            <div 
              key={tx.id}
              className="border rounded-lg overflow-hidden hover:shadow-sm transition-shadow"
            >
              <div 
                className="flex items-center justify-between p-3 cursor-pointer bg-gray-50"
                onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getTransactionTypeColor(tx.type)}`}>
                    {tx.type}
                  </span>
                  <span className="font-medium text-gray-800">
                    {formatQuantity(tx.quantity, tx.type)}
                  </span>
                  <span className="text-sm text-gray-600">
                    {tx.reason || 'No reason specified'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    {formatDate(tx.timestamp)}
                  </span>
                  <span className="text-sm text-gray-500">
                    by {tx.performedBy || 'system'}
                  </span>
                  <span className="text-gray-400">
                    {expandedTx === tx.id ? 'â–²' : 'â–¼'}
                  </span>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedTx === tx.id && (
                <div className="p-3 bg-white border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Transaction ID:</span>
                      <span className="ml-2 font-mono text-gray-700">{tx.id}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Reference:</span>
                      <span className="ml-2 text-gray-700">{tx.reference || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Previous Quantity:</span>
                      <span className="ml-2 text-gray-700">{tx.previousQuantity}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">New Quantity:</span>
                      <span className="ml-2 text-gray-700">{tx.newQuantity}</span>
                    </div>
                    {tx.unitCost && (
                      <div>
                        <span className="text-gray-500">Unit Cost:</span>
                        <span className="ml-2 text-gray-700" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>MWK {tx.unitCost.toFixed(2)}</span>
                      </div>
                    )}
                    {tx.totalCost && (
                      <div>
                        <span className="text-gray-500">Total Cost:</span>
                        <span className="ml-2 text-gray-700" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>MWK {Math.abs(tx.totalCost).toFixed(2)}</span>
                      </div>
                    )}
                    {tx.warehouseId && (
                      <div>
                        <span className="text-gray-500">Warehouse:</span>
                        <span className="ml-2 text-gray-700">{tx.warehouseId}</span>
                      </div>
                    )}
                    {tx.batchId && (
                      <div>
                        <span className="text-gray-500">Batch:</span>
                        <span className="ml-2 text-gray-700">{tx.batchId}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Export Button */}
      {transactions.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              const csv = [
                ['ID', 'Type', 'Quantity', 'Previous', 'New', 'Reason', 'Reference', 'Performed By', 'Timestamp'].join(','),
                ...transactions.map(t => [
                  t.id,
                  t.type,
                  t.quantity,
                  t.previousQuantity,
                  t.newQuantity,
                  `"${t.reason || ''}"`,
                  `"${t.reference || ''}"`,
                  t.performedBy || '',
                  t.timestamp
                ].join(','))
              ].join('\n');
              
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `inventory-transactions-${getDefaultDate()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Export to CSV
          </button>
        </div>
      )}
    </div>
  );
};

export default InventoryTransactionHistory;
