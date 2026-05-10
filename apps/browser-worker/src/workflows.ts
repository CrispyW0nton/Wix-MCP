import type { Browser, Page } from "playwright";

/**
 * Workflow registry. Each entry encapsulates one named UI workflow that has
 * no public API parity. Workflows MUST:
 *   - return a structured result
 *   - capture a screenshot on every step
 *   - never log raw credentials
 *   - prefer role/text/data-testid over CSS hierarchies
 */
export interface WorkflowContext {
  browser: Browser;
  page: Page;
  args: Record<string, unknown>;
  artifacts: { screenshots: string[] };
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export type WorkflowFn = (ctx: WorkflowContext) => Promise<unknown>;

/**
 * Stub workflow: full email-campaign creation flow lives here in production.
 * For the scaffold we just return a structured "not implemented".
 */
const createEmailCampaign: WorkflowFn = async (ctx) => {
  await ctx.step("placeholder", async () => undefined);
  return {
    ok: false,
    reason: "not_implemented",
    humanSummary:
      "create_email_campaign workflow is wired but not implemented in the scaffold.",
  };
};

export const WORKFLOWS: Record<string, WorkflowFn> = {
  "email_marketing.create_campaign": createEmailCampaign,
};
