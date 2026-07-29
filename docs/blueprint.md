# Credential Generator Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that generates batches of Gmail-style username and strong password pairs for manual account signup. Stores settings and recent batches securely.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- single-user owner

## Success criteria

- User receives valid credential batches with configurable patterns
- Settings persist across sessions
- Generated files include both text preview and downloadable CSV

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with help and current settings summary
- **Generate Batch** (button, actor: user, callback: generate:start) — Initiate credential generation workflow
  - inputs: batch size, username pattern
  - outputs: downloadable text file, in-chat preview
- **View Settings** (button, actor: user, callback: settings:view) — Adjust username patterns, password policies, and batch limits
  - inputs: settings parameters
  - outputs: settings summary

## Flows

### credential_generation
_Trigger:_ /generate

1. Confirm batch size
2. Apply username pattern
3. Generate passwords
4. Format output
5. Send confirmation

_Data touched:_ CredentialBatch, UserSettings

### settings_management
_Trigger:_ settings:view

1. Display current settings
2. Prompt for changes
3. Validate new parameters
4. Save updated settings

_Data touched:_ UserSettings

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **CredentialBatch** _(retention: persistent)_ — Timestamped list of username+password pairs with optional note
  - fields: timestamp, items, note
- **UserSettings** _(retention: persistent)_ — Username patterns, password policies, and generation limits
  - fields: username_pattern, password_policy, max_batch_size, include_csv_header

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Adjust username patterns
- Configure password complexity
- Set batch size limits
- Toggle CSV header inclusion

## Notifications

- Batch generation confirmation with preview
- Settings update confirmation

## Permissions & privacy

- Only store data explicitly requested by owner
- Auto-purge batches after 30 days

## Edge cases

- Invalid batch size input
- Invalid username pattern syntax
- Password policy conflicts
- Storage limit reached

## Required tests

- End-to-end generation workflow with default settings
- Settings persistence across sessions
- Edge case input validation

## Assumptions

- Owner will manually verify generated credentials before use
- No external account verification needed
- Storage limits are sufficient for typical usage
