# PI Skill Loader

Standalone PI extension package for discovering and loading skills from local skill directories on demand.

It registers one PI tool named `skill`, which can:

- list available skills
- search by skill name or description
- load a specific skill's `SKILL.md` content and related files

Discovery paths include:

- `~/.agents/skills`
- `~/.config/agents/skills`
- `~/.config/amp/skills`
- `./.agents/skills` in the current project
- `./.pi/skills` in the current project
- optional `settings.skillLoaderPaths` from the PI agent settings file

## PI package config

Use the package from GitHub or npm with an extension entry that points at the TypeScript source:

```json
{
  "source": "github:kenneropia/pi-skill-loader",
  "extensions": ["+index.ts"]
}
```

If your PI package config expects an npm package instead, the same repository is published as:

```json
{
  "source": "@kenneropia/pi-skill-loader",
  "extensions": ["+index.ts"]
}
```

## Local development

No build step is required. The package is intentionally plain TypeScript so PI can load the extension source directly.

## License

MIT
