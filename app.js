/*
  Combined Task Management Application (single‑file server)
  - Express server with CORS
  - SQLite DB (users, tasks)
  - JWT auth middleware
  - Auth routes (register, login)
  - Task CRUD routes (protected)
  - Socket.io for real‑time updates
  - Serves static client files from ./client
*/

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ----- Config -----
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const PORT = process.env.PORT || 3000;

// ----- Database Setup -----
const dbPath = path.resolve(__dirname, 'server', 'data', 'tasks.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const db = new sqlite3.Database(dbPath, err => {
  if (err) console.error('Failed to connect to DB', err);
  else console.log('Connected to SQLite DB');
});

const initSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  completed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

db.exec(initSql, err => {
  if (err) console.error('Failed to init tables', err);
  else console.log('Database tables ready');
});

// ----- JWT Auth Middleware -----
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user; // payload contains at least { id }
    next();
  });
}

// ----- Auth Routes -----
const authRouter = express.Router();

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  const saltRounds = 10;
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) return res.status(500).json({ message: 'Hashing error' });
    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.run(sql, [username, hash], function (err) {
      if (err) return res.status(400).json({ message: err.message });
      const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token });
    });
  });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  const sql = 'SELECT * FROM users WHERE username = ?';
  db.get(sql, [username], (err, user) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    bcrypt.compare(password, user.password, (err, ok) => {
      if (err) return res.status(500).json({ message: 'Comparison error' });
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token });
    });
  });
});

// ----- Task Routes -----
const taskRouter = express.Router();

// Get all tasks for logged‑in user
taskRouter.get('/', (req, res) => {
  const sql = 'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC';
  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// Create task
taskRouter.post('/', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required' });
  const sql = 'INSERT INTO tasks (user_id, title, description) VALUES (?, ?, ?)';
  db.run(sql, [req.user.id, title, description || null], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    const newTask = { id: this.lastID, user_id: req.user.id, title, description, completed: 0 };
    // Emit real‑time event
    const io = req.app.get('io');
    io.emit('taskCreated', newTask);
    res.status(201).json(newTask);
  });
});

// Update task
taskRouter.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, completed } = req.body;
  const sql = `UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`;
  db.run(sql, [title, description, completed ? 1 : 0, id, req.user.id], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    if (this.changes === 0) return res.status(404).json({ message: 'Task not found' });
    const io = req.app.get('io');
    io.emit('taskUpdated', { id: Number(id), title, description, completed });
    res.json({ message: 'Updated' });
  });
});

// Delete task
taskRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM tasks WHERE id = ? AND user_id = ?';
  db.run(sql, [id, req.user.id], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    if (this.changes === 0) return res.status(404).json({ message: 'Task not found' });
    const io = req.app.get('io');
    io.emit('taskDeleted', { id: Number(id) });
    res.json({ message: 'Deleted' });
  });
});

// ----- Express App Setup -----
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/tasks', authMiddleware, taskRouter);
app.use(express.static(path.join(__dirname, 'client'))); // serve UI

// ----- HTTP + Socket.io -----
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);

io.on('connection', socket => {
  console.log('Socket client connected');
  // optional: you could authenticate socket here if desired
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
