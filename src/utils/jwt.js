const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const generateToken = (payload) => {
  const secret = JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
};

const generateRefreshToken = (payload) => {
  const secret = JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '30d' });
};

const verifyToken = (token) => {
  try {
    const secret = JWT_SECRET;
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken
};
