# Wix MCP — Hybrid Wix Dashboard Control Plane

> Repo: [github.com/CrispyW0nton/Wix-MCP](https://github.com/CrispyW0nton/Wix-MCP)

A production-shaped TypeScript MCP server for Cursor that exposes Wix
dashboard capabilities as tools. **API-first, dashboard-bridge second,
browser-automation last.**

This repo is a monorepo containing four apps and nine shared packages.
The MCP server is the only process Cursor talks to; everything else is
behind it.

## Why this shape

Wix has five distinct identities (`visitor`, `member`, `wix_user`, `wix_app`,
`api_key_admin`), and **`wix_user` is only available from a Wix dashboard
context**. So an external MCP server cannot honestly claim "full dashboard
control" with REST alone — it needs:

1. **Official Wix REST/SDK** for the broad supported surface (orders,
   contacts, members, bookings, automations, CMS, media, stores, inbox,
   email marketing, app instance, contributors, domains, SEO).
2. **Dashboard companion** for ops that require the dashboard user identity.
3. **Playwright fallback worker** for the small remaining UI-only surface
   (e.g. composing brand-new email campaigns from scratch — the Email
   Marketing API explicitly does not support that).

The tool layer hides this routing behind one stable name per business
intent (e.g. `email_marketing.publish_campaign_execute`), so agents
don't have to know which backend is in play.

## Project layout

```
apps/
  mcp-server/          # MCP stdio server consumed by Cursor
  wix-backend/         # OAuth callback + webhook receiver
  dashboard-bridge/    # Wix-user-context RPC surface (companion app)
  browser-worker/      # Playwright fallback worker
packages/
  shared-types/        # Cross-package types
  config/              # zod-validated env loader
  core/                # Errors, logger, ids, redact, ToolResult builder
  wix-auth/            # OAuth, token store, identity resolver, API key admin
  wix-clients/         # Typed Wix REST clients per domain
  capability-registry/ # Per-site capability map
  audit/               # Append-only audit sink + redaction
  tool-definitions/    # Metadata + zod schemas + handler contract
  executors/           # PolicyEngine + HybridRouter + bridge/automation clients
docs/
  ARCHITECTURE.md
  COVERAGE_MATRIX.md
docker/
  Dockerfile.mcp-server
  Dockerfile.wix-backend
  docker-compose.yml
```

See `docs/ARCHITECTURE.md` for the runtime diagram and
`docs/COVERAGE_MATRIX.md` for the full per-tool capability/backend matrix.

## Local development

Prerequisites: Node 20+, pnpm 9+.

```sh
git clone https://github.com/CrispyW0nton/Wix-MCP.git
cd Wix-MCP
pnpm install
cp .env.example .env   # fill in WIX_APP_ID / WIX_APP_SECRET
pnpm build
pnpm test
pnpm dev:mcp           # run the MCP server (stdio)
pnpm dev:backend       # OAuth callback + webhooks on :3000
```

To enable the dashboard bridge or browser-automation fallbacks:

```env
FEATURE_DASHBOARD_BRIDGE=true
FEATURE_BROWSER_AUTOMATION=true
```

## Wiring into Cursor

In your Cursor MCP settings, add an entry that runs the MCP server over
stdio. After `pnpm build`:

```json
{
  "mcpServers": {
    "wix-mcp": {
      "command": "node",
      "args": ["./apps/mcp-server/dist/index.js"],
      "env": {
        "WIX_APP_ID": "...",
        "WIX_APP_SECRET": "...",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

## Identity matrix

| Tool's `requiredIdentity` | How it auths                                                | Where it can run |
| ------------------------- | ----------------------------------------------------------- | ---------------- |
| `wix_app`                 | OAuth access token cached per `appInstanceId`               | api              |
| `api_key_admin`           | `WIX_API_KEY` + `WIX_ACCOUNT_ID` env, `Authorization: <k>`  | api              |
| `wix_user`                | Forwarded via `dashboard-bridge` from a Wix dashboard page  | bridge / browser |
| `member` / `visitor`      | Not addressable from the MCP control plane                  | n/a              |

## Safety model

- **Capability gating** — `evaluatePolicy` blocks tools whose required
  modules are `unsupported` on a site.
- **Plan / execute split** — high-risk mutations (refunds, role changes,
  campaign publishes, contact merges) are exposed as two tools.
- **`confirm: true` requirement** for any tool with `confirmRequired: true`.
- **Feature flags** — destructive writes (`FEATURE_DESTRUCTIVE_WRITES`),
  dashboard bridge, and browser automation are all opt-in.
- **Audit log** — every invocation is logged with redacted inputs,
  backend used, capability status, idempotency key, and a result summary.
- **Idempotency** — tools that declare `idempotent: true` derive a key when
  the caller doesn't supply one, so retries don't double-fire.

## Adding a new tool

1. Add a typed client method in `packages/wix-clients/src/domains/<domain>.ts`.
2. Create the tool file in `apps/mcp-server/src/tools/<domain>.ts`:
   - export a `ToolDefinition` with full `metadata`, `inputSchema`, `handler`.
3. Register it in `apps/mcp-server/src/tools/index.ts`.
4. Add a row to `docs/COVERAGE_MATRIX.md`.
5. Add a unit test under `tests/`.

The `HybridRouter` does identity resolution, capability gating, policy
evaluation, dispatch, and audit for you — handlers stay focused on the
domain call.

## Status

This is a **production-shaped scaffold** with 17 tools wired end-to-end
against the typed HTTP client, including the full eCommerce finance
vertical (`refund`, `capture`, `void`, `update_payment_status`) under
strict plan/execute, confirm, and dry-run guards. The remaining tools
listed in `docs/COVERAGE_MATRIX.md` follow the same pattern; each is a
one-file addition.

### Currently wired tools

Foundation: `wix.get_capabilities`, `wix.list_sites`,
`wix.get_app_instance`.

CRM / messaging: `contacts.list`, `contacts.create`,
`inbox.list_conversations`, `inbox.send_message`.

Marketing: `email_marketing.list_campaigns`.

eCommerce orders + finance: `ecom_orders.list`, `ecom_orders.get_order`,
`ecom_orders.refund_plan`, `ecom_orders.refund_execute`,
`ecom_orders.capture_payment_plan`, `ecom_orders.capture_payment_execute`,
`ecom_orders.void_payment_plan`, `ecom_orders.void_payment_execute`,
`ecom_orders.update_payment_status`.

### Build & test status

- `pnpm -r typecheck` — passes across all 13 buildable packages/apps.
- `pnpm test` — passing across policy engine, capability registry,
  redaction, hybrid router, and refund-execute behavior suites.
- `pnpm build` — clean across all packages and all four apps.

### Roadmap (next vertical slice)

In priority order against `docs/COVERAGE_MATRIX.md`:

1. ~~eCommerce finance~~ ✅ shipped: refund/capture/void plan+execute,
   `update_payment_status`, `get_order`.
2. `pricing_plans.mark_offline_order_paid` (typed client already exists).
3. Email marketing writes: `send_test`, `reuse_campaign`,
   `publish_campaign_plan` / `publish_campaign_execute`.
4. `automations.list / create / run_custom_trigger`.
5. Real `email_marketing.create_campaign_via_dashboard_automation` workflow
   in `apps/browser-worker/src/workflows.ts` (registration entry already wired).
6. Persistent `TokenStore` (Postgres or Redis) replacing the in-memory store.
7. Webhook JWT verification in `apps/wix-backend/src/index.ts` using
   `WIX_APP_PUBLIC_KEY`.
8. `inbox.get_channel_capabilities` probe so SMS gating is real, not assumed.

## Contributing

Pull requests land against `main`. Every change must:

- update `docs/COVERAGE_MATRIX.md` if it adds, retitles, or reclassifies a tool;
- include a metadata-driven `ToolDefinition` (no hand-wired switches);
- ship at least one Vitest case for new policy/router/registry behavior;
- pass `pnpm -r typecheck` and `pnpm test`.
