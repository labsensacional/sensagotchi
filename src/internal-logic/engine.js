import { create_human_from_preset, get_human_presets } from './human.js';
import { make_events, apply_event, apply_decay, drainNotifications } from './events.js';

function safe(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

export function serializeHuman(human) {
  return {
    dopamine: safe(human.dopamine),
    oxytocin: safe(human.oxytocin),
    endorphins: safe(human.endorphins),
    serotonin: safe(human.serotonin),
    prolactin: safe(human.prolactin),
    vasopressin: safe(human.vasopressin),
    arousal: safe(human.arousal),
    prefrontal: safe(human.prefrontal),
    sleepiness: safe(human.sleepiness),
    anxiety: safe(human.anxiety),
    absorption: safe(human.absorption),
    hunger: safe(human.hunger),
    energy: safe(human.energy),
    health: safe(human.health),
    physical_health: safe(human.physical_health),
    psychological_health: safe(human.psychological_health),
    sexual_inhibition: safe(human.sexual_inhibition),
    shutdown: safe(human.shutdown),
    life_stress: safe(human.life_stress),
    ssri_level: safe(human.ssri_level),
    testosterone: safe(human.testosterone),
    liking_score: safe(human.liking_score()),
    wanting_score: safe(human.wanting_score()),
    is_viable: human.is_viable(),
  };
}

function materializeEventAction(id, event, human) {
  const blockedReason = typeof event.blocked_reason === 'function'
    ? event.blocked_reason(human)
    : (event.blocked_reason || '');
  const note = typeof event.note === 'function'
    ? event.note(human)
    : (event.note || null);

  return {
    id,
    category: event.category,
    duration: event.duration,
    description: event.description || '',
    canApply: event.can_apply(human),
    blockedReason,
    note,
  };
}

export function createPhysiologyEngine({ presetId = 'default' } = {}) {
  let currentPresetId = presetId;
  let human = create_human_from_preset(currentPresetId);
  const events = make_events();

  function getState() {
    return serializeHuman(human);
  }

  function listActions() {
    return Object.entries(events).map(([id, event]) => materializeEventAction(id, event, human));
  }

  function listActionsByCategory() {
    const grouped = {};
    for (const action of listActions()) {
      if (!grouped[action.category]) grouped[action.category] = [];
      grouped[action.category].push(action);
    }
    return grouped;
  }

  function getAction(id) {
    const event = events[id];
    if (!event) return null;
    return materializeEventAction(id, event, human);
  }

  function canApplyAction(id) {
    const action = getAction(id);
    return action ? action.canApply : false;
  }

  function applyAction(id) {
    const event = events[id];
    if (!event) {
      return { ok: false, error: 'unknown_action', state: getState() };
    }

    const action = materializeEventAction(id, event, human);
    if (!action.canApply) {
      return {
        ok: false,
        blocked: {
          code: 'cannot_apply',
          reason: action.blockedReason,
        },
        action,
        state: getState(),
      };
    }

    const before = getState();
    apply_event(human, id, event);
    const afterEvent = getState();
    apply_decay(human, event.time_advance ?? event.duration);
    human.clamp_values();
    const notifications = drainNotifications();
    const after = getState();

    return {
      ok: true,
      action,
      before,
      afterEvent,
      after,
      notifications,
    };
  }

  function step(hours) {
    apply_decay(human, hours);
    human.clamp_values();
    return {
      state: getState(),
      notifications: drainNotifications(),
    };
  }

  function reset({ presetId: nextPresetId = currentPresetId } = {}) {
    currentPresetId = nextPresetId;
    human = create_human_from_preset(currentPresetId);
    drainNotifications();
    return getState();
  }

  return {
    getPresetId: () => currentPresetId,
    getState,
    getAction,
    listActions,
    listActionsByCategory,
    canApplyAction,
    applyAction,
    step,
    reset,
  };
}

export { get_human_presets };
