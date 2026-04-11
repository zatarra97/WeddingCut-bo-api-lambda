import { Router, Response, NextFunction } from "express";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket } from "mysql2/promise";

const router = Router();

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function getS3Client(): S3Client {
  return new S3Client({ region: process.env.S3_REGION ?? "eu-north-1" });
}

function getBucket(): string {
  const bucket = process.env.S3_ORDERS_BUCKET;
  if (!bucket) throw new Error("S3_ORDERS_BUCKET env var not set");
  return bucket;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

// POST /admin/orders/:publicId/invoice-upload-url
router.post(
  "/admin/orders/:publicId/invoice-upload-url",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { publicId } = req.params;
      const { filename, contentType } = req.body;

      if (!filename || typeof filename !== "string") {
        throw createHttpError(400, "filename obbligatorio.");
      }
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw createHttpError(400, `contentType non valido. Valori ammessi: ${ALLOWED_CONTENT_TYPES.join(", ")}`);
      }

      // Verifica che l'ordine esista
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT publicId FROM orders WHERE publicId = ? LIMIT 1",
        [publicId]
      );
      if (!rows.length) throw createHttpError(404, "Ordine non trovato.");

      const key = `${publicId}/${Date.now()}-${sanitizeFilename(filename)}`;
      const bucket = getBucket();
      const s3 = getS3Client();

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 min

      res.json({ uploadUrl, invoiceUrl: key });
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/orders/:publicId/invoice-download-url
router.get(
  "/admin/orders/:publicId/invoice-download-url",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { publicId } = req.params;
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT invoiceUrl FROM orders WHERE publicId = ? LIMIT 1",
        [publicId]
      );
      if (!rows.length) throw createHttpError(404, "Ordine non trovato.");
      if (!rows[0].invoiceUrl) throw createHttpError(404, "Nessuna fattura caricata per questo ordine.");

      const s3 = getS3Client();
      const command = new GetObjectCommand({
        Bucket: getBucket(),
        Key: rows[0].invoiceUrl,
      });

      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
      res.json({ downloadUrl });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /admin/orders/:publicId/invoice
router.delete(
  "/admin/orders/:publicId/invoice",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { publicId } = req.params;
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, invoiceUrl FROM orders WHERE publicId = ? LIMIT 1",
        [publicId]
      );
      if (!rows.length) throw createHttpError(404, "Ordine non trovato.");

      const key = rows[0].invoiceUrl as string | null;
      if (key) {
        const s3 = getS3Client();
        await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
      }

      await pool.execute(
        "UPDATE orders SET invoiceUrl = NULL WHERE id = ?",
        [rows[0].id]
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
