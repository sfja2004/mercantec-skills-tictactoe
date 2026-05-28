# Deployment

Both services are containerized and orchestrated via `docker-compose.yml` at the repo root.

## Layout

Build context is the repo root for both services because the frontend imports protocol types from `backend/src/protocol.ts`.

## Build & run

```sh
docker compose build
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend health (via nginx): http://localhost:3000/health
- WebSocket (via nginx): `ws://localhost:3000/ws`

The backend is **not** published on the host - it is only reachable from the frontend container over the compose network.

Stop:

```sh
docker compose down
```

Rebuild after code changes:

```sh
docker compose build --no-cache <service>
docker compose up -d
```

## Configuration

Environment variables:

| Var               | Service | Default | Purpose                                                                                                                                          |
| ----------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`            | backend | `9000`  | WS server port inside the container                                                                                                              |
| `ALLOWED_ORIGINS` | backend | empty   | Comma-separated origin allowlist for the WS upgrade. Empty = allow all. Set to your prod frontend origin (e.g. `https://tictactoe.example.com`). |

Set them in a `.env` file next to `docker-compose.yml` or export them in the shell before `docker compose up`.

## Frontend WS URL

The frontend `TicTacToeClient` takes the WS URL via constructor (`opts.url`). Point it at the same origin so it goes through nginx - this is the canonical URL for both local docker and prod:

```ts
const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
new TicTacToeClient({ url });
```

For local dev outside Docker (`bun --hot run src/index.ts` + `vite`) use `ws://localhost:9000/ws` (the backend's default port).

## Production notes

- Put a TLS terminator (Caddy, Traefik, nginx, or your cloud LB) in front of the `frontend` container and forward `:443` -> `:80`. WebSocket upgrade headers are already handled inside `frontend/nginx.conf` so they pass through cleanly.
- Set `ALLOWED_ORIGINS` to the public frontend origin once TLS is in place.
- The backend keeps lobby state in-memory; do not run more than one replica without a shared store.
- `frontend/nginx.conf` sets a 1h `proxy_read_timeout`; raise it if you expect longer idle games. The backend itself enforces a 120s ws `idleTimeout` (see `backend/src/index.ts:74`) and the client heartbeats every 20s.

## Single-service build (without compose)

Debug only - this publishes the backend directly on the host, bypassing nginx. Normal use should go through `docker compose`.

```sh
docker build -f backend/Dockerfile -t tictactoe-backend .
docker run --rm -p 9001:9000 -e ALLOWED_ORIGINS= tictactoe-backend

docker build -f frontend/Dockerfile -t tictactoe-frontend .
docker run --rm -p 3000:80 tictactoe-frontend
```

Run from the repo root - the build context must contain both `backend/` and `frontend/`.
