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

function normalizeWeddingDateOptional(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
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
      // Ogni entry può portare la propria config servizi
      const rawEntries: Array<{
        coupleName: string; weddingDate: string;
        selectedServices?: any; deliveryMethod?: string; materialLink?: string;
        materialSizeGb?: number; cameraCount?: string;
        exportFps?: string; exportBitrate?: string; exportAspect?: string; exportResolution?: string;
        servicesTotal?: number; cameraSurcharge?: number; totalPrice?: number;
        generalNotes?: string | null; referenceVideo?: string | null;
        packageDiscountPct?: number | null; packageDiscountAmt?: number | null;
      }> = Array.isArray(body.entries) && body.entries.length > 0
        ? body.entries
        : [{
            coupleName: body.coupleName, weddingDate: body.weddingDate,
            selectedServices: body.selectedServices, deliveryMethod: body.deliveryMethod,
            materialLink: body.materialLink, materialSizeGb: body.materialSizeGb,
            cameraCount: body.cameraCount, exportFps: body.exportFps,
            exportBitrate: body.exportBitrate, exportAspect: body.exportAspect,
            exportResolution: body.exportResolution, servicesTotal: body.servicesTotal,
            cameraSurcharge: body.cameraSurcharge, totalPrice: body.totalPrice,
            generalNotes: body.generalNotes, referenceVideo: body.referenceVideo,
          }];

      const isBatch = rawEntries.length > 1 ? 1 : 0;
      const isDraft = body.isDraft === true;

      // Prima entry come "primaria" per retrocompatibilità colonne ordine padre
      const primaryEntry = rawEntries[0];
      const weddingDate = isDraft
        ? normalizeWeddingDateOptional(primaryEntry.weddingDate)
        : normalizeWeddingDate(primaryEntry.weddingDate);
      const publicId = randomUUID();

      // totalPrice ordine = somma dei totalPrice delle entries
      const orderTotalPrice = rawEntries.reduce((sum, e) => sum + (e.totalPrice || 0), 0);

      const fields: Record<string, any> = {
        publicId,
        userEmail: email,
        isBatch,
        coupleName: primaryEntry.coupleName,
        weddingDate,
        deliveryMethod: primaryEntry.deliveryMethod || null,
        materialLink: primaryEntry.materialLink || null,
        materialSizeGb: primaryEntry.materialSizeGb || null,
        cameraCount: primaryEntry.cameraCount || null,
        generalNotes: primaryEntry.generalNotes || null,
        referenceVideo: primaryEntry.referenceVideo || null,
        exportFps: primaryEntry.exportFps || null,
        exportBitrate: primaryEntry.exportBitrate || null,
        exportAspect: primaryEntry.exportAspect || null,
        exportResolution: primaryEntry.exportResolution || null,
        selectedServices: primaryEntry.selectedServices ? JSON.stringify(primaryEntry.selectedServices) : null,
        servicesTotal: primaryEntry.servicesTotal || null,
        cameraSurcharge: primaryEntry.cameraSurcharge || null,
        totalPrice: orderTotalPrice || null,
        quantityDiscountPct: body.quantityDiscountPct || null,
        quantityDiscountAmt: body.quantityDiscountAmt || null,
        quantityUnitCount: body.quantityUnitCount || null,
        status: isDraft ? "draft" : "pending",
      };

      const cols = Object.keys(fields);
      const vals = Object.values(fields);
      const placeholders = cols.map(() => "?").join(", ");

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders})`,
        vals
      );

      const orderId = result.insertId;

      // Crea le entries per ogni matrimonio con la propria config servizi
      for (let i = 0; i < rawEntries.length; i++) {
        const entry = rawEntries[i];
        const entryDate = isDraft
          ? normalizeWeddingDateOptional(entry.weddingDate)
          : normalizeWeddingDate(entry.weddingDate);
        await pool.execute(
          `INSERT INTO order_entries
             (publicId, orderId, coupleName, weddingDate, status, sortOrder,
              selectedServices, deliveryMethod, materialLink, materialSizeGb, cameraCount,
              exportFps, exportBitrate, exportAspect, exportResolution,
              servicesTotal, cameraSurcharge, packageDiscountPct, packageDiscountAmt, totalPrice,
              generalNotes, referenceVideo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(), orderId, entry.coupleName || null, entryDate, "pending", i,
            entry.selectedServices ? JSON.stringify(entry.selectedServices) : null,
            entry.deliveryMethod || null,
            entry.materialLink || null,
            entry.materialSizeGb || null,
            entry.cameraCount || null,
            entry.exportFps || null,
            entry.exportBitrate || null,
            entry.exportAspect || null,
            entry.exportResolution || null,
            entry.servicesTotal || null,
            entry.cameraSurcharge || null,
            entry.packageDiscountPct ?? null,
            entry.packageDiscountAmt ?? null,
            entry.totalPrice || null,
            entry.generalNotes || null,
            entry.referenceVideo || null,
          ]
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

