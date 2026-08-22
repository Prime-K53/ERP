import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';

import { logger } from '@/services/logger';

import { HashRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Breadcrumbs from './components/Breadcrumbs';
import Toast from './components/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { FinancialYearProvider, useFinancialYear } from './context/FinancialYearContext';
import { FinanceProvider } from './context/FinanceContext';
import { InventoryProvider } from './context/InventoryContext';
import { SalesProvider } from './context/SalesContext';
import { ProductionProvider } from './context/ProductionContext';
import { ProcurementProvider } from './context/ProcurementContext';
import { DataProvider, useData } from './context/DataContext';
import { useSales } from './context/SalesContext';
import { useInventory } from './context/InventoryContext';
import { useNotifications } from './context/NotificationContext';
import { ExaminationProvider } from './context/ExaminationContext';
import { NotificationProvider } from './context/NotificationContext';
import { OrdersProvider } from './context/OrdersContext';
import { PwaInstallProvider, usePwaInstall } from './context/PwaInstallContext';
import PwaInstallBanner from './components/PwaInstallBanner';
import PwaUpdateNotification from './components/PwaUpdateNotification';
import PwaInstallPage from './views/PwaInstallPage';
import { KeyboardProvider } from './core/keyboard';

import { ErrorBoundary } from './components/ErrorBoundary';
import { useKeyboard } from './core/keyboard';
import { useKeyboard as useGlobalKeyboard } from './hooks';
import { useDocumentStore } from './stores/documentStore.ts';
import { PreviewModal } from './views/shared/components/PDF/PreviewModal.tsx';
import { PdfWorker } from './views/shared/components/PDF/PdfWorker.tsx';
import { Bell, Loader2, Coins, X, Menu, UserIcon, Search as SearchIcon, FileText, Users, LogOut, Box, Package, Settings as SettingsIcon, Wrench, ShieldCheck, Database, Calculator, MessageSquare, CalendarDays, Check, 
ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react';
import { AICopilot } from './components/ai';
import { NotificationCenter } from './components/ui';
import Login from './views/auth/Login';
import SetupWizard from './views/auth/SetupWizard';
import ForgotPassword from './views/auth/ForgotPassword';
import ResetPassword from './views/auth/ResetPassword';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import CustomerLayout from './views/portal/CustomerLayout';
import CustomerLogin from './views/portal/CustomerLogin';
import CustomerActivate from './views/portal/CustomerActivate';
import CustomerForgotPassword from './views/portal/CustomerForgotPassword';
import CustomerResetPassword from './views/portal/CustomerResetPassword';
import { ToastProvider } from './views/portal/components/Toast';

// Helper for lazy loading with retry logic to handle "Failed to fetch dynamically imported module" errors
const lazyWithRetry = (name: string, componentImport: () => Promise<any>) =>
  lazy(async () => {
    const maxRetries = 3;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const component = await componentImport();
        return component;
      } catch (error) {
        const err = error as { message?: string; stack?: string };
        logger.error('Lazy loading error:', {
          name,
          attempt,
          message: err?.message,
          error
        });
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
    }

    return { default: () => (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <div className="p-8 rounded-3xl bg-white/50 backdrop-blur-md text-center max-w-md border border-white shadow-soft">
          <h3 className="text-lg font-bold text-slate-700 mb-2">Failed to load module</h3>
          <p className="text-sm text-slate-600 mb-4">The module "{name}" could not be loaded. Please check your connection and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Reload page
          </button>
        </div>
      </div>
    )};
  });

const CustomerDashboard = lazyWithRetry('./views/portal/CustomerDashboard', () => import('./views/portal/CustomerDashboard'));
const CustomerOrders = lazyWithRetry('./views/portal/CustomerOrders', () => import('./views/portal/CustomerOrders'));
const CustomerOrderDetail = lazyWithRetry('./views/portal/CustomerOrderDetail', () => import('./views/portal/CustomerOrderDetail'));
const CustomerQuotations = lazyWithRetry('./views/portal/CustomerQuotations', () => import('./views/portal/CustomerQuotations'));
const CustomerInvoices = lazyWithRetry('./views/portal/CustomerInvoices', () => import('./views/portal/CustomerInvoices'));
const CustomerInvoiceDetail = lazyWithRetry('./views/portal/CustomerInvoiceDetail', () => import('./views/portal/CustomerInvoiceDetail'));
const CustomerPayments = lazyWithRetry('./views/portal/CustomerPayments', () => import('./views/portal/CustomerPayments'));
const CustomerPaymentDetail = lazyWithRetry('./views/portal/CustomerPaymentDetail', () => import('./views/portal/CustomerPaymentDetail'));
const CustomerDeliveries = lazyWithRetry('./views/portal/CustomerDeliveries', () => import('./views/portal/CustomerDeliveries'));
const CustomerAccountStatements = lazyWithRetry('./views/portal/CustomerAccountStatements', () => import('./views/portal/CustomerAccountStatements'));
const CustomerWallet = lazyWithRetry('./views/portal/CustomerWallet', () => import('./views/portal/CustomerWallet'));
const CustomerLoyalty = lazyWithRetry('./views/portal/CustomerLoyalty', () => import('./views/portal/CustomerLoyalty'));
const CustomerDocuments = lazyWithRetry('./views/portal/CustomerDocuments', () => import('./views/portal/CustomerDocuments'));
const CustomerNotifications = lazyWithRetry('./views/portal/CustomerNotifications', () => import('./views/portal/CustomerNotifications'));
const CustomerReferrals = lazyWithRetry('./views/portal/CustomerReferrals', () => import('./views/portal/CustomerReferrals'));
const CustomerProfile = lazyWithRetry('./views/portal/CustomerProfile', () => import('./views/portal/CustomerProfile'));
const CustomerSupport = lazyWithRetry('./views/portal/CustomerSupport', () => import('./views/portal/CustomerSupport'));
const CustomerCreateRequest = lazyWithRetry('./views/portal/CustomerCreateRequest', () => import('./views/portal/CustomerCreateRequest'));
const CustomerRequests = lazyWithRetry('./views/portal/CustomerRequests', () => import('./views/portal/CustomerRequests'));
const CustomerRequestDetail = lazyWithRetry('./views/portal/CustomerRequestDetail', () => import('./views/portal/CustomerRequestDetail'));
const CustomerQuotationDetail = lazyWithRetry('./views/portal/CustomerQuotationDetail', () => import('./views/portal/CustomerQuotationDetail'));
const CustomerPaymentOptions = lazyWithRetry('./views/portal/CustomerPaymentOptions', () => import('./views/portal/CustomerPaymentOptions'));
const PortalUserManagement = lazyWithRetry('./views/portal/PortalUserManagement', () => import('./views/portal/PortalUserManagement'));

import { isResponsiveDebugEnabled } from './utils/debugFlags';

function fyDisplayName(fy: { start_date: string; end_date: string; name: string }): string {
  const startYear = fy.start_date?.slice(0, 4);
  const endYear = fy.end_date?.slice(0, 4);
  if (!startYear) return fy.name || 'Unknown FY';
  return startYear !== endYear ? `FY ${startYear}/${endYear?.slice(2)}` : `FY ${startYear}`;
}


// Lazy loaded views
const Dashboard = lazyWithRetry('./views/Dashboard', () => import('./views/Dashboard'));
const Inventory = lazyWithRetry('./views/Inventory', () => import('./views/Inventory'));
const Purchases = lazyWithRetry('./views/Purchases', () => import('./views/Purchases'));
const Suppliers = lazyWithRetry('./views/purchases/Suppliers', () => import('./views/purchases/Suppliers'));
const GoodsReceived = lazyWithRetry('./views/purchases/GoodsReceived', () => import('./views/purchases/GoodsReceived'));
const POS = lazyWithRetry('./views/POS', () => import('./views/POS'));
const Architect = lazyWithRetry('./views/Architect', () => import('./views/Architect'));
const WorkOrders = lazyWithRetry('./views/production/WorkOrders', () => import('./views/production/WorkOrders'));
const Scheduler = lazyWithRetry('./views/production/Scheduler', () => import('./views/production/Scheduler'));
const ShopFloor = lazyWithRetry('./views/production/ShopFloor', () => import('./views/production/ShopFloor'));
const ShopFloorKiosk = lazyWithRetry('./views/production/ShopFloorKiosk', () => import('./views/production/ShopFloorKiosk'));
const GangRunEstimator = lazyWithRetry('./views/production/GangRunEstimator', () => import('./views/production/GangRunEstimator'));
const MRP = lazyWithRetry('./views/production/MRP', () => import('./views/production/MRP'));
const MachineMaintenance = lazyWithRetry('./views/production/MachineMaintenance', () => import('./views/production/MachineMaintenance'));
const ExaminationHub = lazyWithRetry('./views/examination/ExaminationHub', () => import('./views/examination/ExaminationHub'));
const ExaminationBatchForm = lazyWithRetry('./views/examination/ExaminationBatchForm', () => import('./views/examination/ExaminationBatchForm'));
const ExaminationBatchDetail = lazyWithRetry('./views/examination/ExaminationBatchDetail', () => import('./views/examination/ExaminationBatchDetail'));
const ExaminationJobForm = lazyWithRetry('./views/examination/ExaminationJobForm', () => import('./views/examination/ExaminationJobForm'));
const InvoiceGroupManager = lazyWithRetry('./views/examination/InvoiceGroupManager', () => import('./views/examination/InvoiceGroupManager'));
const RecurringProfiles = lazyWithRetry('./views/examination/RecurringProfiles', () => import('./views/examination/RecurringProfiles'));
const ExaminationPrinting = lazyWithRetry('./views/production/ExaminationPrinting', () => import('./views/production/ExaminationPrinting'));
const Subcontracting = lazyWithRetry('./views/purchases/Subcontracting', () => import('./views/purchases/Subcontracting'));
const Expenses = lazyWithRetry('./views/accounts/Expenses', () => import('./views/accounts/Expenses'));
const IncomeView = lazyWithRetry('./views/accounts/Income', () => import('./views/accounts/Income'));
const ChartOfAccounts = lazyWithRetry('./views/accounts/ChartOfAccounts', () => import('./views/accounts/ChartOfAccounts'));
const FinancialReports = lazyWithRetry('./views/accounts/FinancialReports', () => import('./views/accounts/FinancialReports'));
const Reconciliation = lazyWithRetry('./views/accounts/Reconciliation', () => import('./views/accounts/Reconciliation'));
const Budgets = lazyWithRetry('./views/accounts/Budgets', () => import('./views/accounts/Budgets'));
const Banking = lazyWithRetry('./views/accounts/Banking', () => import('./views/accounts/Banking'));
const Transfers = lazyWithRetry('./views/accounts/Transfers', () => import('./views/accounts/Transfers'));
const Payroll = lazyWithRetry('./views/accounts/Payroll', () => import('./views/accounts/Payroll'));
const AuditLogs = lazyWithRetry('./views/AuditLogs', () => import('./views/AuditLogs'));
const Forecasting = lazyWithRetry('./views/Forecasting', () => import('./views/Forecasting'));
const ItemDetailPage = lazyWithRetry('./views/inventory/ItemDetail/ItemDetailPage', () => import('./views/inventory/ItemDetail/ItemDetailPage'));
const SupplyChainHub = lazyWithRetry('./views/SupplyChainHub', () => import('./views/SupplyChainHub'));
const WarehousePage = lazyWithRetry('./views/warehouse/WarehousePage', () => import('./views/warehouse/WarehousePage'));
const InventoryReports = lazyWithRetry('./views/inventory/InventoryReports', () => import('./views/inventory/InventoryReports'));
const IndustrialHub = lazyWithRetry('./views/IndustrialHub', () => import('./views/IndustrialHub'));
const RevenueHub = lazyWithRetry('./views/RevenueHub', () => import('./views/RevenueHub'));
const RevenueDashboard = lazyWithRetry('./views/reports/RevenueDashboard', () => import('./views/reports/RevenueDashboard'));
const SalesFlowHub = lazyWithRetry('./views/SalesFlowHub', () => import('./views/SalesFlowHub'));
const SalesExchanges = lazyWithRetry('./views/sales/SalesExchanges', () => import('./views/sales/SalesExchanges'));
const LeadBoard = lazyWithRetry('./views/sales/LeadBoard', () => import('./views/sales/LeadBoard'));
const SalesOrdersView = lazyWithRetry('./views/sales/SalesOrders', () => import('./views/sales/SalesOrders'));
const Referrals = lazyWithRetry('./views/sales/Referrals', () => import('./views/sales/Referrals'));
const ProcurementHub = lazyWithRetry('./views/ProcurementHub', () => import('./views/ProcurementHub'));
const CustomersHub = lazyWithRetry('./views/CustomersHub', () => import('./views/CustomersHub'));
const FiscalReportsHub = lazyWithRetry('./views/FiscalReportsHub', () => import('./views/FiscalReportsHub'));
const InternalToolsHub = lazyWithRetry('./views/InternalToolsHub', () => import('./views/InternalToolsHub'));
const Payments = lazyWithRetry('./views/sales/Payments', () => import('./views/sales/Payments'));
const Orders = lazyWithRetry('./views/sales/Orders', () => import('./views/sales/Orders'));
const QuotationRequests = lazyWithRetry('./views/sales/QuotationRequests', () => import('./views/sales/QuotationRequests'));
const QuotationRequestsHub = lazyWithRetry('./views/sales/QuotationRequestsHub', () => import('./views/sales/QuotationRequestsHub'));
const JobTickets = lazyWithRetry('./views/sales/JobTickets', () => import('./views/sales/JobTickets'));
const Clients = lazyWithRetry('./views/sales/Clients', () => import('./views/sales/Clients'));
const ShippingManager = lazyWithRetry('./views/sales/ShippingManager', () => import('./views/sales/ShippingManager'));
const Tasks = lazyWithRetry('./views/Tasks', () => import('./views/Tasks'));
const Reports = lazyWithRetry('./views/Reports', () => import('./views/Reports'));
const Settings = lazyWithRetry('./views/Settings', () => import('./views/Settings'));
const ChatApp = lazyWithRetry('./views/apps/ChatApp', () => import('./views/apps/ChatApp'));
const AssetManagement = lazyWithRetry('./views/AssetManagement', () => import('./views/AssetManagement'));
const DocumentTemplateBuilder = lazyWithRetry('./views/tools/DocumentTemplateBuilder', () => import('./views/tools/DocumentTemplateBuilder'));
const APIUsageDashboard = lazyWithRetry('./views/admin/APIUsageDashboard', () => import('./views/admin/APIUsageDashboard'));
const SubscriptionsView = lazyWithRetry('./components/subscriptions/RecurringBilling', () => import('./components/subscriptions/RecurringBilling'));
const UserManagement = lazyWithRetry('./views/admin/UserManagement', () => import('./views/admin/UserManagement'));
const ProfileActivity = lazyWithRetry('./views/admin/ProfileActivity', () => import('./views/admin/ProfileActivity'));
const Profile = lazyWithRetry('./views/Profile', () => import('./views/Profile'));
const MigrationHealth = lazyWithRetry('./views/admin/MigrationHealth', () => import('./views/admin/MigrationHealth'));
const SyncHealth = lazyWithRetry('./views/admin/SyncHealth', () => import('./views/admin/SyncHealth'));
const AcceptanceDashboard = lazyWithRetry('./views/admin/AcceptanceDashboard', () => import('./views/admin/AcceptanceDashboard'));
const MembershipTiersAdmin = lazyWithRetry('./views/admin/MembershipTiersAdmin', () => import('./views/admin/MembershipTiersAdmin'));
const PromotionsAdmin = lazyWithRetry('./views/admin/PromotionsAdmin', () => import('./views/admin/PromotionsAdmin'));
const GiftCardsAdmin = lazyWithRetry('./views/admin/GiftCardsAdmin', () => import('./views/admin/GiftCardsAdmin'));
const BOMRecipes = lazyWithRetry('./views/production/BOMRecipes', () => import('./views/production/BOMRecipes'));
const DataImport = lazyWithRetry('./views/admin/DataImport', () => import('./views/admin/DataImport'));
const LegacyMigrationPage = lazyWithRetry('./views/tools/LegacyMigrationPage', () => import('./views/tools/LegacyMigrationPage'));
const GlobalSearch = lazyWithRetry('./views/GlobalSearch', () => import('./views/GlobalSearch'));
const ChequeManager = lazyWithRetry('./views/tools/ChequeManager', () => import('./views/tools/ChequeManager'));
const VatView = lazyWithRetry('./views/vat/VatView', () => import('./views/vat/VatView'));
const BarcodePrinter = lazyWithRetry('./views/tools/BarcodePrinter', () => import('./views/tools/BarcodePrinter'));
const MarketAdjustments = lazyWithRetry('./views/tools/MarketAdjustments', () => import('./views/tools/MarketAdjustments'));
const SmartPricing = lazyWithRetry('./views/tools/SmartPricing', () => import('./views/tools/SmartPricing'));
const SmartOperationsHub = lazyWithRetry('./views/SmartOperationsHub', () => import('./views/SmartOperationsHub'));
const MarketingMessages = lazyWithRetry('./views/tools/MarketingMessages', () => import('./views/tools/MarketingMessages'));
const AdsManager = lazyWithRetry('./views/tools/AdsManager', () => import('./views/tools/AdsManager'));
const AnalyticsHub = lazyWithRetry('./views/ai/AnalyticsHub', () => import('./views/ai/AnalyticsHub'));
const GangRunOptimizer = lazyWithRetry('./views/ai/GangRunOptimizer', () => import('./views/ai/GangRunOptimizer'));
const CashFlowForecaster = lazyWithRetry('./views/ai/CashFlowForecaster', () => import('./views/ai/CashFlowForecaster'));
const AnomalyDetectorComp = lazyWithRetry('./views/ai/AnomalyDetector', () => import('./views/ai/AnomalyDetector'));
const ChurnPredictor = lazyWithRetry('./views/ai/ChurnPredictor', () => import('./views/ai/ChurnPredictor'));
const ReorderOptimizer = lazyWithRetry('./views/ai/ReorderOptimizer', () => import('./views/ai/ReorderOptimizer'));
const POMatcher = lazyWithRetry('./views/ai/POMatcher', () => import('./views/ai/POMatcher'));
const SmartScheduler = lazyWithRetry('./views/ai/SmartScheduler', () => import('./views/ai/SmartScheduler'));
const ConversationalQuery = lazyWithRetry('./views/ai/ConversationalQuery', () => import('./views/ai/ConversationalQuery'));
const AuditInvestigator = lazyWithRetry('./views/ai/AuditInvestigator', () => import('./views/ai/AuditInvestigator'));
const BOMGenerator = lazyWithRetry('./views/ai/BOMGenerator', () => import('./views/ai/BOMGenerator'));
const ServiceJobsPage = lazyWithRetry('./views/service/ServiceJobsPage', () => import('./views/service/ServiceJobsPage'));
const ServiceRecipeEditorPage = lazyWithRetry('./views/service/ServiceRecipeEditorPage', () => import('./views/service/ServiceRecipeEditorPage'));

const SmartSalesDashboard = lazyWithRetry('./views/SmartSalesDashboard', () => import('./views/SmartSalesDashboard'));
const InvoiceIntelligence = lazyWithRetry('./views/InvoiceIntelligence', () => import('./views/InvoiceIntelligence'));
const CustomerRiskScore = lazyWithRetry('./views/CustomerRiskScore', () => import('./views/CustomerRiskScore'));
const NaturalLanguageReporting = lazyWithRetry('./views/NaturalLanguageReporting', () => import('./views/NaturalLanguageReporting'));
const AccountingAssistant = lazyWithRetry('./views/AccountingAssistant', () => import('./views/AccountingAssistant'));
const AnomalyDetectionView = lazyWithRetry('./views/AnomalyDetection', () => import('./views/AnomalyDetection'));
const ReportSummaryView = lazyWithRetry('./views/ReportSummary', () => import('./views/ReportSummary'));
const AdvancedDataTableView = lazyWithRetry('./views/AdvancedDataTable', () => import('./views/AdvancedDataTable'));

const BusinessHealthReport = lazyWithRetry('./views/reports/BusinessHealthReport', () => import('./views/reports/BusinessHealthReport'));
const AIWorkspace = lazyWithRetry('./views/AIWorkspace', () => import('./views/AIWorkspace'));
const AIWorkspaceDashboard = lazyWithRetry('./views/ai/AIWorkspaceDashboard', () => import('./views/ai/AIWorkspaceDashboard'));
const AIWorkspaceChat = lazyWithRetry('./views/ai/AIWorkspaceChat', () => import('./views/ai/AIWorkspaceChat'));
// VATReport removed

const PwaUpdateNotificationWrapper: React.FC = () => {
  const { updateAvailable, applyUpdate, dismissUpdate } = usePwaInstall();
  if (!updateAvailable) return null;
  return <PwaUpdateNotification onUpdate={applyUpdate} onDismiss={dismissUpdate} />;
};

const PageLoader = () => (
  <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-sm">
    <div className="relative">
      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
      </div>
    </div>
    <p className="mt-4 text-sm font-medium text-slate-500 animate-pulse">Loading module...</p>
  </div>
);

const ProtectedRoute: React.FC<{ permission: string, children: React.ReactNode }> = ({ permission, children }) => {
  const { checkPermission } = useAuth();
  if (!checkPermission(permission)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
        <div className="p-8 rounded-3xl bg-white/50 backdrop-blur-md text-center max-w-md border border-white shadow-soft">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Access Restricted</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">You don't have the required permission <code>{permission}</code> to view this module.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

const ReminderMonitor: React.FC = () => {
  const { notify, addAlert, reminders } = useAuth();
  const notifiedTasks = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      (reminders || []).forEach((task: any) => {
        if (task.hasAlarm && task.reminderDate && !notifiedTasks.current.has(task.id)) {
          const reminderTime = new Date(task.reminderDate);
          if (reminderTime <= now && now.getTime() - reminderTime.getTime() < 5 * 60 * 1000) {
            notify(`TASK ALERT: ${task.text || task.title}`, 'info');

            addAlert({
              id: `ALERT-${task.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              message: `Task Due: ${task.text || task.title}. Details: ${task.notes || 'N/A'}`,
              type: 'System',
              date: new Date().toISOString(),
              severity: 'Medium'
            });

            notifiedTasks.current.add(task.id);
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [reminders, notify, addAlert]);

  return null;
};

const ResponsiveDebugUtility: React.FC = () => {
  const isDev = isResponsiveDebugEnabled();
  const [width, setWidth] = useState(() => window.innerWidth);
  const [breakpoint, setBreakpoint] = useState(() => {
    if (window.innerWidth <= 767) return 'mobile';
    if (window.innerWidth <= 1024) return 'tablet';
    if (window.innerWidth <= 1439) return 'desktop';
    return 'wide';
  });

  useEffect(() => {
    if (!isDev) return;
    const getBreakpoint = (nextWidth: number) => {
      if (nextWidth <= 767) return 'mobile';
      if (nextWidth <= 1024) return 'tablet';
      if (nextWidth <= 1439) return 'desktop';
      return 'wide';
    };

    const handleResize = () => {
      const nextWidth = window.innerWidth;
      const nextBreakpoint = getBreakpoint(nextWidth);
      setWidth(nextWidth);
      setBreakpoint((current) => {
        if (current !== nextBreakpoint) {
          console.info(`[ResponsiveDebug] breakpoint ${current} -> ${nextBreakpoint} (${nextWidth}px)`);
        }
        return nextBreakpoint;
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [isDev]);

  if (!isDev) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[10001] rounded-lg bg-slate-900/90 text-white px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-none">
      <div className="text-[10px] font-bold uppercase tracking-wider">{breakpoint}</div>
      <div className="text-xs font-semibold leading-none mt-1">{width}px</div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyConfig, isOnline, user, notify, logout } = useAuth();
  const {
    isOpen,
    data,
    filePreview,
    type,
    closePreview
  } = useDocumentStore();
  const {
    isPosModalOpen,
    setIsPosModalOpen,
    customers,
    invoices,
    jobOrders,
  } = useSales();
  const { inventory } = useInventory();
  const {
    notifications: ctxNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  } = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFyDropdown, setShowFyDropdown] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const notificationBellRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fyDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { selectedFinancialYear, availableFinancialYears, setFinancialYear, isLoading: isFyLoading } = useFinancialYear();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const currentFyDisplay = selectedFinancialYear
    ? `${selectedFinancialYear.start_date.slice(0, 4)}–${selectedFinancialYear.end_date.slice(0, 4)}`
    : 'No FY';

  useEffect(() => {
    const theme = companyConfig?.appearance?.theme || 'Light';
    const density = companyConfig?.appearance?.density || 'Comfortable';
    const radius = companyConfig?.appearance?.borderRadius || 'Medium';

    // Apply Theme
    if (theme === 'Dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'Light') {
      document.documentElement.classList.remove('dark');
    } else if (theme === 'System') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    // Apply Density
    if (density === 'Compact') {
      document.documentElement.classList.add('density-compact');
    } else {
      document.documentElement.classList.remove('density-compact');
    }

    // Apply Border Radius
    document.documentElement.classList.remove('radius-none', 'radius-small', 'radius-medium', 'radius-large', 'radius-full');
    document.documentElement.classList.add(`radius-${radius.toLowerCase()}`);

  }, [companyConfig?.appearance]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    // Table responsiveness is now handled via CSS in index.css
    // avoid manual DOM manipulation that interferes with React
  }, []);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  useGlobalKeyboard([
    { key: 'k', meta: true, handler: () => setSearchOpen(true) },
  ]);

  useKeyboard([
    {
      id: 'nav-dashboard', key: 'd', alt: true, priority: 100,
      handler: () => window.location.hash = '#/',
      description: 'Go to dashboard',
    },
    {
      id: 'nav-settings', key: 's', alt: true, priority: 100,
      handler: () => window.location.hash = '#/settings',
      description: 'Go to settings',
    },
    {
      id: 'nav-users', key: 'u', alt: true, priority: 100,
      handler: () => window.location.hash = '#/admin/users',
      description: 'Go to users',
    },
    {
      id: 'nav-home', key: 'h', alt: true, priority: 100,
      handler: () => window.location.hash = '#/',
      description: 'Go home',
    },
    {
      id: 'sidebar-toggle', key: '\\', alt: true, priority: 100,
      handler: () => setSidebarCollapsed(p => !p),
      description: 'Toggle sidebar',
    },
  ], [location.pathname, setSearchOpen]);

  const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
  const amber = { 100: '#fbead0', 500: '#d99a3f' };
  const paper = '#FEFDFB';
  const ink = '#23282A';
  const inkSoft = '#5c6567';
  const hairline = '#e4ddd1';
  const danger = '#b5493f';

  const UserMenuItem = ({ icon: Icon, color, bg, label, onClick, danger }: { icon: React.ElementType; color: string; bg: string; label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', fontSize: 12.5, fontWeight: 500,
      color: danger ? danger : '#23282A', cursor: 'pointer', borderRadius: 8,
      transition: 'all .2s ease', border: 'none', textAlign: 'left', position: 'relative'
    }}
      onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.paddingLeft = '16px'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '12px'; }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Icon size={14} color={color} />
      </div>
      {label}
    </button>
  );

  return (
    <div className="app-layout-scroll">
      <div className="app-layout-frame flex h-screen bg-[var(--dashboard-bg)] overflow-hidden transition-colors duration-200">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close Sidebar"
        />
      )}
      <ReminderMonitor />
      <Sidebar
        isOpen={sidebarOpen}
        toggle={() => setSidebarOpen(!sidebarOpen)}
        isCollapsed={sidebarCollapsed}
        toggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="app-content-shell flex-1 flex flex-col h-full min-w-0 transition-all duration-300">
        <div className="pb-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0" style={{ background: '#FEFDFB', borderBottom: '1.4px solid #e4ddd1', padding: '10px 20px', borderRadius: 0 }}>
            <button
              type="button"
              className="md:hidden p-2 rounded-lg border border-[#e4ddd1] bg-[#FEFDFB] text-[#5c6567] hover:bg-[#f3ede3] transition-colors shrink-0"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Sidebar"
            >
              <Menu size={18} />
            </button>
            <button
              onClick={() => { setSearchOpen(true); setSearchQuery(''); }}
              className="hidden sm:flex items-center gap-2"
              style={{ width: 300, padding: '9px 14px', borderRadius: 999, border: '1.4px solid #e4ddd1', background: '#FEFDFB', fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12.5, color: '#5c6567', cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4cdc2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <SearchIcon size={14} />
              <span>Search...</span>
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => navigate('/smart-operations/pricing')} title="Calculator" aria-label="Open calculator" style={{
                padding: '9px 16px', borderRadius: 999, border: '1.4px solid #e4ddd1', background: '#FEFDFB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b6e6e', transition: 'all 0.15s ease', fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12.5, fontWeight: 600,
              }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4cdc2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calculator size={14} /><span className="hidden md:inline">Calculator</span></div>
              </button>

              <button onClick={() => setIsWhatsAppModalOpen(true)} title="Messages" aria-label="Open messages" style={{
                padding: '9px 16px', borderRadius: 999, border: '1.4px solid #e4ddd1', background: '#FEFDFB', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#0b6e6e', position: 'relative', transition: 'all 0.15s ease', fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12.5, fontWeight: 600,
              }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4cdc2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={14} /><span className="hidden md:inline">Messages</span></div>
              </button>

              <div ref={fyDropdownRef} style={{ position: 'relative' }}>
                <button onClick={() => setShowFyDropdown(prev => !prev)} title={selectedFinancialYear ? `Financial Year: ${selectedFinancialYear.name}${selectedFinancialYear.is_closed ? ' (Closed)' : ''}` : 'Select Financial Year'} aria-label="Select Financial Year" style={{
                  padding: '9px 16px', borderRadius: 999, border: showFyDropdown ? '1.4px solid #d4cdc2' : '1.4px solid #e4ddd1', background: '#FEFDFB', cursor: 'pointer', display: 'flex', alignItems: 'center', color: showFyDropdown ? '#0b6e6e' : '#5c6567', position: 'relative', transition: 'all 0.15s ease', fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12.5, fontWeight: 600,
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4cdc2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)'; }} onMouseLeave={e => { if (!showFyDropdown) { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = 'none'; } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarDays size={14} color="#0b6e6e" />
                    {!isMobile && <span>{isFyLoading ? 'Loading...' : 'Financial Year'}</span>}
                    <ChevronDown size={14} style={{ transform: showFyDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', color: '#5b578c' }} />
                  </div>
                </button>
                {showFyDropdown && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 230, backgroundColor: '#FEFDFB', borderRadius: 14, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)', border: '1px solid #e4ddd1', overflow: 'hidden', zIndex: 60, padding: '6px' }}>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Financial Years</div>
                    {availableFinancialYears.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No financial years configured</div>
                    ) : (
                      availableFinancialYears.map(fy => {
                        const isActive = selectedFinancialYear?.id === fy.id;
                        const fyLabelStr = fyDisplayName(fy);
                        return (
                          <button key={fy.id} onClick={() => { setFinancialYear(fy); setShowFyDropdown(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: isActive ? '#eef7f6' : 'transparent', color: isActive ? '#146b60' : '#23282A', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 600 : 500, textAlign: 'left', transition: 'all .2s ease', gap: 8 }} onMouseEnter={e => { if (!isActive) { e.currentTarget.style.backgroundColor = '#eef7f6'; e.currentTarget.style.paddingLeft = '14px'; } }} onMouseLeave={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.paddingLeft = '12px'; } }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CalendarDays size={14} color={isActive ? '#146b60' : '#64748b'} /><span>{fyLabelStr}</span></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {fy.is_closed ? <span style={{ fontSize: 9, fontWeight: 600, color: '#dc2626', backgroundColor: '#fef2f2', padding: '1px 6px', borderRadius: 4 }}>Closed</span> : fy.is_default ? <span style={{ fontSize: 9, fontWeight: 600, color: '#146b60', backgroundColor: '#eef7f6', padding: '1px 6px', borderRadius: 4 }}>Default</span> : null}
                              {isActive && <Check size={14} color="#146b60" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="relative" style={{ marginLeft: 8 }}>
              <button
                ref={notificationBellRef}
                onClick={() => setNotificationCenterOpen(!notificationCenterOpen)}
                style={{
                  width: 38, height: 38, borderRadius: 999, background: '#FEFDFB', border: '1.4px solid #e4ddd1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4cdc2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(11,62,57,.04)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <Bell size={16} color="#0b6e6e" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1" style={{ width: 8, height: 8, borderRadius: 999, background: '#d99a3f' }} />
                )}
              </button>
              <NotificationCenter
                isOpen={notificationCenterOpen}
                onClose={() => setNotificationCenterOpen(false)}
                notifications={ctxNotifications.map(n => ({
                  id: n.id,
                  type: n.type === 'EXAM' ? 'insight' : n.type === 'SYSTEM' ? 'system' : n.priority === 'Urgent' || n.priority === 'High' ? 'alert' : 'insight',
                  title: n.title,
                  message: n.message,
                  timestamp: n.created_at,
                  severity: (n.priority === 'Urgent' ? 'critical' : n.priority === 'High' ? 'high' : n.priority === 'Medium' ? 'medium' : 'low') as any,
                  read: n.is_read,
                }))}
                onMarkRead={(id) => markAsRead(id)}
                onMarkAllRead={() => markAllAsRead()}
                onClear={(id) => dismissNotification(id)}
                anchorEl={notificationBellRef.current}
              />
            </div>
            <div ref={userMenuRef} className="relative flex items-center gap-2 pl-2" style={{ borderLeft: '1.4px solid #e4ddd1' }}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center py-1 rounded-full hover:bg-[#f3ede3] transition-colors"
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 999, background: 'linear-gradient(160deg, #3fa294, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: 14, fontWeight: 700, boxShadow: '0 1px 2px rgba(11,62,57,.15)',
                }}>
                  {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
                </div>
              </button>
              {showUserMenu && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 8,
                  width: 224, background: '#FEFDFB',
                  borderRadius: 14,
                  boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                  overflow: 'hidden', zIndex: 50
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #146b60, #3fa294 40%, #d99a3f 100%)' }} />
                  <div style={{ padding: '16px 16px 10px', marginTop: 3 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#146b60', textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 1 }}>Account</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#23282A', marginTop: 8 }}>{user?.fullName || user?.username || 'User'}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#5c6567', marginTop: 2 }}>{(user?.role === 'Company Admin' ? 'Admin' : user?.role) || 'User'}</div>
                  </div>
                  <div style={{ padding: 4 }}>
                    <UserMenuItem icon={Wrench} color="#3b82f6" bg="#eef7f6" label="Internal Tools" onClick={() => { navigate('/internal-tools'); setShowUserMenu(false); }} />
                    <UserMenuItem icon={UserIcon} color="#6366f1" bg="#eef7f6" label="User Profile" onClick={() => { navigate('/profile'); setShowUserMenu(false); }} />
                    <UserMenuItem icon={ShieldCheck} color="#10b981" bg="#eef7f6" label="Security Log" onClick={() => { navigate('/audit'); setShowUserMenu(false); }} />
                    <UserMenuItem icon={Database} color="#06b6d4" bg="#eef7f6" label="Migration" onClick={() => { navigate('/admin/migration-health'); setShowUserMenu(false); }} />
                    <UserMenuItem icon={ClipboardCheck} color="#0d9488" bg="#f0fdfa" label="Acceptance Run" onClick={() => { navigate('/admin/acceptance'); setShowUserMenu(false); }} />
                    <UserMenuItem icon={SettingsIcon} color="#f59e0b" bg="#fbead0" label="Settings" onClick={() => { navigate('/settings'); setShowUserMenu(false); }} />
                  </div>
                  <div style={{ borderTop: `1px solid #e4ddd1`, padding: 4 }}>
                    <UserMenuItem icon={LogOut} color="#ef4444" bg="#fef2f2" label="Log out" onClick={() => { logout(); navigate('/login'); }} danger />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <main className="app-content-scroll flex-1 min-h-0 overflow-auto relative custom-scrollbar">

          <Toast />
          <PwaInstallBanner />
          <PwaUpdateNotificationWrapper />
          <ResponsiveDebugUtility />

          {/* Global PDF Preview Layer */}
          {(data || filePreview) && (
            <PreviewModal
              isOpen={isOpen}
              onClose={closePreview}
              file={filePreview}
              type={type}
              data={data}
            />
          )}

          {/* Global POS Modal Layer */}
          {isPosModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
              <div className="bg-[#FEFDFB] w-full max-w-6xl h-full rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300" style={{ fontFamily: "'Inter', 'DM Sans', sans-serif" }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #146b60, #3fa294 40%, #d99a3f 100%)', zIndex: 1 }} />
                <div className="px-6 py-3 border-b border-[#e4ddd1] flex items-center justify-between shrink-0" style={{ marginTop: 3 }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#146b60] flex items-center justify-center text-white shadow-lg">
                      <Coins size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-[#0b3e39] tracking-tight">Terminal POS</h2>
                      <span className="text-[9px] font-bold text-[#5c6567] uppercase tracking-widest">Live Transaction Interface</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPosModalOpen(false)}
                    className="p-2 hover:bg-[#eef7f6] rounded-lg text-[#5c6567] hover:text-[#0b3e39] transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden" style={{ fontFamily: "'Inter', 'DM Sans', sans-serif" }}>
                  <ProtectedRoute permission="sales.pos">
                    <Suspense fallback={<PageLoader />}>
                      <POS />
                    </Suspense>
                  </ProtectedRoute>
                </div>
              </div>
            </div>
          )}



          <div className="h-full w-full min-w-0 min-h-full">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>} />
                <Route path="/dashboard" element={<ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>} />
                <Route path="/install" element={<PwaInstallPage />} />
                <Route path="/search" element={<ErrorBoundary name="Search"><GlobalSearch /></ErrorBoundary>} />

                {/* Hierarchical Redirects - no error boundary needed */}
                <Route path="/inventory" element={<Navigate to="/supply-chain/inventory" replace />} />
                <Route path="/purchases" element={<Navigate to="/procurement/bills" replace />} />
                <Route path="/purchases/grn" element={<Navigate to="/supply-chain/grn" replace />} />
                <Route path="/purchases/new" element={<Navigate to="/procurement/bills" replace />} />
                <Route path="/purchases/subcontracting" element={<Navigate to="/procurement/subcontracting" replace />} />
                <Route path="/pos" element={<Navigate to="/sales-flow/pos" replace />} />
                <Route path="/sales/quotations" element={<Navigate to="/sales-flow/quotations" replace />} />
                <Route path="/sales/invoices" element={<Navigate to="/sales-flow/invoices" replace />} />
                <Route path="/sales/shipping" element={<Navigate to="/supply-chain/shipping" replace />} />
                <Route path="/sales/subscriptions" element={<Navigate to="/sales-flow/subscriptions" replace />} />
                <Route path="/sales/receipts" element={<Navigate to="/sales-flow/payments" replace />} />
                <Route path="/sales-flow/receipts" element={<Navigate to="/sales-flow/payments" replace />} />
                <Route path="/sales-flow/orders/new" element={<Navigate to="/sales-flow/orders" replace />} />
                <Route path="/sales-flow/payments/new" element={<Navigate to="/sales-flow/payments" replace />} />
                <Route path="/sales-flow/sms" element={<Navigate to="/internal-tools/chat" replace />} />
                <Route path="/reports/statements" element={<Navigate to="/revenue/contacts" replace />} />
                <Route path="/accounts/chart" element={<Navigate to="/accounts/chart-of-accounts" replace />} />
                <Route path="/production/work-orders" element={<Navigate to="/industrial/work-orders" replace />} />
                <Route path="/production/scheduler" element={<Navigate to="/industrial/scheduler" replace />} />
                <Route path="/production/shop-floor" element={<Navigate to="/industrial/shop-floor" replace />} />
                <Route path="/production/kiosk" element={<Navigate to="/industrial/kiosk" replace />} />
                <Route path="/production/mrp" element={<Navigate to="/industrial/mrp" replace />} />
                <Route path="/production/examination-printing" element={<Navigate to="/examination/batches" replace />} />
                <Route path="/accounts/expenses" element={<Navigate to="/procurement/expenses" replace />} />
                <Route path="/accounts/expenses/new" element={<Navigate to="/procurement/expenses" replace />} />
                <Route path="/accounts/reconciliation" element={<Navigate to="/fiscal-reports/reconciliation" replace />} />
                <Route path="/accounts/budgets" element={<Navigate to="/fiscal-reports/budgets" replace />} />
                <Route path="/accounts/financials" element={<Navigate to="/fiscal-reports/financials" replace />} />
                <Route path="/tools/cheques" element={<Navigate to="/internal-tools/cheques" replace />} />
                <Route path="/tools/barcodes" element={<Navigate to="/internal-tools/barcodes" replace />} />
                <Route path="/admin/import" element={<Navigate to="/internal-tools/import" replace />} />
                <Route path="/apps/chat" element={<Navigate to="/internal-tools/chat" replace />} />
                <Route path="/sales" element={<Navigate to="/sales-flow" replace />} />
                <Route path="/production" element={<Navigate to="/industrial" replace />} />
                <Route path="/accounts" element={<Navigate to="/fiscal-reports" replace />} />
                <Route path="/admin" element={<Navigate to="/settings" replace />} />

                {/* Supply Chain */}
                <Route element={<ErrorBoundary name="Supply Chain"><Outlet /></ErrorBoundary>}>
                  <Route path="/supply-chain" element={<SupplyChainHub />} />
                  <Route path="/supply-chain/inventory" element={<Inventory />} />
                  <Route path="/supply-chain/inventory/:itemId" element={<ItemDetailPage />} />
                  <Route path="/supply-chain/grn" element={<GoodsReceived />} />
                  <Route path="/supply-chain/shipping" element={<ProtectedRoute permission="sales.view"><ShippingManager /></ProtectedRoute>} />
                  <Route path="/supply-chain/forecasting" element={<Forecasting />} />
                  <Route path="/supply-chain/warehouses" element={<WarehousePage />} />
                  <Route path="/supply-chain/inventory-reports" element={<InventoryReports />} />
                </Route>

                {/* Industrial / Production */}
                <Route element={<ErrorBoundary name="Industrial"><Outlet /></ErrorBoundary>}>
                  <Route path="/industrial" element={<IndustrialHub />} />
                  <Route path="/industrial/work-orders" element={<ProtectedRoute permission="production.view"><WorkOrders /></ProtectedRoute>} />
                  <Route path="/industrial/scheduler" element={<ProtectedRoute permission="production.view"><Scheduler /></ProtectedRoute>} />
                  <Route path="/industrial/shop-floor" element={<ProtectedRoute permission="production.view"><ShopFloor /></ProtectedRoute>} />
                  <Route path="/industrial/kiosk" element={<ProtectedRoute permission="production.view"><ShopFloorKiosk /></ProtectedRoute>} />
                  <Route path="/industrial/mrp" element={<ProtectedRoute permission="production.view"><MRP /></ProtectedRoute>} />
                  <Route path="/industrial/bom-recipes" element={<ProtectedRoute permission="production.view"><BOMRecipes /></ProtectedRoute>} />
                  <Route path="/industrial/maintenance" element={<ProtectedRoute permission="production.view"><MachineMaintenance /></ProtectedRoute>} />
                  <Route path="/industrial/gang-run" element={<ProtectedRoute permission="production.view"><GangRunEstimator /></ProtectedRoute>} />
                  <Route path="/industrial/service-jobs" element={<ProtectedRoute permission="production.view"><ServiceJobsPage /></ProtectedRoute>} />
                  <Route path="/industrial/service-recipes" element={<ProtectedRoute permission="production.view"><ServiceRecipeEditorPage /></ProtectedRoute>} />
                  <Route path="/industrial/exams" element={<Navigate to="/industrial" replace />} />
                </Route>

                {/* Revenue */}
                <Route element={<ErrorBoundary name="Revenue"><Outlet /></ErrorBoundary>}>
                  <Route path="/revenue" element={<RevenueHub />} />
                  <Route path="/revenue/dashboard" element={<ProtectedRoute permission="reports.view"><RevenueDashboard /></ProtectedRoute>} />
                  <Route path="/revenue/sales-audit" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/margin-performance" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/rounding-analytics" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/contacts" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/wallet-statement" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/auditor" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/intel" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                  <Route path="/revenue/health" element={<ProtectedRoute permission="reports.view"><BusinessHealthReport /></ProtectedRoute>} />
                </Route>

                {/* Customers */}
                <Route path="/customers" element={<ErrorBoundary name="Customers"><CustomersHub /></ErrorBoundary>} />
                <Route path="/customers/new" element={<Navigate to="/customers" replace />} />
                <Route path="/portal/users" element={<ErrorBoundary name="PortalUsers"><PortalUserManagement /></ErrorBoundary>} />

                {/* Sales Flow */}
                <Route element={<ErrorBoundary name="Sales"><Outlet /></ErrorBoundary>}>
                  <Route path="/sales-flow" element={<SalesFlowHub />} />
                  <Route path="/sales-flow/pos" element={<ProtectedRoute permission="sales.pos"><POS /></ProtectedRoute>} />
                  <Route path="/sales-flow/quotations" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                  <Route path="/sales-flow/requests" element={<ProtectedRoute permission="sales.view"><QuotationRequestsHub /></ProtectedRoute>} />
                  <Route path="/sales-flow/orders" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                  <Route path="/sales-flow/invoices" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                  <Route path="/sales-flow/subscriptions" element={<ProtectedRoute permission="sales.view"><SubscriptionsView /></ProtectedRoute>} />
                  <Route path="/sales-flow/exchanges" element={<ProtectedRoute permission="sales.view"><SalesExchanges /></ProtectedRoute>} />
                  <Route path="/sales-flow/leads" element={<ProtectedRoute permission="sales.view"><LeadBoard /></ProtectedRoute>} />
                  <Route path="/sales-flow/sales-orders" element={<ProtectedRoute permission="sales.view"><SalesOrdersView /></ProtectedRoute>} />
                  <Route path="/sales-flow/job-tickets" element={<ProtectedRoute permission="sales.view"><JobTickets /></ProtectedRoute>} />
                  <Route path="/sales-flow/tasks" element={<Tasks />} />
                  <Route path="/sales-flow/customers" element={<Navigate to="/sales-flow/clients" replace />} />
                  <Route path="/sales-flow/clients" element={<ProtectedRoute permission="sales.view"><Clients /></ProtectedRoute>} />
                  <Route path="/sales-flow/payments" element={<ProtectedRoute permission="sales.view"><Payments /></ProtectedRoute>} />
                  <Route path="/sales-flow/payment-requests" element={<ProtectedRoute permission="sales.view"><Navigate to="/sales-flow/requests" replace state={{ tab: 'payments' }} /></ProtectedRoute>} />
                </Route>

                {/* Procurement */}
                <Route element={<ErrorBoundary name="Procurement"><Outlet /></ErrorBoundary>}>
                  <Route path="/procurement" element={<ProcurementHub />} />
                  <Route path="/procurement/bills" element={<Purchases />} />
                  <Route path="/procurement/suppliers" element={<ProtectedRoute permission="procurement.view"><Suppliers /></ProtectedRoute>} />
                  <Route path="/procurement/subcontracting" element={<Subcontracting />} />
                  <Route path="/procurement/expenses" element={<ProtectedRoute permission="accounts.view"><Expenses /></ProtectedRoute>} />
                  <Route path="/procurement/payments" element={<ProtectedRoute permission="procurement.view"><Payments /></ProtectedRoute>} />
                </Route>

                {/* Fiscal Reports */}
                <Route element={<ErrorBoundary name="Fiscal Reports"><Outlet /></ErrorBoundary>}>
                  <Route path="/fiscal-reports" element={<FiscalReportsHub />} />
                  <Route path="/fiscal-reports/financials" element={<ProtectedRoute permission="accounts.view"><FinancialReports /></ProtectedRoute>} />
                  <Route path="/fiscal-reports/reconciliation" element={<ProtectedRoute permission="accounts.view"><Reconciliation /></ProtectedRoute>} />
                  <Route path="/fiscal-reports/budgets" element={<ProtectedRoute permission="accounts.view"><Budgets /></ProtectedRoute>} />
                  <Route path="/fiscal-reports/vat" element={<Navigate to="/fiscal-reports" replace />} />
                </Route>

                {/* Internal Tools */}
                <Route element={<ErrorBoundary name="Internal Tools"><Outlet /></ErrorBoundary>}>
                  <Route path="/internal-tools" element={<InternalToolsHub />} />
                  <Route path="/internal-tools/cheques" element={<ChequeManager />} />
                  <Route path="/internal-tools/barcodes" element={<BarcodePrinter />} />
                  <Route path="/internal-tools/import" element={<DataImport />} />
                  <Route path="/internal-tools/chat" element={<ChatApp />} />
                  <Route path="/internal-tools/legacy-migration" element={<LegacyMigrationPage />} />
                  <Route path="/internal-tools/assets" element={<AssetManagement />} />
                  <Route path="/internal-tools/template-builder" element={<DocumentTemplateBuilder />} />
                  <Route path="/internal-tools/api-usage" element={<APIUsageDashboard />} />
                </Route>

                {/* Smart Operations */}
                <Route element={<ErrorBoundary name="Smart Operations"><Outlet /></ErrorBoundary>}>
                  <Route path="/smart-operations" element={<SmartOperationsHub />} />
                  <Route path="/smart-operations/adjustments" element={<MarketAdjustments />} />
                  <Route path="/smart-operations/pricing" element={<SmartPricing />} />
                  <Route path="/smart-operations/messages" element={<MarketingMessages />} />
                  <Route path="/smart-operations/ads" element={<ProtectedRoute permission="admin.settings"><AdsManager /></ProtectedRoute>} />
                  <Route path="/smart-operations/referrals" element={<ProtectedRoute permission="referrals.view"><Referrals /></ProtectedRoute>} />
                  <Route path="/smart-operations/promotions" element={<ProtectedRoute permission="admin.settings"><PromotionsAdmin /></ProtectedRoute>} />
                </Route>

                {/* AI Analytics (redirects to AI Workspace) */}
                <Route path="/ai-analytics" element={<AnalyticsHub />} />
                <Route path="/ai-analytics/*" element={<Navigate to="/ai-workspace" replace />} />

                {/* Smart Features */}
                <Route element={<ErrorBoundary name="Smart Features"><Outlet /></ErrorBoundary>}>
                  <Route path="/smart-features" element={<Navigate to="/smart-features/sales-dashboard" replace />} />
                  <Route path="/smart-features/sales-dashboard" element={<SmartSalesDashboard />} />
                  <Route path="/smart-features/invoice-intelligence" element={<InvoiceIntelligence />} />
                  <Route path="/smart-features/customer-risk" element={<CustomerRiskScore />} />
                  <Route path="/smart-features/natural-language-reporting" element={<NaturalLanguageReporting />} />
                  <Route path="/smart-features/accounting-assistant" element={<AccountingAssistant />} />
                  <Route path="/smart-features/anomaly-detection" element={<AnomalyDetectionView />} />
                  <Route path="/smart-features/report-summaries" element={<ReportSummaryView />} />
                  <Route path="/smart-features/advanced-data-table" element={<AdvancedDataTableView />} />
                </Route>

                {/* Examination */}
                <Route element={<ErrorBoundary name="Examination"><Outlet /></ErrorBoundary>}>
                  <Route path="/examination" element={<Navigate to="/examination/batches" replace />} />
                  <Route path="/examination/batches" element={<ProtectedRoute permission="production.view"><ExaminationHub /></ProtectedRoute>} />
                  <Route path="/examination/batches/new" element={<ProtectedRoute permission="production.view"><ExaminationBatchForm /></ProtectedRoute>} />
                  <Route path="/examination/batches/:id" element={<ProtectedRoute permission="production.view"><ExaminationBatchDetail /></ProtectedRoute>} />
                  <Route path="/examination/jobs/new" element={<ProtectedRoute permission="production.view"><ExaminationJobForm /></ProtectedRoute>} />
                  <Route path="/examination/jobs/:id" element={<ProtectedRoute permission="production.view"><ExaminationJobForm /></ProtectedRoute>} />
                  <Route path="/examination/groups" element={<ProtectedRoute permission="production.view"><InvoiceGroupManager /></ProtectedRoute>} />
                  <Route path="/examination/recurring" element={<ProtectedRoute permission="production.view"><RecurringProfiles /></ProtectedRoute>} />
                </Route>

                {/* VAT */}
                <Route path="/vat" element={<ErrorBoundary name="VAT"><ProtectedRoute permission="accounts.view"><VatView /></ProtectedRoute></ErrorBoundary>} />

                {/* Reports, Audit, Admin, Settings, Accounting, Architect */}
                <Route path="/reports" element={<ErrorBoundary name="Reports"><ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/audit" element={<ErrorBoundary name="Audit"><AuditLogs /></ErrorBoundary>} />
                <Route path="/admin/users" element={<ErrorBoundary name="Admin"><ProtectedRoute permission="admin.users"><UserManagement /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/admin/profile" element={<ErrorBoundary name="Admin"><ProfileActivity /></ErrorBoundary>} />
                <Route path="/admin/migration-health" element={<ErrorBoundary name="Admin"><MigrationHealth /></ErrorBoundary>} />
                <Route path="/admin/sync-health" element={<ErrorBoundary name="Admin"><ProtectedRoute permission="admin.settings"><SyncHealth /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/admin/acceptance" element={<ErrorBoundary name="Admin"><ProtectedRoute permission="admin.settings"><AcceptanceDashboard /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/admin/membership-tiers" element={<ErrorBoundary name="Admin"><ProtectedRoute permission="admin.settings"><MembershipTiersAdmin /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/admin/promotions" element={<Navigate to="/smart-operations/promotions" replace />} />
                <Route path="/admin/gift-cards" element={<ErrorBoundary name="Admin"><ProtectedRoute permission="admin.settings"><GiftCardsAdmin /></ProtectedRoute></ErrorBoundary>} />
                <Route path="/profile" element={<ErrorBoundary name="Profile"><Profile /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary name="Settings"><ProtectedRoute permission="admin.settings"><Settings /></ProtectedRoute></ErrorBoundary>} />

                <Route element={<ErrorBoundary name="Accounting"><Outlet /></ErrorBoundary>}>
                  <Route path="/accounts/income" element={<ProtectedRoute permission="accounts.view"><IncomeView /></ProtectedRoute>} />
                  <Route path="/accounts/banking" element={<ProtectedRoute permission="accounts.view"><Banking /></ProtectedRoute>} />
                  <Route path="/accounts/transfers" element={<ProtectedRoute permission="accounts.view"><Transfers /></ProtectedRoute>} />
                  <Route path="/accounts/payroll" element={<ProtectedRoute permission="accounts.view"><Payroll /></ProtectedRoute>} />
                  <Route path="/accounts/chart-of-accounts" element={<ProtectedRoute permission="accounts.view"><ChartOfAccounts /></ProtectedRoute>} />
                </Route>

                <Route path="/architect" element={<ErrorBoundary name="Architect"><Architect /></ErrorBoundary>} />
                {/* AI Workspace */}
                <Route element={<ErrorBoundary name="AI Workspace"><Outlet /></ErrorBoundary>}>
                  <Route path="/ai-workspace" element={<AIWorkspace />} />
                  <Route path="/ai-workspace/dashboard" element={<AIWorkspaceDashboard />} />
                  <Route path="/ai-workspace/assistant" element={<AIWorkspaceChat />} />
                  <Route path="/ai-workspace/gang-run" element={<GangRunOptimizer />} />
                  <Route path="/ai-workspace/cash-flow" element={<CashFlowForecaster />} />
                  <Route path="/ai-workspace/anomalies" element={<AnomalyDetectorComp />} />
                  <Route path="/ai-workspace/churn" element={<ChurnPredictor />} />
                  <Route path="/ai-workspace/reorder" element={<ReorderOptimizer />} />
                  <Route path="/ai-workspace/po-match" element={<POMatcher />} />
                  <Route path="/ai-workspace/scheduler" element={<SmartScheduler />} />
                  <Route path="/ai-workspace/query" element={<ConversationalQuery />} />
                  <Route path="/ai-workspace/audit" element={<AuditInvestigator />} />
                  <Route path="/ai-workspace/bom" element={<BOMGenerator />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </Suspense>
          </div>
        </main>
      </div>
      </div>

      {searchOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#FEFDFB] rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] border border-[#e4ddd1] overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e4ddd1]">
              <SearchIcon size={16} className="text-[#5c6567] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search customers, invoices, jobs, inventory..."
                className="flex-1 border-none outline-none text-sm font-medium text-[#0b3e39] placeholder:text-[#94a3b8] bg-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
                autoFocus
              />
              <kbd className="px-1.5 py-0.5 rounded bg-[#eef7f6] text-[10px] font-mono font-bold text-[#5c6567]">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {searchQuery.length < 2 ? (
                <div className="p-8 text-center text-xs text-[#94a3b8] font-medium">
                  Type at least 2 characters to search
                </div>
              ) : (() => {
                const q = searchQuery.toLowerCase();
                const results: Array<{ type: string; label: string; sublabel: string; link: string; icon: React.ReactNode }> = [];

                (customers || []).forEach((c: any) => {
                  if (c.name?.toLowerCase().includes(q)) {
                    results.push({ type: 'Customer', label: c.name, sublabel: c.phone || c.email || '', link: '/sales-flow/clients', icon: <Users size={14} /> });
                  }
                });
                (invoices || []).forEach((inv: any) => {
                  const invNum = inv.invoiceNumber || inv.id;
                  if (String(invNum).toLowerCase().includes(q) || inv.customerName?.toLowerCase().includes(q)) {
                    results.push({ type: 'Invoice', label: `${invNum}`, sublabel: inv.customerName || '', link: '/sales-flow/invoices', icon: <FileText size={14} /> });
                  }
                });
                (jobOrders || []).forEach((job: any) => {
                  const jobName = job.jobName || job.title || job.orderNumber;
                  if (String(jobName).toLowerCase().includes(q)) {
                    results.push({ type: 'Job', label: String(jobName), sublabel: job.status || '', link: '/industrial/work-orders', icon: <Package size={14} /> });
                  }
                });
                (inventory || []).forEach((item: any) => {
                  if (item.name?.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q)) {
                    results.push({ type: 'Inventory', label: item.name, sublabel: item.sku || '', link: '/supply-chain/inventory', icon: <Box size={14} /> });
                  }
                });

                if (results.length === 0) {
                  return <div className="p-8 text-center text-xs text-[#94a3b8] font-medium">No results found</div>;
                }

                return results.slice(0, 10).map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { navigate(r.link); setSearchOpen(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#eef7f6] transition-all border-b border-[#eef2eb] last:border-b-0 text-left"
                  >
                    <span className="p-1.5 rounded-lg bg-[#eef7f6] text-[#146b60] shrink-0">
                      {r.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#0b3e39] truncate">{r.label}</div>
                      <div className="text-[11px] text-[#5c6567] truncate">{r.sublabel}</div>
                    </div>
                    <span className="text-[10px] font-bold text-[#146b60] bg-[#eef7f6] px-2 py-0.5 rounded shrink-0">{r.type}</span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      {location.pathname === '/' && <AICopilot />}
      {isWhatsAppModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsWhatsAppModalOpen(false)}>
          <div className="w-full max-w-4xl bg-[#FEFDFB] rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] border border-[#e4ddd1] overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200" onClick={(e) => e.stopPropagation()} style={{ height: '80vh', maxHeight: 700 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4ddd1] bg-[#eef7f6]">
              <h2 className="text-sm font-bold text-[#0b3e39]">WhatsApp Messages</h2>
              <button onClick={() => setIsWhatsAppModalOpen(false)} className="p-1 rounded-lg hover:bg-[#d9ceb8]/30 transition-colors" aria-label="Close messages">
                <X size={16} className="text-[#5c6567]" />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ height: 'calc(80vh - 52px)', maxHeight: 'calc(700px - 52px)' }}>
              <MarketingMessages />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Customer portal routes — available regardless of admin auth state so
// customers can sign in and use the portal without an admin session.
// Must be a React.Fragment element (not a component) so <Routes> accepts it.
const PortalRoutes = (
  <React.Fragment>
    <Route path="/portal/login" element={<CustomerLogin />} />
    <Route path="/portal/activate" element={<CustomerActivate />} />
    <Route path="/portal/forgot-password" element={<ToastProvider><CustomerForgotPassword /></ToastProvider>} />
    <Route path="/portal/reset-password" element={<ToastProvider><CustomerResetPassword /></ToastProvider>} />
    <Route path="/portal" element={<CustomerLayout />}>
      <Route index element={<Navigate to="/portal/dashboard" replace />} />
      <Route path="dashboard" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerDashboard /></Suspense>} />
      <Route path="requests" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerRequests /></Suspense>} />
      <Route path="requests/:id" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerRequestDetail /></Suspense>} />
      <Route path="orders" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerOrders /></Suspense>} />
      <Route path="orders/:id" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerOrderDetail /></Suspense>} />
      <Route path="shipments" element={<Navigate to="/portal/deliveries" replace />} />
      <Route path="deliveries" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerDeliveries /></Suspense>} />
      <Route path="shipments/:id" element={<Navigate to="/portal/deliveries" replace />} />
      <Route path="quotations" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerQuotations /></Suspense>} />
      <Route path="quotations/:id" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerQuotationDetail /></Suspense>} />
      <Route path="new-request" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerCreateRequest /></Suspense>} />

      <Route path="invoices" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerInvoices /></Suspense>} />
      <Route path="invoices/:id" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerInvoiceDetail /></Suspense>} />
      <Route path="payments" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerPayments /></Suspense>} />
      <Route path="payments/:id" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerPaymentDetail /></Suspense>} />
      <Route path="payment-options" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerPaymentOptions /></Suspense>} />
      <Route path="statements" element={<Navigate to="/portal/account-statements" replace />} />
      <Route path="account-statements" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerAccountStatements /></Suspense>} />
      <Route path="wallet" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerWallet /></Suspense>} />
      <Route path="loyalty" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerLoyalty /></Suspense>} />
      <Route path="documents" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerDocuments /></Suspense>} />
      <Route path="notifications" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerNotifications /></Suspense>} />
      <Route path="referrals" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerReferrals /></Suspense>} />
      <Route path="profile" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerProfile /></Suspense>} />
      <Route path="support" element={<Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-700 rounded-full animate-spin" /></div>}><CustomerSupport /></Suspense>} />
    </Route>
  </React.Fragment>
);

// Portal-aware landing: portal.primeerp.com defaults to the customer portal
// login. Every other host goes straight to the admin login — there is no
// longer a chooser / Gateway page.
function getLandingPath(): string {
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'portal.primeerp.com' || host.endsWith('.portal.primeerp.com')) {
    return '/portal/login';
  }
  return '/login';
}

