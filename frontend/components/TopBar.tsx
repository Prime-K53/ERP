import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '@/services/logger';
import { 
  Bell, AlertTriangle, WifiOff, 
  Menu, LayoutGrid, CheckSquare, Wrench, Download, Package,
  RefreshCw, Database, CreditCard, Barcode, ChevronRight, ChevronDown, User, Upload,
  X, CheckCircle, Trash2, Clock, Plus, Zap, Filter, MessageSquare,
  Settings, ShieldCheck, LogOut, HeartPulse, ClipboardCheck
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { OfflineImage } from './OfflineImage';
import { exportToCSV, parseCSV } from '../services/excelService';
import { generateAccountNumber } from '../utils/helpers';
import type { Item, ItemType } from '../types';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

interface TopBarProps {
    toggleSidebar: () => void;
    toggleCollapse: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ toggleSidebar, toggleCollapse }) => {
  const {
    alerts, reminders, isOnline, user, notify, dbSyncStatus, connectDbSync,
    toggleReminder, addReminder, deleteReminder, clearAlerts, dismissAlert, tasks, updateTask
  } = useData();
  const { inventory, addItem } = useInventory();
  const navigate = useNavigate();
  const { logout } = useAuth();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [quickReminder, setQuickReminder] = useState('');
  const [notificationTab, setNotificationTab] = useState<'All' | 'Alerts' | 'Reminders' | 'Tasks'>('All');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<'Products' | 'Customers' | 'Items' | 'Accounts' | null>(null);
  const [showApps, setShowApps] = useState(false);
  
  const notificationRef = useRef<HTMLDivElement>(null);
  const appsMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const combinedNotifications = useMemo(() => {
    const formattedAlerts = (alerts || []).map(a => ({ ...a, type: 'Alert' as const }));
    const formattedReminders = (reminders || []).map(r => ({ ...r, type: 'Reminder' as const, message: r.text, severity: 'Low' as const }));
    
    const today = new Date().toISOString().split('T')[0];
    const formattedTasks = (tasks || []).filter(t =>
      t.dueDate === today &&
      t.status !== 'Completed'
    ).map(t => ({
      ...t,
      type: 'Task' as const,
      message: t.title,
      severity: t.priority === 'High' ? 'High' : 'Medium' as const
    }));
  
    let combined = [...formattedAlerts, ...formattedReminders, ...formattedTasks];
    
    if (notificationTab === 'Alerts') combined = combined.filter(n => n.type === 'Alert');
    if (notificationTab === 'Reminders') combined = combined.filter(n => n.type === 'Reminder');
    if (notificationTab === 'Tasks') combined = combined.filter(n => n.type === 'Task');
  
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [alerts, reminders, tasks, notificationTab]);

  const unreadCount = useMemo(() => {
    const alertCount = (alerts || []).length;
    const reminderCount = (reminders || []).filter(r => !r.completed).length;
    return alertCount + reminderCount;
  }, [alerts, reminders]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
      if (appsMenuRef.current && !appsMenuRef.current.contains(event.target as Node)) setShowApps(false);
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) setShowTools(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddQuickReminder = (e: React.FormEvent) => {
      e.preventDefault();
      if (!quickReminder.trim()) return;
      addReminder(quickReminder.trim(), new Date().toISOString());
      setQuickReminder('');
      notify("Reminder added to personal queue.", "success");
  };

  const handleExportProducts = () => {
      const data = inventory.map(item => ({ ID: item.id, Name: item.name, SKU: item.sku, Type: item.type, Category: item.category, Price: item.price, Cost: item.cost, Stock: item.stock, Unit: item.unit }));
      exportToCSV(data, 'products_export');
      setShowTools(false);
      notify("Product list exported successfully", "success");
  };

  const handleExportCustomers = () => {
      notify("Exporting customers...", "info");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !importType) return;
      try {
          const importedData = await parseCSV(file);
          if (importedData.length > 0) {
              if (importType === 'Items') {
                  importedData.forEach(item => {
                      const name = item.Name || item.name || item.ItemName;
                      if (name) {
                          addItem({
                              id: item.ID || item.id || '',
                              name: name,
                              sku: item.SKU || item.sku || '',
                              price: Number(item.Price || item.price || 0),
                              cost: Number(item.Cost || item.cost || 0),
                              stock: Number(item.Stock || item.stock || 0),
                              minStockLevel: Number(item.MinStock || item.minStock || 10),
                              category: item.Category || item.category || 'General',
                              type: (item.Type || item.type || 'Product') as ItemType,
                              unit: item.Unit || item.unit || 'pcs'
                          } as Item);
                      }
                  });
                  notify(`Imported ${importedData.length} inventory items`, "success");
              }
          }
      } catch (error) { 
          logger.error(error);
          notify("Import failed: check CSV format", "error"); 
      }
      setImportType(null);
      e.target.value = '';
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: ink,
    background: paper,
    border: `1.4px solid ${hairline}`,
    borderRadius: 9,
    padding: '7px 10px',
    outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
  };

  const btnPrimary: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 9,
    cursor: 'pointer',
    border: '1.4px solid transparent',
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
    transition: 'all .15s ease'
  };

  const btnGhost: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 9,
    cursor: 'pointer',
    background: paper,
    border: `1.4px solid ${hairline}`,
    color: inkSoft,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all .15s ease'
  };

  const MenuItem = ({ icon: Icon, color, bg, label, onClick, danger }: { icon: React.ElementType; color: string; bg: string; label: string; onClick: () => void; danger?: boolean }) => (
    <div onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px',
      fontSize: 12.5,
      fontWeight: 500,
      color: danger ? danger : '#23282A',
      cursor: 'pointer',
      borderRadius: 8,
      transition: 'all .2s ease',
      position: 'relative'
    }}
      onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.paddingLeft = '16px'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '12px'; }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Icon size={14} color={color} />
      </div>
      {label}
    </div>
  );

  return (
    <header style={{
      height: 56,
      paddingLeft: 24,
      paddingRight: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      borderBottom: `1px solid ${hairline}`,
      background: paper,
      fontFamily: "'Inter','DM Sans',sans-serif",
      fontSize: 13.5,
      color: ink
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button 
          style={{
            padding: 8,
            borderRadius: 10,
            color: inkSoft,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background .15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          onClick={() => {
              if (window.innerWidth < 768) {
                  toggleSidebar();
              } else {
                  toggleCollapse();
              }
          }}
          aria-label="Toggle Sidebar"
        >
          <Menu size={20}/>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Dedicated Notifications Panel */}
        <div style={{ position: 'relative' }} ref={notificationRef}>
            <button 
              style={{
                position: 'relative',
                padding: 8,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all .15s',
                background: showNotifications ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : 'transparent',
                color: showNotifications ? '#fff' : inkSoft
              }}
              onMouseEnter={e => { if (!showNotifications) e.currentTarget.style.backgroundColor = teal[50]; }}
              onMouseLeave={e => { if (!showNotifications) e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={() => setShowNotifications(!showNotifications)}
            >
                <Bell size={18}/>
                {unreadCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 16,
                      height: 16,
                      background: danger,
                      borderRadius: '50%',
                      border: '2px solid #fff',
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {showNotifications && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 12,
                  width: 320,
                  background: paper,
                  borderRadius: 14,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  border: `1px solid ${hairline}`,
                  overflow: 'hidden',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 500
                }}>
                    <div style={{
                      padding: 16,
                      borderBottom: `1px solid ${hairline}`,
                      background: paper,
                      flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div>
                                <h3 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0, fontFamily: "'DM Serif Display', 'Georgia', serif" }}>Notifications</h3>
                                <p style={{ fontSize: 10, color: inkSoft, fontWeight: 500, margin: '2px 0 0' }}>Updates from your workspace</p>
                            </div>
                            <button onClick={() => setShowNotifications(false)} style={{
                              padding: 6,
                              borderRadius: '50%',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: inkSoft,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'background .15s'
                            }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[100]; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              title="Close notifications" aria-label="Close notifications">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div style={{
                          display: 'flex',
background: teal[100],
                          padding: 4,
                          borderRadius: 10,
                          gap: 4
                        }}>
                            {(['All', 'Alerts', 'Reminders', 'Tasks'] as const).map(tab => (
                                <button 
                                    key={tab}
                                    onClick={() => setNotificationTab(tab)}
                                    style={{
                                      flex: 1,
                                      padding: '6px 0',
                                      borderRadius: 8,
                                      border: 'none',
                                      fontSize: 10,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all .15s',
                                      background: notificationTab === tab ? paper : 'transparent',
                                      color: notificationTab === tab ? teal[600] : inkSoft,
                                      boxShadow: notificationTab === tab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {combinedNotifications.length === 0 ? (
                            <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: inkSoft }}>
                                <CheckCircle size={40} style={{ marginBottom: 12, opacity: 0.2 }} />
                                <p style={{ fontSize: 12, fontWeight: 500 }}>All caught up!</p>
                            </div>
                        ) : (
                            <div>
                                {combinedNotifications.map((notif: any) => (
                                    <div 
                                        key={notif.id} 
                                        style={{
                                          padding: 16,
                                          display: 'flex',
                                          gap: 12,
                                          transition: 'background .15s',
                                          cursor: 'pointer',
                                          borderBottom: `1px solid ${hairline}`
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >
                                        <div style={{
                                          marginTop: 4,
                                          padding: 6,
                                          borderRadius: 8,
                                          height: 'fit-content',
                                          flexShrink: 0,
                                          border: `1px solid ${
                                            notif.type === 'Alert' 
                                              ? (notif.severity === 'High' ? `${danger}30` : teal[100])
                                              : teal[100]
                                          }`,
                                          background: notif.type === 'Alert' 
                                            ? (notif.severity === 'High' ? `${danger}15` : teal[50])
                                            : teal[50],
                                          color: notif.type === 'Alert' 
                                            ? (notif.severity === 'High' ? danger : teal[600])
                                            : (notif.completed ? inkSoft : teal[500])
                                        }}>
                                            {notif.type === 'Alert' ? <AlertTriangle size={14}/> : <CheckCircle size={14}/>}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                                <span style={{
                                                  fontSize: 9,
                                                  fontWeight: 700,
                                                  letterSpacing: 0.08,
                                                  textTransform: 'uppercase',
                                                  color: notif.type === 'Alert' ? teal[500] : teal[500]
                                                }}>
                                                    {notif.type}
                                                </span>
                                                <span style={{ fontSize: 9, fontWeight: 500, color: inkSoft }}>
                                                    {new Date(notif.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p style={{
                                              fontSize: 12,
                                              fontWeight: 500,
                                              color: ink,
                                              lineHeight: 1.5,
                                              textDecoration: notif.type === 'Reminder' && notif.completed ? 'line-through' : 'none'
                                            }}>
                                                {notif.message || notif.text}
                                            </p>
                                            
                                           <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                                {notif.type === 'Reminder' && (
                                                    <button
                                                        onClick={() => toggleReminder(notif.id)}
                                                        style={{
                                                          padding: '2px 8px',
                                                          borderRadius: 6,
                                                          fontSize: 10,
                                                          fontWeight: 600,
                                                          border: 'none',
                                                          cursor: 'pointer',
                                                          transition: 'all .15s',
                                                          background: notif.completed ? teal[100] : teal[50],
                                                          color: notif.completed ? inkSoft : teal[500]
                                                        }}
                                                    >
                                                        {notif.completed ? 'Re-open' : 'Done'}
                                                    </button>
                                                )}
                                                {notif.type === 'Task' && (
                                                    <button
                                                        onClick={() => updateTask({ id: notif.id, status: notif.completed ? 'Pending' : 'Completed' })}
                                                        style={{
                                                          padding: '2px 8px',
                                                          borderRadius: 6,
                                                          fontSize: 10,
                                                          fontWeight: 600,
                                                          border: 'none',
                                                          cursor: 'pointer',
                                                          transition: 'all .15s',
                                                          background: notif.completed ? teal[100] : teal[50],
                                                          color: notif.completed ? inkSoft : teal[500]
                                                        }}
                                                    >
                                                        {notif.completed ? 'Re-open' : 'Done'}
                                                    </button>
                                                )}
                                                {notif.type === 'Alert' && (
                                                    <button
                                                        onClick={() => dismissAlert(notif.id)}
                                                        style={{
                                                          padding: '2px 8px',
                                                          borderRadius: 6,
                                                          fontSize: 10,
                                                          fontWeight: 600,
                                                          border: 'none',
                                                          cursor: 'pointer',
                                                          background: teal[50],
                                                          color: inkSoft
                                                        }}
                                                    >
                                                        Dismiss
                                                    </button>
                                                )}
                                                {notif.type === 'Reminder' && (
                                                    <button
                                                        onClick={() => deleteReminder(notif.id)}
                                                        style={{
                                                          padding: 4,
                                                          border: 'none',
                                                          background: 'transparent',
                                                          cursor: 'pointer',
                                                          color: inkSoft,
                                                          transition: 'color .15s',
                                                          marginLeft: 'auto'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.color = danger; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = inkSoft; }}
                                                    >
                                                        <Trash2 size={12}/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: 12, background: teal[50], borderTop: `1px solid ${hairline}`, flexShrink: 0 }}>
                        <form onSubmit={handleAddQuickReminder} style={{ display: 'flex', gap: 8 }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Plus style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} size={14}/>
                                <input 
                                    type="text"
                                    placeholder="e.g. Call client at 2pm"
                                    style={{
                                      ...inputStyle,
                                      paddingLeft: 32
                                    }}
                                    value={quickReminder}
                                    onChange={e => setQuickReminder(e.target.value)}
                                />
                            </div>
                            <button 
                                type="submit"
                                disabled={!quickReminder.trim()}
                                style={{
                                  ...btnPrimary,
                                  padding: '7px 12px',
                                  opacity: quickReminder.trim() ? 1 : 0.5
                                }}
                            >
                                Add
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>

        <div ref={userMenuRef} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, borderLeft: `1px solid ${hairline}`, position: 'relative', cursor: 'pointer' }} onClick={() => setShowUserMenu(!showUserMenu)}>
            <div style={{ width: 36, height: 36, background: teal[100], borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: inkSoft, border: `1px solid ${hairline}` }}>
                <User size={18}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>{(user?.role === 'Company Admin' ? 'Admin' : user?.role) || 'User'}</span>
                <ChevronDown size={14} color="#5b578c" style={{ transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            {showUserMenu && (
                <div onClick={(e) => e.stopPropagation()} style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 12,
                  backgroundColor: '#FEFDFB',
                  borderRadius: 14,
                  boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
                  overflow: 'hidden',
                  zIndex: 60,
                  minWidth: 220
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #146b60, #3fa294 40%, #d99a3f 100%)' }} />
                    <div style={{ padding: '16px 16px 10px', marginTop: 3 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: '#146b60', textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 1 }}>Account</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#23282A', marginTop: 8 }}>{user?.fullName || user?.username || 'User'}</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#5c6567', marginTop: 2 }}>{(user?.role === 'Company Admin' ? 'Admin' : user?.role) || 'User'}</div>
                    </div>
                    <div style={{ padding: 4 }}>
                        <MenuItem icon={Wrench} color="#3b82f6" bg="#eef7f6" label="Internal Tools" onClick={() => { navigate('/internal-tools'); setShowUserMenu(false); }} />
                        <MenuItem icon={User} color="#6366f1" bg="#eef7f6" label="User Profile" onClick={() => { navigate('/profile'); setShowUserMenu(false); }} />
                        <MenuItem icon={ShieldCheck} color="#10b981" bg="#eef7f6" label="Security Log" onClick={() => { navigate('/audit'); setShowUserMenu(false); }} />
                        <MenuItem icon={Database} color="#06b6d4" bg="#eef7f6" label="Migration" onClick={() => { navigate('/admin/migration-health'); setShowUserMenu(false); }} />
                        <MenuItem icon={HeartPulse} color="#8b5cf6" bg="#f5f3ff" label="Sync Health" onClick={() => { navigate('/admin/sync-health'); setShowUserMenu(false); }} />
                        <MenuItem icon={ClipboardCheck} color="#0d9488" bg="#f0fdfa" label="Acceptance Run" onClick={() => { navigate('/admin/acceptance'); setShowUserMenu(false); }} />
                        <MenuItem icon={Settings} color="#f59e0b" bg="#fbead0" label="Settings" onClick={() => { navigate('/settings'); setShowUserMenu(false); }} />
                    </div>
                    <div style={{ borderTop: '1px solid #e4ddd1', padding: 4 }}>
                        <MenuItem icon={LogOut} color="#ef4444" bg="#fef2f2" label="Log out" onClick={() => { logout(); navigate('/login'); }} danger />
                    </div>
                </div>
            )}
        </div>
            <button style={{
              padding: 6,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background .15s',
              background: showApps ? `${teal[50]} ${teal[600]}` : 'transparent',
              color: showApps ? teal[600] : inkSoft
            }} onMouseEnter={e => { if (!showApps) e.currentTarget.style.backgroundColor = teal[50]; }} onMouseLeave={e => { if (!showApps) e.currentTarget.style.backgroundColor = 'transparent'; }} onClick={() => setShowApps(!showApps)} title="Apps menu" aria-label="Toggle apps menu"><LayoutGrid size={18}/></button>
            {showApps && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 8,
                  width: 288,
                  background: paper,
                  borderRadius: 14,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  border: `1px solid ${hairline}`,
                  padding: 12,
                  zIndex: 50
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Link to="/internal-tools/chat" style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
                          padding: 12,
                          borderRadius: 12,
                          textDecoration: 'none',
                          transition: 'background .15s',
                          cursor: 'pointer'
                        }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }} onClick={() => setShowApps(false)}>
                            <div style={{ width: 36, height: 36, background: amber[100], color: amber[500], borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <MessageSquare size={18}/>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: ink }}>Chat</span>
                        </Link>
                        <Link to="/sales/tasks" style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
                          padding: 12,
                          borderRadius: 12,
                          textDecoration: 'none',
                          transition: 'background .15s',
                          cursor: 'pointer'
                        }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }} onClick={() => setShowApps(false)}>
                            <div style={{ width: 36, height: 36, background: teal[100], color: teal[600], borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <CheckSquare size={18}/>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: ink }}>Tasks</span>
                        </Link>
                    </div>
                </div>
            )}
        </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: 'none' }}
        accept=".csv"
      />
    </header>
  );
};

export default TopBar;