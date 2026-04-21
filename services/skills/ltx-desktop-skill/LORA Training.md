---
name: ltx-desktop-skill
description: >
  Use this skill whenever working with the LTX Studio-Desktop API for video generation in the Emergence production pipeline. 
  Triggers include: generating LTX I2V, character LoRA training, location establishing shots, City Breath exteriors, uploading reference photos, and any API call to LTX. 
  Also trigger when the user mentions "LTX Skill", "Video Generation", "Video LORA", or "Emergence Workflow".
---

# APPENDIX: LTX-2.3 CHARACTER LoRA TRAINING PLAN

Based on the Ostris workflow for AI Toolkit. This changes the pipeline — once we have locked keyframes from Leonardo, we can train character LoRAs on LTX-2.3 for consistent I2V generation.

### Why This Matters
The current pipeline is: `Leonardo keyframe → LTX I2V` (single image to video). Every shot is a one-off — character appearance drifts between generations. A trained LoRA locks a character's face, body, clothing, and spatial relationship to the set across ALL generations. This is the difference between "we got lucky on that shot" and "this character looks like this character every time."

### Training Dataset Strategy per Character

| Character | Source Material | Clip Count Target | Notes |
| :--- | :--- | :--- | :--- |
| **Ryan (kitchen table)** | Generate 25-30 Leonardo keyframes from locked prompts, select best 19 | 19 clips | Single scene: kitchen table, consistent lighting, same henley |
| **Lena (doorway/table)** | Generate 25-30, select 19 | 19 clips | Two sub-scenes: doorway arrival + seated at table |
| **Dan (kitchen counter)** | Generate 25-30, select 19 | 19 clips | Single scene: counter/moka pot, clay dust visible |
| **Rilke (couch)** | Real video of Rilke + Leonardo keyframes as supplement | 19 clips | Real footage is gold — use actual Rilke video if available |
| **The Kitchen (location)**| Leonardo establishing shots + real photos | 19 clips | Not a character LoRA — a SCENE LoRA for set consistency |

### Training Configuration (RTX 5090)

```yaml
# AI Toolkit config for Emergence character LoRA
model: ltx-2.3-distilled  # Use distilled for eval, full for training
linear_rank: 32
precision: float8
cache_latents: true  # Critical — speeds up iterations dramatically

# Phase 1: Establish character essence
noise_schedule: high
steps: 2500

# Phase 2: Fine-tune details  
noise_schedule: balanced
steps: 2500
# Total: ~5000 steps per character

# Generation settings
aspect_ratio: 16:9
resolution: 1024x576  # Matches 768x768 pixel density for 16:9
autoframecount: true
```

### Pipeline Update: Leonardo → LoRA → LTX

**Old pipeline:**
* Leonardo keyframe (single image)
* LTX I2V from keyframe (character may drift)
* Hope for consistency across shots

**New pipeline:**
1. Leonardo keyframes — generate 25-30 per character/scene using locked prompts
2. Select best 19 for training dataset
3. Caption each with natural language: *"Ryan sits at kitchen table, one hand near laptop, looking slightly left, morning fog through window"*
4. Train character LoRA on LTX-2.3 (~5000 steps, high→balanced noise schedule)
5. Generate I2V using LoRA — character is now **BURNED IN**
6. Consistency across shots is structural, not luck

### Captioning Best Practices for Emergence

| Do | Don't | Why |
| :--- | :--- | :--- |
| "Ryan sits at the table in a worn dark henley, one hand resting near an open laptop" | "Man at table" | Match actual character descriptions from Leonardo prompts |
| "Lena stands in the doorway, backlit by fog, messenger bag across chest, mid-sentence" | "Woman in doorway" | Use generic descriptions |
| "Dan pours coffee from a moka pot, clay dust visible on forearm, salt-and-pepper stubble" | "Man pouring coffee" | Include spatial/lighting context |
| "The kitchen table with molecular model, ceramic mug, walnut cabinets behind" | "Kitchen scene" | Describe only the person/subject focus |

### Hardware Notes
The RTX 5090 can handle this with layer offloading enabled. Training 5000 steps with `cache_latents: true` should complete in a reasonable timeframe. If VRAM pressure is an issue, reduce `linear_rank` to 16 — you lose some detail fidelity but gain stability.

### Training Order

| Priority | LoRA | Why First |
| :--- | :--- | :--- |
| **1** | The Kitchen (scene) | Lock the set before the characters — everything else happens inside this space |
| **2** | Ryan (table) | Most screen time, most complex expressions |
| **3** | Rilke (couch) | Emotional anchor, real reference footage available |
| **4** | Lena (doorway/table) | Needs to work in two lighting setups |
| **5** | Dan (counter) | Fewer scenes but must be consistent when present |

### Integration with Leonardo Controlnets
Once LoRAs are trained, the workflow becomes bidirectional:

* **Leonardo → LTX:** Use Leonardo keyframes as I2V input images, with LoRA ensuring character consistency in the video output
* **LTX → Leonardo:** Extract the best frames from LoRA-consistent video, upload to Leonardo as controlnet references (Content Reference, preprocessor 430) for generating **NEW** keyframes that match the locked character

This creates a consistency flywheel: each generation reinforces the next.

# APPENDIX: GENERATION BUDGET ESTIMATE

| Model | Credits/Gen | Images/Gen | Shots Using It | Total Gens | Est. Credits |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Flux Pro 2.0 (V2) | ~50 | 4 | 12 shots | 12 | ~600 |
| Lucid Origin (V1) | ~24 | 4 | 6 shots | 6 | ~144 |
| Seedream 4.5 (V2) | ~40 | 4 | 3 shots | 3 | ~120 |
| Nano Banana 2 (V2)| ~26 | 10 (scouting only)| — | — | — |
| **Total first pass**| | | **21 shots** | **21** | **~864** |

*Add 2x for iteration (rejected batches, prompt tweaks): ~1,700-2,000 credits for a full first pass with revisions.*
