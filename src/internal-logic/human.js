/**
 * Simulates basic human physiology with neurotransmitters and vital parameters.
 * All values are on a 0-100 scale unless noted otherwise.
 */

export class Human {
  // Fields excluded from 0-100 clamping (unbounded or non-numeric)
  static _UNCLAMPED_FIELDS = new Set([
    'time_since_orgasm',   // unbounded time counter
    'time_since_exercise', // unbounded time counter
    'tolerance', 'reserves', 'cue_salience',  // dicts, clamped separately
    'active_effects', 'rebound_queue',  // lists, not clamped
    'ssri_level', 'life_stress',  // traits, not state
  ]);

  // Hardcoded list of float field names clamped to [0, 100]
  static _FLOAT_FIELDS = [
    'dopamine', 'oxytocin', 'endorphins', 'serotonin',
    'prolactin', 'vasopressin', 'arousal', 'prefrontal',
    'sleepiness', 'anxiety', 'absorption', 'hunger',
    'energy', 'physical_health', 'psychological_health',
    'time_since_orgasm', 'edging_buildup', 'digesting',
    'sexual_inhibition', 'shutdown',
    'testosterone',  // also a float but in _UNCLAMPED_FIELDS check will skip via the set
    'anandamide',
  ];

  // Clamped float fields (subset of _FLOAT_FIELDS, excluding _UNCLAMPED_FIELDS)
  static _CLAMPED_FLOAT_FIELDS = [
    'dopamine', 'oxytocin', 'endorphins', 'serotonin',
    'prolactin', 'vasopressin', 'arousal', 'prefrontal',
    'sleepiness', 'anxiety', 'absorption', 'hunger',
    'energy', 'physical_health', 'psychological_health',
    'edging_buildup', 'digesting',
    'sexual_inhibition', 'shutdown',
    'testosterone',
    'anandamide',
  ];

  constructor({
    testosterone = 50.0,
    ssri_level = 0.0,
    life_stress = 0.0,
    dopamine = 50.0,
    oxytocin = 30.0,
    endorphins = 20.0,
    serotonin = 50.0,
    prolactin = 10.0,
    vasopressin = 20.0,
    arousal = 20.0,
    prefrontal = 50.0,
    sleepiness = 20.0,
    anxiety = 30.0,
    absorption = 30.0,
    hunger = 20.0,
    energy = 80.0,
    physical_health = 80.0,
    psychological_health = 70.0,
    time_since_orgasm = 0.0,
    edging_buildup = 0.0,
    digesting = 0.0,
    sexual_inhibition = 0.0,
    shutdown = 0.0,
    anandamide = 30.0,
  } = {}) {
    // === BASELINE CONFIGURATION ===
    this.testosterone = testosterone;   // 0 = very low T, 100 = very high T
    this.ssri_level = ssri_level;       // 0-100, psychiatric medication dose
    this.life_stress = life_stress;     // 0-100, background chronic stress

    // === NEUROTRANSMITTERS ===
    this.dopamine = dopamine;           // reward, motivation, pleasure anticipation
    this.oxytocin = oxytocin;           // bonding, trust, relaxation
    this.endorphins = endorphins;       // pain relief, euphoria
    this.serotonin = serotonin;         // mood stability, wellbeing

    // === HORMONES (dynamic) ===
    this.prolactin = prolactin;         // post-orgasm hormone, refractory period
    this.vasopressin = vasopressin;     // active arousal, focus, intensity, dominance

    // === PHYSIOLOGICAL STATE ===
    this.arousal = arousal;             // physical/sexual arousal
    this.prefrontal = prefrontal;       // prefrontal cortex activity
    this.sleepiness = sleepiness;       // drowsiness (0 = alert, 100 = falling asleep)

    // === MENTAL STATE ===
    this.anxiety = anxiety;             // mental tension, worry (cortisol proxy)
    this.absorption = absorption;       // immersion in experience

    // Basic needs
    this.hunger = hunger;               // 0 = full, 100 = starving
    this.energy = energy;               // 0 = exhausted, 100 = fully rested

    // Health (slower changing)
    this.physical_health = physical_health;
    this.psychological_health = psychological_health;

    // Internal state tracking
    this.time_since_orgasm = time_since_orgasm;
    this.time_since_exercise = 999.0;  // starts available
    this.edging_buildup = edging_buildup;
    this.digesting = digesting;

    // === DUAL CONTROL MODEL ===
    this.sexual_inhibition = sexual_inhibition;  // 0 = no brake, 100 = full inhibition

    // === WINDOW OF TOLERANCE / POLYVAGAL ===
    this.shutdown = shutdown;           // 0 = normal, 100 = full dorsal collapse

    // === ENDOCANNABINOID SYSTEM ===
    this.anandamide = anandamide;       // endocannabinoid tone — background bliss, pain mod, appetite

    // === PHYSIOLOGICAL REALISM ===
    this.tolerance = {
      sexual: 0.0, pain: 0.0, social: 0.0,
      breathwork: 0.0, food: 0.0, rest: 0.0, drugs: 0.0,
      medical: 0.0, life: 0.0,
    };
    this.reserves = {
      dopamine: 100.0, serotonin: 100.0,
      endorphins: 100.0, oxytocin: 100.0,
    };
    this.active_effects = [];
    this.rebound_queue = [];
    this.cue_salience = {
      sexual: 0.0, pain: 0.0, social: 0.0,
      breathwork: 0.0, food: 0.0, rest: 0.0, drugs: 0.0,
      medical: 0.0, life: 0.0,
    };
  }

