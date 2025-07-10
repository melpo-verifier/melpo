# Contributing to Melpo Verifier

Thank you for considering contributing to Melpo Verifier! Here are some guidelines to help you get started.

## Development Setup

1. Make sure you have a NodeJS version >= v18 installed (v22 has been used for development of this project)
1. Download [PostgreSQL 17](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) and (optionally) [pgAdmin](https://www.pgadmin.org/download/) (included in PostgreSQL downloader)
2. Fork and clone the repository
3. Install dependencies: `npm install`
4. Rename `.env.example` to `.env` and configure your environment
5. Make your changes
6. Test your changes locally for any bugs
7. Submit a pull request

## Code Style

- Use 2 spaces for indentation.
- Follow existing naming conventions.
- Add comments for complex logic.
- Use meaningful variable names.
- Follow the ESLint rules.
- Run `npm run lint` before committing changes.

## Branch Naming

- Use the following format for branch names:
  - `feature/<feature-name>` for new features.
  - `bugfix/<issue-id or bug name>` for bug fixes.

## Pull Request Process

1. Ensure your code follows the existing style
2. Test your changes thoroughly
3. Provide a clear description of what your PR does
4. Reference any related issues (e.g., `Fixes #123`).

## Reporting Issues

When reporting issues, please include:

- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Any error messages including timestamp
