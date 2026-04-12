import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest } from "../types";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

function normalizeWeddingDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw createHttpError(400, "weddingDate deve essere una stringa nel formato YYYY-MM-DD.");
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    throw createHttpError(400, "weddingDate non valida. Usa il formato YYYY-MM-DD.");
  }
  return parsed.toISOString().slice(0, 10);
}

// POST /user/orders
router.post(
  "/user/orders",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const body = req.body;
      const pool = getPool();

      // Determina se è un ordine batch (entries[] con almeno 2 elementi)
      const rawEntries: { coupleName: string; weddingDate: string }[] = Array.isArray(body.entries) && body.entries.length > 0
        ? body.entries
        : [{ coupleName: body.coupleName, weddingDate: body.weddingDate }];

      const isBatch = rawEntries.length > 1 ? 1 : 0;

      // Prima entry come "primaria" per retrocompatibilità
      const primaryEntry = rawEntries[0];
      const weddingDate = normalizeWeddingDate(primaryEntry.weddingDate);
      const publicId = randomUUID();

      const fields: Record<string, any> = {
        publicId,
        userEmail: email,
        isBatch,
        coupleName: primaryEntry.coupleName,
        weddingDate,
        deliveryMethod: body.deliveryMethod || null,
        materialLink: body.materialLink || null,
        materialSizeGb: body.materialSizeGb,
        cameraCount: body.cameraCount || null,
        generalNotes: body.generalNotes || null,
        referenceVideo: body.referenceVideo || null,
        exportFps: body.exportFps || null,
        exportBitrate: body.exportBitrate || null,
        exportAspect: body.exportAspect || null,
        exportResolution: body.exportResolution || null,
        selectedServices: body.selectedServices ? JSON.stringify(body.selectedServices) : null,
        servicesTotal: body.servicesTotal || null,
        cameraSurcharge: body.cameraSurcharge || 0,
        totalPrice: body.totalPrice || null,
        status: "pending",
        desiredDeliveryDate: body.desiredDeliveryDate || null,
      };

      const cols = Object.keys(fields);
      const vals = Object.values(fields);
      const placeholders = cols.map(() => "?").join(", ");

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders})`,
        vals
      );

      const orderId = result.insertId;

      // Crea le entries per ogni matrimonio
      for (let i = 0; i < rawEntries.length; i++) {
        const entry = rawEntries[i];
        const entryDate = normalizeWeddingDate(entry.weddingDate);
        await pool.execute(
          `INSERT INTO order_entries (publicId, orderId, coupleName, weddingDate, status, sortOrder)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
          [randomUUID(), orderId, entry.coupleName, entryDate, i]
        );
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.*,
           (SELECT COUNT(*) FROM order_entries oe WHERE oe.orderId = o.id) AS entryCount
         FROM orders o WHERE o.id = ?`,
        [orderId]
      );
      const [entries] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM order_entries WHERE orderId = ? ORDER BY sortOrder",
        [orderId]
      );
      res.status(201).json({ ...rows[0], entries });
    } catch (err) {
      next(err);
    }
  }
);

// GET /user/orders
router.get(
  "/user/orders",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();

      let sql = `
        SELECT o.*,
          (SELECT COUNT(*) FROM order_entries oe WHERE oe.orderId = o.id) AS entryCount,
          (SELECT oe2.coupleName FROM order_entries oe2 WHERE oe2.orderId = o.id ORDER BY oe2.sortOrder LIMIT 1) AS primaryCoupleName
        FROM orders o
        WHERE o.userEmail = ?
        ORDER BY o.createdAt DESC
      `;
      const params: any[] = [email];

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

// GET /user/orders/:publicId
router.get(
  "/user/orders/:publicId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) {
        throw createHttpError(404, "Ordine non trovato.");
      }
      if (rows[0].userEmail !== email) {
        throw createHttpError(403, "Accesso negato.");
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

export default router;
