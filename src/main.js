/* =============================================================
   TAMAGOTCHI HEDONISTA — main.js
   ============================================================= */

import { createPhysiologyEngine, get_human_presets } from './internal-logic/engine.js';
import * as expressiveEngine from './expressive-engine.js';
import { monsterRenderer } from './monster-renderer-p5.js';
import { actionLabel, eventDisplay, getInitialLocale, getLocale, setLocale, t, translateNotification } from './i18n.js';

// ── State ──────────────────────────────────────────────────────
let currentState   = null;
let _engine        = null;
let _lastActions   = [];
let allEvents      = {};
let currentCategory = null;    // null = show category grid
let _pinnedActions = [];        // action ids pinned via URL ?pinned= param
let audioStarted   = false;
let audioStarting  = false;
let audioMuted     = false;
let onboardingDismissed = false;
let currentPresetId = 'default';
const HUMAN_PRESET_IDS = Object.keys(get_human_presets());

function getCombinedHealth(state) {
    if (Number.isFinite(state.health)) return state.health;
    const physical = state.physical_health;
    const psychological = state.psychological_health;
    if (Number.isFinite(physical) && Number.isFinite(psychological)) {
        return (physical + psychological) / 2;
    }
    if (Number.isFinite(physical)) return physical;
    if (Number.isFinite(psychological)) return psychological;
    return 0;
}

// ── Category metadata ──────────────────────────────────────────
const CAT_META = {
    sexual:    { emoji: '💫', labelKey: 'ui.category_sexual'    },
    social:    { emoji: '🤝', labelKey: 'ui.category_social'    },
    pain:      { emoji: '⚡', labelKey: 'ui.category_pain'      },
    breathwork:{ emoji: '🌬️', labelKey: 'ui.category_breathwork'    },
    food:      { emoji: '🍎', labelKey: 'ui.category_food'      },
    rest:      { emoji: '😴', labelKey: 'ui.category_rest'      },
    drugs:     { emoji: '💊', labelKey: 'ui.category_drugs'     },
    // 'medical' and 'life' removed — global context set via presets only
};
const DEFAULT_CATEGORY = Object.keys(CAT_META)[0];

const PERSISTENT_CATEGORIES = new Set();
const GLOBAL_VISUAL_CLASSES = [
    'state-stress-low', 'state-stress-high', 'state-ssri', 'state-shutdown',
    'state-low-energy', 'state-health-critical'
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
    exercise:             'rest',
};

// ── DOM helpers ────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function getActionDescription(action) {
    const raw = (action.description || '').trim();
    const name = (action.display_name || actionLabel(action.name) || '').trim();
    if (!raw || !name) return raw;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixPattern = new RegExp(`^${escapedName}\\s*[:\\-–—]\\s*`, 'i');
    return raw.replace(prefixPattern, '').trim();
}

function updateAvatar(s) {
    // Update p5.js monster visual state
    monsterRenderer.setState(s);

    // Swap CSS animation class on the container (body motion)
    const motion    = expressiveEngine.getMotionProfile(s);
    const container = $('avatar-container');
    const animClasses = ['anim-idle','anim-sway','anim-bounce',
                         'anim-shake','anim-droop','anim-barely-moving'];
    container.classList.remove(...animClasses);
    container.classList.add(motion.className);
    Object.entries(motion.cssVars).forEach(([key, value]) => {
        container.style.setProperty(key, value);
    });
}

function updateThoughtCloud(id, show, critical, emojis) {
    const el = $(id);
    if (!el) return;
    if (!show) {
        el.classList.add('hidden');
        el.classList.remove('critical');
        return;
    }
    // Rebuild inner span so mirrored left cloud un-mirrors its emoji
    el.innerHTML = `<span class="thought-cloud-inner">${emojis}</span>`;
    el.classList.remove('hidden');
    el.classList.toggle('critical', critical);
    // Re-trigger appear animation by forcing reflow
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
}

function updateStateCallouts(state) {
    const cues = expressiveEngine.getOverlayCues(state);
    cues.thoughtClouds.forEach((cloud) => {
        updateThoughtCloud(cloud.id, cloud.show, cloud.critical, cloud.emojis);
    });

    const el = $('state-callouts');
    if (!el) return;
    if (!cues.callouts.length) { el.innerHTML = ''; return; }

    el.innerHTML = cues.callouts.map(item => `
        <div class="state-callout ${item.critical ? 'critical' : ''}">
            <span>${item.icon}</span>
        </div>`).join('');
}

function updateHUD(s) {
    updateHUDDetail(s);
}

