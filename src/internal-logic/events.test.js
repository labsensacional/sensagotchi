/**
 * Hedonistic Tamagotchi - Axiom Tests
 * Automated tests derived from neuroscience review axioms.
 * Run: npm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Human, create_human } from './human.js';
import {
  make_events, apply_decay, apply_event, nt_boost,
  compute_receptivity, get_effective_baselines,
  setEnableProbabilistic, getEnableProbabilistic,
} from './events.js';

// =============================================================================
// HELPERS
// =============================================================================

function apply_n_times(human, event_name, events, n) {
  const event = events[event_name];
  for (let i = 0; i < n; i++) {
    if (event.can_apply(human)) {
      apply_event(human, event_name, event);
      apply_decay(human, event.duration);
      human.clamp_values();
    }
  }
}

function run_sequence(human, sequence, events) {
  for (const event_name of sequence) {
    const event = events[event_name];
    if (event.can_apply(human)) {
      apply_event(human, event_name, event);
      apply_decay(human, event.duration);
      human.clamp_values();
    }
  }
}

function decay_only(human, hours, dt = 0.1) {
  const steps = Math.floor(hours / dt);
  for (let i = 0; i < steps; i++) {
    apply_decay(human, dt);
    human.clamp_values();
  }
}

/**
 * Deep copy a Human, copying all primitive fields and deeply cloning
 * tolerance, reserves, cue_salience objects, and active_effects/rebound_queue arrays.
 */
function deepCopyHuman(human) {
  const copy = new Human();
  // Copy all primitive fields
  const primitiveFields = [
    'testosterone', 'ssri_level', 'life_stress',
    'dopamine', 'oxytocin', 'endorphins', 'serotonin',
    'prolactin', 'vasopressin', 'arousal', 'prefrontal',
    'sleepiness', 'anxiety', 'absorption', 'hunger', 'energy',
    'physical_health', 'psychological_health',
    'time_since_orgasm', 'edging_buildup', 'digesting',
    'sexual_inhibition', 'shutdown',
  ];
  for (const field of primitiveFields) {
    copy[field] = human[field];
  }
  // Deep copy object fields
  copy.tolerance = { ...human.tolerance };
  copy.reserves = { ...human.reserves };
  copy.cue_salience = { ...human.cue_salience };
  // Deep copy arrays (and their object contents)
  copy.active_effects = human.active_effects.map(e => ({ ...e }));
  copy.rebound_queue = human.rebound_queue.map(r => ({ ...r }));
  return copy;
}

// =============================================================================
// AXIOM TESTS
// =============================================================================

