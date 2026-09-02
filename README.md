# todo-app-server

NestJS + MongoDB backend for the Tasky to-do app. Identity is owned entirely by **Firebase
Authentication** — this service never issues tokens, hashes passwords, or manages sessions. It
verifies the Firebase ID token on every request and owns all task data in MongoDB.

```
Mobile app --sign in--> Firebase Auth --ID token (JWT)--> Mobile app
Mobile app --Authorization: Bearer <ID token>--> This API --verifyIdToken()--> firebase-admin
This API --queries scoped by uid--> MongoDB Atlas
```

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js >= 20.11 |
| Framework | NestJS 11 |
| Database | MongoDB (Atlas M0 free tier in production) |
| ODM | Mongoose via `@nestjs/mongoose` |
| Token verification | `firebase-admin` |
| Validation | `class-validator` + `class-transformer` |
| Testing | Jest + Supertest + `mongodb-memory-server` |
| Hosting | Render (Web Service, free tier) |

## Setup

```bash
npm install
cp .env.example .env
# fill in MONGODB_URI and FIREBASE_SERVICE_ACCOUNT_BASE64 (see below)
npm run start:dev
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no | `development` locally, `production` on Render. |
| `PORT` | no | Defaults to `3000`. Render injects its own. |
| `MONGODB_URI` | **yes** | Include the database name, e.g. `.../tasky?retryWrites=true&w=majority`. |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | **yes** | Base64 of the entire Firebase service-account JSON file. |
| `CORS_ORIGINS` | no | Comma-separated origins, or `*` (fine — a native app sends no `Origin`). |

Missing `MONGODB_URI` or `FIREBASE_SERVICE_ACCOUNT_BASE64` crashes the process at boot with a
readable message (`env.validation.ts`) rather than failing confusingly on first request.

### Why base64 for the service account

The service-account JSON contains a PEM private key with literal `\n` characters. Pasting it raw
into a hosting dashboard mangles the newlines and produces a confusing
`error:0909006C:PEM routines:get_name:no start line` at boot. Base64 sidesteps this entirely.

```bash
# macOS / Linux
base64 -i serviceAccountKey.json | tr -d '\n' > sa.b64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccountKey.json")) | Set-Content sa.b64
```

Paste the contents of `sa.b64` as `FIREBASE_SERVICE_ACCOUNT_BASE64`.

**Never commit** `.env`, `*.b64`, or the raw service-account JSON — all are gitignored. If a
service-account key is ever committed, revoke and regenerate it in the Firebase console; deleting
the file in a later commit does not remove it from git history.

## Scripts

```bash
npm run build      # tsc build, zero errors required
npm run start:dev  # watch mode
npm run start:prod # node dist/main (after build)
npm test           # unit tests (priorityScore + friends)
npm run test:e2e   # HTTP + real in-memory Mongo, Firebase guard stubbed
```

`test:e2e` runs Jest through `node --experimental-vm-modules` because `@nestjs/mongoose` ships
as an ESM-only package; Jest needs that flag to `require()` it under Node's native
require-of-esm support (Node ≥ 24.9). This is baked into the npm script, so a plain
`npm run test:e2e` is all that's needed.

## API contract

Base URL (production): `https://todo-app-server-XXXX.onrender.com`
All endpoints except `GET /health` require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | no | Liveness + DB connection state |
| `GET` | `/auth/me` | yes | Current user profile (404 if never synced) |
| `POST` | `/auth/sync` | yes | Upsert profile after sign-in. Idempotent. |
| `GET` | `/tasks` | yes | List with filter / search / sort |
| `GET` | `/tasks/stats` | yes | Aggregate counts |
| `GET` | `/tasks/:id` | yes | Single task |
| `POST` | `/tasks` | yes | Create |
| `PATCH` | `/tasks/:id` | yes | Partial update |
| `PATCH` | `/tasks/:id/toggle` | yes | Flip `completed` |
| `DELETE` | `/tasks/:id` | yes | Delete |

### `GET /health`

```json
200 OK
{ "status": "ok", "db": "connected", "uptime": 1284.51, "timestamp": "2026-09-02T16:00:00.000Z" }
```

### `POST /auth/sync`

Called by the app immediately after every successful sign-in (register, login, Google).
No request body — everything is read from the verified token.

```json
200 OK
{ "uid": "kJ3nX...", "email": "vinay@example.com", "displayName": "Vinay", "photoURL": null, "createdAt": "2026-09-02T16:00:00.000Z" }
```

### `GET /auth/me`

Same shape as `/auth/sync`. `404` if no profile row exists yet (client should call `/auth/sync`).

### `GET /tasks`

Query params, all optional:

| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | `all \| active \| completed` | `all` | |
| `priority` | `low \| medium \| high \| urgent` | — | Single value |
| `tag` | string | — | Exact match against the `tags` array |
| `search` | string | — | Case-insensitive regex on title + description |
| `sort` | `smart \| deadline \| priority \| created` | `smart` | |

```json
200 OK
{
  "data": [
    {
      "id": "66d5f1a2c3b4a5e6f7081920",
      "userId": "kJ3nX...",
      "title": "Submit assignment to Modulus",
      "description": "Push both repos, attach the APK.",
      "startAt": "2026-09-02T14:00:00.000Z",
      "deadline": "2026-09-02T18:00:00.000Z",
      "priority": "urgent",
      "tags": ["career", "ship"],
      "completed": false,
      "completedAt": null,
      "createdAt": "2026-09-01T09:12:00.000Z",
      "updatedAt": "2026-09-02T10:04:00.000Z",
      "score": 0.845
    }
  ],
  "count": 1
}
```

`score` is appended by the server for transparency; it is **not** persisted in Mongo, it is
computed per request.

### `GET /tasks/stats`

```json
200 OK
{ "total": 18, "active": 6, "completed": 12, "overdue": 2, "byPriority": { "low": 3, "medium": 6, "high": 5, "urgent": 4 }, "completionRate": 0.67 }
```

### `POST /tasks`

```json
{
  "title": "Deploy backend to Render",
  "description": "Atlas URI + service-account env var",
  "startAt": "2026-09-03T09:00:00.000Z",
  "deadline": "2026-09-03T11:00:00.000Z",
  "priority": "high",
  "tags": ["work", "ship"]
}
```
`201 Created` → the full task object (same shape as in `GET /tasks`).

### `PATCH /tasks/:id`

Any subset of the create fields, plus `completed`. `200 OK` → updated task.

### `PATCH /tasks/:id/toggle`

No body. Flips `completed`, sets or clears `completedAt`. `200 OK` → updated task.

### `DELETE /tasks/:id`

```json
200 OK
{ "id": "66d5f1a2c3b4a5e6f7081920", "deleted": true }
```

### Errors

Uniform envelope from `AllExceptionsFilter`:

```json
{
  "statusCode": 400,
  "message": ["title must be longer than or equal to 1 characters"],
  "error": "Bad Request",
  "path": "/tasks",
  "timestamp": "2026-09-02T16:00:00.000Z"
}
```

| Situation | Status | `message` |
|---|---|---|
| Missing / malformed `Authorization` | 401 | `Missing or malformed Authorization header` |
| Expired or invalid token | 401 | `Invalid or expired token` |
| Body fails DTO validation | 400 | array of class-validator messages |
| Unknown field in body | 400 | `property X should not exist` |
| `deadline` earlier than `startAt` | 400 | `deadline must be the same as or after startAt` |
| `:id` is not a valid ObjectId | 400 | `Invalid task id` |
| Task not found **or owned by someone else** | 404 | `Task not found` |
| Unhandled server error | 500 | `Internal server error` |

**Ownership is enforced in the query filter**, never by fetch-then-compare. Requesting another
user's task returns `404`, not `403` — a `403` would confirm the id exists.

## The smart sort algorithm

`sort=smart` (the default) ranks tasks by a weighted mix of priority, deadline urgency, and
overdue pressure — the assignment's bonus requirement ("sort with time and deadline and priority
mix algorithm"). Implemented once in `src/shared/utils/priority-score.ts`, mirrored byte-for-byte
in the mobile repo so client-side optimistic re-ranking and the server's list ordering never
drift apart.

```
score = damping × ( 0.45 × priorityWeight + 0.40 × urgency + 0.15 × overdue )
```

