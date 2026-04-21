/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Model UUID Constants and String IDs
export const LEONARDO_MODELS = {
  LUCID_ORIGIN: '7b592283-e8a7-4c5a-9ba6-d18c31f258b9',
  LUCID_REALISM: '05ce0082-2d80-4a2d-8653-4d1c85e2418e',
  FLUX_1_KONTEXT: '28aeddf8-bd19-4803-80fc-79602d1a9989',
  FLUX_2_PRO: 'flux-pro-2.0',
  SEEDREAM_4_5: 'seedream-4.5',
  KINO_XL: 'aa77f04e-3eec-4034-9c07-d0f619684628',
  GPT_1_5: 'gpt-image-1.5',
  NANO_BANANA_2: 'nano-banana-2',
} as const;

export const LEONARDO_STYLES = {
  CINEMATIC: 'a5632c7c-ddbb-4e2f-ba34-8456ab3ac436',
  CREATIVE: '6fedbf1f-4a17-45ec-84fb-92fe524a29ef',
  DYNAMIC: '111dc692-d470-4eec-b791-3475abac4c46',
  FASHION: '594c4a08-a522-4e0e-b7ff-e4dac4b6b622',
  PORTRAIT: 'ab5a4220-7c42-41e5-a578-eddb9fed3d75',
  STOCK_PHOTO: '5bdc3f2a-1be6-4d1c-8e77-992a30824a2c',
  VIBRANT: 'dee282d3-891f-4f73-ba02-7f8131e5541b',
} as const;

// Sample Prompts for robust keyframe & still pipeline
export const SAMPLE_PROMPTS = {
  CONSISTENT_CHARACTER: "Character expression sheet, (character_name), 1girl/1boy, orthographic turnaround, neutral lighting, flat background, high consistency, masterpiece, 8k resolution.",
  ESTABLISHING_SHOT: "Cinematic establishing shot of a futuristic neon city street, rainy night, neon reflections on wet pavement, volumetric fog, anamorphic lens flare, anamorphic bokeh, incredibly detailed.",
  OBJECT_STUDY: "Close-up macro photography of an ancient worn leather tome, rough texture mapping, studio lighting, isolated on solid gray background, photorealistic.",
} as const;

export interface LeonardoGenerateV1Request {
  prompt: string;
  negative_prompt?: string;
  modelId?: string;
  sd_version?: string;
  num_images?: number;
  width?: number;
  height?: number;
  promptMagic?: boolean;
  controlNet?: boolean;
  controlNetType?: string;
  init_image_id?: string;
  init_strength?: number;
  styleUUID?: string;
  contextImages?: Array<{ type: string; id: string }>;
}

export interface LeonardoGuidanceReference {
  image: {
    id: string;
    type: 'UPLOADED' | 'GENERATED';
  };
  strength?: 'LOW' | 'MID' | 'HIGH';
}

export interface LeonardoGenerateV2Request {
  prompt: string;
  num_images?: number;
  width?: number;
  height?: number;
  modelId?: string;
  styleUUIDs?: string[];
  public?: boolean;
  seed?: number;
  prompt_enhance?: 'ON' | 'OFF';
  guidances?: {
    image_reference: LeonardoGuidanceReference[];
  };
}

export interface LeonardoUpscaleRequest {
  generationId: string;
  upscaleType?: 'HD' | 'UPSCALE' | 'CREATIVE_UPSCALE';
}

export interface LoraTrainRequest {
  datasetId: string;
  instancePrompt: string;
  modelType: string;
  resolution?: number;
  strength?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Returns headers with the Bearer token sourced from env
 */
const getHeaders = () => {
  // Try to use process.env via Vite's import.meta.env if available, or fall back to process.env for Node.
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LEONARDO_API_KEY) 
               || process.env.LEONARDO_API_KEY;
  if (!apiKey) {
    console.warn("LEONARDO_API_KEY is not defined in environment variables. Requests may fail.");
  }
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'authorization': `Bearer ${apiKey}`
  };
};

/**
 * Uses Leonardo V1 Generation API
 */