// PATCH /user/orders/:publicId — azioni utente (submit, accept_quote, reject_quote)
router.patch(
  "/user/orders/:publicId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, status, userEmail FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) throw createHttpError(404, "Ordine non trovato.");
      if (rows[0].userEmail !== email) throw createHttpError(403, "Accesso negato.");

      const order = rows[0];
      const { action } = req.body;

      if (action === "submit") {
        if (order.status !== "draft") throw createHttpError(400, "Solo le bozze possono essere inviate.");
        // Valida campi obbligatori
        const [entryRows] = await pool.execute<RowDataPacket[]>(
          "SELECT coupleName, weddingDate FROM order_entries WHERE orderId = ?",
          [order.id]
        );
        for (const e of entryRows) {
          if (!e.coupleName) throw createHttpError(400, "Tutti i matrimoni devono avere un nome coppia.");
          if (!e.weddingDate) throw createHttpError(400, "Tutti i matrimoni devono avere una data.");
        }
        await pool.execute("UPDATE orders SET status = 'pending', coupleName = (SELECT coupleName FROM order_entries WHERE orderId = ? ORDER BY sortOrder LIMIT 1), weddingDate = (SELECT weddingDate FROM order_entries WHERE orderId = ? ORDER BY sortOrder LIMIT 1) WHERE id = ?", [order.id, order.id, order.id]);
      } else if (action === "accept_quote") {
        if (order.status !== "quote_ready") throw createHttpError(400, "Nessun preventivo da accettare.");
        await pool.execute("UPDATE orders SET status = 'in_progress' WHERE id = ?", [order.id]);
      } else if (action === "reject_quote") {
        if (order.status !== "quote_ready") throw createHttpError(400, "Nessun preventivo da rifiutare.");
        await pool.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
        await pool.execute("UPDATE order_entries SET status = 'cancelled' WHERE orderId = ?", [order.id]);
      } else {
        throw createHttpError(400, "Azione non riconosciuta.");
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /user/orders/:publicId — solo bozze
router.delete(
  "/user/orders/:publicId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, status, userEmail FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!rows.length) throw createHttpError(404, "Ordine non trovato.");
      if (rows[0].userEmail !== email) throw createHttpError(403, "Accesso negato.");
      if (rows[0].status !== "draft") throw createHttpError(403, "Solo le bozze possono essere eliminate dall'utente.");
      await pool.execute("DELETE FROM orders WHERE id = ?", [rows[0].id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /user/orders/:publicId/entries/:entryPublicId — feedback revisione utente
router.patch(
  "/user/orders/:publicId/entries/:entryPublicId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();

      const [orderRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, status, userEmail FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!orderRows.length) throw createHttpError(404, "Ordine non trovato.");
      if (orderRows[0].userEmail !== email) throw createHttpError(403, "Accesso negato.");

      const [entryRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM order_entries WHERE publicId = ? AND orderId = ? LIMIT 1",
        [req.params.entryPublicId, orderRows[0].id]
      );
      if (!entryRows.length) throw createHttpError(404, "Matrimonio non trovato.");

      const { action, notes } = req.body;
      const orderId = orderRows[0].id;
      const entryId = entryRows[0].id;

      if (action === "approve") {
        await pool.execute(
          "UPDATE order_entries SET status = 'revision_approved' WHERE id = ?",
          [entryId]
        );
      } else if (action === "request_revision") {
        await pool.execute(
          "UPDATE order_entries SET status = 'revision_requested', userRevisionNotes = ? WHERE id = ?",
          [notes || null, entryId]
        );
      } else {
        throw createHttpError(400, "Azione non riconosciuta.");
      }

      // Auto-transizione ordine padre
      const [allEntries] = await pool.execute<RowDataPacket[]>(
        "SELECT status FROM order_entries WHERE orderId = ?",
        [orderId]
      );
      const statuses = allEntries.map((e) => e.status as string);
      let newOrderStatus: string | null = null;
      if (statuses.every((s) => s === "under_review")) newOrderStatus = "under_review";
      else if (statuses.some((s) => s === "revision_requested")) newOrderStatus = "in_progress";

      if (newOrderStatus) {
        await pool.execute("UPDATE orders SET status = ? WHERE id = ?", [newOrderStatus, orderId]);
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
