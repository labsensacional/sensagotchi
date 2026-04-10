/* =============================================================
   TAMAGOTCHI HEDONISTA — main.js
   ============================================================= */

import { Human, create_human } from './internal-logic/human.js';
import { make_events, apply_event, apply_decay, drainNotifications } from './internal-logic/events.js';
import { actionLabel, eventDisplay, getInitialLocale, getLocale, setLocale, t, translateNotification } from './i18n.js';

// ── State ──────────────────────────────────────────────────────
let currentState   = null;
let _human         = null;
let _events        = null;
let _lastActions   = [];
let allEvents      = {};        // { category: [{ name, description, duration, can_apply }] }
let currentCategory = null;    // null = show category grid
let _pinnedActions = [];        // action ids pinned via URL ?pinned= param
let audioStarted   = false;
let audioMuted     = false;
let onboardingDismissed = false;

// ── Category metadata ──────────────────────────────────────────
const CAT_META = {
    sexual:    { emoji: '💫', labelKey: 'ui.category_sexual'    },
    social:    { emoji: '🤝', labelKey: 'ui.category_social'    },
    pain:      { emoji: '⚡', labelKey: 'ui.category_pain'      },
    breathwork:{ emoji: '🌬️', labelKey: 'ui.category_breathwork'    },
    food:      { emoji: '🍎', labelKey: 'ui.category_food'      },
    rest:      { emoji: '😴', labelKey: 'ui.category_rest'      },
    drugs:     { emoji: '💊', labelKey: 'ui.category_drugs'     },
    medical:   { emoji: '🏥', labelKey: 'ui.category_medical'   },
    life:      { emoji: '🌍', labelKey: 'ui.category_life'      },
};

const PERSISTENT_CATEGORIES = new Set(['life', 'medical']);
const GLOBAL_VISUAL_CLASSES = [
    'state-stress-low', 'state-stress-high', 'state-ssri', 'state-shutdown'
];

// ── Background mapping (action → bg key) ──────────────────────
const ACTION_BG = {
    sleep:                'sleep',
    rest:                 'rest',
    wait:                 'rest',
    eat:                  'food',
    snack:                'food',
    orgasm:               'sexual',
    light_stimulation:    'sexual',
    intense_stimulation:  'sexual',
    edging:               'sexual',
    cuddling:             'social',
    massage:              'social',
    light_pain:           'pain',
    temperature_play:     'pain',
    deep_breathing:       'breathwork',
    cold_face_immersion:  'breathwork',
    holotropic_breathing: 'breathwork',
    mdma:                 'drugs',
    weed:                 'drugs',
    mushrooms:            'drugs',
    lsd:                  'drugs',
    cocaine:              'drugs',
    alcohol:              'drugs',
    amphetamines:         'drugs',
    ketamine:             'drugs',
    poppers:              'drugs',
    tobacco:              'drugs',
    nitrous:              'drugs',
    caffeine:             'drugs',
    take_ssri:            'medical',
    stop_ssri:            'medical',
    therapy_session:      'medical',
    testosterone_injection:'medical',
    anti_androgen:        'medical',
    exercise:             'life',
    job_loss:             'life',
    financial_crisis:     'life',
    breakup:              'life',
    get_job:              'life',
    resolve_finances:     'life',
    new_relationship:     'life',
};

// ── Avatar animation logic ─────────────────────────────────────
function getAnimation(s) {
    if (s.shutdown   > 40)                     return 'barely-moving';
    if (s.sleepiness > 60)                     return 'droop';
    if (s.anxiety    > 60)                     return 'shake';
    if (s.liking_score > 65 && s.arousal > 55) return 'bounce';
    if (s.liking_score > 48)                   return 'sway';
    return 'idle';
}

// ── DOM helpers ────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function updateAvatar(s) {
    // Update p5.js monster visual state
    if (window.updateMonsterFromApp) window.updateMonsterFromApp(s);

    // Swap CSS animation class on the container (body motion)
    const anim      = getAnimation(s);
    const container = $('avatar-container');
    const animClasses = ['anim-idle','anim-sway','anim-bounce',
                         'anim-shake','anim-droop','anim-barely-moving'];
    container.classList.remove(...animClasses);
    container.classList.add('anim-' + anim);
}

function updateHUD(s) {
    const bars = [
        { id: 'hud-hunger',    val: s.hunger              },
        { id: 'hud-anxiety',   val: s.anxiety             },
        { id: 'hud-sleepiness',val: s.sleepiness          },
        { id: 'hud-psych',     val: s.psychological_health},
        { id: 'hud-physical',  val: s.physical_health     },
        { id: 'hud-energy',    val: s.energy              },
    ];
    bars.forEach(({ id, val }) => {
        const el = $(id);
        if (el) el.style.width = `${Math.max(0, Math.min(100, val))}%`;
    });
    updateHUDDetail(s);
}

// Color per field (CSS custom property --dc on .detail-fill)
const DETAIL_COLORS = {
    dopamine:             '#fdcb6e', serotonin:            '#55efc4', endorphins:  '#fd79a8',
    oxytocin:             '#74b9ff', prolactin:            '#a29bfe', vasopressin: '#e17055',
    arousal:              '#a29bfe', energy:               '#00b894', sleepiness:  '#636e72',
    hunger:               '#e67e22', anxiety:              '#ee5a24', prefrontal:  '#0984e3',
    absorption:           '#6c5ce7', shutdown:             '#2d3436',
    physical_health:      '#55efc4', psychological_health: '#74b9ff',
};

