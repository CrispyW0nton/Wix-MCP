import { z } from "zod";

export const SiteContextSchema = z
  .object({
    siteId: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    appInstanceId: z.string().min(1).optional(),
  })
  .refine(
    (v) => Boolean(v.siteId || v.domain || v.appInstanceId),
    "Provide at least one of siteId, domain, or appInstanceId.",
  );

export const PagingSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const ConfirmSchema = z
  .object({
    confirm: z.literal(true).describe("Must be true to execute mutations."),
    dryRun: z.boolean().optional().describe("If true, validate inputs but do not execute."),
    idempotencyKey: z.string().min(8).optional(),
  })
  .strict();

export type SiteContextInputT = z.infer<typeof SiteContextSchema>;
export type PagingInputT = z.infer<typeof PagingSchema>;
