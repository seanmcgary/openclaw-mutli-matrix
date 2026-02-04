# Multi-Matrix Plugin

Multi-account Matrix channel plugin for OpenClaw. Forked from the official Matrix plugin to add support for multiple Matrix accounts simultaneously.

## Features

- ✅ Multiple Matrix accounts per gateway
- ✅ Per-account agent bindings
- ✅ Backward compatible with single-account configs
- ✅ Account-specific credential storage
- ✅ All features from the official Matrix plugin (E2EE, threads, polls, etc.)

## Installation

```bash
openclaw plugins install /Users/seanmcgary/.openclaw/workspace/kevin/multi-matrix
```

## Configuration

### Multi-Account Setup

```json
{
  "channels": {
    "multi-matrix": {
      "enabled": true,
      "accounts": {
        "kevin": {
          "homeserver": "https://matrix.seanmcgary.com",
          "accessToken": "syt_a2V2aW4_...",
          "dm": {
            "policy": "open",
            "allowFrom": ["*"]
          }
        },
        "pete": {
          "homeserver": "https://matrix.seanmcgary.com",
          "accessToken": "syt_cGV0ZQ_...",
          "dm": {
            "policy": "open",
            "allowFrom": ["*"]
          }
        }
      }
    }
  },
  "bindings": [
    { "agentId": "kevin", "match": { "channel": "multi-matrix", "accountId": "kevin" } },
    { "agentId": "pete", "match": { "channel": "multi-matrix", "accountId": "pete" } }
  ]
}
```

### Legacy Single-Account (Backward Compatible)

```json
{
  "channels": {
    "multi-matrix": {
      "enabled": true,
      "homeserver": "https://matrix.example.org",
      "accessToken": "syt_...",
      "dm": {
        "policy": "pairing"
      }
    }
  }
}
```

## Per-Account Settings

Each account in the `accounts` object supports all the same settings as the top-level config:

- `homeserver` - Matrix homeserver URL
- `accessToken` - Access token for authentication
- `userId` - Optional, fetched automatically if using access token
- `password` - For password-based login (instead of access token)
- `encryption` - Enable E2EE (default: false)
- `dm` - DM policy and allowlist
- `groups` - Room allowlist and settings
- `autoJoin` - Auto-join room invites
- `threadReplies` - Thread reply behavior
- And all other Matrix channel settings...

Settings cascade: account-specific settings override top-level defaults.

## Credentials Storage

Credentials are stored per-account in:
```
~/.openclaw/credentials/matrix/<accountId>/credentials.json
```

Sync state and crypto data are stored in:
```
~/.openclaw/matrix/accounts/<accountId>/<homeserver>__<userId>/<token-hash>/
```

## Agent Bindings

Use `bindings` to route messages from specific Matrix accounts to specific agents:

```json
{
  "bindings": [
    { "agentId": "pete", "match": { "channel": "multi-matrix", "accountId": "pete" } },
    { "agentId": "kevin", "match": { "channel": "multi-matrix", "accountId": "kevin" } }
  ]
}
```

## Differences from Official Matrix Plugin

- **Channel ID**: `multi-matrix` instead of `matrix`
- **Multi-account support**: Can run multiple Matrix accounts simultaneously
- **Config path**: Uses `channels.multi-matrix` instead of `channels.matrix`
- Otherwise, all features and APIs are identical

## Development

This plugin was forked specifically to add multi-account support to Matrix. It follows the same multi-account pattern as the WhatsApp plugin.

### Key Implementation Details

1. **Account Resolution** (`src/matrix/accounts.ts`):
   - `listMatrixAccountIds()` checks for `accounts` object, falls back to legacy single-account
   - `resolveMatrixAccount()` merges account-specific config with base defaults

2. **Client Registry** (`src/matrix/client/shared.ts`):
   - Maintains `Map<accountId, MatrixClient>` instead of single shared client
   - Each account gets its own client instance and sync loop

3. **Credential Storage** (`src/matrix/credentials.ts`):
   - All functions accept optional `accountId` parameter
   - Credentials stored in account-specific subdirectories

4. **Monitor** (`src/matrix/monitor/index.ts`):
   - Already accepts `accountId` in options
   - OpenClaw core calls `startAccount()` per account, which calls `monitorMatrixProvider()` with accountId

## License

Same as OpenClaw (check main repo for license details).
