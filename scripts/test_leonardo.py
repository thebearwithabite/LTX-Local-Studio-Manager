import json
import urllib.request
import urllib.error
from dotenv import load_dotenv
load_dotenv()


API_KEY = "LEONARDO_API_KEY"

HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}"
}

# Get Ryan's likeness from image_32.png
payload = {
    "model": "flux-pro-2.0",
    "parameters":    {
        "width": 1920,
        "height": 1080,
        "prompt": "Ryan, Age 45, STANDALONE Character Portrait: A detailed, high-resolution portrait photograph of a man, approximately 45 years old, capturing his unique and individual face, which is NOT A KNOWN BILLIONAIRE. This portrait isolates Ryan in a clean, professional ALL-WHITE STUDIO VOID, ensuring he is fully separate from any environment, with soft, directional lighting that creates definition but no distraction. Ryan retains his specific likeness from image_32.png, featuring a 'less lean' facial structure, thick, curly salt-and-pepper 'Kevin Morby type' hair, neatly trimmed salt-and-pepper beard, and thoughtful, deep-set brown eyes. He is wearing his tortoise-shell glasses, a rustic dark olive-green button-down shirt over a faded black t-shirt, and dark denim jeans. His expression is natural, accessible, and confident, looking directly into the camera with a small smile. His posture is relaxed, with his hands casually at his sides.",
        "quantity": 1
    },
    "public": False
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request("https://cloud.leonardo.ai/api/rest/v2/generations", data=data, headers=HEADERS, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} {e.reason}")
    print(f"Response body: {e.read().decode('utf-8')}")
