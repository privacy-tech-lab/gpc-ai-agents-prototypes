# Contributing

Reference for filing issues, opening PRs, and the writing conventions in this repo.

## Issues

Use the issue template at `.github/ISSUE_TEMPLATE/feature.md`. It pre-populates a body with five sections: Context, Goal, Approach, Acceptance criteria, Out of scope. Keep each section short and concrete.

For umbrella issues with sub-issues, use GitHub's native sub-issue and blocked-by relations rather than text-only mentions. Native relations show up in the issue UI and on the project board.

## Pull requests

Use the PR template at `.github/pull_request_template.md`. It pre-populates the body with Summary, Changes, Test plan, and Related.

One branch per feature, one PR per branch. Open the PR against `main`. Link the issue with `Closes #N` in the PR body so GitHub auto-closes the issue on merge.

When two or more feature branches are in flight, use `git worktree add ../prototypes-<short-name> <branch>` so each branch has its own working directory. Do not `git checkout` back and forth in the main checkout.

Do not delete a worktree while its PR is still in review. Wait until the PR is merged or closed.

## Writing rules

These apply to issue bodies, PR descriptions, commit messages, code comments, and any prose in the repo:

- No em-dashes. Use a comma, period, parentheses, or colon instead.
- Comma after a leading subordinate clause or prepositional phrase. "When X, ...", "Once X, ...", "In the X, ...".
- Plain, common wording. Avoid overtly complex words.
- Inclusive language. Use allowlist / denylist, primary / replica, etc. Do not use whitelist, blacklist, master / slave, or other exclusionary terms.
- Do not write "Generated with Claude Code" or `Co-Authored-By: Claude` in commits, PRs, READMEs, or any other output.
- American English spellings (normalize, summarize, behavior).

## Prototype ownership

| Prototype  | Author / primary reviewer |
|------------|----------------------------|
| prototype-1 | Shreya (skochar1)         |
| prototype-2 | Shreya (skochar1)         |
| prototype-3 | Ken (CapClark)            |
| prototype-4 | Vidur (vidurgupta01)      |
| prototype-5 | Ken (CapClark)            |
| prototype-7 | Ken (CapClark)            |
