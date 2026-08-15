import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus, Trash2, Save, Layers, Search, Edit2, FileText,
    Clock, DollarSign, Copy, AlertTriangle
} from 'lucide-react';
import type {
    ServiceRecipe, ServiceRecipeLine, ServiceResource,
    ServiceResourceType
} from '../../types';
import { serviceRecipeService } from '../../services/serviceRecipeService';
import { serviceResourceService } from '../../services/serviceResourceService';
import { useInventory } from '../../context/InventoryContext';
import { currencyService } from '../../services/currencyService';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const RESOURCE_TYPES: { label: string; value: ServiceResourceType }[] = [
    { label: 'Inventory', value: 'inventory' },
    { label: 'Labor', value: 'labor' },
    { label: 'Machine', value: 'machine' },
    { label: 'Expense', value: 'expense' },
    { label: 'Service', value: 'service' },
];

const COST_METHODS: { label: string; value: ServiceRecipe['costMethod'] }[] = [
    { label: 'Fixed', value: 'fixed' },
    { label: 'Material Based', value: 'material_based' },
    { label: 'Labor Based', value: 'labor_based' },
    { label: 'Mixed', value: 'mixed' },
];

const ServiceRecipeEditorPage: React.FC = () => {
    const { inventory } = useInventory();
    const { companyConfig } = useAuth();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const [recipes, setRecipes] = useState<ServiceRecipe[]>([]);
    const [resources, setResources] = useState<ServiceResource[]>([]);
    const [editingRecipe, setEditingRecipe] = useState<Partial<ServiceRecipe> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [notify, setNotify] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const showNotify = (message: string, type: 'success' | 'error') => {
        setNotify({ message, type });
        setTimeout(() => setNotify(null), 3000);
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [r, res] = await Promise.all([
                serviceRecipeService.getAllRecipes(),
                serviceResourceService.getAllResources(),
            ]);
            setRecipes(r);
            setResources(res);
        } catch (err) {
            showNotify('Failed to load recipes', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const filteredRecipes = useMemo(() => {
        if (!searchTerm) return recipes;
        const q = searchTerm.toLowerCase();
        return recipes.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q)
        );
    }, [recipes, searchTerm]);

    const inventoryItems = useMemo(() => {
        return inventory.filter((i: any) =>
            i.type !== 'Service' &&
            (i.inventoryRole === 'internal' || i.inventoryRole === 'both' || !i.inventoryRole)
        );
    }, [inventory]);

    const getResourceOptions = (type: ServiceResourceType) => {
        if (type === 'inventory') return inventoryItems;
        return resources.filter(r => r.type === type);
    };

    const getResourceName = (type: ServiceResourceType, resourceId: string): string => {
        if (type === 'inventory') {
            const item = inventoryItems.find((i: any) => i.id === resourceId);
            return item ? item.name : resourceId;
        }
        const res = resources.find(r => r.id === resourceId);
        return res ? res.name : resourceId;
    };

    const getResourceUnit = (type: ServiceResourceType, resourceId: string): string => {
        if (type === 'inventory') {
            const item = inventoryItems.find((i: any) => i.id === resourceId);
            return item?.unit || 'pcs';
        }
        const res = resources.find(r => r.id === resourceId);
        return res?.unit || 'hr';
    };

    const getResourceCost = (type: ServiceResourceType, resourceId: string): number => {
        if (type === 'inventory') {
            const item = inventoryItems.find((i: any) => i.id === resourceId);
            return item?.normalizedCP ?? item?.costPrice ?? item?.cost ?? 0;
        }
        const res = resources.find(r => r.id === resourceId);
        return res?.costPerUnit ?? 0;
    };

    const handleSaveRecipe = async () => {
        if (!editingRecipe?.name) {
            showNotify('Recipe name is required', 'error');
            return;
        }

        try {
            const recipeLines = (editingRecipe.lines || []).map((line, idx) => ({
                ...line,
                lineIndex: idx,
                costPerUnit: getResourceCost(line.resourceType, line.resourceId),
                totalCost: getResourceCost(line.resourceType, line.resourceId) * line.quantity,
            }));

            const recipeToSave: ServiceRecipe = {
                id: editingRecipe.id || '',
                variantId: editingRecipe.variantId || '',
                version: editingRecipe.version || 1,
                name: editingRecipe.name,
                active: editingRecipe.active ?? true,
                costMethod: editingRecipe.costMethod || 'mixed',
                lines: recipeLines,
                totalMaterialCost: 0,
                totalLaborCost: 0,
                totalMachineCost: 0,
                totalOverheadCost: 0,
                totalCost: 0,
                lastCalculatedAt: null,
                validFrom: editingRecipe.validFrom || new Date().toISOString(),
                createdAt: editingRecipe.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const calculated = await serviceRecipeService.recalculateCosts(recipeToSave, resources);
            const saved = await serviceRecipeService.saveRecipe(calculated);

            showNotify('Recipe saved successfully', 'success');
            setEditingRecipe(null);
            loadData();
        } catch (err) {
            showNotify('Failed to save recipe', 'error');
        }
    };

    const handleDeleteRecipe = async (id: string) => {
      setConfirmState({
        open: true,
        title: 'Delete Recipe',
        message: 'Are you sure you want to delete this recipe?',
        type: 'danger',
        confirmText: 'Delete',
        onConfirm: async () => {
          try {
            await serviceRecipeService.deleteRecipe(id);
            showNotify('Recipe deleted', 'success');
            loadData();
          } catch (err) {
            showNotify('Failed to delete recipe', 'error');
          }
        }
      });
    };

    const handleCreateNewVersion = async (recipe: ServiceRecipe) => {
        try {
            const next = await serviceRecipeService.createNewVersion(recipe, `Version ${recipe.version + 1}`);
            showNotify('New version created', 'success');
            setEditingRecipe(next);
            loadData();
        } catch (err) {
            showNotify('Failed to create new version', 'error');
        }
    };

    const addLine = () => {
        if (!editingRecipe) return;
        const newLine: ServiceRecipeLine = {
            id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            recipeId: editingRecipe.id || '',
            lineIndex: (editingRecipe.lines || []).length,
            resourceType: 'inventory',
            resourceId: '',
            resourceName: '',
            quantity: 1,
            unit: 'pcs',
            costPerUnit: 0,
            totalCost: 0,
        };
        setEditingRecipe({
            ...editingRecipe,
            lines: [...(editingRecipe.lines || []), newLine],
        });
    };

    const updateLine = (index: number, field: string, value: any) => {
        if (!editingRecipe?.lines) return;
        const newLines = [...editingRecipe.lines];
        const line = { ...newLines[index] };

        if (field === 'resourceType') {
            line.resourceType = value;
            line.resourceId = '';
            line.resourceName = '';
            line.unit = 'pcs';
            line.costPerUnit = 0;
            line.totalCost = 0;
        } else if (field === 'resourceId') {
            line.resourceId = value;
            line.resourceName = getResourceName(line.resourceType, value);
            line.unit = getResourceUnit(line.resourceType, value);
            line.costPerUnit = getResourceCost(line.resourceType, value);
            line.totalCost = line.costPerUnit * line.quantity;
        } else if (field === 'quantity') {
            line.quantity = parseFloat(value) || 0;
            line.totalCost = line.costPerUnit * line.quantity;
        } else {
            (line as Record<string, unknown>)[field] = value;
        }

        newLines[index] = line;
        setEditingRecipe({ ...editingRecipe, lines: newLines });
    };

    const removeLine = (index: number) => {
        if (!editingRecipe?.lines) return;
        setEditingRecipe({
            ...editingRecipe,
            lines: editingRecipe.lines.filter((_, i) => i !== index),
        });
    };

    const costSummary = useMemo(() => {
        if (!editingRecipe?.lines) return { totalMaterialCost: 0, totalLaborCost: 0, totalMachineCost: 0, totalOverheadCost: 0, totalCost: 0 };
        const lines = editingRecipe.lines.map(l => ({
            ...l,
            totalCost: getResourceCost(l.resourceType, l.resourceId) * l.quantity,
        }));
        let totalMaterialCost = 0, totalLaborCost = 0, totalMachineCost = 0, totalOverheadCost = 0;
        for (const l of lines) {
            switch (l.resourceType) {
                case 'inventory': totalMaterialCost += l.totalCost; break;
                case 'labor': totalLaborCost += l.totalCost; break;
                case 'machine': totalMachineCost += l.totalCost; break;
                case 'expense': case 'service': totalOverheadCost += l.totalCost; break;
            }
        }
        const totalCost = totalMaterialCost + totalLaborCost + totalMachineCost + totalOverheadCost;
        return { totalMaterialCost, totalLaborCost, totalMachineCost, totalOverheadCost, totalCost };
    }, [editingRecipe?.lines]);

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Service Recipes</h2>
                        <p className="text-sm text-slate-500">Define service recipes with labor, materials, machines, and overhead costing</p>
                    </div>
                </div>
            </div>

            {notify && (
                <div className={`mx-6 mt-4 p-3 rounded-xl text-xs font-bold ${
                    notify.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    {notify.message}
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-6">
                    {editingRecipe ? (
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 animate-in fade-in slide-in-from-top-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg text-slate-900">
                                    {editingRecipe.id ? 'Edit Service Recipe' : 'New Service Recipe'}
                                    {editingRecipe.version && <span className="ml-2 text-xs text-slate-400">v{editingRecipe.version}</span>}
                                </h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingRecipe(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                    <button onClick={handleSaveRecipe} className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 shadow-lg shadow-teal-200 transition-all">
                                        <Save size={18} /> Save Recipe
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Recipe Name</label>
                                    <input
                                        type="text"
                                        value={editingRecipe.name || ''}
                                        onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                                        placeholder="e.g. Standard Binding Service"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Cost Method</label>
                                    <select
                                        value={editingRecipe.costMethod || 'mixed'}
                                        onChange={e => setEditingRecipe({ ...editingRecipe, costMethod: e.target.value as ServiceRecipe['costMethod'] })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                                    >
                                        {COST_METHODS.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Active</label>
                                    <div className="flex items-center gap-3 h-10">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={editingRecipe.active ?? true}
                                                onChange={e => setEditingRecipe({ ...editingRecipe, active: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                            />
                                            <span className="text-sm text-slate-600">Active (current version)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                        <Layers size={18} className="text-teal-600" /> Recipe Lines
                                    </h4>
                                    <button onClick={addLine} className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 font-bold text-sm">
                                        <Plus size={18} /> Add Line
                                    </button>
                                </div>

                                <div className="prime-card overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr>
                                                <th className="prime-table-header">Resource Type</th>
                                                <th className="prime-table-header">Resource</th>
                                                <th className="prime-table-header">Quantity</th>
                                                <th className="prime-table-header">Unit</th>
                                                <th className="prime-table-header">Cost/Unit</th>
                                                <th className="prime-table-header">Total</th>
                                                <th className="prime-table-header">Formula</th>
                                                <th className="prime-table-header w-20"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {editingRecipe.lines?.map((line, idx) => {
                                                const options = getResourceOptions(line.resourceType);
                                                const unitCost = getResourceCost(line.resourceType, line.resourceId);
                                                const lineTotal = unitCost * line.quantity;
                                                return (
                                                    <tr key={line.id || idx}>
                                                        <td className="px-4 py-2">
                                                            <select
                                                                value={line.resourceType}
                                                                onChange={e => updateLine(idx, 'resourceType', e.target.value)}
                                                                className="w-full bg-transparent outline-none focus:text-teal-600 text-xs"
                                                            >
                                                                {RESOURCE_TYPES.map(t => (
                                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <select
                                                                value={line.resourceId}
                                                                onChange={e => updateLine(idx, 'resourceId', e.target.value)}
                                                                className="w-full bg-transparent outline-none focus:text-teal-600 text-xs max-w-[160px]"
                                                            >
                                                                <option value="">Select...</option>
                                                                {options.map((opt: any) => (
                                                                    <option key={opt.id} value={opt.id}>
                                                                        {opt.name || opt.resourceName}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="any"
                                                                value={line.quantity}
                                                                onChange={e => updateLine(idx, 'quantity', e.target.value)}
                                                                className="w-20 bg-transparent outline-none focus:text-teal-600 text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 text-xs text-slate-500">
                                                            {line.unit || getResourceUnit(line.resourceType, line.resourceId)}
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-mono text-slate-600">
                                                            {currency}{unitCost.toFixed(4)}
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-bold text-slate-800">
                                                            {currency}{lineTotal.toFixed(2)}
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="text"
                                                                value={line.formula || ''}
                                                                onChange={e => updateLine(idx, 'formula', e.target.value)}
                                                                placeholder="Optional"
                                                                className="w-24 bg-transparent outline-none focus:text-teal-600 font-mono text-[10px]"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <button onClick={() => removeLine(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {(!editingRecipe.lines || editingRecipe.lines.length === 0) && (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">
                                                        No lines added. Click "Add Line" to define recipe resources.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="prime-card p-4">
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                        <div>
                                            <span className="prime-section-title">Materials</span>
                                            <p className="text-lg font-bold" style={{ color: '#23282A' }}>{currency}{costSummary.totalMaterialCost.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Labor</span>
                                            <p className="text-lg font-bold text-slate-800">{currency}{costSummary.totalLaborCost.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Machine</span>
                                            <p className="text-lg font-bold text-slate-800">{currency}{costSummary.totalMachineCost.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Overhead</span>
                                            <p className="text-lg font-bold text-slate-800">{currency}{costSummary.totalOverheadCost.toFixed(2)}</p>
                                        </div>
                                        <div className="border-l border-slate-200 pl-4">
                                            <span className="text-[10px] font-bold text-teal-600 uppercase tracking-tight">Total Cost</span>
                                            <p className="text-lg font-bold text-teal-700">{currency}{costSummary.totalCost.toFixed(2)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {editingRecipe.id && (
                                <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
                                    <button
                                        onClick={() => handleCreateNewVersion(editingRecipe as ServiceRecipe)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                                    >
                                        <Copy size={16} /> Create New Version
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="relative w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search recipes..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm"
                                    />
                                </div>
                                <button
                                    onClick={() => setEditingRecipe({
                                        name: '',
                                        costMethod: 'mixed',
                                        active: true,
                                        lines: [],
                                        variantId: '',
                                        version: 1,
                                        validFrom: new Date().toISOString(),
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
                                    })}
                                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 shadow-lg shadow-teal-200 transition-all"
                                >
                                    <Plus size={18} /> Create Recipe
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="py-12 text-center text-slate-400">Loading...</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredRecipes.map(recipe => (
                                        <div key={recipe.id} className="group bg-white border border-slate-200 p-5 rounded-2xl hover:border-teal-500 hover:shadow-md transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                        recipe.costMethod === 'fixed' ? 'bg-blue-50 text-blue-600' :
                                                        recipe.costMethod === 'material_based' ? 'bg-purple-50 text-purple-600' :
                                                        recipe.costMethod === 'labor_based' ? 'bg-amber-50 text-amber-600' :
                                                        'bg-slate-50 text-slate-600'
                                                    }`}>
                                                        {recipe.costMethod.replace('_', ' ')}
                                                    </span>
                                                    {!recipe.active && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-500">Inactive</span>}
                                                    <h4 className="font-bold text-slate-900 mt-1">{recipe.name}</h4>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditingRecipe(recipe)} className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <span className="flex items-center gap-1"><Layers size={14} /> {recipe.lines?.length || 0} Lines</span>
                                                <span className="flex items-center gap-1"><DollarSign size={14} /> {currency}{recipe.totalCost.toFixed(2)}</span>
                                            </div>
                                            <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-2">
                                                <Clock size={12} /> v{recipe.version} · Updated {new Date(recipe.updatedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredRecipes.length === 0 && (
                                        <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                            <div className="p-4 bg-white rounded-2xl shadow-sm mb-4">
                                                <FileText className="text-slate-300" size={32} />
                                            </div>
                                            <p className="text-slate-500 font-medium">No service recipes found</p>
                                            <button
                                                onClick={() => setEditingRecipe({
                                                    name: '',
                                                    costMethod: 'mixed',
                                                    active: true,
                                                    lines: [],
                                                    variantId: '',
                                                    version: 1,
                                                    validFrom: new Date().toISOString(),
                                                    createdAt: new Date().toISOString(),
                                                    updatedAt: new Date().toISOString(),
                                                })}
                                                className="mt-4 text-teal-600 font-bold hover:underline"
                                            >
                                                Create your first recipe
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
            </div>
        </div>

            <ConfirmDialog
              open={confirmState.open}
              onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
              onConfirm={() => {
                confirmState.onConfirm?.();
                setConfirmState(c => ({ ...c, open: false }));
              }}
              onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
              title={confirmState.title}
              message={confirmState.message}
              confirmText={confirmState.confirmText}
              type={confirmState.type || 'question'}
            />
    </div>
  );
};

export default ServiceRecipeEditorPage;
