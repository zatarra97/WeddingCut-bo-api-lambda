import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthenticatedRequest, ConversationWithUnread } from "../types";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function resolveConversation(publicId: string, email: string) {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM conversations WHERE publicId = ? LIMIT 1",
    [publicId]
  );
  if (!rows.length) throw createHttpError(404, "Conversazione non trovata.");
  if (rows[0].userEmail !== email) throw createHttpError(403, "Accesso negato.");
  return rows[0];
}

function calcUserCanSend(
  messages: { senderRole: string }[],
  chatMode: string
): boolean {
  if (chatMode === "realtime") return true;
  let consecutive = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderRole === "admin") break;
    if (messages[i].senderRole === "user") consecutive++;
  }
  return consecutive < 2;
}

// ---------------------------------------------------------------------------
// POST /user/conversations
// ---------------------------------------------------------------------------
router.post(
  "/user/conversations",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const { subject, orderId } = req.body;
      const pool = getPool();

      // Verifica conversazione aperta duplicata
      const [existing] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM conversations WHERE userEmail = ? AND orderId = ? AND status = 'open' LIMIT 1",
        [email, orderId]
      );
      if (existing.length) {
        throw createHttpError(409, "Esiste gia una conversazione aperta per questo ordine.");
      }

      const publicId = randomUUID();
      const now = new Date();
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO conversations (publicId, userEmail, subject, orderId, status, chatMode, lastMessageAt)
         VALUES (?, ?, ?, ?, 'open', 'limited', ?)`,
        [publicId, email, (subject || "").trim(), orderId, now]
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM conversations WHERE id = ?",
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /user/conversations
// ---------------------------------------------------------------------------
router.get(
  "/user/conversations",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const pool = getPool();

      const [conversations] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM conversations WHERE userEmail = ? ORDER BY lastMessageAt DESC",
        [email]
      );

      const result: ConversationWithUnread[] = [];
      for (const conv of conversations) {
        const [unread] = await pool.execute<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM messages WHERE conversationId = ? AND senderRole = 'admin' AND readAt IS NULL",
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

// ---------------------------------------------------------------------------
// GET /user/conversations/:publicId/messages
// ---------------------------------------------------------------------------
router.get(
  "/user/conversations/:publicId/messages",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const conv = await resolveConversation(req.params.publicId, email);
      const pool = getPool();

      // Segna come letti i messaggi admin non ancora letti
      await pool.execute(
        "UPDATE messages SET readAt = NOW() WHERE conversationId = ? AND senderRole = 'admin' AND readAt IS NULL",
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

// ---------------------------------------------------------------------------
// POST /user/conversations/:publicId/messages
// ---------------------------------------------------------------------------
router.post(
  "/user/conversations/:publicId/messages",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const conv = await resolveConversation(req.params.publicId, email);
      const pool = getPool();

      if ((conv.status || "").toLowerCase() === "closed") {
        throw createHttpError(422, "La conversazione e chiusa. Apri una nuova conversazione.");
      }

      // Rate limiting in modalita limited
      const chatMode = (conv.chatMode || "limited").toLowerCase();
      if (chatMode !== "realtime") {
        const [allMsgs] = await pool.execute<RowDataPacket[]>(
          "SELECT senderRole FROM messages WHERE conversationId = ? ORDER BY createdAt ASC",
          [conv.id]
        );
        if (!calcUserCanSend(allMsgs as { senderRole: string }[], chatMode)) {
          throw createHttpError(422, "Hai raggiunto il limite di messaggi. Attendi una risposta dal team.");
        }
      }

      const msgPublicId = randomUUID();
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO messages (publicId, conversationId, senderRole, senderEmail, content)
         VALUES (?, ?, 'user', ?, ?)`,
        [msgPublicId, conv.id, email, (req.body.content || "").trim()]
      );

      // Aggiorna lastMessageAt
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

export default router;
