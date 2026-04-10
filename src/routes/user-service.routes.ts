import { Router, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { getPool } from "../db/pool";
import { RowDataPacket } from "mysql2/promise";

const router = Router();

// GET /user/services — lista servizi pubblici
router.get(
  "/user/services",
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT publicId, name, description, orientation,
                priceVertical, priceHorizontal, priceBoth,
                durationDescription, minDuration, maxDuration
         FROM services
         WHERE publicId IS NOT NULL`
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