// Color per field (CSS custom property --dc on .detail-fill)
const DETAIL_COLORS = {
    dopamine:             '#fdcb6e', serotonin:            '#55efc4', endorphins:  '#fd79a8',
    oxytocin:             '#74b9ff', prolactin:            '#a29bfe', vasopressin: '#e17055',
    arousal:              '#a29bfe', energy:               '#00b894', sleepiness:  '#636e72',
    hunger:               '#e67e22', anxiety:              '#ee5a24', prefrontal:  '#0984e3',
    absorption:           '#6c5ce7', shutdown:             '#2d3436',
    combined_health:      '#74b9ff',
    physical_health:      '#55efc4', psychological_health: '#74b9ff',
};

const DETAIL_GROUPS = [
    { emoji: '🧪', labelKey: 'ui.detail_neuro', rows: [
        ['dopamine',    'ui.detail_dopamine'   ],
        ['serotonin',   'ui.detail_serotonin'  ],
        ['endorphins',  'ui.detail_endorphins' ],
        ['oxytocin',    'ui.detail_oxytocin'   ],
        ['prolactin',   'ui.detail_prolactin'  ],
        ['vasopressin', 'ui.detail_vasopressin'],
    ]},
    { emoji: '🫀', labelKey: 'ui.detail_body', rows: [
        ['arousal',    'ui.detail_arousal'   ],
        ['energy',     'ui.hud_energy'    ],
        ['sleepiness', 'ui.hud_sleepiness'],
        ['hunger',     'ui.hud_hunger'    ],
    ]},
    { emoji: '🧠', labelKey: 'ui.detail_mind', rows: [
        ['anxiety',    'ui.hud_anxiety'      ],
        ['prefrontal', 'ui.detail_prefrontal'],
        ['absorption', 'ui.detail_absorption'],
        ['shutdown',   'ui.detail_shutdown'  ],
    ]},
    { emoji: '❤️', labelKey: 'ui.detail_health', rows: [
        ['combined_health', 'ui.hud_health'],
    ]},
];

function updateHUDDetail(s) {
    const el = $('hud-detail');
    if (!el) return;
    const detailState = { ...s, combined_health: getCombinedHealth(s) };
    el.innerHTML = DETAIL_GROUPS.map(g => `
        <div class="detail-group">
            <div class="detail-group-label"><span class="detail-group-emoji">${g.emoji}</span><span>${t(g.labelKey)}</span></div>
            ${g.rows.map(([key, label]) => {
                const rawVal = detailState[key];
                const val = Math.round(Number.isFinite(rawVal) ? rawVal : 0);
                const col = DETAIL_COLORS[key] || 'rgba(255,255,255,0.45)';
                return `<div class="detail-row">
                    <span class="detail-key">${t(label)}</span>
                    <div class="detail-bar">
                        <div class="detail-fill" style="width:${val}%;--dc:${col}"></div>
                    </div>
                    <span class="detail-val">${val}</span>
                </div>`;
            }).join('')}
        </div>`).join('');
}

