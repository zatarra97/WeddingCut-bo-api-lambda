import { Router, Response, NextFunction } from "express";
import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { AuthenticatedRequest } from "../types";
import { requireAdmin } from "../middleware/admin";
import { createHttpError } from "../middleware/error-handler";

const router = Router();

// Il client Cognito usa le credenziali del Lambda execution role in prod
// e le env vars AWS_ACCESS_KEY_ID/SECRET in locale
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || "eu-north-1",
});

function getUserPoolId(): string {
  return process.env.COGNITO_USER_POOL_ID || "";
}

// GET /admin/users
router.get(
  "/admin/users",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userPoolId = getUserPoolId();

      // Carica lista admin
      const adminUsernames = new Set<string>();
      try {
        const adminRes = await cognitoClient.send(
          new ListUsersInGroupCommand({
            UserPoolId: userPoolId,
            GroupName: "Admin",
          })
        );
        for (const u of adminRes.Users ?? []) {
          if (u.Username) adminUsernames.add(u.Username);
        }
      } catch (groupErr) {
        console.error("[admin/users] ListUsersInGroup error:", groupErr);
      }

      // Filtro opzionale per email
      const emailFilter = req.query.email as string | undefined;
      const filter = emailFilter?.trim()
        ? `email ^= "${emailFilter.trim()}"`
        : undefined;

      const result = await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: filter,
          Limit: 60,
        })
      );

      const users = (result.Users ?? []).map((u) => {
        const attrs = Object.fromEntries(
          (u.Attributes ?? []).map((a) => [a.Name!, a.Value ?? ""])
        );
        return {
          username: u.Username ?? "",
          email: attrs["email"] ?? "",
          name: attrs["name"] || undefined,
          phone: attrs["phone_number"] || undefined,
          enabled: u.Enabled ?? true,
          status: u.UserStatus ?? "",
          createdAt: u.UserCreateDate,
          isAdmin: adminUsernames.has(u.Username ?? ""),
        };
      });

      res.json(users);
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/users/:username/disable
router.post(
  "/admin/users/:username/disable",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { username } = req.params;
      const selfEmail = req.user!.email;
      if (selfEmail && selfEmail === username) {
        throw createHttpError(422, "Non puoi disabilitare il tuo stesso account.");
      }
      try {
        await cognitoClient.send(
          new AdminDisableUserCommand({
            UserPoolId: getUserPoolId(),
            Username: username,
          })
        );
      } catch (err: any) {
        if (err.name === "UserNotFoundException") {
          throw createHttpError(404, "Utente non trovato.");
        }
        throw createHttpError(500, "Errore durante la disabilitazione.");
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/users/:username/enable
router.post(
  "/admin/users/:username/enable",
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { username } = req.params;
      try {
        await cognitoClient.send(
          new AdminEnableUserCommand({
            UserPoolId: getUserPoolId(),
            Username: username,
          })
        );
      } catch (err: any) {
        if (err.name === "UserNotFoundException") {
          throw createHttpError(404, "Utente non trovato.");
        }
        throw createHttpError(500, "Errore durante l'abilitazione.");
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
