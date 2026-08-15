import React, { useEffect, useMemo } from 'react';
import { useVatStore } from '../../stores/vatStore';
import { useAuth } from '../../context/AuthContext';
import { currencyService } from '../../services/currencyService';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Activity,
    ArrowUpRight, ArrowDownRight, FileText
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

export const VatDashboard: React.FC = () => {
    const { transactions, returns, fetchVatData, isLoading } = useVatStore();
    const { companyConfig } = useAuth();
    const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

    useEffect(() => { fetchVatData(); }, []);

    const stats = useMemo(() => {
        const currentMonth = new Date();
        const start = startOfMonth(currentMonth).toISOString();
        const end = endOfMonth(currentMonth).toISOString();
        const currentTx = transactions.filter(t => t.date >= start && t.date <= end);
        const inputTax = currentTx.filter(t => t.type === 'Input').reduce((sum, t) => sum + t.amount, 0);
        const outputTax = currentTx.filter(t => t.type === 'Output').reduce((sum, t) => sum + t.amount, 0);
        return { inputTax, outputTax, net: outputTax - inputTax, count: currentTx.length };
    }, [transactions]);

    const chartData = useMemo(() => {
        const end = new Date();
        const start = subMonths(end, 6);
        return eachMonthOfInterval({ start, end }).map(date => {
            const monthStart = startOfMonth(date).toISOString();
            const monthEnd = endOfMonth(date).toISOString();
            const monthTx = transactions.filter(t => t.date >= monthStart && t.date <= monthEnd);
            const input = monthTx.filter(t => t.type === 'Input').reduce((sum, t) => sum + t.amount, 0);
            const output = monthTx.filter(t => t.type === 'Output').reduce((sum, t) => sum + t.amount, 0);
            return { name: format(date, 'MMM'), Input: input, Output: output, Net: output - input };
        });
    }, [transactions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="prime-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                    { label: 'Output tax (sales)', value: stats.outputTax, color: t[500], borderColor: t[500], bg: t[50], icon: <ArrowUpRight size={20} />, sub: 'Current month', subColor: t[500] },
                    { label: 'Input tax (purchases)', value: stats.inputTax, color: '#b5493f', borderColor: '#b5493f', bg: '#fef0ee', icon: <ArrowDownRight size={20} />, sub: 'Current month', subColor: '#b5493f' },
                    { label: 'Net payable', value: Math.abs(stats.net), color: ink, borderColor: '#d99a3f', bg: amber[100], icon: <DollarSign size={20} />, sub: stats.net >= 0 ? 'To pay' : 'Refundable', subColor: stats.net >= 0 ? inkSoft : t[500] },
                ].map((card, i) => (
                    <div key={i} className="prime-card" style={{
                        background: paper, padding: '12px 16px', borderRadius: 14,
                        border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 16,
                        borderLeft: `4px solid ${card.borderColor}`, transition: 'all .15s ease'
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; }}
                    >
                        <div style={{ padding: 10, background: card.bg, color: card.color, borderRadius: 8 }}>{card.icon}</div>
                        <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px' }}>{card.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{currency} {card.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p style={{ fontSize: 10, color: card.subColor, margin: '2px 0 0' }}>{card.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }}>
                <div className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={20} color={inkSoft} /> VAT liability trend (6 months)
                    </h3>
                    <div style={{ width: '100%', height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={hairline} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: inkSoft }} />
                                <YAxis tick={{ fontSize: 12, fill: inkSoft }} />
                                <Tooltip formatter={(value: number) => [`${currency} ${value.toLocaleString()}`, '']} />
                                <Legend />
                                <Bar dataKey="Output" fill={t[500]} name="Output tax" />
                                <Bar dataKey="Input" fill="#b5493f" name="Input tax" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={20} color={inkSoft} /> Recent returns
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {returns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 32, color: inkSoft }}>No returns generated yet</div>
                        ) : returns.slice(0, 5).map(ret => (
                            <div key={ret.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: 12, border: `1px solid ${hairline}`, borderRadius: 10,
                                transition: 'all .15s ease'
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div>
                                    <p style={{ fontWeight: 600, color: ink, margin: 0 }}>{format(parseISO(ret.periodStart), 'MMM yyyy')}</p>
                                    <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{ret.status} - {format(parseISO(ret.periodEnd), 'dd MMM')}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontWeight: 700, fontSize: 13, color: ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        {currency} {ret.netPayable.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
