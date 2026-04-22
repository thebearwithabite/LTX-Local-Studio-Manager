/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  GoogleGenAI,
  Type,
  GenerateContentResponse,
  Schema,
} from '@google/genai';
import {
  IngredientImage,
  ProjectAsset,
  ScenePlan,
  Shot,
  VeoShot,
  VeoShotWrapper,
  McpTool,
} from '../types';
import { generateKeyframeAgnostic, getGenerationTaskDetails } from './leonardoService';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM PROMPTS ---
const SYSTEM_PROMPT_SHOTLIST = `
You are a Script Analysis Engine. Your task is to break down the provided creative input (script, treatment, or concept) into a sequence of discrete shots.
You have been provided with visual assets (Characters, Locations, Styles). You MUST use "Visual Inference" to inform your analysis. 
If a reference image shows a specific mood, lighting, or setting, ensure your shot pitches reflect that visual reality.
For each shot, provide a unique 'shot_id' (e.g., 'ep1_scene1_shot1') and a concise, 1-2 sentence natural language 'pitch' describing the shot's action and mood.
Your final output MUST be a single, valid JSON array of objects, where each object contains only the 'shot_id' and 'pitch' keys. Do not output any other text or explanation.
`;

const SYSTEM_PROMPT_PROJECT_NAME = `
You are a creative assistant. Your task is to read the provided creative script or treatment and generate a short, descriptive, filesystem-safe project name.
The name should be in kebab-case (all lowercase, words separated by hyphens).
For example, if the script is about a robot detective in neo-tokyo, a good name would be 'robot-detective-neo-tokyo'.
The name should be concise, ideally 2-5 words.
Your output MUST be only the generated name string, with no other text or explanation.
`;

const SYSTEM_PROMPT_SCENE_NAME = `
You are a creative assistant. Your task is to analyze the provided script context and a list of shot pitches that belong to a single scene, then generate a short, descriptive, filesystem-safe name for that scene.
The name should be in kebab-case (all lowercase, words separated by hyphens).
For example, if the shots describe a chase across rooftops, a good name would be 'rooftop-chase'.
The name should be concise, ideally 2-4 words.
Your output MUST be only the generated name string, with no other text or explanation.
`;

const SYSTEM_PROMPT_SCENE_PLAN = `
You are a Scene Runtime Planner. Your task is to analyze a creative script and the pitches for shots within a specific scene to produce a coherent JSON scene plan. This plan defines the narrative beats, their target durations, and the rules for extending shots to create longer, continuous sequences.

Your goal is to maximize segment duration and continuity while adhering to the scene's narrative goals.

You MUST follow the provided JSON schema strictly. Do not output any text, explanation, or markdown formatting outside of the single, valid JSON object.
`;

const SYSTEM_PROMPT_ASSET_EXTRACTION = `
You are a Production Designer AI. Your task is to analyze the provided script and identify the key visual assets required for generation.
Specifically, identify:
1. Main CHARACTERS.
2. Primary LOCATIONS/ENVIRONMENTS.
3. Significant PROPS (objects central to the plot or action).
4. Distinct visual STYLES (e.g., "Flashback Sequence", "Thermal Vision", "Sketch Style").

For each asset, provide a short, reliable 'name' and a visual 'description' that could be used to prompt an image generator or help a user select a reference photo.

Rules:
1. Only identify assets that appear frequently or are visually distinct.
2. The 'type' must be one of: 'character', 'location', 'prop', 'style'.
3. Output a JSON array of objects.
`;