  clamp_values() {
    /**
     * Keep all values within valid bounds.
     * Float fields are clamped to [0, 100] by default.
     * Dict fields have their own bounds.
     */
    for (const fieldName of Human._CLAMPED_FLOAT_FIELDS) {
      this[fieldName] = Math.max(0, Math.min(100, this[fieldName]));
    }

    for (const k of Object.keys(this.reserves)) {
      this.reserves[k] = Math.max(0, Math.min(100, this.reserves[k]));
    }
    for (const k of Object.keys(this.tolerance)) {
      this.tolerance[k] = Math.max(0.0, Math.min(1.0, this.tolerance[k]));
    }
    for (const k of Object.keys(this.cue_salience)) {
      this.cue_salience[k] = Math.max(0.0, Math.min(1.0, this.cue_salience[k]));
    }
  }

  yerkes_dodson_optimum() {
    /**
     * Individualized optimal anxiety level for Yerkes-Dodson curve.
     * Base: 35. Modified by testosterone and SSRI.
     */
    let optimum = 35.0;
    // High T = lower optimum (less anxiety needed for peak performance)
    optimum -= (this.testosterone - 50) / 50 * 5;
    // SSRI = lower optimum (less anxiety needed)
    const ssri_pct = this.ssri_level / 100.0;
    optimum -= ssri_pct * 8;
    return Math.max(10.0, Math.min(50.0, optimum));
  }

  emotional_tone_score() {
    /**
     * Background emotional tone — the stable mood floor.
     * Driven by slow-moving variables: serotonin (contentment),
     * oxytocin (warmth/safety), anandamide (endocannabinoid bliss).
     * Range: 0–100.
     */
    return (
      this.serotonin              * 0.35 +
      this.oxytocin               * 0.30 +
      (this.anandamide ?? 30)     * 0.35
    );
  }

  liking_score() {
    /**
     * Hedonic wellbeing score - how good it actually feels.
     * Dynamic peaks (endorphins/dopamine) from actions, amplified/floored
     * by slow emotional tone (serotonin/oxytocin/anandamide).
     */
    // Dynamic hedonic peaks — generated by actions
    const dynamic_peaks = this.endorphins * 0.65 + this.dopamine * 0.12;

    // Emotional floor — slow-moving tone acts as context/amplifier
    const emotional_tone = this.emotional_tone_score();

    // Base liking: peaks + tone floor (additive — tone adds a stable background)
    const base_liking = dynamic_peaks + emotional_tone * 0.30;

    // Yerkes-Dodson inverted-U: individualized optimum
    const optimum = this.yerkes_dodson_optimum();
    let anxiety_factor;
    if (this.anxiety <= optimum) {
      anxiety_factor = 0.92 + (this.anxiety / optimum) * 0.13;
    } else {
      anxiety_factor = 1.05 - ((this.anxiety - optimum) / (100 - optimum)) * 0.45;
    }

    // Absorption bonus: high absorption amplifies pleasure
    // SSRI halves the absorption amplification (emotional blunting)
    const ssri_pct = this.ssri_level / 100.0;
    const max_bonus = 0.3 * (1 - ssri_pct * 0.5);
    const absorption_factor = 1.0 + (this.absorption / 100) * max_bonus;

    // Shutdown (dorsal vagal): numbs all valence
    const shutdown_factor = 1.0 - (this.shutdown / 100) * 0.8;

    return base_liking * anxiety_factor * absorption_factor * shutdown_factor;
  }

  wanting_score() {
    /**
     * Approach motivation score - how driven/compelled.
     * Dopamine is the pure wanting signal; vasopressin amplifies drive intensity.
     */
    // Dopamine is the pure wanting signal; arousal adds urgency
    const dynamic_want = this.dopamine * 0.55 + this.arousal * 0.25;

    // Vasopressin amplifies drive intensity (goal-directed pursuit behavior)
    const vaso_drive = 0.70 + (this.vasopressin / 100) * 0.55;  // 0.70–1.25

    let base_wanting = dynamic_want * vaso_drive;

    // Add cue salience contribution (max salience across categories)
    const salience_values = Object.values(this.cue_salience);
    const max_salience = salience_values.length > 0 ? Math.max(...salience_values) : 0;
    base_wanting += max_salience * 25;  // up to +25 from learned wanting

    // Prolactin suppression (refractory/satiation dampens wanting)
    const prolactin_factor = 1.0 - (this.prolactin / 100) * 0.5;

    // Low energy suppression (depletion reduces drive)
    const energy_factor = 0.6 + (this.energy / 100) * 0.4;

    // Shutdown also collapses drive
    const shutdown_factor = 1.0 - (this.shutdown / 100) * 0.6;

    return base_wanting * prolactin_factor * energy_factor * shutdown_factor;
  }

