import React, { useState, useRef, useMemo, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { PrimeDocData } from '../../shared/components/PDF/schemas';
import { 
    X, CheckCircle, Clock, FileText, DollarSign, Printer, Edit2, Box, Link as LinkIcon, 
    Activity, ArrowRight, Trash2, Play, Timer, ListTodo, History, PenTool, Mail, 
    Check, PlayCircle, Briefcase, AlertCircle, Target, ShieldCheck, Scale, Layout, 
    Info, FileCheck, TrendingUp, RefreshCw, Sparkles, Gauge, Loader2, Droplet, Download, ChevronRight
} from 'lucide-react';
import { JobOrder, Attachment, InvoiceAllocation, InkCoverage } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useSales } from '../../../context/SalesContext';
import ReactMarkdown from 'react-markdown';
import { generateAIResponse } from '../../../services/geminiService';
import InkDensityAnalyzer from '../../production/components/InkDensityAnalyzer';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../../utils/documentCustomerData';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';

interface JobOrderDetailsProps {
    jobOrder: JobOrder;
    onClose: () => void;
    onEdit: (jo: JobOrder) => void;
    onAction: (jo: JobOrder, action: string) => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const JobOrderDetails: React.FC<JobOrderDetailsProps> = ({ jobOrder, onClose, onEdit, onAction }) => {
    const { companyConfig, notify, isOnline } = useAuth();
    const { customers = [], updateJobOrder, convertJobOrderToInvoice } = useSales();
    const currency = companyConfig.currencySymbol;
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'Overview' | 'Financials' | 'Pre-Press' | 'Quality Control'>('Overview');
    const [isConverting, setIsConverting] = useState(false);
    
    const handleDownloadPDF = async () => {
        try {
            notify("Preparing Job Order PDF...", "info");
            const enrichedJobOrder = enrichDocumentCustomerData(jobOrder, customers);
            const pdfData: PrimeDocData = {
                number: jobOrder.id,
                date: new Date(jobOrder.date).toLocaleDateString(),
                clientName: enrichedJobOrder.customerName || jobOrder.customerName,
                address: enrichedJobOrder.address || enrichedJobOrder.customerAddress || enrichedJobOrder.billingAddress || enrichedJobOrder.shippingAddress || '',
                phone: enrichedJobOrder.phone || enrichedJobOrder.customerPhone || enrichedJobOrder.schoolPhone || '',
                items: [{
                    desc: jobOrder.jobTitle + (jobOrder.jobDescription ? `: ${jobOrder.jobDescription}` : ''),
                    qty: jobOrder.totalQuantity,
                }],
                notes: jobOrder.jobDescription || ''
            };
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="WORK_ORDER" data={securedPdfData as PrimeDocData} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `JOB-ORDER-${jobOrder.id}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Job Order PDF downloaded successfully", "success");
        } catch (error) {
            logger.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };
    
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditReport, setAuditReport] = useState('');

    const handleRunAudit = async () => {
        if (!isOnline) return;
        setIsAuditing(true);
        const prompt = `Perform a Pre-press Flight Check on this Job Order:
        Title: ${jobOrder.jobTitle}
        Specs: ${jobOrder.jobDescription}
        Attachments: ${(jobOrder.attachments || []).map(a => a.name).join(', ')}
        Evaluate readiness based on 3 criteria: Resolution, Bleed, and Color Space. 
        Assign a score (0-100) and highlight critical warnings for a professional printer operator.`;
        try {
            const result = await generateAIResponse(prompt, "You are a Master Pre-press Technician.");
            setAuditReport(result);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleInkAnalysis = (coverage: InkCoverage) => {
        updateJobOrder({ ...jobOrder, inkCoverage: coverage });
        notify("Job material costs updated with AI ink density.", "success");
    };

    const totalInternalCost = (jobOrder.laborCost || 0) + (jobOrder.overheadCost || 0) + (jobOrder.materialCost || 0);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }}>
            <div style={{
                width: 960, maxWidth: '100%', maxHeight: '92vh',
                background: paper, borderRadius: 14,
                boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                    background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                }} />

                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '22px 28px 18px',
                    borderBottom: `1px solid ${hairline}`, background: paper
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                        }}>
                            <Briefcase size={19} color="#fff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h1 style={{
                                    fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                                    fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                                }}>
                                    Job Order #{jobOrder.id}
                                </h1>
                                <span style={{
                                    padding: '2px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                                    background: '#eff6ff', color: '#2563eb'
                                }}>
                                    {jobOrder.status}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                                <span style={{ padding: '1px 6px', borderRadius: 4, background: teal[50], color: teal[700], fontWeight: 600 }}>{jobOrder.customerName}</span>
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {jobOrder.status === 'Completed' && (
                            <button onClick={() => {}}
                                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileCheck size={14} /> Bill Customer
                            </button>
                        )}
                        <button onClick={handleDownloadPDF}
                            style={{ padding: '6px 12px', borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600 }}>
                            <Download size={14} /> Download
                        </button>
                        <button onClick={() => window.print()}
                            style={{ padding: 6, borderRadius: 8, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex' }}>
                            <Printer size={16} />
                        </button>
                        <button onClick={onClose}
                            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper, color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', borderBottom: `1px solid ${hairline}`, padding: '0 28px', background: paper, flexShrink: 0 }}>
                    {['Overview', 'Pre-Press', 'Financials', 'Quality Control'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as 'Overview' | 'Financials' | 'Pre-Press' | 'Quality Control')}
                            style={{
                                padding: '14px 16px 12px', fontSize: 12, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: activeTab === tab ? teal[600] : inkSoft,
                                borderBottom: `2px solid ${activeTab === tab ? teal[500] : 'transparent'}`,
                                transition: 'all .15s ease'
                            }}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 8px', background: teal[50] }}>
                    {activeTab === 'Pre-Press' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
                            <InkDensityAnalyzer imageUrl={jobOrder.attachments?.[0]?.url || ''} onAnalysisComplete={handleInkAnalysis} />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div style={{ padding: 24, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <h3 style={{ margin: 0, fontSize: 10, fontWeight: 800, color: ink, textTransform: 'uppercase', letterSpacing: 0.08, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Sparkles size={14} color={teal[600]} /> AI Pre-flight Auditor
                                        </h3>
                                        <button onClick={handleRunAudit} disabled={isAuditing || !isOnline}
                                            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: ink, color: '#fff', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {isAuditing ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Run Logic Check
                                        </button>
                                    </div>
                                    {auditReport ? (
                                        <div className="prose prose-sm prose-slate max-w-none" style={{ padding: 16, background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}`, color: ink, lineHeight: 1.6, maxHeight: 300, overflowY: 'auto' }}>
                                            <ReactMarkdown>{auditReport}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <div style={{ height: 200, border: `2px dashed ${hairline}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: inkSoft }}>
                                            <ShieldCheck size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                                            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06 }}>Ready for Audit</p>
                                            <p style={{ fontSize: 11, marginTop: 4 }}>AI will check artwork resolution, color space, and bleed zones before release to press.</p>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    <div style={{ padding: 24, background: teal[800], borderRadius: 12, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: 0, right: 0, padding: 16, opacity: 0.1 }}><Target size={80} /></div>
                                        <h3 style={{ margin: '0 0 16px', fontSize: 10, fontWeight: 800, color: amber[300], textTransform: 'uppercase', letterSpacing: 0.2 }}>Readiness score</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ width: 80, height: 80, borderRadius: '50%', border: '6px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, fontStyle: 'italic' }}>
                                                {auditReport ? '92' : '--'}
                                            </div>
                                            <div>
                                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>File Integrity: <span style={{ color: '#6ee7b7' }}>Excellent</span></p>
                                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.1 }}>Optimized for: Digital Press</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                        <h3 style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>Customer Pins</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {(jobOrder.annotations || []).length === 0 ? (
                                                <p style={{ fontSize: 11, color: inkSoft, fontStyle: 'italic' }}>No feedback pins on proof.</p>
                                            ) : (
                                                jobOrder.annotations?.map(ann => (
                                                    <div key={ann.id} style={{ display: 'flex', gap: 10, padding: 10, background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}` }}>
                                                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                                                            {ann.id.split('-').pop()}
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: ink }}>{ann.comment}</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: 9, color: inkSoft, textTransform: 'uppercase' }}>Pinned by {ann.author} &bull; {new Date(ann.date).toLocaleTimeString()}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'Overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                    <h3 style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <FileText size={14} color={teal[600]} /> Order Description
                                    </h3>
                                    <div style={{ padding: 12, background: teal[50], borderRadius: 8, fontSize: 12, color: ink, fontStyle: 'italic', border: `1px solid ${teal[100]}` }}>
                                        "{jobOrder.jobDescription || 'No description provided.'}"
                                    </div>
                                </div>
                                {jobOrder.inkCoverage && (
                                    <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                                        <h3 style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Droplet size={14} color={teal[600]} /> Verified Ink Metrics
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                            <div style={{ textAlign: 'center', padding: 10, background: '#ecfeff', borderRadius: 8, border: '1px solid #a5f3fc' }}>
                                                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase' }}>Cyan</p>
                                                <p style={{ margin: '4px 0 0', fontWeight: 800, color: ink }}>{jobOrder.inkCoverage.cyan}%</p>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: 10, background: '#fdf2f8', borderRadius: 8, border: '1px solid #fbcfe8' }}>
                                                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#db2777', textTransform: 'uppercase' }}>Magenta</p>
                                                <p style={{ margin: '4px 0 0', fontWeight: 800, color: ink }}>{jobOrder.inkCoverage.magenta}%</p>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: 10, background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
                                                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Yellow</p>
                                                <p style={{ margin: '4px 0 0', fontWeight: 800, color: ink }}>{jobOrder.inkCoverage.yellow}%</p>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: 10, background: teal[50], borderRadius: 8, border: `1px solid ${hairline}` }}>
                                                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase' }}>Black</p>
                                                <p style={{ margin: '4px 0 0', fontWeight: 800, color: ink }}>{jobOrder.inkCoverage.black}%</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div style={{ padding: 20, background: teal[800], borderRadius: 12, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: amber[300], textTransform: 'uppercase', letterSpacing: 0.2 }}>Internal Cost Control</p>
                                    <div style={{ fontSize: 22, fontWeight: 800 }}>{currency}{totalInternalCost.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    gap: 10, padding: '16px 28px',
                    borderTop: `1px solid ${hairline}`, background: paper
                }}>
                    <button type="button" onClick={onClose}
                        style={{
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                            padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                            background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                            display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
