import { createHash, timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import type { Express, NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import type { Vault } from "./vault.js";

export const tokensFromEnv = (env: Record<string, string | undefined>): string[] =>
  (env["VAULT_API_TOKENS"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

const digest = (value: string) => createHash("sha256").update(value).digest();

const rpcError = (res: Response, status: number, code: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });

const requireBearer =
  (tokens: readonly string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const presented = /^Bearer (.+)$/.exec(req.header("authorization") ?? "")?.[1];
    if (presented !== undefined && tokens.some((t) => timingSafeEqual(digest(t), digest(presented)))) {
      next();
      return;
    }
    res.set("WWW-Authenticate", "Bearer");
    rpcError(res, 401, -32001, "Unauthorized");
  };

export function createHttpApp(vault: Vault, tokens: readonly string[], host = "127.0.0.1"): Express {
  const app = createMcpExpressApp({ host });
  if (tokens.length > 0) app.use("/mcp", requireBearer(tokens));
  else process.stderr.write("interaction-vault: VAULT_API_TOKENS is not set, /mcp is open\n");

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, references: vault.references.length });
  });

  app.post("/mcp", async (req, res) => {
    const server = createServer(vault);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      process.stderr.write(`interaction-vault: request failed, ${error instanceof Error ? error.message : String(error)}\n`);
      if (!res.headersSent) rpcError(res, 500, -32603, "Internal server error");
    }
  });

  const notAllowed = (_req: Request, res: Response) => rpcError(res, 405, -32000, "Method not allowed");
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  return app;
}

export const startHttp = (app: Express, port: number, host: string): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.once("error", reject);
  });
