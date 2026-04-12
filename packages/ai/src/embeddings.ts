import { spawnSync } from "node:child_process";
import os from "node:os";

/**
 * Local MLX Embedding Implementation
 * Exclusively handles Mac local environment embedding tasks
 */
export async function generateLocalEmbedding(text: string): Promise<number[]> {
	const uvPath = "/opt/homebrew/bin/uv";
	const currentDir = process.cwd();

	let scriptPath: string;
	if (currentDir.endsWith("web")) {
		scriptPath = "../../packages/sentinel/scripts/mlx_embed.py";
	} else if (currentDir.endsWith("ai")) {
		scriptPath = "../sentinel/scripts/mlx_embed.py";
	} else {
		scriptPath = "packages/sentinel/scripts/mlx_embed.py";
	}

	const modelPath = process.env.MLX_MODEL_PATH;
	if (!modelPath) {
		throw new Error("MLX_MODEL_PATH is not set in .env.local");
	}

	const input = JSON.stringify([text]);

	const result = spawnSync(uvPath, ["-q", "run", scriptPath, modelPath], {
		input,
		encoding: "utf-8",
		env: process.env,
	});

	if (result.error || result.status !== 0) {
		console.error(
			"MLX Embedding Error. Status:",
			result.status,
			"Error:",
			result.error,
		);
		console.error("STDOUT:", result.stdout);
		console.error("STDERR:", result.stderr);
		throw new Error(
			`MLX embedding failed: ${result.stderr || result.error?.message || "Unknown error"}`,
		);
	}

	try {
		const output = JSON.parse(result.stdout);
		return output.embeddings[0];
	} catch (_e) {
		throw new Error(`Failed to parse MLX output: ${result.stdout}`);
	}
}

/**
 * Strategy Selector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	if (os.platform() !== "darwin") {
		// Just a failsafe. On VPS, we don't query RAG database at all.
		throw new Error(
			"Embeddings API generation was disabled in Cloud Mode by user request.",
		);
	}

	return generateLocalEmbedding(text);
}