  pleasure_score() {
    /**
     * Backward-compatible alias for liking_score().
     */
    return this.liking_score();
  }

  is_viable() {
    /**
     * Check if human is in a viable state (not dead/incapacitated).
     */
    return (
      this.energy > 5 &&
      this.hunger < 95 &&
      this.physical_health > 10 &&
      this.psychological_health > 10 &&
      this.sleepiness < 95  // too sleepy = falls asleep
    );
  }

  toString() {
    const res = this.reserves;
    let traits = `T=${this.testosterone.toFixed(0)}`;
    if (this.ssri_level > 0) traits += `, SSRI=${this.ssri_level.toFixed(0)}`;
    if (this.life_stress > 0) traits += `, stress=${this.life_stress.toFixed(0)}`;
    return (
      `Human(${traits}, dopa=${this.dopamine.toFixed(1)}, oxy=${this.oxytocin.toFixed(1)}, ` +
      `vaso=${this.vasopressin.toFixed(1)}, prol=${this.prolactin.toFixed(1)}, ` +
      `arousal=${this.arousal.toFixed(1)}, anxiety=${this.anxiety.toFixed(1)}, ` +
      `absorb=${this.absorption.toFixed(1)}, sleepy=${this.sleepiness.toFixed(1)}, ` +
      `res=[D:${res.dopamine.toFixed(0)} S:${res.serotonin.toFixed(0)} ` +
      `E:${res.endorphins.toFixed(0)} O:${res.oxytocin.toFixed(0)}])`
    );
  }
}

/**
 * Factory function to create a Human with trait-adjusted initial values.
 * Testosterone (0-100) affects:
 * - Baseline arousal: higher T = higher baseline arousal
 * - Energy: higher T = slightly more energy
 * - Anxiety: higher T = slightly lower baseline anxiety
 * - Vasopressin baseline: higher T = higher vasopressin tendency
 * SSRI (0-100) affects serotonin, prolactin, anxiety, dopamine baselines.
 * Life stress (0-100) affects anxiety and absorption baselines.
 */
export function create_human(testosterone = 50.0, ssri_level = 0.0, life_stress = 0.0) {
  const t_factor = testosterone / 50.0;  // 1.0 at T=50, 0.0 at T=0, 2.0 at T=100

  return new Human({
    testosterone,
    ssri_level,
    life_stress,
    arousal: 15.0 + 10.0 * t_factor,           // 15-35 based on T
    energy: 75.0 + 10.0 * t_factor,            // 75-95 based on T
    anxiety: 35.0 - 10.0 * t_factor,           // 35-15 based on T (inverse)
    vasopressin: 15.0 + 10.0 * t_factor,       // 15-35 based on T
  });
}

export const HUMAN_PRESETS = {
  default: {
    testosterone: 50.0,
    ssri_level: 0.0,
    life_stress: 0.0,
    overrides: {},
  },
  unemployed: {
    testosterone: 50.0,
    ssri_level: 0.0,
    life_stress: 28.0,
    overrides: {
      anxiety: 42.0,
      energy: 68.0,
      psychological_health: 62.0,
    },
  },
  breakup: {
    testosterone: 50.0,
    ssri_level: 0.0,
    life_stress: 24.0,
    overrides: {
      oxytocin: 16.0,
      anxiety: 44.0,
      energy: 66.0,
      psychological_health: 56.0,
    },
  },
  antidepressants: {
    testosterone: 50.0,
    ssri_level: 58.0,
    life_stress: 12.0,
    overrides: {
      serotonin: 62.0,
      prolactin: 18.0,
      arousal: 16.0,
      absorption: 24.0,
    },
  },
  high_testosterone: {
    testosterone: 78.0,
    ssri_level: 0.0,
    life_stress: 6.0,
    overrides: {
      energy: 88.0,
      arousal: 28.0,
      vasopressin: 30.0,
      anxiety: 24.0,
    },
  },
  luteal: {
    testosterone: 42.0,
    ssri_level: 0.0,
    life_stress: 18.0,
    overrides: {
      anxiety: 46.0,
      energy: 64.0,
      hunger: 34.0,
      sleepiness: 28.0,
      psychological_health: 64.0,
      serotonin: 46.0,
    },
  },
};

export function get_human_presets() {
  return HUMAN_PRESETS;
}

export function create_human_from_preset(presetId = 'default') {
  const preset = HUMAN_PRESETS[presetId] || HUMAN_PRESETS.default;
  const human = create_human(preset.testosterone, preset.ssri_level, preset.life_stress);
  Object.assign(human, preset.overrides || {});
  human.clamp_values();
  return human;
}
