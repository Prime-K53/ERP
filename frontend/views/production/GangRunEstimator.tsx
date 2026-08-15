
import React, { useState, useMemo } from 'react';
import { 
  Maximize, Ruler, Calculator, Box, ArrowRight, 
  Trash2, Plus, Info, Scale, CheckCircle, RefreshCw,
  Layers, Package, ChevronRight, FileText, Save, X
} from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useAuth } from '../../context/AuthContext';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const GangRunEstimator: React.FC = () => {
    const { workOrders, updateWorkOrder } = useProduction();
    const { companyConfig, notify } = useAuth();
    const currency = companyConfig.currencySymbol;

    // State
    const [parentSize, setParentSize] = useState({ w: 457, h: 305 }); // SRA3 Default in mm
    const [finalSize, setFinalSize] = useState({ w: 85, h: 55 }); // Business Card Default
    const [gutter, setGutter] = useState(3);
    const [bleed, setBleed] = useState(2);
    const [margin, setMargin] = useState(5);
    const [targetQty, setTargetQty] = useState(1000);
    
    // Save state
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [selectedWoId, setSelectedWoId] = useState('');

    const result = useMemo(() => {
        const pW = parentSize.w - (margin * 2);
        const pH = parentSize.h - (margin * 2);
        
        const fW = finalSize.w + (bleed * 2) + gutter;
        const fH = finalSize.h + (bleed * 2) + gutter;

        const cols1 = Math.floor(pW / fW);
        const rows1 = Math.floor(pH / fH);
        const yield1 = cols1 * rows1;

        const cols2 = Math.floor(pW / fH);
        const rows2 = Math.floor(pH / fW);
        const yield2 = cols2 * rows2;

        const bestYield = Math.max(yield1, yield2);
        const sheetsNeeded = Math.ceil(targetQty / (bestYield || 1));
        const wastePercent = 100 - ((bestYield * fW * fH) / (pW * pH) * 100);

        return {
            bestYield,
            sheetsNeeded,
            wastePercent: Math.max(0, Math.min(100, wastePercent)),
            orientation: yield1 >= yield2 ? 'Optimal' : 'Rotated'
        };
    }, [parentSize, finalSize, gutter, bleed, margin, targetQty]);

    const handleApplyToOrder = () => {
        const wo = workOrders.find((w: any) => w.id === selectedWoId);
        if (!wo) return;

        const note = `[IMPOSITION LOGIC]: Sheet Size: ${parentSize.w}x${parentSize.h}mm, Final Size: ${finalSize.w}x${finalSize.h}mm, Yield: ${result.bestYield} Up, Pull: ${result.sheetsNeeded} Sheets. Waste Factor: ${result.wastePercent.toFixed(1)}%.`;
        
        updateWorkOrder({
            ...wo,
            notes: (wo.notes ? wo.notes + '\n' : '') + note
        });

        notify(`Imposition data saved to Order ${selectedWoId}`, "success");
        setShowSaveModal(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Inter,"DM Sans",sans-serif', overflow: 'hidden' }}>
            <div style={{ paddingLeft: '40px', paddingTop: '32px', borderStyle: 'solid', borderColor: '#e4ddd1', background: 'rgba(254,253,251,.7)', backdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingRight: '40px', paddingBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '30px', fontWeight: 900, color: '#23282A', textTransform: 'uppercase', letterSpacing: '-.05em', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Scale size={32} style={{ color: '#1f8577' }}/> Production Sheet Intelligence
                    </h1>
                    <p style={{ fontSize: '13px', color: '#5c6567', marginTop: '4px' }}>Mathematical gang-run optimization for maximum yield.</p>
                </div>
                <button 
                    onClick={() => setShowSaveModal(true)}
                    style={{ background: '#0b3e39', color: '#fff', paddingLeft: '24px', paddingTop: '10px', borderRadius: '12px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', transition: 'all .15s ease', boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)', display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '24px', paddingBottom: '10px' }}
                >
                    <Save size={16}/> Apply to Job
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '384px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#FEFDFB', overflowY: 'auto', padding: '32px', marginTop: '40px', flexShrink: 0 }}>
                    <section>
                        <h3 style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={14} style={{ color: '#1f8577' }}/> Parent Sheet Matrix (mm)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', marginBottom: '8px' }}>Width</label>
                                <input type="number" style={{ width: '100%', padding: '12px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontWeight: 700 }} value={parentSize.w} onChange={e => setParentSize({...parentSize, w: parseFloat(e.target.value)})}/>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', marginBottom: '8px' }}>Height</label>
                                <input type="number" style={{ width: '100%', padding: '12px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontWeight: 700 }} value={parentSize.h} onChange={e => setParentSize({...parentSize, h: parseFloat(e.target.value)})}/>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Maximize size={14} style={{ color: '#1f8577' }}/> Cut Size Matrix (mm)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', marginBottom: '8px' }}>Final Width</label>
                                <input type="number" style={{ width: '100%', padding: '12px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontWeight: 700, color: '#1f8577' }} value={finalSize.w} onChange={e => setFinalSize({...finalSize, w: parseFloat(e.target.value)})}/>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', marginBottom: '8px' }}>Final Height</label>
                                <input type="number" style={{ width: '100%', padding: '12px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontWeight: 700, color: '#1f8577' }} value={finalSize.h} onChange={e => setFinalSize({...finalSize, h: parseFloat(e.target.value)})}/>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', marginBottom: '24px' }}>Technical Offsets</h3>
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#5c6567' }}>Sheet Margin</label>
                                <input type="number" style={{ width: '80px', padding: '8px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '10px', textAlign: 'right', fontSize: '11px' }} value={margin} onChange={e => setMargin(parseFloat(e.target.value))}/>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#5c6567' }}>Gutter (Gap)</label>
                                <input type="number" style={{ width: '80px', padding: '8px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '10px', textAlign: 'right', fontSize: '11px' }} value={gutter} onChange={e => setGutter(parseFloat(e.target.value))}/>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#5c6567' }}>Bleed Radius</label>
                                <input type="number" style={{ width: '80px', padding: '8px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '10px', textAlign: 'right', fontSize: '11px' }} value={bleed} onChange={e => setBleed(parseFloat(e.target.value))}/>
                            </div>
                        </div>
                    </section>

                    <section style={{ paddingTop: '24px', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                        <label style={{ display: 'block', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '12px' }}>Order Target</label>
                        <input type="number" style={{ width: '100%', padding: '16px', background: '#0b3e39', color: '#fff', borderRadius: '16px', fontSize: '24px', fontWeight: 900, letterSpacing: '-.05em' }} value={targetQty} onChange={e => setTargetQty(parseInt(e.target.value))}/>
                    </section>
                </div>

                <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '32px', marginBottom: '40px' }}>
                        <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '24px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, right: 0, padding: '16px', opacity: .05, transition: 'transform .15s ease' }}><CheckCircle size={48}/></div>
                            <p style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Max Yield</p>
                            <h3 style={{ fontSize: '30px', fontWeight: 900, color: '#23282A' }}>{result.bestYield} <span style={{ fontSize: '13px', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase' }}>Up</span></h3>
                            <p style={{ fontWeight: 700, color: '#1f8577', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '-.025em' }}>{result.orientation} Fit</p>
                        </div>
                        <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '24px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1' }}>
                            <p style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Stock Pull</p>
                            <h3 style={{ fontSize: '30px', fontWeight: 900, color: '#23282A' }}>{result.sheetsNeeded} <span style={{ fontSize: '13px', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase' }}>Sheets</span></h3>
                            <p style={{ fontWeight: 700, color: '#5c6567', marginTop: '8px', textTransform: 'uppercase' }}>Parent Material Count</p>
                        </div>
                        <div style={{ background: '#0b3e39', padding: '24px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', color: '#fff' }}>
                            <p style={{ fontWeight: 900, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Waste Factor</p>
                            <h3 className={`text-3xl font-black ${result.wastePercent > 25 ? 'text-rose-400' : 'text-emerald-400'}`}>{result.wastePercent.toFixed(1)}%</h3>
                            <p style={{ fontWeight: 700, color: '#5c6567', marginTop: '8px', textTransform: 'uppercase' }}>Unutilized Area</p>
                        </div>
                        <div style={{ background: '#1f8577', padding: '24px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', color: '#fff' }}>
                            <p style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Imposition Logic</p>
                            <h3 style={{ fontSize: '20px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.05em', marginTop: '4px' }}>Ready for RIP</h3>
                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={14} className="text-emerald-300"/>
                                <span style={{ fontWeight: 900, textTransform: 'uppercase' }}>Mathematically Optimized</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#FEFDFB', padding: '40px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, pointerEvents: 'none', background: '#eef7f6', right: 0, bottom: 0, left: 0 }}></div>
                        
                        <h3 style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', marginBottom: '40px' }}>Imposition Preview Matrix</h3>
                        
                        <div 
                            style={{ background: '#eef7f6', borderWidth: '2px', borderColor: '#e4ddd1', borderRadius: '6px', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', position: 'relative', transition: 'all .15s ease', transitionDuration: '500ms', 
                                width: '400px', 
                                height: `${(parentSize.h / parentSize.w) * 400}px`,
                                padding: `${(margin / parentSize.w) * 400}px`
                            }}
                        >
                            <div style={{ width: '100%', height: '100%', border: '1.4px solid #e4ddd1', borderStyle: 'dashed', borderColor: '#a6d9d3', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', overflow: 'hidden' }}>
                                {Array.from({ length: result.bestYield }).map((_, i) => (
                                    <div 
                                        key={i} 
                                        style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', borderRadius: '4px', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,.06)', transitionDuration: '500ms', 
                                            width: `${((finalSize.w + bleed*2) / parentSize.w) * 400}px`,
                                            height: `${((finalSize.h + bleed*2) / parentSize.h) * ((parentSize.h / parentSize.w) * 400)}px`
                                        }}
                                    ></div>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginTop: '48px', display: 'flex', gap: '40px', alignItems: 'center', fontSize: '11px', color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Ruler size={14}/> {parentSize.w}mm x {parentSize.h}mm</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Info size={14}/> {bleed}mm Bleed + {gutter}mm Gutter</span>
                        </div>
                    </div>
                </main>
            </div>

            {showSaveModal && (
                <div style={{ position: 'fixed', top: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)', right: 0, bottom: 0, left: 0 }}>
                    <div style={{ background: '#FEFDFB', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', width: '100%', maxWidth: '448px', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderStyle: 'solid', borderColor: '#e4ddd1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef7f6' }}>
                            <h3 style={{ fontWeight: 900, color: '#23282A', textTransform: 'uppercase', letterSpacing: '-.05em' }}>Apply to Work Order</h3>
                            <button onClick={() => setShowSaveModal(false)}><X/></button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <label style={{ display: 'block', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Select Target Job</label>
                            <select 
                                style={{ width: '100%', padding: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', marginBottom: '24px' }}
                                value={selectedWoId}
                                onChange={e => setSelectedWoId(e.target.value)}
                            >
                                <option value="">-- Choose Work Order --</option>
                                {workOrders.filter(w => !['Completed', 'Cancelled'].includes(w.status)).map(wo => (
                                    <option key={wo.id} value={wo.id}>{wo.id} - {wo.productName}</option>
                                ))}
                            </select>
                            <button onClick={handleApplyToOrder} style={{ width: '100%', paddingTop: '16px', background: '#1f8577', color: '#fff', borderRadius: '16px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', paddingBottom: '16px' }}>
                                Save Optimization Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GangRunEstimator;
