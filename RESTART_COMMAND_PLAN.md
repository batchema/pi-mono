# /restart Command Plan

## Goal

Add a proper built-in `/restart` command for pi interactive mode.

The command should gracefully shut down the current interactive process, start a fresh pi process, and resume the current session without replaying one-shot startup inputs.

## Constraints

- Follow existing pi conventions.
- Use CLI flags, not new environment variables.
- Do not implement this as an extension.
- Preserve normal startup configuration such as model, tools, extensions, themes, and provider flags.
- Avoid replaying original positional prompts or `@file` arguments.
- Let extensions observe restart as a distinct shutdown reason.

## User-Facing Behavior

When the user types:

```text
/restart
```

pi should:

1. Stop the current TUI cleanly.
2. Emit `session_shutdown` to extensions with reason `"restart"`.
3. Spawn a new pi process using the current executable.
4. Resume the current persisted session via `--session <current-session-file>`.
5. Exit the old process with code `0` after the new process is spawned.

If the current session is ephemeral (`--no-session`) and has no session file, pi should restart without adding `--session`.

## Files to Change

### `packages/coding-agent/src/core/slash-commands.ts`

Add `restart` to `BUILTIN_SLASH_COMMANDS` so autocomplete and command discovery include it.

Suggested description:

```ts
{ name: "restart", description: "Restart pi and resume this session" }
```

### `packages/coding-agent/src/modes/interactive/interactive-mode.ts`

Add built-in command handling near `/reload` and `/quit`:

```ts
if (text === "/restart") {
  this.editor.setText("");
  await this.restart();
  return;
}
```

Add a private `restart()` method that:

1. Guards against duplicate restart/shutdown.
2. Unregisters signal handlers.
3. Drains terminal input like `shutdown()` does.
4. Stops the TUI.
5. Disposes the runtime with shutdown reason `"restart"`.
6. Spawns the replacement process with normalized argv and inherited stdio.
7. Waits for the replacement process to exit.
8. Exits with the replacement process exit code.

Use `process.execPath` as the executable and `process.execArgv` plus normalized `process.argv.slice(1)` as args. This preserves Node loader flags used by local TypeScript development harnesses.

### `packages/coding-agent/src/core/extensions/types.ts`

Extend `SessionShutdownEvent.reason`:

```ts
reason: "quit" | "reload" | "restart" | "new" | "resume" | "fork";
```

This lets extensions distinguish a normal quit from a restart.

### `packages/coding-agent/src/core/agent-session-runtime.ts`

Change `dispose()` to accept an optional reason:

```ts
async dispose(reason: SessionShutdownEvent["reason"] = "quit"): Promise<void>
```

Use that reason when emitting `session_shutdown`.

Existing callers continue to use the default. `/restart` calls:

```ts
await this.runtimeHost.dispose("restart");
```

### `packages/coding-agent/README.md`

Add `/restart` to the interactive command table.

### `packages/coding-agent/CHANGELOG.md`

Add an `Unreleased` entry under `### Added`:

```md
- Added `/restart` to restart pi and resume the current session.
```

## Argv Normalization

The replacement process should preserve configuration flags but remove one-shot inputs and session selectors.

Strip:

- positional prompt messages
- `@file` arguments
- `--continue`, `-c`
- `--resume`, `-r`
- `--fork <value>`
- `--session <value>`
- `--no-session`

Then append:

```text
--session <current-session-file>
```

when `session.sessionFile` is available.

Preserve other flags, including:

- `--provider`
- `--model`
- `--api-key`
- `--thinking`
- `--models`
- `--tools`, `-t`
- `--no-tools`, `-nt`
- `--no-builtin-tools`, `-nbt`
- `--extension`, `-e`
- `--no-extensions`, `-ne`
- `--skill`
- `--no-skills`, `-ns`
- `--prompt-template`
- `--no-prompt-templates`, `-np`
- `--theme`
- `--no-themes`
- `--no-context-files`, `-nc`
- `--offline`
- `--verbose`
- unknown extension flags and their values

The helper should be conservative and covered by tests. The tricky case is unknown extension flags that may or may not have values.

## Spawn Details

Use `spawn()` from `node:child_process`:

```ts
const child = spawn(process.execPath, [...process.execArgv, ...restartArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
```

Do not detach. The old process must wait for the child process to exit. This keeps the original process tree in the terminal foreground while the replacement pi runs. Exiting immediately after spawning can leave the replacement process orphaned/backgrounded, causing `setRawMode EIO` when it tries to initialize the TUI. Inherited stdio gives the new process the same terminal.

If spawning fails, print a clear error to stderr and exit non-zero after restoring the terminal.

## Testing Plan

Add unit tests for argv normalization.

Suggested cases:

1. Removes positional prompts and `@file` args.
2. Replaces `--continue` with `--session <file>`.
3. Replaces `--resume` with `--session <file>`.
4. Replaces existing `--session old` with `--session <file>`.
5. Removes `--fork old` and adds `--session <file>`.
6. Removes `--no-session` when a session file exists.
7. Preserves model/tool/extension/theme flags.
8. Preserves unknown extension flags.
9. Handles no session file by stripping session selectors and not adding `--session`.

After code changes, run:

```bash
npm run check
```

If a test file is added or modified, run that specific test file from the package root and iterate until it passes.

## Open Decisions

- Whether to expose restart through extension command contexts later. Initial implementation should only add the built-in interactive `/restart` command.
- Whether to support restart in RPC mode. Initial implementation should not; this is an interactive command.
- Whether restart should preserve the exact selected cwd from a resumed external session. The first implementation should use the current process cwd and `--session <file>`, matching existing session resume behavior.
