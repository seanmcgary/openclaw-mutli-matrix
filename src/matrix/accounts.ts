import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { CoreConfig, MatrixConfig } from "../types.js";
import { resolveMatrixConfig } from "./client.js";
import { credentialsMatchConfig, loadMatrixCredentials } from "./credentials.js";

export type ResolvedMatrixAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  homeserver?: string;
  userId?: string;
  config: MatrixConfig;
};

export function listMatrixAccountIds(cfg: CoreConfig): string[] {
  const base = cfg.channels?.matrix ?? {};
  
  // Check for multi-account structure
  const accounts = base.accounts;
  if (accounts && typeof accounts === 'object') {
    const accountIds = Object.keys(accounts).filter(id => id !== '*');
    if (accountIds.length > 0) {
      return accountIds;
    }
  }
  
  // Fall back to legacy single-account if top-level credentials exist
  if (base.homeserver || base.accessToken || base.userId || base.password) {
    return [DEFAULT_ACCOUNT_ID];
  }
  
  // Default to single account
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultMatrixAccountId(cfg: CoreConfig): string {
  const ids = listMatrixAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveMatrixAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedMatrixAccount {
  const accountId = normalizeAccountId(params.accountId);
  const base = params.cfg.channels?.matrix ?? {};
  
  // Check for account-specific config in accounts object
  const accountConfig = base.accounts?.[accountId];
  
  // Merge account config with base defaults (account-specific takes priority)
  const mergedConfig: MatrixConfig = accountConfig 
    ? {
        ...base,
        ...accountConfig,
        // Preserve nested objects properly
        dm: { ...base.dm, ...accountConfig.dm },
        groups: { ...base.groups, ...accountConfig.groups },
        rooms: { ...base.rooms, ...accountConfig.rooms },
        actions: { ...base.actions, ...accountConfig.actions },
      }
    : base;
  
  const enabled = mergedConfig.enabled !== false;
  const resolved = resolveMatrixConfig(params.cfg, process.env, accountId);
  const hasHomeserver = Boolean(resolved.homeserver);
  const hasUserId = Boolean(resolved.userId);
  const hasAccessToken = Boolean(resolved.accessToken);
  const hasPassword = Boolean(resolved.password);
  const hasPasswordAuth = hasUserId && hasPassword;
  const stored = loadMatrixCredentials(process.env, accountId);
  const hasStored =
    stored && resolved.homeserver
      ? credentialsMatchConfig(stored, {
          homeserver: resolved.homeserver,
          userId: resolved.userId || "",
        })
      : false;
  const configured = hasHomeserver && (hasAccessToken || hasPasswordAuth || Boolean(hasStored));
  
  return {
    accountId,
    enabled,
    name: mergedConfig.name?.trim() || undefined,
    configured,
    homeserver: resolved.homeserver || undefined,
    userId: resolved.userId || undefined,
    config: mergedConfig,
  };
}

export function listEnabledMatrixAccounts(cfg: CoreConfig): ResolvedMatrixAccount[] {
  return listMatrixAccountIds(cfg)
    .map((accountId) => resolveMatrixAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
