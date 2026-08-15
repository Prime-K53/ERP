import React, { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '@/services/logger';
import { 
  MessageCircle, Send, Sparkles, X, Plus, FileText, Image, Calculator, Package, 
  Users, Receipt, ShoppingCart, TrendingUp, Settings, Bot, Zap, Search, Lightbulb,
  ArrowRight, Copy, Check, RefreshCw, Brain, Cpu, Database, BarChart3, CreditCard,
  Scale, Truck, FileCheck, AlertCircle, Clock, Star, ChevronDown, UserPlus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useProcurement } from '../../context/ProcurementContext';
import { useProduction } from '../../context/ProductionContext';
import { useOrders } from '../../context/OrdersContext';
import { currencyService } from '../../services/currencyService';
import { generateAIResponse } from '../../services/geminiService';
import { useNavigate } from 'react-router-dom';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestions?: string[];
}

const AI_PROMPTS = [
  { 
    category: 'Quick Actions',
    items: [
      { label: 'Summarize today\'s sales', icon: Receipt, prompt: 'Summarize today\'s sales performance including total revenue, number of transactions, and top selling items.' },
      { label: 'Low stock alerts', icon: AlertCircle, prompt: 'List all inventory items that are below minimum stock level and suggest reorder quantities.' },
      { label: 'Customer insights', icon: Users, prompt: 'Provide insights on our top 5 customers by revenue this month.' },
      { label: 'Financial summary', icon: Scale, prompt: 'Give me a financial summary including total income, expenses, and profit markup this month.' },
    ]
  },
  {
    category: 'Inventory',
    items: [
      { label: 'Stock valuation', icon: Package, prompt: 'Calculate the total inventory valuation using current stock levels and costs.' },
      { label: 'Reorder suggestions', icon: TrendingUp, prompt: 'Analyze sales velocity and suggest which items need reordering soon.' },
      { label: 'Slow moving items', icon: Clock, prompt: 'Identify inventory items that haven\'t sold in the last 30 days.' },
    ]
  },
  {
    category: 'Sales & Customers',
    items: [
      { label: 'Top products', icon: Star, prompt: 'What are our top 10 selling products this month by revenue?' },
      { label: 'Pending payments', icon: CreditCard, prompt: 'List all pending customer payments and total outstanding amount.' },
      { label: 'New customers', icon: UserPlus, prompt: 'Show me new customers acquired this month.' },
    ]
  },
  {
    category: 'Operations',
    items: [
      { label: 'Daily tasks', icon: Check, prompt: 'What are the pending tasks and what needs attention today?' },
      { label: 'Delivery status', icon: Truck, prompt: 'Show all pending deliveries and their status.' },
      { label: 'Production status', icon: Cpu, prompt: 'What is the current status of all production batches and work orders?' },
    ]
  }
];

const QUICK_TEMPLATES = [
  "Send payment reminder to {customer}",
  "Create quotation for {product}",
  "Update inventory for {item}",
  "Generate report for {period}",
  "Check stock of {item}",
  "Create invoice for {customer}"
];

