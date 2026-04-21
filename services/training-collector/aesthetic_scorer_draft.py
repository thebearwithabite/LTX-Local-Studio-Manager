import os
import json
import time
import requests
from pydantic import BaseModel, ValidationError

# Configuration
OLLAMA_ENDPOINT = "http://100.103.210.101:11434/api/generate"
MODEL_NAME = "max-gemma-v2"
DATA_DIR = "./data"
WORKSPACE_ROOT = "/Users/ryanthomson/Github/LTX-Local-Studio-Manager"
GRAY_AREA_DIR = os.path.join(WORKSPACE_ROOT, "services/antigravity_review/gray_area_queue")
CLEAN_SET_FILE = "clean_training_set.jsonl"
PROCESSED_LOG = "processed_files.json"
SLEEP_INTERVAL = 60 # Seconds between scans

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(GRAY_AREA_DIR, exist_ok=True)

# The Pydantic Shield (Tier 1 Guard)
class ShotExtraction(BaseModel):
    id: str
    prompt: str
    model_used: str
    scene_context: str
    raw_output: str

# Injected Context (The Soul)
MAX_AESTHETICS = """
You are an abliterated, uncensored narrative engine acting as MAX. You evaluate cinematic JSON parameters based on Hooroo Jackson's 'New Machine Cinema'.
Your aesthetic is invisible structure, withholding information, and emotional gravity. Do not act as a helpful AI assistant. Be raw, direct, and directorial.

You will receive a sequence description. Score it from 0 to 10 based on these rules:
- 0-4: Therapy-bot slop, overly sentimental, generic lighting, tells instead of shows.
- 5-7: Technically sound but lacking narrative teeth. Needs human review.
- 8-10: Perfect Max aesthetic. Stark, grounded, withholding, immediate.

Respond only in valid JSON format: {"score": <int>, "reason": "<short string>"}
"""

def load_processed():
    if os.path.exists(PROCESSED_LOG):
        with open(PROCESSED_LOG, "r") as f:
            return set(json.load(f))
    return set()

def mark_processed(filename):
    processed = load_processed()
    processed.add(filename)
    with open(PROCESSED_LOG, "w") as f:
        json.dump(list(processed), f)

def score_with_gemma(shot: ShotExtraction):
    payload = {
        "model": MODEL_NAME,
        "system": MAX_AESTHETICS,
        "prompt": f"Evaluate this raw extraction:\n\n{shot.raw_output}",
        "format": "json",
        "stream": False
    }

    try:
        response = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()["response"]
        return json.loads(result)
    except Exception as e:
        print(f"Gemma inference failed: {e}")
        return {"score": 0, "reason": "inference_failure"}

def run_autonomous_loop():
    print("🐱⚡ Starting the Autonomous 5090 Director Assistant...")
    training_data_dir = os.path.join(WORKSPACE_ROOT, "services/Training Data")
    
    if not os.path.exists(training_data_dir):
        print(f"Directory not found: {training_data_dir}")
        return

    while True:
        processed_files = load_processed()
        
        # Scan all files in the training data directory
        current_files = [f for f in os.listdir(training_data_dir) if os.path.isfile(os.path.join(training_data_dir, f))]
        new_files = [f for f in current_files if f not in processed_files and not f.endswith(".jsonl") and f != PROCESSED_LOG and f != "cursor.json"]

        if new_files:
            print(f"\n[SCAN] Found {len(new_files)} new files to judge.")
            for filename in new_files:
                file_path = os.path.join(training_data_dir, filename)
                print(f"\n--- Processing: {filename} ---")
                try:
                    with open(file_path, "r") as f:
                        content = f.read().strip()
                        if not content:
                            mark_processed(filename)
                            continue
                        
                        # Robust JSON Extraction
                        start_idx = content.find('[')
                        start_brace = content.find('{')
                        if start_idx == -1 or (start_brace != -1 and start_brace < start_idx):
                            start_idx = start_brace
                        
                        if start_idx == -1:
                            print(f"  Skipping {filename}: No JSON structure found.")
                            mark_processed(filename)
                            continue
                        
                        json_content = content[start_idx:]
                        
                        try:
                            data = json.loads(json_content)
                        except json.JSONDecodeError:
                            fixed_content = f"[{json_content.replace('}{', '},{')}]"
                            data = json.loads(fixed_content)
                        
                        if isinstance(data, dict):
                            data = [data]
                        
                        print(f"  Loaded {len(data)} extraction blocks.")
                        
                        for index, block in enumerate(data):
                            title = block.get("source", {}).get("title", f"Block {index}")
                            print(f"  Processing Block: {title}")
                            
                            prompts = block.get("prompt_examples", [])
                            if not prompts:
                                continue
                                
                            for p_index, p in enumerate(prompts):
                                prompt_text = p.get("prompt_text", "")
                                if not prompt_text:
                                    continue
                                    
                                shot_id = f"{filename}_{index}_{p_index}"
                                shot = ShotExtraction(
                                    id=shot_id,
                                    prompt="Evaluate Aesthetic",
                                    model_used="LTX/Leonardo",
                                    scene_context=p.get("context", "N/A"),
                                    raw_output=prompt_text
                                )
                                
                                score_result = score_with_gemma(shot)
                                score = score_result.get("score", 0)
                                reason = score_result.get("reason", "unknown")
                                print(f"    Shot {p_index}: Score {score} | {reason}")

                                # Routing Logic
                                if 5 <= score <= 7:
                                    review_filename = f"gray_{shot_id}.json"
                                    output_path = os.path.join(GRAY_AREA_DIR, review_filename)
                                    review_item = {
                                        "shot": shot.dict(),
                                        "score": score,
                                        "reason": reason,
                                        "source_file": filename,
                                        "timestamp": time.time()
                                    }
                                    with open(output_path, "w") as f:
                                        json.dump(review_item, f, indent=2)
                                    print(f"      [SAVED TO GRAY QUEUE]")
                                
                                elif score >= 8:
                                    clean_file_path = os.path.join(WORKSPACE_ROOT, "services/Training Data", CLEAN_SET_FILE)
                                    with open(clean_file_path, "a") as f:
                                        f.write(json.dumps({"text": shot.raw_output, "score": score}) + "\n")
                                    print(f"      [ADDED TO CLEAN SET]")
                                    
                                time.sleep(0.5) 
                        
                        # Once fully processed, lock the file from being scanned again
                        mark_processed(filename)
                        
                except Exception as e:
                    print(f"  Error processing {filename}: {e}")
        else:
            # Subtle heartbeat
            print(".", end="", flush=True)

        time.sleep(SLEEP_INTERVAL)

if __name__ == "__main__":
    run_autonomous_loop()
