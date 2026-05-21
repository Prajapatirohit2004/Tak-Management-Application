const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const authMiddleware = require('./server/middleware/auth');
const authRoutes = require('./server/routes/auth');
const taskRoutes = require('./server/routes/tasks');
const db = require('./server/db');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', authMiddleware, taskRoutes);

// Serve static client files
app.use(express.static('client'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach io to request for routes to emit events
app.set('io', io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
