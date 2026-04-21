"""
Emergence — Batch Keyframe Generator via Leonardo API
Multi-model: Flux Pro 2.0 (V2), Seedream 4.5 (V2), Lucid Origin (V1)

Usage:
  python  emergence_keygen.py                         # run all
  python emergence_keygen.py --models flux seedream   # only specific models
  python emergence_keygen.py --start-from 5           # resume from prompt 5
"""

import requests, time, json, argparse
from pathlib import Path

API_KEY = "c138385f-1927-40d5-bf82-fc7373eac7b4"
V1_URL = "https://cloud.leonardo.ai/api/rest/v1/generations"
V2_URL = "https://cloud.leonardo.ai/api/rest/v2/generations"

FILM = "85da2dcc-c373-464c-9a7a-5624359be859"
CINEMATIC = "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436"
MOODY = "621e1c9a-6319-4bee-a12d-ae40659162fa"

HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}",
}

PROMPTS = [
    {"name": "kitchen_wide_morning", "style": FILM, "models": ["flux", "seedream", "lucid"],
     "prompt": "Cinematic interior photograph, 16mm film grain texture. A lived-in San Francisco Victorian kitchen with heavy wooden table, teal-blue vintage cabinets, vintage gas stove, mismatched chairs, open laptop and molecular model sculpture on table. Large bay windows show thick fog outside diffusing cool white light. Warm Edison pendant lights overhead. Cluttered counters with coffee equipment books plants. The space feels inhabited not decorated. Muted warm palette with cool window light counterpoint. Wide shot, 16:9"},
    {"name": "kitchen_island_closeup", "style": CINEMATIC, "models": ["lucid", "seedream"],
     "prompt": "Cinematic close-up photograph, wooden kitchen table surface, open laptop showing dark terminal interface with green text, molecular ball-and-stick model sculpture beside it, coffee mug half empty, scattered papers and a worn book, warm pendant light overhead casting pool of amber light, background kitchen soft focus with teal cabinets and fog through windows, 16mm film grain, warm intimate tones, shallow depth of field"},
    {"name": "kitchen_window_anomaly", "style": MOODY, "models": ["seedream", "flux"],
     "prompt": "Cinematic photograph through large Victorian bay windows from inside kitchen, San Francisco skyline view that is impossible and glitchy, buildings morphing and overlapping, Bay Bridge and Golden Gate visible simultaneously from impossible angles, fog behaving like digital static and pixel drift, oversaturated dreamy colors bleeding into each other, chrono-spatial anomaly zone, the view is unstable beautiful and wrong, kitchen sink and plants on windowsill in sharp focus foreground, 16mm grain"},
    {"name": "kitchen_den_transition", "style": FILM, "models": ["flux", "lucid"],
     "prompt": "Cinematic wide shot, Victorian San Francisco interior, kitchen with teal cabinets and wooden table transitioning into cozy den area, worn leather couch with sleeping Australian Shepherd dog curled up, stone fireplace with warm ember glow, built-in bookshelves overflowing, the two spaces flow together as one lived-in room, morning fog light through large windows, warm practical Edison pendant lighting, 16mm film grain, naturalistic, the room of someone who lives between worlds"},
    {"name": "kitchen_front_door", "style": FILM, "models": ["flux", "lucid"],
     "prompt": "Cinematic photograph, Victorian San Francisco house interior, view from kitchen toward front hallway entrance, narrow hallway with worn hardwood floors, front door with frosted glass sidelights, morning fog light filtering through creating soft glow, coats hanging on hooks by door, the threshold between private world and street, warm interior kitchen light contrasting with cool fog light from door, 16mm grain, anticipation of someone arriving"},
    {"name": "kitchen_session_drain", "style": MOODY, "models": ["seedream", "lucid"],
     "prompt": "Cinematic photograph, Victorian kitchen losing warmth, laptop screen glow becoming dominant light source in the room, shadows deepening in corners and behind shelves, fog outside windows thicker and darker now, man silhouetted against screen glow leaning forward into blue-white light, digital grain creeping into shadows, chromatic aberration at frame edges, the same warm room from morning but something has drained out of it, imperfect blacks, 16mm film texture"},
    {"name": "ryan_at_table", "style": CINEMATIC, "models": ["lucid", "flux"],
     "prompt": "Cinematic film still, 16mm grain texture. A man in his early 40s sits at a heavy wooden kitchen table. Worn dark henley shirt, no effort made, stubble. He is mid-thought not posed, one hand rests near an open laptop the other holds a ceramic mug. His expression is distracted intelligent slightly exhausted, looking at nothing not at camera. Natural window light from left diffused by fog outside creating soft flat illumination. Shallow depth of field face in focus kitchen behind softly blurred. Lived-in space with books and plants. 16:9"},
    {"name": "lena_doorway", "style": CINEMATIC, "models": ["lucid", "flux", "seedream"],
     "prompt": "Cinematic film still, 16mm grain. Young Latina woman mid-20s standing in Victorian doorway, backlit by thick white fog pouring in from outside. Oversized vintage jacket over layered clothing, messenger bag strap across chest. Her style is unfinished intentional but not curated. She is mid-sentence one hand gesturing slightly. Expression nervous but trying to appear composed, arrived before she decided how to arrive. Interior behind camera warm-toned, exterior behind her cool and overexposed from fog. Shallow focus background blown out. 16:9"},
    {"name": "lena_seated", "style": FILM, "models": ["lucid", "seedream"],
     "prompt": "Cinematic medium shot, young Latina woman mid-20s seated at wooden kitchen table across from an open laptop, leaning slightly forward with hands animated mid-gesture explaining something she cares about, oversized vintage jacket pushed up at sleeves, small gold hoop earring catching light, the energy of someone filling space preemptively, warm kitchen background with teal cabinets out of focus, afternoon light shifting, 16mm film grain, shallow focus on her face"},
    {"name": "dan_morning", "style": FILM, "models": ["lucid", "flux"],
     "prompt": "Cinematic film still, warm interior light. Middle Eastern man mid-50s standing in kitchen pouring coffee from a french press. Salt-and-pepper stubble, strong features softened by age into something better than youth. Visible clay dust on one forearm and edge of his simple linen shirt. His posture relaxed unhurried. Not looking at camera, attention on coffee or something out of frame. Body language says I love you but I am not going to chase you today. Warm practical lighting. Casual caught-moment composition. Shallow depth of field. 16:9"},
    {"name": "ryan_lena_two_shot", "style": CINEMATIC, "models": ["flux", "lucid"],
     "prompt": "Cinematic wide two-shot photograph, man early 40s in dark henley and young Latina woman mid-20s in vintage jacket sitting across from each other at heavy wooden kitchen table, laptop open between them with molecular model sculpture beside it, large bay windows behind them showing foggy San Francisco skyline, Australian Shepherd sleeping on worn couch visible in background right, the composition of an intimate conversation that is also a professional session, warm fading afternoon light, 16mm grain, 16:9"},
    {"name": "city_breath_predawn", "style": MOODY, "models": ["flux", "seedream"],
     "prompt": "Cinematic landscape photograph, 16mm film grain, desaturated palette. San Francisco Bernal Heights rooftops seen from slightly above, thick fog rolling across scene partially obscuring rooflines and power lines, pre-dawn light flat and blue-grey, the composition feels like surveillance footage distant static uninhabited, no people visible, one rooftop antenna barely visible through haze, the fog has weight and texture, quiet and unresolved, not a cinematic postcard, 16:9"},
    {"name": "city_breath_bus", "style": MOODY, "models": ["flux", "seedream"],
     "prompt": "Cinematic photograph, San Francisco street daytime fog, city bus passing through frame left to right, no passengers visible through bus windows, windows reflecting the street back with buildings doubled and inverted in the glass, the bus is a system in motion carrying nothing, shot from across the street at a distance slightly too far away like accidental surveillance, muted desaturated color, 16mm film grain, urban emptiness, 16:9"},
    {"name": "city_breath_dusk", "style": MOODY, "models": ["flux", "seedream"],
     "prompt": "Cinematic landscape, San Francisco rooftops at dusk, fog much thicker now, structures losing their edges and dissolving upward into grey-white, buildings that were solid at dawn are suggestions now, no people no movement except atmospheric drift, a system that processed something and is still settling, same residential rooftops as dawn but with less conviction, film grain, cool palette shifting toward dark, the last usable light before everything goes, 16:9"},
    {"name": "fence_mythology", "style": MOODY, "models": ["seedream", "lucid"],
     "prompt": "Cinematic photograph with stop-motion tactile quality, chain-link fence at dusk, dry ground, suburban edges barely visible in background, the light is wrong with amber and cold blue coexisting in same frame neither winning, faint visual distortion passing through the metal like static electricity made visible, small clay bear figure standing on one side with physical weight and handmade texture, on other side a humanoid form that flickers at its edges not fully resolved, the fence hums with energy, physically real but categorically incorrect, not fantasy not sci-fi just wrong, 16mm grain"},
    {"name": "lena_fog_walk", "style": MOODY, "models": ["flux", "seedream"],
     "prompt": "Cinematic wide shot from distance, young woman walking through pre-dawn San Francisco fog, seen from behind in three-quarter profile, phone screen casting faint glow on her face as she checks an address, Victorian houses dissolving in fog around her, she is part of the environment before she is a character, surveillance camera framing at distance, the fog does not care about her, oversized jacket silhouette, 16mm film grain, muted blue-grey palette, 16:9"},
]