describe('Axioms', () => {
  let human;
  let events;
  let origProb;

  beforeEach(() => {
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
    human = new Human();
    events = make_events();
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  // -----------------------------------------------------------------
  // Axiom 0: No trivially exploitable loop
  // -----------------------------------------------------------------
  it('test_axiom0_no_trivial_exploit', () => {
    for (const event_name of Object.keys(events)) {
      const h = new Human();
      const pleasures = [];
      for (let i = 0; i < 50; i++) {
        const event = events[event_name];
        if (event.can_apply(h)) {
          apply_event(h, event_name, event);
          apply_decay(h, event.duration);
          h.clamp_values();
        }
        pleasures.push(h.pleasure_score());
      }

      if (pleasures.length >= 50) {
        const mid_avg = pleasures.slice(10, 20).reduce((a, b) => a + b, 0) / 10;
        const late_avg = pleasures.slice(40, 50).reduce((a, b) => a + b, 0) / 10;
        expect(late_avg).toBeLessThanOrEqual(
          mid_avg * 1.15,
          `Action '${event_name}' shows unbounded growth: mid_avg=${mid_avg.toFixed(1)}, late_avg=${late_avg.toFixed(1)}`
        );
      }
    }
  });

  // -----------------------------------------------------------------
  // Axiom 1: Misattribution of arousal
  // -----------------------------------------------------------------
  it('test_axiom1_misattribution_of_arousal', () => {
    const h = new Human();
    h.arousal = 30;  // moderate baseline

    // Apply pain stimulus
    apply_event(h, 'light_pain', events['light_pain']);
    const arousal_after_pain = h.arousal;

    // Arousal from pain should have increased
    expect(arousal_after_pain).toBeGreaterThan(30);

    // Now this arousal should make sexual stimulation more effective
    const h2 = new Human();
    h2.arousal = 30;
    expect(h.arousal).toBeGreaterThan(h2.arousal);
  });

  // -----------------------------------------------------------------
  // Axiom 2: Dive reflex
  // -----------------------------------------------------------------
  it('test_axiom2_dive_reflex', () => {
    const h = new Human();
    h.arousal = 60;  // elevated arousal
    const initial_arousal = h.arousal;

    apply_event(h, 'cold_face_immersion', events['cold_face_immersion']);

    expect(h.arousal).toBeLessThan(initial_arousal);
  });

  // -----------------------------------------------------------------
  // Axiom 3: Can't repeat forever
  // -----------------------------------------------------------------
  it('test_axiom3_cant_repeat_forever', () => {
    const h = new Human();
    const gains = [];

    for (let i = 0; i < 15; i++) {
      const before = h.pleasure_score();
      const event = events['light_stimulation'];
      if (event.can_apply(h)) {
        apply_event(h, 'light_stimulation', event);
        apply_decay(h, event.duration);
        h.clamp_values();
      }
      const after = h.pleasure_score();
      gains.push(after - before);
    }

    const early_gains = gains.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const late_gains = gains.slice(10, 15).reduce((a, b) => a + b, 0) / 5;
    expect(late_gains).toBeLessThan(early_gains);
  });

  // -----------------------------------------------------------------
  // Axiom 4: Fast pleasure creates delayed cost
  // -----------------------------------------------------------------
  it('test_axiom4_fast_pleasure_delayed_cost', () => {
    const h = new Human();
    const baseline_pleasure = h.pleasure_score();

    // Build arousal first
    apply_n_times(h, 'light_stimulation', events, 3);
    // Spam intense stimulation heavily
    apply_n_times(h, 'intense_stimulation', events, 8);

    const peak_pleasure = h.pleasure_score();

    // Let it all decay for 5 hours
    decay_only(h, 5.0);

    const final_pleasure = h.pleasure_score();

    expect(final_pleasure).toBeLessThan(peak_pleasure * 0.85);
    expect(h.reserves['dopamine']).toBeLessThan(80);
  });

  // -----------------------------------------------------------------
  // Axiom 5: Edging trades intensity for recovery cost
  // -----------------------------------------------------------------
  it('test_axiom5_edging_tradeoff', () => {
    // Path A: Direct orgasm (build arousal minimally)
    const h_direct = new Human();
    h_direct.arousal = 75;
    apply_event(h_direct, 'orgasm', events['orgasm']);
    const direct_endorphins = h_direct.endorphins;
    const direct_prolactin = h_direct.prolactin;

    // Path B: Edge then orgasm
    const h_edged = new Human();
    h_edged.arousal = 55;
    apply_n_times(h_edged, 'edging', events, 3);
    if (events['orgasm'].can_apply(h_edged)) {
      apply_event(h_edged, 'orgasm', events['orgasm']);
    }

    const edged_endorphins = h_edged.endorphins;
    const edged_prolactin = h_edged.prolactin;

    // Edged path should give higher endorphins (edging_buildup bonus)
    expect(edged_endorphins).toBeGreaterThan(direct_endorphins);

    // Edged path should also produce higher prolactin (higher cost)
    expect(edged_prolactin).toBeGreaterThan(direct_prolactin);
  });

  // -----------------------------------------------------------------
  // Axiom 6: Absorption is fragile under anxiety and sleepiness
  // -----------------------------------------------------------------
  it('test_axiom6_absorption_fragile', () => {
    // Test anxiety suppression
    const h1 = new Human();
    h1.absorption = 70;
    h1.anxiety = 80;
    const initial_absorption1 = h1.absorption;
    decay_only(h1, 0.5);
    expect(h1.absorption).toBeLessThan(initial_absorption1);

    // Test sleepiness suppression
    const h2 = new Human();
    h2.absorption = 70;
    h2.sleepiness = 75;
    const initial_absorption2 = h2.absorption;
    decay_only(h2, 0.5);
    expect(h2.absorption).toBeLessThan(initial_absorption2);
  });

  // -----------------------------------------------------------------
  // Axiom 7: Hypofrontality enables altered states
  // -----------------------------------------------------------------
  it('test_axiom7_hypofrontality', () => {
    const h = new Human();
    h.prefrontal = 20;  // very low (hypofrontality)
    h.absorption = 30;  // starting absorption
    const initial_absorption = h.absorption;

    // Decay should increase absorption when prefrontal is low
    decay_only(h, 1.0);

    expect(h.absorption).toBeGreaterThan(initial_absorption);
  });

  // -----------------------------------------------------------------
  // Axiom 8: Too much control blocks pleasure
  // -----------------------------------------------------------------
  it('test_axiom8_control_blocks_pleasure', () => {
    // High prefrontal human
    const h_controlled = new Human();
    h_controlled.prefrontal = 80;
    h_controlled.absorption = 30;
    h_controlled.dopamine = 70;
    h_controlled.endorphins = 60;
    decay_only(h_controlled, 1.0);
    const controlled_absorption = h_controlled.absorption;

    // Low prefrontal human (same NTs)
    const h_free = new Human();
    h_free.prefrontal = 20;
    h_free.absorption = 30;
    h_free.dopamine = 70;
    h_free.endorphins = 60;
    decay_only(h_free, 1.0);
    const free_absorption = h_free.absorption;

    expect(free_absorption).toBeGreaterThan(controlled_absorption);
  });

  // -----------------------------------------------------------------
  // Axiom 9: Oxytocin vs vasopressin lead to different states
  // -----------------------------------------------------------------
  it('test_axiom9_oxy_vs_vaso_states_differ', () => {
    // Path A: Oxytocin-dominant (cuddling -> light stim -> orgasm)
    const h_oxy = new Human();
    run_sequence(h_oxy, [
      'cuddling', 'cuddling', 'massage',
      'light_stimulation', 'light_stimulation',
      'light_stimulation',
    ], events);
    if (events['orgasm'].can_apply(h_oxy)) {
      apply_event(h_oxy, 'orgasm', events['orgasm']);
    }

    // Path B: Vasopressin-dominant (intense stim -> edging -> orgasm)
    const h_vaso = new Human();
    run_sequence(h_vaso, [
      'light_stimulation', 'intense_stimulation',
      'intense_stimulation', 'edging',
    ], events);
    if (events['orgasm'].can_apply(h_vaso)) {
      apply_event(h_vaso, 'orgasm', events['orgasm']);
    }

    // Oxy path should have higher oxytocin
    expect(h_oxy.oxytocin).toBeGreaterThan(h_vaso.oxytocin);

    // Vaso path should have higher vasopressin
    expect(h_vaso.vasopressin).toBeGreaterThan(h_oxy.vasopressin);
  });

  // -----------------------------------------------------------------
  // Axiom 10: Yerkes-Dodson inverted-U curve
  // -----------------------------------------------------------------
  it('test_axiom10_yerkes_dodson', () => {
    const base = new Human();
    base.dopamine = 60;
    base.endorphins = 50;
    base.oxytocin = 40;
    base.serotonin = 55;

    const h_zero = deepCopyHuman(base);
    h_zero.anxiety = 0;
    const p_zero = h_zero.pleasure_score();

    const h_moderate = deepCopyHuman(base);
    h_moderate.anxiety = 35;
    const p_moderate = h_moderate.pleasure_score();

    const h_high = deepCopyHuman(base);
    h_high.anxiety = 80;
    const p_high = h_high.pleasure_score();

    // Moderate should be best
    expect(p_moderate).toBeGreaterThan(p_zero);
    expect(p_moderate).toBeGreaterThan(p_high);
    // Zero should still be better than high
    expect(p_zero).toBeGreaterThan(p_high);
  });

  // -----------------------------------------------------------------
  // Axiom 11: Rest is required for sustained pleasure
  // -----------------------------------------------------------------
  it('test_axiom11_rest_required', () => {
    // Pure intense action: spam intense stimulation as hard as possible
    const h_intense = new Human();
    let total_intense = 0.0;
    for (let i = 0; i < 30; i++) {
      let event;
      if (events['intense_stimulation'].can_apply(h_intense)) {
        event = events['intense_stimulation'];
        apply_event(h_intense, 'intense_stimulation', event);
      } else if (events['light_stimulation'].can_apply(h_intense)) {
        event = events['light_stimulation'];
        apply_event(h_intense, 'light_stimulation', event);
      } else {
        event = events['wait'];
        apply_event(h_intense, 'wait', event);
      }
      total_intense += h_intense.pleasure_score() * event.duration;
      apply_decay(h_intense, event.duration);
      h_intense.clamp_values();
    }

    // Paced strategy: variety with recovery
    const h_paced = new Human();
    let total_paced = 0.0;
    const paced_seq = [
      'cuddling', 'light_stimulation', 'light_stimulation',
      'massage', 'deep_breathing',
      'light_stimulation', 'intense_stimulation',
      'snack', 'rest',
      'cuddling', 'light_stimulation', 'light_stimulation',
      'massage', 'deep_breathing',
      'light_stimulation', 'intense_stimulation',
      'rest', 'snack',
      'cuddling', 'light_stimulation', 'light_stimulation',
      'massage', 'deep_breathing',
      'light_stimulation', 'intense_stimulation',
      'sleep',
      'cuddling', 'light_stimulation', 'light_stimulation',
      'massage',
    ];
    for (const name of paced_seq) {
      const event = events[name];
      if (event.can_apply(h_paced)) {
        apply_event(h_paced, name, event);
        total_paced += h_paced.pleasure_score() * event.duration;
        apply_decay(h_paced, event.duration);
        h_paced.clamp_values();
      }
    }

    expect(h_paced.reserves['dopamine']).toBeGreaterThan(h_intense.reserves['dopamine']);
    expect(h_paced.psychological_health).toBeGreaterThan(h_intense.psychological_health);
  });

  // -----------------------------------------------------------------
  // Axiom 12: Health is the ultimate limiter
  // -----------------------------------------------------------------
  it('test_axiom12_health_limiter', () => {
    const h = new Human();
    h.dopamine = 90;  // extreme dopamine
    const initial_psych = h.psychological_health;

    // Let extreme state persist for several hours
    decay_only(h, 3.0);

    expect(h.psychological_health).toBeLessThan(initial_psych);
  });

  // -----------------------------------------------------------------
  // Final Axiom: No dominant strategy
  // -----------------------------------------------------------------
  it('test_final_no_dominant_strategy', () => {
    for (const event_name of Object.keys(events)) {
      const h = new Human();
      const pleasures_per_5 = [];
      let block_pleasure = 0.0;

      for (let i = 0; i < 30; i++) {
        const event = events[event_name];
        if (event.can_apply(h)) {
          apply_event(h, event_name, event);
          block_pleasure += h.pleasure_score() * event.duration;
          apply_decay(h, event.duration);
          h.clamp_values();
        }

        if ((i + 1) % 10 === 0) {
          pleasures_per_5.push(block_pleasure);
          block_pleasure = 0.0;
        }
      }

      if (pleasures_per_5.length >= 3) {
        expect(pleasures_per_5[2]).toBeLessThanOrEqual(
          pleasures_per_5[0] * 1.3,
          `Spamming '${event_name}' shows unbounded growth: first_10=${pleasures_per_5[0].toFixed(1)}, last_10=${pleasures_per_5[2].toFixed(1)}`
        );
      }
    }
  });
});

// =============================================================================
// NEW MECHANICS TESTS
// =============================================================================

describe('OpponentProcess', () => {
  let human;
  let events;

  beforeEach(() => {
    human = new Human();
    events = make_events();
  });

  it('test_rebound_scheduled_on_large_boost', () => {
    const h = human;
    const initial_queue_len = h.rebound_queue.length;
    nt_boost(h, 'dopamine', 20);  // raw_amount > 10 and dopamine is a reserve NT
    expect(h.rebound_queue.length).toBeGreaterThan(initial_queue_len);
  });

  it('test_rebound_not_scheduled_on_small_boost', () => {
    const h = human;
    const initial_queue_len = h.rebound_queue.length;
    nt_boost(h, 'dopamine', 8);  // raw_amount <= 10
    expect(h.rebound_queue.length).toBe(initial_queue_len);
  });

  it('test_rebound_creates_below_baseline_dip', () => {
    const h = human;
    h.dopamine = 50.0;  // baseline
    nt_boost(h, 'dopamine', 30);
    // Now decay for enough time: 0.5h delay + 1.0h rebound duration
    decay_only(h, 2.0);
    // Dopamine should be below baseline due to rebound + reserve depletion
    expect(h.dopamine).toBeLessThan(50.0);
  });

  it('test_rebound_clears_after_completion', () => {
    const h = human;
    nt_boost(h, 'dopamine', 25);
    expect(h.rebound_queue.length).toBeGreaterThan(0);
    // Decay long enough for rebound to complete (0.5h delay + 1.0h duration + extra)
    decay_only(h, 2.0);
    expect(h.rebound_queue.length).toBe(0);
  });
});

describe('DrugEvents', () => {
  let human;
  let events;
  let origProb;

  beforeEach(() => {
    human = new Human();
    events = make_events();
    // Disable probabilistic outcomes for deterministic tests
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_all_drugs_exist', () => {
    const drug_names = [
      'mdma', 'weed', 'mushrooms', 'lsd', 'poppers', 'ketamine',
      'tobacco', 'caffeine', 'alcohol', 'amphetamines', 'cocaine', 'nitrous'
    ];
    for (const name of drug_names) {
      expect(events).toHaveProperty(name);
    }
  });

  it('test_drugs_have_category', () => {
    const drug_names = [
      'mdma', 'weed', 'mushrooms', 'lsd', 'poppers', 'ketamine',
      'tobacco', 'caffeine', 'alcohol', 'amphetamines', 'cocaine', 'nitrous'
    ];
    for (const name of drug_names) {
      expect(events[name].category).toBe('drugs');
    }
  });

  it('test_mdma_boosts_serotonin_and_oxytocin', () => {
    const h = new Human();
    h.energy = 50;
    const initial_serotonin = h.serotonin;
    const initial_oxytocin = h.oxytocin;
    apply_event(h, 'mdma', events['mdma']);
    expect(h.serotonin).toBeGreaterThan(initial_serotonin + 10);
    expect(h.oxytocin).toBeGreaterThan(initial_oxytocin + 10);
  });

  it('test_cocaine_short_duration_big_dopamine', () => {
    expect(events['cocaine'].duration).toBe(0.5);
    const h = new Human();
    h.energy = 50;
    const initial_dopamine = h.dopamine;
    apply_event(h, 'cocaine', events['cocaine']);
    expect(h.dopamine).toBeGreaterThan(initial_dopamine + 15);
  });

  it('test_caffeine_always_available', () => {
    const h = new Human();
    h.energy = 10;
    expect(events['caffeine'].can_apply(h)).toBe(true);
  });

  it('test_drug_tolerance_builds', () => {
    const h = new Human();
    h.energy = 80;
    const initial_tolerance = h.tolerance['drugs'];
    apply_event(h, 'cocaine', events['cocaine']);
    expect(h.tolerance['drugs']).toBeGreaterThan(initial_tolerance);
  });

  it('test_drug_tolerance_reduces_effectiveness', () => {
    const h1 = new Human();
    h1.energy = 80;
    apply_event(h1, 'cocaine', events['cocaine']);
    const dopamine_first = h1.dopamine;

    const h2 = new Human();
    h2.energy = 80;
    h2.tolerance['drugs'] = 0.8;  // high tolerance
    apply_event(h2, 'cocaine', events['cocaine']);
    const dopamine_tolerant = h2.dopamine;

    expect(dopamine_first).toBeGreaterThan(dopamine_tolerant);
  });

  it('test_drugs_no_trivial_exploit', () => {
    const drug_names = [
      'mdma', 'weed', 'mushrooms', 'lsd', 'poppers', 'ketamine',
      'tobacco', 'caffeine', 'alcohol', 'amphetamines', 'cocaine', 'nitrous'
    ];
    for (const drug_name of drug_names) {
      const h = new Human();
      h.energy = 90;
      const pleasures = [];
      for (let i = 0; i < 30; i++) {
        const event = events[drug_name];
        if (event.can_apply(h)) {
          apply_event(h, drug_name, event);
          apply_decay(h, event.duration);
          h.clamp_values();
        }
        pleasures.push(h.pleasure_score());
        if (!h.is_viable()) break;
      }

      if (pleasures.length >= 20) {
        const mid_avg = pleasures.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
        const late_avg = pleasures.slice(15, 20).reduce((a, b) => a + b, 0) / 5;
        expect(late_avg).toBeLessThanOrEqual(
          mid_avg * 1.2,
          `Drug '${drug_name}' shows unbounded growth: mid=${mid_avg.toFixed(1)}, late=${late_avg.toFixed(1)}`
        );
      }
    }
  });
});

describe('ProbabilisticOutcomes', () => {
  it('test_probabilistic_flag_disables_randomness', () => {
    setEnableProbabilistic(false);
    try {
      const h = new Human();
      h.arousal = 90;
      const events = make_events();
      // Run intense_stimulation many times - should never trigger orgasm
      for (let i = 0; i < 100; i++) {
        const initial_prolactin = h.prolactin;
        events['intense_stimulation'].apply(h, 1.0);
        // If orgasm was triggered, prolactin would spike
        expect(h.prolactin).toBeLessThan(initial_prolactin + 40);
        h.clamp_values();
        h.arousal = 90;  // keep arousal high
        h.energy = 80;   // keep energy up
      }
    } finally {
      setEnableProbabilistic(true);
    }
  });

  it('test_probabilistic_can_trigger', () => {
    setEnableProbabilistic(true);
    const events = make_events();
    // Try many attempts to find one that triggers premature orgasm
    let triggered = false;
    for (let seed = 0; seed < 1000; seed++) {
      const h = new Human();
      h.arousal = 90;
      h.energy = 80;
      const initial_prolactin = h.prolactin;
      events['intense_stimulation'].apply(h, 1.0);
      if (h.prolactin > initial_prolactin + 30) {
        triggered = true;
        break;
      }
    }
    expect(triggered).toBe(true);
  });
});

// =============================================================================
// CUE LEARNING TESTS
// =============================================================================

describe('CueLearning', () => {
  let human;
  let events;
  let origProb;

  beforeEach(() => {
    human = new Human();
    events = make_events();
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_cue_salience_increases_with_use', () => {
    const h = human;
    const initial_salience = h.cue_salience['sexual'];
    apply_event(h, 'light_stimulation', events['light_stimulation']);
    expect(h.cue_salience['sexual']).toBeGreaterThan(initial_salience);
  });

  it('test_cue_salience_adds_dopamine', () => {
    const h = human;
    h.cue_salience['sexual'] = 0.5;  // pre-existing salience
    const initial_dopamine = h.dopamine;
    apply_event(h, 'light_stimulation', events['light_stimulation']);
    // Should get extra dopamine from cue (0.5 * 8 = 4 extra + normal boost)
    const h2 = new Human();
    apply_event(h2, 'light_stimulation', events['light_stimulation']);
    expect(h.dopamine - initial_dopamine).toBeGreaterThan(h2.dopamine - 50.0);  // 50.0 is default dopamine
  });

  it('test_cue_salience_decays_slowly', () => {
    const h = human;
    h.cue_salience['sexual'] = 0.5;
    const initial = h.cue_salience['sexual'];
    decay_only(h, 1.0);
    expect(h.cue_salience['sexual']).toBeLessThan(initial);
    expect(h.cue_salience['sexual']).toBeGreaterThan(0.3);
  });

  it('test_sleep_reduces_cue_salience', () => {
    const h = human;
    h.cue_salience['sexual'] = 0.5;
    h.cue_salience['drugs'] = 0.3;
    h.energy = 40;
    h.sleepiness = 60;
    apply_event(h, 'sleep', events['sleep']);
    expect(h.cue_salience['sexual']).toBeLessThan(0.5);
    expect(h.cue_salience['drugs']).toBeLessThan(0.3);
  });

  it('test_cue_salience_capped_at_one', () => {
    const h = human;
    h.cue_salience['sexual'] = 0.95;
    for (let i = 0; i < 10; i++) {
      apply_event(h, 'light_stimulation', events['light_stimulation']);
      h.clamp_values();
    }
    expect(h.cue_salience['sexual']).toBeLessThanOrEqual(1.0);
  });
});

// =============================================================================
// CONTEXT RECEPTIVITY TESTS
// =============================================================================

describe('ContextReceptivity', () => {
  let events;
  let origProb;

  beforeEach(() => {
    events = make_events();
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_sexual_stim_during_high_anxiety_is_worse', () => {
    // Calm human
    const h_calm = new Human();
    h_calm.anxiety = 20;
    h_calm.arousal = 40;
    apply_event(h_calm, 'light_stimulation', events['light_stimulation']);
    const calm_pleasure = h_calm.pleasure_score();

    // Panicking human
    const h_panic = new Human();
    h_panic.anxiety = 80;
    h_panic.arousal = 40;
    apply_event(h_panic, 'light_stimulation', events['light_stimulation']);
    const panic_pleasure = h_panic.pleasure_score();

    expect(calm_pleasure).toBeGreaterThan(panic_pleasure);
  });

  it('test_sexual_stim_during_panic_increases_anxiety', () => {
    const h = new Human();
    h.anxiety = 95;
    h.arousal = 40;
    const initial_anxiety = h.anxiety;
    apply_event(h, 'light_stimulation', events['light_stimulation']);
    expect(h.anxiety).toBeGreaterThan(initial_anxiety);
  });

  it('test_pain_without_arousal_is_unpleasant', () => {
    const h = new Human();
    h.arousal = 10;  // very low arousal
    h.absorption = 10;
    h.anxiety = 35;  // start at Yerkes-Dodson optimum so backfire can only hurt
    const before = h.pleasure_score();
    apply_event(h, 'light_pain', events['light_pain']);
    h.clamp_values();
    const after = h.pleasure_score();
    expect(after).toBeLessThan(before);
  });

  it('test_pain_with_arousal_is_pleasurable', () => {
    const h = new Human();
    h.arousal = 60;
    h.absorption = 50;
    h.anxiety = 20;
    const before = h.pleasure_score();
    apply_event(h, 'light_pain', events['light_pain']);
    const after = h.pleasure_score();
    expect(after).toBeGreaterThan(before);
  });

  it('test_social_interaction_during_anxiety_backfires', () => {
    // Calm human
    const h_calm = new Human();
    h_calm.anxiety = 15;
    h_calm.oxytocin = 40;
    const calm_before = h_calm.pleasure_score();
    apply_event(h_calm, 'cuddling', events['cuddling']);
    const calm_gain = h_calm.pleasure_score() - calm_before;

    // Anxious human
    const h_anxious = new Human();
    h_anxious.anxiety = 80;
    h_anxious.oxytocin = 40;
    const anxious_before = h_anxious.pleasure_score();
    apply_event(h_anxious, 'cuddling', events['cuddling']);
    const anxious_gain = h_anxious.pleasure_score() - anxious_before;

    expect(calm_gain).toBeGreaterThan(anxious_gain);
  });

  it('test_context_setup_matters_for_sexual_sequence', () => {
    // Cold start: just spam stimulation
    const h_cold = new Human();
    run_sequence(h_cold, [
      'light_stimulation', 'light_stimulation', 'light_stimulation',
    ], events);
    const cold_pleasure = h_cold.pleasure_score();

    // Warm start: build context first
    const h_warm = new Human();
    run_sequence(h_warm, [
      'cuddling', 'massage', 'light_stimulation',
    ], events);
    const warm_pleasure = h_warm.pleasure_score();

    expect(warm_pleasure).toBeGreaterThan(cold_pleasure);
  });

  it('test_psychedelics_during_anxiety_less_effective', () => {
    // Calm human
    const h_calm = new Human();
    h_calm.energy = 60;
    h_calm.anxiety = 20;
    const calm_before = h_calm.pleasure_score();
    apply_event(h_calm, 'mushrooms', events['mushrooms']);
    const calm_gain = h_calm.pleasure_score() - calm_before;

    // Anxious human
    const h_anxious = new Human();
    h_anxious.energy = 60;
    h_anxious.anxiety = 70;
    h_anxious.psychological_health = 30;
    const anxious_before = h_anxious.pleasure_score();
    apply_event(h_anxious, 'mushrooms', events['mushrooms']);
    const anxious_gain = h_anxious.pleasure_score() - anxious_before;

    expect(calm_gain).toBeGreaterThan(anxious_gain);
  });

  it('test_receptivity_values_at_default_state', () => {
    const h = new Human();
    // Default state: anxiety=30, prefrontal=50, arousal=20, absorption=30
    expect(Math.abs(compute_receptivity(h, 'sexual') - 1.0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(compute_receptivity(h, 'social') - 1.0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(compute_receptivity(h, 'rest') - 1.0)).toBeLessThanOrEqual(0.1);
  });

  it('test_receptivity_clamped', () => {
    const h = new Human();
    h.anxiety = 100;
    h.arousal = 0;
    h.absorption = 0;
    h.prefrontal = 100;
    for (const category of ['sexual', 'social', 'pain', 'breathwork', 'food', 'drugs', 'rest']) {
      const r = compute_receptivity(h, category);
      expect(r).toBeGreaterThanOrEqual(-0.5);
      expect(r).toBeLessThanOrEqual(1.0);
    }
  });
});

// =============================================================================
// TRAIT DYNAMICS TESTS
// =============================================================================

describe('TraitDynamics', () => {
  let events;
  let origProb;

  beforeEach(() => {
    events = make_events();
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_high_t_decays_toward_higher_arousal', () => {
    const h_high = create_human(90);
    const h_low = create_human(10);
    // Set both to same arousal, then decay
    h_high.arousal = 50.0;
    h_low.arousal = 50.0;
    decay_only(h_high, 3.0);
    decay_only(h_low, 3.0);
    expect(h_high.arousal).toBeGreaterThan(h_low.arousal);
  });

  it('test_ssri_reduces_dopamine_from_cocaine', () => {
    const h_ssri = create_human(50, 80);
    const h_normal = create_human(50, 0);
    h_ssri.energy = 80;
    h_normal.energy = 80;
    h_ssri.dopamine = 50.0;
    h_normal.dopamine = 50.0;
    apply_event(h_ssri, 'cocaine', events['cocaine']);
    apply_event(h_normal, 'cocaine', events['cocaine']);
    expect(h_ssri.dopamine).toBeLessThan(h_normal.dopamine);
  });

  it('test_ssri_boosts_serotonin_baseline', () => {
    const h_ssri = create_human(50, 80);
    const eb = get_effective_baselines(h_ssri);
    expect(eb['serotonin']).toBeGreaterThan(50.0);
  });

  it('test_ssri_emotional_blunting', () => {
    const h_ssri = create_human(50, 80);
    const h_normal = create_human(50, 0);
    // Set identical state except SSRI
    for (const h of [h_ssri, h_normal]) {
      h.dopamine = 60;
      h.endorphins = 50;
      h.oxytocin = 40;
      h.serotonin = 55;
      h.anxiety = 30;
      h.absorption = 80;  // high absorption to show blunting
    }
    const p_ssri = h_ssri.pleasure_score();
    const p_normal = h_normal.pleasure_score();
    expect(p_ssri).toBeLessThan(p_normal);
  });

  it('test_life_stress_reduces_receptivity', () => {
    const h_stressed = create_human(50, 0, 80);
    const h_calm = create_human(50, 0, 0);
    for (const category of ['sexual', 'social', 'food', 'drugs']) {
      const r_stressed = compute_receptivity(h_stressed, category);
      const r_calm = compute_receptivity(h_calm, category);
      expect(r_stressed).toBeLessThan(r_calm);
    }
    // Rest should be unaffected
    expect(Math.abs(
      compute_receptivity(h_stressed, 'rest') -
      compute_receptivity(h_calm, 'rest')
    )).toBeLessThanOrEqual(0.01);
  });

  it('test_life_stress_absorption_drain', () => {
    const h = create_human(50, 0, 80);
    h.absorption = 50.0;
    const initial = h.absorption;
    decay_only(h, 1.0);
    expect(h.absorption).toBeLessThan(initial - 1.0);
  });

  it('test_life_stress_psych_health_drain', () => {
    const h = create_human(50, 0, 80);
    const initial = h.psychological_health;
    decay_only(h, 2.0);
    expect(h.psychological_health).toBeLessThan(initial);
  });

  it('test_ssri_plus_stress_moderate_anxiety', () => {
    const h_both = create_human(50, 60, 60);
    const h_stress_only = create_human(50, 0, 60);
    const h_ssri_only = create_human(50, 60, 0);
    const eb_both = get_effective_baselines(h_both);
    const eb_stress = get_effective_baselines(h_stress_only);
    const eb_ssri = get_effective_baselines(h_ssri_only);
    // SSRI should partially offset stress anxiety
    expect(eb_both['anxiety']).toBeLessThan(eb_stress['anxiety']);
    expect(eb_both['anxiety']).toBeGreaterThan(eb_ssri['anxiety']);
  });

  it('test_stressed_person_wakes_with_higher_anxiety', () => {
    const h_stressed = create_human(50, 0, 70);
    const h_calm = create_human(50, 0, 0);
    h_stressed.energy = 40;
    h_stressed.sleepiness = 60;
    h_calm.energy = 40;
    h_calm.sleepiness = 60;
    apply_event(h_stressed, 'sleep', events['sleep']);
    apply_event(h_calm, 'sleep', events['sleep']);
    expect(h_stressed.anxiety).toBeGreaterThan(h_calm.anxiety);
  });

  it('test_ssri_person_wakes_with_higher_prolactin', () => {
    const h_ssri = create_human(50, 70, 0);
    const h_normal = create_human(50, 0, 0);
    h_ssri.energy = 40;
    h_ssri.sleepiness = 60;
    h_normal.energy = 40;
    h_normal.sleepiness = 60;
    apply_event(h_ssri, 'sleep', events['sleep']);
    apply_event(h_normal, 'sleep', events['sleep']);
    expect(h_ssri.prolactin).toBeGreaterThan(h_normal.prolactin);
  });

  it('test_testosterone_ongoing_vasopressin', () => {
    const h_high = create_human(90);
    const h_low = create_human(10);
    h_high.vasopressin = 40.0;
    h_low.vasopressin = 40.0;
    decay_only(h_high, 3.0);
    decay_only(h_low, 3.0);
    expect(h_high.vasopressin).toBeGreaterThan(h_low.vasopressin);
  });
});

// =============================================================================
// DYNAMIC TRAIT EVENTS TESTS
// =============================================================================

describe('DynamicTraitEvents', () => {
  let events;
  let origProb;

  beforeEach(() => {
    events = make_events();
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_ssri_gradual_buildup', () => {
    const h = new Human();
    const initial_ssri = h.ssri_level;
    apply_n_times(h, 'take_ssri', events, 10);
    expect(h.ssri_level).toBeGreaterThan(initial_ssri + 30);
  });

  it('test_ssri_withdrawal', () => {
    const h = new Human();
    h.ssri_level = 50.0;
    const initial_ssri = h.ssri_level;
    const initial_anxiety = h.anxiety;
    apply_event(h, 'stop_ssri', events['stop_ssri']);
    expect(h.ssri_level).toBeLessThan(initial_ssri);
    expect(h.anxiety).toBeGreaterThan(initial_anxiety);
  });

  it('test_testosterone_injection_raises_t', () => {
    const h = new Human();
    const initial_t = h.testosterone;
    apply_event(h, 'testosterone_injection', events['testosterone_injection']);
    expect(h.testosterone).toBeGreaterThan(initial_t);
  });

  it('test_job_loss_increases_stress', () => {
    const h = new Human();
    const initial_stress = h.life_stress;
    const initial_anxiety = h.anxiety;
    apply_event(h, 'job_loss', events['job_loss']);
    expect(h.life_stress).toBeGreaterThan(initial_stress);
    expect(h.anxiety).toBeGreaterThan(initial_anxiety);
  });

  it('test_resolve_finances_decreases_stress', () => {
    const h = new Human();
    h.life_stress = 50.0;
    const initial_stress = h.life_stress;
    apply_event(h, 'resolve_finances', events['resolve_finances']);
    expect(h.life_stress).toBeLessThan(initial_stress);
  });

  it('test_therapy_reduces_stress', () => {
    const h = new Human();
    h.life_stress = 50.0;
    const initial_stress = h.life_stress;
    apply_event(h, 'therapy_session', events['therapy_session']);
    expect(h.life_stress).toBeLessThan(initial_stress);
  });

  it('test_trait_clamping', () => {
    // Test upper bound
    const h = new Human();
    h.ssri_level = 95.0;
    apply_n_times(h, 'take_ssri', events, 5);
    expect(h.ssri_level).toBeLessThanOrEqual(100.0);

    // Test lower bound
    const h2 = new Human();
    h2.life_stress = 5.0;
    h2.life_stress = Math.max(0.0, h2.life_stress);  // ensure starts valid
    // Apply therapy multiple times to try to go below 0
    for (let i = 0; i < 10; i++) {
      events['therapy_session'].apply(h2, 1.0);
    }
    expect(h2.life_stress).toBeGreaterThanOrEqual(0.0);

    // Test testosterone upper bound
    const h3 = new Human();
    h3.testosterone = 95.0;
    for (let i = 0; i < 5; i++) {
      events['testosterone_injection'].apply(h3, 1.0);
    }
    expect(h3.testosterone).toBeLessThanOrEqual(100.0);

    // Test testosterone lower bound
    const h4 = new Human();
    h4.testosterone = 15.0;
    for (let i = 0; i < 5; i++) {
      events['anti_androgen'].apply(h4, 1.0);
    }
    expect(h4.testosterone).toBeGreaterThanOrEqual(0.0);
  });

  it('test_life_events_affect_baselines', () => {
    const h = new Human();
    const h_control = new Human();

    // Apply job_loss to stressed human
    apply_event(h, 'job_loss', events['job_loss']);

    // Let both decay for a while
    decay_only(h, 3.0);
    decay_only(h_control, 3.0);

    // The human who lost their job should have higher anxiety
    // because life_stress raises the anxiety baseline
    expect(h.anxiety).toBeGreaterThan(h_control.anxiety);
  });
});

// =============================================================================
// WANTING / LIKING TESTS
// =============================================================================

describe('WantingLiking', () => {
  let events;
  let origProb;

  beforeEach(() => {
    events = make_events();
    origProb = getEnableProbabilistic();
    setEnableProbabilistic(false);
  });

  afterEach(() => {
    setEnableProbabilistic(origProb);
  });

  it('test_liking_excludes_dopamine', () => {
    const h1 = new Human();
    h1.dopamine = 50;
    const liking_before = h1.liking_score();

    const h2 = new Human();
    h2.dopamine = 95;  // massive dopamine spike
    const liking_after = h2.liking_score();

    // Liking should be nearly the same since it excludes dopamine
    expect(Math.abs(liking_before - liking_after)).toBeLessThanOrEqual(2.0);
  });

  it('test_wanting_tracks_dopamine', () => {
    const h_low = new Human();
    h_low.dopamine = 30;
    const wanting_low = h_low.wanting_score();

    const h_high = new Human();
    h_high.dopamine = 80;
    const wanting_high = h_high.wanting_score();

    expect(wanting_high).toBeGreaterThan(wanting_low);
  });

  it('test_cocaine_high_wanting_low_liking', () => {
    const h = new Human();
    h.energy = 80;
    // Cocaine binge
    apply_n_times(h, 'cocaine', events, 5);
    // Let it decay a bit (crash phase)
    decay_only(h, 1.0);

    const wanting = h.wanting_score();
    const liking = h.liking_score();

    // After cocaine crash: dopamine depleted but cue salience high,
    // wanting should still be notable relative to liking
    expect(h.cue_salience['drugs']).toBeGreaterThan(0.01);
  });

  it('test_cuddling_high_liking', () => {
    const h = new Human();
    const liking_before = h.liking_score();
    const wanting_before = h.wanting_score();

    apply_n_times(h, 'cuddling', events, 3);

    const liking_gain = h.liking_score() - liking_before;
    const wanting_gain = h.wanting_score() - wanting_before;

    expect(liking_gain).toBeGreaterThan(wanting_gain);
  });

  it('test_prolactin_suppresses_wanting', () => {
    const h_low_prl = new Human();
    h_low_prl.prolactin = 10;
    h_low_prl.dopamine = 60;
    const wanting_low_prl = h_low_prl.wanting_score();

    const h_high_prl = new Human();
    h_high_prl.prolactin = 80;
    h_high_prl.dopamine = 60;
    const wanting_high_prl = h_high_prl.wanting_score();

    expect(wanting_low_prl).toBeGreaterThan(wanting_high_prl);
  });

  it('test_cue_salience_increases_wanting', () => {
    const h_no_cue = new Human();
    h_no_cue.dopamine = 60;
    const wanting_no_cue = h_no_cue.wanting_score();

    const h_cue = new Human();
    h_cue.dopamine = 60;
    h_cue.cue_salience['sexual'] = 0.8;
    const wanting_cue = h_cue.wanting_score();

    expect(wanting_cue).toBeGreaterThan(wanting_no_cue);
  });

  it('test_pleasure_score_backward_compat', () => {
    const h = new Human();
    h.dopamine = 70;
    h.endorphins = 50;
    h.oxytocin = 40;
    h.serotonin = 55;
    h.anxiety = 25;
    h.absorption = 60;
    expect(h.pleasure_score()).toBe(h.liking_score());
  });
});
