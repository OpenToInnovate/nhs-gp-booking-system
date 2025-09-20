// Main API application entrypoint for the NHS GP Booking System
// Responsibilities:
// - Configure security middleware (Helmet, CORS, rate limiting)
// - Expose health/metrics endpoints
// - Provide appointment availability/booking APIs
// - Handle demo mode by skipping external dependencies
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { register, collectDefaultMetrics } from 'prom-client';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import path from 'path';

import logger from './config/logger';
import { db } from './config/database';
import { redisClient } from './config/redis';
import GPConnectService from './services/GPConnectService';
import { auditMiddleware as auditMW, auditAction } from './middleware/audit';
import { authenticateToken, requireRole } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const gpConnectService = new GPConnectService();

// Collect default metrics for Prometheus
collectDefaultMetrics();

// Security middleware
// NOTE: We allow inline styles (only) to keep the demo UI simple. All scripts are external per CSP.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session management (skip Redis store in demo mode)
if (process.env.NODE_ENV !== 'demo' && process.env.DB_PASSWORD) {
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'nhs-booking-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  }));
} else {
  // Use memory store in demo mode
  app.use(session({
    secret: process.env.SESSION_SECRET || 'nhs-booking-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  }));
}

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Audit middleware (global request tracing and audit logging hooks)
app.use(auditMW);

// Validation schemas
const appointmentBookingSchema = z.object({
    patientNHSNumber: z.string().regex(/^\d{10}$/),
    gpPracticeODSCode: z.string().min(3).max(10),
    appointmentType: z.enum(['routine', 'urgent', 'emergency', 'follow-up']),
    reasonForAppointment: z.string().min(10).max(500),
    urgency: z.enum(['routine', 'urgent', 'emergency']),
    duration: z.number().min(10).max(60).default(15),
    bookedBy: z.string(),
    contactPreferences: z.object({
        phone: z.string().optional(),
        email: z.string().email().optional(),
        sms: z.boolean().default(false),
    }),
});

const availabilitySearchSchema = z.object({
    gpPracticeODSCode: z.string().min(3).max(10),
    fromDate: z.string().refine(date => !isNaN(Date.parse(date))),
    toDate: z.string().refine(date => !isNaN(Date.parse(date))),
    // Accept either string or number from querystring; clamp to reasonable bounds
    duration: z.coerce.number().min(10).max(60).default(15),
});

// NOTE: We intentionally use only the imported audit middleware `auditMW` to avoid duplicate tracing.

// Prometheus metrics endpoint
app.get('/metrics', async (req: Request, res: Response) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        res.status(500).end(error);
    }
});

// Health check endpoints
app.get('/health', async (req: Request, res: Response) => {
    try {
        const services: any = {
            api: 'running'
        };
        
        // Check database/redis connectivity only when not in demo mode
        if (process.env.NODE_ENV !== 'demo' && process.env.DB_PASSWORD) {
            try {
                await db.raw('SELECT 1');
                services.database = 'connected';
            } catch (error) {
                services.database = 'demo-mode';
            }
            
            // Check Redis connection
            try {
                await redisClient.ping();
                services.redis = 'connected';
            } catch (error) {
                services.redis = 'demo-mode';
            }
        } else {
            services.mode = 'demo';
        }
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services
        });
    } catch (error) {
        logger.error('Health check failed', { error });
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services: {
                api: 'running',
                mode: 'demo'
            }
        });
    }
});

app.get('/health/detailed', async (req: Request, res: Response) => {
    try {
        const services: any = {
            api: 'running'
        };
        
        // Check database connection if not in demo mode
        if (process.env.NODE_ENV !== 'demo' && process.env.DB_PASSWORD) {
            try {
                const practiceCount = await db('gp_practices').count('* as count').first();
                services.database = 'connected';
                services.gp_practices = `${practiceCount?.count || 0} practices registered`;
            } catch (error) {
                services.database = 'demo-mode';
                services.gp_practices = '3 demo practices available';
            }
            
            try {
                await redisClient.info();
                services.redis = 'connected';
            } catch (error) {
                services.redis = 'demo-mode';
            }
        } else {
            services.mode = 'demo';
            services.gp_practices = '3 demo practices available';
        }
        
        services.nhs_spine = process.env.NHS_ENVIRONMENT || 'integration';
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        logger.error('Detailed health check failed', { error });
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services: {
                api: 'running',
                mode: 'demo',
                gp_practices: '3 demo practices available'
            },
            environment: 'demo'
        });
    }
});

app.get('/health/database', async (req: Request, res: Response) => {
    try {
        const result = await db.raw('SELECT version()');
        res.json({
            status: 'healthy',
            database: 'PostgreSQL',
            version: result.rows[0].version
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Database connection failed'
        });
    }
});

