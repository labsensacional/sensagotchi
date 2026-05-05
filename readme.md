# sensagotchi

sensagotchi (_sensations watch_) is a small simulation framework for modeling limbic and affective dynamics under abstract human actions.

It treats actions like “jerking off”, “going to a party”, “losing your job”, or “receiving light pain” not as narrative events, but as perturbations to a physiological–affective system that evolves over time.

_Try it [here](https://sensagotchi.labsensacional.com/)!_

## What is this for?

The main use case is to explore how **sequences of actions** (not single actions) shape subjective experience over time.

Instead of asking “is this action good or bad?”, the simulator asks:

- What happens if you do this for 3 hours?
- How do pleasure, exhaustion, rebound, and recovery interact?
- Why do some combinations feel unexpectedly intense or unexpectedly empty?

### What this is NOT

- Not a realistic neuroscience or medical model
- Not a therapy or self-help tool
- Not a porn simulator
- Not a moral system of “healthy vs unhealthy”
- Not an autonomous AI agent with goals or beliefs

The simulator does not decide what to do.
The user does.

## Hello world

### 1. Run the website locally

No build step, no server required — just serve `src/` as static files:

```bash
cd src
python -m http.server 5000
```

Open `http://localhost:5000`. Also accessible from a phone on the same network at `http://<your-local-ip>:5000`.

### 2. Try the physiology engine by itself

You can run the logical motor without the web UI:

```bash
node --input-type=module <<'NODE'
import { createPhysiologyEngine } from './src/internal-logic/engine.js';

const engine = createPhysiologyEngine({ presetId: 'default' });

console.log('initial', engine.getState());
console.log('available food actions', engine.listActions().filter(a => a.category === 'food'));

const result = engine.applyAction('snack');
console.log('after snack', result.after);
NODE
```

That API is the reusable entrypoint for the physiological simulation:

- `createPhysiologyEngine({ presetId })`
- `engine.getState()`
- `engine.listActions()`
- `engine.applyAction(actionId)`
- `engine.step(hours)`
- `engine.reset({ presetId })`

### 3. Try the expressive engine by itself

You can also use the expressive layer separately from the game loop:

```html
<script type="module">
  import * as expressiveEngine from './src/expressive-engine.js';

  const state = {
    anxiety: 82,
    energy: 28,
    sleepiness: 18,
    arousal: 55,
    dopamine: 48,
    oxytocin: 18,
    endorphins: 12,
    serotonin: 32,
    prolactin: 10,
    vasopressin: 46,
    absorption: 34,
    hunger: 24,
    shutdown: 0,
    health: 58,
    life_stress: 35,
    ssri_level: 0,
  };

  console.log(expressiveEngine.getMotionProfile(state));
  console.log(expressiveEngine.getOverlayCues(state));
  console.log(expressiveEngine.stateToExpressionParams(state));
</script>
```

If you want the full p5 avatar renderer too, load:

```html
<script type="module">
  import { monsterRenderer } from './src/monster-renderer-p5.js';

  monsterRenderer.setState({
    anxiety: 40,
    energy: 72,
    health: 80,
  });
</script>
```

If you prefer the browser global for quick experimentation, the module still exposes `window.monsterRenderer` for compatibility.

## Running the website

No build step, no server required — just serve `src/` as static files:

```bash
cd src
python -m http.server 5000
```

Open `http://localhost:5000`. Also accessible from a phone on the same network at `http://<your-local-ip>:5000`.

### Running the tests

The project is heavily test-driven. Tests are not just for correctness, but encode **conceptual invariants** such as:

- No single action can be repeated forever without diminishing returns
- Fast pleasure produces delayed cost
- Arousal can be misattributed across domains
- Moderate anxiety can amplify pleasure (Yerkes–Dodson)
- Absorption is fragile under anxiety and sleepiness

#### Internal Logic Test

Tests use [vitest](https://vitest.dev/). Install dev dependencies once, then run:

```bash
cd src/internal-logic
npm install
npm test
```

#### Emotional Expression Test

You can open `src/static/emotions-expression-test.html` to manually test this. Or try the latest release [here](https://sensagotchi.labsensacional.com/emotions-expression-test)

## Future Work

Multi Agent: A basic system with many agents in a 2D space could be initialized where dynamics such as the following could be implemented
- emotional contagion (influence on the emotions of nearby agents)
- arousal synchronization
- mismatch dynamics
- oxytocin/vasopressin cross-coupling (dominance/submission? Leary circuits 2 and 4: emotional-territorial and attachment and social identity mental spaces?)
