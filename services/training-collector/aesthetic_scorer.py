import os
import json
import time
import requests
from typing import List, Optional, Dict
from pydantic import BaseModel, ValidationError

# Configuration
OLLAMA_ENDPOINT = "http://100.103.210.101:11434/api/generate"
MODEL_NAME = "qwen3.5:9b"
DATA_DIR = "./data"
WORKSPACE_ROOT = "/Users/ryanthomson/Github/LTX-Local-Studio-Manager"
GRAY_AREA_DIR = os.path.join(WORKSPACE_ROOT, "services/antigravity_review/gray_area_queue")
TRASH_DIR = os.path.join(WORKSPACE_ROOT, "services/antigravity_review/trash")
CLEAN_SET_FILE = "clean_training_set.jsonl"
PROCESSED_LOG = "processed_files.json"
SLEEP_INTERVAL = 60 # Seconds between file scans
ANALYSIS_INTERVAL = 3600 # 1 hour between "Self-Reflection" cycles

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(GRAY_AREA_DIR, exist_ok=True)
os.makedirs(TRASH_DIR, exist_ok=True)

class ShotExtraction(BaseModel):
    id: str
    prompt: Optional[str] = "N/A"
    model_used: Optional[str] = "N/A"
    scene_context: Optional[str] = "N/A"
    raw_output: str

# System Prompt for the Aesthetic Judge
MAX_AESTHETICS = """You are MAX, the Director's Assistant. Your taste is impeccable, leaning towards 'Invisible Structure' and 'Withholding Information'.
You despise therapy-bot slop, over-explained narration, and generic AI video artifacts.

You will be given a raw text extraction from a filmmaking tutorial or AI prompt guide.
Score it from 0 to 10 based on its aesthetic and technical utility for training a world-class AI director.

SCORING RUBRIC:
0-4: TRASH. Generic advice, AI slop, or poorly formatted data.
5-7: GRAY AREA. Decent technical info but lacks 'soul' or is repetitive.
8-10: MASTERPIECE. High signal density, unique directorial judgment, or advanced technique.

RESPONSE FORMAT:
Your response must be a valid JSON object:
{
  "score": <int>,
  "reason": "<short explanation>"
}
"""

def load_processed():
    if os.path.exists(PROCESSED_LOG):
        try:
            with open(PROCESSED_LOG, "r") as f:
                return set(json.load(f))
        except:
            return set()
    return set()

def mark_processed(filename):
    processed = load_processed()
    processed.add(filename)
    with open(PROCESSED_LOG, "w") as f:
        json.dump(list(processed), f)

def analyze_dataset_gaps():
    print(f"\n[SELF-REFLECTION] Analyzing dataset for coverage gaps...")
    clean_file_path = os.path.join(WORKSPACE_ROOT, "services/Training Data", CLEAN_SET_FILE)
    
    if not os.path.exists(clean_file_path):
        return ["cinematography basics", "AI video prompt engineering", "lighting for drama"]
        
    try:
        samples = []
        with open(clean_file_path, "r") as f:
            lines = f.readlines()
            # Take a sample of the last 50 entries to see current trend
            for line in lines[-50:]:
                samples.append(json.loads(line).get("text", ""))
        
        context = "\n---\n".join(samples[:20]) # Limit context size
        
        prompt = f"""Review the following training data samples from my AI Director's Assistant dataset.
        Identify the top 3 dominant themes and, more importantly, identify 3 DISTINCT topics or technical gaps that are MISSING or underrepresented.
        
        Current Data Sample:
        {context}
        
        Respond ONLY with a JSON list of 3 search queries to find new training material.
        Example: ["advanced LTX lighting setups", "continuity in multi-shot sequences", "emotional pacing in edit"]
        """
        
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }
        
        response = requests.post(OLLAMA_ENDPOINT, json=payload)
        queries = json.loads(response.json()["response"])
        print(f"  Gap Analysis Complete. Suggested targets: {queries}")
        return queries
    except Exception as e:
        print(f"  Reflection failed: {e}")
        return ["advanced cinematography techniques", "film pacing and rhythm", "visual storytelling"]