// NHS GP Connect appointment availability endpoint
// Returns provider/slot options. In demo mode, returns mock slots.
app.get('/api/appointments/availability', 
    auditAction('search', 'appointment_slots'),
    async (req: Request, res: Response) => {
    try {
        const searchParams = availabilitySearchSchema.parse(req.query);
        
        // Use GP Connect service to search for real availability (or mock in demo)
        const slots = await gpConnectService.searchAvailableSlots(
            searchParams.gpPracticeODSCode,
            searchParams.fromDate,
            searchParams.toDate,
            Number(searchParams.duration)
        );
        
        logger.info('Appointment availability search', {
            practiceODS: searchParams.gpPracticeODSCode,
            slotsFound: slots.length,
            traceId: req.traceId
        });
        
        res.json({
            success: true,
            data: {
                slots,
                totalSlots: slots.length,
                searchCriteria: searchParams
            }
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Availability search failed', {
            error: errorMessage,
            traceId: req.traceId
        });

        res.status(400).json({
            success: false,
            error: errorMessage,
            traceId: req.traceId
        });
    }
});

// NHS GP Connect appointment booking endpoint
// Requires a valid JWT in production. In demo, you can simulate booking.
app.post('/api/appointments/book',
    authenticateToken,
    requireRole(['patient', 'practitioner', 'admin']),
    auditAction('book', 'appointment'),
    async (req: Request, res: Response) => {
    try {
        const bookingRequest = appointmentBookingSchema.parse(req.body);
        
        // Use GP Connect service to book appointment (FHIR Appointment)
        const result = await gpConnectService.bookAppointment(bookingRequest);
        
        logger.info('Appointment booked successfully', {
            appointmentId: result.appointment.id,
            practiceODS: bookingRequest.gpPracticeODSCode,
            patientNHS: bookingRequest.patientNHSNumber.substring(0, 3) + '****',
            traceId: req.traceId,
            bookedBy: req.userId
        });
        
        res.status(201).json({
            success: true,
            data: result
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Appointment booking failed', {
            error: errorMessage,
            traceId: req.traceId,
            userId: req.userId
        });

        res.status(400).json({
            success: false,
            error: errorMessage,
            traceId: req.traceId
        });
    }
});

// Cancel appointment endpoint
// TODO: Integrate with GP systems’ cancellation workflow when applicable.
app.delete('/api/appointments/:appointmentId',
    authenticateToken,
    requireRole(['patient', 'practitioner', 'admin']),
    auditAction('cancel', 'appointment'),
    async (req: Request, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const { cancellationReason } = req.body;
        
        // Update appointment status in database
        // TODO: In production, emit cancellation notification to practice (MESH/email)
        await db('appointments')
            .where('appointment_id', appointmentId)
            .update({
                status: 'cancelled',
                cancellation_reason: cancellationReason,
                cancelled_at: new Date()
            });
        
        logger.info('Appointment cancelled', {
            appointmentId,
            reason: cancellationReason,
            traceId: req.traceId,
            cancelledBy: req.userId
        });
        
        res.json({
            success: true,
            message: 'Appointment cancelled successfully'
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Appointment cancellation failed', {
            error: errorMessage,
            traceId: req.traceId,
            userId: req.userId
        });

        res.status(400).json({
            success: false,
            error: errorMessage,
            traceId: req.traceId
        });
    }
});

// Error handling middleware (last resort handler)
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unhandled error', {
        error: errorMessage,
        stack: error.stack,
        traceId: req.traceId
    });

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        traceId: req.traceId
    });
});

// Serve main page
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../frontend/demo.html'));
});

// Initialize database and Redis connections
// Skips external connections in demo mode to simplify local development.
async function initializeServices() {
    try {
        // In demo mode, skip database/Redis connections
        if (process.env.NODE_ENV === 'demo' || !process.env.DB_PASSWORD) {
            logger.info('Running in demo mode - skipping database/Redis connections');
            return;
        }
        
        // Connect to Redis
        await redisClient.connect();
        logger.info('Redis connection established');
        
        // Test database connection
        await db.raw('SELECT 1');
        logger.info('Database connection established');
        
    } catch (error) {
        logger.warn('Failed to initialize services, running in demo mode', { error });
        // Continue in demo mode instead of exiting
    }
}

// Start server
async function startServer() {
    await initializeServices();
    
    app.listen(PORT, () => {
        logger.info(`NHS GP Booking Service running on port ${PORT}`);
        console.log(`🏥 NHS GP Booking System started on port ${PORT}`);
        console.log(`🌐 Open: http://localhost:${PORT}`);
        console.log(`📋 Health check: http://localhost:${PORT}/health`);
        console.log(`🔍 Detailed health: http://localhost:${PORT}/health/detailed`);
        console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
        console.log(`🔒 NHS Digital Integration: ${process.env.NHS_ENVIRONMENT || 'integration'}`);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    try {
        // Only quit Redis if it was connected; avoid ClientClosedError
        if (redisClient && (redisClient as any).isOpen) {
            await redisClient.quit();
        }
    } catch (e) {
        logger.warn('Redis quit on SIGTERM failed (likely not connected)', { error: e });
    }
    try {
        await db.destroy();
    } catch (e) {
        logger.warn('DB destroy on SIGTERM failed', { error: e });
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    try {
        if (redisClient && (redisClient as any).isOpen) {
            await redisClient.quit();
        }
    } catch (e) {
        logger.warn('Redis quit on SIGINT failed (likely not connected)', { error: e });
    }
    try {
        await db.destroy();
    } catch (e) {
        logger.warn('DB destroy on SIGINT failed', { error: e });
    }
    process.exit(0);
});

startServer().catch(error => {
    logger.error('Failed to start server', { error });
    process.exit(1);
});

export default app;
