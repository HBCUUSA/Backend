const express = require('express');
const cors = require('cors');
const programsRoutes = require('./routes/programs');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const contributionsRoutes = require('./routes/contributions');
const adminRoutes = require('./routes/admin');
const testimonialsRoutes = require('./routes/testimonials');
const resumeRoutes = require('./routes/resume');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://hbcu-f064b.web.app'], // Your frontend URL
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/programs', programsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/contributions', contributionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/resume', resumeRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 