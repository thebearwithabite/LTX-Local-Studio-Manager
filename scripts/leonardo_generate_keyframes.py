import os
import time
import json
import urllib.request
import urllib.error
import mimetypes
import uuid

# Leonardo API Key - provided in the skill document
API_KEY = os.environ.get("LEONARDO_API_KEY", "c138385f-1927-40d5-bf82-fc7373eac7b4")

HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "authorization": f"Bearer {API_KEY}"
}

def upload_image_to_leonardo(image_file_path):
    print(f"Uploading {image_file_path.split('/')[-1]}...")
    url = "https://cloud.leonardo.ai/api/rest/v1/init-image"
    payload = {"extension": "jpg"}

    init_req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(init_req) as response:
            init_response_data = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"Init image failed: {e.code} {e.read().decode('utf-8')}")
        exit(1)

    fields = json.loads(init_response_data['uploadInitImage']['fields'])
    upload_url = init_response_data['uploadInitImage']['url']
    image_id = init_response_data['uploadInitImage']['id']

    boundary = uuid.uuid4().hex
    upload_headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
    body = []

    for key, value in fields.items():
        body.extend([
            f'--{boundary}'.encode('utf-8'),
            f'Content-Disposition: form-data; name="{key}"'.encode('utf-8'),
            b'',
            str(value).encode('utf-8')
        ])

    with open(image_file_path, 'rb') as f:
        file_content = f.read()

    mime_type = mimetypes.guess_type(image_file_path)[0] or 'application/octet-stream'
    body.extend([
        f'--{boundary}'.encode('utf-8'),
        f'Content-Disposition: form-data; name="file"; filename="image.jpg"'.encode('utf-8'),
        f'Content-Type: {mime_type}'.encode('utf-8'),
        b'',
        file_content,
        f'--{boundary}--'.encode('utf-8'),
        b''
    ])

    upload_body = b'\r\n'.join(body)

    upload_req = urllib.request.Request(upload_url, data=upload_body, headers=upload_headers, method='POST')
    try:
        with urllib.request.urlopen(upload_req) as response:
            pass # uploaded successfully
    except urllib.error.HTTPError as e:
        print(f"Upload image failed: {e.code} {e.read().decode('utf-8')}")
        exit(1)
        
    return image_id

print("Uploading reference images...")
image_path_1 = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/430c9f1e-1a4f-4182-89dc-515878f18592.jpeg" #view1
image_id_1 = upload_image_to_leonardo(image_path_1)

image_path_2 = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/425070483_39_1.jpg" #view2
image_id_2 = upload_image_to_leonardo(image_path_2)

image_path_3 = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/danref.webp" #dan
image_id_3 = upload_image_to_leonardo(image_path_3)

image_path_5  = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Lena reference (1).jpg" #lena
image_id_5 = upload_image_to_leonardo(image_path_5)

image_path_4  = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/flux-pro-2.0_Cinematic_exterior_photograph_35mm_film_stock._A_shingled_San_Francisco_hillside-0.jpg" #Ext
image_id_4 = upload_image_to_leonardo(image_path_4)

image_path_6  = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/flux-pro-2.0_Cinematic_exterior_photograph_35mm_film_stock._A_shingled_San_Francisco_hillside-0.jpg" #Ext
image_id_6 = upload_image_to_leonardo(image_path_6)

image_path_7 = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/Fin-082bdacf-a8b0-42a5-b1c0-7c38fd147de9.jpeg" #Kit
image_id_7 = upload_image_to_leonardo(image_path_7)

image_path_8 = "/Users/ryanthomson/Library/Mobile Documents/com~apple~CloudDocs/Alignment Clinic - KEyframes/seedream-4.5_San_Francisco_Bernal_Heights_rooftops_at_dusk_seen_from_an_upper_floor_window._D-1.jpg" #Kitdusk
image_id_8 = upload_image_to_leonardo(image_path_8)


print("Uploads complete.\n")

