import { Request } from 'express';

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: [number, number];
    }
  }
} 