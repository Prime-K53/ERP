import React, { useState } from 'react';
import { logger } from '@/services/logger';
import { ShieldCheck, Activity, TrendingUp, AlertTriangle, FileText, Sparkles, RefreshCw, Printer, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { generateBusinessHealthReport } from '../../services/geminiService';
import ReactMarkdown from 'react-markdown';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const btn: React.CSSProperties = { fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, borderRadius: 9, cursor: 'pointer', border: `1.4px solid transparent`, padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: 7, transition: 'all .15s ease' };
const card: React.CSSProperties = { background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' };

const BusinessHealthReport: React.FC = () => {
    const { notify, companyConfig } = useAuth();
    const { sales, customers } = useSales();
    const { invoices, expenses, income, accounts } = useFinance();
    const { inventory } = useInventory();
    const [report, setReport] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerateReport = async () => {
        setIsLoading(true);
        try {
            const result = await generateBusinessHealthReport(
                { invoices, expenses, income, accounts },
                { sales, customers },
                { inventory }
            );
            setReport(result);
            notify("AI Health Report generated successfully", "success");
        } catch (error) {
            logger.error(error);
            notify("Failed to generate report", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn .3s ease', padding: 24, fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.02 }}>Business Health Intelligence</h2>
                    <p style={{ fontSize: 13, color: inkSoft, fontWeight: 500, margin: '4px 0 0' }}>AI-powered strategic analysis and financial diagnostic report</p>
                </div>
                <button
                    onClick={handleGenerateReport}
                    disabled={isLoading}
                    style={{
                        ...btn,
                        background: isLoading ? hairline : `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                        color: isLoading ? inkSoft : '#fff',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        boxShadow: isLoading ? 'none' : `0 6px 16px -6px rgba(15,84,76,.55)`
                    }}
                    onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}}
                    onMouseLeave={e => { if (!isLoading) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}}
                >
                    {isLoading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Sparkles size={16} /> {report ? 'Regenerate' : 'Generate Report'}</>}
                </button>
            </div>

            {!report && !isLoading && (
                <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, background: teal[50], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <Activity style={{ color: teal[500] }} size={32} />
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: '0 0 8px' }}>Ready for Strategic Analysis</h3>
                    <p style={{ color: inkSoft, maxWidth: 448, marginBottom: 24 }}>Our AI will analyze your financial statements, sales velocity, and inventory levels to provide a comprehensive health diagnostic.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, width: '100%' }}>
                        {[
                            { icon: TrendingUp, color: teal[500], title: 'Growth Trends', desc: 'Revenue and expense velocity analysis.' },
                            { icon: AlertTriangle, color: amber[500], title: 'Risk Mitigation', desc: 'Identify stockouts and cash flow gaps.' },
                            { icon: FileText, color: teal[500], title: 'Action Plan', desc: '3-5 strategic steps for improvement.' },
                        ].map(item => (
                            <div key={item.title} style={{ background: teal[50], padding: 16, borderRadius: 12, textAlign: 'left', border: `1.4px solid ${teal[100]}` }}>
                                <item.icon style={{ color: item.color, marginBottom: 8 }} size={20} />
                                <h4 style={{ fontWeight: 700, fontSize: 13, color: ink, margin: 0 }}>{item.title}</h4>
                                <p style={{ fontSize: 12, color: inkSoft, margin: '4px 0 0' }}>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ height: 40, background: hairline, borderRadius: 12, width: '75%', animation: 'pulse 1.5s ease infinite' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        {[1, 2, 3].map(i => <div key={i} style={{ height: 96, background: teal[50], borderRadius: 12, animation: 'pulse 1.5s ease infinite' }} />)}
                    </div>
                    <div style={{ height: 192, background: teal[50], borderRadius: 12, animation: 'pulse 1.5s ease infinite' }} />
                </div>
            )}

            {report && !isLoading && (
                <div style={{ ...card, overflow: 'hidden' }}>
                    <div style={{ background: teal[800], padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(31,133,119,.2)', padding: 8, borderRadius: 9 }}>
                                <Sparkles style={{ color: teal[200] }} size={18} />
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.1, margin: 0 }}>AI Strategic Diagnostic</h3>
                                <p style={{ fontSize: 10, color: teal[100], margin: '2px 0 0' }}>Report Generated on {new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                        <button onClick={handlePrint} style={{ ...btn, background: teal[500], color: '#fff', padding: '8px 12px', fontSize: 12 }}
                            onMouseEnter={e => { e.currentTarget.style.background = teal[600]; }}
                            onMouseLeave={e => { e.currentTarget.style.background = teal[500]; }}>
                            <Printer size={16} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Print</span>
                        </button>
                    </div>
                    <div style={{ padding: 24, fontSize: 13, color: ink, lineHeight: 1.6 }}>
                        <ReactMarkdown
                            components={{
                                h1: ({ node, ...props }: any) => <h1 style={{ fontSize: 22, fontWeight: 900, color: ink, marginBottom: 16 }} {...props} />,
                                h2: ({ node, ...props }: any) => <h2 style={{ fontSize: 18, fontWeight: 700, color: teal[800], borderBottom: `1.4px solid ${teal[100]}`, paddingBottom: 8, marginTop: 24, marginBottom: 12 }} {...props} />,
                                h3: ({ node, ...props }: any) => <h3 style={{ fontSize: 15, fontWeight: 700, color: teal[700], marginTop: 16, marginBottom: 8 }} {...props} />,
                                p: ({ node, ...props }: any) => <p style={{ color: inkSoft, lineHeight: 1.7, marginBottom: 12 }} {...props} />,
                                ul: ({ node, ...props }: any) => <ul style={{ marginBottom: 16 }} {...props} />,
                                li: ({ node, ...props }: any) => <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: inkSoft }}><div style={{ marginTop: 6, width: 6, height: 6, borderRadius: '50%', background: teal[500], flexShrink: 0 }} /><span>{props.children}</span></li>,
                                strong: ({ node, ...props }: any) => <strong style={{ fontWeight: 700, color: ink }} {...props} />,
                            }}>
                            {report}
                        </ReactMarkdown>
                    </div>
                    <div style={{ background: teal[50], padding: 16, borderTop: `1.4px solid ${teal[100]}`, display: 'flex', justifyContent: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <ShieldCheck size={12} /> Prime ERP AI Intelligence
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BusinessHealthReport;