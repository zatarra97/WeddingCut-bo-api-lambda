import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

// POST /services (admin)
router.post(
  "/services",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      body.publicId = randomUUID();
      const fields = [
        "publicId", "name", "description", "durationDescription",
        "minDuration", "maxDuration", "orientation",
        "priceVertical", "priceHorizontal", "priceBoth", "additionalOptions",
      ];
      const cols = fields.filter((f) => body[f] !== undefined);
      const vals = cols.map((f) =>
        f === "additionalOptions" ? JSON.stringify(body[f]) : body[f]
      );
      const placeholders = cols.map(() => "?").join(", ");

      const pool = getPool();
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO services (${cols.join(", ")}) VALUES (${placeholders})`,
        vals
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM services WHERE id = ?",
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// GET /services/count
router.get(
  "/services/count",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM services"
      );
      res.json({ count: rows[0].count });
    } catch (err) {
      next(err);
    }
  }
);

// GET /services
router.get(
  "/services",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      // Supporto filtro LoopBack base (usato da admin Services.tsx)
      let sql = "SELECT * FROM services";
      const params: any[] = [];

      const filterParam = req.query.filter;
      if (typeof filterParam === "string") {
        try {
          const filter = JSON.parse(filterParam);
          if (filter.order) {
            // Sanitizza il campo order per prevenire SQL injection
            const orderStr = Array.isArray(filter.order)
              ? filter.order[0]
              : filter.order;
            if (typeof orderStr === "string") {
              const match = orderStr.match(
                /^(\w+)\s+(ASC|DESC)$/i
              );
              if (match) {
                sql += ` ORDER BY \`${match[1]}\` ${match[2].toUpperCase()}`;
              }
            }
          }
          if (filter.limit) {
            sql += " LIMIT ?";
            params.push(Number(filter.limit));
          }
          if (filter.skip) {
            sql += " OFFSET ?";
            params.push(Number(filter.skip));
          }
        } catch {
          // Ignora filtro malformato
        }
      }

      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// GET /services/:id
router.get(
  "/services/:id",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM services WHERE id = ?",
        [req.params.id]
      );
      if (!rows.length) {
        res.status(404).json({ error: { statusCode: 404, message: "Servizio non trovato." } });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /services/:id (admin)
router.patch(
  "/services/:id",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(body)) {
        if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
        sets.push(`\`${key}\` = ?`);
        vals.push(key === "additionalOptions" ? JSON.stringify(value) : value);
      }
      if (!sets.length) {
        res.status(204).send();
        return;
      }
      vals.push(req.params.id);
      const pool = getPool();
      await pool.execute(
        `UPDATE services SET ${sets.join(", ")} WHERE id = ?`,
        vals
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// PUT /services/:id (admin)
router.put(
  "/services/:id",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const pool = getPool();
      await pool.execute(
        `UPDATE services SET
          publicId = ?, name = ?, description = ?, durationDescription = ?,
          minDuration = ?, maxDuration = ?, orientation = ?,
          priceVertical = ?, priceHorizontal = ?, priceBoth = ?,
          additionalOptions = ?
        WHERE id = ?`,
        [
          body.publicId, body.name, body.description, body.durationDescription || null,
          body.minDuration || null, body.maxDuration || null, body.orientation || "both",
          body.priceVertical || null, body.priceHorizontal || null, body.priceBoth || null,
          body.additionalOptions ? JSON.stringify(body.additionalOptions) : null,
          req.params.id,
        ]
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /services/:id (admin)
router.delete(
  "/services/:id",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      await pool.execute("DELETE FROM services WHERE id = ?", [req.params.id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
