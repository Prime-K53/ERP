import React, { memo, useMemo } from 'react';
import { Package, DollarSign, Layers, AlertTriangle, XCircle, ShoppingCart, CheckCircle, Archive, Tags, Warehouse, TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useInventoryDashboard, type DashboardData } from '../hooks/useInventoryDashboard';
import type { Item } from '../../../../types';
import { useAuth } from '../../../../context/AuthContext';
import { currencyService } from '../../../../services/currencyService';

const KPI_ICONS: Record<string, React.ReactNode> = {
  'Total Items': <Package size={18} />,
  'Total Value': <DollarSign size={18} />,
  'Stock on Hand': <Layers size={18} />,
  'Low Stock': <AlertTriangle size={18} />,
  'Out of Stock': <XCircle size={18} />,
  'Reorder Required': <ShoppingCart size={18} />,
  'Active Items': <CheckCircle size={18} />,
  'Inactive Items': <Archive size={18} />,
  'Categories': <Tags size={18} />,
  'Warehouses': <Warehouse size={18} />,
};

const KpiCard: React.FC<{ kpi: DashboardData['kpis'][0] }> = memo(({ kpi }) => (
  <div className="kpi-card-dash" style={{ borderLeft: `3px solid ${kpi.color}` }}>
    <div className="kpi-card-icon" style={{ color: kpi.color, background: `${kpi.color}12` }}>
      {KPI_ICONS[kpi.label] || <BarChart3 size={18} />}
    </div>
    <div className="kpi-card-body">
      <div className="kpi-card-label">{kpi.label}</div>
      <div className="kpi-card-value">{kpi.value}</div>
      <div className="kpi-card-sub">{kpi.sub}</div>
    </div>
  </div>
));

KpiCard.displayName = 'KpiCard';

const chartColors = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip-dash">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="chart-tooltip-row">
          <span style={{ color: p.color }}>●</span> {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  );
};

interface InventoryDashboardProps {
  allItems: Item[];
  warehouses: { id: string; name: string }[];
  onViewItem?: (item: Item) => void;
}

export const InventoryDashboard: React.FC<InventoryDashboardProps> = ({ allItems, warehouses }) => {
  const { companyConfig } = useAuth();
  const currencySymbol = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const data = useInventoryDashboard(allItems, warehouses, currencySymbol);

  if (!data.kpis.length) {
    return (
      <div className="dashboard-empty-dash">
        <BarChart3 size={48} className="text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-600 mt-4">No Inventory Data</h3>
        <p className="text-sm text-slate-400 mt-1">Add items to see your dashboard metrics.</p>
      </div>
    );
  }

  const kpiRows = [
    data.kpis.slice(0, 5),
    data.kpis.slice(5, 10),
  ];

  return (
    <div className="dashboard-shell-dash">
      {/* 10 KPI Cards */}
      <div className="kpi-grid-dash">
        {data.kpis.map(kpi => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      {/* Charts Row */}
      <div className="charts-grid-dash">
        {/* Items by Category */}
        <ChartCard title="Items by Category" icon={<Package size={14} />}>
          <ResponsiveContainer width="100%" height={220} minHeight={220} minWidth={0}>
            <PieChart>
              <Pie data={data.categoryBreakdown.filter(c => c.items > 0)} dataKey="items" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {data.categoryBreakdown.filter(c => c.items > 0).map((entry, i) => (
                  <Cell key={entry.label} fill={entry.color} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#64748B' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Value by Category */}
        <ChartCard title="Inventory Value by Category" icon={<DollarSign size={14} />}>
          <ResponsiveContainer width="100%" height={220} minHeight={220} minWidth={0}>
            <BarChart data={data.valueBreakdown.filter(c => c.value > 0)} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.valueBreakdown.filter(c => c.value > 0).map((entry, i) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Monthly Stock Movement */}
        <ChartCard title="Monthly Stock Movement" icon={<Activity size={14} />}>
          {data.monthlyMovement.length === 0 ? (
            <div className="chart-placeholder-dash">Stock transaction data will appear here as inventory is adjusted.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220} minHeight={220} minWidth={0}>
              <LineChart data={data.monthlyMovement}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#64748B' }} />
                <Line type="monotone" dataKey="in" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} name="Stock In" />
                <Line type="monotone" dataKey="out" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} name="Stock Out" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Second Row: Warehouse + Turnover + Fast/Slow */}
      <div className="charts-grid-dash">
        <ChartCard title="Stock by Warehouse" icon={<Warehouse size={14} />}>
          {data.warehouseStock.length === 0 ? (
            <div className="chart-placeholder-dash">No warehouse data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200} minHeight={200} minWidth={0}>
              <BarChart data={data.warehouseStock} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="stock" radius={[0, 4, 4, 0]} fill="#2563EB" name="Stock Qty" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Inventory Turnover" icon={<TrendingUp size={14} />}>
          <div className="turnover-dash">
            <div className="turnover-value-dash">{data.turnover.toFixed(1)}x</div>
            <div className="turnover-label-dash">Annual Turns</div>
            <div className="turnover-bar-dash">
              <div className="turnover-bar-fill-dash" style={{ width: `${Math.min(100, data.turnover * 10)}%` }} />
            </div>
            <div className="turnover-sub-dash">
              {data.turnover < 2 ? 'Low turnover — review stock levels' :
               data.turnover < 6 ? 'Moderate turnover — healthy' :
               'High turnover — fast moving inventory'}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Fast vs Slow Moving" icon={<BarChart3 size={14} />}>
          <div className="fast-slow-dash">
            <div className="fs-item-dash">
              <div className="fs-value-dash" style={{ color: '#16A34A' }}>{data.fastMoving}</div>
              <div className="fs-label-dash">Fast Moving</div>
              <div className="fs-bar-dash"><div className="fs-bar-fill-dash" style={{ width: `${Math.min(100, (data.fastMoving / Math.max(1, data.fastMoving + data.slowMoving)) * 100)}%`, background: '#16A34A' }} /></div>
            </div>
            <div className="fs-item-dash">
              <div className="fs-value-dash" style={{ color: '#D97706' }}>{data.slowMoving}</div>
              <div className="fs-label-dash">Slow Moving</div>
              <div className="fs-bar-dash"><div className="fs-bar-fill-dash" style={{ width: `${Math.min(100, (data.slowMoving / Math.max(1, data.fastMoving + data.slowMoving)) * 100)}%`, background: '#D97706' }} /></div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

const ChartCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="chart-card-dash">
    <div className="chart-card-head-dash">{icon} {title}</div>
    <div className="chart-card-body-dash">{children}</div>
  </div>
);