const DETAIL_GROUPS = [
    { labelKey: 'ui.detail_neuro', rows: [
        ['dopamine',    'dopamine'   ],
        ['serotonin',   'serotonin'  ],
        ['endorphins',  'endorphins' ],
        ['oxytocin',    'oxytocin'   ],
        ['prolactin',   'prolactin'  ],
        ['vasopressin', 'vasopressin'],
    ]},
    { labelKey: 'ui.detail_body', rows: [
        ['arousal',    'ui.detail_arousal'   ],
        ['energy',     'energy'    ],
        ['sleepiness', 'sleepiness'],
        ['hunger',     'hunger'    ],
    ]},
    { labelKey: 'ui.detail_mind', rows: [
        ['anxiety',    'anxiety'   ],
        ['prefrontal', 'prefrontal'],
        ['absorption', 'absorption'],
        ['shutdown',   'shutdown'  ],
    ]},
    { labelKey: 'ui.detail_health', rows: [
        ['physical_health',      'ui.detail_physical'     ],
        ['psychological_health', 'ui.detail_psychological'],
    ]},
];

function updateHUDDetail(s) {
    const el = $('hud-detail');
    if (!el) return;
    el.innerHTML = DETAIL_GROUPS.map(g => `
        <div class="detail-group">
            <div class="detail-group-label">${t(g.labelKey)}</div>
            ${g.rows.map(([key, label]) => {
                const val = Math.round(s[key] ?? 0);
                const col = DETAIL_COLORS[key] || 'rgba(255,255,255,0.45)';
                return `<div class="detail-row">
                    <span class="detail-key">${label.includes('.') ? t(label) : label}</span>
                    <div class="detail-bar">
                        <div class="detail-fill" style="width:${val}%;--dc:${col}"></div>
                    </div>
                    <span class="detail-val">${val}</span>
                </div>`;
            }).join('')}
        </div>`).join('');
}

function human_to_dict(h) {
    return {
        dopamine:             Math.round(h.dopamine * 10) / 10,
        oxytocin:             Math.round(h.oxytocin * 10) / 10,
        endorphins:           Math.round(h.endorphins * 10) / 10,
        serotonin:            Math.round(h.serotonin * 10) / 10,
        prolactin:            Math.round(h.prolactin * 10) / 10,
        vasopressin:          Math.round(h.vasopressin * 10) / 10,
        arousal:              Math.round(h.arousal * 10) / 10,
        prefrontal:           Math.round(h.prefrontal * 10) / 10,
        sleepiness:           Math.round(h.sleepiness * 10) / 10,
        anxiety:              Math.round(h.anxiety * 10) / 10,
        absorption:           Math.round(h.absorption * 10) / 10,
        hunger:               Math.round(h.hunger * 10) / 10,
        energy:               Math.round(h.energy * 10) / 10,
        physical_health:      Math.round(h.physical_health * 10) / 10,
        psychological_health: Math.round(h.psychological_health * 10) / 10,
        sexual_inhibition:    Math.round(h.sexual_inhibition * 10) / 10,
        shutdown:             Math.round(h.shutdown * 10) / 10,
        life_stress:          Math.round(h.life_stress * 10) / 10,
        ssri_level:           Math.round(h.ssri_level * 10) / 10,
        testosterone:         Math.round(h.testosterone * 10) / 10,
        liking_score:         Math.round(h.liking_score() * 10) / 10,
        wanting_score:        Math.round(h.wanting_score() * 10) / 10,
        is_viable:            h.is_viable(),
    };
}

function events_by_category() {
    const cats = {};
    for (const [name, event] of Object.entries(_events)) {
        const cat = event.category;
        if (!cats[cat]) cats[cat] = [];
        const reason = event.blocked_reason;
        const noteFn = event.note;
        const rawBlocked = typeof reason === 'function' ? reason(_human) : (reason || '');
        const rawNote = typeof noteFn === 'function' ? noteFn(_human) : null;
        const display = eventDisplay(name, _human, rawBlocked, rawNote);
        cats[cat].push({
            name,
            display_name:   display.name,
            description:    display.description || event.description,
            duration:       event.duration,
            category:       cat,
            can_apply:      event.can_apply(_human),
            blocked_reason: display.blocked,
            note:           display.note,
        });
    }
    return cats;
}

function getActionMode(action) {
    return PERSISTENT_CATEGORIES.has(action.category) ? 'persistent' : 'immediate';
}

function renderActionMeta(action) {
    const mode = getActionMode(action);
    const durationLabel = action.duration >= 1
        ? t('ui.durationHours', { hours: action.duration })
        : t('ui.durationMinutes', { minutes: Math.round(action.duration * 60) });
    return `
        <div class="action-meta">
            <span class="action-pill ${mode}">${t(`ui.${mode}`)}</span>
            <span class="action-dur">${durationLabel}</span>
        </div>`;
}

function updateBackground(actionName) {
    const key  = ACTION_BG[actionName] || 'default';
    const bg   = $('bg');
    // Cross-fade: create new bg then swap
    bg.style.backgroundImage = `url('backgrounds/${key}.jpg')`;
}

