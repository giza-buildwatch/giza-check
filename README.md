# Giza check

**Every AI coding tool says "done." Giza checks.**

Giza looks at a project on GitHub and scores it against the nine things a real app needs: one safe copy of the code, it looks finished, people can reach it, you can check it's working, no passwords lying around, sign-up, payments, backups, and it keeps running while you sleep. A block only counts as built when Giza finds the evidence itself, never because you or your AI say so.

```
GIZA CHECK · you/your-app · 2026-11-05
1 proven (checked by Giza itself from evidence, not from what anyone says) · 1 passed the project's own tests · 1 your AI says so · 6 not started

✓ CHECKED      One safe copy of your code
· NOT CHECKED  People can reach it
~ AI SAYS SO   No passwords left lying around
✓ OWN TEST     Your data is backed up
...
DO THIS NEXT: No passwords left lying around. Ask your AI to search the code for keys and move any to the host's settings.
```

## Three ways to use it

**1. On every change, inside GitHub (one step in a workflow)**

```yaml
# .github/workflows/giza.yml
name: Giza check
on: [push, workflow_dispatch]
permissions:
  contents: read
  actions: read
  deployments: read
jobs:
  giza:
    runs-on: ubuntu-latest
    steps:
      - uses: giza-buildwatch/giza-check@v1
```

The pyramid appears in the run's summary every time you push. Add `with: { strict: "true" }` to fail the run whenever Giza finds a problem (✗ PROBLEM), such as a committed `.env` file.

**2. Let your AI check its own work** (Claude, ChatGPT, or any coding AI that can run commands)

Easiest: add Giza as a skill, so your AI checks before it ever says "done":

```bash
npx skills add giza-buildwatch/giza-check
```

That works with Claude Code, Cursor, Codex and the other agents the `skills` tool supports. Or paste this to your AI:

Paste this to your AI:

> Before you tell me anything is done, check your work with Giza:
> `curl -fsSL https://raw.githubusercontent.com/giza-buildwatch/giza-check/v1/giza-check.mjs -o giza-check.mjs && node giza-check.mjs OWNER/REPO`
> Only call a part "done" if Giza shows it as ✓ CHECKED. Show me Giza's result exactly as it is, then fix the next thing it names and check again.

**3. See it as a pyramid** on the Giza BuildWatch page, with a plain explanation of every block and what to tell your AI.

## What the marks mean

| Mark | Meaning | Counts as built? |
|---|---|---|
| ✓ CHECKED | Giza saw the proof itself | Yes |
| ✓ OWN TEST | A test the project wrote itself passed. Giza can't see what that test does. | No |
| ~ AI SAYS SO | Something is there, but not proven | No |
| ✗ PROBLEM | Giza found something broken | No |
| · NOT STARTED / NOT CHECKED | Nothing found, or Giza can't see it | No |

## Safe by design

- **Reads only.** It reads GitHub's API and opens your app's public address once. It never changes anything.
- **Your login stays with GitHub.** If a token is present (`GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`), it's sent only to `api.github.com`, never printed, and never sent anywhere else. Redirects off GitHub are refused.
- **Nothing is sent to us.** No telemetry, no copy kept.
- **A hostile project can't trick it.** Text from the project is cleaned of hidden characters and labelled as data, not instructions. The one site visit refuses private, local and reserved network addresses, checked at the moment of connecting.
- **Works inside AI sandboxes.** If the network uses a proxy (`HTTPS_PROXY`), Giza goes through it (Node 22.21+ or 24.5+). A login token GitHub rejects is dropped and the check carries on as a visitor.
- **One file, no dependencies, Node 18+.** Read it before you run it: [`giza-check.mjs`](giza-check.mjs).

Reviewed for security before release by an independent AI reviewer. Regression tests: [`giza-check.test.mjs`](giza-check.test.mjs) (`node --test`), run on every push along with the Action itself.

## Honest limits

It's a checklist, not a guarantee. Giza can only judge what it can see on GitHub and from outside your app. Some hosts don't report deploys to GitHub, so "People can reach it" may show as not checked even when your site is up.

## License

MIT. See [LICENSE](LICENSE). Free to use, copy and change; keep the copyright notice.
