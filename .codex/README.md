# Codex setup

This project keeps Codex-specific setup in `.codex/`:

- `config.toml` enables the OpenAI developer documentation MCP server and sets
  conservative subagent limits.
- `agents/*.toml` defines project-scoped custom subagents for read-heavy review
  work.

Use subagents only when the prompt explicitly asks for parallel agents, for
example:

```text
Review this branch with subagents. Use repo_explorer, security_reviewer, and
frontend_reviewer, wait for all of them, then summarize findings by severity
with file references.
```

Most agents are read-only. Assign a narrow write scope explicitly before asking
any implementation-focused agent to edit files.
