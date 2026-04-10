import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { getCurrentInvoke } from "@vendia/serverless-express";
import { AuthenticatedRequest, AuthUser } from "../types";

// ---------------------------------------------------------------------------
// JWKS client per modalita locale (cached, come il vecchio backend LoopBack)
// ---------------------------------------------------------------------------
let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    const region = process.env.COGNITO_REGION || "eu-north-1";
    const userPoolId = process.env.COGNITO_USER_POOL_ID || "";
    jwksClient = jwksRsa({
      jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minuti
    });
  }
  return jwksClient;
}

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

// ---------------------------------------------------------------------------
// Estrae i gruppi Cognito dal token decodificato
// ---------------------------------------------------------------------------
function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Se non e JSON, potrebbe essere un singolo gruppo
      return raw ? [raw] : [];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Middleware: popola req.user dai claims
// ---------------------------------------------------------------------------
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authMode = process.env.AUTH_MODE || "local";

  if (authMode === "apigw") {
    // Modalita API Gateway: i claims sono gia validati da JWT Authorizer
    const { event } = getCurrentInvoke();
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) {
      res.status(401).json({ error: "Non autenticato" });
      return;
    }

    const groups = parseGroups(claims["cognito:groups"]);
    req.user = {
      email: claims.email || claims["cognito:username"] || "",
      groups,
      isAdmin: groups.includes("Admin"),
    };
    next();
  } else {
    // Modalita locale: validazione JWT in-process
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token mancante" });
      return;
    }

    const token = authHeader.slice(7);
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
      res.status(401).json({ error: "Token non valido" });
      return;
    }

    getSigningKey(decoded.header.kid)
      .then((signingKey) => {
        const region = process.env.COGNITO_REGION || "eu-north-1";
        const userPoolId = process.env.COGNITO_USER_POOL_ID || "";
        const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

        const payload = jwt.verify(token, signingKey, {
          issuer,
          algorithms: ["RS256"],
        }) as Record<string, any>;

        const groups = parseGroups(payload["cognito:groups"]);
        req.user = {
          email: payload.email || payload["cognito:username"] || "",
          groups,
          isAdmin: groups.includes("Admin"),
        };
        next();
      })
      .catch(() => {
        res.status(401).json({ error: "Token non valido o scaduto" });
      });
  }
}

// ---------------------------------------------------------------------------
// Middleware opzionale: rende l'auth facoltativa (per endpoint pubblici
// che vogliono comunque leggere l'utente se presente)
// ---------------------------------------------------------------------------
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }
  // Prova ad autenticare, ma non blocca se fallisce
  authMiddleware(req, _res, (err?: any) => {
    if (err) req.user = undefined;
    next();
  });
}
