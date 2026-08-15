import React, { useState } from 'react';
import { Plus, Save, Eye, Code, Type, Image, Square, Move, Trash2, GripVertical } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

interface TemplateField { id: string; type: 'text' | 'image' | 'qr' | 'barcode' | 'table' | 'line'; label: string; x: number; y: number; width: number; height: number; fontSize?: number; fontFamily?: string; bold?: boolean; content?: string; dataField?: string; }

const DocumentTemplateBuilder: React.FC = () => {
    const [fields, setFields] = useState<TemplateField[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [selectedField, setSelectedField] = useState<string | null>(null);

    const addField = (type: TemplateField['type']) => {
        const id = `fld-${Date.now()}`;
        const base: TemplateField = { id, type, label: type.charAt(0).toUpperCase() + type.slice(1), x: 20, y: 20 + fields.length * 40, width: 150, height: 24, content: '', dataField: '' };
        if (type === 'text') { base.fontSize = 11; base.fontFamily = 'Inter'; }
        if (type === 'qr') { base.width = 60; base.height = 60; }
        setFields([...fields, base]);
        setSelectedField(id);
    };

    const updateField = (id: string, updates: Partial<TemplateField>) => { setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f)); };
    const removeField = (id: string) => { setFields(fields.filter(f => f.id !== id)); if (selectedField === id) setSelectedField(null); };

    const inputStyle: React.CSSProperties = {
        fontFamily: "'Inter', sans-serif", fontSize: 13, color: ink, background: paper,
        border: `1.4px solid ${hairline}`, borderRadius: 8, padding: '6px 10px', outline: 'none', width: '100%'
    };

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', background: t[50], minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0 }}>Document Template Builder</h1>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Design invoice, receipt, and document layouts</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="prime-btn-secondary" style={{ padding: '8px 14px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Eye size={15} /> Preview</button>
                    <button className="prime-btn" style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${t[500]}, ${t[700]})`, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: `0 4px 12px -4px rgba(15,84,76,.4)` }}><Save size={15} /> Save Template</button>
                </div>
            </div>
            <input className="prime-input" type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} placeholder="Template name (e.g., Standard Invoice)" />

            <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Add Elements</p>
                    {(['text', 'image', 'line', 'table'] as const).map(type => (
                        <button key={type} onClick={() => addField(type)} className="prime-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: ink, fontSize: 13, cursor: 'pointer', transition: 'all .15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = t[200]; e.currentTarget.style.background = t[50]; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                        >
                            {type === 'text' ? <Type size={14} /> : type === 'image' ? <Image size={14} /> : type === 'line' ? <Square size={14} /> : <Code size={14} />}
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                    ))}
                    <p style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px' }}>Special</p>
                    {(['qr', 'barcode'] as const).map(type => (
                        <button key={type} onClick={() => addField(type)} className="prime-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`, background: paper, color: ink, fontSize: 13, cursor: 'pointer', transition: 'all .15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = t[200]; e.currentTarget.style.background = t[50]; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                        ><Code size={14} /> {type.toUpperCase()}</button>
                    ))}
                </div>

                <div className="prime-card" style={{ flex: 1, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 24, minHeight: 500, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 24, border: `2px dashed ${hairline}`, borderRadius: 8, pointerEvents: 'none' }} />
                    <p style={{ fontSize: 12, color: hairline, position: 'absolute', top: 12, left: 16 }}>Canvas — drag elements to position</p>
                    {fields.map(f => (
                        <div key={f.id} onClick={() => setSelectedField(f.id)} style={{
                            position: 'absolute', cursor: 'move', padding: 4, borderRadius: 4, fontSize: 12,
                            border: selectedField === f.id ? `1.5px solid ${t[500]}` : '1.5px solid transparent',
                            background: selectedField === f.id ? t[50] : 'transparent',
                            left: f.x, top: f.y, width: f.width, height: f.height, transition: 'all .15s ease'
                        }}
                            onMouseEnter={e => { if (selectedField !== f.id) e.currentTarget.style.borderColor = hairline; }}
                            onMouseLeave={e => { if (selectedField !== f.id) e.currentTarget.style.borderColor = 'transparent'; }}
                        >
                            <span style={{ color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{f.content || f.label}</span>
                        </div>
                    ))}
                    {fields.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: hairline, fontSize: 13 }}>Add elements from the left panel to build your template.</p></div>}
                </div>

                {selectedField && (() => {
                    const field = fields.find(f => f.id === selectedField);
                    if (!field) return null;
                    return (
                        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Properties</p>
                                <button className="prime-btn-secondary" onClick={() => removeField(field.id)} style={{ padding: 4, background: 'none', border: 'none', color: '#b5493f', cursor: 'pointer' }}><Trash2 size={14} /></button>
                            </div>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Label</label>
                                <input className="prime-input" type="text" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                                <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Data Field</label>
                                <input className="prime-input" type="text" value={field.dataField || ''} onChange={e => updateField(field.id, { dataField: e.target.value })} style={inputStyle} placeholder="e.g., invoice.number" />
                            </div>
                            {field.type === 'text' && <>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Font Size</label>
                                    <input className="prime-input" type="number" value={field.fontSize || 11} onChange={e => updateField(field.id, { fontSize: parseInt(e.target.value) || 11 })} style={inputStyle} />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Content</label>
                                    <input className="prime-input" type="text" value={field.content || ''} onChange={e => updateField(field.id, { content: e.target.value })} style={inputStyle} placeholder="Static text" />
                                </div>
                            </>}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>X</label>
                                    <input className="prime-input" type="number" value={field.x} onChange={e => updateField(field.id, { x: parseInt(e.target.value) || 0 })} style={inputStyle} />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Y</label>
                                    <input className="prime-input" type="number" value={field.y} onChange={e => updateField(field.id, { y: parseInt(e.target.value) || 0 })} style={inputStyle} />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Width</label>
                                    <input className="prime-input" type="number" value={field.width} onChange={e => updateField(field.id, { width: parseInt(e.target.value) || 50 })} style={inputStyle} />
                                </div>
                                <div>
                                    <label className="prime-label" style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, marginBottom: 4 }}>Height</label>
                                    <input className="prime-input" type="number" value={field.height} onChange={e => updateField(field.id, { height: parseInt(e.target.value) || 20 })} style={inputStyle} />
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default DocumentTemplateBuilder;