# The requested list of 22 keyframe generations set to quantity/num_images = 4
shots = [
    {
        "id": "1.1",
        "name": "Golden Hour Kitchen, Wide",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["111dc692-d470-4eec-b791-3475abac4c46"],  # Dynamic style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic interior photograph, 35mm film stock. A San Francisco kitchen in the Bernal Heights neighborhood (North slope, expansive city and bay views) with mid-century modern architecture. Upper cabinets in warm honey walnut with flat-panel doors and minimal brass pulls. Lower cabinets painted sage green. Laminate countertops in terra cotta with a Charlie Harper subway tile backsplash. A large, heavy butcher-block kitchen table in the center of the room, scarred and oil-stained from years of use. Mismatched chairs — one walnut Eames shell, one painted metal stool in red. The dominant feature: Jaw dropping corner-wrapping windows with original detailing filling the entire far wall, wood-framed, showing a slightly impossible and glitched San Francisco skyline, rooftops cascading downhill, the Bay Bridge visible in golden hour light, but also the coit tower. A foot on the right wall leads to a large cedar exterior deck. Milk-glass globe pendant lights on walnut stems hang from a ceiling with exposed dark walnut beams against white beadboard. Open walnut shelving holds earth-toned ceramics, cookbooks, potted herbs. A vintage Persian kilim rug on dark walnut hardwood floors. A molecular model sits on the table next to an open laptop. The space is warm, lived-in, layered — not renovated, accumulated. Eclectic.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_1,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                },
                {
                    "image": {
                    "id": "%s" % image_id_2,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                },
                {
                    "image": {
                    "id": "%s" % image_id_7,
                    "type": "UPLOADED"
                    },
                    "strength": "HIGH"
                }
            ]
        }
    },
    {
        "id": "10.3",
        "name": "The House",
        "api": "v2",
        "model": "seedream-4.5",  # Seadream
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic 35mm film photograph, highly detailed exterior view. A shingled San Francisco hillside home at golden hour, preserving the specific street-level perspective and distant city background seen in image_0.png. Cedar shake siding, weathered silver-grey. On the ground floor, the sage-green front door now features a graceful, minimalist, slim terracotta bar pull, scaled down to a functional, realistic size. From the street below, a sequence of narrow, weathered cedar wood steps has been integrated into the existing terraced landscaping, leading seamlessly up from the pavement to the new, lower concrete landing pad. Large wood-framed windows on the upper level glow with the exact amber light and globe lamps from image_0.png. The terraced hillside is dense with its existing succulents and native plants, which now border the new stairs. The expansive city view, descending rooftops, and the distant Bay Bridge in the haze remain visible. The sky is an intense orange-to-steel-blue gradient. The perspective slightly reveals a simple, dark metal coping or trim running along the top edge of the upper floor (indicating the roofline), while maintaining the street view. 16:9, shot on Kodak Portra 400H.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_6,
                    "type": "UPLOADED"
                    },
                    "strength": "HIGH"
                }
            ]
        }
    },
    {
        "id": "10.4",
        "name": "The House",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic interior photograph, 35mm film stock. A San Francisco kitchen in the Bernal Heights neighborhood (North slope, expansive city and bay views) with mid-century modern architecture. Upper cabinets in warm honey walnut with flat-panel doors and minimal brass pulls. Lower cabinets painted sage green. Laminate countertops in terra cotta with a Charlie Harper subway tile backsplash. A large, heavy butcher-block kitchen table in the center of the room, scarred and oil-stained from years of use. Mismatched chairs — one walnut Eames shell, one painted metal stool in red. The dominant feature: massive corner-wrapping windows with original detailing filling the entire far wall, wood-framed, showing a slightly impossible and glitched San Francisco skyline, rooftops cascading downhill, the Bay Bridge visible in golden hour light, but also the coit tower. A foot on the right wall leads to a large cedar exterior deck. Milk-glass globe pendant lights on walnut stems hang from a ceiling with exposed dark walnut beams against white beadboard. Open walnut shelving holds earth-toned ceramics, cookbooks, potted herbs. A vintage Persian kilim rug on dark walnut hardwood floors. A molecular model sits on the table next to an open laptop. The space is warm, lived-in, layered — not renovated, accumulated. Eclectic.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_7,
                    "type": "UPLOADED"
                    },
                    "strength": "HIGH"
                }
            ]
        }
    },
        {
        "id": "6.2",
        "name": "The View FROM the Window, Exterior",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic photograph of the San Francisco panorama as seen from inside a hilltop house.  ugh large wood-framed window panes — the walnut mullions create a grid overlaying the view. The city cascades downhill, Victorian and Edwardian rooftops in pastel colors, downtown skyline with Salesforce Tower and Transamerica Pyramid in the middle distance, the Bay Bridge stretching to the East Bay on the right. Fog threads between buildings at mid-level, the bay visible beyond. Golden hour light paints everything warm. On the windowsill in the foreground, slightly out of focus: a small potted herb, a handmade ceramic cup, a brass compass. The window glass has slight imperfections — old glass, the view gently wavy. 16:9 wide.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_7,
                    "type": "UPLOADED"
                    },
                    "strength": "MID",
                    "image": {
                    "id": "%s" % image_id_6,
                    "type": "UPLOADED"
                    },
                    "strength": "LOW"   
                }
            ]
        }
    },
        {
        "id": "4.1",
        "name": "Rilke on the Couch, Watching",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic film still, 35mm, shallow depth of field. A black labrador dog lies on a worn MCM couch in a warm walnut kitchen. The dog is medium-large, dark coat with grey muzzle showing age. Settled into the cushions but head up, eyes watching something across the room. A hand-knitted blanket in deep indigo bunched around him. Behind the couch: warm walnut cabinets, a vintage kilim on dark hardwood, the edge of massive wood-framed windows showing foggy city. Globe pendant lights glow warm in the background, soft. The leather of the couch is broken in, patinated, the dog's territory for years. His expression is alert, present, knowing. 16:9, dog in the right third.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_7,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                }
            ]
        }
    },
    {
        "id": "10.5",
        "name": "Dan Character Portrait",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": 'Dan, Age 65, Unique Character Portrait: A detailed, close-up portrait photograph of a distinguished man, 65 years old, capturing an individual who is not a known billionaire. This man has a unique and individual face, distinct from anyone else, featuring a full, textured salt-and-pepper beard, thoughtful deep-set brown eyes, and prominent laugh lines. He is wearing classic, tortoise-shell, round-framed glasses. His hair is a unique, natural salt-and-pepper, slightly long and curly, with a clean and dignified style that is less "Destroyer band" and more "thoughtful academic." He is wearing a dark navy blue, textured wool knit sweater over a faded black t-shirt, giving a refined but accessible appearance. The background is a clean, seamless, all-white studio. The lighting is soft and natural. 3:4 vertical portrait.',
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_3,
                    "type": "UPLOADED"
                    },
                    "strength": "LOW"
                }
            ]
        }
    },
        {
        "id": "1.2",
        "name": "Morning Fog Kitchen, Wide",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["621e1c9a-6319-4bee-a12d-ae40659162fa"],  # Moody style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic interior photograph, 16mm film grain. San Francisco kitchen at dawn, thick fog pressing against massive wood-framed windows that wrap the corner of the room. The fog is so thick only ghost-shapes of rooftops are visible. Interior dimly lit — milk-glass globe pendants glowing warm above a heavy wooden table. Warm walnut upper cabinets catch the ambient light. Sage-green lower cabinets in shadow. Terrazzo countertops reflect the blue-grey fog light. A laptop open on the table, screen glow on the wood surface. A worn Persian kilim on dark floors. A black dog shape curled on a couch against the far wall, nearly invisible. Exposed walnut ceiling beams above white beadboard. The mood is 5 AM, private, fog-wrapped. The kitchen feels like it's floating above the city. 16:9 wide shot.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_7,
                    "type": "UPLOADED"
                    },
                    "strength": "LOW"
                },
                {
                    "image": {
                    "id": "%s" % image_id_8,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                }
            ]
        }
    },
        {
        "id": "8.1",
        "name": "Night Kitchen, Laptop Glow",
        "api": "v2",
        "model": "seedream-4.5",  # Seedream 4.5
        "style_ids": ["621e1c9a-6319-4bee-a12d-ae40659162fa"],  # Moody style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic phtograph of a walnut kitchen at night, two light sources: a laptop screen and globe pendants turned low. A man sits alone at a heavy butcher-block table, face lit by blue-white laptop glow. Code visible on screen. His expression is focused, past productive into obsessive. The warm walnut kitchen is in deep shadow — cabinets barely visible, the patterned tile backsplash catching a glint. The massive corner windows show city lights through fog instead of daylight, scattered amber dots in grey. Globe pendants are dimmed to a whisper of warm light. Terrazzo counters reflect laptop blue. A cold coffee in a handmade ceramic mug. A molecular model casting long shadows. On the leather couch in the darkness, two pinpoints of reflected light — the dog's eyes, watching. A vintage kilim on the floor absorbs the darkness. 16:9.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_8,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                }
            ]
        }
        },
        {
        "id": "10.1",
        "name": "Through the Reeded Glass: Ryan Working",
        "api": "v1",
        "modelId": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",  # Lucid Origin
        "styleUUID": "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436",  # Cinematic style
        "contrast": 3.5,
        "width": 1920,
        "height": 1080,
        "alchemy": False,
        "prompt": "Cinematic film still shot through a reeded glass door. The textured glass creates vertical distortion — the kitchen beyond is visible but warped, dreamlike. Through the glass: the warm shape of globe pendant lights, the blurred form of a person seated at a table, the soft glow of a laptop screen, the vague shape of walnut cabinets. The colors bleed through — warm amber, the blue of laptop light, the dark shape of the table. On this side of the glass: sharp focus on the walnut door frame, brass handle, the edge of a dark hallway. A sliver of vintage kilim visible on the floor through the gap where the door is slightly open. 16:9.",
    },
    {
        "id": "10.2",
        "name": "The Deck at Dusk, Looking In",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic exterior photograph from a deck at dusk, looking through glass doors into a warm kitchen. The deck is weathered wood, a potted plant, the city skyline behind the camera reflected faintly in the glass. Through the doors: the warm walnut kitchen is fully lit — globe pendants glowing, the heavy table visible with a molecular model and laptop, two figures seated across from each other in conversation. The kitchen is warm amber. The deck and exterior are cool blue-grey dusk. The glass door creates the boundary between two worlds — warm domestic interior, cool vast exterior. The figures inside are readable but separated by the glass. 16:9.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_6,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                }
            ]
        }
    },
    {
        "id": "1.3",
        "name": "Kitchen from Deck Entrance, Lena's POV",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Cinematic photograph from a doorway looking into a kitchen. Camera positioned at a glass deck door with a walnut frame, looking in. The door has a reeded glass panel — the interior is visible but softened through the textured glass. Through the glass: warm walnut kitchen, globe pendant lights, a figure seated at a heavy table backlit by massive corner windows showing city rooftops. The deck door is ajar, the reeded glass partially open. Late afternoon light. The kitchen beyond is layered — sage-green lower cabinets, terrazzo counters, open shelving with earth-toned ceramics. A vintage kilim on dark hardwood. The doorway creates a threshold — stepping from outside into someone's world. 16:9 composition with strong depth.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_3,
                    "type": "UPLOADED"
                    },
                    "strength": "LOW"
                }
            ]
        }
    },
    {
        "id": "2.2",
        "name": "Two People at the Table, Medium Wide",
        "api": "v1",
        "modelId": "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",  # Lucid Origin
        "styleUUID": "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436",  # Cinematic style
        "contrast": 3.5,
        "width": 1920,
        "height": 1080,
        "alchemy": False,
        "prompt": "Cinematic film still, 35mm. Two people sit across from each other at a heavy butcher-block table. A man in his early 40s on the left, dark henley, unshaved, leaning forward. A young woman in her mid-20s on the right, oversized vintage jacket, laptop open. Between them: a molecular model, handmade ceramic mugs, scattered papers. They are mid-conversation, engaged, slight tension. Behind them: massive wood-framed windows wrapping the corner, showing San Francisco fog and rooftops and the Bay Bridge. Warm walnut cabinets above, sage-green below. Milk-glass globe pendants glow warm. A vintage kilim on dark hardwood. A black dog on a worn leather couch in the background, watching. Terrazzo counter edge visible. The room is warm wood and layered materials — not styled, lived in. Medium-wide, 16:9.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_5,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                },
                {
                    "image": {
                    "id": "%s" % image_id_3,
                    "type": "UPLOADED"
                    },
                    "strength": "LOW"
                }
            ]
        }
    },

    {
        "id": "10.6",
        "name": "Lena",
        "api": "v2",
        "model": "flux-pro-2.0",  # Flux Pro 2.0
        "style_ids": ["85da2dcc-c373-464c-9a7a-5624359be859"],  # Film style
        "width": 1920,
        "height": 1080,
        "prompt": "Lena - South Asian Early 20s, Cool Demeanor: A candid, high-resolution portrait photograph of a South Asian woman in her early 20s, capturing her unique and individual face, defined by her likeness from image_36.png, preserving her cool, not-trying-too-hard demeanor. Lena has warm, shoulder-length, dark brown curly hair and deep-set eyes, with her distinct features and unique expression accurately rendered. She is standing with a relaxed, natural posture, looking slightly off-camera with an effortless, confident gaze. She is wearing a relaxed, olive-green cotton chore coat over a vintage, faded black graphic t-shirt and wide-leg dark denim jeans, with a few minimal silver rings and a single layered necklace. Her look is natural and unique. The background is a perfectly seamless, pure white studio, ensuring she is fully isolated. The lighting is soft and even. The entire focus is on Lena, positioned in a full-body shot. 3:4 vertical portrait.",
        "guidances": {
            "image_reference": [
                {
                    "image": {
                    "id": "%s" % image_id_5,
                    "type": "UPLOADED"
                    },
                    "strength": "MID"
                }
            ]
        }
    }
]