function events_by_category() {
    const cats = {};
    for (const action of _engine.listActions()) {
        const cat = action.category;
        if (!cats[cat]) cats[cat] = [];
        const display = eventDisplay(
            action.id,
            _engine.getState(),
            action.blockedReason,
            action.note,
        );
        cats[cat].push({
            name: action.id,
            display_name:   display.name,
            description:    display.description || action.description,
            duration:       action.duration,
            category:       cat,
            can_apply:      action.canApply,
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
    return lastActions;
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
    void text;
    void type;
}

// ── Action summary notification ────────────────────────────
const _SUMMARY_VARS = [
    'dopamine','serotonin','endorphins','oxytocin','prolactin','vasopressin',
    'arousal','energy','sleepiness','hunger','anxiety','prefrontal','absorption',
    'health',
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
    void state;
    const el = $('monster-status-banner');
    if (!el) return;
    el.innerHTML = '';
    el.className = '';
}

function updateGlobalVisualState(state) {
    const avatarSection = $('avatar-section');
    if (!avatarSection) return;
    avatarSection.classList.remove(...GLOBAL_VISUAL_CLASSES);
    avatarSection.classList.add(...expressiveEngine.getVisualStateClasses(state));
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
    if (delta('health') <= -3) bits.push(t('ui.notif_health_hit'));

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

    if (delta('health') >= 3) leads.push(getLocale() === 'es' ? 'mejoró la salud' : 'health improved');
    if (delta('health') <= -3) costs.push(getLocale() === 'es' ? 'te pegó en la salud' : 'it hurt health');

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

    if (state.health <= 0) {
        causes.push(t('ui.death_health'));
    }

    if (state.anxiety >= 70) factors.push(t('ui.factor_anxiety', { value: Math.round(state.anxiety) }));
    if (state.sleepiness >= 70) factors.push(t('ui.factor_sleepiness', { value: Math.round(state.sleepiness) }));
    if (state.energy <= 25) factors.push(t('ui.factor_energy', { value: Math.round(state.energy) }));
    if (state.hunger >= 70) factors.push(t('ui.factor_hunger', { value: Math.round(state.hunger) }));
    if (state.shutdown >= 50) factors.push(t('ui.factor_shutdown', { value: Math.round(state.shutdown) }));
    if (state.arousal >= 80 && state.anxiety >= 60) factors.push(t('ui.factor_overload'));

    const cause = causes.length ? causes.join(' + ') : t('ui.death_systemic');
    const summary = t('ui.summaryLabel', { health: Math.round(state.health) });
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
    if (state.health <= 0) {
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
    updateStateCallouts(state);
    updateRecentActions(lastActions);
    updateGlobalStatePanel(state);
    updateMonsterStatusBanner(state);
    updateGlobalVisualState(state);
    if (audioStarted && !audioMuted) updateAudio(state);
}

// ── Action area rendering ──────────────────────────────────────
function ensureCurrentCategory() {
    if (currentCategory && CAT_META[currentCategory]) return currentCategory;
    currentCategory = DEFAULT_CATEGORY;
    return currentCategory;
}

function renderCategoryBar() {
    const bar = $('category-bar');
    if (!bar) return;
    const selected = ensureCurrentCategory();
    const cells = Object.entries(CAT_META).map(([cat, meta]) => {
        return `
          <button class="category-btn category-tab ${cat === selected ? 'active' : ''}" onclick="selectCategory('${cat}')">
            <span class="cat-emoji">${meta.emoji}</span>
            <span class="cat-label">${t(meta.labelKey)}</span>
          </button>`;
    }).join('');
    bar.innerHTML = `<div class="category-strip">${cells}</div>`;
}

function renderCategories() {
    ensureCurrentCategory();
    renderCategoryBar();
    renderActionList(allEvents[currentCategory] || [], false);
}

function selectCategory(cat) {
    currentCategory = cat;
    renderCategoryBar();
    renderActionList(allEvents[cat] || [], false);
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
            <div class="action-desc">${getActionDescription(a)}</div>
            ${!a.can_apply && a.blocked_reason ? `<div class="action-blocked-reason">⚠ ${a.blocked_reason}</div>` : ''}
        </div>`).join('');
    area.innerHTML = `${back}<div class="action-list">${items}</div>`;
}

// ── Search ─────────────────────────────────────────────────────
const searchInput = $('search-input');
if (searchInput !== null) {
    searchInput.addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        renderCategoryBar();
        if (!q) {
            ensureCurrentCategory();
            renderActionList(allEvents[currentCategory] || [], false);
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
}

// ── Apply action ───────────────────────────────────────────────
function applyAction(name) {
    if (!audioStarted && !audioMuted) startAudio();

    const result = _engine.applyAction(name);
    if (!result.ok) return;

    const action = result.action;
    const before = result.before;
    const afterEvent = result.afterEvent;
    const finalState = result.after;
    const notifications = result.notifications;
    if (notifications.length > 0) {
        const primary = notifications[notifications.length - 1];
        const reminder = getContextReminder(finalState);
        const text = reminder ? `${primary.text} · ${reminder}` : primary.text;
        showEventNotification(text, primary.type);
    } else {
        const msg = buildNarrativeFeedback(action, before, afterEvent, finalState);
        if (msg) showEventNotification(msg, 'action');
    }

    _lastActions.push(name);
    if (_lastActions.length > 20) _lastActions = _lastActions.slice(-20);

    allEvents = events_by_category();
    applyStateToUI(finalState, _lastActions.slice(-3));
    updateBackground(name);
    playSFX(name);

    if (checkDeath(finalState)) return;

    // Re-render current view with updated can_apply
    const q = $('search-input')?.value.trim();
    if (q) {
        $('search-input').dispatchEvent(new Event('input'));
    } else {
        renderCategoryBar();
        ensureCurrentCategory();
        renderActionList(allEvents[currentCategory] || [], false);
    }
}

// ── Reset ──────────────────────────────────────────────────────
function resetGame() {
    const death = $('death-screen');
    if (death) death.classList.add('hidden');
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    const notifEl = $('event-notification');
    if (notifEl) notifEl.innerHTML = '';
    _engine.reset({ presetId: currentPresetId });
    _lastActions = [];
    allEvents = events_by_category();
    currentCategory = DEFAULT_CATEGORY;
    applyStateToUI(_engine.getState(), []);
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
            </div>`).join('');
    return `<div class="pinned-header">📌 Sesión</div><div class="action-list pinned-list">${items}</div><hr class="pinned-divider">`;
}

function createHumanForCurrentPreset() {
    return _engine.reset({ presetId: currentPresetId });
}

function renderPresetOptions() {
    const el = $('preset-options');
    if (!el) return;
    el.innerHTML = HUMAN_PRESET_IDS.map(id => `
        <button class="preset-option ${id === currentPresetId ? 'active' : ''}" onclick="selectPreset('${id}')">
            <div class="preset-option-label">${t(`ui.preset_${id}_label`)}</div>
            <div class="preset-option-desc">${t(`ui.preset_${id}_desc`)}</div>
        </button>`).join('');
}

function selectPreset(presetId) {
    if (!HUMAN_PRESET_IDS.includes(presetId)) return;
    currentPresetId = presetId;
    createHumanForCurrentPreset();
    allEvents = events_by_category();
    applyStateToUI(_engine.getState(), _lastActions.slice(-3));
    renderCategoryBar();
    ensureCurrentCategory();
    renderActionList(allEvents[currentCategory] || [], false);
    renderPresetOptions();
}

function dismissOnboarding() {
    onboardingDismissed = true;
    if (!audioStarted && !audioMuted) startAudio();
    const overlay = $('onboarding-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function toggleStats() {
    const overlay = $('stats-overlay');
    if (!overlay) return;
    const open = overlay.classList.contains('hidden');
    overlay.classList.toggle('hidden', !open);
    document.body.classList.toggle('stats-open', open);
}

function updateStaticTranslations() {
    document.documentElement.lang = getLocale();
    document.title = t('ui.title');
    $('onboarding-title').textContent = t('ui.title');
    $('preset-copy').textContent = t('ui.presetCopy');
    $('start-btn').textContent = t('ui.start');
    $('reset-btn').textContent = t('ui.reset');
    $('stats-btn').textContent = t('ui.stats');
    $('lab-btn').textContent = t('ui.lab');
    $('death-msg').textContent = t('ui.deathTitle');
    $('death-reset').textContent = t('ui.deathReset');

    const hudMap = {
        hunger: 'ui.hud_hunger',
        anxiety: 'ui.hud_anxiety',
        sleepiness: 'ui.hud_sleepiness',
        health: 'ui.hud_health',
        energy: 'ui.hud_energy',
    };
    Object.entries(hudMap).forEach(([suffix, key]) => {
        const node = document.querySelector(`[data-tip-id="${suffix}"]`);
        if (node) node.dataset.tip = t(key);
    });
    renderPresetOptions();
}

function changeLocale(locale) {
    setLocale(locale);
    updateStaticTranslations();
    allEvents = events_by_category();
    if (currentState) applyStateToUI(currentState, _lastActions.slice(-3));
    if ($('death-screen') && !$('death-screen').classList.contains('hidden') && currentState) {
        updateDeathScreen(currentState, _lastActions);
    }
    const q = $('search-input')?.value.trim();
    if (q) {
        $('search-input').dispatchEvent(new Event('input'));
    } else {
        renderCategoryBar();
        ensureCurrentCategory();
        renderActionList(allEvents[currentCategory] || [], false);
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

    _engine = createPhysiologyEngine({ presetId: currentPresetId });
    _lastActions = [];
    allEvents = events_by_category();
    currentCategory = DEFAULT_CATEGORY;
    applyStateToUI(_engine.getState(), []);
    $('lang-select').value = getLocale();
    updateStaticTranslations();
    renderCategories();
    if (!onboardingDismissed) {
        const overlay = $('onboarding-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }
}

// =============================================================
// AUDIO — Tone.js procedural retro ambient score
// =============================================================

let bassSynth, leadSynth, accentSynth, angerBassSynth, darkChordSynth, sfxSynth;
let reverbFX, filterFX, leadFilterFX, accentFilterFX, angerBassFilterFX, darkChordFilterFX, masterVolFX, accentGainFX, bassGainFX, leadGainFX, angerBassGainFX, darkChordGainFX;
let bassLoop, leadLoop, accentLoop, angerBassLoop, darkChordLoop;
let chordIndex = 0;
let currentChordStepIndex = 0;
let motifStepIndex = 0;
let lastLeadNote = null;
let audioProfile = null;

const MUSICAL_PALETTES = {
    major: {
        progression: [
            { chord: ['C4', 'E4', 'G4', 'B4'], bass: 'C2', color: ['E5', 'G5', 'B5', 'D6'] },
            { chord: ['A3', 'C4', 'E4', 'G4'], bass: 'A2', color: ['C5', 'E5', 'G5', 'A5'] },
            { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', color: ['A4', 'C5', 'E5', 'G5'] },
            { chord: ['G3', 'B3', 'D4', 'F4'], bass: 'G2', color: ['B4', 'D5', 'F5', 'A5'] },
        ],
        lead: ['E5', 'G5', 'A5', 'B5', 'C6', 'D6'],
        accent: ['G4', 'A4', 'C5', 'D5', 'E5'],
        motifs: [
            [0, 2, 4, 2, 1, 2, 3, 4, 2, 1, 0, 1, 2, 4, 3, 1],
            [1, 3, 4, 3, 2, 1, 2, 4, 5, 4, 2, 1, 0, 2, 1, 0],
            [2, 4, 5, 4, 2, 3, 4, 2, 1, 0, 1, 2, 4, 3, 2, 0],
        ],
    },
    minor: {
        progression: [
            { chord: ['A3', 'C4', 'E4', 'G4'], bass: 'A2', color: ['C5', 'E5', 'G5', 'A5'] },
            { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', color: ['A4', 'C5', 'E5', 'G5'] },
            { chord: ['D3', 'F3', 'A3', 'C4'], bass: 'D2', color: ['F4', 'A4', 'C5', 'E5'] },
            { chord: ['E3', 'G3', 'B3', 'D4'], bass: 'E2', color: ['G4', 'B4', 'D5', 'F5'] },
        ],
        lead: ['A4', 'C5', 'D5', 'E5', 'G5', 'A5'],
        accent: ['E4', 'G4', 'A4', 'C5', 'D5'],
        motifs: [
            [0, 2, 3, 2, 1, 0, 1, 2, 4, 3, 2, 1, 0, 1, 2, 0],
            [1, 2, 4, 2, 3, 2, 1, 0, 2, 3, 4, 3, 1, 0, 1, 0],
            [0, 1, 3, 4, 3, 1, 2, 3, 4, 2, 1, 0, 1, 3, 2, 0],
        ],
    },
};

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function lerp(min, max, amount) {
    return min + (max - min) * amount;
}

function getAudioProfile(state) {
    const arousal = clamp01((state.arousal ?? 0) / 100);
    const sleepiness = clamp01((state.sleepiness ?? 0) / 100);
    const anxiety = clamp01((state.anxiety ?? 0) / 100);
    const serotonin = clamp01((state.serotonin ?? 0) / 100);
    const oxytocin = clamp01((state.oxytocin ?? 0) / 100);
    const vasopressin = clamp01((state.vasopressin ?? 0) / 100);
    const shutdown = clamp01((state.shutdown ?? 0) / 100);
    const energy = clamp01((state.energy ?? 100) / 100);

    const threatLoad = clamp01(anxiety * 0.72 + vasopressin * 0.40 + shutdown * 0.22 - serotonin * 0.18);
    const soothingLoad = clamp01(serotonin * 0.72 + oxytocin * 0.26 + energy * 0.08 - anxiety * 0.30 - vasopressin * 0.10);
    const mode = threatLoad > soothingLoad ? 'minor' : 'major';
    const anger = clamp01(vasopressin * 0.62 + anxiety * 0.24 + arousal * 0.18 - serotonin * 0.12);
    const intensity = clamp01(arousal * 0.46 + anxiety * 0.34 + vasopressin * 0.24 + energy * 0.10 - sleepiness * 0.42 - shutdown * 0.34);
    const tempoDrive = clamp01(0.22 + arousal * 0.76 + anxiety * 0.30 + vasopressin * 0.16 + energy * 0.10 - sleepiness * 0.95 - shutdown * 0.58);
    const calmFilter = clamp01(serotonin * 0.48 + oxytocin * 0.18 + sleepiness * 0.12 - intensity * 0.42);
    const openness = clamp01(intensity * 0.82 + serotonin * 0.10 - sleepiness * 0.35 - shutdown * 0.25);
    const sleepyAmount = clamp01(sleepiness * 0.82 + shutdown * 0.38 - energy * 0.12);

    return {
        mode,
        anger,
        intensity,
        bpm: lerp(58, 122, tempoDrive),
        filterHz: sleepyAmount >= 0.6 ? lerp(320, 1600, 1 - sleepyAmount) : lerp(1800, 9200, openness),
        leadFilterHz: sleepyAmount >= 0.6 ? lerp(700, 2600, 1 - sleepyAmount) : lerp(2000, 10400, clamp01(openness * 0.9 + anxiety * 0.14)),
        accentFilterHz: sleepyAmount >= 0.6 ? lerp(900, 3400, 1 - sleepyAmount) : lerp(2200, 12400, clamp01(openness * 0.95 + vasopressin * 0.18)),
        angerBassFilterHz: lerp(180, 1200, clamp01(anger * 0.72 + intensity * 0.18)),
        darkChordFilterHz: lerp(900, 4200, clamp01(anxiety * 0.82 + anger * 0.28 - sleepyAmount * 0.40)),
        reverbWet: lerp(0.18, 0.56, clamp01(serotonin * 0.10 + sleepiness * 0.30 + shutdown * 0.35 + anxiety * 0.08)),
        masterDb: lerp(-12.5, -2.5, clamp01(intensity * 0.82 + anger * 0.24)),
        bassDb: lerp(-15, -6.5, clamp01(intensity * 0.82 + arousal * 0.20)),
        leadDb: lerp(-13.5, -4.5, clamp01(intensity * 0.76 + serotonin * 0.10 - sleepiness * 0.12)),
        accentDb: lerp(-32, -9.5, clamp01(intensity * 0.78 + vasopressin * 0.20)),
        angerBassDb: lerp(-34, -7.5, clamp01(anger * 0.88 + intensity * 0.18)),
        darkChordDb: lerp(-36, -10.5, clamp01(anxiety * 0.95 + anger * 0.18)),
        leadDensity: clamp01(0.34 + intensity * 0.58 + serotonin * 0.08 + anxiety * 0.10 - sleepiness * 0.10),
        accentDensity: clamp01((intensity - 0.20) * 1.2 + anxiety * 0.16 + vasopressin * 0.14 - sleepiness * 0.24),
        bassDensity: clamp01(0.28 + intensity * 0.58 - sleepiness * 0.22),
        angerBassDensity: clamp01((anger - 0.34) * 1.3 + intensity * 0.20),
        darkChordDensity: clamp01((anxiety - 0.42) * 1.6 + anger * 0.20),
        insistence: clamp01(anxiety * 0.78 + anger * 0.22 + arousal * 0.08),
        leadSubdivision: anxiety >= 0.72 || intensity >= 0.80 ? '16n' : intensity >= 0.48 ? '8n' : '4n',
        accentSubdivision: intensity >= 0.65 ? '8n' : '4n',
        accentEnabled: intensity >= 0.34 && shutdown < 0.72,
        angerBassEnabled: anger >= 0.46 && shutdown < 0.76,
        darkChordEnabled: anxiety >= 0.54 && shutdown < 0.70,
        sleepy: sleepiness >= 0.68 || shutdown >= 0.48,
    };
}

function getCurrentChordStep() {
    const profile = audioProfile || getAudioProfile(currentState || {});
    const palette = MUSICAL_PALETTES[profile.mode];
    return palette.progression[currentChordStepIndex % palette.progression.length];
}

function chooseNote(notes, bias = 0) {
    if (!notes.length) return null;
    const idx = Math.floor(Math.random() * notes.length);
    const weightedIdx = Math.max(0, Math.min(notes.length - 1, idx + bias));
    return notes[weightedIdx];
}

function getMotifNote(profile, step) {
    const palette = MUSICAL_PALETTES[profile.mode];
    const motifBank = palette.motifs;
    const motif = motifBank[currentChordStepIndex % motifBank.length];
    const slot = motifStepIndex % motif.length;
    const degree = motif[slot];
    motifStepIndex += 1;
    const useChordTone = slot % 4 !== 3;
    const notePool = useChordTone ? step.color : palette.lead;
    const note = notePool[Math.max(0, Math.min(notePool.length - 1, degree))] || chooseNote(notePool);
    lastLeadNote = note;
    return note;
}

async function startAudio() {
    if (audioStarted || audioStarting) return;
    audioStarting = true;
    try {
        await Tone.start();
        reverbFX = new Tone.Reverb({ decay: 4.2, wet: 0.28, preDelay: 0.015 });
        filterFX = new Tone.Filter({ frequency: 4200, type: 'lowpass', rolloff: -24 });
        leadFilterFX = new Tone.Filter({ frequency: 5200, type: 'lowpass', rolloff: -24 });
        accentFilterFX = new Tone.Filter({ frequency: 6200, type: 'lowpass', rolloff: -24 });
        angerBassFilterFX = new Tone.Filter({ frequency: 380, type: 'lowpass', rolloff: -24 });
        darkChordFilterFX = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -24 });
        masterVolFX = new Tone.Volume(-8.5);
        bassGainFX = new Tone.Volume(-12);
        leadGainFX = new Tone.Volume(-20);
        accentGainFX = new Tone.Volume(-24);
        angerBassGainFX = new Tone.Volume(-30);
        darkChordGainFX = new Tone.Volume(-34);

        await reverbFX.generate();

        bassSynth = new Tone.MonoSynth({
            oscillator: { type: 'square' },
            filter: { Q: 1, type: 'lowpass', rolloff: -24 },
            envelope: { attack: 0.005, decay: 0.12, sustain: 0.28, release: 0.12 },
            filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0.05, release: 0.08, baseFrequency: 120, octaves: 1.8 },
            volume: -5,
        });
        leadSynth = new Tone.Synth({
            oscillator: { type: 'pulse', width: 0.25 },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0.03, release: 0.06 },
            volume: -5,
        });
        accentSynth = new Tone.Synth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.05 },
            volume: -12,
        });
        angerBassSynth = new Tone.MonoSynth({
            oscillator: { type: 'square' },
            filter: { Q: 1.4, type: 'lowpass', rolloff: -24 },
            envelope: { attack: 0.001, decay: 0.09, sustain: 0.24, release: 0.08 },
            filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.06, baseFrequency: 90, octaves: 1.0 },
            volume: -6,
        });
        darkChordSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'pulse', width: 0.125 },
            envelope: { attack: 0.003, decay: 0.08, sustain: 0.10, release: 0.12 },
            volume: -8,
        });

        bassSynth.chain(bassGainFX, filterFX, masterVolFX, Tone.Destination);
        leadSynth.chain(leadGainFX, leadFilterFX, reverbFX, masterVolFX, Tone.Destination);
        accentSynth.chain(accentGainFX, accentFilterFX, reverbFX, masterVolFX, Tone.Destination);
        angerBassSynth.chain(angerBassGainFX, angerBassFilterFX, masterVolFX, Tone.Destination);
        darkChordSynth.chain(darkChordGainFX, darkChordFilterFX, reverbFX, masterVolFX, Tone.Destination);

        sfxSynth = new Tone.Synth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.06 },
            volume: -14,
        });
        sfxSynth.chain(new Tone.Volume(0), Tone.Destination);

        audioProfile = getAudioProfile(currentState || _engine?.getState?.() || {});
        Tone.Transport.bpm.value = audioProfile.bpm;
        currentChordStepIndex = 0;
        chordIndex = 0;
        motifStepIndex = 0;
        lastLeadNote = null;

        bassLoop = new Tone.Loop((time) => {
            const profile = audioProfile || getAudioProfile(currentState || {});
            const palette = MUSICAL_PALETTES[profile.mode];
            currentChordStepIndex = chordIndex % palette.progression.length;
            const step = getCurrentChordStep();
            if (Math.random() > profile.bassDensity) return;
            const alternate = Math.random() < clamp01(0.18 + profile.intensity * 0.42);
            const note = alternate ? Tone.Frequency(step.bass).transpose(7).toNote() : step.bass;
            const bassDur = profile.intensity >= 0.62 ? '8n' : profile.sleepy ? '2n' : '4n';
            bassSynth.triggerAttackRelease(note, bassDur, time, 0.82);
            chordIndex = (currentChordStepIndex + 1) % palette.progression.length;
            if (chordIndex === 0) {
                motifStepIndex = 0;
            }
        }, '2n');

        leadLoop = new Tone.Loop((time) => {
            const profile = audioProfile || getAudioProfile(currentState || {});
            if (Math.random() > profile.leadDensity) return;
            const step = getCurrentChordStep();
            const shouldRepeat = profile.insistence >= 0.55 && lastLeadNote && Math.random() < profile.insistence * 0.42;
            const note = shouldRepeat
                ? lastLeadNote
                : getMotifNote(profile, step);
            if (!note) return;
            const velocity = profile.mode === 'minor'
                ? 0.58 + profile.insistence * 0.12
                : 0.52 + profile.insistence * 0.08;
            const leadDur = profile.intensity >= 0.7 ? '16n' : '8n';
            leadSynth.triggerAttackRelease(note, leadDur, time, velocity);
        }, '8n');

        accentLoop = new Tone.Loop((time) => {
            const profile = audioProfile || getAudioProfile(currentState || {});
            if (!profile.accentEnabled || Math.random() > profile.accentDensity) return;
            const palette = MUSICAL_PALETTES[profile.mode];
            const step = getCurrentChordStep();
            const note = Math.random() < 0.6 ? chooseNote(step.color, -1) : chooseNote(palette.accent);
            if (!note) return;
            accentSynth.triggerAttackRelease(note, '16n', time, 0.30 + profile.accentDensity * 0.18);
        }, '16n');

        angerBassLoop = new Tone.Loop((time) => {
            const profile = audioProfile || getAudioProfile(currentState || {});
            if (!profile.angerBassEnabled || Math.random() > profile.angerBassDensity) return;
            const step = getCurrentChordStep();
            const note = Tone.Frequency(step.bass).transpose(-12).toNote();
            angerBassSynth.triggerAttackRelease(note, '8n', time, 0.72 + profile.anger * 0.16);
        }, '4n');

        darkChordLoop = new Tone.Loop((time) => {
            const profile = audioProfile || getAudioProfile(currentState || {});
            if (!profile.darkChordEnabled || Math.random() > profile.darkChordDensity) return;
            const step = getCurrentChordStep();
            const darkChord = profile.mode === 'minor'
                ? [step.chord[0], step.chord[1], step.chord[3] || step.chord[2]]
                : [
                    Tone.Frequency(step.chord[0]).transpose(-3).toNote(),
                    Tone.Frequency(step.chord[1]).transpose(-2).toNote(),
                    Tone.Frequency(step.chord[2]).transpose(-2).toNote(),
                ];
            darkChordSynth.triggerAttackRelease(darkChord, '8n', time, 0.28 + profile.darkChordDensity * 0.18);
        }, '8n');

        bassLoop.start(0);
        leadLoop.start('0:2');
        accentLoop.start('0:0:2');
        angerBassLoop.start('0:1');
        darkChordLoop.start('0:0:3');
        Tone.Transport.start();

        audioStarted = true;
        $('audio-btn').textContent = '🔊';
        if (currentState) updateAudio(currentState);
    } catch (e) {
        console.warn('Audio start failed:', e);
    } finally {
        audioStarting = false;
    }
}

