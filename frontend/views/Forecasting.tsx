import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Package, Calendar, ArrowRight, BarChart3, Wallet, ArrowUpCircle, ArrowDownCircle, Coins, Calculator } from 'lucide-react';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useSales } from '../context/SalesContext';
import { useInventory } from '../context/InventoryContext';
import { useFinance } from '../context/FinanceContext';
import { useProduction } from '../context/ProductionContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { Item, Invoice, Purchase } from '../types';
import ProductForecastDetail from './inventory/components/ProductForecastDetail';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, startOfDay, isBefore, isAfter, subDays } from 'date-fns';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart
} from 'recharts';
import { analyzeForecastingData } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { generateNextId } from '../utils/helpers';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const Forecasting: React.FC = () => {
  const { companyConfig, notify } = useAuth();
  const { sales } = useSales();
  const { inventory, purchases, addPurchase } = useInventory();
  const { batches, boms } = useProduction();
  const { invoices, expenses, ledger, accounts } = useFinance();
  const { refreshAllData } = useData();
  
  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const currency = companyConfig.currencySymbol;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // View State
  const [activeTab, setActiveTab] = useState<'Inventory' | 'CashFlow'>('Inventory');
  const [selectedForecastItem, setSelectedForecastItem] = useState<Item | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiAnalysis = async () => {
    setIsAiLoading(true);
    try {
        const dataToAnalyze = activeTab === 'Inventory' 
            ? inventoryForecast.slice(0, 15) // Limit to top 15 critical items
            : cashFlowForecast.timeline.filter((_, i) => i % 7 === 0); // Weekly snapshots
        
        const result = await analyzeForecastingData(activeTab, dataToAnalyze);
        setAiAnalysis(result);
    } catch (error) {
        notify("Failed to analyze data", "error");
    } finally {
        setIsAiLoading(false);
    }
  };

  useEffect(() => {
    setAiAnalysis(null); // Reset analysis when tab changes
  }, [activeTab]);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'cashflow') setActiveTab('CashFlow');
    else if (tab === 'inventory') setActiveTab('Inventory');
  }, [searchParams]);

  // --- Cash Flow Forecast Logic ---
  const cashFlowForecast = useMemo(() => {
    const today = startOfDay(new Date());
    const projectionDays = 90;
    const timeline = Array.from({ length: projectionDays }).map((_, i) => {
        const date = addDays(today, i);
        return {
            date: format(date, 'yyyy-MM-dd'),
            label: format(date, 'MMM dd'),
            inflow: 0,
            outflow: 0,
            balance: 0
        };
    });

    // 1. Starting Cash Balance
    const gl = companyConfig?.glMapping;
    const cashAccCodes = [gl?.cashDrawerAccount || '1000', gl?.bankAccount || '1050'];
    const cashAccs = (accounts || []).filter(a => cashAccCodes.includes(a.code) || cashAccCodes.includes(a.id));
    const cashAccIds = cashAccs.map(a => a.id);
    
    let currentCash = 0;
    ledger.forEach(entry => {
        const isDebitCash = cashAccIds.includes(entry.debitAccountId);
        const isCreditCash = cashAccIds.includes(entry.creditAccountId);
        if (isDebitCash) currentCash += entry.amount;
        if (isCreditCash) currentCash -= entry.amount;
    });

    // 2. Expected Inflows (AR)
    (invoices || []).filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled').forEach(inv => {
        const dueDate = startOfDay(new Date(inv.dueDate));
        const diff = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        const amount = inv.totalAmount - (inv.paidAmount || 0);
        
        if (diff < projectionDays) {
            timeline[diff].inflow += amount;
        } else {
            // For long-term, put at the end for now
            timeline[projectionDays - 1].inflow += amount;
        }
    });

    // 3. Expected Outflows (AP & Purchases)
    (purchases || []).filter(p => p.status !== 'Paid' && p.status !== 'Cancelled').forEach(p => {
        const dueDate = startOfDay(new Date(p.date)); // Assume 30 day terms if no due date
        dueDate.setDate(dueDate.getDate() + 30);
        const diff = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        const amount = p.total - (p.paidAmount || 0);
        
        if (diff < projectionDays) {
            timeline[diff].outflow += amount;
        }
    });

    // 4. Recurring Monthly Expenses (Average of last 3 months)
    const threeMonthsAgo = subDays(today, 90);
    const recentExpenses = (expenses || []).filter(e => isAfter(new Date(e.date), threeMonthsAgo));
    const avgDailyExpense = recentExpenses.reduce((sum, e) => sum + e.amount, 0) / 90;

    // Calculate Running Balance
    let runningBalance = currentCash;
    timeline.forEach(day => {
        day.outflow += avgDailyExpense; // Add recurring daily burn
        runningBalance = runningBalance + day.inflow - day.outflow;
        day.balance = runningBalance;
    });

    return {
        timeline,
        currentCash,
        totalInflow: timeline.reduce((s, d) => s + d.inflow, 0),
        totalOutflow: timeline.reduce((s, d) => s + d.outflow, 0),
        minBalance: Math.min(...timeline.map(d => d.balance)),
        riskDay: timeline.find(d => d.balance < 0)
    };
  }, [ledger, invoices, purchases, expenses, accounts, companyConfig]);

  // --- List View Helpers ---
  const getForecastData = (item: any) => {
    // 1. Calculate total usage in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let usage = 0;

    if (item.type === 'Product') {
      // Products consumed by Sales
      const recentSales = sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
      usage = recentSales.reduce((sum, sale) => {
        const lineItem = sale.items.find(i => i.id === item.id);
        return sum + (lineItem ? lineItem.quantity : 0);
      }, 0);
    } else {
      // Materials consumed by Production Batches
      const recentBatches = batches.filter(b => new Date(b.date) >= thirtyDaysAgo);
      usage = recentBatches.reduce((sum, batch) => {
        const bom = boms.find(b => b.id === batch.bomId);
        if (!bom) return sum;
        const component = bom.components.find(c => c.materialId === item.id);
        return sum + (component ? (component.quantity * batch.quantityProduced) : 0);
      }, 0);
    }

    // Accurate usage calc
    const dailyUsage = usage / 30;
    const daysUntilStockout = dailyUsage > 0 ? item.stock / dailyUsage : 999;
    const suggestedReorder = dailyUsage * 14; // Suggest 2 weeks of stock

    return { dailyUsage, daysUntilStockout, suggestedReorder };
  };

  const inventoryForecast = useMemo(() => {
    return inventory.map(item => ({
      ...item,
      ...getForecastData(item)
    })).sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [inventory, sales, batches, boms]);

  // --- Handlers ---
  const handleCreatePO = (item: Item) => {
      // Quick PO creation logic
      const id = generateNextId('PO', purchases, companyConfig);
      addPurchase({
          id,
          date: new Date().toISOString(),
          supplierId: 'SUP-0001', // Default or prompt user
          items: [{ itemId: item.id, name: item.name, quantity: 100, cost: item.cost || 0, receivedQty: 0 }],
          total: (item.cost || 0) * 100,
          status: 'Draft'
      });
      navigate('/purchases');
  };

  // --- Render Detail View ---
  if (selectedForecastItem) {
      return (
          <ProductForecastDetail 
              item={selectedForecastItem}
              salesHistory={sales}
              purchaseHistory={purchases}
              onBack={() => setSelectedForecastItem(null)}
              onCreatePO={handleCreatePO}
          />
      );
  }

  // --- Render List View ---
  return (
    <div style={{ padding: '24px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp style={{ color: '#1f8577' }} size={20} />
            Forecasting & Analytics Hub
          </h1>
          <p style={{ fontSize: '11px', color: '#5c6567', marginTop: '2px' }}>Predictive engines for stock replenishment and financial liquidity</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
                onClick={handleAiAnalysis}
                disabled={isAiLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px', paddingTop: '8px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#23282A', transition: 'all .15s ease', boxShadow: '0 1px 2px rgba(0,0,0,.05)', paddingRight: '16px', paddingBottom: '8px' }}
            >
                {isAiLoading ? <TrendingUp style={{ animation: 'spin 1s linear infinite', color: '#1f8577' }} size={14} /> : <BarChart3 style={{ color: '#1f8577' }} size={14} />}
                {aiAnalysis ? 'Update AI Insight' : 'Get AI Forecast'}
            </button>
            <div style={{ borderStyle: 'solid', borderColor: '#e4ddd1', background: '#FEFDFB', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', paddingLeft: '24px', paddingRight: '24px' }}>
                <button 
                    onClick={() => setActiveTab('Inventory')}
                    className={`py-3 text-[13px] font-bold transition-all border-b-2 relative ${activeTab === 'Inventory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Package size={14} style={{ display: 'inline', marginRight: '6px' }}/> Inventory
                </button>
                <button 
                    onClick={() => setActiveTab('CashFlow')}
                    className={`py-3 text-[13px] font-bold transition-all border-b-2 relative ${activeTab === 'CashFlow' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Wallet size={14} style={{ display: 'inline', marginRight: '6px' }}/> Cash Flow
                </button>
              </div>
            </div>
        </div>
      </div>

      {aiAnalysis && (
        <div style={{ marginBottom: '24px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transitionDuration: '500ms', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px', position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#FEFDFB', boxShadow: '0 1px 2px rgba(0,0,0,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.4px solid #e4ddd1', borderColor: '#d3ece9' }}>
                    <TrendingUp style={{ color: '#1f8577' }} size={16} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em' }}>AI Strategic Forecast Insight</h3>
                        <button onClick={() => setAiAnalysis(null)} style={{ color: '#3fa294', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                            <AlertTriangle size={14} />
                        </button>
                    </div>
                    <div style={{ maxWidth: 'none', fontWeight: 500 }}>
                        <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'Inventory' ? (
          <div className="animate-fadeIn">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#b5493f', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#fef2f2', color: '#b5493f', borderRadius: '10px' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Critical Stock Alerts</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{inventoryForecast.filter(i => i.daysUntilStockout < 7).length} <span style={{ fontSize: '11px', fontWeight: 600, color: '#5c6567' }}>Items</span></p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>Will run out within 7 days</p>
                </div>
              </div>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
                  <Package size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Avg. Daily Consumption</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{(inventoryForecast.reduce((sum, i) => sum + (i.dailyUsage || 0), 0) || 0).toFixed(1)} <span style={{ fontSize: '11px', fontWeight: 600, color: '#5c6567' }}>units/day</span></p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>Across all product lines</p>
                </div>
              </div>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
                  <BarChart3 size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Est. Reorder Value</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{currency}{(inventoryForecast.reduce((sum, i) => sum + ((i.suggestedReorder || 0) * (i.price || 0)), 0) || 0).toFixed(0)}</p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>To maintain 14-day buffer</p>
                </div>
              </div>
            </div>

            <div style={{ background: '#FEFDFB', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', overflow: 'hidden' }}>
              <div style={{ padding: '16px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6' }}>
                <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px' }}>Replenishment Recommendations</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', fontSize: '13px' }}>
                  <thead style={{ background: '#eef7f6', color: '#5c6567', fontWeight: 500, borderStyle: 'solid', borderColor: '#e4ddd1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <tr>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', paddingRight: '24px', paddingBottom: '16px' }}>Item</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', paddingRight: '24px', paddingBottom: '16px' }}>Current Stock</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', paddingRight: '24px', paddingBottom: '16px' }}>Avg. Daily Usage</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', paddingRight: '24px', paddingBottom: '16px' }}>Days Remaining</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', paddingRight: '24px', paddingBottom: '16px' }}>Suggested Order</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'right', paddingRight: '24px', paddingBottom: '16px' }}>Status</th>
                      <th style={{ paddingLeft: '24px', paddingTop: '16px', paddingRight: '24px', paddingBottom: '16px' }}></th>
                    </tr>
                  </thead>
                  <tbody style={{ borderColor: '#e4ddd1' }}>
                    {inventoryForecast.map((item) => (
                      <tr 
                          key={item.id} 
                          style={{ cursor: 'pointer', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}
                          onClick={() => setSelectedForecastItem(item)}
                      >
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', paddingRight: '24px', paddingBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                              <Package size={16} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#23282A', fontSize: '13px' }}>{item.name}</div>
                              <div style={{ color: '#5c6567' }}>{item.sku}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', fontWeight: 500, paddingRight: '24px', paddingBottom: '16px' }}>{item.stock}</td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', color: '#5c6567', paddingRight: '24px', paddingBottom: '16px' }}>{(item.dailyUsage || 0).toFixed(2)} / day</td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', paddingRight: '24px', paddingBottom: '16px' }}>
                          <span className={`font-bold text-xs ${item.daysUntilStockout < 7 ? 'text-red-600' : item.daysUntilStockout < 14 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {item.daysUntilStockout > 365 ? '> 1 Year' : `${(item.daysUntilStockout || 0).toFixed(0)} Days`}
                          </span>
                        </td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'center', fontWeight: 700, color: '#1f8577', paddingRight: '24px', paddingBottom: '16px' }}>
                          +{(item.suggestedReorder || 0).toFixed(0)}
                        </td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'right', paddingRight: '24px', paddingBottom: '16px' }}>
                          {item.daysUntilStockout < 7 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', paddingLeft: '8px', paddingTop: '4px', borderRadius: '9999px', background: '#fee2e2', color: '#b5493f', fontWeight: 700, paddingRight: '8px', paddingBottom: '4px' }}>
                              <AlertTriangle size={10} /> Critical
                            </span>
                          ) : item.daysUntilStockout < 14 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', paddingLeft: '8px', paddingTop: '4px', borderRadius: '9999px', background: '#fbead0', color: '#b97e2b', fontWeight: 700, paddingRight: '8px', paddingBottom: '4px' }}>
                              Low Stock
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', paddingLeft: '8px', paddingTop: '4px', borderRadius: '9999px', background: '#d3ece9', color: '#0f544c', fontWeight: 700, paddingRight: '8px', paddingBottom: '4px' }}>
                              Healthy
                            </span>
                          )}
                        </td>
                        <td style={{ paddingLeft: '24px', paddingTop: '16px', textAlign: 'right', paddingRight: '24px', paddingBottom: '16px' }}>
                            <div style={{ color: '#1f8577', opacity: 0.0, transition: 'opacity .15s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontWeight: 700, fontSize: '11px' }}>
                                Forecast <BarChart3 size={14}/>
                            </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px' }}>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
                  <Coins size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Available Cash</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{currency}{cashFlowForecast.currentCash.toLocaleString()}</p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>Ledger balance today</p>
                </div>
              </div>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
                  <ArrowUpCircle size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Est. Inflows (90d)</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>+{currency}{cashFlowForecast.totalInflow.toLocaleString()}</p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>Pending Invoices</p>
                </div>
              </div>
              <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#b5493f', transition: 'all .15s ease' }}>
                <div style={{ padding: '10px', background: '#fef2f2', color: '#b5493f', borderRadius: '10px' }}>
                  <ArrowDownCircle size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Est. Outflows (90d)</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>-{currency}{cashFlowForecast.totalOutflow.toLocaleString()}</p>
                  <p style={{ color: '#5c6567', marginTop: '2px' }}>AP & Fixed Costs</p>
                </div>
              </div>
              <div className={`bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 hover:bg-slate-50 transition-all ${cashFlowForecast.minBalance < 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
                <div className={`p-2.5 rounded-lg ${cashFlowForecast.minBalance < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <BarChart3 size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Projected Liquidity</p>
                  <p className={`text-lg md:text-xl font-semibold finance-nums ${cashFlowForecast.minBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{currency}{cashFlowForecast.minBalance.toLocaleString()}</p>
                  <p className={`text-[10px] mt-0.5 ${cashFlowForecast.minBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{cashFlowForecast.minBalance < 0 ? `Risk: Deficit on ${cashFlowForecast.riskDay?.label}` : 'Safe operating margin'}</p>
                </div>
              </div>
            </div>

            <div style={{ background: '#FEFDFB', padding: '32px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ fontWeight: 900, color: '#23282A', textTransform: 'uppercase', letterSpacing: '-.05em', fontSize: '16px' }}>90-Day Cash Runway</h3>
                        <p style={{ fontSize: '11px', color: '#5c6567' }}>Includes current cash, AR, AP, and historical burn rate</p>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#eef7f6' }}></div> Balance</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3' }}></div> Daily Inflow</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#fef2f2', border: '1.4px solid #e4ddd1', borderStyle: 'solid' }}></div> Daily Outflow</div>
                    </div>
                </div>
                <div style={{ width: '100%', height: 400, minHeight: 150 }}>
                    <ResponsiveContainer key="cashflow-chart-container" width="100%" height="100%" minHeight={150} minWidth={0}>
                        <ComposedChart data={cashFlowForecast.timeline}>
                            <defs>
                                <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="label" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#94a3b8'}}
                                minTickGap={30}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#94a3b8'}}
                                tickFormatter={(val) => `${currency}${val / 1000}k`}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                formatter={(val: number) => [currency + val.toLocaleString(), '']}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#3b82f6" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorBal)" 
                            />
                            <Bar dataKey="inflow" fill="#10b981" opacity={0.3} radius={[2, 2, 0, 0]} />
                            <Bar dataKey="outflow" fill="#ef4444" opacity={0.3} radius={[2, 2, 0, 0]} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px' }}>
                <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '16px' }}>Inflow Drivers</h4>
                    <div style={{ marginTop: '16px' }}>
                        {(invoices || []).filter(i => i.status !== 'Paid').slice(0, 5).map(inv => (
                            <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 700, color: '#23282A' }}>{inv.customerName}</span>
                                    <span style={{ color: '#5c6567' }}>Due {format(new Date(inv.dueDate), 'MMM dd')}</span>
                                </div>
                                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, color: '#1f8577' }}>+{currency}{(inv.totalAmount - (inv.paidAmount || 0)).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '16px' }}>Outflow Drivers</h4>
                    <div style={{ marginTop: '16px' }}>
                        {(purchases || []).filter(p => p.status !== 'Paid').slice(0, 5).map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 700, color: '#23282A' }}>Supplier: {p.supplierId}</span>
                                    <span style={{ color: '#5c6567' }}>Ref: {p.id}</span>
                                </div>
                                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, color: '#b5493f' }}>-{currency}{(p.total - (p.paidAmount || 0)).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Forecasting;
