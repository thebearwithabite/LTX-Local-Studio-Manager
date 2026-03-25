
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export enum AppState {
  IDLE,
  LOADING,
  SUCCESS,
  ERROR,
}

export enum ShotStatus {
  PENDING_JSON = 'PENDING_JSON',
  GENERATING_JSON = 'GENERATING_JSON',
  PENDING_KEYFRAME_PROMPT = 'PENDING_KEYFRAME_PROMPT',
  GENERATING_KEYFRAME_PROMPT = 'GENERATING_KEYFRAME_PROMPT',
  NEEDS_KEYFRAME_GENERATION = 'NEEDS_KEYFRAME_GENERATION',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  GENERATION_FAILED = 'GENERATION_FAILED',
}

export enum VeoStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum LogType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  STEP = 'STEP',
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: LogType;
}

export interface ScenePlanBeat {
  beat_id: string;
  label: string;
  priority: number;
  min_s: number;
  max_s: number;
}

export interface ExtendPolicy {
  allow_extend: boolean;
  extend_granularity_s: number;
  criteria: string[];
}

export interface ScenePlan {
  scene_id: string;
  scene_title: string;
  goal_runtime_s: number;
  beats: ScenePlanBeat[];
  extend_policy: ExtendPolicy;
}

export interface VeoShot {
  shot_id: string;
  scene: {
    context: string;
    visual_style: string;
    lighting: string;
    mood: string;
    aspect_ratio: '16:9' | '9:16';
    duration_s: 4 | 6 | 8;
  };
  character: {
    name: string;
    gender_age: string;
    description_lock: string;
    behavior: string;
    expression: string;
  };
  camera: {
    shot_call: string;
    movement: string;
    negatives?: string;
  };
  audio: {
    dialogue: string;
    delivery: string;
    ambience?: string;
    sfx?: string;
  };
  flags: {
    continuity_lock: boolean;
    do_not: string[];
    anti_artifacts: string[];
    conflicts: string[];
    warnings: string[];
    cv_updates: string[];
  };
}

export interface VeoShotWrapper {
  unit_type: 'shot' | 'extend';
  chain_id?: string;
  segment_number?: number;
  segment_count?: number;
  target_duration_s?: number;
  stitching_notes?: string;
  clip_strategy?: string;
  directorNotes?: string;
  veo_shot: VeoShot;
}

export interface IngredientImage {
  base64: string;
  mimeType: string;
}

export type AssetType = 'character' | 'location' | 'prop' | 'style';

export interface ProjectAsset {
  id: string;
  name: string;
  description: string;
  type: AssetType;
  image: IngredientImage | null;
}

export interface GuidanceFrame {
  id: string;
  name: string;
  image: IngredientImage;
}

export interface Shot {
  id: string;
  status: ShotStatus;
  pitch: string;
  sceneName?: string;
  veoJson?: VeoShotWrapper;
  keyframePromptText?: string | null;
  keyframeImage?: string | null;
  errorMessage?: string;
  selectedAssetIds: string[];
  guidanceFrameIds: string[]; // Reference to GuidanceFrame IDs
  veoTaskId?: string;
  veoStatus?: VeoStatus;
  veoVideoUrl?: string;
  veoError?: string;
  mcpSynced?: boolean;
}

export type ShotBook = Shot[];

export interface ApiCallSummary {
  pro: number;
  flash: number;
  image: number;
  proTokens: { input: number; output: number; };
  flashTokens: { input: number; output: number; };
}

// MCP Types
export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface McpServerConfig {
  url: string;
  connected: boolean;
  tools: McpTool[];
}

export const GEMINI_PRO_INPUT_COST_PER_MILLION_TOKENS = 7.00;
export const GEMINI_PRO_OUTPUT_COST_PER_MILLION_TOKENS = 21.00;
export const GEMINI_FLASH_INPUT_COST_PER_MILLION_TOKENS = 0.35;
export const GEMINI_FLASH_OUTPUT_COST_PER_MILLION_TOKENS = 1.05;
export const IMAGEN_COST_PER_IMAGE = 0.005;
