import React, { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Calendar, ChevronDown, RefreshCw, AlertCircle, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useOrders } from '../../context/OrdersContext';
import { useExamination } from '../../context/ExaminationContext';
import { currencyService } from '../../services/currencyService';
import { buildRevenueReportingSnapshot } from '../../services/revenueReportingService';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year',
};

const periodStart = (period: Period): Date => {
  const now = new Date();
  switch (period) {
    case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; }
    case 'month': { return new Date(now.getFullYear(), now.getMonth(), 1); }
    case 'quarter': { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
    case 'year': { return new Date(now.getFullYear(), 0, 1); }
  }
};

const fmt = (n: number, currency = '$') =>
  `${n >= 0 ? '' : '-'}${currency}${Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RoundingAnalytics: React.FC = () => {
  const { companyConfig } = useAuth();
  const { sales = [], isLoading } = useSales();
  const { invoices = [] } = useFinance();
  const { orders = [] } = useOrders();
  const { batches: examinationBatches = [] } = useExamination();

  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const [period, setPeriod] = useState<Period>('week');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);

  const periodDateRange = useMemo((): 'week' | 'month' | 'quarter' | 'year' | 'all' => {
    if (period === 'today') return 'week';
    return period;
  }, [period]);

  const revenueSnapshot = useMemo(() => buildRevenueReportingSnapshot({
    sales, invoices, orders, batches: examinationBatches,
    dateRange: periodDateRange, trendDays: 7,
  }), [sales, invoices, orders, examinationBatches, periodDateRange]);

  const filtered = useMemo(() => {
    const start = periodStart(period);
    if (period === 'today') return revenueSnapshot.lines.filter(line => new Date(line.date) >= start);
    return revenueSnapshot.lines;
  }, [revenueSnapshot.lines, period]);

  const stats = useMemo(() => {
    let totalRounding = 0, gainCount = 0, lossCount = 0, zeroCount = 0;
    let totalRoundedItems = 0, totalItems = 0;
    const methodMap: Record<string, { method: string; total: number; count: number; gain: number; loss: number }> = {};
    const productMap: Record<string, { name: string; total: number; count: number; revenue: number }> = {};
    const dailyMap: Record<string, { gain: number; loss: number; net: number }> = {};
    const recentRoundings: Array<{ saleId: string; date: string; product: string; amount: number; method: string; source: string }> = [];

    for (const line of filtered) {
      const day = String(line.date || '').slice(0, 10);
      if (!day) continue;
      if (!dailyMap[day]) dailyMap[day] = { gain: 0, loss: 0, net: 0 };

      const itemRounding = line.roundingTotal;
      const qty = line.quantity || 1;

      totalItems += qty;
      if (Math.abs(itemRounding) > 0.001) totalRoundedItems += qty;

      if (itemRounding > 0.001) gainCount++;
      else if (itemRounding < -0.001) lossCount++;
      else zeroCount++;

      totalRounding += itemRounding;
      dailyMap[day].net += itemRounding;
      if (itemRounding > 0) dailyMap[day].gain += itemRounding;
      else if (itemRounding < 0) dailyMap[day].loss += Math.abs(itemRounding);

      const method = line.source === 'POS' ? 'POS SmartPricing' :
        line.source === 'EXAMINATION' ? 'Examination' : 'Invoice';
      if (!methodMap[method]) methodMap[method] = { method, total: 0, count: 0, gain: 0, loss: 0 };
      methodMap[method].total += itemRounding;
      methodMap[method].count += qty;
      if (itemRounding > 0) methodMap[method].gain += itemRounding;
      else methodMap[method].loss += Math.abs(itemRounding);

      const pid = line.itemId || line.itemName || 'Unknown';
      const pname = line.itemName || pid;
      if (!productMap[pid]) productMap[pid] = { name: pname, total: 0, count: 0, revenue: 0 };
      productMap[pid].total += itemRounding;
      productMap[pid].count += qty;
      productMap[pid].revenue += line.revenue;

      if (Math.abs(itemRounding) > 0.001) {
        recentRoundings.push({ saleId: line.transactionNumber, date: line.date, product: pname, amount: itemRounding, method, source: line.source });
      }
    }

    const methods = Object.values(methodMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const topProducts = Object.values(productMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 8);
    const dailyTrend = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([date, v]) => ({ date, ...v }));
    const roundingRate = totalItems > 0 ? (totalRoundedItems / totalItems) * 100 : 0;
    const recent = recentRoundings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);

    return { totalRounding, gainCount, lossCount, zeroCount, roundingRate, methods, topProducts, dailyTrend, recent, totalItems };
  }, [filtered]);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
      <RefreshCw style={{ width: 24, height: 24, color: teal[500], animation: 'spin 1s linear infinite' }} />
      <span style={{ marginLeft: 12, color: inkSoft, fontSize: 13 }}>Loading rounding data…</span>
    </div>
  );

  const maxDaily = Math.max(...stats.dailyTrend.map(d => Math.max(d.gain, d.loss, 0.01)));

  return (
    <div style={{ minHeight: '100vh', background: paper, padding: 24, fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink, display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.02 }}>Rounding Analytics</h1>
          <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Track price rounding gains and losses across all SmartPricing sales</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowPeriodMenu(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 12, fontSize: 13, fontWeight: 500, color: inkSoft, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
            <Calendar style={{ width: 16, height: 16, color: inkSoft }} />
            {PERIOD_LABELS[period]}
            <ChevronDown style={{ width: 14, height: 14, color: inkSoft }} />
          </button>
          {showPeriodMenu && (
            <div style={{ position: 'absolute', right: 0, top: 44, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 20, overflow: 'hidden', minWidth: 140 }}>
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', fontSize: 13, border: 'none', background: p === period ? teal[50] : 'transparent', color: p === period ? teal[700] : inkSoft, cursor: 'pointer', fontWeight: p === period ? 500 : 400 }}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: amber[100], border: `1.4px solid ${amber[300]}`, borderRadius: 14, color: amber[500], fontSize: 13 }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          No posted revenue records (POS, Invoices, Examination) for {PERIOD_LABELS[period].toLowerCase()}. Rounding data appears once transactions are recorded.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { label: 'Net Rounding', value: fmt(stats.totalRounding, currency), sub: stats.totalRounding >= 0 ? 'Net gain from rounding' : 'Net loss from rounding', Icon: stats.totalRounding >= 0 ? ArrowUpRight : ArrowDownRight, borderColor: stats.totalRounding >= 0 ? teal[500] : danger, iconBg: stats.totalRounding >= 0 ? teal[50] : `${danger}15`, iconColor: stats.totalRounding >= 0 ? teal[500] : danger },
          { label: 'Items Rounded Up', value: stats.gainCount.toLocaleString(), sub: 'Price rounded upward', Icon: ArrowUpRight, borderColor: teal[500], iconBg: teal[50], iconColor: teal[500] },
          { label: 'Items Rounded Down', value: stats.lossCount.toLocaleString(), sub: 'Price rounded downward', Icon: ArrowDownRight, borderColor: danger, iconBg: `${danger}15`, iconColor: danger },
          { label: 'Rounding Rate', value: `${stats.roundingRate.toFixed(1)}%`, sub: `of ${stats.totalItems.toLocaleString()} items affected`, Icon: Zap, borderColor: amber[500], iconBg: amber[100], iconColor: amber[500] },
        ].map(card => (
          <div key={card.label} style={{ background: paper, padding: '12px 16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${card.borderColor}`, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ padding: 10, borderRadius: 9, background: card.iconBg, color: card.iconColor, flexShrink: 0 }}>
              <card.Icon size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: -0.01, margin: '0 0 4px' }}>{card.label}</p>
              <p style={{ fontSize: 18, fontWeight: 600, color: ink, margin: 0 }}>{card.value}</p>
              <p style={{ fontSize: 10, color: inkSoft, margin: '2px 0 0' }}>{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: '0 0 16px' }}>Daily Rounding: Gain vs Loss</h3>
          {stats.dailyTrend.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.dailyTrend.map(day => (
                <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: inkSoft, width: 80, flexShrink: 0 }}>
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {day.gain > 0 && <div style={{ background: teal[200], borderRadius: 3, height: 6, width: `${(day.gain / maxDaily) * 100}%`, minWidth: 4 }} title={`Gain: ${fmt(day.gain, currency)}`} />}
                    {day.loss > 0 && <div style={{ background: `${danger}55`, borderRadius: 3, height: 6, width: `${(day.loss / maxDaily) * 100}%`, minWidth: 4 }} title={`Loss: ${fmt(day.loss, currency)}`} />}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, width: 64, textAlign: 'right', color: day.net >= 0 ? teal[600] : danger }}>
                    {fmt(day.net, currency)}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingTop: 8, borderTop: `1.4px solid ${teal[100]}`, fontSize: 11, color: inkSoft }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 6, borderRadius: 3, background: teal[200], display: 'inline-block' }} /> Gain</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 6, borderRadius: 3, background: `${danger}55`, display: 'inline-block' }} /> Loss</span>
              </div>
            </div>
          ) : <p style={{ fontSize: 13, color: inkSoft, fontStyle: 'italic', margin: 0 }}>No trend data yet.</p>}
        </div>
        <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: '0 0 16px' }}>By Rounding Method</h3>
          {stats.methods.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stats.methods.map(m => {
                const maxM = Math.abs(stats.methods[0]?.total || 1);
                const isGain = m.total >= 0;
                return (
                  <div key={m.method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, color: ink }}>{m.method}</span>
                      <span style={{ fontWeight: 600, color: isGain ? teal[600] : danger }}>{fmt(m.total, currency)}</span>
                    </div>
                    <div style={{ height: 6, background: teal[50], borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: isGain ? teal[200] : `${danger}55`, width: `${(Math.abs(m.total) / maxM) * 100}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: inkSoft, marginTop: 2, display: 'flex', gap: 8 }}>
                      <span>{m.count} items</span>
                      {m.gain > 0 && <span style={{ color: teal[500] }}>+{fmt(m.gain, currency)} gain</span>}
                      {m.loss > 0 && <span style={{ color: danger }}>-{fmt(m.loss, currency)} loss</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p style={{ fontSize: 13, color: inkSoft, fontStyle: 'italic', margin: 0 }}>No rounding method data captured yet.</p>}
        </div>
      </div>

      <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1.4px solid ${teal[100]}` }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0 }}>Top Products by Rounding Impact</h3>
        </div>
        {stats.topProducts.length > 0 ? (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1.4px solid ${teal[50]}`, fontSize: 11, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>
                {['Product', 'Units', 'Revenue', 'Total Rounding', 'Rounding %', 'Impact'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody style={{ borderCollapse: 'collapse' }}>
              {stats.topProducts.map((p, i) => {
                const rpct = p.revenue > 0 ? (p.total / p.revenue) * 100 : 0;
                const isGain = p.total >= 0;
                return (
                  <tr key={p.name} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 20px', fontWeight: 500, color: ink }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: teal[50], color: teal[700], fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                        {p.name}
                      </span>
                    </td>
                    <td style={{ padding: '10px 20px', color: inkSoft }}>{p.count}</td>
                    <td style={{ padding: '10px 20px', color: inkSoft }}>{fmt(p.revenue, currency)}</td>
                    <td style={{ padding: '10px 20px', fontWeight: 600, color: isGain ? teal[600] : danger }}>{fmt(p.total, currency)}</td>
                    <td style={{ padding: '10px 20px', color: inkSoft }}>{Math.abs(rpct).toFixed(2)}%</td>
                    <td style={{ padding: '10px 20px' }}>
                      {isGain
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: teal[600], fontWeight: 500 }}><ArrowUpRight style={{ width: 12, height: 12 }} /> Gain</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: danger, fontWeight: 500 }}><ArrowDownRight style={{ width: 12, height: 12 }} /> Loss</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div style={{ padding: '24px 20px', textAlign: 'center', color: inkSoft, fontSize: 13 }}>No product rounding data for this period.</div>}
      </div>

      {stats.recent.length > 0 && (
        <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1.4px solid ${teal[100]}` }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0 }}>Recent Rounding Events</h3>
          </div>
          <div>
            {stats.recent.map((r, i) => (
              <div key={i} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1.4px solid ${teal[50]}` }}
                onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.amount >= 0 ? teal[50] : `${danger}15` }}>
                    {r.amount >= 0 ? <ArrowUpRight style={{ width: 14, height: 14, color: teal[600] }} /> : <ArrowDownRight style={{ width: 14, height: 14, color: danger }} />}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: ink }}>{r.product}</div>
                    <div style={{ fontSize: 11, color: inkSoft }}>
                      {new Date(r.date).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {r.method !== 'Unknown' && <span style={{ marginLeft: 8, color: inkSoft }}>· {r.method}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: r.amount >= 0 ? teal[600] : danger }}>
                  {r.amount >= 0 ? '+' : ''}{fmt(r.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoundingAnalytics;