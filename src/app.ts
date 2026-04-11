import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import healthRoutes from "./routes/health.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import serviceRoutes from "./routes/service.routes";
import userServiceRoutes from "./routes/user-service.routes";
import userOrderRoutes from "./routes/user-order.routes";
import adminOrderRoutes from "./routes/admin-order.routes";
import userConversationRoutes from "./routes/user-conversation.routes";
import adminConversationRoutes from "./routes/admin-conversation.routes";
import adminUserRoutes from "./routes/admin-user.routes";
import adminInvoiceRoutes from "./routes/admin-invoice.routes";

export const app = express();

// ---------------------------------------------------------------------------
// Middleware globali
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_FRONTEND || "").split(",").map((s) => s.trim()).filter(Boolean);
      // Nessuna origin (es. curl) o origin nell'allowlist → OK
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Route pubbliche (senza auth)
// ---------------------------------------------------------------------------
app.use(healthRoutes);

// ---------------------------------------------------------------------------
// Auth middleware — tutte le route sotto richiedono autenticazione
// ---------------------------------------------------------------------------
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Route protette
// ---------------------------------------------------------------------------
app.use(dashboardRoutes);
app.use(serviceRoutes);
app.use(userServiceRoutes);
app.use(userOrderRoutes);
app.use(adminOrderRoutes);
app.use(userConversationRoutes);
app.use(adminConversationRoutes);
app.use(adminUserRoutes);
app.use(adminInvoiceRoutes);

// ---------------------------------------------------------------------------
// Error handler (deve essere l'ultimo middleware)
// ---------------------------------------------------------------------------
app.use(errorHandler);
