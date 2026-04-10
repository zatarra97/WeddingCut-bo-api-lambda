import { Request, Response, NextFunction } from "express";

export interface HttpError extends Error {
  statusCode?: number;
  status?: number;
}

export function createHttpError(statusCode: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.statusCode || err.status || 500;
  const message = status === 500 ? "Errore interno del server" : err.message;

  if (status === 500) {
    console.error("Unhandled error:", err);
  }

  res.status(status).json({
    error: { statusCode: status, message },
  });
}
