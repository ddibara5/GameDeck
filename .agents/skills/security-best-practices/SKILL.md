---
name: security-best-practices
description: "Apply secure-by-default JavaScript/React web practices while editing GameDeck, passively flag critical security issues in touched code, and perform a structured security review when explicitly requested."
metadata:
  author: openai
  source: https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices
  gamedeck-adaptation: true
---

# Security Best Practices

Adapted from OpenAI's official `security-best-practices` skill for GameDeck's React + Vite + Supabase + Vercel architecture.

## Normal mode: secure by default

While writing or modifying GameDeck code:

- Never request, print, hard-code, or commit secrets.
- Treat all `VITE_*` values as public browser-visible configuration; never put secrets in them.
- Keep secret API credentials and privileged Supabase/service-role operations server-side.
- Prefer React's normal escaped rendering for untrusted strings.
- Avoid `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, string event handlers, or other code/HTML injection sinks unless there is a documented, reviewed need and safe sanitization.
- Treat URL/query/storage/API data as potentially untrusted when it reaches navigation, HTML, or privileged operations.
- Validate external URLs and block script-bearing schemes such as `javascript:`.
- Do not weaken CSP/CORS/auth/authorization or other protections merely to make a feature work.
- Preserve least privilege in Supabase/RLS and serverless/API access.
- Treat public client IDs/anon keys as public and scope their permissions accordingly.

## Passive review mode

When touching nearby code, call out only critical or high-confidence high-impact security issues that are directly relevant to the work. Do not derail ordinary UI/refactor tasks with speculative low-risk findings.

## Active security audit

When the user explicitly asks for a security audit/review:

1. Identify the languages/frameworks and deployment boundaries in scope.
2. Review browser-exposed configuration and secrets handling.
3. Review untrusted rendering/markdown/HTML paths.
4. Review direct DOM injection and dynamic-code execution.
5. Review auth/session and Supabase/RLS boundaries.
6. Review state-changing API/serverless endpoints and authorization.
7. Review navigation/redirect handling and external URLs.
8. Review third-party scripts and deployment/security-header posture where visible.
9. Prioritize evidence-based findings by severity and include file/line evidence.
10. Fix findings incrementally and rerun relevant tests/validation.

## Finding format

For active audits, each finding should include:

- severity
- location
- evidence
- impact
- recommended fix
- uncertainty/false-positive notes when applicable

## GameDeck compatibility

- GameDeck currently uses React 18 + Vite; do not introduce React 19 or Next.js patterns merely because upstream security references discuss them.
- Project-specific architecture and documented constraints take precedence where they deliberately differ from generic guidance.
- This skill supplements, rather than replaces, GameDeck's existing project context and deployment runbooks.
