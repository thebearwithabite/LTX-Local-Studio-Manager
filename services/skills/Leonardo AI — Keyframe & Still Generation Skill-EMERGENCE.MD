# Leonardo AI — Keyframe & Still Generation Skill

## What This Is

Cloud image generation via Leonardo AI's API. Used for generating **keyframes** (guidance frames) that feed into LTX image-to-video, and for producing **standalone stills** — character reference sheets, location establishing shots, texture studies, and promotional art for *EMERGENCE: The Alignment Clinic*.

Leonardo is the **consistency anchor** in the pipeline. Characters need to look the same across shots. Locations need to feel like the same kitchen, the same doorway, the same rooftop. Leonardo's style system and controlnet references make that possible.

**Base URL (V1):** `https://cloud.leonardo.ai/api/rest/v1/generations`
**Base URL (V2):** `https://cloud.leonardo.ai/api/rest/v2/generations`
**Auth:** `Authorization: Bearer <API_KEY>` on every request.
**API Key:** `c138385f-1927-40d5-bf82-fc7373eac7b4`

## When to Use Leonardo

| Need | Use Leonardo? | Model / Approach |
|------|---------------|------------------|
| City Breath keyframe (SF exterior, fog) | **Yes — PRIMARY** | Flux Pro 2.0 via V2 API with image_reference from real photo |
| Character keyframe for LTX I2V | **Yes — primary** | Lucid Origin for composition, Flux Pro 2.0 for photorealism |
| Location establishing shot | **Yes** | Lucid Realism or Flux Pro 2.0 for photorealistic SF interiors/exteriors |
| Texture / material study | **Yes** | Kino XL for film-stock texture (but avoid the retro look for this show) |
| Mythology layer (Bear/Gem) | **Partial** | Can generate reference stills for clay bear, but animation is ComfyUI |
| Text cards / UI elements | **No** | Render as graphics, not AI-generated images |
| Video generation | **Via Veo only** | Leonardo wraps Veo 3/3.1 — use only if LTX local isn't appropriate |

---

## Model Selection for This Show

### Flux Pro 2.0 — `flux-pro-2.0` (V2 API — CONFIRMED WINNER FOR EXTERIORS)
**V2 API.** **This is the current best-in-class for City Breath exteriors and grounded realism.** Tested April 2026 with Bernal Heights reference photo — produced the most convincing SF surveillance aesthetic of 7 models compared (Lucid Origin/Realism, Phoenix 1.0, Kino XL, Seedream 4.0/4.5, Flux Pro 2.0). Realistic architecture, correct fog layer behavior, proper digital sensor color response.

Best for: City Breath #1, #2, #3. Any exterior SF establishing shot. Ryan's kitchen from the outside. Location consistency passes.

V2 endpoint, no controlnet IDs — uses `guidances.image_reference` format:
```json
{
  "model": "flux-pro-2.0",
  "parameters": {
    "width": 1376, "height": 768,
    "prompt": "...",
    "quantity": 2,
    "guidances": {
      "image_reference": [
        { "image": { "id": "IMAGE_ID", "type": "UPLOADED" } }
      ]
    }
  },
  "public": false
}
```

### Seedream 4.5 — `seedream-4.5`
**V2 API.** Strong on color saturation and atmospheric mood. Slightly weaker on architectural accuracy than Flux Pro 2.0 but excellent at color grading the kind of oversaturated-digital look the show wants. Aspect ratio handling can drift toward 4:3 even when you request 16:9.

Best for: Mood/color exploration passes. When the vibe is more important than architectural accuracy. Secondary keyframes.

Uses the same V2 `guidances.image_reference` format as Flux Pro 2.0, with optional `strength: "LOW"|"MID"|"HIGH"` and `style_ids` array.

### Lucid Origin — `7b592283-e8a7-4c5a-9ba6-d18c31f258b9`
**V1 API.** Solid default for characters and composition. Strong at cinematic composition and human subjects with imperfect/real qualities. Pair with Film or Cinematic style.

Best for: Ryan at the kitchen table. Lena in the doorway. Dan with clay dust. Character medium shots and close-ups.

### Lucid Realism — `05ce0082-2d80-4a2d-8653-4d1c85e2418e`
**V1 API.** More photorealistic than Origin but has visible older-diffusion artifacts in testing. Consider Flux Pro 2.0 first for photorealistic locations — Lucid Realism is a fallback.

Best for: Interior kitchen shots when Flux Pro 2.0 is overbudget on credits.

### Phoenix 1.0 — `de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3`
**V1 API.** Leonardo's proprietary foundational model. Good prompt adherence and text rendering but tested weaker than Flux Pro 2.0 for this show's specific aesthetic.

