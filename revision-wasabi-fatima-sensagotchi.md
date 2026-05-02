# Revision de WASABI, FAtiMA y sensagotchi

## Que si conviene robarles

Te lo separo por impacto y costo. La idea es no contaminar `sensagotchi` con arquitectura ajena, sino extraer piezas que encajan con su logica actual.

| Idea | Fuente | Valor para `sensagotchi` | Costo | Veredicto |
|---|---|---:|---:|---|
| Proyeccion a espacio PAD como capa derivada | WASABI | Medio | Bajo | Si |
| Perfiles/configs de "temperamento" o presets de agente | WASABI | Alto | Bajo | Si |
| Estados emocionales secundarios derivados del estado continuo | WASABI | Medio | Medio | Si, si quedan como vista |
| XML/EmotionML para definir emociones | WASABI | Bajo | Medio | No mucho |
| Appraisal por reglas sobre eventos | FAtiMA | Medio | Medio/Alto | Solo una version minima |
| Beliefs, goals, autobiographical memory | FAtiMA | Bajo hoy | Alto | No |
| Decision autonoma de acciones | FAtiMA | Bajo hoy | Alto | No |
| Tooling de authoring complejo | FAtiMA | Bajo | Alto | No |
| Tests orientados a invariantes conceptuales | Ambos, pero vos ya lo haces | Alto | Bajo | Si, seguir por ahi |

## Lo que si haria

### 1. Agregar una capa derivada `state -> PAD`

No reemplaza tus variables. Solo las resume. Vos ya tenes un estado rico con `liking`, `wanting`, `anxiety`, `absorption`, `shutdown`, etc.

Una proyeccion posible:

- `pleasure = normalized(liking_score)`
- `arousal = mix(arousal, anxiety, energy)`
- `dominance = inverse(shutdown + overwhelm + helplessness proxy)`

Esto sirve para:

- debug visual
- clustering de estados
- animacion/audio mas consistente
- eventualmente etiquetar emociones secundarias sin tocar el core

### 2. Meter presets de persona, no "rasgos psicologicos completos"

WASABI trabaja con parametros/configuracion; en tu caso eso puede volverse presets simples:

- `high_anxiety_susceptibility`
- `high_reward_sensitivity`
- `high_recovery_capacity`
- `high_social_buffering`
- `high_sexual_inhibition`
- `low_baseline_energy`

Eso calza perfecto con tu enfoque de "few expressive variables". No hace falta un sistema de creencias; alcanza con modificar baselines, decay rates y receptivity weights.

### 3. Derivar etiquetas emocionales secundarias como lectura, no como motor

WASABI trabaja con estados afectivos primarios/secundarios; eso podria inspirarte a exponer etiquetas tipo:

- `tense anticipation`
- `warm bonding`
- `overstimulated`
- `collapsed`
- `frustrated wanting`
- `empty satiation`

La regla importante: que esas etiquetas salgan del estado fisiologico actual, y no al reves.

Si invertis la dependencia, perdes la claridad del sistema.

### 4. Tomar una version minima de appraisal

FAtiMA hace appraisal full sobre eventos, beliefs y goals. Vos ya tenes una version mucho mas util para este proyecto en `compute_receptivity` y `apply_backfire`.

Lo que si podes sumar es una pequena capa declarativa por accion:

- `requires_low_anxiety`
- `benefits_from_absorption`
- `backfires_under_shutdown`
- `social_safety_sensitive`

Eso te permite autorar acciones mas facil sin meter todo OCC/FAtiMA.

## Lo que no haria

### 1. No meteria beliefs, goals, ni autobiographical memory

Eso te empuja hacia personaje narrativo y away de sandbox fisiologico. FAtiMA esta hecho para eso.

En `sensagotchi` hoy seria peso muerto.

### 2. No haria decision autonoma

Tu doc es explicito: "los modelos no tienen motivaciones, no toman decisiones, el usuario las toma".

FAtiMA justo optimiza lo contrario.

### 3. No intentaria integrar codigo de WASABI

El valor esta en la idea de PAD y parametrizacion, no en su stack Qt/C++/GUI vieja.

### 4. No migraria a un formalismo OCC

OCC sirve mucho para appraisal social y narrativo; vos estas modelando placer, rebote, tolerancia, recuperacion, mezcla de valencias y constraints fisiologicos. Son problemas distintos.

## Plan practico para `sensagotchi`

Si queres sacar valor real de esta revision, haria esto en orden:

1. `PAD projection`
   Crear una funcion `compute_pad(human)` y mostrarla en un panel debug opcional.

2. `Trait presets`
   Crear presets tipo `anxious`, `novelty-seeking`, `blunted`, `resilient`, aplicando offsets a baseline y receptivity.

3. `Secondary labels`
   Derivar 8-12 etiquetas de estado desde el vector actual, solo para UI/audio/avatar.

4. `Action metadata`
   Pasar parte de la logica contextual a descriptores por accion para que agregar nuevas acciones sea menos artesanal.

5. `Scenario packs`
   En vez de beliefs/goals, hacer packs de estado inicial y catalogos de acciones: "comedown", "burnout", "dating", "party", "post-breakup".

## Recomendacion final

Lo mas util de WASABI es:

- PAD como resumen
- presets de configuracion
- lectura secundaria de emociones

Lo mas util de FAtiMA es:

- pensar mejor la autoria de reglas
- separar "motor" de "contenido"
- quiza una capa declarativa minima para appraisal

Lo que no sumaria tanto:

- integrar sus repos
- copiar sus arquitecturas
- mover `sensagotchi` hacia agentes con creencias/metas

## Siguiente paso posible

Si queres, el siguiente paso puede ser mas concreto: proponer una especificacion chica para implementar en `sensagotchi` estas tres cosas:

- `compute_pad(human)`
- presets de temperamento
- 12 etiquetas emocionales derivadas del estado actual
