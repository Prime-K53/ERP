import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { MessageCircle, Send, Search, User, Sparkles, Phone, Mail, MoreVertical, Smile, Paperclip, X, ArrowLeft, WifiOff, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { generateAIResponse } from '../../services/geminiService';
import { useNavigate } from 'react-router-dom';

interface Contact {
  id: string;
  name: string;
  contact: string;
}

const STATIC_TEMPLATES = [
{ label: 'Customer Appreciation', text: "Every order you place inspires us to do even better. The right print materials can open new doors for growth. Your next campaign could benefit from fresh flyers, banners, packaging, and branded merchandise." },
    { label: 'Business Growth Inspiration', text: "It is always a pleasure serving a customer like you. Every successful brand begins with a strong first impression. We are ready to produce quality marketing materials that help your brand stand out from the crowd." },
    { label: 'Service Promotion', text: "Your loyalty is deeply appreciated. The right print materials can open new doors for growth. Whenever you are ready, we can create eye-catching banners, brochures, menus, and marketing materials." },
    { label: 'Repeat Customer Encouragement', text: "Your confidence in our printing team means a lot to us. Every successful brand begins with a strong first impression. We are ready to help with business cards, flyers, banners, stickers, labels, and branded merchandise." },
];


const ChatApp: React.FC = () => {
  const { user, isOnline } = useAuth();
  const { invoices } = useFinance();
  const { customerPayments } = useSales();
  const { purchases } = useInventory();
  const navigate = useNavigate();
  
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Combine and filter contacts from transactions
  const allContacts = React.useMemo(() => {
    const contactsMap = new Map<string, Contact>();
    
    invoices?.forEach(inv => {
      if (inv.customerName && !contactsMap.has(inv.customerName)) {
        contactsMap.set(inv.customerName, { id: inv.customerName, name: inv.customerName, contact: '' });
      }
    });
    
    customerPayments?.forEach(rec => {
      if (rec.customerName && !contactsMap.has(rec.customerName)) {
        contactsMap.set(rec.customerName, { id: rec.customerName, name: rec.customerName, contact: '' });
      }
    });
    
    purchases?.forEach(p => {
      if (p.supplierId && !contactsMap.has(p.supplierId)) {
        contactsMap.set(p.supplierId, { id: p.supplierId, name: p.supplierId, contact: '' });
      }
    });
    
    return Array.from(contactsMap.values()).filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices, customerPayments, purchases, searchTerm]);

  const handleSendMessage = (method: 'whatsapp' | 'sms') => {
    if (!activeContact || !message) return;
    
    const phone = String(activeContact.contact || '').replace(/\D/g, '');
    
    if (method === 'whatsapp') {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt) return;
    
    if (!isOnline) {
        return; // Handled by UI state
    }

    setIsGenerating(true);
    try {
      const context = `
        Sender: ${user?.name || 'Company Representative'}
        Recipient: ${activeContact?.name || 'Valued Customer'}
        Goal: Create a professional yet friendly message.
      `;
      
      const response = await generateAIResponse(
        `Context: ${context}. Requirement: ${aiPrompt}. Keep it concise and suitable for WhatsApp/SMS.`,
        "You are a helpful business communication assistant."
      );
      
      setMessage(response);
      setShowAiModal(false);
      setAiPrompt('');
    } catch (error) {
      logger.error("AI Error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const insertTemplate = (text: string) => {
      setMessage(text);
      setShowAiModal(false);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-slate-100 overflow-hidden">
      {/* Left Sidebar: Contacts */}
      <div className={`w-full md:w-80 bg-white border-r border-slate-200 flex-col ${activeContact ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 mb-4">
             <button onClick={() => navigate('/')} className="md:hidden p-2 hover:bg-slate-200 rounded-full"><ArrowLeft size={20}/></button>
             <h2 className="text-lg font-bold text-slate-800">Messages</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
            <input 
              type="text" 
              className="w-full pl-9 p-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {allContacts.map(contact => (
            <div 
              key={contact.id}
              onClick={() => setActiveContact(contact)}
              className={`flex items-center gap-3 p-4 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors ${activeContact?.id === contact.id ? 'bg-blue-50 border-blue-100' : ''}`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold shrink-0">
                {contact.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 truncate text-sm">{contact.name}</div>
                <div className="text-xs text-slate-500 truncate">{contact.contact}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Area: Chat Interface */}
      {activeContact ? (
        <div className="flex-1 flex flex-col bg-[#e5ddd5] relative">
          {/* Chat Header */}
          <div className="h-16 bg-slate-100 border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setActiveContact(null)} className="md:hidden p-2 hover:bg-slate-200 rounded-full text-slate-600">
                <ArrowLeft size={20}/>
              </button>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                {activeContact.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-slate-800 text-sm">{activeContact.name}</div>
                <div className="text-xs text-slate-500">{activeContact.contact}</div>
              </div>
            </div>
            <div className="flex gap-2">
               <button className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title="Call" aria-label="Call contact"><Phone size={20}/></button>
               <button className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title="More options" aria-label="More options"><MoreVertical size={20}/></button>
            </div>
          </div>

          {/* Chat Body (Placeholder for history) */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col items-center justify-center opacity-50">
             <MessageCircle size={48} className="text-slate-400 mb-2"/>
             <p className="text-slate-500 text-sm">Start a new conversation via WhatsApp or SMS</p>
          </div>

          {/* Message Input Area */}
          <div className="p-3 bg-slate-100 border-t border-slate-200">
             {/* AI/Template Modal Overlay */}
             {showAiModal && (
               <div className="absolute bottom-20 left-4 right-4 md:left-20 md:right-20 bg-white rounded-xl shadow-2xl border border-purple-100 p-4 animate-in slide-in-from-bottom-4 z-20">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-purple-800 flex items-center gap-2 text-sm">
                        {isOnline ? <><Sparkles size={16}/> AI Message Generator</> : <><FileText size={16}/> Offline Templates</>}
                    </h4>
                    <button onClick={() => setShowAiModal(false)}><X size={16} className="text-slate-400"/></button>
                  </div>
                  
                  {isOnline ? (
                      <div className="flex gap-2">
                        <input 
                          autoFocus
                          className="flex-1 p-2 border border-slate-200 rounded-lg text-sm"
                          placeholder="E.g., Polite payment reminder for invoice #123..."
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
                        />
                        <button 
                          onClick={handleAiGenerate}
                          disabled={isGenerating}
                          className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-purple-700 disabled:opacity-50"
                        >
                          {isGenerating ? 'Generating...' : 'Create'}
                        </button>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {STATIC_TEMPLATES.map((t, i) => (
                              <button 
                                key={i}
                                onClick={() => insertTemplate(t.text)}
                                className="text-left p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm group transition-colors"
                              >
                                  <div className="font-bold text-slate-700 mb-1 group-hover:text-blue-600">{t.label}</div>
                                  <div className="text-xs text-slate-500 truncate">{t.text}</div>
                              </button>
                          ))}
                      </div>
                  )}

                  {isOnline && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                          <p className="text-xs font-bold text-slate-400 mb-2 uppercase">Quick Templates</p>
                          <div className="flex flex-wrap gap-2">
                              {STATIC_TEMPLATES.slice(0,3).map((t,i) => (
                                  <button key={i} onClick={() => insertTemplate(t.text)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded border border-slate-200">
                                      {t.label}
                                  </button>
                              ))}
                          </div>
                      </div>
                  )}
               </div>
             )}

             <div className="flex items-end gap-2 max-w-4xl mx-auto">
                <button 
                    onClick={() => setShowAiModal(!showAiModal)} 
                    className={`p-2 rounded-full shadow-sm border transition-colors ${showAiModal ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-white text-purple-600 hover:bg-purple-50 border-slate-200'}`} 
                    title={isOnline ? "AI Assistant" : "Templates"}
                >
                   {isOnline ? <Sparkles size={18}/> : <FileText size={18}/>}
                </button>
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col p-2">
                   <textarea 
                      className="w-full max-h-32 p-1 resize-none outline-none text-sm bg-transparent"
                      placeholder="Type a message..."
                      rows={1}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                   />
                </div>
                <button onClick={() => handleSendMessage('whatsapp')} className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 shadow-sm transition-colors" title="Send WhatsApp">
                   <Send size={18}/>
                </button>
             </div>
             <div className="text-center mt-1">
                <button onClick={() => handleSendMessage('sms')} className="text-[10px] text-slate-500 hover:text-slate-700 underline">Send as SMS instead</button>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-slate-50 border-l border-slate-200 text-slate-400">
           <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
              <MessageCircle size={48} className="text-blue-200"/>
           </div>
           <h3 className="text-lg font-bold text-slate-600">Select a contact to start chatting</h3>
           <p className="text-sm max-w-xs text-center mt-2">Send WhatsApp or SMS messages directly from your dashboard using {isOnline ? 'AI' : 'smart'} templates.</p>
        </div>
      )}
    </div>
  );
};

export default ChatApp;
