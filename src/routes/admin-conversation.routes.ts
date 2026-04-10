import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest, ConversationWithUnread } from "../types";
import { requireAdmin } from "../middleware/admin";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

async function resolveConversation(publicId: string) {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM conversations WHERE publicId = ? LIMIT 1",
    [publicId]
  );
  if (!rows.length) throw createHttpError(404, "Conversazione non trovata.");
  return rows[0];
}

// GET /admin/conversations
router.get(
  "/admin/conversations",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      let sql = "SELECT * FROM conversations WHERE 1=1";
      const params: any[] = [];

      if (req.query.status) {
        sql += " AND status = ?";
        params.push(req.query.status);
      }
      if (req.query.userEmail) {
        sql += " AND userEmail LIKE ?";
        params.push(`%${req.query.userEmail}%`);
      }

      sql += " ORDER BY lastMessageAt DESC";

      const [conversations] = await pool.execute<RowDataPacket[]>(sql, params);

      const result: ConversationWithUnread[] = [];
      for (const conv of conversations) {
        const [unread] = await pool.execute<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM messages WHERE conversationId = ? AND senderRole = 'user' AND readAt IS NULL",
          [conv.id]
        );
        result.push({
          id: conv.id,
          publicId: conv.publicId,
          userEmail: conv.userEmail,
          subject: conv.subject,
          orderId: conv.orderId,
          status: (conv.status || "").toLowerCase() as "open" | "closed",
          chatMode: (conv.chatMode || "limited").toLowerCase() as "limited" | "realtime",
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          unreadCount: unread[0].count,
        });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/conversations/:publicId/messages
router.get(
  "/admin/conversations/:publicId/messages",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conv = await resolveConversation(req.params.publicId);
      const pool = getPool();

      // Segna come letti i messaggi utente
      await pool.execute(
        "UPDATE messages SET readAt = NOW() WHERE conversationId = ? AND senderRole = 'user' AND readAt IS NULL",
        [conv.id]
      );

      const [msgs] = await pool.execute<RowDataPacket[]>(
        "SELECT id, publicId, conversationId, senderRole, senderEmail, content, readAt, createdAt FROM messages WHERE conversationId = ? ORDER BY createdAt ASC",
        [conv.id]
      );

      res.json(
        msgs.map((m) => ({
          ...m,
          senderRole: (m.senderRole || "").toLowerCase(),
          readAt: m.readAt ?? null,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/conversations/:publicId/messages
router.post(
  "/admin/conversations/:publicId/messages",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const conv = await resolveConversation(req.params.publicId);
      const pool = getPool();

      const msgPublicId = randomUUID();
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO messages (publicId, conversationId, senderRole, senderEmail, content)
         VALUES (?, ?, 'admin', ?, ?)`,
        [msgPublicId, conv.id, email, (req.body.content || "").trim()]
      );

      await pool.execute(
        "UPDATE conversations SET lastMessageAt = NOW(), updatedAt = NOW() WHERE id = ?",
        [conv.id]
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, publicId, conversationId, senderRole, senderEmail, content, readAt, createdAt FROM messages WHERE id = ?",
        [result.insertId]
      );
      res.status(201).json({ ...rows[0], readAt: rows[0].readAt ?? null });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /admin/conversations/:publicId
router.patch(
  "/admin/conversations/:publicId",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conv = await resolveConversation(req.params.publicId);
      const pool = getPool();
      const sets: string[] = [];
      const vals: any[] = [];

      if (req.body.status) {
        sets.push("status = ?");
        vals.push(req.body.status);
      }
      if (req.body.chatMode) {
        sets.push("chatMode = ?");
        vals.push(req.body.chatMode);
      }

      if (!sets.length) {
        res.status(204).send();
        return;
      }

      vals.push(conv.id);
      await pool.execute(
        `UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`,
        vals
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
