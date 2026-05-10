import { z } from "zod";

const truthy = (v: unknown) =>
  typeof v === "string" ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : Boolean(v);

const Schema = z.object({
  WIX_APP_ID: z.string().optional(),
  WIX_APP_SECRET: z.string().optional(),
  WIX_APP_PUBLIC_KEY: z.string().optional(),
  WIX_REDIRECT_URIS: z.string().optional(),

  WIX_API_KEY: z.string().optional(),
  WIX_ACCOUNT_ID: z.string().optional(),

  WIX_BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  WIX_BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3000"),

  DASHBOARD_BRIDGE_URL: z.string().url().default("http://localhost:3001"),
  DASHBOARD_BRIDGE_TOKEN: z.string().optional(),

  BROWSER_WORKER_ENABLED: z.preprocess(truthy, z.boolean()).default(false),
  BROWSER_WORKER_URL: z.string().url().default("http://localhost:3002"),
  BROWSER_WORKER_TOKEN: z.string().optional(),
  WIX_DASHBOARD_USER: z.string().optional(),
  WIX_DASHBOARD_PASS: z.string().optional(),
  PLAYWRIGHT_HEADLESS: z.preprocess(truthy, z.boolean()).default(true),

  MCP_LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  AUDIT_SINK_PATH: z.string().default("./.audit/audit.log"),

  FEATURE_BROWSER_AUTOMATION: z.preprocess(truthy, z.boolean()).default(false),
  FEATURE_DASHBOARD_BRIDGE: z.preprocess(truthy, z.boolean()).default(false),
  FEATURE_DESTRUCTIVE_WRITES: z.preprocess(truthy, z.boolean()).default(false),

  CAPABILITY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type AppConfig = z.infer<typeof Schema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests. Never call in production code. */
export function _resetConfigForTests(): void {
  cached = undefined;
}