function updateRecentActions(lastActions) {
    const el = $('recent-actions');
    const chips = lastActions.slice().reverse().map(a =>
        `<span class="recent-chip" onclick="applyAction('${a}')">${actionLabel(a)}</span>`
    ).join('');
    el.innerHTML = `<span class="recent-label">${t('ui.recent')}</span>${chips}`;
}

// Color per notification type
const NOTIF_COLORS = {
    'orgasm':    '#fd79a8',
    'overwhelm': '#fdcb6e',
    'bad-trip':  '#d63031',
    'sick':      '#55efc4',
    'anxiety':   '#e17055',
    'ssri':      '#74b9ff',
    'ssri-stop': '#a29bfe',
    'life-bad':  '#e17055',
    'life-good': '#00b894',
    'action':    'rgba(255,255,255,0.75)',
};

let _notifTimer = null;

function notificationDuration(text) {
    const len = (text || '').trim().length;
    if (len <= 60) return 3000;
    if (len <= 110) return 4300;
    if (len <= 170) return 5600;
    return 7000;
}

function showEventNotification(text, type) {
    const el = $('event-notification');
    if (!el) return;

    // Clear any existing timer so previous message doesn't cut the new one short
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }

    const translatedText = translateNotification(text);
    const color = NOTIF_COLORS[type] || 'rgba(255,255,255,0.9)';
    el.innerHTML = `<div class="event-notif" style="--notif-color:${color}">${translatedText}</div>`;
    const durationMs = notificationDuration(translatedText);

    _notifTimer = setTimeout(() => {
        el.innerHTML = '';
        _notifTimer = null;
    }, durationMs);
}

// ── Action summary notification ────────────────────────────
const _SUMMARY_VARS = [
    'dopamine','serotonin','endorphins','oxytocin','prolactin','vasopressin',
    'arousal','energy','sleepiness','hunger','anxiety','prefrontal','absorption',
    'physical_health','psychological_health',
];

function buildActionSummary(before, after) {
    const changes = _SUMMARY_VARS
        .map(k => ({ k, d: Math.round((after[k] ?? 0) - (before[k] ?? 0)) }))
        .filter(x => Math.abs(x.d) >= 3)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 3);
    if (!changes.length) return null;
    return changes.map(x => `${x.k} ${x.d > 0 ? '+' : ''}${x.d}`).join('  ·  ');
}

function getActiveGlobalStates(state) {
    const items = [];

    if (state.life_stress >= 15) {
        const severity = state.life_stress >= 60 ? 'alto' : 'medio';
        items.push({
            tone: 'persistent',
            label: severity === 'alto' ? t('ui.global_stress_high') : t('ui.global_stress_med'),
            detail: t('ui.global_stress_detail'),
            banner: severity === 'alto' ? t('ui.global_stress_banner_high') : t('ui.global_stress_banner_med'),
        });
    }

    if (state.ssri_level >= 10) {
        items.push({
            tone: 'persistent',
            label: t('ui.global_ssri'),
            detail: t('ui.global_ssri_detail'),
            banner: t('ui.global_ssri_banner'),
        });
    }

    if (state.testosterone >= 65) {
        items.push({
            tone: 'immediate',
            label: t('ui.global_testosterone_high'),
            detail: t('ui.global_testosterone_high_detail'),
        });
    } else if (state.testosterone <= 35) {
        items.push({
            tone: 'immediate',
            label: t('ui.global_testosterone_low'),
            detail: t('ui.global_testosterone_low_detail'),
        });
    }

    if (state.shutdown >= 35) {
        items.push({
            tone: 'persistent',
            label: t('ui.global_shutdown'),
            detail: t('ui.global_shutdown_detail'),
            banner: t('ui.global_shutdown_banner'),
        });
    }

    return items;
}

function updateGlobalStatePanel(state) {
    const el = $('global-state-panel');
    if (!el) return;

    const active = getActiveGlobalStates(state);
    if (!active.length) {
        el.innerHTML = `<div class="global-state-empty">${t('ui.noDominantGlobalState')}</div>`;
        return;
    }

    el.innerHTML = `
        <div class="global-state-header">${t('ui.contextHeader')}</div>
        <div class="global-state-list">
            ${active.map(item => `
                <div class="global-state-item">
                    <span class="global-state-pill ${item.tone}">${item.label}</span>
                    <div class="global-state-copy">${item.detail}</div>
                </div>`).join('')}
        </div>`;
}

function getContextReminder(state) {
    const active = getActiveGlobalStates(state);
    if (!active.length) return null;
    return t('ui.contextReminder', { banner: active[0].banner || active[0].label });
}

function updateMonsterStatusBanner(state) {
    const el = $('monster-status-banner');
    if (!el) return;
    const active = getActiveGlobalStates(state).filter(item => item.tone === 'persistent');
    if (!active.length) {
        el.innerHTML = '';
        el.className = '';
        return;
    }

    const primary = active[0];
    el.className = `banner-${primary.label.includes('shutdown') ? 'shutdown' : primary.label.includes('ssri') ? 'ssri' : 'stress'}`;
    el.innerHTML = `
        <div class="monster-status-kicker">${t('ui.monsterStatus')}</div>
        <div class="monster-status-copy">${primary.banner}</div>`;
}

