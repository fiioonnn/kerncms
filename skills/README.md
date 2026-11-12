# kern CMS skill for AI assistants

`kern-cms/` is an [Agent Skill](https://agentskills.io): it teaches Claude, ChatGPT, Codex and other assistants how to connect a site to kern, so that its text and images become editable in the kern dashboard.

```
kern-cms/
  SKILL.md                  # instructions (the assistant reads this)
  references/field-types.md # every field type, loaded when needed
```

## 1. Build the ZIP (for apps that take an upload)

```bash
npm run skill:zip
```

This creates `skills/kern-cms.zip` with the `kern-cms` folder at the root of the archive, which is the layout upload dialogs expect.

## 2. Install

### Claude desktop app and claude.ai

1. Open **Settings → Capabilities** and make sure **Code execution** is on (skills need it).
2. In **Skills**, click **Upload skill** and pick `kern-cms.zip`. Newer versions of the app may have this under **Customize → Skills → + → Upload a skill**.
3. Make sure **kern-cms** is switched on in the skills list.

Skills need a paid plan. On Team/Enterprise, an owner may need to allow custom skills first. A skill uploaded here is only for your account; each teammate uploads it too, unless an admin shares it with the organization.

### Claude Code

Copy the folder into a skills directory. No ZIP needed:

```bash
# for you, in every project
cp -r skills/kern-cms ~/.claude/skills/

# or only for one website's repo (commit it so your team gets it)
cp -r skills/kern-cms /path/to/your-site/.claude/skills/
```

Start a new session. Claude uses the skill automatically when you talk about kern; you can also run `/kern-cms`.

### ChatGPT

1. In ChatGPT, open **Skills** (in the sidebar or under your profile, depending on version) and upload `kern-cms.zip`.
2. If your plan doesn't show Skills yet, or your workspace admin has them off, use a Project instead: create a **Project**, paste the contents of `SKILL.md` (without the `---` header) into the project instructions, and add `references/field-types.md` as a project file.

### OpenAI Codex

Copy the folder into your website repository:

```bash
mkdir -p /path/to/your-site/.agents/skills
cp -r skills/kern-cms /path/to/your-site/.agents/skills/
```

Codex also reads a personal skills folder; OpenAI's Codex skills documentation gives its location for your version. Restart Codex after adding the skill.

### Cursor, Windsurf, Copilot and others

If the tool supports Agent Skills, copy `kern-cms/` into its skills folder (many read `.agents/skills/`). Otherwise put the contents of `SKILL.md` into its project rules, for example `.cursor/rules/kern.mdc`, `AGENTS.md` or `.github/copilot-instructions.md`.

## 3. Use it

Open your website project with the assistant and ask, for example:

- "Make the homepage editable in kern."
- "Move the hardcoded footer text into a kern global."
- "Which texts on the pricing page are still hardcoded?"
- "Add a testimonials section with name, quote and photo to the about page."

Commit and deploy afterwards. The new sections then appear in the kern dashboard, and its preview shows the deployed result.

## Updating

After editing `SKILL.md`, run `npm run skill:zip` again and re-upload, or copy the folder again for Claude Code and Codex.
