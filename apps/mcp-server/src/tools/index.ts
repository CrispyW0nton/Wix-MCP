import type { ToolDefinition } from "@wix-mcp/tool-definitions";
import { getCapabilitiesTool, getAppInstanceTool, listSitesTool } from "./wix.js";
import { listContactsTool, createContactTool } from "./contacts.js";
import { listConversationsTool, sendMessageTool } from "./inbox.js";
import { listCampaignsTool } from "./emailMarketing.js";
import { listOrdersTool, refundPlanTool } from "./ecomOrders.js";

/**
 * The first ten tools wired through the hybrid router.
 * Each one is a real implementation against the typed Wix HTTP client.
 */
export const ALL_TOOLS: ToolDefinition[] = [
  getCapabilitiesTool,
  listSitesTool,
  getAppInstanceTool,
  listContactsTool,
  createContactTool,
  listConversationsTool,
  sendMessageTool,
  listCampaignsTool,
  listOrdersTool,
  refundPlanTool,
];
