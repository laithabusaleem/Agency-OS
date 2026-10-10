# Dependency inventory

Generated from `package.json` for release review. Prefer `npm ls --all` for the locked tree.

## Runtime (production)

| Package                                                | Role                             |
| ------------------------------------------------------ | -------------------------------- |
| `next`                                                 | App Router framework             |
| `react` / `react-dom`                                  | UI                               |
| `drizzle-orm` / `better-sqlite3`                       | SQLite persistence               |
| `iron-session`                                         | Encrypted session cookies        |
| `zod`                                                  | Validation                       |
| `bcryptjs`                                             | Password hashing                 |
| `pino` / `pino-pretty`                                 | Logging                          |
| `jose`                                                 | JWT/crypto utilities (available) |
| `@google/generative-ai`                                | Gemini agent provider            |
| `groq-sdk`                                             | Groq agent provider              |
| `openai`                                               | OpenRouter-compatible client     |
| `playwright`                                           | Optional browser QA for delivery |
| `date-fns`                                             | Date helpers                     |
| `lucide-react` + Radix UI                              | Icons / primitives               |
| `server-only`                                          | Server module boundary           |
| `sonner`                                               | Toasts                           |
| `dotenv`                                               | Env loading for scripts          |
| `clsx` / `tailwind-merge` / `class-variance-authority` | Styling helpers                  |

## Development

| Package                                        | Role                 |
| ---------------------------------------------- | -------------------- |
| `typescript` / `eslint` / `eslint-config-next` | Types + lint         |
| `vitest` / Testing Library / `jsdom`           | Tests                |
| `drizzle-kit` / `tsx`                          | Migrations + scripts |
| `tailwindcss` / `@tailwindcss/turbopack`       | CSS                  |
| `@types/*`                                     | Type packages        |
| `prettier`                                     | Formatting (Phase 6) |

## Security notes

- Keep API keys out of the client bundle (`NEXT_PUBLIC_*` must never hold secrets).
- Run `npm audit` regularly; address high/critical advisories before hosted deploy.
- Pin major upgrades behind CI (`typecheck`, `lint`, `test`, `build`).
