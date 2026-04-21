import os
import time
import json
import urllib.request
import urllib.error
import mimetypes
import uuid

API_KEY = os.environ.get("LEONARDO_API_KEY", "c138385f-1927-40d5-bf82-fc7373eac7b4")

HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}"
}

endpoint = "https://cloud.leonardo.ai/api/rest/v2/generations"
payload = {
    "model": "flux-pro-2.0",
    "parameters": {
        "width": 1920,
        "height": 1080,
        "prompt": "Test",
        "quantity": 1,
        "guidances": {
            "image_reference": [
                {
                    "image": {"id": "4c6964b6-c9fc-4620-9c9f-b36bb56b8e0b", "type": "GENERATED"},
                    "strength": "MID"
                },
                {
                    "image": {"id": "4c6964b6-c9fc-4620-9c9f-b36bb56b8e0b", "type": "GENERATED"},
                    "strength": "LOW"
                },
                {
                    "image": {"id": "4c6964b6-c9fc-4620-9c9f-b36bb56b8e0b", "type": "GENERATED"},
                    "strength": "LOW"
                },
                {
                    "image": {"id": "4c6964b6-c9fc-4620-9c9f-b36bb56b8e0b", "type": "GENERATED"},
                    "strength": "LOW"
                },
            ]
        }
    },
    "public": False
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(endpoint, data=data, headers=HEADERS, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} {e.reason}")
    print(f"Response body: {e.read().decode('utf-8')}")
