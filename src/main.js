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
