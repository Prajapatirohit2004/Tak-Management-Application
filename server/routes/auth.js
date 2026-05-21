const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    stmt.run(username, hash, function(err) {
      if (err) return res.status(500).json({ message: 'User registration failed', error: err.message });
      const token = jwt.sign({ userId: this.lastID }, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });
      res.json({ token });
    });
  } catch (e) {
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err.message });
    if (!row) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: row.id }, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });
    res.json({ token });
  });
});

module.exports = router;
