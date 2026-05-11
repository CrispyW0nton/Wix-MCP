import type { ToolDefinition } from "@wix-mcp/tool-definitions";
import { getCapabilitiesTool, getAppInstanceTool, listSitesTool } from "./wix.js";
import { listContactsTool, createContactTool } from "./contacts.js";
import { listConversationsTool, sendMessageTool } from "./inbox.js";
import { listCampaignsTool } from "./emailMarketing.js";
import {
  capturePaymentExecuteTool,
  capturePaymentPlanTool,
  getOrderTool,
  listOrdersTool,
  refundExecuteTool,
  refundPlanTool,
  updatePaymentStatusTool,
  voidPaymentExecuteTool,
  voidPaymentPlanTool,
} from "./ecomOrders.js";

/**
 * The current tool catalog. Tools register through this single export so the
 * MCP server only ever has one source of truth.
 *
 * Vertical slices, in order of completion:
 *   1. Foundation + read paths (wix.*, contacts.*, inbox.*, email_marketing.*).
 *   2. eCommerce finance (refund/capture/void plan+execute, update_payment_status).
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
  getOrderTool,
  refundPlanTool,
  refundExecuteTool,
  capturePaymentPlanTool,
  capturePaymentExecuteTool,
  voidPaymentPlanTool,
  voidPaymentExecuteTool,
  updatePaymentStatusTool,
];
