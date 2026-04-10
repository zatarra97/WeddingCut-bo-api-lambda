import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Accesso riservato agli amministratori" });
    return;
  }
  next();
}