Best for: Fallback option. Not the primary choice for EMERGENCE.

### Leonardo Kino XL — `aa77f04e-3eec-4034-9c07-d0f619684628`
**V1 API.** Film-stock aesthetic built in. **For EMERGENCE specifically, this pushes too hard toward retro/NFB documentary look — avoid for main keyframes.** The show needs contemporary-digital-wrong, not vintage-wrong.

Best for: Intentionally retro reference material only. Not for primary keyframes.

### Nano Banana 2 — `nano-banana-2`
**V2 API.** 26 credits/gen, fast. Known for safe, stock-photo-adjacent output. Avoid for final keyframes — too lifeless for the show's aesthetic.

Best for: Composition scouting only. Do final passes with Flux Pro 2.0.

---

## CONFIRMED WORKFLOWS (Tested April 2026)

### City Breath Workflow — Photo → Keyframe → LTX
This is the validated pipeline for City Breath shots, established during the April 15 testing session:

1. **Shoot a reference photo** from the actual window/location (or use an existing one).
2. **Upload to Leonardo** via `POST /api/rest/v1/init-image` with `{"extension": "jpg"}` — get the `uploadInitImage.url`, `fields`, and `id`.
3. **POST the image** to the presigned S3 URL with all fields as form data.
4. **Generate with Flux Pro 2.0** via V2 endpoint using `guidances.image_reference` with the image ID.
5. **Review 4 candidates** and select the one closest to the show's aesthetic.
6. **Download the winner** to `C:\Users\thebe\Downloads\` using urllib with `User-Agent: Mozilla/5.0` header (CDN requires it).
7. **Pass to LTX** as `imagePath` in the `/api/generate` I2V call.

The key insight: real photos provide the SF geography and architecture that prompts alone can't reliably reproduce. The prompt only needs to push color and texture.

### ControlNet Training (Future Work)
Once we have 10-20 locked keyframes that consistently hit the City Breath aesthetic, train a custom Element (LoRA) following the docs at https://docs.leonardo.ai/docs/train-custom-elements-and-generate-images:

1. Assemble a dataset of approved keyframes under a shared folder.
2. `POST /api/rest/v1/datasets` with `{"name": "emergence-city-breath", "description": "..."}` — save the dataset ID.
3. Upload each image to the dataset via `POST /api/rest/v1/datasets/{id}/upload`.
4. `POST /api/rest/v1/elements` with training params — use `lora_focus: "Style"` for aesthetic capture, `instance_prompt: "emrgnccitybreath"` (abstract trigger word), `num_train_epochs: 100`, `sd_version: "SDXL_1_0"` (or newer when Flux LoRA training is available).
5. Save the `userLoraId` for future generations.
6. Include `userElements: [{userLoraId, weight: 1}]` in generation payloads along with the trigger word in the prompt.

This would let us generate new City Breath shots that lock onto the show's specific visual grammar without needing a reference photo every time.

---

## API Patterns

### V1 (Lucid Origin, Lucid Realism, Kino XL)

```json
POST https://cloud.leonardo.ai/api/rest/v1/generations
{
  "modelId": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",
  "prompt": "your prompt here",
  "contrast": 3.5,
  "height": 1080,
  "width": 1920,
  "num_images": 4,
  "styleUUID": "85da2dcc-c373-464c-9a7a-5624359be859",
  "alchemy": false,
  "ultra": false
}
```

**Note:** Alchemy is NOT supported for Lucid Origin or Lucid Realism.

### V2 (Nano Banana 2, Seedream 4.5)

```json
POST https://cloud.leonardo.ai/api/rest/v2/generations
{
  "model": "nano-banana-2",
  "parameters": {
    "width": 1376,
    "height": 768,
    "prompt": "your prompt here",
    "quantity": 1,
    "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],
    "prompt_enhance": "OFF"
  },
  "public": false
}
```

**Nano Banana 2 dimensions (16:9):** 1376×768 (1K), 2752×1536 (2K), 5504×3072 (4K). Mismatched width/height pairs silently default to 1:1 — always use validated pairs.

### Seedream with Image Guidance (V2)

```json
{
  "model": "seedream-4.5",
  "parameters": {
    "width": 1920,
    "height": 1080,
    "prompt": "...",
    "quantity": 2,
    "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],
    "guidances": {
      "image_reference": [
        {
          "image": { "id": "UPLOADED_IMAGE_ID", "type": "UPLOADED" },
          "strength": "MID"
        }
      ]
    }
  },
  "public": false
}
```

### Controlnets (V1 — Lucid models)

For character/composition consistency using a previously generated or uploaded image:

```json
"controlnets": [
  {
    "initImageId": "LEONARDO_IMAGE_ID",
    "initImageType": "GENERATED",
    "preprocessorId": 430,
    "strengthType": "High"
  }
]
```

| Preprocessor | ID | Use Case |
|---|---|---|
| Content Reference | 430 | Preserve composition, layout, spatial arrangement. Use for matching camera angle across shots. |
| Style Reference | 431 | Preserve color palette, texture, mood. Use for maintaining the show's visual grammar across different scenes. |

---

## Style UUIDs for This Show

The show's visual grammar maps to specific Leonardo styles. These are the ones that matter:

### Primary Styles

| Style | UUID | When to Use |
|-------|------|-------------|
| **Film** | `85da2dcc-c373-464c-9a7a-5624359be859` | Default for most shots. Adds the film-stock quality and slight desaturation the show needs. |
| **Cinematic** | `a5632c7c-ddbb-4e2f-ba34-8456ab3ac436` | Character close-ups and dramatic compositions. Slightly more polished than Film. |
| **Moody** | `621e1c9a-6319-4bee-a12d-ae40659162fa` | City Breath shots. The Crack. Anything that needs emotional weight in the color grading. |
| **Neutral** | `0d914779-c822-430a-b976-30075033f1c4` | When you want the model's natural output without style influence. Good for testing prompts. |

### Secondary Styles (situational)

| Style | UUID | When to Use |
|-------|------|-------------|
| **Bokeh** | `9fdc5e8c-4d13-49b4-9ce6-5a74cbb19177` | Shallow DOF shots — Ryan's hands on the laptop, coffee cup foreground blur. |
| **Monochrome** | `a2f7ea66-959b-4bbe-b508-6133238b76b6` | Reference stills for the mythology layer. Not for final keyframes. |
| **Retro** | `6105baa2-851b-446e-9db5-08a671a8c42f` | Analog texture exploration. Sometimes produces too much grain — test first. |
| **Minimalist** | `cadc8cd6-7838-4c99-b645-df76be8ba8d8` | Clinic log card backgrounds, if ever needed as AI-generated texture rather than pure graphic. |
| **None** | `556c1ee5-ec38-42e8-955a-1e82dad0ffa1` | Raw model output. Use when other styles are fighting the prompt. |

### Styles to Avoid

| Style | Why |
|-------|-----|
| HDR | Oversaturated, punchy. The opposite of this show's visual language. |
| Vibrant | Same problem. Too much color energy. |
| Stock Photo | Will flatten the image into corporate genericism. |
| Dynamic | Tends toward action/movement compositions that fight the show's stillness. |
| Fashion | Too clean, too posed. Characters should look unfinished, not editorial. |

---

## Character Keyframe Prompts

### Prompt Principles for Characters

Leonardo prompts differ from LTX prompts. Leonardo generates stills — describe the **composition, not the action**. Think photography direction, not cinematography.

- Describe physical appearance precisely. Age, build, clothing, hair, skin quality.
- Describe posture and expression through physical detail. Not "thoughtful" — "chin resting on knuckle, gaze directed at something off-frame left."
- Describe the lighting setup. Window light from where, practical lights, what's in shadow.
- Describe depth of field and focus. What's sharp, what's soft.
- Include imperfections. This show's characters should look slightly undone — not ugly, not beautiful, just real.

### Character Reference Prompts

**Ryan — Kitchen Table:**
```
Cinematic film still, 16mm grain texture. A man in his early 40s sits at a heavy
wooden kitchen table. Casual clothing — worn henley, no effort made. He is mid-thought,
not posed, not looking at camera. One hand rests near an open laptop, the other holds
a ceramic mug. His expression is distracted, intelligent, slightly exhausted. Natural
window light from the left, diffused by fog outside, creating soft flat illumination.
Shallow depth of field — his face in focus, the kitchen behind him softly blurred.
The space is lived-in: mismatched books, a plant, warm but not styled. 16:9 composition.
```

**Lena — Doorway Arrival:**
```
Cinematic film still, 16mm grain. A young woman in her mid-20s stands in a doorway,
backlit by thick white fog pouring in from outside. Oversized vintage jacket over
layered clothing, messenger bag strap across her chest. Her style is unfinished —
intentional but not curated. She is mid-sentence, one hand gesturing slightly. Her
expression is nervous but trying to appear composed. The interior behind the camera
is warm-toned, the exterior behind her is cool and overexposed from the fog. Shallow
focus with the background blown out. 16:9 composition.
```

**Dan — Clay Dust:**
```
Cinematic film still, warm interior light. A Middle Eastern man in his mid-50s stands
in a kitchen, pouring coffee. Salt-and-pepper stubble, strong features softened by age.
Visible clay dust on one forearm and the edge of his t-shirt. His posture is relaxed,
unhurried. He is not looking at the camera — his attention is on the coffee, or on
something out of frame. The light is warm and practical. The composition is casual,
caught-moment, not staged. Shallow depth of field. 16:9.
```

**Rilke — Couch:**
```
Cinematic film still, natural interior light. An Australian Shepherd lies on a worn
couch in a lived-in kitchen. The dog is settled but watchful — head up, eyes tracking
something off-frame. Warm light from a window falls across the couch. Shallow depth
of field with the dog in sharp focus and the kitchen behind softly blurred. The couch
has a worn blanket draped over one arm. 16:9 composition.
```

---

## Location Keyframe Prompts

**Ryan's Kitchen — Establishing:**
```
Cinematic interior photograph, 16mm film grain texture. A lived-in San Francisco kitchen
with a heavy wooden table, mismatched chairs, open shelves with books and plants. A large
window shows thick fog outside, diffusing cool white light into the room. Warm practical
lights — a pendant lamp over the table, a small lamp on a shelf. A worn couch is visible
against one wall with a blanket draped over it. An open laptop sits on the table next to
a ceramic mug. The space feels inhabited, not decorated. Muted warm palette with cool
window light as counterpoint. Wide shot, 16:9.
```

**Bernal Heights Rooftops — City Breath:**
```
Cinematic landscape photograph, 16mm film grain, desaturated palette. San Francisco
rooftops seen from slightly above — Bernal Heights residential neighborhood. Thick
fog rolls across the scene, partially obscuring rooflines and power lines. Pre-dawn
light, flat and blue-grey. The composition feels like surveillance footage — distant,
static, uninhabited. No people visible. One rooftop antenna is barely visible through
the haze. The fog has weight and texture. 16:9.
```

---

## Workflow: Keyframe → LTX

1. **Generate keyframe** in Leonardo using character/location prompts above.
2. **Review** — does the character look right? Is the composition correct for the shot?
3. **Select best image** from the batch (generate 4, pick 1).
4. **Download** to the LTX host machine.
5. **Pass as `imagePath`** to LTX `/api/generate` for I2V animation.
6. **Write I2V prompt** describing only motion and temporal change (see LTX skill).

For character consistency across multiple shots:
- Save the approved keyframe's Leonardo image ID.
- Use it as a Content Reference (preprocessor 430) in subsequent generations.
- This anchors the character's appearance while allowing different poses and compositions.

---

## Contrast Setting

The `contrast` parameter matters for this show:

| Value | Effect | When to Use |
|-------|--------|-------------|
| 3 (Low) | Flatter, more film-like tonal range | City Breath, fog shots, anything that should feel desaturated and quiet |
| 3.5 (Medium) | Balanced | Default for most character keyframes |
| 4 (High) | More dramatic tonal separation | The Crack, emotional peaks, moments where the light itself is telling the story |

---

## Seed Strategy

Use `"seed": <integer>` for consistency when iterating on the same composition. Fix the seed while adjusting prompt language to isolate what's changing. Once you have the right prompt, release the seed (remove the parameter) to get variation in the batch.

For character consistency passes: save the seed of your best approved keyframe. Use it as a starting point when generating the same character in a new scene — it won't guarantee the same face, but it biases toward consistency.

---

## What Leonardo Does Well (for this show)

- Cinematic composition with naturalistic lighting
- Film-stock textures and grain via Kino XL and Film style
- Human subjects that look real, imperfect, and unposed (when prompted correctly)
- Architectural interiors with lived-in detail
- Fog and atmospheric effects in stills
- Batch generation (4 images) for selection

## What Leonardo Does Poorly (avoid or work around)

| Problem | Workaround |
|---------|------------|
| Characters looking too polished/beautiful | Explicitly prompt imperfections: "no makeup," "slightly disheveled," "not posed." Use Film style over Cinematic. |
| Hands | Frame around them when possible. Medium shots hide hand issues. |
| Consistent character across sessions | Use controlnet Content Reference from approved keyframes. Save image IDs. |
| Readable text in images | Don't attempt. Composite text in post. |
| Stop-motion / clay texture | Kino XL can approximate film texture but not clay/stop-motion. Use ComfyUI for mythology layer. |
| Specific real-world locations | Describe the qualities you want, not the specific address. "Bernal Heights residential rooftops" not "the view from 123 Anderson St." |
