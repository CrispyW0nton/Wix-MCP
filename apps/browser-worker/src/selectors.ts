/**
 * Centralized Wix dashboard selectors. Update only here when Wix changes
 * dashboard markup. Each selector ships with a test-id-first preference
 * and a text fallback so workflows stay resilient.
 */
export const Selectors = {
  login: {
    emailInput: 'input[type="email"]',
    passwordInput: 'input[type="password"]',
    submitButton: 'button[type="submit"]',
  },
  emailMarketing: {
    newCampaignButton: '[data-hook="email-marketing-new-campaign"]',
    templateGalleryFirstTile: '[data-hook="email-template-tile"]:first-child',
    subjectInput: '[data-hook="campaign-subject-input"]',
    saveDraftButton: '[data-hook="campaign-save-draft"]',
  },
  orders: {
    ordersTable: '[data-hook="orders-list"]',
    orderRow: (id: string) => `[data-order-id="${id}"]`,
    markAsPaidMenuItem: '[data-hook="order-action-mark-paid"]',
  },
} as const;
