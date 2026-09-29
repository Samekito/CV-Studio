# ADK starter, setup

Two core files and eight optional add-ons. Nothing here is language-specific, the stack only shows
up in the placeholders you fill.

The core is `CLAUDE.md`, the only file loaded automatically, plus `agent-development-kit.md`, the
reference it points at. Copy those two, fill the placeholders, and you have a working setup.

The seven files under `.claude/` are layers 2 to 5 made real. The blueprint only describes those
layers, it does not generate them, and nothing reads it looking for work to do. A skill that does
not exist as a `SKILL.md` never loads, and a hook script that `settings.json` does not name never
runs. Add each one when you want what it buys.

## Install

1. Copy `CLAUDE.md` and `agent-development-kit.md` into the repo root. The `.claude/` folder is
   optional, take it now or add pieces later.
2. Fill every `<PLACEHOLDER>` in `CLAUDE.md`. Search for `<` to find them all. Delete the rows and
   rules that do not apply, an unfilled template is worse than a short honest file.
3. Rename `.claude/skills/example-domain-skill/` to a real domain and write its description first.
   The description is the only thing matched against a task, so vague wording means the skill never
   loads. One skill per boundary that has its own conventions.
4. Fill `.claude/hooks/SessionStart.sh` with the local URLs and the one rule that costs the most
   when forgotten. Keep it short, its output is added to context every session.
5. Fill the names in `.claude/subagents/code-reviewer.md` and `.claude/plugins/plugin.json`.
6. Restart the agent session so `.claude/settings.json` is read, then confirm the hooks are live.
7. Installing third-party skills? Do that through `.claude/skills/EXTERNAL.md`, which classifies the
   three shapes they come in and covers scope, pinning and conflict precedence. Skip it if you are
   only writing your own.

## Confirm the hooks actually run

Registration is the step everyone skips. A hook script sitting in `.claude/hooks/` does nothing
until `.claude/settings.json` names it, and a hook that is never triggered looks identical to a
hook that works.

```bash
# should print the block message and exit 2
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"x\nCo-authored-by: Some AI <a@b>\""}}' \
  | bash .claude/hooks/PreToolUse.sh; echo "exit=$?"

# should print nothing and exit 0
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"feat: x\""}}' \
  | bash .claude/hooks/PreToolUse.sh; echo "exit=$?"
```

The payload arrives as JSON on stdin. A hook written against a `$TOOL_INPUT` environment variable
reads empty and silently allows everything.

## What goes where

| Layer | Lives in                | Loaded            | Put this in it                                   |
| ----- | ----------------------- | ----------------- | ------------------------------------------------ |
| L1    | `CLAUDE.md`             | every request     | only what is always true about this repo         |
| L2    | `.claude/skills/`       | on description match | per-domain conventions, patterns, gotchas     |
| L3    | `.claude/hooks/`        | on tool events    | rules that must hold even if context is lost     |
| L4    | `.claude/subagents/`    | when delegated    | jobs whose output matters more than their noise  |
| L5    | `.claude/plugins/`      | once installed    | the manifest that ships L2 to L4 to the team     |

The test for L1: would this sentence be worth its context cost on a request that has nothing to do
with it? If not, it belongs in a skill.

## Two failure modes worth knowing

**Do not paste the ADK into CLAUDE.md.** The ADK's own project-setup rule says to, and that rule is
self-defeating: it is a document arguing for layered on-demand context that then asks to be loaded
on every turn. Roughly half of it will not apply to any given project. `CLAUDE.md` keeps the always-on
rules restated in full and points at the rest through the `agent-dev-kit` skill.

**Never name a formatter the repo has not actually been formatted with.** If `CLAUDE.md` says the
formatter is the authority and running it would rewrite half the tree, the rule cannot be followed
and the agent will either ignore it or bury your change in a reformat diff. Run the formatter on day
one, in its own commit, or say plainly in `CLAUDE.md` that sibling files are the authority instead.
