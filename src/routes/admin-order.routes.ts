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
      const orderId = rows[0].id;

      // Azioni esplicite state machine
      if (body.action === "accept_quote") {
        const updates: string[] = ["status = 'quote_ready'"];
        const aVals: any[] = [];
        if (body.proposedTotalPrice !== undefined) { updates.push("proposedTotalPrice = ?"); aVals.push(body.proposedTotalPrice); }
        if (body.desiredDeliveryDate !== undefined) { updates.push("desiredDeliveryDate = ?"); aVals.push(body.desiredDeliveryDate || null); }
        aVals.push(orderId);
        await pool.execute(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`, aVals);
        res.status(204).send();
        return;
      }

      if (body.action === "upload_invoice") {
        if (!body.invoiceLink) throw createHttpError(400, "invoiceLink obbligatorio.");
        await pool.execute(
          "UPDATE orders SET status = 'awaiting_payment', invoiceLink = ? WHERE id = ?",
          [body.invoiceLink, orderId]
        );
        res.status(204).send();
        return;
      }

      if (body.action === "confirm_payment") {
        await pool.execute("UPDATE orders SET status = 'completed' WHERE id = ?", [orderId]);
        await pool.execute("UPDATE order_entries SET status = 'completed' WHERE orderId = ? AND status != 'cancelled'", [orderId]);
        res.status(204).send();
        return;
      }

      // PATCH generico (campi diretti)
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(body)) {
        if (key === "id" || key === "publicId" || key === "createdAt" || key === "entries" || key === "action") continue;
        sets.push(`\`${key}\` = ?`);
        vals.push(key === "selectedServices" ? JSON.stringify(value) : value);
      }
      if (!sets.length) {
        res.status(204).send();
        return;
      }
      vals.push(orderId);
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
