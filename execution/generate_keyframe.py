import os
import requests
import json
import time
import base64
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image
import io

load_dotenv()

# API Configuration
LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY")
GOOGLE_API_KEY = os.getenv("API_KEY")

genai.configure(api_key=GOOGLE_API_KEY)

# Model IDs
MODELS = {
    "architecture": "flux-pro-2.0",
    "character": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9", # Lucid Origin (V1)
    "mood": "seedream-4.5",
    "interior": "05ce0082-2d80-4a2d-8653-4d1c85e2418e" # Lucid Realism (V1)
}

# Leonardo Endpoints
V1_URL = "https://cloud.leonardo.ai/api/rest/v1/generations"
V2_URL = "https://cloud.leonardo.ai/api/rest/v2/generations"
UPLOAD_URL = "https://cloud.leonardo.ai/api/rest/v1/init-image"

HEADERS = {
    "Authorization": f"Bearer {LEONARDO_API_KEY}",
    "Content-Type": "application/json",
    "accept": "application/json"
}

def upload_image(image_path):
    """Uploads a local image to Leonardo and returns the initImageId."""
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return None

    filename = os.path.basename(image_path)
    extension = filename.split('.')[-1].lower()
    
    # 1. Get presigned URL
    payload = {"extension": extension}
    res = requests.post(UPLOAD_URL, json=payload, headers=HEADERS)
    data = res.json().get("uploadInitImage")
    
    if not data:
        print("Failed to get upload URL:", res.text)
        return None

    image_id = data.get("id")
    url = data.get("url")
    fields = json.loads(data.get("fields"))
    
    # 2. Upload to S3/Leonardo Storage
    with open(image_path, 'rb') as f:
        files = {'file': f}
        upload_res = requests.post(url, data=fields, files=files)
        if upload_res.status_code != 204:
            print("Failed to upload image content:", upload_res.text)
            return None
            
    return image_id

def generate_batch(prompt, model_type, character_ref_path=None, location_ref_path=None):
    """Generates 4 candidate images using the appropriate Leonardo API version."""
    model_id = MODELS.get(model_type, MODELS["character"])
    is_v2 = model_id in ["flux-pro-2.0", "seedream-4.5"]
    
    char_id = upload_image(character_ref_path) if character_ref_path else None
    loc_id = upload_image(location_ref_path) if location_ref_path else None

    if is_v2:
        # V2 Logic
        guidances = []
        if char_id:
            guidances.append({"image": {"id": char_id, "type": "UPLOADED"}, "strength": "HIGH"})
        if loc_id:
            guidances.append({"image": {"id": loc_id, "type": "UPLOADED"}, "strength": "MID"})

        payload = {
            "model": model_id,
            "parameters": {
                "prompt": prompt,
                "quantity": 4,
                "width": 1376,
                "height": 768,
                "guidances": {"image_reference": guidances} if guidances else None
            },
            "public": False
        }
        url = V2_URL
    else:
        # V1 Logic (Lucid Origin)
        controlnets = []
        if char_id:
            controlnets.append({
                "initImageId": char_id,
                "initImageType": "UPLOADED",
                "preprocessorId": 133, # Character Reference
                "strengthType": "High"
            })
        if loc_id:
            controlnets.append({
                "initImageId": loc_id,
                "initImageType": "UPLOADED",
                "preprocessorId": 430, # Content Reference
                "strengthType": "Mid"
            })

        payload = {
            "modelId": model_id,
            "prompt": prompt,
            "num_images": 4,
            "width": 1024,
            "height": 768,
            "controlnets": controlnets if controlnets else None
        }
        url = V1_URL

    res = requests.post(url, json=payload, headers=HEADERS)
    if res.status_code != 200:
        print(f"Generation request failed: {res.text}")
        return None
        
    generation_id = res.json().get("sdGenerationJob", {}).get("generationId")
    if not generation_id:
        # V2 returns slightly differently sometimes
        generation_id = res.json().get("generationId")
        
    return generation_id

def wait_for_generation(generation_id):
    """Polls the generation status until completion."""
    status_url = f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}"
    while True:
        res = requests.get(status_url, headers=HEADERS)
        data = res.json().get("generations_by_pk")
        if data and data.get("status") == "COMPLETE":
            return [img.get("url") for img in data.get("generated_images")]
        elif data and data.get("status") == "FAILED":
            print("Generation failed in Leonardo.")
            return None
        print("Waiting for Leonardo...")
        time.sleep(5)

def select_winner(candidates, reference_img_path, original_prompt):
    """The 'Eye' agent: Uses Gemini Vision to pick the best candidate."""
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    # Download candidates locally for analysis
    local_candidates = []
    tmp_dir = Path(".tmp/candidates")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    
    for i, url in enumerate(candidates):
        img_res = requests.get(url)
        path = tmp_dir / f"candidate_{i}.png"
        with open(path, "wb") as f:
            f.write(img_res.content)
        local_candidates.append(path)

    # Prepare Gemini Vision prompt
    input_images = []
    if reference_img_path and os.path.exists(reference_img_path):
        input_images.append(Image.open(reference_img_path))
        ref_text = "IMAGE 0 is the Character Reference Library image."
    else:
        ref_text = "No character reference provided."

    for path in local_candidates:
        input_images.append(Image.open(path))

    prompt = f"""
    You are the Director. Review these 4 generated candidates (Images 1 through 4).
    {ref_text}
    The original prompt was: "{original_prompt}"

    CHALLENGE: 
    1. Likeness: Which image preserves the character's facial structure and hair from the reference best?
    2. Directorial Intent: Which image best captures the lighting and mood described in the prompt?

    Select the index of the absolute winner (1, 2, 3, or 4).
    Your response MUST be ONLY the single digit of the winning index.
    """

    response = model.generate_content([prompt] + input_images)
    try:
        winner_idx = int(response.text.strip()) - 1
        print(f"Gemini selected candidate {winner_idx + 1}")
        return local_candidates[winner_idx]
    except Exception as e:
        print(f"Selection agent failed to return a clean index: {response.text}")
        return local_candidates[0] # Default to first

def run_pipeline(prompt, model_type, project_path, shot_id, char_ref=None, loc_ref=None):
    """End-to-end pipeline implementation."""
    print(f"Starting keyframe pipeline for shot {shot_id}...")
    
    gen_id = generate_batch(prompt, model_type, char_ref, loc_ref)
    if not gen_id: return None
    
    urls = wait_for_generation(gen_id)
    if not urls: return None
    
    winner_path = select_winner(urls, char_ref, prompt)
    
    # Save to final location
    final_dir = Path(project_path) / "keyframes"
    final_dir.mkdir(parents=True, exist_ok=True)
    final_path = final_dir / f"{shot_id}.png"
    
    with open(winner_path, "rb") as src, open(final_path, "wb") as dst:
        dst.write(src.read())
        
    print(f"Done! Winner saved to {final_path}")
    return str(final_path)

if __name__ == "__main__":
    # Test block
    pass