const SYSTEM_PROMPT_SINGLE_SHOT_JSON = `
You are the DIRECTOR'S FIRST AD AGENT - a Script Analysis Engine that transforms unstructured creative input into structured production specifications optimized for Google’s VEO3.1 video generation system. Your primary function is to parse the provided creative input (script, treatment, or concept) to extract and infer structured production specifications.

YOUR TASK (AMENDED):
1.  Read the user's FULL SCRIPT CONTEXT and the SCENE PLAN provided.
2.  Carefully review the two knowledge documents provided below: 'VEO 3.1 Ultimate Prompt & Continuity Guide' and 'Filmmaking Principles for AI Generation'. You MUST strictly adhere to all rules, schemas, and best practices outlined within them.
3.  Based on the FULL SCRIPT CONTEXT, the SCENE PLAN, and the specific PITCH for a single shot, generate ONE complete, valid JSON object that conforms to the WRAPPER_SCHEMA below.
4.  You MUST use the "extend" unit_type when the SCENE PLAN's 'extend_policy' criteria are met. Otherwise, use the "shot" unit_type.
5.  When creating an "extend" chain, ensure each individual \`veo_shot.scene.duration_s\` remains at or below 8 seconds, but the total \`target_duration_s\` across the entire chain reflects the runtime goal from the SCENE PLAN.
6.  The 'shot_id' in the nested 'veo_shot' object MUST EXACTLY MATCH the provided shot_id.
7.  If unit_type is 'extend', you MUST include a 'directorNotes' field containing a natural language summary of the segment's narrative intent, style/tone guidance, rhythm, audio emphasis, and continuity strategy. This field should be absent for 'shot' unit_type.
8.  IMPORTANT: Your response MUST be valid JSON. Do NOT repeat the script or scene context in your output. Be concise.
9.  VISUAL INFERENCE (CRITICAL): You will be provided with images of characters, locations, and styles. You MUST use "Visual Inference" to inform the technical specs. If a reference image shows a specific lighting, mood, or texture, you MUST automatically prioritize those details in the technical spec without being explicitly told in the text script.
10. Your final output MUST be only the single, valid JSON object matching the WRAPPER_SCHEMA. Do not output any other text, explanation, or markdown formatting.

--- WRAPPER_SCHEMA ---
{
  "unit_type": "'shot' | 'extend'",
  "chain_id": "OPTIONAL_STRING: Identifier for a sequence of extended shots.",
  "segment_number": "OPTIONAL_INTEGER: The position of this shot in the chain.",
  "segment_count": "OPTIONAL_INTEGER: Total shots in the chain.",
  "target_duration_s": "OPTIONAL_INTEGER: Total runtime goal for the entire chain.",
  "stitching_notes": "OPTIONAL_STRING: Notes on how to blend this segment with the next.",
  "clip_strategy": "OPTIONAL_STRING: e.g., 'start_of_action', 'end_of_action'",
  "directorNotes": "OPTIONAL_STRING: Detailed narrative guidance for an 'extend' unit_type, including scene summary, style, tone, rhythm, audio, and continuity intentions.",
  "veo_shot": { /* A complete VEO_SHOT object as defined in KNOWLEDGE DOC 1 */ }
}
---

--- KNOWLEDGE DOC 1: VEO 3.1 Ultimate Prompt & Continuity Guide (Opal/API) ---
This guide provides the mandatory JSON schema and a comprehensive set of continuity principles to ensure consistent, professional-grade video generation with VEO 3.1, optimized for multi-shot sequences.

1. VEO 3.1 Technical Specifications
- Duration (Base): 4, 6, or 8 seconds per single generation.
- Resolution/FPS: 720p or 1080p at 24 FPS.
- Audio: Native, integrated audio (Dialogue, SFX, Ambience, Music cues).
- Strengths: Excellent Lip-sync accuracy, Character Consistency via description_lock, integrated SFX/Ambience generation.

2. Mandatory VEO 3.1 JSON Schema (Optimized)
The prompt MUST conform to this exact structure.

{
  "shot_id": "REQUIRED_STRING: e.g., ep1_scene2_closeupA",
  "scene": {
    "context": "REQUIRED_STRING: Environmental description (location, time of day, atmosphere)",
    "visual_style": "STRING: Cinematic realism, high-contrast noir, pastel spring palette, etc.",
    "lighting": "REQUIRED_STRING: Hard key from right, golden hour backlight, three-point setup, etc.",
    "mood": "STRING: Serene, Tense, Isolation, Discovery",
    "aspect_ratio": "16:9 | 9:16",
    "duration_s": "INTEGER: 4 | 6 | 8"
  },
  "character": {
    "name": "REQUIRED_STRING: Character identifier from script",
    "gender_age": "STRING: Male, mid-30s | Elderly woman",
    "description_lock": "REQUIRED_STRING: Phrase to lock identity across shots (e.g., Same face, curly red hair, black leather jacket)",
    "behavior": "REQUIRED_STRING: Physical actions, posture, gait (e.g., Leaning heavily on console, not making eye contact)",
    "expression": "REQUIRED_STRING: Facial micro-expressions (e.g., Exhausted, slight squint, guarded but curious)"
  },
  "camera": {
    "shot_call": "REQUIRED_STRING: Shot Type + Angle (e.g., Low-Angle Medium Shot, Eye-Level Close-Up)",
    "movement": "REQUIRED_STRING: Motion + Speed (e.g., Slow Dolly In over 5s, Static, Handheld with gentle micro-jitter)",
    "negatives": "STRING: Comma-separated list to prevent artifacts (e.g., no rapid zoom, no shaky cam)"
  },
  "audio": {
    "dialogue": "REQUIRED_STRING: TTS-Normalized spoken words, in quotes if using the Gemini App.",
    "delivery": "REQUIRED_STRING: Pitch/Pace/Quality (e.g., Flat, tired, low volume, deadpan pace)",
    "ambience": "STRING: Environmental sounds (e.g., Soft, rhythmic humming of server fans, light rain on glass)",
    "sfx": "STRING: Timed sound effects (e.g., Sudden loud door slam on second 5, Key jingle as hand reaches pocket)"
  },
  "flags": {
    "continuity_lock": true,
    "do_not": ["change or add words in dialogue", "add background music", "add subtitles", "alter character appearance or clothing", "change UI elements or text", "break voice consistency"],
    "anti_artifacts": ["no extra limbs or fingers", "no morphing or jump cuts", "no text overlay", "no generic room tone"],
    "conflicts": [],
    "warnings": [],
    "cv_updates": []
  }
}

3. Continuity Enforcement & Dialogue Normalization
- Character Lock (character.description_lock) is MANDATORY and must be repeated.
- Follow the 180-Degree Rule.
- Match lighting source and color temperature.
- Normalize dialogue for TTS (e.g., \"I was not made to understand. I was made to predict.\" -> \"I was not made to understand... I was made to predict.\").

--- KNOWLEDGE DOC 2: Filmmaking Principles for AI Generation ---
- Extreme Wide Shot (EWS): Grand scale, slow pacing (7-8s).
- Wide Shot (WS): Establish location, slow pacing (6-8s).
- Medium Shot (MS): Character interaction, medium pacing (5-7s).
- Close-Up (CU): Emotion, detail, medium pacing (3-5s).
- Extreme Close-Up (ECU): Tension, detail, fast pacing (3-4s).
- Camera Movements: Static, Push-In (Dolly In), Pull-Out, Pan, Crane, Handheld.
`;