function updateGlobalVisualState(state) {
    const avatarSection = $('avatar-section');
    if (!avatarSection) return;
    avatarSection.classList.remove(...GLOBAL_VISUAL_CLASSES);

    if (state.life_stress >= 60) {
        avatarSection.classList.add('state-stress-high');
    } else if (state.life_stress >= 15) {
        avatarSection.classList.add('state-stress-low');
    }

    if (state.ssri_level >= 10) {
        avatarSection.classList.add('state-ssri');
    }

    if (state.shutdown >= 35) {
        avatarSection.classList.add('state-shutdown');
    }
}

function classifyPleasure(before, after) {
    const likingDelta = (after.liking_score ?? 0) - (before.liking_score ?? 0);
    const endorphinDelta = (after.endorphins ?? 0) - (before.endorphins ?? 0);
    const oxytocinDelta = (after.oxytocin ?? 0) - (before.oxytocin ?? 0);
    const serotoninDelta = (after.serotonin ?? 0) - (before.serotonin ?? 0);

    const pleasureDrivers = [];
    if (endorphinDelta >= 5) pleasureDrivers.push(getLocale() === 'es' ? 'endorfinas' : 'endorphins');
    if (oxytocinDelta >= 5) pleasureDrivers.push(getLocale() === 'es' ? 'oxitocina' : 'oxytocin');
    if (serotoninDelta >= 5) pleasureDrivers.push(getLocale() === 'es' ? 'serotonina' : 'serotonin');

    if (likingDelta >= 6) {
        return pleasureDrivers.length
            ? t('ui.notif_pleasurable_mix', { drivers: pleasureDrivers.join(', ') })
            : t('ui.notif_pleasurable');
    }
    if (likingDelta <= -4) {
        return t('ui.notif_unpleasant');
    }
    return null;
}

function classifyDesire(before, after) {
    const dopamineDelta = (after.dopamine ?? 0) - (before.dopamine ?? 0);
    const wantingDelta = (after.wanting_score ?? 0) - (before.wanting_score ?? 0);

    if (dopamineDelta >= 8 || wantingDelta >= 6) {
        return t('ui.notif_desire_up');
    }
    if (dopamineDelta <= -8 || wantingDelta <= -6) {
        return t('ui.notif_desire_down');
    }
    return null;
}

function joinPhrases(parts) {
    return parts.join(getLocale() === 'es' ? ' y ' : ' and ');
}

function buildImmediateFeedback(action, before, after, finalState) {
    const delta = (key) => (after[key] ?? 0) - (before[key] ?? 0);
    const bits = [];

    if (delta('anxiety') <= -8) bits.push(t('ui.notif_calmed'));
    if (delta('anxiety') >= 8) bits.push(t('ui.notif_tense'));
    if (delta('energy') <= -8) bits.push(t('ui.notif_drained'));
    if (delta('energy') >= 8) bits.push(t('ui.notif_energy_up'));
    if (delta('sleepiness') >= 10) bits.push(t('ui.notif_sleepy'));
    if (delta('sleepiness') <= -10) bits.push(t('ui.notif_awake'));
    if (delta('arousal') >= 12) bits.push(t('ui.notif_arousal_up'));
    if (delta('hunger') <= -10) bits.push(t('ui.notif_hunger_down'));
    if (delta('hunger') >= 10) bits.push(t('ui.notif_hunger_up'));
    if (delta('physical_health') <= -3) bits.push(t('ui.notif_body_hit'));
    if (delta('psychological_health') <= -3) bits.push(t('ui.notif_mind_hit'));

    const primary = joinPhrases(bits.slice(0, 2));
    const parts = [];
    const pleasure = classifyPleasure(before, after);
    if (pleasure) parts.push(pleasure);
    const desire = classifyDesire(before, after);
    if (desire) parts.push(desire);
    if (primary) parts.push(primary);

    const reminder = getContextReminder(finalState);
    if (reminder && action.category !== 'life' && action.category !== 'medical') {
        parts.push(t('ui.notif_context_prefix', { banner: reminder }));
    }

    return parts.join(' ');
}

