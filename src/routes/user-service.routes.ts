import { Router, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { getPool } from "../db/pool";
import { RowDataPacket } from "mysql2/promise";

const router = Router();

function parseRow(row: RowDataPacket): RowDataPacket {
  if (typeof row.priceTiers === "string") {
    try { row.priceTiers = JSON.parse(row.priceTiers); } catch { /* lascia stringa */ }
  }
  if (typeof row.options === "string") {
    try { row.options = JSON.parse(row.options); } catch { /* lascia stringa */ }
  }
  if (row.basePrice != null)       row.basePrice       = Number(row.basePrice);
  if (row.percentageValue != null) row.percentageValue = Number(row.percentageValue);
  if (Array.isArray(row.priceTiers)) {
    row.priceTiers = row.priceTiers.map((t: any) => ({ ...t, price: Number(t.price) }));
  }
  if (Array.isArray(row.options)) {
    row.options = row.options.map((o: any) => ({ ...o, price: Number(o.price) }));
  }
  return row;
}

// GET /user/services — lista servizi attivi ordinati per sortOrder
router.get(
  "/user/services",
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      let rows: RowDataPacket[];

      // Prova con la colonna options (disponibile dopo la migration ALTER TABLE)
      try {
        [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT publicId, name, description, durationDescription,
                  category, pricingType, basePrice, percentageValue,
                  priceTiers, restrictedToService, sortOrder, discountRole, options
           FROM services
           WHERE isActive = 1
           ORDER BY sortOrder ASC`
        );
      } catch {
        // Fallback: colonna options non ancora presente nel DB
        [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT publicId, name, description, durationDescription,
                  category, pricingType, basePrice, percentageValue,
                  priceTiers, restrictedToService, sortOrder, discountRole
           FROM services
           WHERE isActive = 1
           ORDER BY sortOrder ASC`
        );
      }

      res.json(rows.map(parseRow));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
