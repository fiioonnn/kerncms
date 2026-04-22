# Kern CMS

A self-hosted, Git-based headless CMS. Connect your GitHub repo, define content types, and manage structured content through a visual editor — all changes are committed back to your repository.

[Website](https://kerncms.com) | [Documentation](https://kerncms.com/docs)

## Quick Start

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the setup wizard.

## Docker

```bash
docker compose up
```

## Tech Stack

- **Next.js** (App Router)
- **SQLite** + Drizzle ORM
- **GitHub App** integration for repo access
- **Better Auth** for authentication

## License

[AGPL-3.0](LICENSE)
