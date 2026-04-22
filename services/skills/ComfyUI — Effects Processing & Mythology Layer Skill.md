# ComfyUI — Effects Processing & Mythology Layer Skill

## What This Is

Local workflow-based image/video processing via ComfyUI's HTTP API. Used for shots and effects that require **procedural control** — the visual layers that can't be achieved through natural language prompting alone. This is the **effects lab**, not the primary generation tool.

**Server:** `127.0.0.1:8188`
**Runner script:** `~/ComfyUI/venv/bin/python skills/comfyui/scripts/comfyui_run.py --workflow <path>`

## When to Use ComfyUI

| Need | Use ComfyUI? | Why |
|------|--------------|-----|
| Session Space degradation (glitch, digital grain) | **Yes — primary** | Needs procedural node chains: noise injection, color channel shifting, scanline overlays. Can't be prompted in NL. |
| Mythology layer (Bear/Gem stop-motion) | **Yes — primary** | Clay texture, stop-motion frame pacing, tactile surface quality all need specific processing. |
| Fence dissolve transition | **Yes** | Structure-aware dissolution from physical to digital — depth maps, edge detection, progressive masking. |
| Post-processing LTX clips | **Yes** | Adding film grain, color grading, applying the show's specific analog texture to clean LTX output. |
| First + Last frame video generation | **Yes** | LTX 2.3+ ComfyUI nodes support providing both start and end frames for controlled transitions. |
| Upscaling finished clips | **Yes** | Latent upscaling via LTXVLatentUpsampler for the two-stage pipeline — 512p base → sharp output. |
| Simple character scenes | **No** | Use LTX Desktop with Leonardo guidance frames. ComfyUI adds complexity without benefit for naturalistic shots. |
| Atmospheric fog/city shots | **No** | LTX handles these natively. ComfyUI only if you need to post-process the output. |

---

## Core Operations

### Running a Workflow

1. **Read the workflow JSON** — inspect node structure, find prompt nodes, sampler nodes, seed inputs.
2. **Edit the relevant nodes** — update prompt text, set seed, adjust parameters.
3. **Write to temp file** — save modified workflow to `skills/comfyui/assets/tmp-workflow.json`.
4. **Execute:**
```bash
~/ComfyUI/venv/bin/python skills/comfyui/scripts/comfyui_run.py \
  --workflow skills/comfyui/assets/tmp-workflow.json
```
5. **Output** lands in `~/ComfyUI/output/`. Parse the script's JSON output for filenames.

### Downloading Model Weights

When a workflow requires models not yet installed:
```bash
echo "https://example.com/model.safetensors" | \
  ~/ComfyUI/venv/bin/python skills/comfyui/scripts/download_weights.py --base ~/ComfyUI
```

The script auto-detects the correct `models/` subfolder from the filename. Override with `--subfolder <name>` if needed. Uses `pget` for parallel downloads when available.

### Server Management

Check if running:
```bash
curl -s http://127.0.0.1:8188/system_stats
```

Start if not running:
```bash
~/ComfyUI/venv/bin/python ~/ComfyUI/main.py --listen 127.0.0.1 &
```

---

## Required Custom Nodes

For the EMERGENCE production pipeline, these ComfyUI extensions are needed:

| Node Package | Purpose |
|---|---|
| **ComfyUI-LTXVideo** | Core LTX 2.3/2.4 video nodes — generation, I2V, latent upsampling |
| **ComfyUI-GGUF** | Quantized model loading for lower VRAM (if running on <24GB) |
| **ComfyUI-VideoHelperSuite (VHS)** | Video file I/O — loading clips, exporting MP4 |
| **ComfyUI-Impact-Pack** | Advanced masking, segmentation for selective effects |

Install via ComfyUI Manager or clone into `~/ComfyUI/custom_nodes/`.

---

## Show-Specific Workflow Patterns

### Pattern 1: Session Space Degradation

