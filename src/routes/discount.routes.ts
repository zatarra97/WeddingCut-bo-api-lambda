import { Router, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { RowDataPacket } from "mysql2/promise";

const router = Router();

function parsePackageRow(row: RowDataPacket): RowDataPacket {
  const jsonFields = ["requiredRoles", "requiredRolesAnyOf", "discounts"];
  for (const field of jsonFields) {
    if (typeof row[field] === "string") {
      try { row[field] = JSON.parse(row[field]); } catch { /* lascia stringa */ }
    }
  }
  return row;
}

// GET /user/discount-config — pubblico (no auth aggiuntiva oltre authMiddleware globale)
router.get(
  "/user/discount-config",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [tiers] = await pool.execute<RowDataPacket[]>(
        "SELECT id, minUnits, maxUnits, discountPct, sortOrder, isActive FROM discount_quantity_tiers WHERE isActive = 1 ORDER BY sortOrder"
      );
      const [pkgs] = await pool.execute<RowDataPacket[]>(
        "SELECT id, name, requiredRoles, requiredRolesAnyOf, discounts, unitCountIfApplied, isBonus, sortOrder, isActive FROM discount_packages WHERE isActive = 1 ORDER BY sortOrder"
      );
      res.json({ quantityTiers: tiers, packages: pkgs.map(parsePackageRow) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/discount/quantity-tiers
router.get(
  "/admin/discount/quantity-tiers",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM discount_quantity_tiers ORDER BY sortOrder"
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /admin/discount/quantity-tiers — rimpiazza l'intero array
router.put(
  "/admin/discount/quantity-tiers",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const tiers: Array<{ minUnits: number; maxUnits: number | null; discountPct: number; sortOrder: number; isActive: number }> = req.body;
      if (!Array.isArray(tiers)) {
        res.status(400).json({ message: "Body deve essere un array." });
        return;
      }
      await pool.execute("DELETE FROM discount_quantity_tiers");
      for (const t of tiers) {
        await pool.execute(
          "INSERT INTO discount_quantity_tiers (minUnits, maxUnits, discountPct, sortOrder, isActive) VALUES (?, ?, ?, ?, ?)",
          [t.minUnits, t.maxUnits ?? null, t.discountPct, t.sortOrder ?? 0, t.isActive ?? 1]
        );
      }
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM discount_quantity_tiers ORDER BY sortOrder"
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/discount/packages
router.get(
  "/admin/discount/packages",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM discount_packages ORDER BY sortOrder"
      );
      res.json(rows.map(parsePackageRow));
    } catch (err) {
      next(err);
    }
  }
);

// PUT /admin/discount/packages — rimpiazza l'intero array
router.put(
  "/admin/discount/packages",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const pkgs: Array<{
        name: string;
        requiredRoles: string[];
        requiredRolesAnyOf?: string[] | null;
        discounts: Array<{ targetRole?: string; targetCategory?: string; type: string; value: number }>;
        unitCountIfApplied?: number | null;
        isBonus: number;
        sortOrder: number;
        isActive: number;
      }> = req.body;
      if (!Array.isArray(pkgs)) {
        res.status(400).json({ message: "Body deve essere un array." });
        return;
      }
      await pool.execute("DELETE FROM discount_packages");
      for (const p of pkgs) {
        await pool.execute(
          "INSERT INTO discount_packages (name, requiredRoles, requiredRolesAnyOf, discounts, unitCountIfApplied, isBonus, sortOrder, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            p.name,
            JSON.stringify(p.requiredRoles ?? []),
            p.requiredRolesAnyOf != null ? JSON.stringify(p.requiredRolesAnyOf) : null,
            JSON.stringify(p.discounts ?? []),
            p.unitCountIfApplied ?? null,
            p.isBonus ?? 0,
            p.sortOrder ?? 0,
            p.isActive ?? 1,
          ]
        );
      }
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM discount_packages ORDER BY sortOrder"
      );
      res.json(rows.map(parsePackageRow));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
