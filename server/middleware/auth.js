const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET || 'supersecretkey';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  jwt.verify(token, secret, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user; // payload contains at least { id }
    next();
  });
}

module.exports = authMiddleware;