function buildNarrativeFeedback(action, before, after, finalState) {
    const mode = getActionMode(action);
    if (mode === 'immediate') {
        return buildImmediateFeedback(action, before, after, finalState);
    }
    const leads = [];
    const costs = [];

    const delta = (key) => (after[key] ?? 0) - (before[key] ?? 0);

    if (delta('anxiety') <= -8) leads.push(getLocale() === 'es' ? 'bajó la ansiedad' : 'anxiety went down');
    if (delta('anxiety') >= 8) costs.push(getLocale() === 'es' ? 'te activó de más' : 'it overactivated the system');

    if (delta('energy') <= -8) costs.push(getLocale() === 'es' ? 'te drenó energía' : 'it drained energy');
    if (delta('energy') >= 8) leads.push(getLocale() === 'es' ? 'te levantó la energía' : 'it raised energy');

    if (delta('sleepiness') >= 10) costs.push(getLocale() === 'es' ? 'te dejó con sueño' : 'it made the monster sleepier');
    if (delta('sleepiness') <= -10) leads.push(getLocale() === 'es' ? 'te despejó' : 'it cleared the system up');

    if (delta('hunger') <= -10) leads.push(getLocale() === 'es' ? 'te sacó el hambre' : 'it reduced hunger');
    if (delta('hunger') >= 10) costs.push(getLocale() === 'es' ? 'te abrió el apetito' : 'it raised appetite');

    if (delta('arousal') >= 12) leads.push(getLocale() === 'es' ? 'subió la activación' : 'arousal went up');
    if (delta('absorption') >= 10) leads.push(getLocale() === 'es' ? 'te metió más en la experiencia' : 'it pulled the monster deeper into the experience');
    if (delta('prefrontal') <= -10) costs.push(getLocale() === 'es' ? 'te soltó el control' : 'it loosened top-down control');

    if (delta('psychological_health') >= 3) leads.push(getLocale() === 'es' ? 'te estabilizó un poco' : 'it stabilized the system a bit');
    if (delta('psychological_health') <= -3) costs.push(getLocale() === 'es' ? 'te pegó en la salud psicológica' : 'it hurt psychological health');
    if (delta('physical_health') >= 3) leads.push(getLocale() === 'es' ? 'mejoró el cuerpo' : 'it improved the body');
    if (delta('physical_health') <= -3) costs.push(getLocale() === 'es' ? 'castigó el cuerpo' : 'it hurt the body');

    const intro = mode === 'persistent'
        ? (getLocale() === 'es' ? 'Cambió el contexto de fondo.' : 'It changed the background context.')
        : (getLocale() === 'es' ? 'Impacto inmediato.' : 'Immediate impact.');

    const best = joinPhrases(leads.slice(0, 2));
    const worst = joinPhrases(costs.slice(0, 2));

    let sentence = intro;
    if (best) sentence += ` ${best.charAt(0).toUpperCase() + best.slice(1)}.`;
    if (worst) sentence += getLocale() === 'es' ? ` Pero ${worst}.` : ` But ${worst}.`;

    if (!best && !worst) {
        const fallback = buildActionSummary(before, after);
        if (fallback) sentence += getLocale() === 'es' ? ` Cambios principales: ${fallback}.` : ` Main changes: ${fallback}.`;
    }

    const reminder = getContextReminder(finalState);
    if (reminder && mode !== 'persistent') {
        sentence += ` ${reminder}`;
    }

    return sentence;
}

function explainDeath(state) {
    const causes = [];
    const factors = [];

    if (state.physical_health <= 0) {
        causes.push(t('ui.death_physical'));
    }
    if (state.psychological_health <= 0) {
        causes.push(t('ui.death_psychological'));
    }

    if (state.anxiety >= 70) factors.push(t('ui.factor_anxiety', { value: Math.round(state.anxiety) }));
    if (state.sleepiness >= 70) factors.push(t('ui.factor_sleepiness', { value: Math.round(state.sleepiness) }));
    if (state.energy <= 25) factors.push(t('ui.factor_energy', { value: Math.round(state.energy) }));
    if (state.hunger >= 70) factors.push(t('ui.factor_hunger', { value: Math.round(state.hunger) }));
    if (state.shutdown >= 50) factors.push(t('ui.factor_shutdown', { value: Math.round(state.shutdown) }));
    if (state.arousal >= 80 && state.anxiety >= 60) factors.push(t('ui.factor_overload'));

    const cause = causes.length ? causes.join(' + ') : t('ui.death_systemic');
    const summary = t('ui.summaryLabel', { physical: Math.round(state.physical_health), psychological: Math.round(state.psychological_health) });
    return { cause, summary, factors };
}

function updateDeathScreen(state, lastActions) {
    const report = explainDeath(state);
    const causeEl = $('death-cause');
    const summaryEl = $('death-summary');
    const factorsEl = $('death-factors');
    const actionsEl = $('death-last-actions');

    if (causeEl) {
        causeEl.textContent = t('ui.causeLabel', { cause: report.cause });
    }
    if (summaryEl) {
        summaryEl.textContent = report.summary;
    }
    if (factorsEl) {
        if (report.factors.length) {
            factorsEl.innerHTML = `
                <div class="death-section-label">${t('ui.contributors')}</div>
                <ul class="death-list">${report.factors.map(f => `<li>${f}</li>`).join('')}</ul>`;
        } else {
            factorsEl.innerHTML = `
                <div class="death-section-label">${t('ui.contributors')}</div>
                <div class="death-empty">${t('ui.accumulatedWear')}</div>`;
        }
    }
    if (actionsEl) {
        const recent = lastActions.slice(-3).reverse();
        actionsEl.innerHTML = recent.length
            ? `<div class="death-section-label">${t('ui.lastActions')}</div><div class="death-chip-row">${recent.map(a => `<span class="death-chip">${actionLabel(a)}</span>`).join('')}</div>`
            : '';
    }
}

// ── Death screen ───────────────────────────────────────────
function checkDeath(state) {
    if (state.physical_health <= 0 || state.psychological_health <= 0) {
        updateDeathScreen(state, _lastActions);
        const el = $('death-screen');
        if (el) el.classList.remove('hidden');
        return true;
    }
    return false;
}

function applyStateToUI(state, lastActions) {
    currentState = state;
    updateAvatar(state);
    updateHUD(state);
    updateRecentActions(lastActions);
    updateGlobalStatePanel(state);
    updateMonsterStatusBanner(state);
    updateGlobalVisualState(state);
    if (audioStarted && !audioMuted) updateAudio(state);
}

