import React, { useState, useEffect } from 'react';
import {
    Plus, Trash2, Save, Layers,
    Search, Edit2, FileText, Clock
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { BOMTemplate, Item } from '../../types';
import { dbService } from '../../services/db';
import { repriceMasterInventoryFromAdjustments } from '../../services/masterInventoryPricingService';
import { useConfirmDialog } from '../../components/ConfirmDialog';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const BOMRecipes: React.FC = () => {
    const { inventory } = useInventory();
    const { notify, companyConfig, updateCompanyConfig, addAuditLog } = useAuth();
    const { confirm, ConfirmDialogComponent } = useConfirmDialog();
    const [activeTab, setActiveTab] = useState<'Templates'>('Templates');
    const [templates, setTemplates] = useState<BOMTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Template Editor State
    const [editingTemplate, setEditingTemplate] = useState<Partial<BOMTemplate> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [t] = await Promise.all([
                dbService.getAll<BOMTemplate>('bomTemplates')
            ]);
            setTemplates(t);
        } catch (error) {
            notify("Failed to load BOM data", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate?.name || !editingTemplate?.type) {
            notify("Name and Type are required", "error");
            return;
        }
        try {
            const template = {
                ...editingTemplate,
                id: editingTemplate.id || `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                components: editingTemplate.components || [],
                lastUpdated: new Date().toISOString()
            } as BOMTemplate;

            const isNew = !editingTemplate.id;
            const oldVal = isNew ? null : templates.find(t => t.id === editingTemplate.id);
            
            await dbService.put('bomTemplates', template);
            await repriceMasterInventoryFromAdjustments();
            
            addAuditLog({
                action: isNew ? 'CREATE' : 'UPDATE',
                entityType: 'BOMRecipe',
                entityId: template.id,
                details: `${isNew ? 'Created' : 'Updated'} BOM Recipe: ${template.name}`,
                oldValue: oldVal,
                newValue: template
            });

            notify("BOM Recipe saved successfully", "success");
            setEditingTemplate(null);
            loadData();
        } catch (error) {
            notify("Failed to save BOM Recipe", "error");
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        const ok = await confirm({
            title: 'Delete BOM Recipe',
            message: 'Are you sure you want to delete this BOM Recipe?',
            type: 'danger',
            confirmText: 'Delete',
        });
        if (!ok) return;
        try {
            const oldVal = templates.find(t => t.id === id);
            await dbService.delete('bomTemplates', id);
            await repriceMasterInventoryFromAdjustments();
            
            addAuditLog({
                action: 'DELETE',
                entityType: 'BOMRecipe',
                entityId: id,
                details: `Deleted BOM Recipe: ${oldVal?.name || id}`,
                oldValue: oldVal
            });

            notify("BOM Recipe deleted", "success");
            loadData();
        } catch (error) {
            notify("Failed to delete BOM Recipe", "error");
        }
    };

    const addComponent = () => {
        if (!editingTemplate) return;
        const newComponents = [...(editingTemplate.components || []), { itemId: '', name: '', formula: '1', unit: '', costPerUnit: 0, consumptionMode: 'UNIT_BASED' }];
        setEditingTemplate({ ...editingTemplate, components: newComponents as BOMComponent[] });
    };

    const updateComponent = (index: number, field: string, value: any) => {
        if (!editingTemplate?.components) return;
        const newComponents = [...editingTemplate.components];
        const updatedComponent = { ...newComponents[index], [field]: value };

        // Auto-update unit and cost if itemId changes
        if (field === 'itemId') {
            const item = inventory.find(i => i.id === value);
            if (item) {
                updatedComponent.unit = item.unit;
                updatedComponent.costPerUnit = item.normalizedCP ?? item.cost ?? item.costPrice ?? 0;
            }
        }

        newComponents[index] = updatedComponent;
        setEditingTemplate({ ...editingTemplate, components: newComponents });
    };

    const removeComponent = (index: number) => {
        if (!editingTemplate?.components) return;
        const newComponents = editingTemplate.components.filter((_, i) => i !== index);
        setEditingTemplate({ ...editingTemplate, components: newComponents });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FEFDFB', borderRadius: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '8px', background: '#fef2f2', color: '#b5493f', borderRadius: '10px' }}>
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#23282A' }}>BOM Recipes</h2>
                        <p style={{ fontSize: '13px', color: '#5c6567' }}>Manage production Bill of Materials and cost structures</p>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ marginTop: '24px' }}>
                    {editingTemplate ? (
                        <div style={{ background: '#eef7f6', borderRadius: '16px', padding: '24px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#23282A' }}>{editingTemplate.id ? 'Edit BOM Recipe' : 'New BOM Recipe'}</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setEditingTemplate(null)} style={{ paddingLeft: '16px', paddingTop: '8px', fontSize: '13px', fontWeight: 500, color: '#5c6567', borderRadius: '12px', transition: 'all .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>Cancel</button>
                                    <button onClick={handleSaveTemplate} style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '24px', paddingTop: '8px', background: '#b5493f', color: '#fff', borderRadius: '12px', fontSize: '13px', fontWeight: 700, boxShadow: '0 4px 14px 0 rgba(181,73,63,.08)', transition: 'all .15s ease', paddingRight: '24px', paddingBottom: '8px' }}>
                                        <Save size={18} /> Save BOM Recipe
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px', marginBottom: '32px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#23282A', marginBottom: '8px' }}>Recipe Name</label>
                                    <input
                                        type="text"
                                        value={editingTemplate.name || ''}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                        placeholder="e.g. Standard 80-page Book"
                                        style={{ width: '100%', paddingLeft: '16px', paddingTop: '8px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', outline: 'none', transition: 'all .15s ease', paddingRight: '16px', paddingBottom: '8px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#23282A', marginBottom: '8px' }}>Production Type</label>
                                    <select
                                        value={editingTemplate.type || ''}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, type: e.target.value })}
                                        style={{ width: '100%', paddingLeft: '16px', paddingTop: '8px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', outline: 'none', transition: 'all .15s ease', paddingRight: '16px', paddingBottom: '8px' }}
                                    >
                                        <option value="">Select Type</option>
                                        <option value="Book">Book</option>
                                        <option value="Exam Sheet">Exam Sheet</option>
                                        <option value="Flyer">Flyer</option>
                                        <option value="Poster">Poster</option>
                                        <option value="Custom">Custom</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h4 style={{ fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Layers size={18} style={{ color: '#b5493f' }} /> Components & Materials
                                    </h4>
                                    <button onClick={addComponent} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b5493f', fontWeight: 700, fontSize: '13px' }}>
                                        <Plus size={18} /> Add Component
                                    </button>
                                </div>

                                <div style={{ background: '#FEFDFB', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', textAlign: 'left', fontSize: '13px' }}>
                                        <thead style={{ background: '#eef7f6', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                                            <tr>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>Material / Item</th>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>Formula</th>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>Unit</th>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>Cost/Unit</th>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', paddingRight: '16px', paddingBottom: '12px' }}>Mode</th>
                                                <th style={{ paddingLeft: '16px', paddingTop: '12px', fontWeight: 700, color: '#23282A', width: '80px', paddingRight: '16px', paddingBottom: '12px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ borderColor: '#e4ddd1' }}>
                                            {editingTemplate.components?.map((comp, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <select
                                                            value={comp.itemId}
                                                            onChange={e => updateComponent(idx, 'itemId', e.target.value)}
                                                            style={{ width: '100%', background: 'transparent', outline: 'none' }}
                                                        >
                                                            <option value="">Select Material</option>
                                                            {inventory
                                                                .filter(i => i.type !== 'Service')
                                                                .filter((item, index, self) => index === self.findIndex((t) => t.id === item.id))
                                                                .map(i => (
                                                                    <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                                                                ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <input
                                                            type="text"
                                                            value={comp.formula ?? comp.quantityFormula ?? ''}
                                                            onChange={e => updateComponent(idx, 'formula', e.target.value)}
                                                            placeholder="e.g. quantity * pages / 2"
                                                            style={{ width: '100%', background: 'transparent', outline: 'none', fontFamily: '"JetBrains Mono",monospace', fontSize: '11px' }}
                                                        />
                                                    </td>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <input
                                                            type="text"
                                                            value={comp.unit || ''}
                                                            onChange={e => updateComponent(idx, 'unit', e.target.value)}
                                                            placeholder="Unit"
                                                            style={{ width: '100%', background: 'transparent', outline: 'none', fontSize: '11px' }}
                                                        />
                                                    </td>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="any"
                                                            value={comp.costPerUnit ?? 0}
                                                            onChange={e => updateComponent(idx, 'costPerUnit', Number(e.target.value))}
                                                            placeholder="0.00"
                                                            style={{ width: '80px', background: 'transparent', outline: 'none', fontFamily: '"JetBrains Mono",monospace', fontSize: '11px', textAlign: 'right' }}
                                                        />
                                                    </td>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <select
                                                            value={comp.consumptionMode || 'UNIT_BASED'}
                                                            onChange={e => updateComponent(idx, 'consumptionMode', e.target.value)}
                                                            style={{ background: 'transparent', outline: 'none', fontSize: '11px' }}
                                                        >
                                                            <option value="PAGE_BASED">Page</option>
                                                            <option value="UNIT_BASED">Unit</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', paddingRight: '16px', paddingBottom: '8px' }}>
                                                        <button onClick={() => removeComponent(idx)} style={{ color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!editingTemplate.components || editingTemplate.components.length === 0) && (
                                                <tr>
                                                    <td colSpan={6} style={{ paddingLeft: '16px', paddingTop: '32px', textAlign: 'center', color: '#5c6567', fontStyle: 'italic', paddingRight: '16px', paddingBottom: '32px' }}>
                                                        No components added. Click "Add Component" to start.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ position: 'relative', width: '288px' }}>
                                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567' }} size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search recipes..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ width: '100%', paddingLeft: '40px', paddingRight: '16px', paddingTop: '8px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', outline: 'none', transition: 'all .15s ease', fontSize: '13px', paddingBottom: '8px' }}
                                    />
                                </div>
                                <button
                                    onClick={() => setEditingTemplate({ name: '', type: 'Book', components: [], isDefault: false })}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px', paddingTop: '8px', background: '#b5493f', color: '#fff', borderRadius: '12px', fontSize: '13px', fontWeight: 700, boxShadow: '0 4px 14px 0 rgba(181,73,63,.08)', transition: 'all .15s ease', paddingRight: '16px', paddingBottom: '8px' }}
                                >
                                    <Plus size={18} /> Create BOM Recipe
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px' }}>
                                {templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(template => (
                                    <div key={template.id} style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', padding: '20px', borderRadius: '16px', transition: 'all .15s ease' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                            <div>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${template.type === 'Book' ? 'bg-blue-50 text-blue-600' :
                                                    template.type === 'Exam Sheet' ? 'bg-purple-50 text-purple-600' :
                                                        'bg-slate-50 text-slate-600'
                                                    }`}>
                                                    {template.type}
                                                </span>
                                                <h4 style={{ fontWeight: 700, color: '#23282A', marginTop: '4px' }}>{template.name}</h4>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', opacity: 0.0, transition: 'opacity .15s ease' }}>
                                                <button onClick={() => setEditingTemplate(template)} style={{ padding: '6px', color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteTemplate(template.id)} style={{ padding: '6px', color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#5c6567' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={14} /> {template.components?.length || 0} Items</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> Updated {new Date(template.lastUpdated).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {templates.length === 0 && (
                                    <div style={{ gridColumn: '1 / -1', paddingTop: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#eef7f6', borderRadius: '24px', borderWidth: '2px', borderStyle: 'dashed', borderColor: '#e4ddd1', paddingBottom: '48px' }}>
                                        <div style={{ padding: '16px', background: '#FEFDFB', borderRadius: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', marginBottom: '16px' }}>
                                            <Layers style={{ color: '#5c6567' }} size={32} />
                                        </div>
                                        <p style={{ color: '#5c6567', fontWeight: 500 }}>No BOM recipes found</p>
                                        <button
                                            onClick={() => setEditingTemplate({ name: '', type: 'Book', components: [], isDefault: false })}
                                            style={{ marginTop: '16px', color: '#b5493f', fontWeight: 700 }}
                                        >
                                            Create your first recipe
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <ConfirmDialogComponent />
        </div>
    );
};

export default BOMRecipes;
