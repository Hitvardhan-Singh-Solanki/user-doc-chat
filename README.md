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
