import { describe, expect, it } from "vitest";
import { buildRestartArgs } from "../src/utils/restart-args.js";

const entrypoint = "dist/cli.js";
const sessionFile = "/tmp/pi-session.jsonl";

function restartArgs(args: string[], file: string | undefined = sessionFile): string[] {
	return buildRestartArgs({ currentArgs: [entrypoint, ...args], preserveEntrypoint: true, sessionFile: file });
}

function restartArgsWithoutSession(args: string[]): string[] {
	return buildRestartArgs({ currentArgs: [entrypoint, ...args], preserveEntrypoint: true });
}

describe("buildRestartArgs", () => {
	it("removes positional prompts and file args", () => {
		expect(restartArgs(["say hi", "@prompt.md", "another prompt"])).toEqual([entrypoint, "--session", sessionFile]);
	});

	it("replaces continue and resume selectors with current session", () => {
		expect(restartArgs(["--continue"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["-c"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["--resume"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["-r"])).toEqual([entrypoint, "--session", sessionFile]);
	});

	it("replaces explicit session and fork selectors with current session", () => {
		expect(restartArgs(["--session", "old.jsonl"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["--session=old.jsonl"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["--fork", "old.jsonl"])).toEqual([entrypoint, "--session", sessionFile]);
		expect(restartArgs(["--fork=old.jsonl"])).toEqual([entrypoint, "--session", sessionFile]);
	});

	it("removes no-session when a session file exists", () => {
		expect(restartArgs(["--no-session"])).toEqual([entrypoint, "--session", sessionFile]);
	});

	it("preserves configuration flags", () => {
		expect(
			restartArgs([
				"--provider",
				"anthropic",
				"--model",
				"claude-sonnet-4-5",
				"--thinking",
				"low",
				"--tools",
				"read,bash",
				"-e",
				"./ext.ts",
				"--theme",
				"./theme.json",
				"--offline",
				"--verbose",
			]),
		).toEqual([
			entrypoint,
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5",
			"--thinking",
			"low",
			"--tools",
			"read,bash",
			"-e",
			"./ext.ts",
			"--theme",
			"./theme.json",
			"--offline",
			"--verbose",
			"--session",
			sessionFile,
		]);
	});

	it("preserves unknown extension flags and values", () => {
		expect(restartArgs(["--my-flag", "value", "--bool-flag", "--other=value"])).toEqual([
			entrypoint,
			"--my-flag",
			"value",
			"--bool-flag",
			"--other=value",
			"--session",
			sessionFile,
		]);
	});

	it("does not add a session flag without a session file", () => {
		expect(restartArgsWithoutSession(["--session", "old.jsonl", "--model", "gpt-4o", "prompt"])).toEqual([
			entrypoint,
			"--model",
			"gpt-4o",
		]);
	});

	it("supports compiled entrypoints without a script argument", () => {
		expect(
			buildRestartArgs({
				currentArgs: ["--continue", "--model", "gpt-4o", "prompt"],
				sessionFile,
			}),
		).toEqual(["--model", "gpt-4o", "--session", sessionFile]);
	});
});