// ── Action area rendering ──────────────────────────────────────
function renderCategories() {
    currentCategory = null;
    const area = $('action-area');
    const cells = Object.entries(CAT_META).map(([cat, meta]) => {
        const acts = allEvents[cat] || [];
        const available = acts.filter(a => a.can_apply).length;
        return `
          <button class="category-btn" onclick="selectCategory('${cat}')">
            <span class="cat-emoji">${meta.emoji}</span>
            <span class="cat-label">${t(meta.labelKey)}</span>
            <span style="font-size:10px;color:rgba(255,255,255,0.35)">${available}/${acts.length}</span>
          </button>`;
    }).join('');
    area.innerHTML = renderPinnedSection() + `<div class="category-grid">${cells}</div>`;
}

function selectCategory(cat) {
    currentCategory = cat;
    renderActionList(allEvents[cat] || [], true);
}

function renderActionList(actions, showBack) {
    const area  = $('action-area');
    const back  = showBack
        ? `<button class="back-btn" onclick="renderCategories()">${t('ui.backCategories')}</button>`
        : '';
    const items = actions.map(a => `
        <div class="action-item ${a.can_apply ? '' : 'disabled'}"
             onclick="${a.can_apply ? `applyAction('${a.name}')` : ''}">
            <div class="action-name">${a.display_name || actionLabel(a.name)}</div>
            <div class="action-desc">${a.description}</div>
            ${renderActionMeta(a)}
            ${!a.can_apply && a.blocked_reason ? `<div class="action-blocked-reason">⚠ ${a.blocked_reason}</div>` : ''}
            ${a.note ? `<div class="action-note">⚠ ${a.note}</div>` : ''}
        </div>`).join('');
    area.innerHTML = `${back}<div class="action-list">${items}</div>`;
}

// ── Search ─────────────────────────────────────────────────────
$('search-input').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    if (!q) {
        currentCategory ? renderActionList(allEvents[currentCategory] || [], true)
                        : renderCategories();
        return;
    }
    const results = [];
    for (const acts of Object.values(allEvents)) {
        for (const a of acts) {
            if (a.name.includes(q) || a.description.toLowerCase().includes(q)) {
                results.push(a);
            }
        }
    }
    renderActionList(results, false);
});

// ── Apply action ───────────────────────────────────────────────
function applyAction(name) {
    if (!audioStarted && !audioMuted) startAudio();

    const event = _events[name];
    if (!event || !event.can_apply(_human)) return;

    const before = human_to_dict(_human);
    apply_event(_human, name, event);
    const afterEvent = human_to_dict(_human);  // pre-decay snapshot for clean diff
    apply_decay(_human, event.duration);
    _human.clamp_values();

    const notifications = drainNotifications();
    if (notifications.length > 0) {
        const primary = notifications[notifications.length - 1];
        const reminder = getContextReminder(human_to_dict(_human));
        const text = reminder ? `${primary.text} · ${reminder}` : primary.text;
        showEventNotification(text, primary.type);
    } else {
        const msg = buildNarrativeFeedback(event, before, afterEvent, human_to_dict(_human));
        if (msg) showEventNotification(msg, 'action');
    }

    _lastActions.push(name);
    if (_lastActions.length > 20) _lastActions = _lastActions.slice(-20);

    allEvents = events_by_category();
    const finalState = human_to_dict(_human);
    applyStateToUI(finalState, _lastActions.slice(-3));
    updateBackground(name);
    playSFX(name);

    if (checkDeath(finalState)) return;

    // Re-render current view with updated can_apply
    const q = $('search-input').value.trim();
    if (q) {
        $('search-input').dispatchEvent(new Event('input'));
    } else if (currentCategory) {
        renderActionList(allEvents[currentCategory] || [], true);
    } else {
        renderCategories();
    }
}

// ── Reset ──────────────────────────────────────────────────────
function resetGame() {
    const death = $('death-screen');
    if (death) death.classList.add('hidden');
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    const notifEl = $('event-notification');
    if (notifEl) notifEl.innerHTML = '';
    _human = create_human();
    _lastActions = [];
    allEvents = events_by_category();
    currentCategory = null;
    applyStateToUI(human_to_dict(_human), []);
    $('bg').style.backgroundImage = "url('backgrounds/default.jpg')";
    renderCategories();
}

// ── Pinned actions section ─────────────────────────────────────
function renderPinnedSection() {
    if (!_pinnedActions.length) return '';
    const allFlat = Object.values(allEvents).flat();
    const items = _pinnedActions
        .map(id => allFlat.find(a => a.name === id))
        .filter(Boolean)
        .map(a => `
            <div class="action-item pinned ${a.can_apply ? '' : 'disabled'}"
                 onclick="${a.can_apply ? `applyAction('${a.name}')` : ''}">
                <div class="action-name">${a.display_name || actionLabel(a.name)}</div>
                <div class="action-desc">${a.description}</div>
                ${renderActionMeta(a)}
                ${!a.can_apply && a.blocked_reason ? `<div class="action-blocked-reason">⚠ ${a.blocked_reason}</div>` : ''}
            </div>`).join('');
    return `<div class="pinned-header">📌 Sesión</div><div class="action-list pinned-list">${items}</div><hr class="pinned-divider">`;
}

