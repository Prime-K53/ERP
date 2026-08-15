import React, { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@/services/logger';
import { 
  MessageCircle, Send, Users, Clock, CheckCircle, XCircle, Plus, Search, Filter,
  ArrowLeft, Archive, Star, Trash2, Download, Settings, Zap, Tag, MessageSquare,
  BarChart3, UserPlus, Volume2, Calendar, Repeat, ChevronRight, PhoneCall, Bot, GitBranch, 
  Play, Pause, Save, Copy, ExternalLink, Link, FileText, Image, Video, Phone, Check,
  CheckCheck, MoreVertical, Smile, MapPin, Mic, GripVertical, X, RefreshCw,
  AlertCircle, TrendingUp, DollarSign, Package, Ticket, FileCheck, Truck, CreditCard,
  Info, Globe, Sparkles
} from 'lucide-react';
import { dbService } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { whatsAppMarketingService, WhatsAppTemplate, WhatsAppCampaign, AutomationFlow, WhatsAppChat } from '../../services/whatsAppMarketingService';
import { aiService, SmartReplySuggestion, AIConfig } from '../../services/aiService';
import { whatsappClient, WhatsAppAccount } from '../../services/whatsappClientService';
import { currencyService } from '../../services/currencyService';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

interface CampaignFormData {
  name: string;
  description: string;
  templateId: string;
  message: string;
  recipients: string[];
  scheduledAt: string;
}

const MarketingMessages: React.FC = () => {
  const { notify, companyConfig } = useAuth();
  const { customers } = useSales();
  const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  
  const [activeView, setActiveView] = useState<'inbox' | 'campaigns' | 'templates' | 'automation' | 'accounts' | 'activity'>('inbox');
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [automations, setAutomations] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showNewAutomation, setShowNewAutomation] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState<WhatsAppTemplate | null>(null);
  const [showCampaignPreview, setShowCampaignPreview] = useState(false);
  const [showTemplatePreviewModal, setShowTemplatePreviewModal] = useState(false);
  const [showSendTemplateModal, setShowSendTemplateModal] = useState(false);
  const [resolvedVars, setResolvedVars] = useState<Record<string, string>>({});
  const [viewingCampaign, setViewingCampaign] = useState<WhatsAppCampaign | null>(null);
  const [editingFlow, setEditingFlow] = useState<AutomationFlow | null>(null);
  const [campaignTarget, setCampaignTarget] = useState<'customers' | 'manual' | 'group'>('customers');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [groupLink, setGroupLink] = useState('');
  const [broadcastLink, setBroadcastLink] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [smartReplies, setSmartReplies] = useState<SmartReplySuggestion[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiConfig, setAIConfig] = useState<{ provider: string; apiKey: string; endpoint: string; model: string; enabled: boolean }>({
    provider: 'openai',
    apiKey: '',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    enabled: false,
  });
  const [waConfigured, setWAConfigured] = useState(false);
  const [showWASettings, setShowWASettings] = useState(false);
  const [configuringWA, setConfiguringWA] = useState(false);
  const [waAccount, setWAAccount] = useState<WhatsAppAccount | null>(null);
  const [waPhoneNumberId, setWAPhoneNumberId] = useState('');
  const [waAccessToken, setWAAccessToken] = useState('');
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [bulkRecipients, setBulkRecipients] = useState<string>('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, sent: 0, failed: 0 });
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [activityFilters, setActivityFilters] = useState<{ status?: string; dateRange?: string }>({});
  const [queueStats, setQueueStats] = useState<{ status: string; count: number }[]>([]);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  const replaceVars = (text: string): string => {
    return text.split('{{name}}').join('Customer Name')
      .split('{{company}}').join(companyConfig?.companyName || 'Your Company')
      .split('{{product}}').join('Product Name')
      .split('{{discount}}').join('20')
      .split('{{link}}').join('https://example.com')
      .split('{{code}}').join('SAVE20')
      .split('{{amount}}').join('$100')
      .split('{{orderId}}').join('ORD-12345')
      .split('{{tracking}}').join('TRACK123')
      .split('{{location}}').join('Our Store')
      .split('{{time}}').join('10:00 AM')
      .split('{{date}}').join('April 18, 2026');
  };

  // Form states
  const [campaignForm, setCampaignForm] = useState<CampaignFormData>({
    name: '',
    description: '',
    templateId: '',
    message: '',
    recipients: [],
    scheduledAt: ''
  });
  const [recipientInput, setRecipientInput] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'alpha'>('newest');
  const [automationForm, setAutomationForm] = useState({
    name: '',
    description: '',
    trigger: '',
    triggerType: 'keyword' as const,
    steps: [{ id: 'step-1', order: 1, type: 'message' as const, config: { message: '' } }]
  });

  useEffect(() => {
    if (selectedChat && messagesEndRef.current) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [selectedChat?.id]);

  useEffect(() => {
    if (selectedChat && selectedChat.messages?.length > 0) {
      generateSmartReplies();
    } else {
      setSmartReplies([]);
    }
  }, [selectedChat?.id, selectedChat?.messages?.length]);

  const generateSmartReplies = async () => {
    if (!selectedChat) return;
    setLoadingReplies(true);
    try {
      const replies = await aiService.generateSmartReplies(selectedChat);
      setSmartReplies(replies);
    } finally {
      setLoadingReplies(false);
    }
  };

  const applySmartReply = async (reply: SmartReplySuggestion) => {
    if (!selectedChat) return;
    let message = reply.text;
    message = message.replace(/{{name}}/g, selectedChat.customerName || 'Customer');
    message = message.replace(/{{company}}/g, companyConfig?.companyName || 'Our Company');

    await whatsAppMarketingService.sendMessage(selectedChat.id, message);
    const updatedChats = await whatsAppMarketingService.getChats();
    setChats(updatedChats);
    const updated = updatedChats.find(c => c.id === selectedChat.id);
    if (updated) setSelectedChat(updated);
    setSmartReplies([]);
    notify('Reply sent!', 'success');
  };

  const _loadingRef = useRef(false);

  const loadData = async () => {
    if (_loadingRef.current) return;
    _loadingRef.current = true;
    setLoading(true);
    try {
      await whatsAppMarketingService.ensureInitialized();
      const [chatsData, templatesData, campaignsData, automationsData] = await Promise.all([
        whatsAppMarketingService.getChats(),
        whatsAppMarketingService.getTemplates(),
        whatsAppMarketingService.getCampaigns(),
        whatsAppMarketingService.getAutomations()
      ]);
      setChats(chatsData);
      setTemplates(templatesData);
      setCampaigns(campaignsData);
      setAutomations(automationsData);
    } catch (error) {
      logger.error('Error loading marketing data:', error);
      notify('Failed to load WhatsApp data. Please try again.', 'error');
    } finally {
      setLoading(false);
      _loadingRef.current = false;
    }
    loadActivityLog();
    loadQueueStats();
  };

  const loadAIConfig = async () => {
    const config = await aiService.getConfig();
    setAIConfig(config);
  };

  const initWhatsApp = async () => {
    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      const user = sessionUser ? JSON.parse(sessionUser) : null;
      if (user) {
        const account = await whatsappClient.getAccount(user.id);
        setWAAccount(account);
        setWAConfigured(!!(account?.phone_number_id && account?.access_token));
      }
    } catch (e) { logger.error("Operation failed", e as Error); }

    whatsappClient.onStatus((status) => {
      setWAConfigured(status.ready);
    });
    whatsappClient.onMessage((msg) => {
      handleIncomingMessage(msg);
    });
  };

  const handleIncomingMessage = async (msg: { from: string; body: string; contactName: string; contactNumber: string; chatId: string }) => {
    const existing = await whatsAppMarketingService.getChats();
    const chatId = msg.chatId || `chat-${msg.contactNumber}`;
    let chat = existing.find(c => c.id === chatId);

    if (!chat) {
      chat = {
        id: chatId,
        customerId: msg.contactNumber,
        customerName: msg.contactName || msg.contactNumber,
        customerPhone: msg.contactNumber,
        lastMessage: msg.body,
        lastMessageAt: new Date().toISOString(),
        status: 'unread' as const,
        priority: 'normal' as const,
        tags: [],
        messages: [],
        unreadCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dbService.put('whatsappChats', chat);
    } else {
      chat.lastMessage = msg.body;
      chat.lastMessageAt = new Date().toISOString();
      chat.status = 'unread';
      chat.unreadCount = (chat.unreadCount || 0) + 1;
      chat.messages = chat.messages || [];
      chat.messages.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        chatId: chat.id,
        content: msg.body,
        type: 'text',
        direction: 'inbound',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      });
      chat.updatedAt = new Date().toISOString();
      await dbService.put('whatsappChats', chat);
    }
    const updatedChats = await whatsAppMarketingService.getChats();
    setChats(updatedChats);
  };

  const handleSaveConfig = async () => {
    if (!waPhoneNumberId.trim() || !waAccessToken.trim()) {
      notify('Please enter both Phone Number ID and Access Token', 'error');
      return;
    }
    setConfiguringWA(true);
    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      const user = sessionUser ? JSON.parse(sessionUser) : null;
      if (!user) { notify('Please sign in first', 'error'); return; }
      const account = await whatsappClient.saveConfig(user.id, waPhoneNumberId.trim(), waAccessToken.trim());
      setWAAccount(account);
      setWAConfigured(true);
      setShowWASettings(false);
      setWAPhoneNumberId('');
      setWAAccessToken('');
      notify('WhatsApp API configured successfully', 'success');
    } catch (err) {
      notify('Failed to save config: ' + (err as Error).message, 'error');
    } finally {
      setConfiguringWA(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      const user = sessionUser ? JSON.parse(sessionUser) : null;
      if (user) {
        await whatsappClient.disconnect(user.id);
      }
      setWAAccount(null);
      setWAConfigured(false);
      notify('WhatsApp disconnected', 'success');
    } catch (err) {
      notify('Failed to disconnect', 'error');
    }
  };

  const handleBulkSend = async () => {
    if (!bulkMessage.trim()) {
      notify('Please enter a message', 'error');
      return;
    }
    const recipients = bulkRecipients
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => ({ phone: r.replace(/[^0-9]/g, '') }));
    if (recipients.length === 0) {
      notify('Please enter at least one recipient phone number', 'error');
      return;
    }
    setBulkSending(true);
    setBulkProgress({ total: recipients.length, sent: 0, failed: 0 });
    const account = whatsappClient.getAccountInfo();
    if (!account?.phone_number_id || !account?.access_token) {
      notify('WhatsApp API not configured', 'error');
      setBulkSending(false);
      return;
    }
    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      const user = sessionUser ? JSON.parse(sessionUser) : null;
      if (!user) { notify('Please sign in first', 'error'); return; }
      const result = await whatsappClient.queueMessages(account.id, user.id, recipients, bulkMessage);
      setBulkProgress({ total: result.queued, sent: 0, failed: 0 });
      notify(`${result.queued} messages queued`, 'success');

      const processed = await whatsappClient.processQueue(account.id, user.id, account.phone_number_id, account.access_token);
      setBulkProgress({ total: result.queued, sent: processed, failed: 0 });
      setShowBulkSend(false);
      setBulkRecipients('');
      setBulkMessage('');
      loadActivityLog();
    } catch (err) {
      notify('Bulk send failed: ' + (err as Error).message, 'error');
    } finally {
      setBulkSending(false);
    }
  };

  const loadActivityLog = async () => {
    const account = whatsappClient.getAccountInfo();
    if (!account) return;
    try {
      const sessionUser = sessionStorage.getItem('nexus_user');
      const user = sessionUser ? JSON.parse(sessionUser) : null;
      if (user) {
        const logs = await whatsappClient.getMessageLogs(account.id, user.id, activityFilters);
        setActivityLog(logs);
      }
    } catch (e) { logger.error("Operation failed", e as Error); }
  };

  const loadQueueStats = async () => {
    const account = whatsappClient.getAccountInfo();
    if (!account) return;
    try {
      const stats = await whatsappClient.getQueueStatus(account.id);
      setQueueStats(stats);
    } catch (e) { logger.error("Operation failed", e as Error); }
  };

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedChat) return;
    
    const account = whatsappClient.getAccountInfo();
    if (account?.phone_number_id && account?.access_token) {
      try {
        const result = await whatsappClient.sendMessage(account.phone_number_id, account.access_token, selectedChat.customerPhone, newMessage);
        const sessionUser = sessionStorage.getItem('nexus_user');
        const user = sessionUser ? JSON.parse(sessionUser) : null;
        if (user) {
          await whatsappClient.logMessage(account.id, user.id, selectedChat.customerPhone, newMessage, 'sent', 'outbound', result.messageId);
        }
      } catch {
        // Fallback to local simulation
      }
    }
    
    await whatsAppMarketingService.sendMessage(selectedChat.id, newMessage);
    
    const updatedChats = await whatsAppMarketingService.getChats();
    setChats(updatedChats);
    const updated = updatedChats.find(c => c.id === selectedChat.id);
    if (updated) setSelectedChat(updated);
    setNewMessage('');
    notify('Message sent successfully', 'success');
  }, [newMessage, selectedChat, notify]);

  useEffect(() => {
    loadData();
    loadAIConfig();
    initWhatsApp();
  }, []);

  const resolveCustomerVariables = useCallback(async (customerId: string, customerName: string): Promise<Record<string, string>> => {
    const vars: Record<string, string> = {
      name: customerName,
      company: companyConfig?.companyName || 'Our Company',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      location: companyConfig?.address || companyConfig?.companyName || 'Our Store',
    };

    try {
      const salesStore = (await import('../../stores/salesStore')).useSalesStore.getState();
      const normalizedName = (customerName || '').toLowerCase();
      const customerSales = salesStore.sales.filter((s: any) =>
        s.customerId === customerId || (s.customerName || '').toLowerCase() === normalizedName
      );
      const customerOrders = salesStore.salesOrders.filter((o: any) =>
        o.customerId === customerId
      );
      const customerQuotes = salesStore.quotations.filter((q: any) =>
        q.customerId === customerId || (q.customerName || '').toLowerCase() === normalizedName
      );
      const customerInvoices = salesStore.salesInvoices?.filter((i: any) =>
        i.customerId === customerId || (i.customerName || '').toLowerCase() === normalizedName
      ) || [];

      const lastSale = customerSales[customerSales.length - 1];
      const lastOrder = customerOrders[customerOrders.length - 1];
      const lastQuote = customerQuotes[customerQuotes.length - 1];
      const lastInvoice = customerInvoices[customerInvoices.length - 1];

      if (lastSale) {
        vars.orderId = lastSale.id;
        vars.amount = lastSale.totalAmount?.toFixed(2) || '0.00';
        vars.price = lastSale.totalAmount?.toFixed(2) || '0.00';
        if (lastSale.items?.length > 0) {
          vars.product = lastSale.items[0].productName || lastSale.items[0].name || lastSale.items[0].description || 'Product';
          vars.quantity = String(lastSale.items[0].quantity || 1);
        }
      }
      if (lastOrder) {
        if (!vars.orderId) vars.orderId = lastOrder.id;
        vars.dueDate = lastOrder.deliveryDate ? new Date(lastOrder.deliveryDate).toLocaleDateString() : '';
        if (lastOrder.items?.length > 0) {
          vars.product = lastOrder.items[0].description || vars.product || 'Product';
          vars.quantity = String(lastOrder.items[0].quantity || vars.quantity || 1);
        }
        if (!vars.amount) vars.amount = lastOrder.total?.toFixed(2) || '';
        if (!vars.price) vars.price = lastOrder.total?.toFixed(2) || '';
      }
      if (lastQuote) {
        vars.quoteId = lastQuote.id;
        if (!vars.amount) vars.amount = (lastQuote.totalAmount || lastQuote.total || 0).toFixed(2);
        if (!vars.product && lastQuote.items?.length > 0) {
          vars.product = lastQuote.items[0].productName || lastQuote.items[0].name || lastQuote.items[0].description || 'Product';
        }
        if (lastQuote.validUntil) vars.validUntil = new Date(lastQuote.validUntil).toLocaleDateString();
      }
      if (lastInvoice) {
        vars.invoiceId = lastInvoice.id;
        if (!vars.amount) vars.amount = (lastInvoice.totalAmount || lastInvoice.total || 0).toFixed(2);
        if (lastInvoice.dueDate) vars.dueDate = new Date(lastInvoice.dueDate).toLocaleDateString();
      }

      if (customerSales.length > 1) {
        const prevSale = customerSales[customerSales.length - 2];
        if (prevSale) {
          vars.originalDate = prevSale.date ? new Date(prevSale.date).toLocaleDateString() : '';
        }
      }
    } catch {}

    return vars;
  }, [companyConfig]);

  const handleSendTemplate = useCallback(async (template: WhatsAppTemplate) => {
    if (!selectedChat) return;
    const vars = await resolveCustomerVariables(selectedChat.customerId, selectedChat.customerName);

    let message = template.content;
    for (const [key, value] of Object.entries(vars)) {
      if (value) message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    await whatsAppMarketingService.sendMessage(selectedChat.id, message);
    await whatsAppMarketingService.incrementTemplateUsage(template.id);

    const updatedChats = await whatsAppMarketingService.getChats();
    setChats(updatedChats);
    const updated = updatedChats.find(c => c.id === selectedChat.id);
    if (updated) setSelectedChat(updated);
    setShowTemplatePreview(null);
    notify('Template sent!', 'success');
  }, [selectedChat, resolveCustomerVariables, notify]);

  const handlePreviewSendTemplate = useCallback(async (template: WhatsAppTemplate) => {
    if (!selectedChat) return;
    const vars = await resolveCustomerVariables(selectedChat.customerId, selectedChat.customerName);
    setResolvedVars(vars);
    setShowSendTemplateModal(true);
  }, [selectedChat, resolveCustomerVariables]);

  const handleConfirmSendTemplate = useCallback(async () => {
    if (!showTemplatePreview || !selectedChat) return;

    let message = showTemplatePreview.content;
    for (const [key, value] of Object.entries(resolvedVars)) {
      if (value) message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    await whatsAppMarketingService.sendMessage(selectedChat.id, message);
    await whatsAppMarketingService.incrementTemplateUsage(showTemplatePreview.id);

    const updatedChats = await whatsAppMarketingService.getChats();
    setChats(updatedChats);
    const updated = updatedChats.find(c => c.id === selectedChat.id);
    if (updated) setSelectedChat(updated);
    setShowTemplatePreview(null);
    setShowSendTemplateModal(false);
    notify('Template sent!', 'success');
  }, [showTemplatePreview, selectedChat, resolvedVars, notify]);

  const handlePreviewCampaign = () => {
    if (!campaignForm.message.trim()) {
      notify('Please enter a message to preview', 'error');
      return;
    }
    setShowCampaignPreview(true);
  };

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.message) {
      notify('Please fill in campaign name and message', 'error');
      return;
    }

    let finalRecipients: string[] = [];
    if (campaignTarget === 'manual') {
      finalRecipients = recipientInput.split(/[\n,]/).map(p => p.trim()).filter(p => p.length > 0);
    } else if (campaignTarget === 'customers') {
      finalRecipients = customers
        .filter((c: any) => selectedCustomerIds.includes(c.id) && c.phone)
        .map((c: any) => c.phone);
    } else if (campaignTarget === 'group') {
      if (!groupLink.includes('whatsapp.com')) {
        notify('Please enter a valid WhatsApp group link', 'error');
        return;
      }
      finalRecipients = [groupLink];
    }

    if (finalRecipients.length === 0 && campaignTarget !== 'group') {
      notify('Please select at least one recipient', 'error');
      return;
    }

    const campaignId = await whatsAppMarketingService.createCampaign({
      ...campaignForm,
      recipients: finalRecipients,
      status: 'sent',
      sentAt: new Date().toISOString()
    });

    // Reload campaigns to get the full object from the store
    const updatedCampaigns = await whatsAppMarketingService.getCampaigns();
    setCampaigns(updatedCampaigns);
    setShowNewCampaign(false);
    
    // Reset targeting state
    setSelectedCustomerIds([]);
    setRecipientInput('');
    setGroupLink('');

    // Open WhatsApp / Broadcast Link
    if (broadcastLink) {
      window.open(broadcastLink, '_blank');
    } else if (campaignTarget === 'group') {
      window.open(groupLink, '_blank');
    } else {
      // Standard WhatsApp deep link for the message
      const encodedMsg = encodeURIComponent(replaceVars(campaignForm.message));
      window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
    }

    notify('Campaign created and launching WhatsApp!', 'success');
  };

  const handleSendCampaign = async (campaignId: string) => {
    try {
      await whatsAppMarketingService.sendCampaign(campaignId);
      await loadData();
      notify('Campaign sent!', 'success');
    } catch (error) {
      notify('Failed to send campaign', 'error');
    }
  };

  const handleCreateAutomation = async () => {
    if (!automationForm.name || !automationForm.trigger) {
      notify('Please fill in flow name and trigger', 'error');
      return;
    }

    await whatsAppMarketingService.createAutomation({
      ...automationForm,
      status: 'draft'
    });

    await loadData();
    setShowNewAutomation(false);
    setAutomationForm({
      name: '',
      description: '',
      trigger: '',
      triggerType: 'keyword',
      steps: [{ id: 'step-1', order: 1, type: 'message', config: { message: '' } }]
    });
    notify('Automation flow created!', 'success');
  };

  const handleUpdateAutomation = async () => {
    if (!editingFlow || !editingFlow.name || !editingFlow.trigger) {
      notify('Please fill in flow name and trigger', 'error');
      return;
    }

    await dbService.put('whatsappAutomations', {
      ...editingFlow,
      updatedAt: new Date().toISOString()
    });

    await loadData();
    setEditingFlow(null);
    notify('Automation flow updated!', 'success');
  };

  const handleDeleteAutomation = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Automation Flow',
      message: 'Are you sure you want to delete this flow?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        await dbService.delete('whatsappAutomations', id);
        await loadData();
        notify('Automation flow deleted', 'success');
      }
    });
  };

  const addAutomationStep = () => {
    setAutomationForm(prev => ({
      ...prev,
      steps: [
        ...prev.steps,
        { id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, order: prev.steps.length + 1, type: 'message' as const, config: { message: '' } }
      ]
    }));
  };

  const removeAutomationStep = (id: string) => {
    setAutomationForm(prev => ({
      ...prev,
      steps: prev.steps.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 }))
    }));
  };

  const updateAutomationStep = (id: string, message: string) => {
    setAutomationForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === id ? { ...s, config: { ...s.config, message } } : s)
    }));
  };

  const handleAddRecipient = () => {
    if (recipientInput.trim()) {
      const phones = recipientInput.split(/[\n,]/).map(p => p.trim()).filter(p => p.length > 0);
      setCampaignForm(prev => ({
        ...prev,
        recipients: [...new Set([...prev.recipients, ...phones])]
      }));
      setRecipientInput('');
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCampaignForm(prev => ({
        ...prev,
        templateId: template.id,
        message: template.content
      }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'delivered': return 'bg-blue-100 text-blue-700';
      case 'read': return 'bg-emerald-100 text-emerald-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'scheduled': return 'bg-purple-100 text-purple-700';
      case 'sending': return 'bg-yellow-100 text-yellow-700';
      case 'draft': return 'bg-slate-100 text-slate-600';
      case 'active': return 'bg-green-100 text-green-700';
      case 'paused': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Promotions': return <Tag size={14} className="text-pink-500" />;
      case 'Support': return <Phone size={14} className="text-blue-500" />;
      case 'Orders': return <Package size={14} className="text-purple-500" />;
      case 'Appointments': return <Calendar size={14} className="text-orange-500" />;
      case 'Billing': return <DollarSign size={14} className="text-green-500" />;
      case 'Examination': return <FileCheck size={14} className="text-indigo-500" />;
      case 'Print': return <Printer size={14} className="text-cyan-500" />;
      case 'Services': return <Star size={14} className="text-amber-500" />;
      case 'Follow-up': return <RefreshCw size={14} className="text-teal-500" />;
      case 'Welcome': return <UserPlus size={14} className="text-emerald-500" />;
      default: return <MessageSquare size={14} className="text-slate-500" />;
    }
  };

  const filteredChats = chats.filter(c => 
    c.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.customerPhone?.includes(searchQuery) ||
    c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = templates
    .filter(t => templateCategory === 'All' || t.category === templateCategory)
    .sort((a, b) => {
      if (sortBy === 'popular') return b.usageCount - a.usageCount;
      if (sortBy === 'alpha') return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const unreadCount = chats.filter(c => c.status === 'unread').length;
  const totalCampaigns = campaigns.length;
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const categories = ['All', ...whatsAppMarketingService.getTemplateCategories()];

  const Printer = (props: any) => <FileText {...props} />;

  const dt = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
  const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
  const paper = '#FEFDFB'; const ink = '#23282A'; const inkSoft = '#5c6567'; const hairline = '#e4ddd1'; const danger = '#b5493f';
  const dAmber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };

  const renderChatMessage = (message: any, index: number) => {
    const isOutbound = message.direction === 'outbound';
    return (
      <div key={message.id || index} style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
        <div style={{ maxWidth: '70%', padding: '8px 16px', borderRadius: 16, background: isOutbound ? `linear-gradient(135deg, ${dt[500]}, ${dt[700]})` : paper, color: isOutbound ? '#fff' : ink, borderBottomRightRadius: isOutbound ? 4 : 16, borderBottomLeftRadius: isOutbound ? 16 : 4, boxShadow: isOutbound ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45, margin: 0 }}>{message.content}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4, color: isOutbound ? 'rgba(255,255,255,0.75)' : inkSoft }}>
            <span style={{ fontSize: 10 }}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isOutbound && (
              message.status === 'read' ? <CheckCheck size={14} /> :
              message.status === 'delivered' ? <CheckCircle size={14} /> :
              <Check size={14} />
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F2' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, border: '4px solid #d3ece9', borderTopColor: dt[600], borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: inkSoft, fontWeight: 500 }}>Loading WhatsApp Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: '#FBF8F2', overflow: 'hidden' }}>
      {/* Sidebar - Chat List */}
      <div style={{ width: 320, background: paper, borderRight: `1px solid ${hairline}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div className="prime-btn-secondary" style={{ padding: 8, background: dt[50], borderRadius: 12 }}>
              <MessageCircle style={{ width: 20, height: 20, color: dt[600] }} />
            </div>
            <div>
              <h1 style={{ fontWeight: 700, color: ink, margin: 0, fontSize: 17 }}>WhatsApp Hub</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: waConfigured ? dt[600] : inkSoft, margin: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: waConfigured ? dt[500] : hairline, display: 'inline-block' }}></span>
                  {waConfigured ? 'Connected' : 'Disconnected'}
                </p>
                {waConfigured ? (
                  <button onClick={handleDisconnectWhatsApp} className="prime-btn-secondary" style={{ fontSize: 10, fontWeight: 700, color: danger, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Disconnect</button>
                ) : (
                  <button onClick={() => setShowWASettings(true)} className="prime-btn-secondary" style={{ fontSize: 10, fontWeight: 700, color: dt[500], background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Connect</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
            <div className="prime-card" style={{ background: paper, padding: '8px 10px', borderRadius: 10, border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `4px solid ${dt[500]}` }}>
              <div style={{ padding: 6, background: dt[50], color: dt[600], borderRadius: 8, display: 'flex' }}>
                <MessageCircle size={14} />
              </div>
              <div>
                <p style={{ fontSize: 8, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, lineHeight: 1.2 }}>Unread</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: ink, margin: 0, lineHeight: 1.3 }}>{unreadCount}</p>
              </div>
            </div>
            <div className="prime-card" style={{ background: paper, padding: '8px 10px', borderRadius: 10, border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `4px solid ${dAmber[500]}` }}>
              <div style={{ padding: 6, background: dAmber[100], color: dAmber[500], borderRadius: 8, display: 'flex' }}>
                <Send size={14} />
              </div>
              <div>
                <p style={{ fontSize: 8, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, lineHeight: 1.2 }}>Campaigns</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: ink, margin: 0, lineHeight: 1.3 }}>{totalCampaigns}</p>
              </div>
            </div>
            <div className="prime-card" style={{ background: paper, padding: '8px 10px', borderRadius: 10, border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `4px solid ${dt[500]}` }}>
              <div style={{ padding: 6, background: dt[50], color: dt[600], borderRadius: 8, display: 'flex' }}>
                <CheckCircle size={14} />
              </div>
              <div>
                <p style={{ fontSize: 8, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, lineHeight: 1.2 }}>Sent</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: ink, margin: 0, lineHeight: 1.3 }}>{totalSent}</p>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
            <input className="prime-input" type="text" placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '8px 12px 8px 36px', background: t[50], border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
          </div>
        </div>

        <div className="prime-btn-secondary" style={{ display: 'flex', background: t[50], padding: 3, margin: '0 12px', borderRadius: 10 }}>
          {[
            { id: 'inbox', label: 'Inbox', badge: unreadCount },
            { id: 'campaigns', label: 'Campaigns' },
            { id: 'templates', label: 'Templates' },
            { id: 'automation', label: 'Auto' },
            { id: 'accounts', label: 'Accounts' },
            { id: 'activity', label: 'Activity' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveView(tab.id)} style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'all .15s ease', background: activeView === tab.id ? paper : 'transparent', color: activeView === tab.id ? dt[500] : inkSoft, boxShadow: activeView === tab.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', lineHeight: 1.3 }}>
              {tab.label}
              {tab.badge ? <span style={{ marginLeft: 4, padding: '1px 6px', background: danger, color: '#fff', borderRadius: 10, fontSize: 9, display: 'inline-block' }}>{tab.badge}</span> : null}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeView === 'inbox' ? (
            filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                <MessageCircle size={48} style={{ color: hairline, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: inkSoft, fontSize: 13 }}>No conversations yet</p>
                <button onClick={() => setShowNewCampaign(true)} className="prime-btn-secondary" style={{ marginTop: 12, color: dt[500], fontWeight: 500, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Start a new campaign</button>
              </div>
            ) : (
              filteredChats.map(chat => (
                <div key={chat.id} onClick={() => setSelectedChat(chat)} style={{ padding: 12, borderBottom: `1px solid ${hairline}`, cursor: 'pointer', transition: 'background 0.1s', background: selectedChat?.id === chat.id ? dt[50] : 'transparent', borderLeft: selectedChat?.id === chat.id ? `4px solid ${dt[500]}` : '4px solid transparent' }}
                  onMouseEnter={e => { if (selectedChat?.id !== chat.id) e.currentTarget.style.background = t[50]; }}
                  onMouseLeave={e => { if (selectedChat?.id !== chat.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: dt[100], display: 'flex', alignItems: 'center', justifyContent: 'center', color: dt[600], fontWeight: 700, flexShrink: 0, fontSize: 15 }}>
                      {chat.customerName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <h3 style={{ fontWeight: 500, color: ink, margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.customerName}</h3>
                        <span style={{ fontSize: 12, color: inkSoft, flexShrink: 0 }}>{new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p style={{ fontSize: 12, color: inkSoft, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.lastMessage}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        {chat.status === 'unread' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dt[500], display: 'inline-block' }}></span>}
                        {chat.priority === 'high' && <Star size={10} style={{ color: dAmber[500], fill: dAmber[500] }} />}
                        {chat.tags?.map(tag => <span key={tag} style={{ fontSize: 10, background: t[50], padding: '1px 6px', borderRadius: 4, color: inkSoft }}>{tag}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : activeView === 'templates' ? (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => setShowNewTemplate(true)} className="prime-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={16} /> New Template
              </button>
              <select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)} className="prime-select" style={{ width: '100%', fontSize: 12, padding: 8, background: t[50], border: `1.4px solid ${hairline}`, borderRadius: 9, color: ink, outline: 'none', cursor: 'pointer' }}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="prime-select" style={{ width: '100%', fontSize: 12, padding: 8, background: t[50], border: `1.4px solid ${hairline}`, borderRadius: 9, color: ink, outline: 'none', cursor: 'pointer' }}>
                <option value="newest">Newest First</option>
                <option value="popular">Most Used</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          ) : activeView === 'campaigns' ? (
            <div style={{ padding: 8 }}>
              <button onClick={() => setShowNewCampaign(true)} className="prime-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={16} /> New Campaign
              </button>
            </div>
          ) : activeView === 'automation' ? (
            <div style={{ padding: 8 }}>
              <button onClick={() => setShowNewAutomation(true)} className="prime-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={16} /> New Flow
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* INBOX VIEW */}
        {activeView === 'inbox' && selectedChat ? (
          <>
            <div style={{ background: paper, borderBottom: `1px solid ${hairline}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setSelectedChat(null)} className="prime-btn-secondary" style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, display: 'flex', padding: 4 }}><ArrowLeft size={20} /></button>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: dt[100], display: 'flex', alignItems: 'center', justifyContent: 'center', color: dt[600], fontWeight: 700, fontSize: 16 }}>
                  {selectedChat.customerName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontWeight: 600, color: ink, margin: 0, fontSize: 15 }}>{selectedChat.customerName}</h2>
                  <p style={{ fontSize: 12, color: dt[600], display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                    <Phone size={10} />{selectedChat.customerPhone}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><PhoneCall size={18} /></button>
                <button className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Video size={18} /></button>
                <button className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><MoreVertical size={18} /></button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: t[50] }}>
              {selectedChat.messages?.map((msg, i) => renderChatMessage(msg, i))}
              <div ref={messagesEndRef} />
            </div>

            {showTemplatePreview && (
              <div style={{ background: dAmber[100], borderTop: `1px solid ${dAmber[300]}`, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#23282A' }}>Quick Reply: {showTemplatePreview.name}</span>
                  <button onClick={() => setShowTemplatePreview(null)} className="prime-btn-secondary" style={{ background: 'none', border: 'none', cursor: 'pointer', color: dAmber[500] }}><X size={16} /></button>
                </div>
                <p style={{ fontSize: 12, color: '#23282A', margin: '0 0 8px', lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{showTemplatePreview.content}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handlePreviewSendTemplate(showTemplatePreview)} className="prime-btn" style={{ flex: 1, padding: 8, background: `linear-gradient(135deg, ${dAmber[500]}, #b97e2b)`, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>Send Template</button>
                  <button onClick={() => { setCampaignForm(prev => ({ ...prev, message: showTemplatePreview.content, templateId: showTemplatePreview.id })); setShowTemplatePreview(null); }} className="prime-btn-secondary" style={{ padding: '8px 12px', border: `1.4px solid ${dAmber[300]}`, borderRadius: 8, color: '#23282A', background: paper, cursor: 'pointer', fontSize: 13 }}>Copy</button>
                </div>
              </div>
            )}

            <div style={{ background: paper, borderTop: `1px solid ${hairline}`, padding: 12 }}>
              {smartReplies.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} style={{ color: inkSoft }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: ink, textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Suggested Replies</span>
                    </div>
                    <button onClick={generateSmartReplies} className="prime-btn-secondary" style={{ fontSize: 10, color: inkSoft, fontWeight: 700, background: 'none', border: 'none', cursor: loadingReplies ? 'default' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }} disabled={loadingReplies}>{loadingReplies ? '...' : 'Refresh'}</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {smartReplies.map((reply, idx) => (
                      <button key={idx} onClick={() => applySmartReply(reply)} className="prime-btn-secondary" style={{ padding: '6px 8px', fontSize: 12, background: t[50], color: dt[700], borderRadius: 8, border: `1px solid ${dt[100]}`, cursor: 'pointer', textAlign: 'left', lineHeight: 1.3 }}>
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: dt[500], textTransform: 'uppercase', marginBottom: 2 }}>{reply.label}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{reply.text.replace(/{{name}}/g, selectedChat?.customerName || 'Customer')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button onClick={() => setShowTemplatePreview(templates[0] || null)} className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><FileText size={20} /></button>
                <button className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Image size={20} /></button>
                <button className="prime-btn-secondary" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Smile size={20} /></button>
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowAISettings(true)} className="prime-btn-secondary" style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', color: aiConfig.enabled ? dt[500] : inkSoft }} onMouseEnter={e => e.currentTarget.style.background = t[50]} onMouseLeave={e => e.currentTarget.style.background = 'none'}><Sparkles size={18} style={{ opacity: aiConfig.enabled ? 1 : 0.5 }} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="prime-input" type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." style={{ flex: 1, padding: '10px 16px', background: t[50], border: `1.4px solid ${hairline}`, borderRadius: 24, fontSize: 13, color: ink, outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif" }} />
                <button onClick={sendMessage} disabled={!newMessage.trim()} className="prime-btn" style={{ padding: 10, background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: newMessage.trim() ? 1 : 0.5, width: 40, height: 40 }}><Send size={18} /></button>
              </div>
            </div>
          </>
        ) : activeView === 'inbox' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t[50] }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
              <div style={{ padding: 16, background: dt[50], borderRadius: '50%', display: 'inline-flex', marginBottom: 16 }}>
                <MessageCircle size={32} style={{ color: dt[600] }} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: '0 0 8px' }}>WhatsApp Inbox</h2>
              <p style={{ color: inkSoft, marginBottom: 16 }}>Select a conversation or create a campaign</p>
              <button onClick={() => setShowNewCampaign(true)} className="prime-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', lineHeight: 1.4 }}>
                <Send size={18} />New Campaign
              </button>
            </div>
          </div>
        ) : null}

        {/* CAMPAIGNS VIEW */}
        {activeView === 'campaigns' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Campaigns</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>{campaigns.length} total campaigns</p>
              </div>
              <button onClick={() => setShowNewCampaign(true)} className="prime-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={18} />New Campaign
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="prime-card" style={{ textAlign: 'center', padding: 48, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                <Send size={48} style={{ color: hairline, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: inkSoft, fontWeight: 500 }}>No campaigns yet</p>
                <button onClick={() => setShowNewCampaign(true)} className="prime-btn-secondary" style={{ color: dt[500], fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 8, fontSize: 13 }}>Create your first campaign</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {campaigns.map(campaign => (
                  <div key={campaign.id} className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ fontWeight: 600, color: ink, margin: 0, fontSize: 14 }}>{campaign.name}</h3>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: dt[50], color: dt[700] }}>{campaign.status}</span>
                    </div>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{campaign.message}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ background: t[50], borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: ink }}>{campaign.sentCount}</div>
                        <div style={{ fontSize: 10, color: inkSoft }}>Sent</div>
                      </div>
                      <div style={{ background: t[50], borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: dt[600] }}>{campaign.deliveredCount}</div>
                        <div style={{ fontSize: 10, color: inkSoft }}>Delivered</div>
                      </div>
                      <div style={{ background: t[50], borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: dt[500] }}>{campaign.readCount}</div>
                        <div style={{ fontSize: 10, color: inkSoft }}>Read</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setViewingCampaign(campaign)} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 600, color: dt[600], background: dt[50], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>View</button>
                      {campaign.status === 'draft' && (
                        <button onClick={() => handleSendCampaign(campaign.id)} className="prime-btn" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}><Send size={16} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TEMPLATES VIEW */}
        {activeView === 'templates' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Message Templates</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>{templates.length} WhatsApp-approved templates</p>
              </div>
              <button onClick={() => setShowNewTemplate(true)} className="prime-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={18} />New Template
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filteredTemplates.slice(0, 50).map(template => (
                <div key={template.id} className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getCategoryIcon(template.category)}
                      <h3 style={{ fontWeight: 600, color: ink, fontSize: 13, margin: 0 }}>{template.name}</h3>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: template.status === 'active' ? dt[50] : t[50], color: template.status === 'active' ? dt[700] : inkSoft }}>{template.status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: inkSoft, margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap' }}>{template.content}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: inkSoft, marginBottom: 12 }}>
                    <span style={{ background: t[50], padding: '2px 8px', borderRadius: 4 }}>{template.category}</span>
                    <span>Used {template.usageCount}×</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { navigator.clipboard.writeText(template.content); notify('Copied to clipboard!', 'success'); }} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 12, fontWeight: 600, color: inkSoft, background: t[50], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                      <Copy size={12} style={{ display: 'inline', marginRight: 4 }} />Copy
                    </button>
                    <button onClick={() => { setShowTemplatePreview(template); setShowTemplatePreviewModal(true); }} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 12, fontWeight: 600, color: dt[600], background: dt[50], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                      Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUTOMATION VIEW */}
        {activeView === 'automation' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>Automation Flows</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>{automations.length} active flows</p>
              </div>
              <button onClick={() => setShowNewAutomation(true)} className="prime-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', lineHeight: 1.4 }}>
                <Plus size={18} />New Flow
              </button>
            </div>

            {automations.length === 0 ? (
              <div className="prime-card" style={{ textAlign: 'center', padding: 48, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                <Bot size={48} style={{ color: hairline, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: inkSoft, fontWeight: 500 }}>No automation flows yet</p>
                <button onClick={() => setShowNewAutomation(true)} className="prime-btn-secondary" style={{ color: dt[500], fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 8 }}>Create your first flow</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
                {automations.map(flow => (
                  <div key={flow.id} className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ padding: 8, background: dt[50], borderRadius: 10 }}>
                          <GitBranch size={18} style={{ color: dt[600] }} />
                        </div>
                        <div>
                          <h3 style={{ fontWeight: 600, color: ink, margin: 0, fontSize: 14 }}>{flow.name}</h3>
                          <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0' }}>Trigger: {flow.trigger}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: flow.status === 'active' ? dt[50] : flow.status === 'paused' ? dAmber[100] : t[50], color: flow.status === 'active' ? dt[700] : flow.status === 'paused' ? '#23282A' : inkSoft }}>{flow.status}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: inkSoft, marginBottom: 12 }}>
                      <span>{flow.steps.length} steps</span>
                      <span>{flow.stats.triggered} triggered</span>
                      <span>{flow.stats.completed} completed</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setEditingFlow(flow)} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 600, color: inkSoft, background: t[50], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                        <Settings size={14} style={{ display: 'inline', marginRight: 4 }} />Edit
                      </button>
                      {flow.status === 'active' ? (
                        <button onClick={() => whatsAppMarketingService.toggleAutomation(flow.id).then(loadData)} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 600, color: dAmber[500], background: dAmber[100], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                          <Pause size={14} style={{ display: 'inline', marginRight: 4 }} />Pause
                        </button>
                      ) : (
                        <button onClick={() => whatsAppMarketingService.toggleAutomation(flow.id).then(loadData)} className="prime-btn-secondary" style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 600, color: dt[600], background: dt[50], border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                          <Play size={14} style={{ display: 'inline', marginRight: 4 }} />Activate
                        </button>
                      )}
                      <button onClick={() => handleDeleteAutomation(flow.id)} className="prime-btn-secondary" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: danger, background: '#fef7f6', border: 'none', borderRadius: 8, cursor: 'pointer', lineHeight: 1.4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACCOUNTS VIEW */}
        {activeView === 'accounts' && (
          <div className="flex-1 overflow-auto p-6 bg-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">WhatsApp Accounts</h2>
                <p className="text-sm text-slate-500">Manage your connected WhatsApp accounts</p>
              </div>
              <div className="flex gap-2">
                {waAccount && (
                  <button
                    onClick={() => { setWAPhoneNumberId(waAccount.phone_number_id || ''); setWAAccessToken(waAccount.access_token || ''); setShowWASettings(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
                  >
                    <RefreshCw size={18} />Configure
                  </button>
                )}
                <button
                  onClick={() => setShowBulkSend(true)}
                  disabled={!waConfigured}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />Bulk Send
                </button>
              </div>
            </div>

            {!waAccount ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium mb-4">No WhatsApp API configured</p>
                <button
                  onClick={() => setShowWASettings(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
                >
                  Configure WhatsApp
                </button>
              </div>
            ) : (
              <div className="max-w-2xl">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${
                        waConfigured ? 'bg-green-100' : 'bg-slate-100'
                      }`}>
                        <MessageCircle size={28} className={waConfigured ? 'text-green-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{waAccount.display_name || 'Meta WhatsApp API'}</h3>
                        <p className="text-sm text-slate-500">{waAccount.phone_number_id ? `Phone Number ID: ${waAccount.phone_number_id}` : 'Not configured'}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                      waConfigured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {waConfigured ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1">Status</p>
                      <p className="text-sm font-semibold text-slate-800">{waConfigured ? 'Connected' : 'Disconnected'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1">Last Connected</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {waAccount.last_connected_at 
                          ? new Date(waAccount.last_connected_at).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {waConfigured ? (
                      <button
                        onClick={handleDisconnectWhatsApp}
                        className="px-6 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowWASettings(true)}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
                      >
                        Configure
                      </button>
                    )}
                  </div>
                </div>

                {/* Queue Stats */}
                {queueStats.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-6 mt-4">
                    <h3 className="font-bold text-slate-800 mb-4">Message Queue</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {queueStats.map((s) => (
                        <div key={s.status} className="bg-slate-50 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold text-slate-800">{s.count}</p>
                          <p className="text-xs text-slate-500 capitalize">{s.status}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY LOG VIEW */}
        {activeView === 'activity' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 24, background: t[50] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>WhatsApp Activity Log</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '2px 0 0' }}>{activityLog.length} recorded messages</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={activityFilters.dateRange || 'all'} onChange={(e) => { const val = e.target.value; setActivityFilters(prev => ({ ...prev, dateRange: val === 'all' ? undefined : val })); setTimeout(loadActivityLog, 100); }} className="prime-select" style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
                <select value={activityFilters.status || 'all'} onChange={(e) => { const val = e.target.value; setActivityFilters(prev => ({ ...prev, status: val === 'all' ? undefined : val })); setTimeout(loadActivityLog, 100); }} className="prime-select" style={{ padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All Status</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="received">Received</option>
                </select>
                <button onClick={loadActivityLog} className="prime-btn-secondary" style={{ padding: 8, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, cursor: 'pointer', display: 'flex' }}><RefreshCw size={18} style={{ color: inkSoft }} /></button>
              </div>
            </div>

            {activityLog.length === 0 ? (
              <div className="prime-card" style={{ textAlign: 'center', padding: 48, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                <MessageCircle size={48} style={{ color: hairline, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: inkSoft, fontWeight: 500 }}>No messages yet</p>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>Messages sent through connected accounts will appear here</p>
              </div>
            ) : (
              <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead style={{ background: t[50] }}>
                    <tr style={{ borderBottom: `1.4px solid ${hairline}` }}>
                      <th className="prime-table-header" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recipient</th>
                      <th className="prime-table-header" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Message</th>
                      <th className="prime-table-header" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                      <th className="prime-table-header" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Direction</th>
                      <th className="prime-table-header" style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLog.map((msg) => (
                      <tr key={msg.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = t[50]}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td className="prime-table-cell" style={{ padding: '10px 16px' }}>
                          <p style={{ fontWeight: 500, color: ink, margin: 0, fontSize: 13 }}>{msg.recipient_name || msg.recipient}</p>
                          <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0' }}>{msg.recipient}</p>
                        </td>
                        <td className="prime-table-cell" style={{ padding: '10px 16px', maxWidth: 240 }}>
                          <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ink, margin: 0 }}>{msg.message_content}</p>
                          {msg.template_id && <p style={{ fontSize: 12, color: dt[500], margin: '2px 0 0' }}>Template: {msg.template_id}</p>}
                        </td>
                        <td className="prime-table-cell" style={{ padding: '10px 16px' }}>
                          <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 20, background: msg.status === 'sent' ? dt[50] : msg.status === 'delivered' ? '#dbeafe' : msg.status === 'failed' ? '#fef7f6' : msg.status === 'received' ? t[50] : t[50], color: msg.status === 'sent' ? dt[700] : msg.status === 'delivered' ? '#1d4ed8' : msg.status === 'failed' ? danger : msg.status === 'received' ? dt[700] : inkSoft }}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="prime-table-cell" style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: msg.direction === 'outbound' ? dt[600] : dt[500] }}>
                            {msg.direction === 'outbound' ? 'Outgoing' : 'Incoming'}
                          </span>
                        </td>
                        <td className="prime-table-cell" style={{ padding: '10px 16px', fontSize: 12, color: inkSoft }}>
                          {new Date(msg.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="prime-card" style={{ background: paper, borderRadius: 14, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: paper }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)` }}>
                  <Send size={20} style={{ color: '#fff' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: 0 }}>New Campaign</h2>
                  <p style={{ fontSize: 11, color: inkSoft, margin: '2px 0 0' }}>Create a marketing message</p>
                </div>
              </div>
              <button onClick={() => setShowNewCampaign(false)} className="prime-btn-secondary" style={{ padding: 8, border: `1px solid ${hairline}`, borderRadius: 8, background: paper, cursor: 'pointer', display: 'flex' }}><X size={18} style={{ color: inkSoft }} /></button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Basic Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Campaign Name *</label>
                  <input className="prime-input" type="text" value={campaignForm.name} onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="e.g., Summer Sale 2024" />
                </div>
                <div>
                  <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Schedule (Optional)</label>
                  <input className="prime-input" type="datetime-local" value={campaignForm.scheduledAt} onChange={(e) => setCampaignForm(prev => ({ ...prev, scheduledAt: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Description</label>
                <input className="prime-input" type="text" value={campaignForm.description} onChange={(e) => setCampaignForm(prev => ({ ...prev, description: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="Brief description" />
              </div>

              {/* Template */}
              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Template (Optional)</label>
                <select value={campaignForm.templateId} onChange={(e) => handleTemplateSelect(e.target.value)} className="prime-select" style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="">Select a template...</option>
                  {templates.slice(0, 20).map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Message *</label>
                <textarea value={campaignForm.message} onChange={(e) => setCampaignForm(prev => ({ ...prev, message: e.target.value }))} className="prime-input" style={{ width: '100%', padding: '10px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', resize: 'none', height: 112, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box', lineHeight: 1.5 }} placeholder="Enter your message or select a template..." />
                <p style={{ fontSize: 10, color: inkSoft, marginTop: 4 }}>Use {'{{name}}'} for customer name, {'{{company}}'} for company name</p>
              </div>

              {/* Targeting Mode */}
              <div style={{ background: t[50], borderRadius: 10, padding: 16, border: `1px solid ${hairline}` }}>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 12 }}>Targeting Mode</label>
                <div className="prime-btn-secondary" style={{ display: 'flex', background: paper, padding: 3, borderRadius: 10, border: `1px solid ${hairline}`, marginBottom: 12 }}>
                  {(['customers', 'manual', 'group'] as const).map((mode) => (
                    <button key={mode} onClick={() => setCampaignTarget(mode)} style={{ flex: 1, padding: 8, fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', transition: 'all .15s ease', cursor: 'pointer', background: campaignTarget === mode ? `linear-gradient(135deg, ${dt[500]}, ${dt[700]})` : 'transparent', color: campaignTarget === mode ? '#fff' : inkSoft, lineHeight: 1.4 }}>
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                {campaignTarget === 'customers' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
                      <input className="prime-input" type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customers..." style={{ width: '100%', padding: '8px 12px 8px 36px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ maxHeight: 120, overflow: 'auto', border: `1px solid ${hairline}`, borderRadius: 9, background: paper }}>
                      {customers.filter((c: any) => c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch)).map((customer: any) => (
                        <label key={customer.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer', borderBottom: `1px solid ${hairline}` }}
                          onMouseEnter={e => e.currentTarget.style.background = t[50]}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <input type="checkbox" checked={selectedCustomerIds.includes(customer.id)} onChange={(e) => { if (e.target.checked) { setSelectedCustomerIds(prev => [...prev, customer.id]); } else { setSelectedCustomerIds(prev => prev.filter(id => id !== customer.id)); } }} style={{ accentColor: dt[500], width: 16, height: 16 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</p>
                            <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{customer.phone || 'No phone'}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: inkSoft }}>
                      <span>{selectedCustomerIds.length} customers selected</span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button onClick={() => { const allIds = customers.map((c: any) => c.id); setSelectedCustomerIds(allIds); }} className="prime-btn-secondary" style={{ color: dt[500], fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Select All</button>
                        <button onClick={() => setSelectedCustomerIds([])} className="prime-btn-secondary" style={{ color: danger, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Deselect All</button>
                      </div>
                    </div>
                  </div>
                )}

                {campaignTarget === 'manual' && (
                  <div>
                    <textarea value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} className="prime-input" style={{ width: '100%', padding: 10, border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', height: 96, resize: 'none', fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder={"Enter phone numbers (one per line or comma-separated)\n+254712345678\n+254798765432"} />
                    <p style={{ fontSize: 10, color: inkSoft, marginTop: 4, textTransform: 'uppercase', fontWeight: 700 }}>Paste numbers from Excel or CSV</p>
                  </div>
                )}

                {campaignTarget === 'group' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <Link size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
                      <input className="prime-input" type="text" value={groupLink} onChange={(e) => setGroupLink(e.target.value)} placeholder="Paste WhatsApp Group Invitation Link" style={{ width: '100%', padding: '8px 12px 8px 36px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ padding: 10, background: t[50], borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${dt[100]}` }}>
                      <Info size={16} style={{ color: dt[500], flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: dt[800], margin: 0, lineHeight: 1.5 }}>Messages will be sent directly to the selected group when you click Create Campaign.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Business Link */}
              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ExternalLink size={14} style={{ color: dt[500] }} /> Business Broadcast / Custom Link (Optional)
                </label>
                <input className="prime-input" type="text" value={broadcastLink} onChange={(e) => setBroadcastLink(e.target.value)} placeholder="e.g., WhatsApp Business Broadcast URL" style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
                <p style={{ fontSize: 10, color: inkSoft, marginTop: 4 }}>If provided, this link will open after campaign creation</p>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${hairline}`, display: 'flex', gap: 12 }}>
              <button onClick={() => setShowNewCampaign(false)} className="prime-btn-secondary" style={{ flex: 1, padding: '10px 16px', border: `1.4px solid ${hairline}`, borderRadius: 10, fontWeight: 600, fontSize: 13, color: ink, background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}>Cancel</button>
              <button onClick={handlePreviewCampaign} className="prime-btn" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', lineHeight: 1.4 }}>Preview</button>
              <button onClick={handleCreateCampaign} className="prime-btn" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', lineHeight: 1.4 }}>{campaignForm.scheduledAt ? 'Schedule Campaign' : 'Create Campaign'}</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Settings Modal */}
      {showAISettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="prime-card" style={{ background: paper, borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: `1px solid ${hairline}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: dt[50], borderRadius: 8 }}>
                  <Sparkles size={20} style={{ color: dt[600] }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: 0 }}>AI Settings</h2>
                  <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0' }}>Configure AI for smart replies & templates</p>
                </div>
              </div>
              <button onClick={() => setShowAISettings(false)} className="prime-btn-secondary" style={{ padding: 8, border: `1px solid ${hairline}`, borderRadius: 8, background: paper, cursor: 'pointer', display: 'flex' }}><X size={18} style={{ color: inkSoft }} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: t[50], borderRadius: 10, border: `1px solid ${dt[100]}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: aiConfig.enabled ? dt[500] : hairline }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0 }}>AI Features</p>
                    <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>{aiConfig.enabled ? 'Smart replies & template generation active' : 'AI is currently disabled'}</p>
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={aiConfig.enabled} onChange={(e) => setAIConfig(prev => ({ ...prev, enabled: e.target.checked }))} style={{ display: 'none' }} />
                  <div style={{ width: 44, height: 24, borderRadius: 12, background: aiConfig.enabled ? dt[500] : hairline, position: 'relative', transition: 'background .2s' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: aiConfig.enabled ? 22 : 2, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                  </div>
                </label>
              </div>

              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>AI Provider</label>
                <select value={aiConfig.provider} onChange={(e) => { const provider = e.target.value; const defaults: Record<string, { endpoint: string; model: string }> = { openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, anthropic: { endpoint: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' }, ollama: { endpoint: 'http://localhost:11434/v1', model: 'llama3' }, openrouter: { endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' } }; const def = defaults[provider] || defaults.openai; setAIConfig(prev => ({ ...prev, provider, endpoint: def.endpoint, model: def.model })); }} className="prime-select" style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              {aiConfig.provider !== 'ollama' && (
                <div>
                  <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>API Key</label>
                  <input className="prime-input" type="password" value={aiConfig.apiKey} onChange={(e) => setAIConfig(prev => ({ ...prev, apiKey: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="sk-..." />
                  <p style={{ fontSize: 10, color: inkSoft, marginTop: 4 }}>Your key is stored locally and never sent anywhere except the selected provider</p>
                </div>
              )}

              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>API Endpoint</label>
                <input className="prime-input" type="text" value={aiConfig.endpoint} onChange={(e) => setAIConfig(prev => ({ ...prev, endpoint: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="prime-label" style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Model</label>
                <input className="prime-input" type="text" value={aiConfig.model} onChange={(e) => setAIConfig(prev => ({ ...prev, model: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${hairline}`, display: 'flex', gap: 12 }}>
              <button onClick={() => setShowAISettings(false)} className="prime-btn-secondary" style={{ flex: 1, padding: '10px 16px', border: `1.4px solid ${hairline}`, borderRadius: 10, fontWeight: 600, fontSize: 13, color: ink, background: 'transparent', cursor: 'pointer', lineHeight: 1.4 }}>Cancel</button>
              <button onClick={async () => { await aiService.saveConfig(aiConfig as AIConfig); setShowAISettings(false); notify('AI settings saved!', 'success'); }} className="prime-btn" style={{ flex: 1, padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', lineHeight: 1.4 }}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp API Config Modal */}
      {showWASettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="prime-card" style={{ background: paper, borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: `1px solid ${hairline}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: dt[50], borderRadius: 8 }}>
                  <MessageCircle size={20} style={{ color: dt[600] }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: 0 }}>WhatsApp API Configuration</h2>
                  <p style={{ fontSize: 12, color: inkSoft, margin: '2px 0 0' }}>{waConfigured ? 'Update your Meta WhatsApp API credentials' : 'Enter your Meta WhatsApp API credentials'}</p>
                </div>
              </div>
              <button onClick={() => { setShowWASettings(false); setWAPhoneNumberId(''); setWAAccessToken(''); }} className="prime-btn-secondary" style={{ padding: 8, border: `1px solid ${hairline}`, borderRadius: 8, background: paper, cursor: 'pointer', display: 'flex' }}><X size={18} style={{ color: inkSoft }} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: t[50], border: `1px solid ${dt[100]}`, borderRadius: 10, padding: 12, fontSize: 13, color: dt[800] }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>WhatsApp Business Cloud API</p>
                <p style={{ fontSize: 12, color: dt[600], margin: 0 }}>Configure your Meta WhatsApp Business API credentials to send messages. Get these from the Meta Developer Portal.</p>
              </div>

              <div>
                <label className="prime-label" style={{ fontSize: 12, fontWeight: 600, color: ink, marginBottom: 6, display: 'block' }}>Phone Number ID</label>
                <input className="prime-input" type="text" value={waPhoneNumberId} onChange={(e) => setWAPhoneNumberId(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="Enter your WhatsApp Phone Number ID" />
              </div>

              <div>
                <label className="prime-label" style={{ fontSize: 12, fontWeight: 600, color: ink, marginBottom: 6, display: 'block' }}>Access Token</label>
                <input className="prime-input" type="password" value={waAccessToken} onChange={(e) => setWAAccessToken(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`, borderRadius: 9, fontSize: 13, color: ink, background: '#fff', outline: 'none', lineHeight: 1.4, fontFamily: "'Inter','DM Sans',sans-serif", boxSizing: 'border-box' }} placeholder="Enter your Permanent Access Token" />
              </div>

              {waConfigured && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={async () => { const sessionUser = sessionStorage.getItem('nexus_user'); const user = sessionUser ? JSON.parse(sessionUser) : null; if (user) await whatsappClient.disconnect(user.id); setWAAccount(null); setWAConfigured(false); setShowWASettings(false); notify('Disconnected', 'success'); }} className="prime-btn-secondary" style={{ flex: 1, padding: '8px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, color: danger, background: '#fef7f6', border: 'none', cursor: 'pointer', lineHeight: 1.4 }}>Disconnect</button>
                  <button onClick={handleSaveConfig} disabled={configuringWA} className="prime-btn" style={{ flex: 1, padding: '8px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, border: 'none', cursor: configuringWA ? 'default' : 'pointer', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', opacity: configuringWA ? 0.7 : 1, lineHeight: 1.4 }}>{configuringWA ? 'Saving...' : 'Update'}</button>
                </div>
              )}

              {!waConfigured && (
                <button onClick={handleSaveConfig} disabled={configuringWA} className="prime-btn" style={{ width: '100%', padding: '8px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, border: 'none', cursor: configuringWA ? 'default' : 'pointer', background: `linear-gradient(135deg, ${dt[500]}, ${dt[700]})`, color: '#fff', opacity: configuringWA ? 0.7 : 1, lineHeight: 1.4 }}>{configuringWA ? 'Saving...' : 'Save Configuration'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Send Modal */}
      {showBulkSend && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Send size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Bulk Send Messages</h2>
                  <p className="text-xs text-slate-500">Send to multiple recipients at once</p>
                </div>
              </div>
              <button onClick={() => setShowBulkSend(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Message *</label>
                <textarea
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter your message..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Recipients * <span className="text-xs text-slate-400 font-normal">(one per line)</span>
                </label>
                <textarea
                  value={bulkRecipients}
                  onChange={(e) => setBulkRecipients(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm min-h-[120px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  placeholder="+260971234567&#10;+260977654321&#10;+260955555555"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {bulkRecipients.split('\n').filter((r) => r.trim()).length} recipients
                </p>
              </div>

              {bulkSending && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Sending...</span>
                    <span className="font-medium text-slate-800">{bulkProgress.sent + bulkProgress.failed}/{bulkProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-indigo-600 rounded-full h-2 transition-all"
                      style={{ width: `${((bulkProgress.sent + bulkProgress.failed) / Math.max(bulkProgress.total, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">{bulkProgress.sent} sent</span>
                    <span className="text-red-600">{bulkProgress.failed} failed</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBulkSend(false)}
                  className="flex-1 py-3 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSend}
                  disabled={bulkSending || !bulkMessage.trim() || !bulkRecipients.trim()}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkSending ? 'Sending...' : `Send to ${bulkRecipients.split('\n').filter((r) => r.trim()).length} recipients`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Preview Modal */}
      {showCampaignPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Campaign Preview</h2>
              <button onClick={() => setShowCampaignPreview(false)} className="text-slate-500 hover:text-slate-700" title="Close" aria-label="Close campaign preview">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Campaign Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name:</span>
                    <span className="font-medium text-slate-800">{campaignForm.name || 'Unnamed Campaign'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Description:</span>
                    <span className="text-slate-800">{campaignForm.description || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Recipients:</span>
                    <span className="font-medium text-green-600">{campaignForm.recipients.length} contacts</span>
                  </div>
                  {campaignForm.scheduledAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Scheduled:</span>
                      <span className="text-slate-800">{new Date(campaignForm.scheduledAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Message Preview</label>
                <div className="bg-slate-100 rounded-lg p-4 mb-2">
                  <div className="bg-white rounded-xl border border-slate-200 p-3 max-w-sm ml-auto">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {replaceVars(campaignForm.message)}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 text-right">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">This is how your message will appear to recipients</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Users size={16} className="text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">Variable Substitution</h4>
                    <p className="text-xs text-blue-600 mt-1">
                      Variables like {'{{name}}'} will be automatically replaced with each recipient&apos;s name.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowCampaignPreview(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    handleCreateCampaign();
                    setShowCampaignPreview(false);
                  }}
                  className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  {campaignForm.scheduledAt ? 'Schedule Campaign' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showTemplatePreviewModal && showTemplatePreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Template Preview</h2>
                <p className="text-sm text-green-600">{showTemplatePreview.category}</p>
              </div>
              <button onClick={() => setShowTemplatePreviewModal(false)} className="text-slate-500 hover:text-slate-700" title="Close" aria-label="Close template preview">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase">Template Name</span>
                </div>
                <p className="font-medium text-slate-800">{showTemplatePreview.name}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase">Message Preview</span>
                </div>
                <div className="bg-slate-100 rounded-lg p-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-3 max-w-sm ml-auto">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {replaceVars(showTemplatePreview.content)}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 text-right">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Variables will be replaced with actual values when sending</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase">Variables Used</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{'{{name}}'}</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{'{{company}}'}</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{'{{product}}'}</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{'{{link}}'}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowTemplatePreviewModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setCampaignForm(prev => ({ ...prev, message: showTemplatePreview.content, templateId: showTemplatePreview.id }));
                    setShowTemplatePreviewModal(false);
                    notify('Template loaded to campaign!', 'success');
                  }}
                  className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  Use Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Automation Flow Modal */}
      {(showNewAutomation || editingFlow) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{editingFlow ? 'Edit Automation Flow' : 'Create Automation Flow'}</h2>
                  <p className="text-sm text-slate-500">Design automated responses to customer triggers</p>
                </div>
              </div>
              <button onClick={() => { setShowNewAutomation(false); setEditingFlow(null); }} className="text-slate-500 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Close" aria-label="Close automation dialog">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Flow Name *</label>
                  <input
                    type="text"
                    value={editingFlow ? editingFlow.name : automationForm.name}
                    onChange={(e) => editingFlow 
                      ? setEditingFlow({...editingFlow, name: e.target.value})
                      : setAutomationForm(prev => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all outline-none"
                    placeholder="e.g., Welcome New Customers"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Trigger Type</label>
                  <select
                    value={editingFlow ? editingFlow.triggerType : automationForm.triggerType}
                    onChange={(e) => editingFlow
                      ? setEditingFlow({...editingFlow, triggerType: e.target.value})
                      : setAutomationForm(prev => ({ ...prev, triggerType: e.target.value }))
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all outline-none"
                  >
                    <option value="keyword">On Keyword Mention</option>
                    <option value="new_customer">New Customer Welcome</option>
                    <option value="purchase">After Purchase</option>
                    <option value="appointment">Appointment Confirmed</option>
                    <option value="inquiry">New Inquiry</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {(editingFlow ? editingFlow.triggerType : automationForm.triggerType) === 'keyword' ? 'Trigger Keyword *' : 'Trigger Description'}
                </label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={18} />
                  <input
                    type="text"
                    value={editingFlow ? editingFlow.trigger : automationForm.trigger}
                    onChange={(e) => editingFlow
                      ? setEditingFlow({...editingFlow, trigger: e.target.value})
                      : setAutomationForm(prev => ({ ...prev, trigger: e.target.value }))
                    }
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all outline-none"
                    placeholder={(editingFlow ? editingFlow.triggerType : automationForm.triggerType) === 'keyword' ? 'e.g., "Hello" or "Price"' : 'Briefly describe when this triggers'}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-semibold text-slate-700">Flow Steps</label>
                  <button 
                    onClick={() => {
                      if (editingFlow) {
                        setEditingFlow({
                          ...editingFlow,
                          steps: [...editingFlow.steps, { id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, order: editingFlow.steps.length + 1, type: 'message', config: { message: '' } }]
                        });
                      } else {
                        addAutomationStep();
                      }
                    }}
                    className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={14} /> Add Step
                  </button>
                </div>
                
                <div className="space-y-4 relative before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-100">
                  {(editingFlow ? editingFlow.steps : automationForm.steps).map((step, idx) => (
                    <div key={step.id} className="relative pl-12">
                      <div className="absolute left-0 top-2 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-sm font-bold text-slate-400 z-10 shadow-sm">
                        {idx + 1}
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-purple-200 transition-all">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <MessageSquare size={16} className="text-purple-500" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Send Message</span>
                          </div>
                          {(editingFlow ? editingFlow.steps.length : automationForm.steps.length) > 1 && (
                            <button 
                              onClick={() => {
                                if (editingFlow) {
                                  setEditingFlow({
                                    ...editingFlow,
                                    steps: editingFlow.steps.filter(s => s.id !== step.id).map((s, i) => ({ ...s, order: i + 1 }))
                                  });
                                } else {
                                  removeAutomationStep(step.id);
                                }
                              }}
                              className="text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <textarea
                          value={step.config.message}
                          onChange={(e) => {
                            if (editingFlow) {
                              setEditingFlow({
                                ...editingFlow,
                                steps: editingFlow.steps.map(s => s.id === step.id ? { ...s, config: { ...s.config, message: e.target.value } } : s)
                              });
                            } else {
                              updateAutomationStep(step.id, e.target.value);
                            }
                          }}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm h-24 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                          placeholder="Type the automated response message..."
                        />
                        <div className="mt-2 text-[10px] text-slate-400">
                          Supports {'{{name}}'}, {'{{company}}'} variables
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => { setShowNewAutomation(false); setEditingFlow(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingFlow ? handleUpdateAutomation : handleCreateAutomation}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={18} /> {editingFlow ? 'Update Flow' : 'Save & Activate Flow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Details Modal */}
      {viewingCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-xl">
                  <BarChart3 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{viewingCampaign.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${getStatusColor(viewingCampaign.status)}`}>
                      {viewingCampaign.status}
                    </span>
                    <span className="text-xs text-slate-400">• Created on {new Date(viewingCampaign.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setViewingCampaign(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stats Section */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total Sent</div>
                      <div className="text-2xl font-black text-slate-800">{viewingCampaign.sentCount}</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">Delivered</div>
                      <div className="text-2xl font-black text-blue-700">{viewingCampaign.deliveredCount}</div>
                      <div className="text-[10px] text-blue-500 font-bold mt-1">
                        {Math.round((viewingCampaign.deliveredCount / viewingCampaign.sentCount) * 100) || 0}% Success Rate
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                      <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-1">Read</div>
                      <div className="text-2xl font-black text-emerald-700">{viewingCampaign.readCount}</div>
                      <div className="text-[10px] text-emerald-500 font-bold mt-1">
                        {Math.round((viewingCampaign.readCount / viewingCampaign.deliveredCount) * 100) || 0}% Open Rate
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                      <div className="text-red-600 text-xs font-bold uppercase tracking-wider mb-1">Failed</div>
                      <div className="text-2xl font-black text-red-700">{viewingCampaign.failedCount}</div>
                      <div className="text-[10px] text-red-500 font-bold mt-1">
                        {Math.round((viewingCampaign.failedCount / viewingCampaign.sentCount) * 100) || 0}% Failure Rate
                      </div>
                    </div>
                  </div>

                  {/* Performance Chart Simulation */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <TrendingUp size={16} className="text-green-600" />
                      Delivery Performance
                    </h3>
                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-1000" 
                        style={{ width: `${(viewingCampaign.readCount / viewingCampaign.sentCount) * 100}%` }}
                      />
                      <div 
                        className="h-full bg-blue-500 transition-all duration-1000" 
                        style={{ width: `${((viewingCampaign.deliveredCount - viewingCampaign.readCount) / viewingCampaign.sentCount) * 100}%` }}
                      />
                      <div 
                        className="h-full bg-red-400 transition-all duration-1000" 
                        style={{ width: `${(viewingCampaign.failedCount / viewingCampaign.sentCount) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-4 mt-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Read
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" /> Delivered
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        <div className="w-2 h-2 bg-red-400 rounded-full" /> Failed
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <FileText size={16} className="text-blue-600" />
                      Message Content
                    </h3>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-lg shadow-sm">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {replaceVars(viewingCampaign.message)}
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-3 text-slate-400">
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            {viewingCampaign.sentAt ? new Date(viewingCampaign.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Draft'}
                          </span>
                          <CheckCheck size={14} className="text-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Campaign Info</h3>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Description</span>
                        <span className="text-sm text-slate-700 font-medium">{viewingCampaign.description || 'No description provided'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Template ID</span>
                        <span className="text-sm text-slate-700 font-medium font-mono">{viewingCampaign.templateId || 'None (Custom)'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Estimated Cost</span>
                        <span className="text-sm font-bold text-green-600">{currency}{viewingCampaign.cost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                      Recipients
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{viewingCampaign.recipients.length}</span>
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-auto pr-2 custom-scrollbar">
                      {viewingCampaign.recipients.slice(0, 50).map((recipient, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-all">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 text-xs font-bold">
                            {i + 1}
                          </div>
                          <span className="text-xs font-medium text-slate-600">{recipient}</span>
                        </div>
                      ))}
                      {viewingCampaign.recipients.length > 50 && (
                        <div className="text-center text-[10px] text-slate-400 font-bold uppercase py-2">
                          + {viewingCampaign.recipients.length - 50} more recipients
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setCampaignForm({
                          name: `Copy of ${viewingCampaign.name}`,
                          description: viewingCampaign.description,
                          templateId: viewingCampaign.templateId || '',
                          message: viewingCampaign.message,
                          recipients: viewingCampaign.recipients,
                          scheduledAt: ''
                        });
                        setViewingCampaign(null);
                        setShowNewCampaign(true);
                      }}
                      className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                    >
                      <Copy size={18} /> Duplicate
                    </button>
                    <button className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all" title="Delete" aria-label="Delete campaign">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setViewingCampaign(null)}
                className="px-8 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Template Preview Modal */}
      {showSendTemplateModal && showTemplatePreview && selectedChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Send Template</h2>
                <p className="text-xs text-slate-500">{showTemplatePreview.name}</p>
              </div>
              <button onClick={() => setShowSendTemplateModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">To</label>
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 text-xs font-bold">
                    {selectedChat.customerName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedChat.customerName}</p>
                    <p className="text-xs text-slate-400">{selectedChat.customerPhone}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Message Preview</label>
                <div className="bg-slate-100 rounded-xl p-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-3 max-w-sm ml-auto shadow-sm">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {(() => {
                        let preview = showTemplatePreview.content;
                        for (const [key, value] of Object.entries(resolvedVars)) {
                          if (value) preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
                        }
                        return preview;
                      })()}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 text-right">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Variables <span className="text-slate-300 font-normal lowercase">(edit if needed)</span>
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(resolvedVars).filter(([, v]) => v).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1.5 rounded-lg shrink-0 min-w-[70px] text-center">
                        {'{{'}{key}{'}}'}
                      </span>
                      <input
                        type="text"
                        value={resolvedVars[key] || ''}
                        onChange={(e) => setResolvedVars(prev => ({ ...prev, [key]: e.target.value }))}
                        className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      />
                    </div>
                  ))}
                  {Object.keys(resolvedVars).filter(k => resolvedVars[k]).length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No variables used in this template</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSendTemplateModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSendTemplate}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

export default MarketingMessages;