function updateAudio(state) {
    if (!audioStarted || !leadSynth) return;

    const prevMode = audioProfile?.mode;
    audioProfile = getAudioProfile(state);
    if (prevMode && prevMode !== audioProfile.mode) {
        chordIndex = 0;
        currentChordStepIndex = 0;
        motifStepIndex = 0;
        lastLeadNote = null;
    }
    Tone.Transport.bpm.rampTo(audioProfile.bpm, 6);
    filterFX.frequency.rampTo(audioProfile.filterHz, 4);
    leadFilterFX.frequency.rampTo(audioProfile.leadFilterHz, 3);
    accentFilterFX.frequency.rampTo(audioProfile.accentFilterHz, 3);
    angerBassFilterFX.frequency.rampTo(audioProfile.angerBassFilterHz, 2);
    darkChordFilterFX.frequency.rampTo(audioProfile.darkChordFilterHz, 2);
    reverbFX.wet.rampTo(audioProfile.reverbWet, 5);
    masterVolFX.volume.rampTo(audioProfile.masterDb, 3);
    bassGainFX.volume.rampTo(audioProfile.bassDb, 3);
    leadGainFX.volume.rampTo(audioProfile.leadDb, 3);
    accentGainFX.volume.rampTo(audioProfile.accentDb, 3);
    angerBassGainFX.volume.rampTo(audioProfile.angerBassDb, 2);
    darkChordGainFX.volume.rampTo(audioProfile.darkChordDb, 2);

    if (leadLoop) {
        leadLoop.interval = audioProfile.leadSubdivision;
    }
    if (accentLoop) {
        accentLoop.interval = audioProfile.accentSubdivision;
    }
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

// Expose globals for inline onclick handlers (ES modules don't auto-expose to window)
window.resetGame       = resetGame;
window.dismissOnboarding = dismissOnboarding;
window.changeLocale = changeLocale;
window.toggleAudio     = toggleAudio;
window.toggleStats     = toggleStats;
window.applyAction     = applyAction;
window.selectCategory  = selectCategory;
window.renderCategories = renderCategories;
window.selectPreset    = selectPreset;
