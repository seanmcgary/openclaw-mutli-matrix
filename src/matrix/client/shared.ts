import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { LogService } from "@vector-im/matrix-bot-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig } from "../../types.js";
import type { MatrixAuth } from "./types.js";
import { resolveMatrixAuth } from "./config.js";
import { createMatrixClient } from "./create-client.js";
import { DEFAULT_ACCOUNT_KEY } from "./storage.js";

type SharedMatrixClientState = {
  client: MatrixClient;
  key: string;
  started: boolean;
  cryptoReady: boolean;
  accountId: string;
};

// Multi-account client registry
const clientRegistry = new Map<string, SharedMatrixClientState>();
const clientPromises = new Map<string, Promise<SharedMatrixClientState>>();
const clientStartPromises = new Map<string, Promise<void>>();

function buildSharedClientKey(auth: MatrixAuth, accountId?: string | null): string {
  return [
    auth.homeserver,
    auth.userId,
    auth.accessToken,
    auth.encryption ? "e2ee" : "plain",
    accountId ?? DEFAULT_ACCOUNT_KEY,
  ].join("|");
}

async function createSharedMatrixClient(params: {
  auth: MatrixAuth;
  timeoutMs?: number;
  accountId?: string | null;
}): Promise<SharedMatrixClientState> {
  const accountId = params.accountId ?? DEFAULT_ACCOUNT_ID;
  const client = await createMatrixClient({
    homeserver: params.auth.homeserver,
    userId: params.auth.userId,
    accessToken: params.auth.accessToken,
    encryption: params.auth.encryption,
    localTimeoutMs: params.timeoutMs,
    accountId: params.accountId,
  });
  return {
    client,
    key: buildSharedClientKey(params.auth, params.accountId),
    started: false,
    cryptoReady: false,
    accountId,
  };
}

async function ensureSharedClientStarted(params: {
  state: SharedMatrixClientState;
  timeoutMs?: number;
  initialSyncLimit?: number;
  encryption?: boolean;
}): Promise<void> {
  if (params.state.started) {
    return;
  }
  
  const accountId = params.state.accountId;
  const existingPromise = clientStartPromises.get(accountId);
  if (existingPromise) {
    await existingPromise;
    return;
  }
  
  const startPromise = (async () => {
    const client = params.state.client;

    // Initialize crypto if enabled
    if (params.encryption && !params.state.cryptoReady) {
      try {
        const joinedRooms = await client.getJoinedRooms();
        if (client.crypto) {
          await client.crypto.prepare(joinedRooms);
          params.state.cryptoReady = true;
        }
      } catch (err) {
        LogService.warn("MatrixClientLite", `[${accountId}] Failed to prepare crypto:`, err);
      }
    }

    await client.start();
    params.state.started = true;
    LogService.info("MatrixClientLite", `[${accountId}] Client started`);
  })();
  
  clientStartPromises.set(accountId, startPromise);
  try {
    await startPromise;
  } finally {
    clientStartPromises.delete(accountId);
  }
}

export async function resolveSharedMatrixClient(
  params: {
    cfg?: CoreConfig;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    auth?: MatrixAuth;
    startClient?: boolean;
    accountId?: string | null;
  } = {},
): Promise<MatrixClient> {
  const accountId = params.accountId ?? DEFAULT_ACCOUNT_ID;
  const auth = params.auth ?? (await resolveMatrixAuth({ 
    cfg: params.cfg, 
    env: params.env,
    accountId,
  }));
  const key = buildSharedClientKey(auth, accountId);
  const shouldStart = params.startClient !== false;

  // Check if we already have a client for this account
  const existingState = clientRegistry.get(accountId);
  if (existingState?.key === key) {
    if (shouldStart) {
      await ensureSharedClientStarted({
        state: existingState,
        timeoutMs: params.timeoutMs,
        initialSyncLimit: auth.initialSyncLimit,
        encryption: auth.encryption,
      });
    }
    return existingState.client;
  }

  // Check if there's a pending creation for this account
  const existingPromise = clientPromises.get(accountId);
  if (existingPromise) {
    const pending = await existingPromise;
    if (pending.key === key) {
      if (shouldStart) {
        await ensureSharedClientStarted({
          state: pending,
          timeoutMs: params.timeoutMs,
          initialSyncLimit: auth.initialSyncLimit,
          encryption: auth.encryption,
        });
      }
      return pending.client;
    }
    // Key changed, stop old client
    pending.client.stop();
    clientRegistry.delete(accountId);
  }

  // Create new client for this account
  const createPromise = createSharedMatrixClient({
    auth,
    timeoutMs: params.timeoutMs,
    accountId,
  });
  
  clientPromises.set(accountId, createPromise);
  try {
    const created = await createPromise;
    clientRegistry.set(accountId, created);
    if (shouldStart) {
      await ensureSharedClientStarted({
        state: created,
        timeoutMs: params.timeoutMs,
        initialSyncLimit: auth.initialSyncLimit,
        encryption: auth.encryption,
      });
    }
    return created.client;
  } finally {
    clientPromises.delete(accountId);
  }
}

export async function waitForMatrixSync(_params: {
  client: MatrixClient;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  // @vector-im/matrix-bot-sdk handles sync internally in start()
  // This is kept for API compatibility but is essentially a no-op now
}

export function stopSharedClient(accountId?: string): void {
  if (accountId) {
    // Stop specific account
    const state = clientRegistry.get(accountId);
    if (state) {
      state.client.stop();
      clientRegistry.delete(accountId);
      LogService.info("MatrixClientLite", `[${accountId}] Client stopped`);
    }
  } else {
    // Stop all clients
    for (const [id, state] of clientRegistry.entries()) {
      state.client.stop();
      LogService.info("MatrixClientLite", `[${id}] Client stopped`);
    }
    clientRegistry.clear();
  }
}

export function getMatrixClientForAccount(accountId: string): MatrixClient | null {
  return clientRegistry.get(accountId)?.client ?? null;
}

export function listActiveMatrixAccounts(): string[] {
  return Array.from(clientRegistry.keys());
}
