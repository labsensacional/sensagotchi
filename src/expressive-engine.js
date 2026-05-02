(function () {
  function clamp(x, lo = 0, hi = 1) {
    return Math.max(lo, Math.min(hi, x));
  }

  function inferLikingScore(state) {
    if (typeof state.liking_score === 'number') {
      return state.liking_score;
    }

    const dopamine = (state.dopamine ?? DEFAULT_EXPRESSIVE_STATE.dopamine) / 100;
    const oxytocin = (state.oxytocin ?? DEFAULT_EXPRESSIVE_STATE.oxytocin) / 100;
    const endorphins = (state.endorphins ?? DEFAULT_EXPRESSIVE_STATE.endorphins) / 100;
    const serotonin = (state.serotonin ?? DEFAULT_EXPRESSIVE_STATE.serotonin) / 100;
    const anandamide = (state.anandamide ?? DEFAULT_EXPRESSIVE_STATE.anandamide) / 100;

    const emotionalTone = serotonin * 0.35 + oxytocin * 0.30 + anandamide * 0.35;
    const liking = clamp(endorphins * 0.65 + dopamine * 0.12 + emotionalTone * 0.30);
    return liking * 100;
  }

  const DEFAULT_EXPRESSIVE_STATE = {
    dopamine: 50,
    oxytocin: 30,
    endorphins: 20,
    serotonin: 50,
    prolactin: 10,
    vasopressin: 20,
    arousal: 20,
    prefrontal: 50,
    sleepiness: 20,
    anxiety: 30,
    absorption: 30,
    hunger: 20,
    energy: 80,
    shutdown: 0,
    anandamide: 30,
    physical_health: 80,
    psychological_health: 70,
    life_stress: 0,
    ssri_level: 0,
  };

  const MOTION_PRESET_LIBRARY = {
    idle: {
      label: 'idle',
      summary: 'resting micro-bob with neutral regulation',
    },
    sway: {
      label: 'sway',
      summary: 'soft side-to-side looseness from positive affect',
    },
    bounce: {
      label: 'bounce',
      summary: 'energetic vertical spring from high liking and arousal',
    },
    shake: {
      label: 'shake',
      summary: 'rapid jitter from anxiety and threat load',
    },
    droop: {
      label: 'droop',
      summary: 'slow downward sag from sleep pressure',
    },
    'barely-moving': {
      label: 'barely moving',
      summary: 'micro-collapse with minimal drive and shutdown',
    },
  };

  const SOUND_CUE_LIBRARY = {
    stomach_rumble: {
      label: 'stomach rumble',
      family: 'body',
      summary: 'gut / hunger noises',
    },
    yawn: {
      label: 'yawn',
      family: 'vocal',
      summary: 'sleep pressure release',
    },
    snore: {
      label: 'snore',
      family: 'vocal',
      summary: 'shutdown or extreme sleepiness loop',
    },
    shaky_breath: {
      label: 'shaky breath',
      family: 'breath',
      summary: 'fearful or overactivated breathing',
    },
    whimper: {
      label: 'whimper',
      family: 'vocal',
      summary: 'fragility, distress, depleted mood',
    },
    pleasure_moan: {
      label: 'pleasure moan',
      family: 'vocal',
      summary: 'high arousal + positive valence',
    },
    warm_purr: {
      label: 'warm hum / purr',
      family: 'vocal',
      summary: 'bonding, soothed, high oxytocin',
    },
    growl: {
      label: 'growl / grit',
      family: 'body',
      summary: 'anger, effort, vasopressin-heavy tension',
    },
  };

  function getAnimationPreset(state) {
    const likingScore = inferLikingScore(state);
    if (state.shutdown > 40) return 'barely-moving';
    if (state.sleepiness > 60) return 'droop';
    if (state.anxiety > 60) return 'shake';
    if (likingScore > 65 && state.arousal > 55) return 'bounce';
    if (likingScore > 48) return 'sway';
    return 'idle';
  }

  function getMotionProfile(state) {
    const preset = getAnimationPreset(state);
    const anxiety = clamp((state.anxiety ?? 0) / 100);
    const sleepiness = clamp((state.sleepiness ?? 0) / 100);
    const shutdown = clamp((state.shutdown ?? 0) / 100);
    const arousal = clamp((state.arousal ?? 0) / 100);
    const energy = clamp((state.energy ?? 100) / 100);
    const liking = clamp(inferLikingScore(state) / 100);

    let intensity = 0.25;
    if (preset === 'barely-moving') {
      intensity = clamp(Math.max(shutdown, 1 - energy, sleepiness) * 0.9, 0.35, 1);
    } else if (preset === 'droop') {
      intensity = clamp(sleepiness * 0.9 + (1 - energy) * 0.25, 0.25, 1);
    } else if (preset === 'shake') {
      intensity = clamp(anxiety * 0.95 + arousal * 0.2, 0.25, 1);
    } else if (preset === 'bounce') {
      intensity = clamp(arousal * 0.7 + liking * 0.4, 0.25, 1);
    } else if (preset === 'sway') {
      intensity = clamp(liking * 0.75 + (1 - anxiety) * 0.15, 0.2, 1);
    } else {
      intensity = clamp(0.22 + energy * 0.18 - shutdown * 0.2, 0.12, 0.45);
    }

    const profile = {
      preset,
      label: MOTION_PRESET_LIBRARY[preset].label,
      summary: MOTION_PRESET_LIBRARY[preset].summary,
      intensity,
      className: `anim-${preset}`,
      cssVars: {
        '--motion-duration': '3.5s',
        '--motion-rise': '4px',
        '--motion-sway-rot': '3deg',
        '--motion-shake-x': '5px',
        '--motion-shake-rot': '2deg',
        '--motion-droop-y': '5px',
        '--motion-droop-scale': '0.97',
        '--motion-micro-scale': '0.99',
        '--motion-micro-y': '2px',
      },
    };

    if (preset === 'idle') {
      profile.cssVars['--motion-duration'] = `${(4.1 - intensity * 1.1).toFixed(2)}s`;
      profile.cssVars['--motion-rise'] = `${(2 + intensity * 4).toFixed(1)}px`;
    } else if (preset === 'sway') {
      profile.cssVars['--motion-duration'] = `${(2.8 - intensity * 0.9).toFixed(2)}s`;
      profile.cssVars['--motion-sway-rot'] = `${(2 + intensity * 4.5).toFixed(2)}deg`;
    } else if (preset === 'bounce') {
      profile.cssVars['--motion-duration'] = `${(0.95 - intensity * 0.35).toFixed(2)}s`;
      profile.cssVars['--motion-rise'] = `${(8 + intensity * 12).toFixed(1)}px`;
    } else if (preset === 'shake') {
      profile.cssVars['--motion-duration'] = `${(0.78 - intensity * 0.33).toFixed(2)}s`;
      profile.cssVars['--motion-shake-x'] = `${(2 + intensity * 7).toFixed(1)}px`;
      profile.cssVars['--motion-shake-rot'] = `${(0.8 + intensity * 2.5).toFixed(2)}deg`;
    } else if (preset === 'droop') {
      profile.cssVars['--motion-duration'] = `${(4.6 - intensity * 1.1).toFixed(2)}s`;
      profile.cssVars['--motion-droop-y'] = `${(3 + intensity * 5).toFixed(1)}px`;
      profile.cssVars['--motion-droop-scale'] = `${(0.99 - intensity * 0.04).toFixed(3)}`;
    } else if (preset === 'barely-moving') {
      profile.cssVars['--motion-duration'] = `${(6.8 - intensity * 1.8).toFixed(2)}s`;
      profile.cssVars['--motion-micro-scale'] = `${(0.997 - intensity * 0.02).toFixed(3)}`;
      profile.cssVars['--motion-micro-y'] = `${(1 + intensity * 3).toFixed(1)}px`;
    }

    return profile;
  }

  function getVisualStateClasses(state) {
    const classes = [];
    if ((state.life_stress ?? 0) >= 60) {
      classes.push('state-stress-high');
    } else if ((state.life_stress ?? 0) >= 15) {
      classes.push('state-stress-low');
    }

    if ((state.ssri_level ?? 0) >= 10) {
      classes.push('state-ssri');
    }
    if ((state.shutdown ?? 0) >= 35) {
      classes.push('state-shutdown');
    }
    if ((state.energy ?? 100) <= 30) {
      classes.push('state-low-energy');
    }
    if (Math.min(state.physical_health ?? 100, state.psychological_health ?? 100) <= 38) {
      classes.push('state-health-critical');
    }
    return classes;
  }

  function getOverlayCues(state) {
    const worstHealth = Math.min(
      state.physical_health ?? 100,
      state.psychological_health ?? 100
    );

    const thoughtClouds = [
      {
        id: 'thought-hunger',
        show: state.hunger >= 68,
        critical: state.hunger >= 82,
        emojis: state.hunger >= 82 ? '🍕 🍔 🌮' : '🍕 🍔',
      },
      {
        id: 'thought-energy',
        show: state.energy <= 30,
        critical: state.energy <= 18,
        emojis: state.energy <= 18 ? '🛏️ 💤 😴' : '🛏️ 💤',
      },
    ];

    const callouts = [];
    if ((state.psychological_health ?? 100) <= 38) {
      callouts.push({
        icon: '🧠',
        labelKey: 'ui.callout_psych',
        critical: (state.psychological_health ?? 100) <= 24,
      });
    }
    if ((state.physical_health ?? 100) <= 38) {
      callouts.push({
        icon: '❤️',
        labelKey: 'ui.callout_physical',
        critical: (state.physical_health ?? 100) <= 24,
      });
    }

    const visibleCallouts = callouts
      .sort((a, b) => Number(b.critical) - Number(a.critical))
      .slice(0, worstHealth <= 24 ? 2 : 1);

    return {
      thoughtClouds,
      callouts: visibleCallouts,
    };
  }

  function getSoundCues(state) {
    const cues = [];
    const hunger = state.hunger ?? 0;
    const sleepiness = state.sleepiness ?? 0;
    const anxiety = state.anxiety ?? 0;
    const arousal = state.arousal ?? 0;
    const energy = state.energy ?? 100;
    const oxytocin = state.oxytocin ?? 0;
    const vasopressin = state.vasopressin ?? 0;
    const shutdown = state.shutdown ?? 0;
    const physicalHealth = state.physical_health ?? 100;
    const psychologicalHealth = state.psychological_health ?? 100;
    const liking = inferLikingScore(state);

    if (hunger >= 52) {
      cues.push({
        id: 'stomach_rumble',
        intensity: clamp((hunger - 52) / 48, 0.2, 1),
        priority: hunger >= 82 ? 94 : 70,
        cooldown_ms: hunger >= 82 ? 2800 : 5200,
        reason: hunger >= 82 ? 'critical hunger spike' : 'sustained hunger load',
      });
    }
    if (sleepiness >= 55 && arousal < 60) {
      cues.push({
        id: 'yawn',
        intensity: clamp((sleepiness - 55) / 45, 0.2, 1),
        priority: 58,
        cooldown_ms: 9000,
        reason: 'sleep pressure with enough slack to yawn',
      });
    }
    if (sleepiness >= 82 || shutdown >= 58) {
      cues.push({
        id: 'snore',
        intensity: clamp(Math.max((sleepiness - 82) / 18, shutdown / 100), 0.25, 1),
        priority: 88,
        cooldown_ms: 7000,
        reason: 'extreme fatigue or shutdown collapse',
      });
    }
    if (anxiety >= 52) {
      cues.push({
        id: 'shaky_breath',
        intensity: clamp((anxiety - 52) / 48, 0.2, 1),
        priority: 76,
        cooldown_ms: 3200,
        reason: 'anxiety-driven autonomic activation',
      });
    }
    if ((psychologicalHealth <= 42 && liking <= 34) || (energy <= 28 && psychologicalHealth <= 50)) {
      cues.push({
        id: 'whimper',
        intensity: clamp(Math.max((42 - psychologicalHealth) / 42, (34 - liking) / 34, (28 - energy) / 28), 0.2, 1),
        priority: psychologicalHealth <= 24 ? 92 : 72,
        cooldown_ms: 4800,
        reason: 'fragility, depletion, or low hedonic floor',
      });
    }
    if (arousal >= 68 && liking >= 52) {
      cues.push({
        id: 'pleasure_moan',
        intensity: clamp(((arousal - 68) / 32) * 0.6 + ((liking - 52) / 48) * 0.4, 0.2, 1),
        priority: 66,
        cooldown_ms: 2600,
        reason: 'high arousal with positive valence',
      });
    }
    if (oxytocin >= 60 && anxiety <= 38 && psychologicalHealth >= 45) {
      cues.push({
        id: 'warm_purr',
        intensity: clamp(((oxytocin - 60) / 40) * 0.7 + ((45 - anxiety) / 45) * 0.3, 0.2, 1),
        priority: 54,
        cooldown_ms: 6200,
        reason: 'bonding warmth and low threat',
      });
    }
    if (vasopressin >= 58 && anxiety >= 38 && physicalHealth >= 24) {
      cues.push({
        id: 'growl',
        intensity: clamp(((vasopressin - 58) / 42) * 0.7 + ((anxiety - 38) / 62) * 0.3, 0.2, 1),
        priority: 74,
        cooldown_ms: 3500,
        reason: 'tension, aggression, or effort load',
      });
    }

    return cues
      .map((cue) => ({
        ...SOUND_CUE_LIBRARY[cue.id],
        ...cue,
      }))
      .sort((a, b) => b.priority - a.priority || b.intensity - a.intensity);
  }

  function stateToExpressionParams(state) {
    const s = { ...DEFAULT_EXPRESSIVE_STATE, ...state };

    const da = s.dopamine / 100;
    const ox = s.oxytocin / 100;
    const en = s.endorphins / 100;
    const se = s.serotonin / 100;
    const pr = s.prolactin / 100;
    const va = s.vasopressin / 100;
    const ar = s.arousal / 100;
    const pf = s.prefrontal / 100;
    const sl = s.sleepiness / 100;
    const an = s.anxiety / 100;
    const ab = s.absorption / 100;
    const hu = s.hunger / 100;
    const eg = s.energy / 100;
    const sh = s.shutdown / 100;
    const ph = (s.physical_health ?? 80) / 100;
    const psh = (s.psychological_health ?? 70) / 100;
    const health = Math.min(ph, psh);
    const ana = (s.anandamide ?? 30) / 100;

    const emotionalTone = se * 0.35 + ox * 0.30 + ana * 0.35;
    const liking = clamp(en * 0.65 + da * 0.12 + emotionalTone * 0.30);
    const tone = clamp(ar * 0.35 + va * 0.25 + eg * 0.20 - sh * 0.90 - sl * 0.45 - pr * 0.25 + 0.25);
    const threat = clamp(an * 0.50 + (1 - eg) * 0.30 + (1 - pf) * 0.20);

    const ahegaoFlag = ar > 0.78 && liking > 0.72 && ab > 0.72 && pf < 0.32;

    let pose = 'neutral';
    if (sh > 0.55 || (sl > 0.70 && eg < 0.28) || eg < 0.15) {
      pose = 'postration';
    } else if (threat > 0.58 && tone < 0.40) {
      pose = 'contraction';
    } else if (threat > 0.58 && tone > 0.52) {
      pose = 'expansion';
    } else if (va > 0.58 && an < 0.42 && tone > 0.55) {
      pose = 'tension';
    } else if (ar > 0.72 && an < 0.35 && liking > 0.52) {
      pose = 'sobresalto';
    }

    const heightScale = clamp(0.88 + tone * 0.20, 0.82, 1.10);
    const widthScale = pose === 'postration'
      ? clamp(1.02 + sl * 0.06, 0.90, 1.10)
      : clamp(0.93 + liking * 0.10 - an * 0.04, 0.86, 1.06);

    const healthGlaze = clamp((0.30 - health) * 2.5, 0, 0.45);
    const openness = clamp(0.55 + ar * 0.75 - sl * 0.60 + an * 0.40 - pr * 0.30 - healthGlaze * 0.5);
    const lidDrop = clamp(sl * 0.80 + pr * 0.45 - ar * 0.25 + healthGlaze);
    const pupilScale = clamp(0.60 + ar * 0.55 + an * 0.35 - pr * 0.30 - sl * 0.20 + da * 0.22 - healthGlaze * 0.4);

    let browAngle = 0;
    if (threat > 0.45) {
      const aggression = va - an * 0.3;
      if (aggression > 0.35 && liking < 0.50) {
        browAngle = clamp(-aggression * 1.0, -0.90, 0);
      } else {
        browAngle = clamp(threat * 0.80 - liking * 0.50, 0, 0.85);
      }
    } else if (liking < 0.30 && tone < 0.38) {
      browAngle = clamp((0.30 - liking) * 1.2, 0, 0.65);
    }
    const hOffset = Math.round(clamp(-56 + ar * 24 + (1 - eg) * 10, -60, -22));

    const curve = clamp((liking - 0.35) * 1.60, -0.85, 0.85);
    const openAmount = clamp(
      ar * 0.30 + an * 0.35 + threat * 0.15 +
      liking * 0.15 + ar * liking * 0.80 -
      pr * 0.55 - sl * 0.40
    );
    const openUp = pose === 'contraction' && an > 0.60 && openAmount > 0.22;
    const showTeeth = (liking > 0.58 && openAmount > 0.35) ||
      (an > 0.55 && va > 0.58 && openAmount > 0.30) ||
      (openUp && openAmount > 0.28) ||
      (an > 0.55 && openAmount > 0.40 && liking < 0.30);
    const openRound = ar > 0.68 && threat < 0.38 && openAmount > 0.48 && liking < 0.45;

    const blush = clamp(liking * 0.90 + ox * 0.25 + ana * 0.08 - an * 0.15 - 0.28);
    const spiky = clamp(an * 0.60 + (1 - pf) * 0.15 + threat * 0.20 - liking * 0.30);
    const sweat = clamp(an * 0.50 + ar * 0.25 - eg * 0.20);
    const pallor = clamp(sh * 0.65 + (1 - eg) * 0.20 + an * 0.35 - liking * 0.45);
    const disgustSignal = clamp((1 - liking) * 0.55 + (1 - pf) * 0.20 - ar * 0.35);
    const nostrilFlare = clamp(va * 0.65 + threat * 0.30 - liking * 0.25, 0, 1) - disgustSignal * 0.70;
    const zzz = clamp(sl * 0.90 - eg * 0.40 - ar * 0.50);
    const drool = clamp(hu * 0.80 - pf * 0.35 - liking * 0.25);
    const veins = clamp((0.45 - health) * 2.2);

    const smileSignal = clamp(curve * 0.50 + openAmount * 0.80);
    const eyeCrinkle = clamp(liking * 1.60 - 0.65) * clamp(smileSignal * 2.50 - 0.15, 0, 1);

    let foreheadType = null;
    let foreheadIntensity = 0;
    if (browAngle > 0.35) {
      foreheadType = 'suffering';
      foreheadIntensity = clamp((browAngle - 0.35) * 3.5);
    } else if (openRound) {
      foreheadType = 'attention';
      foreheadIntensity = clamp(ar * 1.4 - 0.55);
    } else if (browAngle < -0.35) {
      foreheadType = 'focus';
      foreheadIntensity = clamp((-browAngle - 0.35) * 5.0);
    }

    const browThickness = clamp(4.0 + Math.abs(browAngle) * 6.0 + threat * 2.0, 4.0, 9.0);
    const pupilY = ahegaoFlag ? clamp(-(ar - 0.75) * 4.5, -1, 0) : 0;
    const eyesClosed = sl > 0.85 || sh > 0.70;
    const tongueOut = (ahegaoFlag && openAmount > 0.40) ||
      (ar > 0.85 && liking > 0.72 && openAmount > 0.45 && !openRound);
    const tongueSide = ahegaoFlag ? 0.80 : 0;
    const bruxism = clamp(va * 0.55 + an * 0.45 - liking * 0.60 - ar * 0.30)
      * clamp((va - 0.30) * 3, 0, 1);
    const lowerTeeth = showTeeth && (
      (va > 0.55 && threat > 0.55 && openAmount > 0.45) ||
      (liking > 0.82 && ar > 0.78 && openAmount > 0.55)
    );

    return {
      body: { pose, height_scale: heightScale, width_scale: widthScale },
      eyes: {
        openness: clamp(openness, 0.30, 2.00),
        pupil_scale: clamp(pupilScale, 0.50, 1.80),
        lid_drop: clamp(lidDrop, 0.00, 0.75),
        crinkle: clamp(eyeCrinkle, 0, 1),
        pupil_y: clamp(pupilY, -1, 0),
        eyes_closed: eyesClosed,
      },
      brows: { angle: browAngle, h_offset: hOffset, thickness: browThickness },
      mouth: {
        curve: clamp(curve, -0.85, 0.85),
        open_amount: clamp(openAmount, 0.00, 1.00),
        show_teeth: showTeeth,
        open_up: openUp,
        open_round: openRound,
        bruxism: clamp(bruxism, 0, 1),
        lower_teeth: lowerTeeth,
        tongue_out: tongueOut,
        tongue_side: clamp(tongueSide, 0, 1),
      },
      fx: {
        blush: clamp(blush, 0, 1),
        spiky: clamp(spiky, 0, 1),
        sweat: clamp(sweat, 0, 1),
        pallor: clamp(pallor, 0, 1),
        nostril_flare: Math.max(-1, Math.min(1, nostrilFlare)),
        zzz: clamp(zzz, 0, 1),
        drool: clamp(drool, 0, 1),
        veins: clamp(veins, 0, 1),
      },
      forehead: { type: foreheadType, intensity: foreheadIntensity },
    };
  }

  window.ExpressiveEngine = {
    DEFAULT_EXPRESSIVE_STATE,
    MOTION_PRESET_LIBRARY,
    SOUND_CUE_LIBRARY,
    getAnimationPreset,
    getMotionProfile,
    getVisualStateClasses,
    getOverlayCues,
    getSoundCues,
    stateToExpressionParams,
  };
})();
