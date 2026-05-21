const express = require('express');
const db = require('../db');

const router = express.Router();

// Helper to get io instance
function getIO(req) {
  return req.app.get('io');
}

// Create task
router.post('/', (req, res) => {
  const { title, description } = req.body;
  const userId = req.user.userId || req.user.id; // JWT payload
  if (!title) return res.status(400).json({ message: 'Title required' });
  const stmt = db.prepare('INSERT INTO tasks (user_id, title, description) VALUES (?, ?, ?)');
  stmt.run(userId, title, description || '', function(err) {
    if (err) return res.status(500).json({ message: err.message });
    const newTask = { id: this.lastID, user_id: userId, title, description, completed: 0 };
    getIO(req).to(`user_${userId}`).emit('taskCreated', newTask);
    res.status(201).json(newTask);
  });
});

// Read all tasks for user
router.get('/', (req, res) => {
  const userId = req.user.userId || req.user.id;
  db.all('SELECT * FROM tasks WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// Update task
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, completed } = req.body;
  const userId = req.user.userId || req.user.id;
  const stmt = db.prepare('UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  stmt.run(title, description, completed ? 1 : 0, id, userId, function(err) {
    if (err) return res.status(500).json({ message: err.message });
    if (this.changes === 0) return res.status(404).json({ message: 'Task not found' });
    const updatedTask = { id: Number(id), user_id: userId, title, description, completed: completed ? 1 : 0 };
    getIO(req).to(`user_${userId}`).emit('taskUpdated', updatedTask);
    res.json(updatedTask);
  });
});

// Delete task
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId || req.user.id;
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
  stmt.run(id, userId, function(err) {
    if (err) return res.status(500).json({ message: err.message });
    if (this.changes === 0) return res.status(404).json({ message: 'Task not found' });
    getIO(req).to(`user_${userId}`).emit('taskDeleted', { id: Number(id) });
    res.json({ success: true });
  });
});

module.exports = router;