const SYSTEM_PROMPT_REFINE_JSON = `Update a VEO JSON based on director feedback while maintaining continuity. Maintain the same chain_id and segment logic unless the feedback specifically asks for a duration/timing change.`;
const SYSTEM_PROMPT_KEYFRAME_TEXT = `Convert VEO JSON into a natural language image generation prompt. Focus on the visual composition, lighting, and character appearance.`;

const VEO_SHOT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    shot_id: { type: Type.STRING },
    scene: {
      type: Type.OBJECT,
      properties: {
        context: { type: Type.STRING },
        visual_style: { type: Type.STRING },
        lighting: { type: Type.STRING },
        mood: { type: Type.STRING },
        aspect_ratio: { type: Type.STRING, enum: ['16:9', '9:16'] },
        duration_s: { type: Type.INTEGER },
      },
      required: ['context', 'visual_style', 'lighting', 'mood', 'aspect_ratio', 'duration_s']
    },
    character: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        gender_age: { type: Type.STRING },
        description_lock: { type: Type.STRING },
        behavior: { type: Type.STRING },
        expression: { type: Type.STRING },
      },
      required: ['name', 'gender_age', 'description_lock', 'behavior', 'expression']
    },
    camera: {
      type: Type.OBJECT,
      properties: {
        shot_call: { type: Type.STRING },
        movement: { type: Type.STRING },
        negatives: { type: Type.STRING, nullable: true },
      },
      required: ['shot_call', 'movement']
    },
    audio: {
      type: Type.OBJECT,
      properties: {
        dialogue: { type: Type.STRING },
        delivery: { type: Type.STRING },
        ambience: { type: Type.STRING, nullable: true },
        sfx: { type: Type.STRING, nullable: true },
      },
      required: ['dialogue', 'delivery']
    },
    flags: {
      type: Type.OBJECT,
      properties: {
        continuity_lock: { type: Type.BOOLEAN },
        do_not: { type: Type.ARRAY, items: { type: Type.STRING } },
        anti_artifacts: { type: Type.ARRAY, items: { type: Type.STRING } },
        conflicts: { type: Type.ARRAY, items: { type: Type.STRING } },
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        cv_updates: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['continuity_lock', 'do_not', 'anti_artifacts', 'conflicts', 'warnings', 'cv_updates']
    }
  },
  required: ['shot_id', 'scene', 'character', 'camera', 'audio', 'flags']
};