function dismissOnboarding() {
    onboardingDismissed = true;
    const overlay = $('onboarding-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function updateStaticTranslations() {
    document.documentElement.lang = getLocale();
    document.title = t('ui.title');
    $('onboarding-kicker').textContent = t('ui.onboardingKicker');
    $('onboarding-title').textContent = t('ui.onboardingTitle');
    $('onboarding-copy-1').textContent = t('ui.onboardingCopy1');
    $('onboarding-immediate').textContent = t('ui.onboardingImmediate');
    $('onboarding-immediate-copy').textContent = t('ui.onboardingImmediateCopy');
    $('onboarding-persistent').textContent = t('ui.onboardingPersistent');
    $('onboarding-persistent-copy').textContent = t('ui.onboardingPersistentCopy');
    $('onboarding-copy-2').textContent = t('ui.onboardingCopy2');
    $('start-btn').textContent = t('ui.start');
    $('reset-btn').textContent = t('ui.reset');
    $('lab-btn').textContent = t('ui.lab');
    $('lang-label').textContent = t('ui.langLabel');
    $('search-input').placeholder = t('ui.searchPlaceholder');
    $('legend-immediate').textContent = t('ui.immediate');
    $('legend-persistent').textContent = t('ui.persistent');
    $('death-msg').textContent = t('ui.deathTitle');
    $('death-reset').textContent = t('ui.deathReset');

    const hudMap = {
        hunger: 'ui.hud_hunger',
        anxiety: 'ui.hud_anxiety',
        sleepiness: 'ui.hud_sleepiness',
        psych: 'ui.hud_psychological_health',
        physical: 'ui.hud_physical_health',
        energy: 'ui.hud_energy',
    };
    Object.entries(hudMap).forEach(([suffix, key]) => {
        const node = document.querySelector(`[data-tip-id="${suffix}"]`);
        if (node) node.dataset.tip = t(key);
    });
}

function changeLocale(locale) {
    setLocale(locale);
    updateStaticTranslations();
    allEvents = events_by_category();
    if (currentState) applyStateToUI(currentState, _lastActions.slice(-3));
    if ($('death-screen') && !$('death-screen').classList.contains('hidden') && currentState) {
        updateDeathScreen(currentState, _lastActions);
    }
    const q = $('search-input').value.trim();
    if (q) {
        $('search-input').dispatchEvent(new Event('input'));
    } else if (currentCategory) {
        renderActionList(allEvents[currentCategory] || [], true);
    } else {
        renderCategories();
    }
}

// ── Init ───────────────────────────────────────────────────────
function init() {
    setLocale(getInitialLocale());
    // Read pinned actions from URL ?pinned=action1,action2,...
    const params = new URLSearchParams(window.location.search);
    const pinnedParam = params.get('pinned');
    if (pinnedParam) {
        _pinnedActions = pinnedParam.split(',').map(s => s.trim()).filter(Boolean);
    }

    _human = create_human();
    _events = make_events();
    _lastActions = [];
    allEvents = events_by_category();
    applyStateToUI(human_to_dict(_human), []);
    $('lang-select').value = getLocale();
    updateStaticTranslations();
    renderCategories();
    if (!onboardingDismissed) {
        const overlay = $('onboarding-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }
}

// =============================================================
// AUDIO — Tone.js procedural ambient pads
// =============================================================

let mainSynth, sfxSynth;
let reverbFX, distFX, lowpassFX, masterVolFX;
let chordLoop;
let currentMood = 'calm';
let chordIndex  = 0;

// Chord progressions — long ambient pads, no arpeggios.
// Voices are in bass/mid register to stay warm and non-intrusive.
const PROGRESSIONS = {
    calm: [
        ['C3', 'G3', 'E4'],
        ['A2', 'E3', 'C4'],
        ['F2', 'C3', 'A3'],
        ['G2', 'D3', 'B3'],
    ],
    happy: [
        ['C3', 'E3', 'G3', 'B3'],
        ['F3', 'A3', 'C4',     ],
        ['G3', 'B3', 'D4',     ],
        ['A3', 'C4', 'E4',     ],
    ],
    sad: [
        ['A2', 'C3', 'E3'],
        ['D2', 'F2', 'A2'],
        ['E2', 'G2', 'B2'],
        ['A2', 'E3', 'A3'],
    ],
    anxious: [
        ['B2', 'D3', 'F3', 'Ab3'],
        ['Eb3','G3', 'Bb3'      ],
        ['C3', 'Eb3','Gb3'      ],
        ['F#2','A2', 'C3'       ],
    ],
    blank: [
        ['C2', 'G2'],
        ['F2', 'C3'],
    ],
};

// Choose mood from state
function moodFromState(s) {
    if (s.shutdown     > 40)               return 'blank';
    if (s.anxiety      > 65)               return 'anxious';
    if (s.liking_score > 55 && s.arousal > 40) return 'happy';
    if (s.liking_score < 22)              return 'sad';
    return 'calm';
}

async function startAudio() {
    if (audioStarted) return;
    try {
        await Tone.start();
    } catch (e) {
        console.warn('Audio start failed:', e);
        return;
    }

    // Build effects chain: synth → dist → lowpass → reverb → masterVol → output
    reverbFX   = new Tone.Reverb({ decay: 9, wet: 0.45, preDelay: 0.08 });
    distFX     = new Tone.Distortion(0);
    lowpassFX  = new Tone.Filter({ frequency: 6000, type: 'lowpass', rolloff: -12 });
    masterVolFX= new Tone.Volume(-15);

    await reverbFX.generate();

    // Main ambient pad synth — very slow attack/release for a pad feel
    mainSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: {
            attack:  3.5,
            decay:   1.0,
            sustain: 0.82,
            release: 7.0,
        },
        volume: -5,
    });

    mainSynth.chain(distFX, lowpassFX, reverbFX, masterVolFX, Tone.Destination);

    // SFX synth — short, separate chain so it bypasses pad effects
    sfxSynth = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.0, release: 0.4 },
        volume: -16,
    });
    sfxSynth.chain(new Tone.Volume(0), Tone.Destination);

    Tone.Transport.bpm.value = 60;

    // Loop fires every 4 measures — musical timing scales with BPM
    chordLoop = new Tone.Loop((time) => {
        const prog  = PROGRESSIONS[currentMood];
        const chord = prog[chordIndex % prog.length];
        // Hold chord for 3m (slightly shorter than loop to let it breathe)
        const dur = currentMood === 'anxious' ? '1m' : '3m';
        mainSynth.triggerAttackRelease(chord, dur, time);
        chordIndex++;
    }, '4m');

    chordLoop.start(0);
    Tone.Transport.start();

    audioStarted = true;
    $('audio-btn').textContent = '🔊';
}

