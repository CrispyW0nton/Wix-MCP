import type { AccessTokenRecord } from "./types.js";

/**
 * Pluggable token store. The default in-memory implementation is fine for
 * single-process deployments and tests; production multi-tenant deployments
 * should swap in a persistent store (Postgres, Redis, KMS-encrypted blob).
 */
export interface TokenStore {
  get(key: string): Promise<AccessTokenRecord | undefined>;
  set(key: string, record: AccessTokenRecord): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<AccessTokenRecord[]>;
}

export function tokenStoreKey(args: {
  identity: string;
  appInstanceId?: string;
  accountId?: string;
}): string {
  return [args.identity, args.appInstanceId ?? "_", args.accountId ?? "_"].join("::");
}

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, AccessTokenRecord>();

  async get(key: string): Promise<AccessTokenRecord | undefined> {
    return this.map.get(key);
  }

  async set(key: string, record: AccessTokenRecord): Promise<void> {
    this.map.set(key, record);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async list(): Promise<AccessTokenRecord[]> {
    return Array.from(this.map.values());
  }
}