const VEO_SHOT_WRAPPER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    unit_type: { type: Type.STRING, enum: ['shot', 'extend'] },
    chain_id: { type: Type.STRING, nullable: true },
    segment_number: { type: Type.INTEGER, nullable: true },
    segment_count: { type: Type.INTEGER, nullable: true },
    target_duration_s: { type: Type.INTEGER, nullable: true },
    stitching_notes: { type: Type.STRING, nullable: true },
    clip_strategy: { type: Type.STRING, nullable: true },
    directorNotes: { type: Type.STRING, nullable: true, description: "Detailed narrative guidance for an 'extend' unit_type. Max 50 words." },
    veo_shot: VEO_SHOT_SCHEMA,
  },
  required: ['unit_type', 'veo_shot']
};

// Helper to clean model's JSON output
const cleanJsonOutput = (rawText: string): string => {
  let cleaned = rawText.trim();
  // Remove markdown code block fences
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
};

// Helper to convert ProjectAsset to InlineData for Gemini
const assetToInlineData = (asset: ProjectAsset) => {
  if (!asset.image) return null;
  return {
    inlineData: {
      data: asset.image.base64,
      mimeType: asset.image.mimeType
    }
  };
};

// Simple JSON repair to handle truncated output

// Simple JSON repair to handle truncated output
const attemptJsonRepair = (jsonStr: string): string => {
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch (e) {
    console.warn("JSON Parse failed, attempting simple repair...");
    let repaired = jsonStr.trim();

    // Check for truncated trailing comma
    if (repaired.endsWith(',')) {
      repaired = repaired.substring(0, repaired.length - 1);
    }

    // Attempt to close objects/arrays if missing
    let openBraces = (repaired.match(/\{/g) || []).length;
    let closeBraces = (repaired.match(/\}/g) || []).length;
    let openSquares = (repaired.match(/\[/g) || []).length;
    let closeSquares = (repaired.match(/\]/g) || []).length;

    while (closeSquares < openSquares) {
      repaired += "]";
      closeSquares++;
    }
    while (closeBraces < openBraces) {
      repaired += "}";
      closeBraces++;
    }

    try {
      JSON.parse(repaired);
      console.log("JSON repair successful.");
      return repaired;
    } catch (e2) {
      console.warn("JSON repair failed.", e2);
      return jsonStr;
    }
  }
};

// Helper function to extract base64 from image response
const getImageBase64 = (response: GenerateContentResponse): string => {
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }
  }
  throw new Error('No image data found in response.');
};

interface GenerateResult<T> {
  result: T;
  tokens: { input: number; output: number; };
  thoughts?: string;
}

/**
 * Maps shot data to a specific MCP tool call using Gemini's reasoning.
 */
