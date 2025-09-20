import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import logger from '../config/logger';

export interface AuditLog {
  user_id: string;
  user_role?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  patient_nhs_number?: string;
  practice_ods_code?: string;
  justification?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  trace_id: string;
  outcome: 'success' | 'failure';
  error_message?: string;
}

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      userId?: string;
      userRole?: string;
    }
  }
}

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const traceId = uuidv4();
  req.traceId = traceId;
  req.headers['x-trace-id'] = traceId;
  
  logger.info('API Request', {
    traceId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    userId: req.userId
  });
  
  next();
};

export const createAuditLog = async (auditData: Partial<AuditLog>): Promise<void> => {
  try {
    // In demo mode, just log the audit data instead of storing in database
    if (process.env.NODE_ENV === 'demo' || !process.env.DB_PASSWORD) {
      logger.info('Audit log (demo mode)', auditData);
      return;
    }
    
    await db('access_audit').insert({
      ...auditData,
      created_at: new Date()
    });
  } catch (error) {
    logger.error('Failed to create audit log', { auditData, error });
  }
};

export const auditAction = (action: string, resourceType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      const outcome = res.statusCode >= 400 ? 'failure' : 'success';
      const errorMessage = res.statusCode >= 400 ? data : undefined;
      
      createAuditLog({
        user_id: req.userId || 'anonymous',
        user_role: req.userRole,
        action,
        resource_type: resourceType,
        resource_id: req.params.id,
        patient_nhs_number: req.body?.patientNHSNumber,
        practice_ods_code: req.body?.gpPracticeODSCode || req.query?.gpPracticeODSCode as string,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        session_id: req.sessionID,
        trace_id: req.traceId || uuidv4(),
        outcome,
        error_message: errorMessage
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

export default auditMiddleware;