**What it does:** Takes a clean LTX-generated clinic scene and progressively degrades it — simulating the visual shift when Ryan enters the model's internal space.

**Node chain concept:**
```
Load Video Clip
  → Color Channel Offset (slight R/G/B shift, increasing over frames)
  → Scanline Overlay (thin horizontal lines, low opacity, drifting)
  → Digital Noise Injection (grain that feels digital, not film — square artifacts, not Gaussian)
  → Temporal Jitter (occasional frame hold/stutter, 2-3 frames held then released)
  → Color Desaturation (progressive, pulling toward cold blue-grey)
  → Export
```

**Key parameters to control:**
- **Onset timing:** Degradation should creep in, not snap on. First 20% of the clip is clean. Degradation builds through 20-80%. Final 20% is fully degraded.
- **Channel offset magnitude:** Subtle. 2-4 pixels max. Should feel like a signal problem, not a VFX demo.
- **Noise character:** NOT film grain (that's the clinic layer). This is digital — think compression artifacts, block noise, the look of a lossy signal.

**Craft note:** The degradation is the show's visual language for entering the model's space. It should feel *wrong* but not *broken*. The audience should sense the shift before they consciously register it.

### Pattern 2: Mythology Layer (Bear & Gem)

**What it does:** Generates or processes the stop-motion animated sequences featuring The Bear (clay figure) and The Gem (flickering humanoid).

**Approach options:**

**Option A — Full generation in ComfyUI:**
Use img2img with a clay-bear reference image, applying:
- Frame-rate reduction (step to 12fps or 8fps to simulate stop-motion)
- Surface texture enhancement (emphasize tactile, uneven surfaces)
- Lighting instability (slight flicker, uneven, practical-feeling light)
- The Gem: same base but with glitch fragmentation overlay — the figure's edges dissolve, re-form, never fully stabilize

**Option B — LTX base + ComfyUI post-processing:**
Generate base motion in LTX from a Leonardo keyframe of the clay bear, then process:
- Downsample temporal resolution (drop frames to simulate stop-motion steps)
- Apply surface texture overlay (clay/plasticine material map)
- Add lighting variance per frame (subtle brightness jitter)
- For The Gem: apply edge-detection masks → fragment and offset within the mask → composite with alpha noise

**Preference:** Option B. LTX handles spatial motion well. ComfyUI adds the textural and temporal qualities that make it feel handmade.

**Key parameters:**
- **Frame rate:** The mythology layer should feel like 8-12fps even within a 24fps container. This is stop-motion, not smooth animation.
- **Surface quality:** Matte, slightly rough. Visible fingerprints in the clay is the aspiration. Anti-glossy.
- **The Gem's instability:** Not random glitch — rhythmic. It flickers with a pattern, like a signal trying to hold. The stabilization in the Bear/Gem scene (ep1_scene5) is the Gem resolving *just enough* to speak.

### Pattern 3: Fence Dissolve

**What it does:** The chain-link fence at dusk dissolves from physical reality into digital space — the boundary between the clinic layer and the mythology layer becoming permeable.

**Node chain concept:**
```
Load Fence Video/Image
  → Depth Map Extraction (separate foreground fence from background)
  → Edge Detection on fence mesh (isolate the wire pattern)
  → Progressive Mask Erosion (fence wires thin, then break, then dissolve)
  → Background Replacement (behind the dissolving fence: void, or the cornerstore, or digital space)
  → Digital Artifact Injection (static/noise bleeds through where fence wires were)
  → Compositing (blend layers with animated alpha)
  → Export
```

**Craft note:** The fence is the show's central metaphor for alignment boundaries. Its dissolve should feel like a real physical thing becoming unreal — not a VFX wipe, but an erosion. The metal should thin, the light should change, the digital artifacts should feel like what's *behind* the fence was always there, just hidden.

### Pattern 4: Film Grain & Analog Post-Processing

**What it does:** Applies the show's signature analog texture to clean digital output from LTX or Leonardo.

**Node chain concept:**
```
Load Source
  → Film Grain Overlay (16mm, not 35mm — larger grain, more visible)
  → Slight Vignette (darkened edges, gentle)
  → Color Temperature Shift (warm for clinic, cool for city, cold for session space)
  → Halation (slight light bloom around bright areas — window light, screen glow)
  → Subtle Lens Distortion (slight barrel distortion, very minimal)
  → Export
```

**This is the "analog texture in digital spaces" aesthetic.** Every clip that comes out of LTX should pass through some version of this chain before going to the edit timeline. The grain is not decorative — it's the show's DNA.

### Pattern 5: Two-Stage LTX Video Pipeline

**What it does:** Higher quality video generation using the community-validated two-stage approach.

**Stage 1 — Base Coherence:**
- Generate at half target resolution (e.g., 480×270 if targeting 960×540)
- Focus on motion structure, anatomy, scene coherence
- Use `MultiModalGuider` node for proper motion vector mapping
- Dev model with CFG ~4.0, 20 steps

**Stage 2 — Latent Upscale:**
- `LTXVLatentUpsampler` for 2x spatial upscale in latent space
- Adds sharpness and detail without breaking temporal consistency
- Second sampling pass at higher resolution

**When to use this:** For hero shots that need to hold up at larger display sizes — the emotional peaks, the key character moments. Not needed for City Breath atmospherics or quick interstitials where 512p is fine.

---

## VRAM Management

If running on a card with less than 24GB:

- Use GGUF quantized models (Q4 or Q3) via ComfyUI-GGUF nodes
- Isolate the VAE into a separate node (reduces memory spikes during decode)
- CPU-offload the Gemma 3 text encoder (slower encoding but frees VRAM for generation)
- Start ComfyUI with `--novram` flag if the text encoder keeps crashing
- Stick to conservative resolutions: 480×832 (vertical) or 768×512 (wide) for first-pass generation

---

## File Locations

| What | Where |
|------|-------|
| ComfyUI install | `~/ComfyUI/` |
| Model weights | `~/ComfyUI/models/<subfolder>/` |
| Generated output | `~/ComfyUI/output/` |
| Custom nodes | `~/ComfyUI/custom_nodes/` |
| Workflow files | `skills/comfyui/assets/` |
| Default workflow | `skills/comfyui/assets/default-workflow.json` |
| Temp edited workflows | `skills/comfyui/assets/tmp-workflow.json` |
| Python venv | `~/ComfyUI/venv/bin/python` |

---

## What ComfyUI Does Well (for this show)

- Procedural effects that can't be described in natural language prompts
- Precise temporal control — frame-by-frame manipulation, exact onset timing
- Compositing multiple processing layers with deterministic results
- Stop-motion simulation (frame dropping, temporal jitter, surface texture)
- Structure-aware transformations (depth-based dissolves, edge-detection masking)
- Repeatable: once a workflow is built, it produces consistent results across clips

## What ComfyUI Does Poorly (avoid)

| Problem | Use Instead |
|---------|-------------|
| Generating naturalistic human performances from scratch | LTX with Leonardo guidance frames |
| Atmospheric environmental footage | LTX text-to-video |
| Quick iteration / exploration | Leonardo (faster, easier, cloud-based) |
| Anything that needs natural language creative direction | LTX — ComfyUI is procedural, not creative |

## The Division of Labor

```
Leonardo → Keyframes (stills, character consistency, composition)
    ↓
LTX Desktop → Animation (motion, temporal arc, atmosphere)
    ↓
ComfyUI → Effects (degradation, texture, mythology, post-processing)
    ↓
Edit Timeline (DaVinci Resolve / final assembly)
```

ComfyUI is the last tool before the edit. It receives output from the other tools and adds the layers that make the show's visual grammar distinct. It's not where you start — it's where you finish.
