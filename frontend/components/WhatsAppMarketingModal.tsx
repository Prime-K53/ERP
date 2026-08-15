import React, { useState } from 'react';
import { 
  MessageSquare, Send, X, Users, MessageCircle, 
  Sparkles, Check, ChevronRight, Copy, Wand2, Loader2
} from 'lucide-react';
import { getPlaceholder } from '../constants/placeholders';
import { aiService } from '../services/aiService';
import { Dialog, DialogHeader, DialogTitle } from './Dialog';

const AI_TEMPLATES = [
{
        id: 'ai-msg-001',
        name: 'Customer Appreciation',
        description: 'Appreciation - Customer Appreciation',
        content: "Every order you place inspires us to do even better. The right print materials can open new doors for growth. Your next campaign could benefit from fresh flyers, banners, packaging, and branded merchandise."
    },
    {
        id: 'ai-msg-002',
        name: 'Business Growth Inspiration',
        description: 'Growth - Business Growth Inspiration',
        content: "It is always a pleasure serving a customer like you. Every successful brand begins with a strong first impression. We are ready to produce quality marketing materials that help your brand stand out from the crowd."
    },
    {
        id: 'ai-msg-003',
        name: 'Service Promotion',
        description: 'Promotion - Service Promotion',
        content: "Your loyalty is deeply appreciated. The right print materials can open new doors for growth. Whenever you are ready, we can create eye-catching banners, brochures, menus, and marketing materials."
    },
    {
        id: 'ai-msg-004',
        name: 'Repeat Customer Encouragement',
        description: 'Retention - Repeat Customer Encouragement',
        content: "Your confidence in our printing team means a lot to us. Every successful brand begins with a strong first impression. We are ready to help with business cards, flyers, banners, stickers, labels, and branded merchandise."
    },
    {
        id: 'ai-msg-006',
        name: 'Corporate Client Engagement',
        description: 'Corporate - Corporate Client Engagement',
        content: "We are honored that you chose us for your printing needs. Every successful brand begins with a strong first impression. We would love to help with your next batch of business cards, flyers, stickers, or event prints."
    },
    {
        id: 'ai-msg-007',
        name: 'Seasonal Motivation',
        description: 'Seasonal - Seasonal Motivation',
        content: "We truly appreciate your continued support. The right print materials can open new doors for growth. Ask us about brochures, posters, packaging, T-shirts, and promotional materials for your next campaign."
    },
    {
        id: 'ai-msg-008',
        name: 'Premium Brand Positioning',
        description: 'Premium - Premium Brand Positioning',
        content: "We are grateful to be part of your journey. Every successful brand begins with a strong first impression. We can help transform your ideas into professional print products that customers will notice."
    },
    {
        id: 'ai-msg-009',
        name: 'Project Follow-up',
        description: 'FollowUp - Project Follow-up',
        content: "Thank you for choosing quality and professionalism. The right print materials can open new doors for growth. Let us help you prepare professional brochures, signage, labels, and branded products that attract attention."
    },
    {
        id: 'ai-msg-010',
        name: 'Brand Visibility Inspiration',
        description: 'Visibility - Brand Visibility Inspiration',
        content: "Thank you for trusting us with your vision. Every successful brand begins with a strong first impression. Our team can support your next project with invitations, receipt books, calendars, labels, and custom prints."
    },
    {
        id: 'ai-msg-011',
        name: 'Customer Appreciation',
        description: 'Appreciation - Customer Appreciation',
        content: "We are truly grateful for your continued trust in our printing services. The right print materials can open new doors for growth. Your next campaign could benefit from fresh flyers, banners, packaging, and branded merchandise."
    },
    {
        id: 'ai-msg-012',
        name: 'Business Growth Inspiration',
        description: 'Growth - Business Growth Inspiration',
        content: "We admire your dedication to growing your business every day. Every successful brand begins with a strong first impression. We are ready to produce quality marketing materials that help your brand stand out from the crowd."
    },
    {
        id: 'ai-msg-013',
        name: 'Service Promotion',
        description: 'Promotion - Service Promotion',
        content: "We value the relationship we have built with you over time. The right print materials can open new doors for growth. Whenever you are ready, we can create eye-catching banners, brochures, menus, and marketing materials."
    },
    {
        id: 'ai-msg-014',
        name: 'Repeat Customer Encouragement',
        description: 'Retention - Repeat Customer Encouragement',
        content: "We treasure the long-standing relationship we share with you. Every successful brand begins with a strong first impression. We are ready to help with business cards, flyers, banners, stickers, labels, and branded merchandise."
    },
    {
        id: 'ai-msg-016',
        name: 'Corporate Client Engagement',
        description: 'Corporate - Corporate Client Engagement',
        content: "Your corporate partnership is greatly valued by our entire team. Every successful brand begins with a strong first impression. We would love to help with your next batch of business cards, flyers, stickers, or event prints."
    },
    {
        id: 'ai-msg-017',
        name: 'Seasonal Motivation',
        description: 'Seasonal - Seasonal Motivation',
        content: "As the seasons change, we remain grateful for your partnership. The right print materials can open new doors for growth. Ask us about brochures, posters, packaging, T-shirts, and promotional materials for your next campaign."
    },
    {
        id: 'ai-msg-018',
        name: 'Premium Brand Positioning',
        description: 'Premium - Premium Brand Positioning',
        content: "Your commitment to excellence inspires our premium service approach. Every successful brand begins with a strong first impression. We can help transform your ideas into professional print products that customers will notice."
    },
    {
        id: 'ai-msg-019',
        name: 'Project Follow-up',
        description: 'FollowUp - Project Follow-up',
        content: "We wanted to follow up on your recent experience with us. The right print materials can open new doors for growth. Let us help you prepare professional brochures, signage, labels, and branded products that attract attention."
    },
    {
        id: 'ai-msg-020',
        name: 'Brand Visibility Inspiration',
        description: 'Visibility - Brand Visibility Inspiration',
        content: "We believe your brand deserves to be seen by everyone. Every successful brand begins with a strong first impression. Our team can support your next project with invitations, receipt books, calendars, labels, and custom prints."
    },
    {
        id: 'ai-msg-021',
        name: 'Customer Appreciation',
        description: 'Appreciation - Customer Appreciation',
        content: "Your support means the world to our entire printing team. The right print materials can open new doors for growth. Your next campaign could benefit from fresh flyers, banners, packaging, and branded merchandise."
    },
    {
        id: 'ai-msg-022',
        name: 'Business Growth Inspiration',
        description: 'Growth - Business Growth Inspiration',
        content: "Your ambitious spirit inspires our team to deliver our best work. Every successful brand begins with a strong first impression. We are ready to produce quality marketing materials that help your brand stand out from the crowd."
    },
    {
        id: 'ai-msg-023',
        name: 'Service Promotion',
        description: 'Promotion - Service Promotion',
        content: "Your continued partnership inspires us to innovate constantly. The right print materials can open new doors for growth. Whenever you are ready, we can create eye-catching banners, brochures, menus, and marketing materials."
    },
    {
        id: 'ai-msg-024',
        name: 'Repeat Customer Encouragement',
        description: 'Retention - Repeat Customer Encouragement',
        content: "Your consistent trust in our services is truly humbling. Every successful brand begins with a strong first impression. We are ready to help with business cards, flyers, banners, stickers, labels, and branded merchandise."
    },
];