- **priorityWeight** — `urgent 1.0, high 0.7, medium 0.4, low 0.15`. Static importance the user assigned.
- **urgency** — ramps from 0 to 1.0 as the deadline approaches over a 7-day (168h) horizon; 0 beyond that horizon.
- **overdue** — 0 while not yet due; ramps to 1.0 over the first 24h past deadline, then saturates (a task forgotten for a month cannot permanently pin itself to the top).
- **damping** — ×0.6 if `startAt` is still in the future (the user cannot act on it yet, so it's suppressed rather than hidden).
- Completed tasks always score **-1**, sinking below every active task.
- Ties break by nearest deadline, then by newest `createdAt` — fully deterministic, so the mobile
  client's local re-sort produces an identical order to the server's.

### Worked example

`now = 2026-09-02T16:00:00Z`

| Task | Priority | Deadline | Score | Rank |
|---|---|---|---|---|
| Submit assignment | urgent | +2h | `0.45(1.0) + 0.40(0.988) + 0` = **0.845** | 1 |
| Deploy backend | high | −6h (overdue) | `0.45(0.7) + 0.40(1.0) + 0.15(0.25)` = **0.753** | 2 |
| Record demo | medium | +2d | `0.45(0.4) + 0.40(0.714) + 0` = **0.466** | 3 |
| Read changelog | low | +30d | `0.45(0.15) + 0 + 0` = **0.068** | 4 |
| Atlas cluster (done) | low | −1d | **−1** | last |

The point this demonstrates: an *overdue high* outranks a *not-yet-due medium* but still loses to
a *live urgent* — the behaviour a naive `sort by priority then deadline` gets wrong.

## Mirrored files

Two files exist in **both** this repo and the mobile repo, and must stay identical:

| Server path | Mobile path |
|---|---|
| `src/shared/types/task.types.ts` | `src/types/task.types.ts` |
| `src/shared/utils/priority-score.ts` | `src/utils/priority-score.ts` |

Kept as a duplicated pair of small files rather than a published npm package — two files across
two repos is less machinery than versioning and publishing a package for a project this size.
Both carry a header comment stating the mirror and the reason.

## Testing

- `src/shared/utils/priority-score.spec.ts` — the seven-assertion algorithm spec. Run with `npm test`.
- `test/tasks.e2e-spec.ts`, `test/auth.e2e-spec.ts` — real HTTP requests against a real
  `mongodb-memory-server` instance, with `FirebaseAuthGuard` swapped for a header-based stub
  (`x-test-uid`) so no real Firebase project is needed. Run with `npm run test:e2e`.
- The e2e suite covers, among other things, the two cross-user isolation guarantees: a user
  never sees another user's tasks in a list, and fetching another user's task id returns `404`
  (not `403`).

## Deployment

### MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → add a user with `readWrite` on the `tasky` database (not `atlasAdmin`).
3. **Network Access** → allow `0.0.0.0/0`. Render's free tier has no static egress IP, so an
   allowlist of specific addresses will fail — this is a known trade-off of the free tier, not
   an oversight.
4. Copy the SRV connection string and append the database name:
   `.../tasky?retryWrites=true&w=majority`.

### Render

`render.yaml` is committed. Push the repo, connect it on Render, and fill in `MONGODB_URI` and
`FIREBASE_SERVICE_ACCOUNT_BASE64` in the dashboard (`sync: false` means Render prompts for them
rather than storing them in the repo).

### Known deployment traps

| Trap | Symptom | Fix |
|---|---|---|
| Listening on `localhost` | Deploy shows live but every request times out | `app.listen(port, '0.0.0.0')` (already done in `main.ts`) |
| Hardcoded port | Port scan fails | Reads `process.env.PORT` (already done) |
| Raw service-account JSON in an env var | `PEM routines: no start line` at boot | Use the base64 variable |
| Atlas IP allowlist too narrow | `MongoServerSelectionError` after ~10s | Allow `0.0.0.0/0` |
| **Free-tier cold start** | First request after ~15 min idle takes 30–60s | Expected on Render's free plan — show a loading state client-side |
| `devDependencies` pruned | `nest: not found` during build | Build with `npm ci` (installs dev deps), start with `node dist/main` |

## Security checklist

- [x] `.env`, `*.b64`, and every `*serviceAccount*.json` pattern are gitignored.
- [x] Service-account key only ever lives in an env var, never in the repo.
- [x] Every task query filters on `userId` inside the Mongo filter (never fetch-then-compare).
- [x] Foreign task ids return `404`, not `403`.
- [x] `ValidationPipe` runs with `whitelist` **and** `forbidNonWhitelisted`.
- [x] Regex-based search escapes user input before constructing the `RegExp`.
- [x] `helmet()` is applied.
- [x] The exception filter never returns a stack trace or Mongo error text to the client.
- [ ] Atlas database user has `readWrite` on one database, not `atlasAdmin` — set this when you
      create the Atlas user; the app has no control over it.

## Manual smoke tests

See `requests.http` (VS Code REST Client format). Get a real ID token by adding a temporary
`console.log(await getAuth().currentUser.getIdToken())` in the mobile app after login.

## Notes on this build

- `firebase-admin` v14 and `@nestjs/mongoose` v12 (both installed as unpinned `^` ranges per the
  original install commands) ship modern APIs that differ from what earlier majors exposed —
  see "Deviations from the spec" in the project handoff notes for the mechanical fixes this
  required (modular `firebase-admin/app` + `firebase-admin/auth` imports instead of the old
  `admin.app`/`admin.auth` namespace; `QueryFilter` instead of the now-removed `FilterQuery`
  export from `mongoose`).
