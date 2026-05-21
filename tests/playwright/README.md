How to run Playwright E2E tests

1. Install dev dependencies (locally):

```bash
pnpm install
```

2. Install Playwright browsers (only once):

```bash
npx playwright install
```

3. Start the dev server (in another terminal):

```bash
pnpm dev -- --port 3001 --socket-port 4001 --host 0.0.0.0
```

4. Run the tests:

```bash
pnpm test:e2e
```

Notes:
- The tests assume the dev server is available at `http://localhost:3001`.
- The `solo-defeat` modal is opened using the `?debug_solo_defeat=1` query param.
