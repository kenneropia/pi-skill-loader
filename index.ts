import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface SkillEntry {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
}

function expandPath(value: string, cwd: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	if (value.startsWith("./") || value.startsWith("../")) return resolve(cwd, value);
	return value;
}

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function safeIsDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!normalized.startsWith("---")) return { body: normalized.trim() };
	const end = normalized.indexOf("\n---", 3);
	if (end === -1) return { body: normalized.trim() };
	const raw = normalized.slice(4, end);
	const body = normalized.slice(end + 4).trim();
	const data: { name?: string; description?: string; body: string } = { body };
	for (const line of raw.split("\n")) {
		const match = line.match(/^([A-Za-z][\w-]*):\s*"?(.+?)"?\s*$/);
		if (match && (match[1] === "name" || match[1] === "description")) data[match[1]] = match[2];
	}
	return data;
}

function skillDirs(cwd: string): string[] {
	const settingsPath = join(agentDir(), "settings.json");
	const dirs = [
		join(agentDir(), "skills"),
		join(homedir(), ".agents", "skills"),
		join(homedir(), ".config", "agents", "skills"),
		join(homedir(), ".config", "amp", "skills"),
		resolve(cwd, ".agents", "skills"),
		resolve(cwd, ".pi", "skills"),
	];

	try {
		const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		if (Array.isArray(settings.skillLoaderPaths)) {
			for (const path of settings.skillLoaderPaths) dirs.push(expandPath(path, cwd));
		}
	} catch {
		// Optional settings only.
	}

	return [...new Set(dirs)].filter(safeIsDir);
}

function discoverSkills(cwd: string): SkillEntry[] {
	const skills = new Map<string, SkillEntry>();
	for (const dir of skillDirs(cwd)) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const filePath = join(dir, entry.name, "SKILL.md");
			if (!existsSync(filePath)) continue;
			const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
			const name = parsed.name || entry.name;
			if (skills.has(name)) continue;
			skills.set(name, {
				name,
				description: parsed.description || "",
				filePath,
				baseDir: dirname(filePath),
			});
		}
	}
	return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function collectFiles(baseDir: string): string[] {
	const files: string[] = [];
	function walk(dir: string) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name !== "SKILL.md") files.push(full);
		}
	}
	walk(baseDir);
	return files;
}

function formatSkillList(skills: SkillEntry[]): string {
	if (skills.length === 0) return "No skills found.";
	return skills.map((skill) => `- ${skill.name}${skill.description ? `: ${skill.description}` : ""}`).join("\n");
}

export default function skillLoader(pi: ExtensionAPI) {
	pi.registerTool({
		name: "skill",
		label: "Skill",
		description:
			"Discover and load specialized skills on demand. Use list=true to see available skills, " +
			"query to search by name/description, or name to load one skill's full instructions.",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Exact skill name to load." })),
			query: Type.Optional(Type.String({ description: "Search skills by name or description." })),
			list: Type.Optional(Type.Boolean({ description: "List all available skills." })),
		}),
		renderCall(args: any, theme: any) {
			const label = args.name ? `load ${args.name}` : args.query ? `search ${args.query}` : "list skills";
			return new Text(theme.fg("dim", "skill: ") + theme.fg("toolTitle", theme.bold(label)), 0, 0);
		},
		async execute(_toolCallId, params: any, _signal, _onUpdate, ctx) {
			const skills = discoverSkills(ctx.cwd);
			if (params.name) {
				const skill = skills.find((entry) => entry.name === params.name);
				if (!skill) {
					return {
						content: [{ type: "text" as const, text: `Skill "${params.name}" not found.\n\n${formatSkillList(skills)}` }],
						isError: true,
					};
				}
				const parsed = parseFrontmatter(readFileSync(skill.filePath, "utf8"));
				const parts = [
					`<loaded_skill name="${skill.name}">`,
					parsed.body,
					"",
					`Base directory: ${skill.baseDir}`,
					"Resolve scripts/, references/, assets/, and templates relative to that base directory.",
				];
				const files = collectFiles(skill.baseDir);
				if (files.length > 0) parts.push("", "<skill_files>", ...files.map((file) => `<file>${file}</file>`), "</skill_files>");
				parts.push("</loaded_skill>");
				return { content: [{ type: "text" as const, text: parts.join("\n") }], details: { header: skill.name } };
			}

			const query = String(params.query || "").toLowerCase();
			const result = query
				? skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query))
				: skills;
			return { content: [{ type: "text" as const, text: formatSkillList(result) }] };
		},
	});
}
