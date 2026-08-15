import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckSquare, Plus, Trash2, Clock, User, Search, Filter,
  CheckCircle, AlertCircle, Circle, Briefcase, FileText,
  X, AlignLeft, Calendar, Flag, Save, MoreVertical, Edit2,
  RefreshCw, ChevronRight, UserPlus, Info, Play, Bell,
  List, Columns, Tag, ArrowUpDown, LayoutGrid
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { CRMTask } from '../types';
import { OfflineImage } from '../components/OfflineImage';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const CATEGORIES = ['General', 'Client', 'Internal', 'Meeting', 'Follow-up', 'Invoice', 'Project'] as const;
const PRIORITIES: CRMTask['priority'][] = ['Urgent', 'High', 'Medium', 'Low'];
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const Tasks: React.FC = () => {
  const { user, allUsers, notify } = useAuth();
  const { tasks, addTask, updateTask, deleteTask } = useData();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<'Board' | 'List'>('Board');
  const [filter, setFilter] = useState<'All' | 'My Tasks'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'dueDate' | 'title'>('priority');

  // Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Handle direct creation from navigation state
  useEffect(() => {
    if (location.state && (location.state as { action?: string }).action === 'create') {
      handleOpenNewTask();
    }
  }, [location.state]);

  // Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [taskPriority, setTaskPriority] = useState<CRMTask['priority']>('Medium');
  const [taskAssignee, setTaskAssignee] = useState(user?.id || '');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState('');
  const [taskCategory, setTaskCategory] = useState<string>('General');

  // Animation State
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Context Menu State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const isOverdue = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d < now;
  };

  const isToday = (dateStr: string) => dateStr?.startsWith(todayStr);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesFilter = filter === 'My Tasks' ? t.assignedTo === user?.id : true;
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [tasks, filter, user, searchTerm]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === 'priority') {
        return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      }
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return a.title.localeCompare(b.title);
    });
  }, [filteredTasks, sortBy]);

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const overdue = filteredTasks.filter(t => t.status !== 'Completed' && isOverdue(t.dueDate)).length;
    const dueToday = filteredTasks.filter(t => t.status !== 'Completed' && isToday(t.dueDate)).length;
    const pending = filteredTasks.filter(t => t.status === 'Pending').length;
    const inProgress = filteredTasks.filter(t => t.status === 'In Progress').length;
    const completed = filteredTasks.filter(t => t.status === 'Completed').length;
    return { total, overdue, dueToday, pending, inProgress, completed };
  }, [filteredTasks]);

  const handleOpenNewTask = () => {
    setEditingTask(null);
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('Medium');
    setTaskDate(new Date().toISOString().split('T')[0]);
    setTaskAssignee(user?.id || '');
    setHasReminder(false);
    setReminderTime('');
    setTaskCategory('General');
    setShowTaskModal(true);
  };

  const handleEditTask = (task: CRMTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.notes || task.description || '');
    setTaskPriority(task.priority || 'Medium');
    setTaskDate(task.dueDate || new Date().toISOString().split('T')[0]);
    setTaskAssignee(task.assignedTo || user?.id || '');
    setHasReminder(task.hasAlarm || false);
    setReminderTime(task.reminderDate ? task.reminderDate.slice(0, 16) : '');
    setTaskCategory(task.category || 'General');
    setShowTaskModal(true);
    setOpenMenuId(null);
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const taskData: Partial<CRMTask> = {
      title: taskTitle,
      status: editingTask?.status || 'Pending',
      priority: taskPriority,
      dueDate: taskDate,
      assignedTo: taskAssignee || user?.id || '',
      notes: taskDescription,
      hasAlarm: hasReminder,
      reminderDate: hasReminder ? reminderTime : undefined,
      category: taskCategory,
    };

    if (editingTask) {
      updateTask({ ...editingTask, ...taskData } as CRMTask);
      notify('Task updated successfully', 'success');
    } else {
      addTask({ ...taskData, id: '' } as CRMTask);
      notify('New task created', 'success');
    }

    setShowTaskModal(false);
    setEditingTask(null);
  };

  const handleStatusUpdate = (task: CRMTask, status: CRMTask['status']) => {
    setOpenMenuId(null);
    if (status === 'Completed') {
      setCompletingId(task.id);
      setTimeout(() => {
        updateTask({ ...task, status });
        setCompletingId(null);
        notify(`Task marked as ${status}`, 'info');
      }, 600);
    } else {
      updateTask({ ...task, status });
      notify(`Task marked as ${status}`, 'info');
    }
  };

  const handleDeleteTask = (id: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(id);
      setOpenMenuId(null);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      notify('Task deleted', 'info');
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected tasks?`)) {
      selectedIds.forEach(id => deleteTask(id));
      setSelectedIds(new Set());
      notify(`${selectedIds.size} tasks deleted`, 'info');
    }
  };

  const handleBulkStatus = (status: CRMTask['status']) => {
    if (selectedIds.size === 0) return;
    tasks.filter(t => selectedIds.has(t.id)).forEach(t => updateTask({ ...t, status }));
    setSelectedIds(new Set());
    notify(`${selectedIds.size} tasks marked as ${status}`, 'info');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, status: CRMTask['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === id);
    if (task && task.status !== status) {
      updateTask({ ...task, status });
      if (status === 'Completed') {
        setCompletingId(task.id);
        setTimeout(() => setCompletingId(null), 600);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 250);
    setMenuPos({ x, y });
    setOpenMenuId(id);
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'Urgent': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'High': return 'bg-red-100 text-red-700 border-red-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const TaskCard: React.FC<{ task: CRMTask }> = ({ task }) => {
    const assignedUser = allUsers.find(u => u.id === task.assignedTo);
    const overdue = task.status !== 'Completed' && isOverdue(task.dueDate);
    const dueToday = task.status !== 'Completed' && isToday(task.dueDate);

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onContextMenu={(e) => handleContextMenu(e, task.id)}
        className={`bg-white p-4 rounded-xl shadow-sm border hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative
          ${openMenuId === task.id ? 'border-blue-400 ring-2 ring-blue-500/10' : 'border-slate-200'}
          ${task.status === 'Completed' ? 'bg-emerald-50/20' : overdue ? 'border-l-red-400 border-l-4' : dueToday ? 'border-l-amber-400 border-l-4' : ''}
        `}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {task.status === 'Completed' ? (
              <CheckCircle size={14} style={{ color: '#1f8577' }} />
            ) : completingId === task.id ? (
              <div style={{ width: '14px', height: '14px', borderWidth: '2px', border: '1.4px solid #e4ddd1', borderStyle: 'solid', borderRadius: '9999px', animation: 'spin 1s linear infinite' }} />
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getPriorityColor(task.priority)}`}>{task.priority}</span>
            )}
            {task.hasAlarm && <Bell size={12} style={{ color: '#1f8577', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />}
            {task.category && task.category !== 'General' && (
              <span style={{ paddingLeft: '6px', paddingTop: '2px', borderRadius: '6px', background: '#eef7f6', color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', paddingRight: '6px', paddingBottom: '2px' }}>{task.category}</span>
            )}
          </div>
          <button
            onClick={(e) => handleContextMenu(e, task.id)}
            className={`p-1 rounded-lg transition-colors ${openMenuId === task.id ? 'text-blue-600 bg-blue-50' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}
          >
            <MoreVertical size={14} />
          </button>
        </div>
        <h4 className={`font-bold text-slate-800 mb-1 text-sm leading-tight group-hover:text-blue-600 transition-colors ${task.status === 'Completed' ? 'line-through opacity-50' : ''}`}>{task.title}</h4>
        {task.notes && (
          <p style={{ fontSize: '11px', color: '#5c6567', marginBottom: '12px', display: '-webkit-box', lineHeight: 1.625, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.notes}</p>
        )}

        {task.relatedTo && (
          <div style={{ color: '#5c6567', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: '#eef7f6', paddingLeft: '8px', paddingTop: '4px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', width: 'fit-content', paddingRight: '8px', paddingBottom: '4px' }}>
            {task.relatedTo.type === 'WorkOrder' ? <Briefcase size={10} /> : <User size={10} />}
            <span style={{ overflow: 'hidden', fontWeight: 500, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.relatedTo.name}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#5c6567', borderStyle: 'solid', borderColor: '#e4ddd1', paddingTop: '12px', marginTop: '4px' }}>
          <span className={`flex items-center gap-1.5 ${overdue ? 'text-red-500 font-bold' : dueToday ? 'text-amber-600 font-bold' : ''}`}>
            <Clock size={12} /> {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`Assigned to: ${assignedUser?.name || 'Unassigned'}`}>
            <div style={{ width: '24px', height: '24px', borderRadius: '9999px', background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6567', fontWeight: 700, border: '1.4px solid #e4ddd1', borderColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden' }}>
              <OfflineImage
                src={assignedUser?.avatar}
                alt={assignedUser?.name || '?'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={assignedUser?.name?.charAt(0) || '?'}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const KanbanColumn = ({ status, title }: { status: CRMTask['status']; title: string }) => {
    const columnTasks = sortedTasks.filter(t => t.status === status);
    return (
      <div
        style={{ flex: 1, background: '#eef7f6', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div style={{ padding: '16px', borderStyle: 'solid', borderColor: '#e4ddd1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef7f6' }}>
          <h3 style={{ fontWeight: 700, color: '#23282A', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`w-2 h-2 rounded-full ${status === 'Pending' ? 'bg-slate-400' : status === 'In Progress' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
            {title}
          </h3>
          <span style={{ background: '#FEFDFB', paddingLeft: '8px', paddingTop: '2px', borderRadius: '8px', fontSize: '11px', color: '#5c6567', fontWeight: 700, border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', paddingRight: '8px', paddingBottom: '2px' }}>{columnTasks.length}</span>
        </div>
        <div style={{ padding: '12px', flex: 1, overflowY: 'auto', marginTop: '12px' }}>
          {columnTasks.map(task => <TaskCard key={task.id} task={task} />)}
          {columnTasks.length === 0 && (
            <div style={{ height: '128px', borderWidth: '2px', borderStyle: 'dashed', borderColor: '#e4ddd1', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5c6567', fontSize: '11px', opacity: 0.5 }}>
              <CheckCircle size={24} style={{ marginBottom: '8px', opacity: 0.2 }} />
              No tasks in {title}
            </div>
          )}
        </div>
      </div>
    );
  };

  const TaskRow: React.FC<{ task: CRMTask }> = ({ task }) => {
    const assignedUser = allUsers.find(u => u.id === task.assignedTo);
    const overdue = task.status !== 'Completed' && isOverdue(task.dueDate);
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors group text-sm
          ${overdue ? 'bg-red-50/30' : ''} ${task.status === 'Completed' ? 'opacity-60' : ''}`}
      >
        <input
          type="checkbox"
          checked={selectedIds.has(task.id)}
          onChange={() => toggleSelect(task.id)}
          style={{ width: '16px', height: '16px', borderRadius: '6px', borderColor: '#e4ddd1', color: '#1f8577', flexShrink: 0 }}
        />
        <button
          onClick={() => handleStatusUpdate(task, task.status === 'Completed' ? 'Pending' : 'Completed')}
          style={{ flexShrink: 0 }}
        >
          {task.status === 'Completed' ? (
            <CheckCircle size={18} style={{ color: '#1f8577' }} />
          ) : (
            <Circle size={18} style={{ color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }} />
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`font-medium truncate ${task.status === 'Completed' ? 'line-through' : ''}`}>
            {task.title}
          </span>
          {task.category && task.category !== 'General' && (
            <span style={{ paddingLeft: '6px', paddingTop: '2px', borderRadius: '6px', background: '#eef7f6', color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0, paddingRight: '6px', paddingBottom: '2px' }}>{task.category}</span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider shrink-0 ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#5c6567', flexShrink: 0 }}>
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-500 font-bold' : ''}`}>
            <Clock size={12} />
            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}
          </span>
          <div style={{ width: '24px', height: '24px', borderRadius: '9999px', background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c6567', fontWeight: 700, border: '1.4px solid #e4ddd1', borderColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden' }} title={assignedUser?.name || 'Unassigned'}>
            <OfflineImage
              src={assignedUser?.avatar}
              alt={assignedUser?.name || '?'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={assignedUser?.name?.charAt(0) || '?'}
            />
          </div>
          <button
            onClick={(e) => handleContextMenu(e, task.id)}
            style={{ padding: '4px', borderRadius: '6px', color: '#5c6567', opacity: 0.0, transition: 'all .15s ease' }}
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderContextMenu = () => {
    if (!openMenuId || !menuPos) return null;
    const task = tasks.find(t => t.id === openMenuId);
    if (!task) return null;

    return (
      <div
        ref={menuRef}
        style={{ position: 'fixed', width: '208px', background: 'rgba(254,253,251,.95)', backdropFilter: 'blur(20px)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,.12)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', transitionDuration: '100ms', display: 'flex', flexDirection: 'column', paddingTop: '6px', paddingBottom: '6px', top: menuPos.y, left: menuPos.x }}
      >
        <div style={{ paddingLeft: '12px', paddingTop: '4px', marginBottom: '4px', borderStyle: 'solid', borderColor: '#e4ddd1', paddingRight: '12px', paddingBottom: '4px' }}>
          <p style={{ fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em' }}>Task Options</p>
        </div>

        <button onClick={() => handleEditTask(task)} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontSize: '11px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>
          <Edit2 size={14} /> Edit Details
        </button>

        {task.status !== 'Completed' ? (
          <button onClick={() => handleStatusUpdate(task, 'Completed')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontSize: '11px', fontWeight: 500, color: '#0f544c', display: 'flex', alignItems: 'center', gap: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>
            <CheckCircle size={14} /> Mark as Done
          </button>
        ) : (
          <button onClick={() => handleStatusUpdate(task, 'Pending')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontSize: '11px', fontWeight: 500, color: '#b97e2b', display: 'flex', alignItems: 'center', gap: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>
            <RefreshCw size={14} /> Set to Pending
          </button>
        )}

        {task.status === 'Pending' && (
          <button onClick={() => handleStatusUpdate(task, 'In Progress')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontSize: '11px', fontWeight: 500, color: '#0f544c', display: 'flex', alignItems: 'center', gap: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>
            <Play size={14} /> Start Progress
          </button>
        )}

        <div style={{ height: '1px', background: '#eef7f6', margin: '4px', marginTop: '4px', marginBottom: '4px' }} />

        <button onClick={() => handleDeleteTask(task.id)} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontSize: '11px', fontWeight: 500, color: '#b5493f', display: 'flex', alignItems: 'center', gap: '12px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '16px', paddingBottom: '8px' }}>
          <Trash2 size={14} /> Delete Task
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {renderContextMenu()}

      {/* Task Form Modal */}
      {showTaskModal && (
        <div style={{ position: 'fixed', top: 0, background: 'rgba(11,62,57,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)', right: 0, bottom: 0, left: 0 }}>
          <div style={{ background: '#FEFDFB', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,.12)', width: '100%', maxWidth: '512px', overflow: 'hidden', border: '1.4px solid #e4ddd1', borderColor: 'rgba(255,255,255,.4)' }}>
            <div style={{ padding: '20px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingTask ? <Edit2 style={{ color: '#1f8577' }} size={20} /> : <CheckSquare style={{ color: '#1f8577' }} size={20} />}
                {editingTask ? 'Edit Task' : 'New Task'}
              </h2>
              <button onClick={() => setShowTaskModal(false)} style={{ color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease', padding: '4px', borderRadius: '9999px' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveTask} style={{ padding: '24px', marginTop: '20px', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>Task Title</label>
                <input
                  type="text"
                  style={{ width: '100%', padding: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', outline: 'none', fontWeight: 700, color: '#23282A', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                  placeholder="What needs to be done?"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'flex', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px', alignItems: 'center', gap: '8px' }}>
                    <Tag size={14} /> Category
                  </label>
                  <select
                    style={{ width: '100%', padding: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', background: '#FEFDFB', outline: 'none', fontWeight: 700, color: '#23282A', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                    value={taskCategory}
                    onChange={e => setTaskCategory(e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'flex', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px', alignItems: 'center', gap: '8px' }}>
                    <Flag size={14} /> Priority
                  </label>
                  <select
                    style={{ width: '100%', padding: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', background: '#FEFDFB', outline: 'none', fontWeight: 700, color: '#23282A', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as CRMTask['priority'])}
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px', alignItems: 'center', gap: '8px' }}>
                  <AlignLeft size={14} /> Description
                </label>
                <textarea
                  style={{ width: '100%', padding: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', outline: 'none', height: '96px', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                  placeholder="Add details, notes, or checklist..."
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'flex', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} /> Due Date
                  </label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', outline: 'none', fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                    value={taskDate}
                    onChange={e => setTaskDate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px', alignItems: 'center', gap: '8px' }}>
                    <User size={14} /> Assign To
                  </label>
                  <select
                    style={{ width: '100%', padding: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '13px', background: '#FEFDFB', outline: 'none', fontWeight: 700, color: '#23282A', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                  >
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: '16px', background: '#eef7f6', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: '16px', height: '16px', borderRadius: '6px', color: '#1f8577' }}
                    checked={hasReminder}
                    onChange={e => setHasReminder(e.target.checked)}
                  />
                  <span style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bell size={12} /> Set Reminder Alert
                  </span>
                </label>
                {hasReminder && (
                  <div className="animate-in slide-in-from-top-1">
                    <label style={{ display: 'block', fontWeight: 900, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px', marginLeft: '4px' }}>Notify Me On</label>
                    <input
                      type="datetime-local"
                      style={{ width: '100%', padding: '10px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', borderRadius: '12px', fontSize: '11px', outline: 'none', fontWeight: 700, boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
                      value={reminderTime}
                      onChange={e => setReminderTime(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!taskTitle}
                style={{ width: '100%', paddingTop: '14px', background: '#1f8577', color: '#fff', borderRadius: '16px', fontWeight: 900, textTransform: 'uppercase', boxShadow: '0 4px 14px 0 rgba(31,133,119,.2)', transition: 'all .15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', paddingBottom: '14px' }}
              >
                <Save size={16} /> {editingTask ? 'Update Task' : 'Create Task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'start', gap: '16px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-.025em' }}>
            <CheckSquare style={{ color: '#1f8577' }} size={28} /> Task Manager
          </h1>
          <p style={{ fontSize: '13px', color: '#5c6567', marginTop: '4px', fontWeight: 500 }}>Collaborate and track team activities across the system</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567' }} size={14} />
            <input
              type="text"
              placeholder="Search tasks..."
              style={{ paddingLeft: '36px', paddingRight: '16px', paddingTop: '8px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', fontSize: '11px', width: '100%', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease', paddingBottom: '8px' }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', background: 'rgba(254,253,251,.7)', backdropFilter: 'blur(12px)', padding: '4px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <button onClick={() => setFilter('All')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'All' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>All</button>
            <button onClick={() => setFilter('My Tasks')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'My Tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>My Tasks</button>
          </div>

          <div style={{ display: 'flex', background: 'rgba(254,253,251,.7)', backdropFilter: 'blur(12px)', padding: '4px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <button onClick={() => setViewMode('Board')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'Board' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`} title="Board View">
              <Columns size={16} />
            </button>
            <button onClick={() => setViewMode('List')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'List' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`} title="List View">
              <List size={16} />
            </button>
          </div>

          <button
            onClick={handleOpenNewTask}
            style={{ background: '#1f8577', color: '#fff', paddingLeft: '20px', paddingTop: '8px', borderRadius: '12px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px 0 rgba(31,133,119,.2)', transition: 'all .15s ease', paddingRight: '20px', paddingBottom: '8px' }}
          >
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Stats Bar (QBO Style) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' }}>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#5c6567', borderRadius: '10px', flexShrink: 0 }}>
            <List size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Total</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.total}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#d99a3f', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#fbead0', color: '#d99a3f', borderRadius: '10px', flexShrink: 0 }}>
            <Clock size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Pending</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.pending}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}>
            <Play size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>In Progress</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.inProgress}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}>
            <CheckCircle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Done</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.completed}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', flexShrink: 0 }}>
            <Calendar size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Due Today</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.dueToday}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#b5493f', transition: 'all .15s ease', transitionDuration: '200ms' }}>
          <div style={{ padding: '10px', background: '#fef2f2', color: '#b5493f', borderRadius: '10px', flexShrink: 0 }}>
            <AlertCircle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Overdue</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{stats.overdue}</p>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#eef7f6', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f544c' }}>{selectedIds.size} selected</span>
          <button onClick={handleBulkStatus.bind(null, 'Completed')} style={{ paddingLeft: '12px', paddingTop: '6px', background: '#1f8577', color: '#fff', borderRadius: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '12px', paddingBottom: '6px' }}>
            Mark Done
          </button>
          <button onClick={handleBulkStatus.bind(null, 'In Progress')} style={{ paddingLeft: '12px', paddingTop: '6px', background: '#1f8577', color: '#fff', borderRadius: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '12px', paddingBottom: '6px' }}>
            Start Progress
          </button>
          <button onClick={handleBulkStatus.bind(null, 'Pending')} style={{ paddingLeft: '12px', paddingTop: '6px', background: '#d99a3f', color: '#fff', borderRadius: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', transition: 'color .15s ease,background .15s ease,border-color .15s ease', paddingRight: '12px', paddingBottom: '6px' }}>
            Set Pending
          </button>
          <button onClick={handleBulkDelete} style={{ paddingLeft: '12px', paddingTop: '6px', background: '#b5493f', color: '#fff', borderRadius: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', transition: 'color .15s ease,background .15s ease,border-color .15s ease', marginLeft: 'auto', paddingRight: '12px', paddingBottom: '6px' }}>
            Delete All
          </button>
        </div>
      )}

      {/* Info Strip */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', paddingLeft: '8px', flexShrink: 0, paddingRight: '8px' }}>
        <Info size={12} style={{ color: '#1f8577' }} />
        Tip: Set reminders to get desktop alerts for critical deadlines. Drag cards between columns to update status.
      </div>

      {/* Board View */}
      {viewMode === 'Board' && (
        <div style={{ flex: 1, display: 'flex', gap: '24px', overflowX: 'auto', paddingBottom: '24px', minHeight: 0 }}>
          <KanbanColumn status="Pending" title="Ready to Start" />
          <KanbanColumn status="In Progress" title="In Progress" />
          <KanbanColumn status="Completed" title="Finalized" />
        </div>
      )}

      {/* List View */}
      {viewMode === 'List' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', background: '#FEFDFB', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '16px', paddingTop: '10px', background: '#eef7f6', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.05em', paddingRight: '16px', paddingBottom: '10px' }}>
            <div style={{ width: '16px', flexShrink: 0 }} />
            <div style={{ width: '16px', flexShrink: 0 }} />
            <button onClick={() => setSortBy('title')} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', textAlign: 'left' }}>
              Task <ArrowUpDown size={10} />
            </button>
            <button onClick={() => setSortBy('priority')} style={{ display: 'flex', alignItems: 'center', gap: '4px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', width: '80px', flexShrink: 0 }}>
              Priority <ArrowUpDown size={10} />
            </button>
            <button onClick={() => setSortBy('dueDate')} style={{ display: 'flex', alignItems: 'center', gap: '4px', transition: 'color .15s ease,background .15s ease,border-color .15s ease', width: '112px', flexShrink: 0 }}>
              Due Date <ArrowUpDown size={10} />
            </button>
            <div style={{ width: '80px', flexShrink: 0, textAlign: 'center' }}>Assignee</div>
            <div style={{ width: '32px', flexShrink: 0 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedTasks.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5c6567', paddingTop: '64px', paddingBottom: '64px' }}>
                <CheckSquare size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                <p style={{ fontSize: '13px', fontWeight: 700 }}>No tasks found</p>
                <p style={{ fontSize: '11px', marginTop: '4px' }}>
                  {searchTerm ? 'Try a different search term' : 'Create your first task to get started'}
                </p>
              </div>
            ) : (
              sortedTasks.map(task => <TaskRow key={task.id} task={task} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