interface WhatsAppMarketingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
}

const WhatsAppMarketingModal: React.FC<WhatsAppMarketingModalProps> = ({ 
  open, 
  onOpenChange,
  companyName
}) => {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendToGroup, setSendToGroup] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'templates' | 'message'>('templates');
  const [aiDescription, setAiDescription] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleApplyTemplate = (template: typeof AI_TEMPLATES[0]) => {
    let content = template.content.replace(/\[Company Name\]/g, companyName || 'Prime ERP');
    setMessage(content);
    setSelectedTemplate(template.id);
    setActiveSection('message');
  };

  const handleGenerateWithAI = async () => {
    if (!aiDescription.trim()) return;
    setGenerating(true);
    try {
      const result = await aiService.generateTemplate(aiDescription);
      if (result) {
        setMessage(result.content.replace(/{{company}}/g, companyName || 'Prime ERP'));
        setSelectedTemplate('ai-generated');
        setActiveSection('message');
      } else {
        alert('AI generation failed. Please check your AI settings in Marketing Messages.');
      }
    } catch {
      alert('Failed to generate template. Ensure AI is configured.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = () => {
    if (!message.trim()) return;

    let url = '';
    if (sendToGroup) {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    } else {
      const cleanPhone = recipient.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        alert('Please enter a valid phone number for direct messaging.');
        return;
      }
      url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  const handleClose = () => {
    setRecipient('');
    setMessage('');
    setSendToGroup(false);
    setSelectedTemplate(null);
    setActiveSection('templates');
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogHeader className="flex items-center justify-between border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-slate-800">
              WhatsApp Marketing
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Send marketing messages to customers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={!message.trim() || (!sendToGroup && !recipient.trim())}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            Launch WhatsApp
          </button>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </DialogHeader>

      <div className="flex border-t border-slate-200">
        <div className="w-48 bg-slate-50 border-r border-slate-200 py-4">
          <button
            onClick={() => setActiveSection('templates')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              activeSection === 'templates'
                ? 'bg-emerald-50 text-emerald-600 border-r-2 border-emerald-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Templates
          </button>
          <button
            onClick={() => setActiveSection('message')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              activeSection === 'message'
                ? 'bg-emerald-50 text-emerald-600 border-r-2 border-emerald-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Message
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {activeSection === 'templates' && (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                {/* AI Generator */}
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Wand2 size={16} className="text-indigo-600" />
                    <span className="text-sm font-bold text-indigo-700">Generate with AI</span>
                  </div>
                  <textarea
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    placeholder="Describe the message you want...&#10;e.g. A friendly reminder for customers with overdue invoices"
                    className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20 mb-2"
                  />
                  <button
                    onClick={handleGenerateWithAI}
                    disabled={generating || !aiDescription.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {generating ? 'Generating...' : 'Generate Template'}
                  </button>
                </div>

                <h3 className="text-sm font-semibold text-slate-700 mb-4">AI-Generated Templates</h3>
                {AI_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleApplyTemplate(template)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${
                      selectedTemplate === template.id 
                        ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                        : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`font-semibold ${selectedTemplate === template.id ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {template.name}
                      </span>
                      {selectedTemplate === template.id && (
                        <Check size={16} className="text-emerald-600" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed group-hover:text-slate-600">
                      {template.description}
                    </p>
                  </button>
                ))}
                
                <div className="mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                  <p className="text-[11px] text-indigo-600/70 uppercase font-bold tracking-widest flex items-center gap-2">
                    <Sparkles size={10} /> Pro Tip
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Use placeholders like [Customer Name] to personalize your messages before sending.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'message' && (
              <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    onClick={() => setSendToGroup(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      !sendToGroup ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <MessageCircle size={16} /> Direct
                  </button>
                  <button
                    onClick={() => setSendToGroup(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      sendToGroup ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Users size={16} /> Group/Anyone
                  </button>
                </div>

                {!sendToGroup && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder={getPlaceholder.phone()}
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                )}

                {sendToGroup && (
                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                    <p className="text-xs text-orange-700 font-medium">
                      Choosing "Group/Anyone" will open WhatsApp and let you select from your contacts or groups to send the message.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Message Content
                  </label>
                  <textarea
                    rows={8}
                    placeholder="e.g. Hi there! We have an exciting new collection..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-slate-700 leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default WhatsAppMarketingModal;