# Secrets of Mental Math

A mental-arithmetic trainer: learn a technique from one card (idea, worked example, picture), then drill it. Static site, Vite + vanilla TypeScript, no backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: generators, chain evaluator, drill engine, storage
npm run e2e        # Playwright: builds, serves on :4173, runs the smoke and share tests
```

First Playwright run needs a browser: `npx playwright install chromium`.

## Deploy

`npm run build` writes a static site to `dist/`. Asset paths are relative and routing uses the URL hash, so it works from any sub-path. There is no server: scores, names and the leaderboard live in each visitor's browser.

- **GitHub Pages (set up):** create a GitHub repository, push this project to it, then in the repository's Settings → Pages choose "GitHub Actions" as the source. `.github/workflows/deploy.yml` runs the tests, builds, and publishes on every push to `main` or `master`. The site appears at `https://<user>.github.io/<repo>/`.
- **Netlify (alternative):** "Add new site" → import the repository. `netlify.toml` already sets the build command and the `dist` folder.

## Add a technique

Create one file, `src/techniques/catalog/<id>.ts`, that default-exports `defineTechnique({...})`. The registry picks it up automatically. Copy `mul-2x1.ts` as a starting point. A technique provides:

- `meta`: id (same as the file name), name, category (one of the groups in `src/techniques/types.ts`), tier, sort order, one-line idea, and `signed: true` if some answers are negative (drills then show a minus key).
- `card`: up to three short lines of prose, an `example` problem, a `graphic()` returning inline SVG built from `src/techniques/svg.ts` (theme classes only, no hard-coded colors), and a caption.
- `levels`: a label and inclusive bounds for each value in `Problem.data`, for levels 1–6 (I is the gentlest, VI the hardest).
- `generate(rng, level)`: returns a `Problem` with the display text, the answer as a plain number string, and its data.
- `steps(problem)`: the worked solution for that exact problem, one operation per line. The last line must be the answer.
- Optional `reference(problem)` for problems whose text is not an arithmetic expression, and `tolerance` on problems that accept estimates.

`npm test` then checks the new technique automatically: 500 samples per level must stay inside the bounds, match an independent evaluation, and end their steps on the answer. The card must have an example and a graphic.

## Layout

```
src/techniques/   registry, types, SVG kit, one module per technique in catalog/
src/chain/        expression parser/evaluator, expression chains and running-total chains
src/drill/        drill engine, sounds, drill specs
src/storage/      Store interface + localStorage implementation (swap for a backend later)
src/ui/           screens: home, Learn (with the book's six lessons), Train, Challenge, Chains, Stats, Settings, drill (with number pad), results
src/art/          landing plate (animated only while on screen), background grid and margin columns (CSS transforms, no per-frame script)
```
