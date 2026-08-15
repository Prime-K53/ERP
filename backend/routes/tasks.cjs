const express = require('express');
const router = express.Router();
const repo = require('../services/supabaseRepository.cjs');
const { sendSafeError } = require('../utils/errors.cjs');
const { validateBody, taskSchemas } = require('../middleware/validation.cjs');

router.get('/', async (req, res) => {
  try {
    const rows = await repo.getAll('tasks');
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(rows.map(r => ({
      ...r,
      completed: !!r.completed,
      hasAlarm: !!r.has_alarm,
      reminderDate: r.reminder_date || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error('[Tasks] Failed to get tasks:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

router.post('/', validateBody(taskSchemas.create), async (req, res) => {
  try {
    const body = req.body;
    const id = body.id || `TASK-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const record = {
      id,
      title: body.title,
      description: body.description || '',
      notes: body.notes || '',
      assigned_to: body.assignedTo || '',
      due_date: body.dueDate || '',
      status: body.status || 'Pending',
      priority: body.priority || 'Medium',
      has_alarm: body.hasAlarm ? 1 : 0,
      reminder_date: body.reminderDate || null,
      category: body.category || null,
      related_entity_type: body.relatedEntityType || null,
      related_entity_id: body.relatedEntityId || null,
      created_at: now,
      updated_at: now,
    };
    await repo.upsert('tasks', record);
    res.status(201).json({
      id, title, description: body.description || '', notes: body.notes || '',
      assignedTo: body.assignedTo || '', dueDate: body.dueDate || '',
      status: body.status || 'Pending', priority: body.priority || 'Medium',
      hasAlarm: !!body.hasAlarm, reminderDate: body.reminderDate || null,
      category: body.category || null,
      relatedEntityType: body.relatedEntityType || null,
      relatedEntityId: body.relatedEntityId || null, createdAt: now, updatedAt: now,
    });
  } catch (err) {
    console.error('[Tasks] Failed to create task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const old = await repo.getById('tasks', id);
    if (!old) return res.status(404).json({ error: 'Task not found' });
    const updates = { ...old };
    const fieldMap = {
      title: 'title', description: 'description', notes: 'notes',
      assignedTo: 'assigned_to', dueDate: 'due_date', status: 'status',
      priority: 'priority', hasAlarm: 'has_alarm', reminderDate: 'reminder_date',
      category: 'category', relatedEntityType: 'related_entity_type',
      relatedEntityId: 'related_entity_id',
    };
    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) updates[dbField] = body[key];
    }
    updates.updated_at = new Date().toISOString();
    await repo.upsert('tasks', updates);
    res.json({ success: true, updatedAt: updates.updated_at });
  } catch (err) {
    console.error('[Tasks] Failed to update task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const old = await repo.getById('tasks', id);
    if (!old) return res.status(404).json({ error: 'Task not found' });
    await repo.softDelete('tasks', id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Tasks] Failed to delete task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