// Portal-aware identity: the customer portal lives under /portal (hash or
// clean path) or the portal.primeerp.com host. It gets its own branding
// (PrimePORTAL) everywhere the ERP would otherwise show "Prime ERP System".
function isPortalContext(): boolean {
  const hash = String(window.location.hash || '').toLowerCase();
  if (hash.startsWith('#/portal')) return true;
  const path = String(window.location.pathname || '').toLowerCase();
  if (path.startsWith('/portal')) return true;
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'portal.primeerp.com' || host.endsWith('.portal.primeerp.com');
}

const RootNavigator: React.FC = () => {
  const { user, isInitialized, requiresSetup } = useAuth();
  const isPortal = isPortalContext();

  // Keep the browser tab labelled correctly for each surface (the static
  // <title> in index.html is also corrected pre-mount).
  useEffect(() => {
    document.title = isPortal ? 'PrimePORTAL' : 'Prime ERP System';
  }, [isPortal]);

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: isPortal ? '#F3F7F6' : '#F5F7F9' }}>
        {/* Decorative Background Accents */}
        <div className={`fixed top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] animate-pulse ${isPortal ? 'bg-teal-500/5' : 'bg-blue-500/5'}`} />
        <div className={`fixed bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[120px] animate-pulse delay-700 ${isPortal ? 'bg-indigo-500/5' : 'bg-indigo-500/5'}`} />

        <div className="flex flex-col items-center gap-8 relative z-10">
          {/* Premium Logo */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center ring-1 ring-white/20 transition-all duration-500 hover:scale-105"
            style={{
              background: isPortal
                ? 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)'
                : 'linear-gradient(to bottom right, #3b82f6, #4f46e5)',
              boxShadow: isPortal
                ? '0 8px 32px rgba(15, 84, 76, 0.30)'
                : '0 8px 32px rgba(59, 130, 246, 0.3)',
            }}
          >
            <span className="text-white text-5xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]">P</span>
          </div>

          <div className="text-center space-y-2">
            {isPortal ? (
              <>
                <h1 className="text-4xl font-black tracking-tight animate-fade-in text-[#0F2C59]">
                  Prime<span style={{ color: '#d99a3f' }}>PORTAL</span>
                </h1>
                <p className="text-[#146b60] font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">
                  Customer Portal
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-black tracking-tight animate-fade-in">
                  <span className="text-blue-600">Prime</span> <span className="text-green-600">ERP</span> <span className="text-blue-600">System</span>
                </h1>
                <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">
                  Powered by AI
                </p>
              </>
            )}
          </div>

          {/* Premium Loading Bar */}
          <div className="w-80 h-[3px] bg-slate-100/80 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
            <div
              className="h-full rounded-full animate-progress-indeterminate"
              style={{
                background: isPortal
                  ? 'linear-gradient(to right, #146b60, #3fa294, #d99a3f)'
                  : 'linear-gradient(to right, #3b82f6, #4f46e5, #9333ea)',
                boxShadow: isPortal ? '0 0 16px rgba(63, 162, 148, 0.30)' : '0 0 16px rgba(99, 102, 241, 0.25)',
              }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  const SUPABASE_ENABLED = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
  );

  // When Supabase is enabled and user is authenticated, skip local setup check
  // (data will sync from cloud)
  const showSetup = requiresSetup && !(SUPABASE_ENABLED && user);

  if (showSetup) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {PortalRoutes}
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (!user) {
    return (
      <PwaInstallProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/" element={<Navigate to={getLandingPath()} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/install" element={<PwaInstallPage />} />
          {PortalRoutes}
            <Route path="*" element={<Navigate to={getLandingPath()} replace />} />
          </Routes>
        </Suspense>
      </PwaInstallProvider>
    );
  }

  return (
    <PwaInstallProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {PortalRoutes}
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </Suspense>
    </PwaInstallProvider>
  );
};

const App: React.FC = () => {
  // PDF worker mode: headless window for off-thread PDF generation
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (urlParams.get('worker') === 'true') {
    return <PdfWorker />;
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <KeyboardProvider>
          <NotificationProvider>
            <AuthProvider>
              <AppProvider>
              <FinancialYearProvider>
              <FinanceProvider>
                <InventoryProvider>
                  <ProductionProvider>
                    <ExaminationProvider>
                      <ProcurementProvider>
                        <SalesProvider>
                          <OrdersProvider>
                            <DataProvider>
                              <CustomerAuthProvider>
                                <RootNavigator />
                              </CustomerAuthProvider>
                            </DataProvider>
                          </OrdersProvider>
                        </SalesProvider>
                      </ProcurementProvider>
                    </ExaminationProvider>
                  </ProductionProvider>
                </InventoryProvider>
              </FinanceProvider>
              </FinancialYearProvider>
              </AppProvider>
            </AuthProvider>
          </NotificationProvider>
        </KeyboardProvider>
      </ErrorBoundary>
      </HashRouter>
  );
};

export default App;