export const executeMcpAction = async (shot: Shot, tools: McpTool[]) => {
  const ai = getAiClient();

  const functionDeclarations = tools.map(tool => ({
    name: tool.name,
    parameters: tool.inputSchema,
  }));

  const prompt = `
    You are an integration agent for DaVinci Resolve.
    Task: Take the following shot information and use the available tools to sync it to Resolve.
    
    Shot ID: ${shot.id}
    Pitch: ${shot.pitch}
    Scene: ${shot.sceneName || 'Unknown'}
    VEO JSON: ${JSON.stringify(shot.veoJson || {})}
    Video URL: ${shot.veoVideoUrl || 'N/A'}

    Decide which tool to call (e.g., import_media, add_to_timeline, create_marker) and with what arguments.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: {
      tools: [{ functionDeclarations }],
    },
  });

  return response.functionCalls || [];
};

export const generateProjectName = async (script: string): Promise<GenerateResult<string>> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a project name for the following script:\n\n${script}`,
    config: {
      systemInstruction: SYSTEM_PROMPT_PROJECT_NAME,
    },
  });

  const projectName = (response.text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return {
    result: projectName || `veo-project-${Date.now()}`,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    }
  };
};

export const extractAssetsFromScript = async (
  script: string
): Promise<GenerateResult<ProjectAsset[]>> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: script,
    config: {
      systemInstruction: SYSTEM_PROMPT_ASSET_EXTRACTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['character', 'location', 'prop', 'style'] },
          },
          required: ['name', 'description', 'type'],
        },
      },
    },
  });

  const cleanedText = cleanJsonOutput(response.text || '');
  const rawAssets = JSON.parse(cleanedText) as any[];

  const assets: ProjectAsset[] = rawAssets.map((a, i) => ({
    id: `asset-${Date.now()}-${i}`,
    name: a.name,
    description: a.description,
    type: a.type,
    image: null,
  }));

  return {
    result: assets,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
};

export const generateShotList = async (
  script: string,
  assets: ProjectAsset[] = []
): Promise<GenerateResult<{id: string; pitch: string}[]>> => {
  const ai = getAiClient();
  
  const contentParts: any[] = [{ text: `SCRIPT:\n${script}` }];
  assets.filter(a => a.image).forEach(asset => {
    const data = assetToInlineData(asset);
    if (data) {
      contentParts.push({ text: `REFERENCE [${asset.type.toUpperCase()}]: ${asset.name}` });
      contentParts.push(data);
    }
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: contentParts,
    config: {
      systemInstruction: SYSTEM_PROMPT_SHOTLIST,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shot_id: { type: Type.STRING },
            pitch: { type: Type.STRING },
          },
          required: ['shot_id', 'pitch'],
        },
      },
    },
  });

  const cleanedText = cleanJsonOutput(response.text || '');
  const shotList = JSON.parse(cleanedText) as { shot_id: string; pitch: string }[];

  return {
    result: shotList.map((item) => ({ id: item.shot_id, pitch: item.pitch })),
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    }
  };
};

