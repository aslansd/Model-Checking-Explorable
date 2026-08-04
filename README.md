# Model Checking Explorable

An interactive explorable explanation of **model checking** — the technique that proves a
system can never enter a bad state, by searching every state it can reach rather than
testing a handful of runs.

Four chapters, each a small state machine you can edit and verify:

1. **The Decompression Catastrophe** — safety properties (`G ¬bad`) and shortest counterexamples
2. **The Rogue Microwave** — liveness (`G (p ⇒ F q)`), deadlock vs livelock, lasso counterexamples
3. **The Autonomous Rover Hatch** — CTL path quantifiers (`AG`, `AF`) and the fairness assumption
4. **The Verification Sandbox** — build a machine, pick a property, break it on purpose

## What the checker actually does

`src/utils/modelChecker.ts` is a real (if small) explicit-state model checker:

- **Reachability first.** Every check runs over the states reachable from the initial
  state. Unreachable states are reported and then ignored — they cannot break anything.
- **Safety** (`G ¬bad`) is a breadth-first search, so the counterexample it returns is the
  *shortest* path to the bad state.
- **Liveness** (`G (p ⇒ F q)`) looks for an infinite run that makes `p` true and never
  makes `q` true. It reports either a **deadlock** (a state with no outgoing transitions)
  or a **livelock** (a cycle), returning a **lasso**: a path into the loop plus the loop.
- **Fairness** is an explicit switch. With it on, a loop is only a counterexample if no
  state in it has any route back to the goal. With it off, any goal-avoiding cycle counts.
  Without this distinction almost every retry loop reports a false alarm.
- **Vacuity** is detected and reported as a failure. If no reachable state ever satisfies
  `p`, then `G (p ⇒ F q)` holds trivially and the check proved nothing.

Chapters also run **sanity checks** after a successful verification, so a level cannot be
"solved" by deleting the interesting behaviour — a verified machine that no longer does
its job is not a fix.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev          # http://localhost:8080
```

The AI formula helper is optional. Without a key the server returns a built-in reference
explanation of the operators; the model checker itself runs entirely in the browser and
never needs the network.

```bash
cp .env.example .env
# then set GEMINI_API_KEY in .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on. Cloud Run sets this for you. |
| `GEMINI_API_KEY` | *(unset)* | Enables the AI formula helper. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model used by the helper. |
| `NODE_ENV` | *(unset)* | Set to `production` to serve the built assets instead of Vite. |

## Deploying to Cloud Run

```bash
npm run build        # dist/ = client assets, dist-server/ = bundled server
npm start
```

Cloud Run injects `PORT` and expects the container to listen on it, which `server.ts`
now does. The server bundle is written to `dist-server/` rather than `dist/` so that
`express.static` cannot serve the server code or its source map to the public.

## Project layout

```
src/
  App.tsx                       chapter shell, verification run state
  components/KripkeEditor.tsx   the state-machine canvas and inspector
  components/ModelCheckerVisualizer.tsx  step playback, log, verdict, counterexample
  components/Markdown.tsx       minimal Markdown renderer for narrative text
  data/chapters.ts              all chapter content and properties
  utils/modelChecker.ts         the verification engine
server.ts                       Express server plus the optional AI helper endpoint
```

Inspired by the explorable explanations of [Nicky Case](https://ncase.me/).
