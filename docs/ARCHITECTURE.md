# Wix MCP — Architecture

```
+------------------------------+        +------------------------------+
|        Cursor (MCP)          | <----> |        wix-mcp-server        |
+------------------------------+ stdio  |  - tool registry             |
                                        |  - HybridRouter              |
                                        |  - PolicyEngine              |
                                        |  - CapabilityRegistry        |
                                        |  - Audit                     |
                                        +------+----------+------------+
                                               |          |          |
                              api              |  bridge  |  browser
                                               |          |
                                               v          v          v
                                        +-------------+ +-----------+ +-----------+
                                        | wix-backend | | dashboard | | browser-  |
                                        | (OAuth +    | | -bridge   | | worker    |
                                        |  webhooks)  | | (in WIX)  | | (Playwright|
                                        +------+------+ +-----+-----+ +-----+-----+
                                               |             |             |
                                               v             v             v
                                        +---------------------------------------+
                                        |             Wix platform              |
                                        |  REST APIs / dashboard / web UI       |
                                        +---------------------------------------+
```

## Execution layers

Every tool's metadata declares an ordered list of allowed backends:

1. **`api`** — typed HTTP through `WixHttpClient` against `wixapis.com`. Identity is `wix_app` (OAuth) or `api_key_admin` (account API key).
2. **`dashboard_bridge`** — RPC into the Wix-hosted companion that runs as a `wix_user`. Used for operations that require the dashboard user's identity (e.g. some marketing/composer flows).
3. **`browser_automation`** — Playwright fallback worker. Used only when there is no public API or bridge path. Always behind `FEATURE_BROWSER_AUTOMATION=true`.

The `HybridRouter` resolves identity, loads capability, evaluates policy, picks the highest-preference enabled backend, executes, and emits an audit record.

## Identity model

Wix recognizes five identities (`visitor`, `member`, `wix_user`, `wix_app`, `api_key_admin`). The MCP control plane addresses three:

- `wix_app`: OAuth-based, app-instance scoped. Default for most tools.
- `api_key_admin`: account-level API key, used for cross-site administration.
- `wix_user`: only available via the dashboard bridge.

Tools declare `requiredIdentity`. The `IdentityResolver` enforces it; mismatch is a hard `PermissionError`.

## Capability registry

For each `appInstanceId` the registry caches a `SiteCapabilityMap`:

- per-module status (`stores`, `bookings`, `pricingPlans`, `events`, `members`, `cms`, `media`, `emailMarketing`, `inbox`, `automations`, `domains`, `seo`)
- inbox channels available
- email-marketing sender state
- per-tool overrides

`evaluateToolCapability(map, modules)` produces `supported | partial | unsupported | unknown`. The `PolicyEngine` blocks tools on `unsupported` and surfaces warnings on `partial` / `unknown`.

## Plan / execute split

High-impact mutations are split into two tools:

- `*_plan` — read-only, returns what would change.
- `*_execute` — writes, requires `confirm: true`, audited, idempotent.

Examples in the metadata catalog: `ecom_orders.refund_plan` / `ecom_orders.refund_execute`, `contributors.update_roles_plan` / `contributors.update_roles_execute`, `email_campaign.publish_plan` / `email_campaign.publish_execute`.

## Audit

Every tool invocation emits an `AuditRecord` regardless of outcome. Inputs are run through `redact()` before persistence. Browser-automation jobs emit an `artifactRef` pointing at the screenshot/trace bundle.

## Tool metadata

Tools never own their dispatch logic — they expose:

```ts
{
  metadata: ToolMetadata,
  inputSchema: z.ZodObject,
  handler: (ctx, input) => Promise<ToolResult>
}
```

The MCP server registers them off this metadata, so adding a tool is a one-file change.