MODEL_MAP = {
    "flux": ("flux-pro-2.0", "v2"),
    "seedream": ("seedream-4.5", "v2"),
    "lucid": ("7b592283-e8a7-4c5a-9ba6-d18c31f258b9", "v1"),
}

def gen_v1(prompt, model_id, style, num=4):
    body = {"modelId": model_id, "prompt": prompt, "contrast": 3.5,
            "height": 1080, "width": 1920, "num_images": num,
            "styleUUID": style, "alchemy": False, "ultra": False}
    r = requests.post(V1_URL, headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()["sdGenerationJob"]["generationId"]

def gen_v2(prompt, model_name, style, num=2):
    body = {"model": model_name, "parameters": {
        "width": 1376, "height": 768, "prompt": prompt,
        "quantity": num, "prompt_enhance": "OFF"},
        "public": False}
    
    # FLUX PRO 2.0 does not support style_ids at all (it will crash)
    # Also, the UUIDs for FILM and MOODY provided are invalid for Seedream
    if model_name != "flux-pro-2.0" and style in [CINEMATIC]:
        body["parameters"]["style_ids"] = [style]
        
    r = requests.post(V2_URL, headers=HEADERS, json=body)
    
    # Check if we got an error array back from V2 (often 200 OK but body is an error list)
    try:
        data = r.json()
        if isinstance(data, list) and "extensions" in data[0]:
            raise RuntimeError(f"API VALIDATION ERROR: {data[0]['extensions']}")
    except ValueError:
        pass
        
    r.raise_for_status()
    return data.get("sdGenerationJob", data.get("generate", {}))["generationId"]

def poll(gen_id, max_wait=180):
    for _ in range(max_wait // 5):
        time.sleep(5)
        r = requests.get(f"{V1_URL}/{gen_id}", headers=HEADERS)
        r.raise_for_status()
        g = r.json()["generations_by_pk"]
        if g["status"] == "COMPLETE":
            return [img["url"] for img in g["generated_images"]]
        elif g["status"] == "FAILED":
            raise RuntimeError(f"FAILED: {gen_id}")
    raise TimeoutError(f"TIMEOUT: {gen_id}")

def dl(url, path):
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    with open(path, "wb") as f: f.write(r.content)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", default="./emergence_keyframes")
    ap.add_argument("--start-from", type=int, default=0)
    ap.add_argument("--models", nargs="*")
    a = ap.parse_args()
    out = Path(a.output_dir); out.mkdir(parents=True, exist_ok=True)
    manifest = {"generated": []}; total = 0

    for i, p in enumerate(PROMPTS):
        if i < a.start_from: continue
        models = [m for m in p["models"] if not a.models or m in a.models]
        if not models: continue
        print(f"\n{'='*60}\n[{i+1}/{len(PROMPTS)}] {p['name']} -> {', '.join(models)}")

        for mk in models:
            mid, ver = MODEL_MAP[mk]
            tag = f"{p['name']}__{mk}"
            print(f"  >> {mk}...", end=" ", flush=True)
            try:
                gid = gen_v1(p["prompt"], mid, p["style"]) if ver == "v1" else gen_v2(p["prompt"], mid, p["style"])
                print(f"[{gid[:8]}] polling...", end="", flush=True)
                urls = poll(gid)
                print(f" {len(urls)} imgs!")
                d = out / p["name"]; d.mkdir(exist_ok=True)
                paths = []
                for j, u in enumerate(urls):
                    fp = d / f"{tag}_{j+1}.jpg"; dl(u, fp); paths.append(str(fp))
                manifest["generated"].append({"name": p["name"], "model": mk, "gen_id": gid, "paths": paths})
                total += 1
            except Exception as e:
                print(f" ERROR: {e}")
                manifest["generated"].append({"name": p["name"], "model": mk, "error": str(e)})
            time.sleep(2)

    with open(out / "manifest.json", "w") as f: json.dump(manifest, f, indent=2)
    print(f"\n{'='*60}\nDONE. {total} generations. Output: {out.resolve()}")

if __name__ == "__main__":
    main()