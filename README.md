## for dev

```shell
docker-compose -f docker-compose.dev.yml up --build -d
```

## for prod

```shell
docker-compose up --build -d
```

## for stopping

```shell
docker-compose down
```

## migrations

```shell
docker compose run --rm backend npx node-pg-migrate up
```

## backend

```
backend/
├─ src/
│  ├─ controllers/
│  │  └─ auth.controller.ts
│  ├─ routes/
│  │  └─ auth.routes.ts
│  ├─ services/
│  │  └─ auth.service.ts
│  ├─ db/
│  │  └─ prisma.ts or pgClient.ts
│  ├─ models/
│  │  └─ user.model.ts (optional if using ORM)
│  ├─ utils/
│  │  └─ hash.ts
│  └─ app.ts
├─ package.json
├─ tsconfig.json
```
