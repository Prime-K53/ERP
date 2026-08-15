import React, { useEffect, useState } from 'react';
import { Layers, Plus, Trash2, GripVertical, Palette, Save, X, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import type { ProductAttribute, AttributeValue, AttributeDisplayType } from '../../../types/attributes';
import { useAttributeStore } from '../../../stores/attributeStore';

const DISPLAY_TYPES: { value: AttributeDisplayType; label: string }[] = [
  { value: 'pills', label: 'Pills' },
  { value: 'color', label: 'Color Swatch' },
  { value: 'radio', label: 'Radio' },
  { value: 'select', label: 'Dropdown' },
];

function generateId(): string {
  return 'attr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export const AttributesTab: React.FC = () => {
  const { attributes, isLoading, error, fetchAttributes, addAttribute, updateAttribute, deleteAttribute, addAttributeValue, updateAttributeValue, removeAttributeValue } = useAttributeStore();
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrDisplay, setNewAttrDisplay] = useState<AttributeDisplayType>('pills');
  const [newValueText, setNewValueText] = useState<Record<string, string>>({});
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    fetchAttributes();
  }, []);

  const handleCreateAttribute = async () => {
    const name = newAttrName.trim();
    if (!name) return;
    const attr: ProductAttribute = {
      id: generateId(),
      name,
      displayType: newAttrDisplay,
      values: [],
      sortOrder: attributes.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await addAttribute(attr);
    setNewAttrName('');
    setNewAttrDisplay('pills');
    setShowNewForm(false);
  };

  const handleAddValue = async (attrId: string) => {
    const text = (newValueText[attrId] || '').trim();
    if (!text) return;
    const attr = attributes.find((a) => a.id === attrId);
    if (!attr) return;
    const value: AttributeValue = {
      id: generateId(),
      value: text.toLowerCase().replace(/\s+/g, '_'),
      label: text,
      extraPrice: 0,
      sortOrder: attr.values.length,
    };
    await addAttributeValue(attrId, value);
    setNewValueText((p) => ({ ...p, [attrId]: '' }));
  };

  const handleRemoveValue = async (attrId: string, valueId: string) => {
    await removeAttributeValue(attrId, valueId);
  };

  const handleUpdateValueExtraPrice = async (attrId: string, valueId: string, extraPrice: number) => {
    await updateAttributeValue(attrId, valueId, { extraPrice });
  };

  const handleUpdateValueLabel = async (attrId: string, valueId: string, label: string) => {
    await updateAttributeValue(attrId, valueId, {
      label,
      value: label.toLowerCase().replace(/\s+/g, '_'),
    });
  };

  const handleUpdateValueColor = async (attrId: string, valueId: string, colorCode: string) => {
    await updateAttributeValue(attrId, valueId, { colorCode });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-[#1f8577] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#23282A]">Product Attributes</h2>
          <p className="text-sm text-[#5c6567] mt-1">Define attributes like Size, Color, Material to auto-generate product variants</p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1f8577] text-white text-sm font-semibold rounded-lg hover:bg-[#1a7366] transition-all"
        >
          <Plus size={16} />
          New Attribute
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {showNewForm && (
        <div className="bg-[#eef7f6] border border-[#D4D7DC] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#23282A] mb-1">Attribute Name</label>
              <input
                type="text"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                placeholder="e.g. Size, Color, Material"
                className="w-full px-3 py-2 border border-[#D4D7DC] rounded-lg text-sm outline-none focus:border-[#1f8577]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#23282A] mb-1">Display Type</label>
              <select
                value={newAttrDisplay}
                onChange={(e) => setNewAttrDisplay(e.target.value as AttributeDisplayType)}
                className="w-full px-3 py-2 border border-[#D4D7DC] rounded-lg text-sm outline-none focus:border-[#1f8577]"
              >
                {DISPLAY_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleCreateAttribute}
                disabled={!newAttrName.trim()}
                className="px-4 py-2 bg-[#1f8577] text-white text-sm font-semibold rounded-lg hover:bg-[#1a7366] disabled:opacity-50 transition-all"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 border border-[#D4D7DC] text-sm font-semibold rounded-lg hover:bg-[#eef7f6] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {attributes.length === 0 && (
        <div className="text-center py-16" style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC' }}>
          <Layers size={40} className="mx-auto text-[#e4ddd1] mb-3" />
          <p className="text-[#5c6567] text-sm">No attributes defined yet</p>
          <p className="text-[#5c6567] text-xs mt-1">Create attributes like Size or Color to generate product variants automatically</p>
        </div>
      )}

      <div className="space-y-4">
        {attributes.map((attr) => {
          const isEditing = editingAttr === attr.id;
          return (
            <div key={attr.id} style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC' }}>
              <div className="flex items-center justify-between px-4 py-3 bg-[#eef7f6] border-b border-[#D4D7DC]">
                <div className="flex items-center gap-3">
                  <GripVertical size={16} className="text-[#5c6567] cursor-move" />
                  <span className="font-bold text-[#23282A]">{attr.name}</span>
                  <span className="text-xs text-[#5c6567] bg-[#e4ddd1] px-2 py-0.5 rounded-full">{attr.displayType}</span>
                  <span className="text-xs text-[#5c6567]">{attr.values.length} values</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingAttr(isEditing ? null : attr.id)}
                    className="text-xs text-[#1f8577] hover:text-[#1f8577] font-semibold transition-all"
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => deleteAttribute(attr.id)}
                    className="text-xs text-[#b5493f] hover:text-[#b5493f] transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-2">
                {attr.values.length === 0 && (
                  <p className="text-xs text-[#5c6567] italic">No values yet. Add values below.</p>
                )}
                {attr.values.map((val) => (
                  <div key={val.id} className="flex items-center gap-3 py-1.5 border-b border-[#D4D7DC] last:border-0">
                    {attr.displayType === 'color' && (
                      <input
                        type="color"
                        value={val.colorCode || '#000000'}
                        onChange={(e) => handleUpdateValueColor(attr.id, val.id, e.target.value)}
                        className="w-8 h-8 rounded border border-[#D4D7DC] cursor-pointer"
                      />
                    )}
                    {isEditing ? (
                      <input
                        type="text"
                        value={val.label}
                        onChange={(e) => handleUpdateValueLabel(attr.id, val.id, e.target.value)}
                        className="flex-1 px-2 py-1 border border-[#D4D7DC] rounded text-sm outline-none focus:border-[#1f8577]"
                      />
                    ) : (
                      <span className="flex-1 text-sm text-[#23282A]">{val.label}</span>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#5c6567]">Extra:</label>
                      <input
                        type="number"
                        value={val.extraPrice}
                        onChange={(e) => handleUpdateValueExtraPrice(attr.id, val.id, Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-[#D4D7DC] rounded text-xs outline-none focus:border-[#1f8577]"
                        step="any"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveValue(attr.id, val.id)}
                      className="text-[#b5493f] hover:text-[#b5493f] transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={newValueText[attr.id] || ''}
                    onChange={(e) => setNewValueText((p) => ({ ...p, [attr.id]: e.target.value }))}
                    placeholder="Add value..."
                    className="flex-1 px-2 py-1.5 border border-[#D4D7DC] rounded text-sm outline-none focus:border-[#1f8577]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddValue(attr.id);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleAddValue(attr.id)}
                    disabled={!(newValueText[attr.id] || '').trim()}
                    className="px-3 py-1.5 bg-[#e4ddd1] text-[#23282A] text-xs font-semibold rounded-lg hover:bg-[#e4ddd1] disabled:opacity-50 transition-all"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
