import React, { useState, useRef } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronRight, RotateCcw, Upload } from 'lucide-react';
import { generateQuoteFromDescription, extractQuoteFromFile } from '../services/ai/quoteInvoiceGenerator';
import type { AIQuoteResult } from '../utils/aiQuoteParser';

interface AIGeneratorCardProps {
  type: string;
  onPopulate: (data: AIQuoteResult) => void;
}

export const AIGeneratorCard: React.FC<AIGeneratorCardProps> = ({ type, onPopulate }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await extractQuoteFromFile(base64, type === 'Invoice' ? 'invoice' : 'quotation');
      onPopulate(result);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('JSON') || msg.includes('parse') || msg.includes('Unexpected')) {
        alert('Unable to read the document. Please try a different file.');
      } else {
        alert(msg || 'Failed to extract data from file. Please try again.');
      }
    } finally {
      setLoading(false);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async (documentType: 'quotation' | 'invoice') => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const result = await generateQuoteFromDescription(input, documentType);
      onPopulate(result);
      setInput('');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('JSON') || msg.includes('parse') || msg.includes('Unexpected')) {
        alert('Unable to understand the request. Please try again.');
      } else {
        alert(msg || 'AI generation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#FEFDFB] border border-[#D4CFC2]">
      <div className="bg-[#102B28] px-[14px] py-[9px] flex items-center justify-between text-white cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} />
          <span className="text-sm font-semibold">AI Quote / Invoice Generator</span>
        </div>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </div>
      {!collapsed && (
        <div className="p-3 space-y-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Describe the work you want to quote or invoice...\n\nExample:\nInstall 4 air conditioners for ABC Ltd.\nLabour $400\nMaterials $1200\nApply 15% VAT`}
            rows={4}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-colors resize-none placeholder:text-slate-400"
            disabled={loading}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerate(type === 'Invoice' ? 'invoice' : 'quotation')}
              disabled={loading || !input.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] rounded-xl hover:from-[#1D4ED8] hover:to-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Generating with AI...' : `Generate ${type === 'Invoice' ? 'Invoice' : 'Quotation'}`}
            </button>
            <button
              onClick={() => setInput('')}
              disabled={loading || !input.trim()}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={14} />
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">or upload a document</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading && fileName ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {loading && fileName ? `Reading ${fileName}...` : 'Upload PDF or Image'}
          </button>
        </div>
      )}
    </div>
  );
};
