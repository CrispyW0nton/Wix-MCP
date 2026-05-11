# Wix MCP — Coverage Matrix

Status legend:
- **api**: backed by an official Wix REST/SDK call.
- **bridge**: requires the dashboard companion (Wix-user identity).
- **automation**: Playwright fallback for UI-only flows (feature-flagged).
- **partial**: API exists but doesn't fully cover the dashboard flow.
- **planned**: scoped, not yet wired in this scaffold.
- **unsupported**: no plan to support today.

> The `wix.get_capabilities` tool re-renders this matrix per site at runtime,
> incorporating the real installed-app permissions and module enablement.

| Domain                | Tool name                                     | Backend     | Status     | Notes                                                                 |
| --------------------- | --------------------------------------------- | ----------- | ---------- | --------------------------------------------------------------------- |
| Foundation            | wix.get_capabilities                          | api         | api        | Pulls App Instance + per-module probes.                                |
| Foundation            | wix.list_sites                                | api         | partial    | Returns active identity only; full list belongs in wix-backend.        |
| Foundation            | wix.get_app_instance                          | api         | api        | `/apps/v1/instance`.                                                  |
| Foundation            | wix.get_health                                | api         | planned    |                                                                       |
| Foundation            | wix.get_audit_log                             | api         | planned    |                                                                       |
| Contacts              | contacts.list                                 | api         | api        | `/contacts/v4/contacts`.                                              |
| Contacts              | contacts.create                               | api         | api        | Idempotent.                                                           |
| Contacts              | contacts.update                               | api         | planned    |                                                                       |
| Contacts              | contacts.add_labels                           | api         | planned    |                                                                       |
| Contacts              | contacts.merge_plan / merge_execute           | api         | planned    | High risk; plan/execute split mandatory.                               |
| Members               | members.list / get / create                   | api         | planned    |                                                                       |
| Members               | members.block_or_approve                      | api         | planned    |                                                                       |
| Inbox                 | inbox.list_conversations                      | api         | api        | Channel mix is per-site.                                               |
| Inbox                 | inbox.send_message                            | api         | api        | Channel availability gated by capability.                              |
| Inbox                 | inbox.get_channel_capabilities                | api         | planned    | Probes which channels are provisioned.                                |
| Email Marketing       | email_marketing.list_campaigns                | api         | api        | List/get/test/reuse/publish/stats supported by API.                    |
| Email Marketing       | email_marketing.send_test                     | api         | planned    |                                                                       |
| Email Marketing       | email_marketing.reuse_campaign                | api         | planned    |                                                                       |
| Email Marketing       | email_marketing.publish_plan / execute        | api         | planned    | Plan/execute mandatory.                                                |
| Email Marketing       | email_marketing.create_campaign_via_dashboard | bridge/auto | planned    | API does NOT support brand-new campaign creation; UI fallback needed. |
| eCommerce Orders      | ecom_orders.list                              | api         | api        |                                                                       |
| eCommerce Orders      | ecom_orders.get_order                         | api         | api        | Single-order fetch; powers plan/execute tools.                         |
| eCommerce Orders      | ecom_orders.refund_plan                       | api         | api        | Reads transaction refundability.                                       |
| eCommerce Orders      | ecom_orders.refund_execute                    | api         | api        | High risk. confirm + FEATURE_DESTRUCTIVE_WRITES, dryRun supported.     |
| eCommerce Orders      | ecom_orders.capture_payment_plan              | api         | api        | Lists capturable transactions.                                         |
| eCommerce Orders      | ecom_orders.capture_payment_execute           | api         | api        | High risk. confirm + FEATURE_DESTRUCTIVE_WRITES, dryRun supported.     |
| eCommerce Orders      | ecom_orders.void_payment_plan                 | api         | api        | Lists voidable transactions.                                           |
| eCommerce Orders      | ecom_orders.void_payment_execute              | api         | api        | High risk. confirm + FEATURE_DESTRUCTIVE_WRITES, dryRun supported.     |
| eCommerce Orders      | ecom_orders.update_payment_status             | api         | api        | Medium risk. confirm required.                                         |
| eCommerce Orders      | ecom_orders.cancel_*                          | api         | planned    |                                                                       |
| Pricing Plans         | pricing_plans.mark_offline_order_paid         | api         | planned    | `markAsPaid`.                                                         |
| Pricing Plans         | pricing_plans.list_orders / pause / resume    | api         | planned    |                                                                       |
| Invoices              | billable_items.list / create / update / bulk  | api         | planned    |                                                                       |
| Invoices              | invoices.list_order_invoice_refs              | api         | planned    | Limited; references only.                                              |
| Invoices              | invoices.create_via_dashboard_automation      | bridge/auto | planned    | UI-only fallback.                                                     |
| Bookings              | bookings.list_services / create / update      | api         | planned    |                                                                       |
| Bookings              | bookings.list_staff / create                  | api         | planned    |                                                                       |
| Bookings              | bookings.query_availability                   | api         | planned    |                                                                       |
| Bookings              | bookings.create_booking / reschedule / cancel | api         | planned    |                                                                       |
| Stores                | stores.list_products / create / update        | api         | planned    | Catalog v3.                                                           |
| CMS                   | cms.list_collections / create                 | api         | planned    |                                                                       |
| CMS                   | cms.list_items / upsert_item                  | api         | planned    |                                                                       |
| Media                 | media.list_files / upload_request / mkdir     | api         | planned    | Media Manager API.                                                    |
| Automations           | automations.list / get / create / update      | api         | planned    | Automations V2.                                                       |
| Automations           | automations.run_custom_trigger                | api         | planned    |                                                                       |
| Contributors          | contributors.list                             | api         | planned    | Account-level.                                                        |
| Contributors          | contributors.update_roles_plan / execute      | api         | planned    | High risk.                                                            |
| Domains               | domains.list_connected                        | api         | planned    | Account-level.                                                        |
| SEO                   | seo.get_robots_txt / update_robots_txt        | api         | planned    |                                                                       |
| Dashboard UI Parity   | dashboard_ui.navigate / snapshot / run_task   | automation  | planned    | Feature-flagged.                                                      |
| Dashboard UI Parity   | dashboard_ui.create_email_campaign            | automation  | planned    | Workflow stub registered.                                              |
| Dashboard UI Parity   | dashboard_ui.mark_order_paid_if_ui_only       | automation  | planned    |                                                                       |
