import React from 'react';
import { CompanyConfig } from '../../../types';
import { Bell, Mail, MessageSquare, ShieldAlert, CheckCircle2, Smartphone } from 'lucide-react';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';

interface NotificationsTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ config, setConfig, notify }) => {
  const [confirmState, setConfirmState] = React.useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });
  const [pendingDisable, setPendingDisable] = React.useState(false);

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Bell size={18} className="text-[#1f8577]" /> Channel Configuration
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          <div className="grid grid-cols-2 gap-10">
            <div className="flex justify-between items-center p-6 bg-[#eef7f6] rounded-lg border border-[#D4D7DC] hover:border-[#1f8577] transition-all">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-white rounded-xl shadow-sm text-[#1f8577] border border-[#D4D7DC]"><Mail size={24} /></div>
                <div>
                  <p className="font-black text-[#23282A] uppercase text-sm tracking-tight">Email Notifications</p>
                  <p className="text-[10px] text-[#5c6567] mt-1 font-medium italic">Invoices, reports, and alerts.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.notificationSettings?.emailEnabled}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      emailEnabled: e.target.checked
                    }
                  })}
                />
                <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f8577]"></div>
              </label>
            </div>
            <div className="flex justify-between items-center p-6 bg-[#eef7f6] rounded-lg border border-[#D4D7DC] hover:border-[#1f8577] transition-all">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-white rounded-xl shadow-sm text-[#1f8577] border border-[#D4D7DC]"><MessageSquare size={24} /></div>
                <div>
                  <p className="font-black text-[#23282A] uppercase text-sm tracking-tight">SMS Notifications</p>
                  <p className="text-[10px] text-[#5c6567] mt-1 font-medium italic">Critical alerts and OTPs.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.notificationSettings?.smsEnabled}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      smsEnabled: e.target.checked
                    }
                  })}
                />
                <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f8577]"></div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <ShieldAlert size={18} className="text-[#b5493f]" /> Alert Policy
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          <div className="grid grid-cols-2 gap-10">
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Low Stock Threshold</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  className="w-full px-3 py-2.5 bg-[#eef7f6] border border-[#D4D7DC] rounded-lg font-bold text-sm outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] transition-all "
                  placeholder="e.g. 10"
                  value={config.notificationSettings?.lowStockThreshold || 10}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      lowStockThreshold: parseInt(e.target.value) || 0
                    }
                  })}
                />
                <span className="text-[10px] font-black text-[#5c6567] uppercase tracking-widest">Units</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Large Transaction Alert</label>
              <div className="flex items-center gap-4">
                <span className="text-xs font-black text-[#5c6567]">{config.currencySymbol}</span>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 bg-[#eef7f6] border border-[#D4D7DC] rounded-lg font-bold text-sm outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] transition-all "
                  placeholder="e.g. 5000"
                  value={config.notificationSettings?.largeTransactionThreshold || 5000}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { emailEnabled: false, smsEnabled: false, systemAlertsEnabled: true, syncIntervalMinutes: 30, lastSyncTimestamp: '', syncStatus: 'Idle', autoSyncEnabled: false }),
                      largeTransactionThreshold: parseInt(e.target.value) || 0
                    }
                  })}
                />
              </div>
            </div>
          </div>
          <div className="h-px bg-[#e4ddd1]"></div>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-black text-[#23282A] uppercase text-base">Daily Performance Summary</p>
              <p className="text-sm text-[#5c6567] mt-1 font-medium italic">Receive a consolidated report of sales and stock movements.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.notificationSettings?.dailySummaryEnabled || false}
                onChange={e => setConfig({
                  ...config,
                  notificationSettings: {
                    ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: false, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                    dailySummaryEnabled: e.target.checked
                  }
                })}
              />
              <div className="w-11 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f8577]"></div>
            </label>
          </div>

          {config.notificationSettings?.dailySummaryEnabled && (
            <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-[#eef7f6] rounded-lg">
              <div>
                <label className="text-xs font-semibold text-[#23282A] mb-1 block">Summary Time</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 bg-white border border-[#D4D7DC] rounded-lg text-sm"
                  value={config.notificationSettings?.dailySummaryTime || "20:00"}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: true, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                      dailySummaryTime: e.target.value
                    }
                  })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#23282A] mb-1 block">Email Address</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 bg-white border border-[#D4D7DC] rounded-lg text-sm"
                  placeholder="e.g. report@company.com"
                  value={config.notificationSettings?.dailySummaryEmail || ''}
                  onChange={e => setConfig({
                    ...config,
                    notificationSettings: {
                      ...(config.notificationSettings || { customerActivityNotifications: false, smsGatewayEnabled: false, emailGatewayEnabled: false, dailySummaryEnabled: true, dailySummaryTime: '20:00', dailySummaryEmail: '' }),
                      dailySummaryEmail: e.target.value
                    }
                  })}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <MessageSquare size={18} className="text-[#1f8577]" /> Customer Communication
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex justify-between items-center hover:bg-[#eef7f6] -mx-8 px-8 py-4">
            <div>
              <p className="font-bold text-[#23282A] text-sm">Customer Activity Notifications</p>
              <p className="text-[11px] text-[#5c6567] mt-0.5">Automatically prepare messages for quotations, invoices, approvals, and payments.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.notificationSettings?.customerActivityNotifications ?? true}
                onChange={e => {
                  const newValue = e.target.checked;
                  if (!newValue) {
                    setPendingDisable(true);
                    setConfirmState({
                      open: true,
                      title: 'Disable Notifications',
                      message: 'Are you sure you want to disable customer activity notifications? This will stop automatic messaging app triggers for business activities.',
                      type: 'warning',
                      confirmText: 'Disable',
                      onConfirm: () => {
                        setConfig({
                          ...config,
                          notificationSettings: {
                            ...config.notificationSettings,
                            customerActivityNotifications: false
                          }
                        });
                        notify('Notifications disabled', 'info');
                      }
                    });
                  } else {
                    setConfig({
                      ...config,
                      notificationSettings: {
                        ...config.notificationSettings,
                        customerActivityNotifications: true
                      }
                    });
                    notify('Notifications enabled', 'success');
                  }
                }}
              />
              <div className="w-11 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f8577]"></div>
            </label>
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
      </section>
    </div>
  );
};
