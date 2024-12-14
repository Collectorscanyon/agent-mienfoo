import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Request timer middleware
export function requestTimer(req: Request, res: Response, next: NextFunction) {
    // Add request ID and start time
    req.requestId = generateRequestId();
    req.startTime = process.hrtime();

    // Log request
    console.log({
        type: 'request_start',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString()
    });

    // Track response
    res.on('finish', () => {
        const duration = calculateDuration(req.startTime!);
        
        console.log({
            type: 'request_complete',
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration,
            timestamp: new Date().toISOString()
        });
    });

    next();
}

// Rate limiting middleware
export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: {
        status: 'error',
        message: 'Too many requests. Please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Error handling middleware
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    console.error({
        type: 'error',
        requestId: req.requestId,
        error: {
            message: err.message,
            stack: err.stack,
            name: err.name
        },
        timestamp: new Date().toISOString()
    });

    res.status(500).json({
        status: 'error',
        message: 'An internal server error occurred',
        requestId: req.requestId
    });
}

// Helper functions
function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateDuration(startTime: [number, number]): string {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    return (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
} 