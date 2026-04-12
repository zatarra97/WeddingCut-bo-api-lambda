import { Router, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket } from "mysql2/promise";

const router = Router();

// GET /admin/orders
router.get(
  "/admin/orders",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      let sql = `
        SELECT o.*,
          (SELECT COUNT(*) FROM order_entries oe WHERE oe.orderId = o.id) AS entryCount,
          (SELECT oe2.coupleName FROM order_entries oe2 WHERE oe2.orderId = o.id ORDER BY oe2.sortOrder LIMIT 1) AS primaryCoupleName
        FROM orders o
        WHERE 1=1
      `;
      const params: any[] = [];

      if (req.query.status) {
        sql += " AND o.status = ?";
        params.push(req.query.status);
      }
      if (req.query.userEmail) {
        sql += " AND o.userEmail LIKE ?";
        params.push(`%${req.query.userEmail}%`);
      }

      sql += " ORDER BY o.createdAt DESC";

      if (req.query.limit) {
        sql += " LIMIT ?";
        params.push(Number(req.query.limit));
      }
      if (req.query.skip) {
        sql += " OFFSET ?";
        params.push(Number(req.query.skip));
      }

      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/orders/:publicId
router.get(
  "/admin/orders/:publicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) {
        throw createHttpError(404, "Ordine non trovato.");
      }
      const [entries] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM order_entries WHERE orderId = ? ORDER BY sortOrder",
        [rows[0].id]
      );
      res.json({ ...rows[0], entries });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /admin/orders/:publicId
router.patch(
  "/admin/orders/:publicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) {
        throw createHttpError(404, "Ordine non trovato.");
      }

      const body = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(body)) {
        if (key === "id" || key === "publicId" || key === "createdAt" || key === "entries") continue;
        sets.push(`\`${key}\` = ?`);
        vals.push(key === "selectedServices" ? JSON.stringify(value) : value);
      }
      if (!sets.length) {
        res.status(204).send();
        return;
      }
      vals.push(rows[0].id);
      await pool.execute(
        `UPDATE orders SET ${sets.join(", ")} WHERE id = ?`,
        vals
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /admin/orders/:publicId
router.delete(
  "/admin/orders/:publicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) {
        throw createHttpError(404, "Ordine non trovato.");
      }
      await pool.execute("DELETE FROM orders WHERE id = ?", [rows[0].id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