// Update audio parameters in real time based on current state
function updateAudio(s) {
    if (!audioStarted || !mainSynth) return;

    const mood = moodFromState(s);
    if (mood !== currentMood) {
        currentMood = mood;
        chordIndex  = 0;   // reset progression on mood change
    }

    // BPM: calm=58, tired=44, anxious=78
    const targetBPM = s.anxiety > 65   ? 78
                    : s.sleepiness > 60 ? 44
                    : 58;
    Tone.Transport.bpm.rampTo(targetBPM, 8);

    // Low-pass filter: wide when alert, narrows when tired/shutdown
    const filterHz = s.shutdown > 40   ? 500
                   : s.sleepiness > 60 ? 1800
                   : 7000;
    lowpassFX.frequency.rampTo(filterHz, 4);

    // Distortion: increases with anxiety
    distFX.distortion = Math.min(0.55, (s.anxiety / 100) * 0.65);

    // Reverb wetness: more space when dissociated/sad, less when happy
    const wet = s.shutdown > 40  ? 0.88
              : s.liking_score < 22 ? 0.60
              : 0.42;
    reverbFX.wet.rampTo(wet, 5);

    // Master volume: quieter in shutdown, slightly louder when anxious
    const vol = s.shutdown > 40 ? -26
              : s.anxiety  > 65 ? -10
              : -15;
    masterVolFX.volume.rampTo(vol, 3);
}

// SFX: one short tone per action category
const CAT_SFX_PARAMS = {
    sexual:     { note: 'A4',  type: 'sine',     dur: '4n' },
    social:     { note: 'E4',  type: 'triangle', dur: '4n' },
    pain:       { note: 'C5',  type: 'sawtooth', dur: '8n' },
    breathwork: { note: 'D3',  type: 'sine',     dur: '2n' },
    food:       { note: 'G4',  type: 'triangle', dur: '4n' },
    rest:       { note: 'C3',  type: 'sine',     dur: '2n' },
    drugs:      { note: 'B4',  type: 'sine',     dur: '4n' },
    medical:    { note: 'F4',  type: 'triangle', dur: '8n' },
    life:       { note: 'A3',  type: 'triangle', dur: '4n' },
};

function playSFX(actionName) {
    if (!audioStarted || !sfxSynth || audioMuted) return;

    // Find category for this action
    let cat = 'rest';
    for (const [c, acts] of Object.entries(allEvents)) {
        if (acts.find(a => a.name === actionName)) { cat = c; break; }
    }

    const p = CAT_SFX_PARAMS[cat] || { note: 'C4', type: 'sine', dur: '4n' };
    sfxSynth.oscillator.type = p.type;
    sfxSynth.triggerAttackRelease(p.note, p.dur);
}

// Audio toggle
function toggleAudio() {
    if (!audioStarted) {
        startAudio();
        audioMuted = false;
        $('audio-btn').textContent = '🔊';
        return;
    }
    audioMuted = !audioMuted;
    if (audioMuted) {
        Tone.Transport.stop();
        $('audio-btn').textContent = '🔇';
    } else {
        Tone.Transport.start();
        if (currentState) updateAudio(currentState);
        $('audio-btn').textContent = '🔊';
    }
}

// =============================================================
// Boot
// =============================================================
document.addEventListener('DOMContentLoaded', init);
document.addEventListener('click', () => $('hud').classList.remove('open'));

// Expose globals for inline onclick handlers (ES modules don't auto-expose to window)
window.resetGame       = resetGame;
window.dismissOnboarding = dismissOnboarding;
window.changeLocale = changeLocale;
window.toggleAudio     = toggleAudio;
window.applyAction     = applyAction;
window.selectCategory  = selectCategory;
window.renderCategories = renderCategories;
