const dotenv = require('dotenv');
dotenv.config();

const cors = require('cors');
const express = require('express');

const helmet = require('helmet');
const morgan = require('morgan');


// Import routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const challengeRoutes = require('./routes/challenges');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const aiVerificationRoutes = require('./routes/ai-verification');
const helperRoutes = require('./routes/helpers');
const gameRoutes = require('./routes/games');
const stripeRoutes = require('./routes/stripe');
const userRoutes = require('./routes/users');
const tournamentRoutes = require('./routes/tournaments');
const tournamentTypesRoutes = require('./routes/tournament-types');

// Load environment variables


const app = express();
const PORT = process.env.PORT || 5072;

// Security middleware
// app.use(helmet()); // Temporarily disabled for CORS debugging

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:5072',
      'http://localhost:5173',
      'https://gamingappfrontend-3.onrender.com',
      'https://cyber-duel-grid.onrender.com',
      'https://gamingappfrontend.onrender.com',
      'https://gamingappfrontend-2.onrender.com'
    ];
    
    console.log('🌐 CORS: Request origin:', origin);
    console.log('🌐 CORS: Allowed origins:', allowedOrigins);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS: Origin allowed');
      callback(null, true);
    } else {
      console.log('❌ CORS: Origin blocked:', origin);
      // Temporarily allow all origins for debugging
      console.log('🔧 CORS: Allowing origin for debugging');
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test CORS endpoint
app.get('/test-cors', (req, res) => {
  console.log('🧪 Test CORS endpoint hit');
  console.log('🧪 Origin:', req.headers.origin);
  res.status(200).json({
    success: true,
    message: 'CORS test successful',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/ai-verification', aiVerificationRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/helpers', helperRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/tournament-types', tournamentTypesRoutes);

// Debug: Log registered routes
// console.log('🔗 Registered API routes:');
// console.log('  - /api/auth');
// console.log('  - /api/upload');
// console.log('  - /api/challenges');
// console.log('  - /api/admin');
// console.log('  - /api/wallet');
// console.log('  - /api/ai-verification');
// console.log('  - /api/challenges/test (GET)');
// console.log('  - /api/challenges/submit-proof (POST)');
// console.log('  - /api/challenges/dispute (POST)');

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  // console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  // console.log(`🧪 CORS test: http://localhost:${PORT}/test-cors`);
  // console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
  // console.log(`📤 Upload API: http://localhost:${PORT}/api/upload`);
});

module.exports = app;
