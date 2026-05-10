import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { chromium } from "playwright";
import { loadConfig } from "@wix-mcp/config";
import { createLogger } from "@wix-mcp/core";
import { WORKFLOWS } from "./workflows.js";

interface JobInput {
  workflow: string;
  args: Record<string, unknown>;
  correlationId: string;
  dryRun?: boolean;
}

async function start() {
  const cfg = loadConfig();
  const logger = createLogger({
    level: cfg.MCP_LOG_LEVEL,
    service: "browser-worker",
    destinationFd: 1,
  });

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    service: "browser-worker",
    enabled: cfg.BROWSER_WORKER_ENABLED,
    workflows: Object.keys(WORKFLOWS).sort(),
  }));

  app.post("/jobs/run", async (req, reply) => {
    const token = req.headers["x-worker-token"];
    if (!cfg.BROWSER_WORKER_TOKEN || token !== cfg.BROWSER_WORKER_TOKEN) {
      return reply.code(401).send({ error: "Invalid worker token" });
    }
    if (!cfg.BROWSER_WORKER_ENABLED) {
      return reply.code(503).send({ error: "Browser worker disabled" });
    }
    const input = req.body as JobInput;
    const fn = WORKFLOWS[input.workflow];
    if (!fn) {
      return reply.code(404).send({ error: `Unknown workflow '${input.workflow}'` });
    }

    const startedAt = Date.now();
    const screenshotsDir = `.screenshots/${input.correlationId}`;
    await mkdir(screenshotsDir, { recursive: true });
    const browser = await chromium.launch({ headless: cfg.PLAYWRIGHT_HEADLESS });
    const context = await browser.newContext();
    const page = await context.newPage();
    const artifacts = { screenshots: [] as string[] };
    const steps: { name: string; status: "ok" | "error"; durationMs: number; note?: string }[] = [];

    const stepRunner = async <T>(name: string, fnInner: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      try {
        const out = await fnInner();
        const file = join(screenshotsDir, `${steps.length}-${name}.png`);
        await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
        artifacts.screenshots.push(file);
        steps.push({ name, status: "ok", durationMs: Date.now() - t0 });
        return out;
      } catch (e) {
        const file = join(screenshotsDir, `${steps.length}-${name}-ERROR.png`);
        await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
        artifacts.screenshots.push(file);
        steps.push({
          name,
          status: "error",
          durationMs: Date.now() - t0,
          note: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    };

    try {
      const data = await fn({
        browser,
        page,
        args: input.args,
        artifacts,
        step: stepRunner,
      });
      return {
        ok: true,
        workflow: input.workflow,
        data,
        steps,
        artifacts,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({
        ok: false,
        workflow: input.workflow,
        steps,
        artifacts,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  });

  const port = 3002;
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port, enabled: cfg.BROWSER_WORKER_ENABLED }, "browser-worker listening");
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
