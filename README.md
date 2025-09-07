# Cyber Duel Grid Backend

A Node.js/Express backend server for the Cyber Duel Grid gaming platform.

## Features

- User authentication with Firebase and JWT
- User registration and profile management
- Secure API endpoints with middleware protection
- Firebase Firestore integration for data storage
- CORS configuration for frontend integration
- Security middleware with Helmet
- Request logging with Morgan

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Firestore database
- Firebase Admin SDK service account key

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:8080,https://cyber-duel-grid.vercel.app
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## API Endpoints

### Authentication Routes (`/api/auth`)

#### Public Routes
- `POST /register` - User registration
- `POST /login` - User login with Firebase
- `POST /refresh-token` - Refresh JWT token

#### Protected Routes (require authentication)
- `GET /profile` - Get current user profile
- `PUT /profile` - Update user profile

## Project Structure

```
src/
├── config/
│   └── firebase.js          # Firebase configuration
├── controllers/
│   └── authController.js    # Authentication logic
├── middleware/
│   └── auth.js             # JWT authentication middleware
├── routes/
│   └── auth.js             # Authentication routes
├── services/
│   └── userService.js      # User business logic
├── utils/
│   └── jwt.js              # JWT utility functions
└── index.js                 # Main server file
```

## Environment Variables

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)
- `JWT_SECRET`: Secret key for JWT signing
- `JWT_EXPIRES_IN`: JWT token expiration time
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase service account JSON
- `FIREBASE_DATABASE_URL`: Firebase database URL
- `CORS_ORIGIN`: Allowed CORS origins

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Helmet security headers
- Input validation and sanitization
- Rate limiting (can be added)

## Development

The server uses nodemon for automatic restarting during development. Any changes to the source files will automatically restart the server.