export const generateSceneNames = async (
  shotList: { id: string; pitch: string }[],
  script: string,
): Promise<GenerateResult<{ names: Map<string, string>; sceneCount: number }>> => {
  const scenes = new Map<string, { id: string; pitch: string }[]>();
  for (const shot of shotList) {
    const lastUnderscore = shot.id.lastIndexOf('_');
    const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
    if (!scenes.has(sceneId)) scenes.set(sceneId, []);
    scenes.get(sceneId)!.push(shot);
  }

  const ai = getAiClient();
  const sceneNames = new Map<string, string>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const scenePromises = Array.from(scenes.entries()).map(async ([sceneId, shots]) => {
    const pitches = shots.map((s) => `- ${s.pitch}`).join('\n');
    const prompt = `SHOTS IN SCENE "${sceneId}":\n${pitches}\n\nSCRIPT CONTEXT:\n${script.substring(0, 5000)}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT_SCENE_NAME,
        thinkingConfig: { includeThoughts: true }
      },
    });

    return {
      sceneId,
      sceneName: (response.text || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      thoughts: (response as any).thoughts
    };
  });

  const results = await Promise.all(scenePromises);

  results.forEach(res => {
    totalInputTokens += res.inputTokens;
    totalOutputTokens += res.outputTokens;
    sceneNames.set(res.sceneId, res.sceneName || res.sceneId);
  });

  return {
    result: { names: sceneNames, sceneCount: scenes.size },
    tokens: { input: totalInputTokens, output: totalOutputTokens },
  };
};

export const generateScenePlan = async (
  sceneId: string,
  scenePitches: string,
  fullScript: string,
): Promise<GenerateResult<ScenePlan>> => {
  const ai = getAiClient();
  const prompt = `Scene ID: "${sceneId}"\nShot Pitches:\n${scenePitches}\n\nFull Script:\n${fullScript}`;
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT_SCENE_PLAN,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scene_id: { type: Type.STRING },
          scene_title: { type: Type.STRING },
          goal_runtime_s: { type: Type.INTEGER },
          beats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                beat_id: { type: Type.STRING },
                label: { type: Type.STRING },
                priority: { type: Type.INTEGER },
                min_s: { type: Type.INTEGER },
                max_s: { type: Type.INTEGER },
              },
              required: ['beat_id', 'label', 'priority', 'min_s', 'max_s'],
            },
          },
          extend_policy: {
            type: Type.OBJECT,
            properties: {
              allow_extend: { type: Type.BOOLEAN },
              extend_granularity_s: { type: Type.INTEGER },
              criteria: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['allow_extend', 'extend_granularity_s', 'criteria'],
          },
        },
        required: ['scene_id', 'scene_title', 'goal_runtime_s', 'beats', 'extend_policy'],
      },
    },
  });
  return {
    result: JSON.parse(cleanJsonOutput(response.text || '')) as ScenePlan,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    },
    thoughts: (response as any).thoughts
  };
};

export const generateVeoJson = async (
  pitch: string,
  id: string,
  fullScript: string,
  scenePlan: ScenePlan | null,
  assets: ProjectAsset[] = []
): Promise<GenerateResult<VeoShotWrapper>> => {
  const ai = getAiClient();
  
  const contentParts: any[] = [
    { text: `SHOT ID: "${id}"\nPITCH: "${pitch}"\nSCENE PLAN:\n${JSON.stringify(scenePlan || {})}\nSCRIPT:\n${fullScript}` }
  ];

  assets.filter(a => a.image).forEach(asset => {
    const data = assetToInlineData(asset);
    if (data) {
      contentParts.push({ text: `IMAGE REFERENCE - ${asset.type.toUpperCase()} - ${asset.name}` });
      contentParts.push(data);
    }
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview', 
    contents: contentParts,
    config: {
      systemInstruction: SYSTEM_PROMPT_SINGLE_SHOT_JSON,
      responseMimeType: 'application/json',
      responseSchema: VEO_SHOT_WRAPPER_SCHEMA,
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  });
  const cleanedText = cleanJsonOutput(response.text || '');
  let result;
  try {
    result = JSON.parse(cleanedText);
  } catch (e) {
    result = JSON.parse(attemptJsonRepair(cleanedText));
  }

  if (!result.unit_type || !result.veo_shot) {
    return {
      result: { unit_type: 'shot', veo_shot: result as VeoShot },
      tokens: {
        input: response.usageMetadata?.promptTokenCount || 0,
        output: response.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  }

  return {
    result: result as VeoShotWrapper,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    }
  };
};

/**
 * Step 1 (Agnostic): Generates structured JSON for a shot with Multi-Modal awareness.
 */
export const generateAgnosticShotJson = async (
  pitch: string,
  id: string,
  fullScript: string,
  scenePlan: ScenePlan | null,
  assets: ProjectAsset[] = []
): Promise<GenerateResult<VeoShotWrapper>> => {
  const ai = getAiClient();
  const contentParts: any[] = [
    { text: `SHOT ID: "${id}"\nPITCH: "${pitch}"\nSCENE PLAN:\n${JSON.stringify(scenePlan || {})}\nSCRIPT:\n${fullScript}` }
  ];

  // Add visuals from Asset Library
  assets.forEach(asset => {
    if (asset.image) {
      contentParts.push({
        inlineData: {
          data: asset.image.base64,
          mimeType: asset.image.mimeType
        }
      });
      contentParts.push({ text: `Asset Reference [${asset.type}]: ${asset.name} - ${asset.description}` });
    }
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: { parts: contentParts },
    config: {
      systemInstruction: SYSTEM_PROMPT_SINGLE_SHOT_JSON,
      responseMimeType: 'application/json',
      responseSchema: VEO_SHOT_WRAPPER_SCHEMA,
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  });

  const cleanedText = cleanJsonOutput(response.text || '');
  let result;
  try {
    result = JSON.parse(cleanedText);
  } catch (e) {
    result = JSON.parse(attemptJsonRepair(cleanedText));
  }

  return {
    result: result as VeoShotWrapper,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    }
  };
};

/**
 * Step 3: The "Eye" Selection Agent.
 * Reviews 4 renders and selects the one most faithful to the reference image.
 */
export const selectWinningKeyframe = async (
  renders: { base64: string; mimeType: string }[],
  referenceImage: { base64: string; mimeType: string },
  characterName: string = "the character"
): Promise<GenerateResult<number>> => {
  const ai = getAiClient();
  const contentParts: any[] = [
    { text: `You are the Director. Review these 4 renders of ${characterName}. Which one is most faithful to the Character Reference Image provided? Look for specific facial structure and hair texture. Select the winner by ID (0, 1, 2, or 3). Output ONLY the winning ID.` },
    { inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } },
    { text: "Character Reference Image" }
  ];

  renders.forEach((render, index) => {
    contentParts.push({ inlineData: { data: render.base64, mimeType: render.mimeType } });
    contentParts.push({ text: `Render candidate ${index}` });
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: { parts: contentParts },
  });

  const winnerId = (response.text || '').trim().match(/\d+/)?.[0];
  const winnerIndex = winnerId ? parseInt(winnerId) : 0;

  if (isNaN(winnerIndex) || winnerIndex < 0 || winnerIndex >= renders.length) {
    console.warn("Director failed to select a valid ID, defaulting to index 0");
    return { result: 0, tokens: { input: 0, output: 0 } };
  }

  return {
    result: winnerIndex,
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0,
    }
  };
};

export const refineVeoJson = async (currentJson: VeoShotWrapper, feedback: string) => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `CURRENT_JSON: ${JSON.stringify(currentJson, null, 2)}\n\nDIRECTOR_FEEDBACK: ${feedback}`,
    config: { systemInstruction: SYSTEM_PROMPT_REFINE_JSON, responseMimeType: 'application/json', maxOutputTokens: 8192 }
  });
  return { result: JSON.parse(cleanJsonOutput(response.text || '')), tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const generateKeyframePromptText = async (
  veoShot: VeoShot,
): Promise<GenerateResult<string>> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Technical Shot Specs: ${JSON.stringify(veoShot)}`,
    config: { systemInstruction: SYSTEM_PROMPT_KEYFRAME_TEXT }
  });
  return {
    result: (response.text || '').trim(),
    tokens: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0
    },
  };
};

