import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

// PATCH /admin/orders/:publicId/entries/:entryPublicId
router.patch(
  "/admin/orders/:publicId/entries/:entryPublicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();

      // Verifica ordine
      const [orderRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!orderRows.length) throw createHttpError(404, "Ordine non trovato.");

      // Verifica entry
      const [entryRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM order_entries WHERE publicId = ? AND orderId = ? LIMIT 1",
        [req.params.entryPublicId, orderRows[0].id]
      );
      if (!entryRows.length) throw createHttpError(404, "Matrimonio non trovato.");

      const body = req.body;
      const sets: string[] = [];
      const vals: any[] = [];

      const scalarFields = [
        "adminNotes", "deliveryLink", "previewLink", "userRevisionNotes", "status",
        "deliveryMethod", "materialLink", "materialSizeGb", "cameraCount",
        "exportFps", "exportBitrate", "exportAspect", "exportResolution",
        "servicesTotal", "cameraSurcharge", "totalPrice",
      ];
      for (const field of scalarFields) {
        if (body[field] !== undefined) {
          sets.push(`\`${field}\` = ?`);
          vals.push(body[field]);
        }
      }
      if (body.selectedServices !== undefined) {
        sets.push("`selectedServices` = ?");
        vals.push(body.selectedServices ? JSON.stringify(body.selectedServices) : null);
      }

      if (sets.length) {
        vals.push(entryRows[0].id);
        await pool.execute(
          `UPDATE order_entries SET ${sets.join(", ")} WHERE id = ?`,
          vals
        );

        // Ricalcola totalPrice ordine padre = SUM delle entries
        if (body.totalPrice !== undefined) {
          await pool.execute(
            `UPDATE orders SET totalPrice = (
               SELECT COALESCE(SUM(totalPrice), 0) FROM order_entries WHERE orderId = ?
             ) WHERE id = ?`,
            [orderRows[0].id, orderRows[0].id]
          );
        }

        // Auto-transizione ordine padre in base agli stati delle entries
        if (body.status !== undefined) {
          const [allEntries] = await pool.execute<RowDataPacket[]>(
            "SELECT status FROM order_entries WHERE orderId = ?",
            [orderRows[0].id]
          );
          const statuses = (allEntries as RowDataPacket[]).map((e) => e.status as string);
          let newOrderStatus: string | null = null;
          if (statuses.every((s) => s === "under_review"))           newOrderStatus = "under_review";
          else if (statuses.some((s) => s === "revision_requested")) newOrderStatus = "in_progress";

          if (newOrderStatus) {
            await pool.execute(
              "UPDATE orders SET status = ? WHERE id = ?",
              [newOrderStatus, orderRows[0].id]
            );
          }
        }
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/orders/:publicId/entries
router.post(
  "/admin/orders/:publicId/entries",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const { coupleName, weddingDate } = req.body;

      if (!coupleName || typeof coupleName !== "string") {
        throw createHttpError(400, "coupleName obbligatorio.");
      }
      if (!weddingDate || typeof weddingDate !== "string") {
        throw createHttpError(400, "weddingDate obbligatorio.");
      }

      const [orderRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!orderRows.length) throw createHttpError(404, "Ordine non trovato.");

      const orderId = orderRows[0].id;

      // Calcola sortOrder prossimo
      const [maxRow] = await pool.execute<RowDataPacket[]>(
        "SELECT COALESCE(MAX(sortOrder), -1) AS maxSort FROM order_entries WHERE orderId = ?",
        [orderId]
      );
      const nextSort = (maxRow[0].maxSort as number) + 1;

      const normalizedDate = weddingDate.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? weddingDate;
      const publicId = randomUUID();

      const { selectedServices, deliveryMethod, materialLink, materialSizeGb, cameraCount,
              exportFps, exportBitrate, exportAspect, exportResolution,
              servicesTotal, cameraSurcharge, totalPrice } = req.body;

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO order_entries
           (publicId, orderId, coupleName, weddingDate, status, sortOrder,
            selectedServices, deliveryMethod, materialLink, materialSizeGb, cameraCount,
            exportFps, exportBitrate, exportAspect, exportResolution,
            servicesTotal, cameraSurcharge, totalPrice)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicId, orderId, coupleName, normalizedDate, nextSort,
          selectedServices ? JSON.stringify(selectedServices) : null,
          deliveryMethod || null, materialLink || null, materialSizeGb || null,
          cameraCount || null, exportFps || null, exportBitrate || null,
          exportAspect || null, exportResolution || null,
          servicesTotal || null, cameraSurcharge || null, totalPrice || null,
        ]
      );

      // Segna l'ordine come batch se non lo era già
      await pool.execute(
        "UPDATE orders SET isBatch = 1 WHERE id = ? AND isBatch = 0",
        [orderId]
      );

      const [newEntry] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM order_entries WHERE id = ?",
        [result.insertId]
      );
      res.status(201).json(newEntry[0]);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /admin/orders/:publicId/entries/:entryPublicId
router.delete(
  "/admin/orders/:publicId/entries/:entryPublicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();

      const [orderRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM orders WHERE publicId = ? LIMIT 1",
        [req.params.publicId]
      );
      if (!orderRows.length) throw createHttpError(404, "Ordine non trovato.");

      const orderId = orderRows[0].id;

      // Conta entries rimanenti
      const [countRow] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM order_entries WHERE orderId = ?",
        [orderId]
      );
      if ((countRow[0].cnt as number) <= 1) {
        throw createHttpError(400, "Impossibile eliminare: l'ordine deve contenere almeno un matrimonio.");
      }

      const [entryRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM order_entries WHERE publicId = ? AND orderId = ? LIMIT 1",
        [req.params.entryPublicId, orderId]
      );
      if (!entryRows.length) throw createHttpError(404, "Matrimonio non trovato.");

      await pool.execute("DELETE FROM order_entries WHERE id = ?", [entryRows[0].id]);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
