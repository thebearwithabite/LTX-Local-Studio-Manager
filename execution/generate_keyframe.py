import os
import sys
import json
import requests
import time
import uuid
import mimetypes

# API Configuration
API_KEY = os.environ.get("LEONARDO_API_KEY", "c138385f-1927-40d5-bf82-fc7373eac7b4")
HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}"
}

# Model UUIDs
MODELS = {
    "FLUX_PRO_2": "flux-pro-2.0",
    "LUCID_ORIGIN": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",
    "SEEDREAM_4_5": "seedream-4.5"
}

# ControlNet / Guidance IDs
GUIDANCE_IDS = {
    "CHARACTER": 133,
    "CONTENT": 430
}

def upload_image(file_path):
    """Uploads an image to Leonardo and returns the image ID."""
    print(f"Uploading {os.path.basename(file_path)}...")
    url = "https://cloud.leonardo.ai/api/rest/v1/init-image"
    payload = {"extension": os.path.splitext(file_path)[1][1:] or "jpg"}
    
    r = requests.post(url, headers=HEADERS, json=payload)
    if r.status_code != 200:
        print(f"Failed to get upload slot: {r.text}")
        return None
        
    data = r.json()["uploadInitImage"]
    fields = json.loads(data["fields"])
    upload_url = data["url"]
    image_id = data["id"]
    
    with open(file_path, 'rb') as f:
        files = {'file': f}
        r_upload = requests.post(upload_url, data=fields, files=files)
        
    if r_upload.status_code != 204:
        print(f"Upload failed: {r_upload.status_code}")
        return None
        
    return image_id

def select_model(prompt, pitch):
    """Agnostic Routing Logic."""
    p = (prompt + " " + pitch).lower()
    
    # Character-driven beats
    if any(k in p for k in ["character", "face", "portrait", "person", "expression", "lena", "ryan", "dan", "man", "woman"]):
        return MODELS["LUCID_ORIGIN"]
    
    # Atmospheric/Mood-driven beats
    if any(k in p for k in ["atmospheric", "mood", "fog", "city breath", "dusk", "dawn", "haze", "mist"]):
        return MODELS["SEEDREAM_4_5"]
    
    # Default to Flux Pro 2.0 for location/architecture
    return MODELS["FLUX_PRO_2"]

def generate_keyframes(shot_data, asset_images):
    """Submits a generation job to Leonardo."""
    prompt = shot_data.get("prompt", "")
    pitch = shot_data.get("pitch", "")
    model_id = select_model(prompt, pitch)
    
    print(f"Selected model {model_id} for shot {shot_data.get('id', 'unknown')}")
    
    guidances = []
    for asset in asset_images:
        image_id = upload_image(asset["path"])
        if image_id:
            g_id = GUIDANCE_IDS["CHARACTER"] if asset["type"] == "character" else GUIDANCE_IDS["CONTENT"]
            guidances.append({
                "image_id": image_id,
                "guidance_setting_id": g_id,
                "strength": 0.8
            })

    payload = {
        "model": model_id,
        "parameters": {
            "prompt": prompt,
            "quantity": 4, # 4 candidates
            "width": 1920,
            "height": 1080,
            "guidances": guidances
        },
        "public": False
    }
    
    url = "https://cloud.leonardo.ai/api/rest/v2/generations"
    r = requests.post(url, headers=HEADERS, json=payload)
    
    if r.status_code == 200:
        gen_id = r.json().get("sdGenerationJob", {}).get("generationId")
        print(f"Generation submitted! Job ID: {gen_id}")
        return gen_id
    else:
        print(f"Generation failed: {r.text}")
        return None

if __name__ == "__main__":
    # Example usage for testing
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
            generate_keyframes(data["shot"], data["assets"])