def score_with_qwen(shot: ShotExtraction):
    payload = {
        "model": MODEL_NAME,
        "system": MAX_AESTHETICS,
        "prompt": f"Evaluate this raw extraction:\n\n{shot.raw_output}",
        "stream": False,
        "format": "json"
    }
    try:
        response = requests.post(OLLAMA_ENDPOINT, json=payload)
        response.raise_for_status()
        result = response.json()["response"]
        return json.loads(result)
    except Exception as e:
        print(f"Qwen inference failed: {e}")
        return {"score": 0, "reason": "inference_failure"}

def run_autonomous_loop():
    print(f"🐱⚡ Starting the DIRECTOR'S ASSISTANT Autonomous Loop (Model: {MODEL_NAME})")
    training_data_dir = os.path.join(WORKSPACE_ROOT, "services/Training Data")
    
    if not os.path.exists(training_data_dir):
        print(f"Directory not found: {training_data_dir}")
        return

    last_analysis_time = 0
    
    while True:
        try:
            # 1. Self-Reflection Cycle (Gaps -> Scraping)
            current_time = time.time()
            if current_time - last_analysis_time > ANALYSIS_INTERVAL:
                queries = analyze_dataset_gaps()
                # Trigger the Node.js scraper via API
                try:
                    requests.post("http://localhost:3000/api/curate/autonomous", json={"queries": queries})
                    print(f"  [SENT TO SCRAPER] {len(queries)} new targets dispatched.")
                except:
                    print("  [WARNING] Could not reach Collector Scraper API.")
                last_analysis_time = current_time

            # 2. Evaluation / Gatekeeper Cycle
            processed_files = load_processed()
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
                        
                        # Handle multiple JSON objects or array
                        try:
                            data = json.loads(content)
                        except:
                            # Try to wrap in list if it's multiple objects
                            fixed = f"[{content.replace('}{', '},{')}]"
                            data = json.loads(fixed)
                            
                        if isinstance(data, dict):
                            data = [data]
                            
                        for index, block in enumerate(data):
                            prompts = block.get("prompt_examples", []) or [block.get("instruction", "")]
                            if not prompts: continue
                                
                            for p_index, p in enumerate(prompts):
                                prompt_text = p.get("prompt_text", p) if isinstance(p, dict) else p
                                if not prompt_text: continue
                                    
                                shot_id = f"{filename}_{index}_{p_index}"
                                shot = ShotExtraction(
                                    id=shot_id,
                                    prompt="Evaluate Aesthetic",
                                    raw_output=str(prompt_text)
                                )
                                
                                result = score_with_qwen(shot)
                                score = result.get("score", 0)
                                reason = result.get("reason", "N/A")
                                print(f"    Shot {p_index}: Score {score}/10 | {reason[:60]}...")

                                # Routing
                                if 5 <= score <= 7:
                                    out = os.path.join(GRAY_AREA_DIR, f"gray_{shot_id}.json")
                                    with open(out, "w") as f: json.dump({"shot": shot.dict(), "score": score, "reason": reason}, f)
                                elif score >= 8:
                                    clean_file_path = os.path.join(training_data_dir, CLEAN_SET_FILE)
                                    with open(clean_file_path, "a") as f:
                                        f.write(json.dumps({"text": shot.raw_output, "score": score}) + "\n")
                                else:
                                    out = os.path.join(TRASH_DIR, f"trash_{shot_id}.json")
                                    with open(out, "w") as f: json.dump({"shot": shot.dict(), "score": score, "reason": reason}, f)
                                
                                time.sleep(0.5)
                        
                        mark_processed(filename)
                    except Exception as e:
                        print(f"  Error processing {filename}: {e}")
            else:
                print(".", end="", flush=True)
                
            time.sleep(SLEEP_INTERVAL)
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Loop error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    run_autonomous_loop()
