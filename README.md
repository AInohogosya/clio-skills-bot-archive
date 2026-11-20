# Clio Skills Bot

Clio Skills Bot is a skill-driven assistant workbench that routes natural-language requests to the appropriate built-in skill. It performs calculations, conversions, text utilities, and other deterministic tasks locally, while clearly separating requests that use external services such as search, Wikipedia, or translation.

<img width="1024" height="572" alt="Clio Skills Bot interface" src="https://github.com/user-attachments/assets/ed78ba71-c5f7-4f3e-962a-51e083c1b516" />

## Highlights

- **Automatic skill routing** — Matches input against an ordered set of Unai-compatible skills and executes the first match.
- **Local execution** — Handles calculations, unit conversions, JSON formatting, hashes, password generation, and more without external API calls.
- **External lookup visibility** — Clearly distinguishes search, Wikipedia, and translation requests that may contact public APIs.
- **Responsive chat workbench** — Includes a chat interface, skill catalog, recent conversations, favorites, theme controls, and localization.
- **Modern TypeScript stack** — Combines React and Vite on the client with Express, tRPC, Drizzle ORM, and MySQL support on the server.

## Built-in Skills

| Category | Skills | Capabilities |
| --- | --- | --- |
| Conversation | Greeting, Joke, Dice & Random | Greetings, jokes, dice rolls, coin flips, and secure random integers |
| Research | Wikipedia Summary, Web Search Summary, Search Conversation | Wikipedia summaries, DuckDuckGo summaries, and conversational search results |
| Calculation | Calculator, Percentage Calculator | Arithmetic, algebraic operations, and percentage calculations |
| Conversion | Unit Converter, Color Converter, Number Base Converter, Roman Numerals, Unix Timestamp | Unit, color, numeric base, Roman numeral, and timestamp conversions |
| Text & Development | Translate, Text Statistics, JSON Formatter, UUID Generator, Base64 Encoder, Hash Generator, URL Slug Generator | Translation, text statistics, JSON formatting, UUID generation, Base64, hashing, and URL slugs |
| Security | Password Generator | Cryptographically secure passwords with configurable length and symbols |

Use `/help` in the chat to list available skill IDs, or `/help <skill_id>` for help with a specific skill.

## Getting Started

### Requirements

- Node.js 20 or later
- pnpm 10 (`corepack enable` or `npm install -g pnpm@10`)

### Quick Start (one command)

macOS / Linux:

```bash
./start.sh
```

Windows:

```cmd
start.cmd
```

The launcher verifies Node.js, installs dependencies (and pnpm, if missing) on first run, and starts the development server. For a production build and start in one step, run `./start.sh prod` (or `start.cmd prod`).

### Development (manual)

```bash
git clone https://github.com/AInohogosya/Clio-Skills-Bot.git
cd Clio-Skills-Bot
cp .env.example .env   # fill in your own values; never commit .env
pnpm install
pnpm dev
```

Open `http://localhost:3000` by default. Set `PORT` to use another port; if that port is occupied, the server tries the next available port. In development the server binds to `127.0.0.1` unless `HOST` is set.

## Usage Examples

Enter a request in the chat and Clio will select a matching skill automatically.

| Example | Skill |
| --- | --- |
| `12 and 8` or `12と8を足すと？` | Calculator |
| `20% of 150` or `150の20%は？` | Percentage Calculator |
| `10 km to m` or `10 km を m に変換` | Unit Converter |
| `JSON format: {"name":"Clio"}` | JSON Formatter |
| `generate password 24 chars` | Password Generator |
| `search: TypeScript` | Web Search Summary — external lookup |
| `what is a quantum computer?` | Wikipedia Summary — external lookup |
| `translate: Hello to Japanese` | Translate — external translation service |

Routing is pattern-based rather than LLM-based. Include the value, operation, and target clearly when the request is ambiguous.

## External Services and Privacy

Local skills run inside the application. Search and Wikipedia requests may contact public information APIs, and translation requests may contact an external translation service. Do not send confidential or sensitive text through external services.

The speed, availability, and content of external responses depend on the third-party service. Translation can use DeepL when `DEEPL_AUTH_KEY` is set; otherwise, the app can fall back to a public translation service or a local phrase dictionary. Review the privacy policies and terms of each service before use.

The server applies rate limits to public API routes, caps request bodies at 1 MB, and sends standard security headers. Manual catalog synchronization and schedule management require an admin account. See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy. Secrets must be provided through environment variables (see `.env.example`) and must never be committed to the repository.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm check` | Run TypeScript type checking |
| `pnpm test` | Run Vitest tests |
| `pnpm build` | Build the client and server |
| `pnpm start` | Start the production build |
| `pnpm db:push` | Generate and apply Drizzle migrations |
| `pnpm format` | Format files with Prettier |

Production build:

```bash
pnpm build
pnpm start
```

## Configuration

Basic local development works with `pnpm dev`. Authentication, cloud conversations, favorites, and catalog synchronization require the appropriate environment and database configuration.

| Environment variable | Purpose |
| --- | --- |
| `PORT` | HTTP server port (default: `3000`) |
| `HOST` | Bind address (default: `127.0.0.1` in development, `0.0.0.0` in production) |
| `DATABASE_URL` | MySQL database connection |
| `JWT_SECRET` | Session signing secret |
| `OAUTH_SERVER_URL` | OAuth server URL |
| `VITE_OAUTH_PORTAL_URL` | OAuth portal URL used by the login button |
| `VITE_APP_ID` | Application ID |
| `VITE_APP_TITLE` | Client display title |
| `OWNER_OPEN_ID` | Owner account identifier (receives the admin role) |
| `DEEPL_AUTH_KEY` | Optional; enables DeepL translation |
| `BUILT_IN_FORGE_API_URL` | Optional; backend for scheduled-task heartbeats and owner notifications |
| `BUILT_IN_FORGE_API_KEY` | Optional; API key for the backend above |

See `.env.example` for a complete template. To initialize the database schema:

```bash
pnpm db:push
```

Never commit secrets or credentials to the repository. `.env*` files and `.project-config.json` are git-ignored.

## Project Structure

```text
client/       React frontend
server/       Express/tRPC server, skill routing, and execution
shared/       Shared client/server definitions
drizzle/      Drizzle ORM schema and migrations
```

## Documentation

- `UNAI_INTEGRATION_NOTES.md` — Unai compatibility and integration decisions
- `THIRD_PARTY_NOTICES.md` — Third-party attribution and licenses
- `SECURITY.md` — Security policy and vulnerability reporting

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for credit and license details related to the Unai-derived implementation.

---

<p align="center">Clio Skills Bot — route the request to the right skill.</p>