def make_request(url, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTPError: {e.code} {e.reason}")
        error_body = e.read().decode('utf-8')
        print(f"Response body: {error_body}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def submit_generations():
    results = []
    
    print(f"Starting {len(shots)} generation jobs with 2 images each...")
    for idx, shot in enumerate(shots, 2):
        print(f"[{idx}/{len(shots)}] Submitting {shot['id']}: {shot['name']}")
        
        payload = {}
        endpoint = ""
        
        if shot["api"] == "v1":
            endpoint = "https://cloud.leonardo.ai/api/rest/v1/generations"
            payload = {
                "modelId": shot["modelId"],
                "prompt": shot["prompt"],
                "contrast": shot.get("contrast", 3.5),
                "height": shot["height"],
                "width": shot["width"],
                "num_images": 3,
                "styleUUID": shot["styleUUID"],
                "alchemy": shot.get("alchemy", False)
            }
        else:
            endpoint = "https://cloud.leonardo.ai/api/rest/v2/generations"
            payload = {
                "model": shot["model"],
                "parameters": {
                    "width": shot["width"],
                    "height": shot["height"],
                    "prompt": shot["prompt"],
                    "quantity": 3
                },
                "public": False
            }
            if "guidances" in shot:
                payload["parameters"]["guidances"] = shot["guidances"]
        
        response = make_request(endpoint, payload)
        if response is not None:
            gen_id = None
            if isinstance(response, dict):
                # V1 structure
                gen_id = response.get("sdGenerationJob", {}).get("generationId")
                # V2 fallback structure
                if not gen_id and "sdGenerationJob" in response and response.get("sdGenerationJob"):
                    gen_id = response["sdGenerationJob"].get("generationId")
                if not gen_id and "generationId" in response:
                    gen_id = response.get("generationId")
                # V2 nested structure
                if not gen_id and "generate" in response:
                    gen_id = response["generate"].get("generationId")
            elif isinstance(response, list) and len(response) > 0:
                print(f"List response: {response}")
                gen_id = response.get("generationId") if hasattr(response, "get") else None # Actually list doesn't have get. So we handle properly
            
            # Print raw response to debug this:
            # print(f"Raw response: {response}")
            if isinstance(response, dict) and "sdGenerationJob" in response:
                gen_id = response["sdGenerationJob"].get("generationId")
            elif isinstance(response, dict) and "sdGenerationJob" in response.get("data", {}):
                gen_id = response["data"]["sdGenerationJob"].get("generationId")
            elif isinstance(response, dict) and "generate" in response:
                gen_id = response["generate"].get("generationId")
                
            # If standard get fails, we attempt to get from dictionary
            if isinstance(response, dict):
                if response.get("sdGenerationJob"):
                     gen_id = response["sdGenerationJob"].get("generationId")
                     
            if not gen_id:
                gen_id = str(response) # fallback to just dumping the whole thing so the manifest saves it
                
            print(f"   -> Success. Generation response logged.")
            results.append({
                "id": shot["id"],
                "name": shot["name"],
                "generationId": gen_id
            })
        else:
            print(f"   -> Failed!")
            
        time.sleep(1)
        
    with open("generation_manifest.json", "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"\\nAll jobs submitted. Wrote manifest with Generation IDs to generation_manifest.json")
    print("You can check Leonardo.ai or fetch outputs later.")

if __name__ == "__main__":
    submit_generations()