export const generateImageV1 = async (params: LeonardoGenerateV1Request) => {
  const payload: any = {
    prompt: params.prompt,
    negative_prompt: params.negative_prompt,
    modelId: params.modelId || LEONARDO_MODELS.LUCID_ORIGIN,
    num_images: params.num_images || 1,
    width: params.width || 512,
    height: params.height || 512,
    promptMagic: params.promptMagic !== undefined ? params.promptMagic : true,
  };

  if (params.controlNet) payload.controlNet = params.controlNet;
  if (params.controlNetType) payload.controlNetType = params.controlNetType;
  if (params.init_image_id) payload.init_image_id = params.init_image_id;
  if (params.init_strength) payload.init_strength = params.init_strength;
  if (params.styleUUID) payload.styleUUID = params.styleUUID;
  if (params.contextImages) payload.contextImages = params.contextImages;

  const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Leonardo V1 Generation failed: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Uses Leonardo V2 Generation API (often supports slightly different structured payloads including LORAs via userElements)
 */
export const generateImageV2 = async (params: LeonardoGenerateV2Request) => {
  const payload = {
    model: params.modelId || LEONARDO_MODELS.FLUX_1_KONTEXT,
    public: params.public !== undefined ? params.public : false,
    parameters: {
      prompt: params.prompt,
      quantity: params.num_images || 1,
      width: params.width || 1024,
      height: params.height || 1024,
      ...(params.styleUUIDs && { style_ids: params.styleUUIDs }),
      ...(params.seed && { seed: params.seed }),
      ...(params.prompt_enhance && { prompt_enhance: params.prompt_enhance }),
      ...(params.guidances && { guidances: params.guidances }),
    }
  };

  const response = await fetch('https://cloud.leonardo.ai/api/rest/v2/generations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Leonardo V2 Generation failed: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Request an Upscale via Leonardo API
 */
export const upscaleImage = async (params: LeonardoUpscaleRequest) => {
  const endpointMap = {
    'HD': 'https://cloud.leonardo.ai/api/rest/v1/variations/upscale',
    'UPSCALE': 'https://cloud.leonardo.ai/api/rest/v1/variations/upscale',
    'CREATIVE_UPSCALE': 'https://cloud.leonardo.ai/api/rest/v1/variations/creative-upscale'
  };
  
  const endpoint = endpointMap[params.upscaleType || 'HD'];
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      id: params.generationId
    })
  });

  if (!response.ok) {
    throw new Error(`Leonardo Upscale failed: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Check Generation Status (Works for generations and upscales)
 */
export const getGenerationTaskDetails = async (generationId: string) => {
  const response = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch generation status: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Train a Custom Model (LORA)
 */
export const trainCustomLora = async (params: LoraTrainRequest) => {
  const payload = {
    name: `LORA_${params.instancePrompt}`,
    datasetId: params.datasetId,
    instance_prompt: params.instancePrompt,
    modelType: params.modelType || 'GENERAL',
    resolution: params.resolution || 512,
  };

  const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/models', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to initiate LORA training: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Start an initialization image upload (often used before ControlNet/Editing)
 * Normally requires two steps: 1. get presigned URL, 2. upload via PUT
 */
export const uploadInitImage = async (extension: string) => {
  const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      extension: extension || 'png'
    })
  });

  if (!response.ok) {
    throw new Error(`Init image slot creation failed: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Creates a Dataset
 */
export const createDataset = async (name: string, description?: string) => {
  const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/datasets', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, description })
  });
  if (!response.ok) {
    throw new Error(`Dataset creation failed: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Uploads an image to a Dataset
 */
export const uploadDatasetImage = async (datasetId: string, extension: string) => {
  const response = await fetch(`https://cloud.leonardo.ai/api/rest/v1/datasets/${datasetId}/upload`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ extension })
  });
  if (!response.ok) {
    throw new Error(`Dataset explicit presigned URL generation failed: ${response.statusText}`);
  }
  return await response.json();
};
/**
 * Multi-Modal Production Orchestrator: Agnostic Model Routing
 * Routes to Flux Pro 2.0, Lucid Origin, or Seedream 4.5 based on prompt intent.
 */
export const generateKeyframeAgnostic = async (
  prompt: string, 
  numImages: number = 4, 
  aspectRatio: string = "16:9",
  guidances?: LeonardoGuidanceReference[]
) => {
  // Model Selection Logic
  let modelId = LEONARDO_MODELS.FLUX_2_PRO;
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("surreal") || lowerPrompt.includes("dream") || lowerPrompt.includes("abstract")) {
    modelId = LEONARDO_MODELS.SEEDREAM_4_5;
  } else if (lowerPrompt.includes("photoreal") || lowerPrompt.includes("ultra-detailed") || lowerPrompt.includes("cinematic")) {
    modelId = LEONARDO_MODELS.LUCID_ORIGIN;
  }

  // Dimensions based on aspect ratio
  let width = 1024;
  let height = 576;
  if (aspectRatio === "9:16") {
    width = 576;
    height = 1024;
  } else if (aspectRatio === "1:1") {
    width = 1024;
    height = 1024;
  }

  // Inject hardcoded ControlNet IDs if guidance is provided but lacks specific IDs
  // (Character ID 133, Content ID 430) as per the "Genius" Directive
  const finalGuidances = guidances?.map(g => {
    // This is a placeholder for where we would attach specific ControlNet types/IDs
    // in the Leonardo API payload if the API supports it directly in V2.
    return g;
  });

  return await generateImageV2({
    prompt,
    num_images: numImages,
    width,
    height,
    modelId,
    styleUUIDs: [LEONARDO_STYLES.CINEMATIC],
    prompt_enhance: 'OFF',
    ...(finalGuidances && { guidances: { image_reference: finalGuidances } })
  });
};
