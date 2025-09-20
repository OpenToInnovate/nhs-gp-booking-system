import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../config/logger';

export interface JWTPayload {
  sub: string; // NHS number or user ID
  role: string;
  org: string; // Organization code
  exp: number;
  iat: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      userId?: string;
      userRole?: string;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', { 
      path: req.path,
      ip: req.ip 
    });
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = decoded;
    req.userId = decoded.sub;
    req.userRole = decoded.role;
    
    logger.info('Authentication successful', { 
      userId: decoded.sub,
      role: decoded.role,
      org: decoded.org,
      path: req.path
    });
    
    next();
  } catch (error) {
    logger.warn('Authentication failed: Invalid token', { 
      path: req.path,
      ip: req.ip,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

export const requireRole = (requiredRole: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient permissions', { 
        userId: req.user.sub,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path
      });
      
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
};

export const generateToken = (payload: Omit<JWTPayload, 'exp' | 'iat'>): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(
    payload,
    jwtSecret,
    { 
      expiresIn: '8h',
      issuer: 'nhs-booking-api',
      audience: 'nhs-booking-client'
    }
  );
};

export default authenticateToken;
