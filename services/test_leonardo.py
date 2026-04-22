import requests
import json
from pprint import pprint
import os
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv("LEONARDO_API_KEY")

HEADERS = {"accept": "application/json", "content-type": "application/json", "authorization": "Bearer " + API_KEY}

def test_v2(model, style, quantity):
    body = {"model": model, "parameters": {
        "width": 1376, "height": 768, "prompt": "test prompt",
        "quantity": quantity, "style_ids": [style], "prompt_enhance": "OFF"},
        "public": False}
    # remove style if None
    if not style:
        del body["parameters"]["style_ids"]
        
    r = requests.post("https://cloud.leonardo.ai/api/rest/v2/generations", headers=HEADERS, json=body)
    data = r.json()
    is_err = isinstance(data, list)
    print(f"Model {model} | Style: {style} | Qty: {quantity} -> {'ERR' if is_err else 'OK'}")

test_v2("flux-pro-2.0", "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436", 1)  # Flux with Cinematic Qty 1
test_v2("flux-pro-2.0", None, 1)                                    # Flux NO style Qty 1
test_v2("flux-pro-2.0", None, 2)                                    # Flux NO style Qty 2

test_v2("seedream-4.5", "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436", 1)  # Seedream Cinematic Qty 1
test_v2("seedream-4.5", "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436", 2)  # Seedream Cinematic Qty 2
test_v2("seedream-4.5", "85da2dcc-c373-464c-9a7a-5624359be859", 2)  # Seedream FILM Qty 2
test_v2("seedream-4.5", "621e1c9a-6319-4bee-a12d-ae40659162fa", 2)  # Seedream MOODY Qty 2

