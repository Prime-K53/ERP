import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { dbService } from '../services/db';
import { CheckCircle2, Circle, Plus, Trash2, Loader2, ListChecks } from 'lucide-react';

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

const DemoTasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch tasks from the backend
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await dbService.getAll('tasks');
      setTasks(data || []);
      setError(null);
    } catch (err) {
      logger.error('Error fetching tasks:', err);
      setError('Failed to load tasks from local database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // 2. Add a new task
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const task = {
        id: Date.now(),
        title: newTaskTitle,
        completed: false,
        createdAt: new Date().toISOString()
      };
      await dbService.put('tasks', task);
      setTasks([task, ...tasks]);
      setNewTaskTitle('');
    } catch (err) {
      logger.error('Error adding task:', err);
      alert('Could not add task to database');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <ListChecks size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Step 5: Working Feature</h1>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest text-[10px]">Real-time SQLite Task Manager</p>
        </div>
      </div>

      {/* Add Task Form */}
      <form onSubmit={addTask} className="mb-8 flex gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="What's your next move?"
          className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-medium shadow-sm transition-all"
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim()}
          className="px-6 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
        >
          <Plus size={20} />
        </button>
      </form>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100 mb-4 animate-in slide-in-from-top-1">
          {error}
        </div>
      )}

      {/* Tasks List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Querying SQLite...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium">
            No tasks yet. Start by adding one above!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-4">
                  {task.completed ? (
                    <CheckCircle2 className="text-indigo-600" size={20} />
                  ) : (
                    <Circle className="text-slate-300" size={20} />
                  )}
                  <span className={`text-sm font-bold ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {task.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-relaxed">
          Technical Details: Frontend React component talking to Node.js/Express backend via Axios, persisted in a Local SQLite database.
        </p>
      </div>
    </div>
  );
};

export default DemoTasks;
