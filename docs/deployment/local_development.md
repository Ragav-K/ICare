# Local Development Deployment

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis:

```powershell
docker compose up -d
```

3. Install Node dependencies:

```powershell
npm install
```

4. Generate Prisma client and run migrations:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

5. Start the backend:

```powershell
npm run dev:backend
```

MATLAB must remain locally installed for retinal AI inference and training.
