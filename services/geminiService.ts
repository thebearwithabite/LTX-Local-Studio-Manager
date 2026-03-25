
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import {
  IngredientImage,
  ProjectAsset,
  ScenePlan,
  Shot,
  VeoShot,
  VeoShotWrapper,
  McpTool,
} from '../types';

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM PROMPTS ---
const SYSTEM_PROMPT_PROJECT_NAME = `You are a creative assistant. Generate a short, filesystem-safe kebab-case project name. Output ONLY the string.`;
const SYSTEM_PROMPT_SHOTLIST = `Break the script into discrete shots. Output a JSON array of {shot_id, pitch}.`;
const SYSTEM_PROMPT_SCENE_NAMES = `Generate kebab-case names for scenes. Output JSON mapping IDs to names.`;
const SYSTEM_PROMPT_SCENE_PLAN = `Generate a JSON scene plan defining narrative beats and extension policies.`;
const SYSTEM_PROMPT_ASSET_EXTRACTION = `Identify characters, locations, props, and styles from the script. Output JSON array.`;

const SYSTEM_PROMPT_SINGLE_SHOT_JSON = `
You are the Director's First AD and VEO 3.1 Technical Expert. 
Your goal is to generate a PRODUCTION-READY JSON for a specific shot.

VEO 3.1 LOGIC RULES:
1. duration_s: MUST be exactly 4, 6, or 8.
2. unit_type: 
   - 'shot': For a new, standalone clip.
   - 'extend': For clips that MUST continue the action of a previous segment.
3. SEGMENTATION & CHAINS:
   - If a shot pitch implies a long action (e.g., 12 seconds), use a chain.
   - Set 'segment_count' to the total number of clips needed (e.g., 3 clips of 4s).
   - Set 'segment_number' to the current index (1-based).
   - Set 'chain_id' to a unique string shared by all segments in this specific action sequence.
   - CRITICAL: Each segment's 'duration_s' (4, 6, or 8) is for THAT segment only. Do NOT output a 4s total duration for a 3-segment chain unless the intention is 1.3s per clip (which is invalid).
4. CONTINUITY:
   - Use 'description_lock' to provide a consistent visual "anchor" description of characters.
   - Ensure 'visual_style' is identical across all shots in a scene.
5. CAMERA: Use specific shot calls (e.g., 'Close-up', 'Wide Shot', 'Low Angle').

Output ONLY valid JSON matching the VeoShotWrapper schema.
`;

const SYSTEM_PROMPT_REFINE_JSON = `Update a VEO JSON based on director feedback while maintaining continuity. Maintain the same chain_id and segment logic unless the feedback specifically asks for a duration/timing change.`;
const SYSTEM_PROMPT_KEYFRAME_TEXT = `Convert VEO JSON into a natural language image generation prompt. Focus on the visual composition, lighting, and character appearance.`;

/**
 * Maps shot data to a specific MCP tool call using Gemini's reasoning.
 */
export const executeMcpAction = async (shot: Shot, tools: McpTool[]) => {
  const ai = getAiClient();
  
  const functionDeclarations: FunctionDeclaration[] = tools.map(tool => ({
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
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      tools: [{ functionDeclarations }],
    },
  });

  return response.functionCalls || [];
};

export const generateProjectName = async (script: string) => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: script,
    config: { systemInstruction: SYSTEM_PROMPT_PROJECT_NAME, temperature: 0.7 },
  });
  return {
    result: (response.text || '').trim() || 'untitled-project',
    tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 },
  };
};

export const generateShotList = async (script: string) => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: script,
    config: {
      systemInstruction: SYSTEM_PROMPT_SHOTLIST,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { shot_id: { type: Type.STRING }, pitch: { type: Type.STRING } },
          required: ['shot_id', 'pitch'],
        },
      },
    },
  });
  const text = response.text || '[]';
  let result: any[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
       result = parsed.map((item: any) => ({
           id: item.shot_id,
           pitch: item.pitch,
           shot_id: item.shot_id
       })).filter(item => (item.id || '') && (item.pitch || ''));
    }
  } catch (e) { console.error(e); }
  return {
    result,
    tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 },
  };
};

