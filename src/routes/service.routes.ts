import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

const JSON_FIELDS = ["priceTiers"];

function parseJsonFields(row: RowDataPacket): RowDataPacket {
  for (const field of JSON_FIELDS) {
    if (typeof row[field] === "string") {
      try { row[field] = JSON.parse(row[field]); } catch { /* lascia stringa */ }
    }
  }
  return row;
}

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
        "category", "pricingType", "basePrice", "percentageValue",
        "priceTiers", "restrictedToService", "sortOrder", "isActive",
      ];
      const cols = fields.filter((f) => body[f] !== undefined);
      const vals = cols.map((f) =>
        JSON_FIELDS.includes(f) ? JSON.stringify(body[f]) : body[f]
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
      res.status(201).json(parseJsonFields(rows[0]));
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
      res.json(rows.map(parseJsonFields));
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
      res.json(parseJsonFields(rows[0]));
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
        vals.push(JSON_FIELDS.includes(key) ? JSON.stringify(value) : value);
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
          category = ?, pricingType = ?, basePrice = ?, percentageValue = ?,
          priceTiers = ?, restrictedToService = ?, sortOrder = ?, isActive = ?
        WHERE id = ?`,
        [
          body.publicId, body.name, body.description, body.durationDescription ?? null,
          body.category, body.pricingType,
          body.basePrice ?? null, body.percentageValue ?? null,
          body.priceTiers ? JSON.stringify(body.priceTiers) : null,
          body.restrictedToService ?? null,
          body.sortOrder ?? null,
          body.isActive ?? 1,
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
