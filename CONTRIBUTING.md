# Contributing to ViTransfer

Thank you for considering contributing to ViTransfer! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, professional, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Docker version, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Open a new issue with the "feature request" label
2. Describe the feature and its use case
3. Explain why this would be valuable
4. Consider implementation details if possible

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**:
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed
4. **Test your changes**:
   ```bash
   npm run build
   docker-compose up --build
   ```
5. **Commit** with clear messages:
   ```bash
   git commit -m "Add feature: descriptive message"
   ```
6. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** on GitHub

## Development Setup

### Prerequisites
- Node.js 20+
- Docker and Docker Compose
- Git

### Local Development

```bash
# Clone the repo
git clone https://github.com/MansiVisuals/ViTransfer.git
cd ViTransfer

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Start services
docker-compose up -d postgres redis

# Run migrations
npx prisma migrate dev

# Start dev server
npm run dev

# In another terminal, start worker
npm run worker
```

### Project Structure

```
vitransfer/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/             # Utility functions
│   └── worker/          # Background job processor
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── public/              # Static assets
└── docker-compose.yml   # Docker configuration
```

### Coding Standards

- **TypeScript**: Use strict typing
- **React**: Functional components with hooks
- **Styling**: Tailwind CSS utility classes
- **Files**: Keep components focused and reusable
- **Naming**: Descriptive names (camelCase for variables, PascalCase for components)

### Testing

```bash
# Run type check
npm run build

# Test Docker build
docker-compose build

# Test deployment
docker-compose up
```

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push --tags`
5. GitHub Actions will build and publish Docker images

## Questions?

- Open a discussion on GitHub
- Check existing issues and documentation
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the GNU General Public License v3.0 (GPL-3.0), keeping ViTransfer free and open-source for all.
