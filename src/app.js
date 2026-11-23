// ============================================================
// Montagem do aplicativo Express.
// Recebe o pool do banco por parâmetro (injeção de dependência),
// o que permite testar tudo sem banco real.
// ============================================================
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config.js";
import { h } from "./lib/util.js";
import { auth } from "./middleware/auth.js";
import { globalLimiter } from "./middleware/rate-limits.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import { publicAuthRoutes, privateAuthRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { lodgeRoutes } from "./routes/lodge.js";
import { brotherRoutes } from "./routes/brothers.js";
import { familyRoutes } from "./routes/family.js";
import { officerRoutes } from "./routes/officers.js";
import { eventRoutes } from "./routes/events.js";
import { visitRoutes } from "./routes/visits.js";
import { fraternityRoutes } from "./routes/fraternity.js";
import { contributionRoutes } from "./routes/contributions.js";
import { cashRoutes } from "./routes/cash.js";
import { minuteRoutes } from "./routes/minutes.js";
import { communicationRoutes } from "./routes/communications.js";
import { reportRoutes } from "./routes/reports.js";
import { notificationRoutes } from "./routes/notifications.js";
import { auditRoutes } from "./routes/audit.js";
import { correctionRoutes } from "./routes/corrections.js";
import { gobRoutes } from "./routes/gob.js";

const pastaAtual = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(pastaAtual, "..", "public");
const indexHtml = path.join(publicDir, "index.html");
const temInterface = fs.existsSync(indexHtml);

export function createApp({ pool }) {
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
        },
      },
    }),
  );

  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins }));
  }

  app.use(express.json({ limit: "200kb" }));
  app.use(globalLimiter);

  // ---------- Saúde ----------
  app.get(
    "/health",
    h(async (_req, res) => {
      let db = "up";
      try {
        await pool.query("SELECT 1");
      } catch {
        db = "down";
      }
      res.status(db === "up" ? 200 : 503).json({
        status: db === "up" ? "ok" : "degraded",
        service: "administracao-loja-x",
        db,
        version: "1.0.0",
        time: new Date().toISOString(),
      });
    }),
  );

  // ---------- Rotas públicas ----------
  app.use("/api/auth", publicAuthRoutes({ pool }));

  // ---------- A partir daqui, exige login ----------
  app.use("/api", auth({ pool }));

  app.use("/api", privateAuthRoutes({ pool }));
  app.use("/api/users", userRoutes({ pool }));
  app.use("/api/lodge", lodgeRoutes({ pool }));
  app.use("/api/brothers", brotherRoutes({ pool }));
  app.use("/api/family", familyRoutes({ pool }));
  app.use("/api/officers", officerRoutes({ pool }));
  app.use("/api/events", eventRoutes({ pool }));
  app.use("/api/visits", visitRoutes({ pool }));
  app.use("/api/fraternity", fraternityRoutes({ pool }));
  app.use("/api/contributions", contributionRoutes({ pool }));
  app.use("/api/cash", cashRoutes({ pool }));
  app.use("/api/minutes", minuteRoutes({ pool }));
  app.use("/api/communications", communicationRoutes({ pool }));
  app.use("/api/reports", reportRoutes({ pool }));
  app.use("/api/notifications", notificationRoutes({ pool }));
  app.use("/api/audit", auditRoutes({ pool }));
  app.use("/api/corrections", correctionRoutes({ pool }));
  app.use("/api/gob", gobRoutes({ pool }));

  // ---------- Interface web (painel) ----------
  if (temInterface) {
    app.use(express.static(publicDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api") && !path.extname(req.path)) {
        return res.sendFile(indexHtml);
      }
      next();
    });
  }

  app.use("/api", notFound);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
