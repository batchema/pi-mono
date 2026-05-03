const SESSION_SELECTOR_FLAGS = new Set(["--continue", "-c", "--resume", "-r", "--no-session"]);
const SESSION_VALUE_FLAGS = new Set(["--session", "--fork"]);

const KNOWN_VALUE_FLAGS = new Set([
	"--provider",
	"--model",
	"--api-key",
	"--system-prompt",
	"--append-system-prompt",
	"--session-dir",
	"--models",
	"--tools",
	"-t",
	"--thinking",
	"--export",
	"--extension",
	"-e",
	"--skill",
	"--prompt-template",
	"--theme",
	"--mode",
]);

const KNOWN_BOOLEAN_FLAGS = new Set([
	"--help",
	"-h",
	"--version",
	"-v",
	"--print",
	"-p",
	"--no-tools",
	"-nt",
	"--no-builtin-tools",
	"-nbt",
	"--no-extensions",
	"-ne",
	"--no-skills",
	"-ns",
	"--no-prompt-templates",
	"-np",
	"--no-themes",
	"--no-context-files",
	"-nc",
	"--list-models",
	"--verbose",
	"--offline",
]);

export interface BuildRestartArgsOptions {
	currentArgs: string[];
	sessionFile?: string;
	preserveEntrypoint?: boolean;
}

function isValueLike(arg: string | undefined): arg is string {
	return arg !== undefined && !arg.startsWith("-") && !arg.startsWith("@");
}

/**
 * Build argv for a restarted pi process.
 *
 * Preserves configuration flags, removes one-shot prompt/file inputs and session
 * selectors, then resumes the current session with `--session <file>` when one
 * exists. `currentArgs` should be `process.argv.slice(1)`; when running through
 * Node, set `preserveEntrypoint` so the CLI script path is kept as argv[0].
 */
export function buildRestartArgs(options: BuildRestartArgsOptions): string[] {
	const { currentArgs, preserveEntrypoint, sessionFile } = options;
	const result: string[] = [];
	let index = 0;

	if (preserveEntrypoint && currentArgs[0]) {
		result.push(currentArgs[0]);
		index = 1;
	}

	while (index < currentArgs.length) {
		const arg = currentArgs[index];

		if (SESSION_SELECTOR_FLAGS.has(arg)) {
			index++;
			continue;
		}

		if (SESSION_VALUE_FLAGS.has(arg)) {
			index += isValueLike(currentArgs[index + 1]) ? 2 : 1;
			continue;
		}

		if (arg.startsWith("--session=") || arg.startsWith("--fork=")) {
			index++;
			continue;
		}

		if (arg.startsWith("@") || !arg.startsWith("-")) {
			index++;
			continue;
		}

		result.push(arg);

		if (KNOWN_VALUE_FLAGS.has(arg)) {
			if (currentArgs[index + 1] !== undefined) {
				result.push(currentArgs[index + 1]);
				index += 2;
			} else {
				index++;
			}
			continue;
		}

		if (KNOWN_BOOLEAN_FLAGS.has(arg) || arg.includes("=")) {
			index++;
			continue;
		}

		// Unknown extension flags follow parseArgs() convention: if the next token
		// looks like a value, keep it as that flag's value.
		if (isValueLike(currentArgs[index + 1])) {
			result.push(currentArgs[index + 1]);
			index += 2;
		} else {
			index++;
		}
	}

	if (sessionFile) {
		result.push("--session", sessionFile);
	}

	return result;
}