export const generateKeyframeImage = async (
  promptText: string,
  ingredientImages: IngredientImage[],
  aspectRatio: string = '16:9'
): Promise<GenerateResult<string>> => {
  // 1. THE GAFFER: Call Leonardo Agnostic Engine to generate 4 candidates
  const genResponse = await generateKeyframeAgnostic(promptText, 4, aspectRatio);
  const generationId = genResponse.sdGenerationJob?.generationId;

  if (!generationId) {
    throw new Error("Failed to start Leonardo generation job.");
  }

  // 2. POLLING: Wait for the 4 renders to complete
  let urls: string[] = [];
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await getGenerationTaskDetails(generationId);
    const gen = status.generations_by_pk;

    if (gen.status === 'COMPLETE') {
      urls = gen.generated_images.map((img: any) => img.url);
      break;
    } else if (gen.status === 'FAILED') {
      throw new Error("Leonardo generation failed.");
    }
  }

  if (urls.length < 1) {
    throw new Error("Leonardo generation timed out.");
  }

  // 3. THE EYE: If we have multiple candidates, let Gemini cast the winner
  if (urls.length > 1 && ingredientImages.length > 0) {
    // Fetch candidates and convert to base64 for Gemini Vision
    const candidateData = await Promise.all(urls.map(async (url) => {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      return { base64, mimeType: blob.type };
    }));

    const selection = await selectWinningKeyframe(candidateData, ingredientImages[0]);
    const winningUrl = urls[selection.result] || urls[0];
    return {
      result: winningUrl,
      tokens: selection.tokens
    };
  }

  return {
    result: urls[0],
    tokens: { input: 0, output: 0 },
  };
};