export const generateSceneNames = async (shotList: {id: string}[], script: string) => {
    const ai = getAiClient();
    const sceneGroups = new Map<string, string[]>();
    shotList.forEach(shot => {
         if (!shot.id) return;
         const lastUnderscore = shot.id.lastIndexOf('_');
         const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
         sceneGroups.set(sceneId, []);
    });
    const sceneIds = Array.from(sceneGroups.keys());
    const prompt = `List of Scene IDs: ${JSON.stringify(sceneIds)}\n\nScript Context: ${script.substring(0, 5000)}...`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: `Map Scene IDs to kebab-case names. Output JSON.`,
            responseMimeType: 'application/json',
            responseSchema: {
               type: Type.OBJECT,
               properties: sceneIds.reduce((acc, id) => ({...acc, [id]: { type: Type.STRING }}), {})
            }
        }
    });
    let names = new Map<string, string>();
    try {
        const json = JSON.parse(response.text || '{}');
        Object.entries(json).forEach(([k, v]) => names.set(k, v as string));
    } catch(e) { sceneIds.forEach(id => names.set(id, id)); }
    return {
        result: { names, sceneCount: sceneIds.length },
        tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 }
    }
};

export const generateScenePlan = async (sceneId: string, scenePitches: string, script: string) => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Scene ID: ${sceneId}\n\nShot Pitches:\n${scenePitches}\n\nFull Script:\n${script}`,
        config: {
            systemInstruction: SYSTEM_PROMPT_SCENE_PLAN,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    scene_id: { type: Type.STRING },
                    scene_title: { type: Type.STRING },
                    goal_runtime_s: { type: Type.INTEGER },
                    beats: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { beat_id: { type: Type.STRING }, label: { type: Type.STRING }, priority: { type: Type.NUMBER }, min_s: { type: Type.NUMBER }, max_s: { type: Type.NUMBER } }, required: ['beat_id', 'label', 'priority', 'min_s', 'max_s'] } },
                    extend_policy: { type: Type.OBJECT, properties: { allow_extend: { type: Type.BOOLEAN }, extend_granularity_s: { type: Type.NUMBER }, criteria: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['allow_extend', 'extend_granularity_s', 'criteria'] }
                },
                required: ['scene_id', 'scene_title', 'goal_runtime_s', 'beats', 'extend_policy']
            }
        }
    });
    return { result: JSON.parse(response.text || '{}'), tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const generateVeoJson = async (pitch: string, shotId: string, script: string, scenePlan: ScenePlan | null) => {
    const ai = getAiClient();
    const content = `SHOT ID: ${shotId}\nPITCH: ${pitch}\nSCENE PLAN: ${JSON.stringify(scenePlan || {})}\nSCRIPT: ${script}`;
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: content,
        config: { systemInstruction: SYSTEM_PROMPT_SINGLE_SHOT_JSON, responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0.7 }
    });
    return { result: JSON.parse(response.text || '{}'), tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const refineVeoJson = async (currentJson: VeoShotWrapper, feedback: string) => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `CURRENT_JSON: ${JSON.stringify(currentJson, null, 2)}\n\nDIRECTOR_FEEDBACK: ${feedback}`,
        config: { systemInstruction: SYSTEM_PROMPT_REFINE_JSON, responseMimeType: 'application/json', maxOutputTokens: 8192 }
    });
    return { result: JSON.parse(response.text || '{}'), tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const extractAssetsFromScript = async (script: string) => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: script,
        config: {
            systemInstruction: SYSTEM_PROMPT_ASSET_EXTRACTION,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, type: { type: Type.STRING, enum: ['character', 'location', 'prop', 'style'] } }, required: ['name', 'description', 'type'] }
            }
        }
    });
    const result = JSON.parse(response.text || '[]').map((a: any, i: number) => ({ id: a.id || `auto-${Date.now()}-${i}`, name: a.name, description: a.description, type: a.type as any, image: null }));
    return { result, tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const generateKeyframePromptText = async (veoShot: VeoShot) => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: JSON.stringify(veoShot), config: { systemInstruction: SYSTEM_PROMPT_KEYFRAME_TEXT } });
    return { result: response.text || '', tokens: { input: response.usageMetadata?.promptTokenCount || 0, output: response.usageMetadata?.candidatesTokenCount || 0 } };
};

export const generateKeyframeImage = async (prompt: string, ingredientImages: IngredientImage[], aspectRatio: string) => {
    const ai = getAiClient();
    const parts: any[] = [{ text: prompt }];
    ingredientImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));
    const response = await ai.models.generateContent({ model: 'gemini-3-pro-image-preview', contents: { parts }, config: { imageConfig: { aspectRatio: (aspectRatio || '16:9') as any } } });
    let imageBase64 = null;
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) { if (part.inlineData) { imageBase64 = part.inlineData.data; break; } }
    }
    return { result: imageBase64 };
};