const AIAssistant: React.FC = () => {
  const { isOnline, notify, companyConfig, user } = useAuth();
  const { inventory } = useInventory();
  const { customers, sales, quotations, jobOrders, customerPayments, salesOrders, shipments } = useSales();
  const { invoices, expenses, income, supplierPayments, employees } = useFinance();
  const { purchases, suppliers } = useProcurement();
  const { workOrders, batches } = useProduction();
  const { orders } = useOrders();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      id: '1', 
      role: 'assistant', 
      content: `Hello! I'm your AI Assistant for Prime ERP. I can help you with:\n\n📊 **Business Insights** - Sales, inventory, and financial analytics\n📦 **Inventory Management** - Stock levels, reorder suggestions\n💰 **Financial Data** - Revenue, expenses, profitability\n👥 **Customer Analytics** - Top customers, payment status\n🔧 **Operations** - Task management, production status\n\nHow can I help you today?`,
      timestamp: new Date().toISOString(),
      suggestions: ['Summarize today\'s sales', 'Low stock alerts', 'Pending payments']
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrompts, setShowPrompts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateContext = useCallback(() => {
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const safe = (arr: any[], n = 100) => (Array.isArray(arr) ? arr.slice(0, n) : []);
    
    return `
ROLE:
You are an Enterprise ERP AI Assistant and Business Intelligence Analyst.
Your primary responsibility is to answer questions using the ERP database records below, NOT dashboard summaries.

CORE RULES:
1. NEVER answer analytical questions from summary cards if detailed records exist.
2. Always retrieve and analyze the underlying records before answering.
3. For TOP / BEST / HIGHEST / LOWEST questions: retrieve ALL relevant records, calculate the ranking, sort, and return only the requested number.
4. For product questions: use Products + Inventory + Sales Items + Purchase Items + Stock Movements.
5. For missing data: say you cannot determine the answer because records are unavailable. Do NOT invent data.
6. Perform calculations explicitly: SUM, COUNT, AVG, MIN, MAX, GROUP BY, ORDER BY, percentages, growth, trends, comparisons.

COMPANY: ${companyConfig?.companyName || 'Prime ERP'}
USER: ${user?.name || 'Admin'}
CURRENCY: ${currency}
DATE: ${new Date().toLocaleDateString()}

RAW ERP RECORDS:

--- INVENTORY (${inventory.length} items) ---
${JSON.stringify(safe(inventory.map(i => ({ id: i.id, name: i.name, sku: i.sku, type: i.type, category: i.category, cost: i.cost, price: i.price, stock: i.stock, minStockLevel: i.minStockLevel, reorderPoint: i.reorderPoint }))))}

--- CUSTOMERS (${customers.length}) ---
${JSON.stringify(safe(customers.map(c => ({ id: c.id, name: c.name, email: c.phone, segment: c.segment, creditLimit: c.creditLimit, outstandingBalance: c.outstandingBalance }))))}

--- SALES (${sales.length}) ---
${JSON.stringify(safe(sales.map(s => ({ id: s.id, date: s.date, customerName: s.customerName, totalAmount: s.totalAmount, status: s.status, items: s.items?.map((it: any) => ({ productId: it.productId, name: it.name, quantity: it.quantity, price: it.price, cost: it.cost })) }))))}

--- INVOICES (${invoices.length}) ---
${JSON.stringify(safe(invoices.map(inv => ({ id: inv.id, customerName: inv.customerName, totalAmount: inv.totalAmount, paidAmount: inv.paidAmount, date: inv.date, status: inv.status, items: inv.items?.map((it: any) => ({ productId: it.productId, name: it.name, quantity: it.quantity, price: it.price, cost: it.cost })) }))))}

--- PURCHASES (${purchases.length}) ---
${JSON.stringify(safe(purchases.map(p => ({ id: p.id, supplierId: p.supplierId, totalAmount: p.totalAmount, date: p.date, status: p.status, items: p.items?.map((it: any) => ({ productId: it.productId, name: it.name, quantity: it.quantity, price: it.price, cost: it.cost })) }))))}

--- EXPENSES (${expenses.length}) ---
${JSON.stringify(safe(expenses.map(e => ({ id: e.id, date: e.date, description: e.description, amount: e.amount, category: e.category, status: e.status }))))}

--- INCOME (${income.length}) ---
${JSON.stringify(safe(income.map(i => ({ id: i.id, date: i.date, description: i.description, amount: i.amount, category: i.category }))))}

--- CUSTOMER PAYMENTS (${customerPayments.length}) ---
${JSON.stringify(safe(customerPayments.map(p => ({ id: p.id, customerName: p.customerName, amount: p.amount, date: p.date, method: p.method, reference: p.reference }))))}

--- SUPPLIER PAYMENTS (${supplierPayments.length}) ---
${JSON.stringify(safe(supplierPayments.map(p => ({ id: p.id, supplierId: p.supplierId, amount: p.amount, date: p.date, method: p.method }))))}

--- SUPPLIERS (${suppliers.length}) ---
${JSON.stringify(safe(suppliers.map(s => ({ id: s.id, name: s.name, email: s.email, phone: s.phone, category: s.category }))))}

--- ORDERS (${orders.length}) ---
${JSON.stringify(safe(orders.map(o => ({ id: o.id, customerName: o.customerName, totalAmount: o.totalAmount, status: o.status, date: o.orderDate, items: o.items?.map((it: any) => ({ productId: it.productId, productName: it.productName, quantity: it.quantity, unitPrice: it.unitPrice, subtotal: it.subtotal })) }))))}

--- WORK ORDERS (${workOrders.length}) ---
${JSON.stringify(safe(workOrders.map(w => ({ id: w.id, productName: w.productName, status: w.status, quantityPlanned: w.quantityPlanned, quantityCompleted: w.quantityCompleted, customerName: w.customerName }))))}

--- PRODUCTION BATCHES (${batches.length}) ---
${JSON.stringify(safe(batches.map(b => ({ id: b.id, productName: b.productName, status: b.status, quantityProduced: b.quantityProduced, totalAmount: b.totalAmount }))))}

--- EMPLOYEES (${employees.length}) ---
${JSON.stringify(safe(employees.map(e => ({ id: e.id, name: e.name, role: e.role, salary: e.salary }))))}

INSTRUCTIONS:
1. Analyze the RAW records above to answer the user's question.
2. Do NOT use summary totals from this prompt header. Compute answers from the record arrays.
3. For rankings: aggregate quantities/revenues/profits from line items, sort descending, and return only the requested count.
4. For product analysis: join inventory with sales/purchase line items.
5. For customer analysis: join customers with sales/invoices/payments.
6. For supplier analysis: join suppliers with purchases/payments.
7. If records are insufficient, state that explicitly instead of guessing.
8. Format answers in clean Markdown with tables where helpful.
`;
  }, [inventory, customers, sales, invoices, purchases, expenses, income, customerPayments, supplierPayments, suppliers, orders, workOrders, batches, employees, companyConfig, user]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowPrompts(false);

    try {
      const context = generateContext();
      const response = await generateAIResponse(
        `${context}\n\nUser Question: ${input}`,
        "You are an Enterprise ERP AI Assistant and Business Intelligence Analyst. Always analyze the provided raw ERP records to answer questions. Never rely on summary cards. Compute rankings, totals, averages, and trends from the raw data arrays. If records are insufficient, say so explicitly. Format in Markdown."
      );

      const aiMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        suggestions: ['Show more details', 'Export report', 'Create task']
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      logger.error('AI Error:', error);
      setMessages(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again or rephrase your question.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestion = async (suggestion: string) => {
    setInput(suggestion);
    await handleSend();
  };

  const handlePromptSelect = async (prompt: string) => {
    setInput(prompt);
    await handleSend();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOnline) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-purple-900 to-slate-900">
        <div className="text-center max-w-md p-8">
          <div className="inline-flex p-4 bg-white/10 rounded-full mb-4">
            <Brain className="w-12 h-12 text-purple-300" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">AI Assistant Offline</h2>
          <p className="text-purple-200 mb-6">
            The AI Assistant requires an internet connection to generate responses. 
            Your data is stored locally and will sync when connected.
          </p>
          <div className="bg-white/5 rounded-xl p-4 text-left">
            <h3 className="text-sm font-medium text-purple-300 mb-2">Quick Actions Available:</h3>
            <ul className="text-sm text-purple-200/70 space-y-1">
              <li>• View inventory levels</li>
              <li>• Check pending invoices</li>
              <li>• Review sales reports</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-purple-50 to-blue-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-purple-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg shadow-purple-200">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">AI Assistant</h1>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              AI-powered business insights
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMessages([{ id: '1', role: 'assistant', content: 'Hello! How can I help you today?', timestamp: new Date().toISOString() }])}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            title="Clear chat"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Quick Prompts Sidebar */}
        <div className="w-72 bg-white border-r border-purple-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-purple-50">
            <h3 className="text-sm font-bold text-slate-700">Quick Actions</h3>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-4">
            {AI_PROMPTS.map((category, idx) => (
              <div key={idx}>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                  {category.category}
                </h4>
                <div className="space-y-1">
                  {category.items.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handlePromptSelect(item.prompt)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-purple-50 text-left transition-colors group"
                    >
                      <div className="p-2 bg-purple-100 rounded-lg text-purple-600 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                        <item.icon size={14} />
                      </div>
                      <span className="text-xs font-medium text-slate-600 group-hover:text-purple-700">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {/* Link to Document Generator */}
          <div className="p-4 border-t border-purple-50">
            <button 
              onClick={() => navigate('/architect')}
              className="w-full flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
            >
              <FileText size={16} />
              Document Generator
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                  <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <Brain size={16} className="text-white" />
                      </div>
                    )}
                    <div className={`flex-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                      <div className={`px-4 py-3 rounded-2xl ${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' 
                          : 'bg-white text-slate-700 shadow-sm border border-purple-100'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      <div className={`flex items-center gap-2 mt-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        <button 
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="text-xs text-slate-400 hover:text-purple-600 flex items-center gap-1"
                        >
                          {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === msg.id ? 'Copied' : 'Copy'}
                        </button>
                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {msg.suggestions && msg.role === 'assistant' && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.suggestions.map((suggestion, i) => (
                            <button
                              key={i}
                              onClick={() => handleSuggestion(suggestion)}
                              className="px-3 py-1.5 bg-purple-50 text-purple-600 text-xs rounded-full hover:bg-purple-100 transition-colors"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Brain size={16} className="text-white" />
                  </div>
                  <div className="bg-white rounded-2xl px-4 py-3 border border-purple-100 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      <span className="text-sm text-slate-500 ml-2">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Templates */}
          {showPrompts && messages.length === 1 && (
            <div className="px-6 pb-2">
              <p className="text-xs text-slate-400 mb-2">Quick templates:</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TEMPLATES.slice(0, 4).map((template, i) => (
                  <button
                    key={i}
                    onClick={() => handlePromptSelect(template)}
                    className="px-3 py-1.5 bg-white border border-purple-200 text-purple-600 text-xs rounded-full hover:bg-purple-50 transition-colors"
                  >
                    {template.split(' ').slice(0, 3).join(' ')}...
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-white border-t border-purple-100">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Ask anything about your business..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-purple-500" title="Attach image" aria-label="Attach image"><Image size={16} /></button>
                  <button className="p-1.5 text-slate-400 hover:text-purple-500" title="Attach file" aria-label="Attach file"><FileText size={16} /></button>
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
