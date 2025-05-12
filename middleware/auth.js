const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function(req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  
  // Check if no auth header
  if (!authHeader) {
    console.log('No Authorization header found');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  
  // Format should be "Bearer [token]"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.log('Authorization header format invalid:', authHeader);
    return res.status(401).json({ message: 'Token format invalid' });
  }
  
  const token = parts[1];
  
  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Make sure decoded.user exists and has uid
    if (!decoded.user || !decoded.user.uid) {
      console.error('Token payload missing user or uid:', decoded);
      return res.status(401).json({ message: 'Invalid token payload' });
    }
    
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ message: 'Token is not valid' });
  }
}; 