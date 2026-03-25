
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
declare const JSZip: any;
import React, {useCallback, useEffect, useRef, useState} from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import LoadingIndicator from './components/LoadingIndicator';
import ProjectSetupForm from './components/PromptForm';
import ConfirmDialog from './components/ConfirmDialog';
import StorageInfoDialog from './components/StorageInfoDialog';
import ShotBookDisplay from './components/VideoResult';
import { StopCircleIcon } from './components/icons';
import {
  generateKeyframeImage,
  generateKeyframePromptText,
  generateProjectName,
  generateSceneNames,
  generateScenePlan,
  generateShotList,
  generateVeoJson,
  extractAssetsFromScript,
  refineVeoJson,
  executeMcpAction,
} from './services/geminiService';
import {
  generateVeoVideo,
  getVeoTaskDetails,
  extendVeoVideo
} from './services/veoService';
import { McpService } from './services/mcpService';
import {generateMasterShotlistHtml} from './services/reportGenerator';
import {
  ApiCallSummary,
  AppState,
  IngredientImage,
  LogEntry,
  LogType,
  ScenePlan,
  Shot,
  ShotBook,
  ShotStatus,
  VeoShot,
  ProjectAsset,
  VeoStatus,
  McpServerConfig,
  GuidanceFrame,
} from './types';
import { metadata } from './metadata';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const API_CALL_DELAY_MS = 1200;
const LOCAL_STORAGE_KEY = 'veoPromptMachineState';
const VEO_API_KEY_STORAGE = 'veoApiKey';
const MCP_CONFIG_STORAGE = 'mcpConfig';
const PROJECT_VERSION = metadata.version || '0.0.0';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [shotBook, setShotBook] = useState<ShotBook | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [scenePlans, setScenePlans] = useState<ScenePlan[] | null>(null);
  const [veoApiKey, setVeoApiKey] = useState<string>('');
  
  // MCP State
  const [mcpConfig, setMcpConfig] = useState<McpServerConfig>({
      url: 'http://localhost:3000',
      connected: false,
      tools: []
  });

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showStorageInfoDialog, setShowStorageInfoDialog] = useState(false);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [guidanceFrames, setGuidanceFrames] = useState<GuidanceFrame[]>([]);
  const [isAnalyzingAssets, setIsAnalyzingAssets] = useState(false);
  const stopGenerationRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<{script: string; createKeyframes: boolean;} | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [apiCallSummary, setApiCallSummary] = useState<ApiCallSummary>({
    pro: 0, flash: 0, image: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0}
  });

  // Load from Local Storage
  useEffect(() => {
    const savedApiKey = localStorage.getItem(VEO_API_KEY_STORAGE);
    if (savedApiKey) setVeoApiKey(savedApiKey);

    const savedMcp = localStorage.getItem(MCP_CONFIG_STORAGE);
    if (savedMcp) {
        try { setMcpConfig(JSON.parse(savedMcp)); } catch (e) {}
    }

    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        setShotBook(parsedState.shotBook);
        setProjectName(parsedState.projectName);
        setLogEntries(parsedState.logEntries || []);
        setApiCallSummary(parsedState.apiCallSummary || { pro: 0, flash: 0, image: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0} });
        setScenePlans(parsedState.scenePlans || null);
        setAssets(parsedState.assets || []);
        setGuidanceFrames(parsedState.guidanceFrames || []);
        if (parsedState.shotBook && parsedState.shotBook.length > 0) setAppState(AppState.SUCCESS);
      } catch (e) {}
    }
  }, []);

  // Save to Local Storage
  useEffect(() => {
    if (veoApiKey) localStorage.setItem(VEO_API_KEY_STORAGE, veoApiKey);
    localStorage.setItem(MCP_CONFIG_STORAGE, JSON.stringify(mcpConfig));

    if (appState === AppState.SUCCESS || assets.length > 0) {
      try {
        const lightweightShotBook = shotBook?.map(shot => ({ ...shot, keyframeImage: undefined }));
        const lightweightAssets = assets.map(asset => ({ ...asset, image: undefined }));
        const lightweightGuidance = guidanceFrames.map(gf => ({ ...gf, image: undefined }));
        const stateToSave = { 
            shotBook: lightweightShotBook, 
            projectName, 
            logEntries, 
            apiCallSummary, 
            scenePlans, 
            assets: lightweightAssets,
            guidanceFrames: lightweightGuidance
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (e) {}
    }
  }, [shotBook, appState, projectName, logEntries, apiCallSummary, scenePlans, assets, guidanceFrames, veoApiKey, mcpConfig]);

  // VEO Polling
  useEffect(() => {
    if (!veoApiKey || !shotBook) return;
    const activeShots = shotBook.filter(s => s.veoStatus === VeoStatus.GENERATING || s.veoStatus === VeoStatus.QUEUED);
    if (activeShots.length === 0) return;
    const pollInterval = setInterval(async () => {
        let updated = false;
        const newShotBook = await Promise.all(shotBook.map(async (shot) => {
             if ((shot.veoStatus === VeoStatus.GENERATING || shot.veoStatus === VeoStatus.QUEUED) && shot.veoTaskId) {
                 try {
                     const info = await getVeoTaskDetails(veoApiKey, shot.veoTaskId);
                     let newStatus: VeoStatus | undefined = shot.veoStatus;
                     let newUrl = shot.veoVideoUrl;
                     let error = shot.veoError;
                     if (info.data.successFlag === 1) {
                         newStatus = VeoStatus.COMPLETED;
                         newUrl = info.data.response?.resultUrls?.[0];
                         addLogEntry(`Video ready for ${shot.id}`, LogType.SUCCESS);
                     } else if (info.data.successFlag === 2 || info.data.successFlag === 3) {
                         newStatus = VeoStatus.FAILED;
                         error = info.data.errorMessage || "Veo Generation failed";
                         addLogEntry(`Video failed for ${shot.id}: ${error}`, LogType.ERROR);
                     }
                     if (newStatus !== shot.veoStatus) {
                         updated = true;
                         return { ...shot, veoStatus: newStatus, veoVideoUrl: newUrl, veoError: error };
                     }
                 } catch (e) {}
             }
             return shot;
        }));
        if (updated) setShotBook(newShotBook as ShotBook);
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [shotBook, veoApiKey]);

  const addLogEntry = (message: string, type: LogType = LogType.INFO) => {
    setLogEntries((prev) => [...prev, {timestamp: new Date().toLocaleTimeString(), message, type}]);
  };

  const updateApiSummary = (tokens: {input: number; output: number}, model: 'pro' | 'flash' | 'image') => {
    setApiCallSummary((prev) => ({
      ...prev,
      [model]: prev[model] + 1,
      proTokens: model === 'pro' ? { input: prev.proTokens.input + tokens.input, output: prev.proTokens.output + tokens.output } : prev.proTokens,
      flashTokens: model === 'flash' ? { input: prev.flashTokens.input + tokens.input, output: prev.flashTokens.output + tokens.output } : prev.flashTokens,
    }));
  };

  // Guidance Frame Handlers
  const handleAddGuidanceFrame = async (file: File) => {
      try {
          const base64 = await fileToBase64(file);
          const newFrame: GuidanceFrame = {
              id: `gf-${Date.now()}`,
              name: file.name,
              image: { base64, mimeType: file.type }
          };
          setGuidanceFrames(prev => [...prev, newFrame]);
          addLogEntry(`Added guidance frame: ${file.name}`, LogType.SUCCESS);
      } catch (e) {
          addLogEntry("Failed to add guidance frame.", LogType.ERROR);
      }
  };

  const handleRemoveGuidanceFrame = (id: string) => {
      setGuidanceFrames(prev => prev.filter(f => f.id !== id));
      // Also scrub from shots
      setShotBook(prev => prev ? prev.map(s => ({
          ...s,
          guidanceFrameIds: (s.guidanceFrameIds || []).filter(gid => gid !== id)
      })) : null);
  };

  const handleToggleGuidanceForShot = (shotId: string, frameId: string) => {
      setShotBook(prev => {
          if (!prev) return null;
          return prev.map(s => {
              if (s.id === shotId) {
                  const currentIds = s.guidanceFrameIds || [];
                  const newIds = currentIds.includes(frameId)
                    ? currentIds.filter(id => id !== frameId)
                    : [...currentIds, frameId];
                  return { ...s, guidanceFrameIds: newIds };
              }
              return s;
          });
      });
  };

  // MCP Handlers
  const handleConnectMcp = async () => {
      addLogEntry(`Attempting to connect to MCP at ${mcpConfig.url}...`, LogType.INFO);
      const service = new McpService(mcpConfig.url);
      try {
          const tools = await service.listTools();
          setMcpConfig(prev => ({ ...prev, connected: true, tools }));
          addLogEntry(`Connected to MCP! Found ${tools.length} tools for Resolve.`, LogType.SUCCESS);
      } catch (e) {
          addLogEntry(`Failed to connect to MCP: ${(e as Error).message}`, LogType.ERROR);
          setMcpConfig(prev => ({ ...prev, connected: false, tools: [] }));
      }
  };

  const handleSyncShotToMcp = async (shotId: string) => {
      if (!mcpConfig.connected || mcpConfig.tools.length === 0) {
          alert("Connect to Resolve MCP first.");
          return;
      }
      const shot = shotBook?.find(s => s.id === shotId);
      if (!shot) return;

      addLogEntry(`Syncing ${shotId} to DaVinci Resolve...`, LogType.INFO);
      try {
          const calls = await executeMcpAction(shot, mcpConfig.tools);
          const service = new McpService(mcpConfig.url);
          for (const call of calls) {
              if (!call.name) continue;
              addLogEntry(`Executing Resolve Tool: ${call.name}...`, LogType.STEP);
              await service.callTool(call.name, call.args);
          }
          setShotBook(prev => prev ? prev.map(s => s.id === shotId ? { ...s, mcpSynced: true } : s) : null);
          addLogEntry(`${shotId} successfully synced to Resolve timeline.`, LogType.SUCCESS);
      } catch (e) {
          addLogEntry(`Sync error for ${shotId}: ${(e as Error).message}`, LogType.ERROR);
      }
  };

  // ASSET MANAGEMENT
  const handleAnalyzeScriptForAssets = async (script: string) => {
     setIsAnalyzingAssets(true);
     addLogEntry("Analyzing script for visual assets...", LogType.INFO);
     try {
         const { result, tokens } = await extractAssetsFromScript(script);
         updateApiSummary(tokens, 'pro');
         setAssets(prev => {
             const existingNames = new Set(prev.map(a => (a.name || '').toLowerCase()));
             const newAssets = result.filter((a: any) => !existingNames.has((a.name || '').toLowerCase()));
             return [...prev, ...newAssets];
         });
         addLogEntry(`Found ${result.length} potential assets.`, LogType.SUCCESS);
     } catch (e) { addLogEntry("Failed to extract assets.", LogType.ERROR); }
     finally { setIsAnalyzingAssets(false); }
  };

  const handleAddAsset = (asset: ProjectAsset) => {
      setAssets(prev => [...prev, asset]);
      addLogEntry(`Added asset: ${asset.name}`, LogType.INFO);
  };

  const handleRemoveAsset = (id: string) => setAssets(prev => prev.filter(a => a.id !== id));

  const handleUpdateAssetImage = async (id: string, file: File) => {
      try {
          const base64 = await fileToBase64(file);
          const mimeType = file.type;
          setAssets(prev => prev.map(a => a.id === id ? { ...a, image: { base64, mimeType } } : a));
          addLogEntry("Updated asset image.", LogType.SUCCESS);
      } catch (e) { addLogEntry("Failed to process image.", LogType.ERROR); }
  };

  // GENERATION LOGIC
  const handleGenerate = async (scriptInput: string, createKeyframes: boolean) => {
    if (!process.env.API_KEY && !showApiKeyDialog) { setShowApiKeyDialog(true); return; }
    stopGenerationRef.current = false;
    setIsProcessing(true);
    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLogEntries([]);
    setShotBook([]);
    setApiCallSummary({pro: 0, flash: 0, image: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0}});
    setLastPrompt({script: scriptInput, createKeyframes});

    try {
      addLogEntry('Starting generation process...', LogType.INFO);
      const nameData = await generateProjectName(scriptInput);
      setProjectName(nameData.result);
      updateApiSummary(nameData.tokens, 'flash');
      if (stopGenerationRef.current) throw new Error("Stopped.");

      const shotListData = await generateShotList(scriptInput);
      const rawShots = shotListData.result;
      updateApiSummary(shotListData.tokens, 'pro');
      
      const initialShots: Shot[] = rawShots.map((s: any) => ({
        id: s.id, status: ShotStatus.PENDING_JSON, pitch: s.pitch, selectedAssetIds: [], guidanceFrameIds: [],
      }));
      setShotBook(initialShots);

      const sceneNamesData = await generateSceneNames(rawShots, scriptInput);
      const sceneNameMap = sceneNamesData.result.names;
      updateApiSummary(sceneNamesData.tokens, 'flash');

      const shotsWithScenes = initialShots.map(shot => {
         const lastUnderscore = (shot.id || '').lastIndexOf('_');
         const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
         return { ...shot, sceneName: sceneNameMap.get(sceneId) || sceneId };
      });
      setShotBook(shotsWithScenes);

      const sceneGroups = new Map<string, Shot[]>();
      shotsWithScenes.forEach(shot => {
          const lastUnderscore = (shot.id || '').lastIndexOf('_');
          const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
          if (!sceneGroups.has(sceneId)) sceneGroups.set(sceneId, []);
          sceneGroups.get(sceneId)?.push(shot);
      });

      const plans: ScenePlan[] = [];
      for (const [sceneId, shots] of sceneGroups) {
          if (stopGenerationRef.current) break;
          await delay(API_CALL_DELAY_MS);
          const pitches = shots.map(s => `${s.id}: ${s.pitch}`).join('\n');
          try {
              const planData = await generateScenePlan(sceneId, pitches, scriptInput);
              plans.push(planData.result);
              updateApiSummary(planData.tokens, 'pro');
          } catch (e) {}
      }
      setScenePlans(plans);

      const finalShots = [...shotsWithScenes];
      for (let i = 0; i < finalShots.length; i++) {
        if (stopGenerationRef.current) break;
        const shot = finalShots[i];
        const matchedAssetIds: string[] = [];
        assets.forEach(asset => { 
            if ((shot.pitch || '').toLowerCase().includes((asset.name || '').toLowerCase())) matchedAssetIds.push(asset.id); 
        });
        finalShots[i].selectedAssetIds = matchedAssetIds;

        setShotBook((prev) => prev ? prev.map((s, idx) => idx === i ? { ...s, status: ShotStatus.GENERATING_JSON } : s) : null);
        const lastUnderscore = (shot.id || '').lastIndexOf('_');
        const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
        const relevantPlan = plans.find(p => p.scene_id === sceneId) || null;

        await delay(API_CALL_DELAY_MS);
        try {
          const jsonData = await generateVeoJson(shot.pitch, shot.id, scriptInput, relevantPlan);
          finalShots[i].veoJson = jsonData.result;
          finalShots[i].status = ShotStatus.PENDING_KEYFRAME_PROMPT;
          updateApiSummary(jsonData.tokens, 'pro');
          setShotBook((prev) => prev ? prev.map((s, idx) => idx === i ? { ...s, veoJson: jsonData.result, status: ShotStatus.PENDING_KEYFRAME_PROMPT } : s) : null);
          
          const charName = jsonData.result.veo_shot?.character?.name;
          if (charName && charName !== 'N/A') {
              const matchedChar = assets.find(a => a.type === 'character' && (a.name.toLowerCase().includes(charName.toLowerCase()) || charName.toLowerCase().includes(a.name.toLowerCase())));
              if (matchedChar && !finalShots[i].selectedAssetIds.includes(matchedChar.id)) {
                  finalShots[i].selectedAssetIds.push(matchedChar.id);
              }
          }
        } catch (e) {
          finalShots[i].status = ShotStatus.GENERATION_FAILED;
          setShotBook((prev) => prev ? prev.map((s, idx) => idx === i ? { ...s, status: ShotStatus.GENERATION_FAILED } : s) : null);
          continue;
        }

        if (createKeyframes && finalShots[i].veoJson) {
             setShotBook((prev) => prev ? prev.map((s, idx) => idx === i ? { ...s, status: ShotStatus.GENERATING_KEYFRAME_PROMPT } : s) : null);
             await delay(API_CALL_DELAY_MS);
             try {
                 const promptData = await generateKeyframePromptText(finalShots[i].veoJson!.veo_shot);
                 finalShots[i].keyframePromptText = promptData.result;
                 updateApiSummary(promptData.tokens, 'pro');
                 setShotBook((prev) => prev ? prev.map((s, idx) => idx === i ? { ...s, keyframePromptText: promptData.result, status: ShotStatus.GENERATING_IMAGE } : s) : null);
                 await delay(API_CALL_DELAY_MS);
                 
                 const ingredients: IngredientImage[] = [];
                 finalShots[i].selectedAssetIds.forEach((id: string) => { const asset = assets.find(a => a.id === id); if (asset && asset.image) ingredients.push(asset.image); });
                 // Add guidance frames
                 finalShots[i].guidanceFrameIds.forEach((id: string) => { const frame = guidanceFrames.find(f => f.id === id); if (frame) ingredients.push(frame.image); });

                 const imageData = await generateKeyframeImage(finalShots[i].keyframePromptText!, ingredients, finalShots[i].veoJson?.veo_shot?.scene?.aspect_ratio || "16:9");
                 finalShots[i].keyframeImage = imageData.result;
                 finalShots[i].status = ShotStatus.NEEDS_REVIEW;
                 updateApiSummary({input: 0, output: 0}, 'image');
                 setShotBook((prev: ShotBook | null) => prev ? prev.map((s, idx) => idx === i ? { ...s, keyframeImage: imageData.result, status: ShotStatus.NEEDS_REVIEW } : s) : null);
             } catch (e) {
                 finalShots[i].status = ShotStatus.GENERATION_FAILED;
                 setShotBook((prev: ShotBook | null) => prev ? prev.map((s, idx) => idx === i ? { ...s, status: ShotStatus.GENERATION_FAILED, errorMessage: (e as Error).message } : s) : null);
             }
        } else {
             finalShots[i].status = ShotStatus.NEEDS_KEYFRAME_GENERATION;
             setShotBook((prev: ShotBook | null) => prev ? prev.map((s, idx) => idx === i ? { ...s, status: ShotStatus.NEEDS_KEYFRAME_GENERATION } : s) : null);
        }
      }
      addLogEntry('Generation completed!', LogType.SUCCESS);
      setAppState(AppState.SUCCESS);
    } catch (e) {
      setErrorMessage((e as Error).message || 'Error occurred.');
      setAppState(AppState.ERROR);
      addLogEntry(`Error: ${(e as Error).message}`, LogType.ERROR);
    } finally { setIsProcessing(false); stopGenerationRef.current = false; }
  };

  const handleUpdateShot = (updatedShot: Shot) => setShotBook((prev) => prev ? prev.map((s) => (s.id === updatedShot.id ? updatedShot : s)) : null);
  
  const handleToggleAssetForShot = (shotId: string, assetId: string) => {
      setShotBook(prev => prev ? prev.map(s => {
          if (s.id === shotId) {
              const currentIds = s.selectedAssetIds || [];
              const newIds = currentIds.includes(assetId) ? currentIds.filter(id => id !== assetId) : [...currentIds, assetId];
              return { ...s, selectedAssetIds: newIds };
          }
          return s;
      }) : null);
  };

  const handleGenerateSpecificKeyframe = async (shotId: string) => {
      const shotIndex = shotBook?.findIndex(s => s.id === shotId) ?? -1;
      if (shotIndex === -1 || !shotBook) return;
      const shot = shotBook[shotIndex];
      const updateShotStatus = (status: ShotStatus, extra?: Partial<Shot>) => setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, status, ...extra } : s) : null);
      try {
          let promptText = shot.keyframePromptText;
          if (!promptText && shot.veoJson) {
              updateShotStatus(ShotStatus.GENERATING_KEYFRAME_PROMPT);
              const promptData = await generateKeyframePromptText(shot.veoJson.veo_shot);
              promptText = promptData.result;
              updateApiSummary(promptData.tokens, 'pro');
          }
          if (promptText) {
             updateShotStatus(ShotStatus.GENERATING_IMAGE, { keyframePromptText: promptText });
             const ingredients: IngredientImage[] = [];
             (shot.selectedAssetIds || []).forEach((id: string) => { const asset = assets.find(a => a.id === id); if (asset && asset.image) ingredients.push(asset.image); });
             (shot.guidanceFrameIds || []).forEach((id: string) => { const frame = guidanceFrames.find(f => f.id === id); if (frame) ingredients.push(frame.image); });

             const imageData = await generateKeyframeImage(promptText, ingredients, shot.veoJson?.veo_shot?.scene?.aspect_ratio || "16:9");
             updateApiSummary({input: 0, output: 0}, 'image');
             updateShotStatus(ShotStatus.NEEDS_REVIEW, { keyframeImage: imageData.result, errorMessage: undefined });
          }
      } catch (e) { updateShotStatus(ShotStatus.GENERATION_FAILED); }
  };

  const handleGenerateAllKeyframes = async () => {
      if (!shotBook) return;
      setIsProcessing(true);
      addLogEntry("Starting bulk keyframe generation...", LogType.INFO);
      
      for (const shot of shotBook) {
          if (stopGenerationRef.current) break;
          // Only generate if missing or explicitly needed
          if (shot.status === ShotStatus.NEEDS_KEYFRAME_GENERATION || shot.status === ShotStatus.GENERATION_FAILED || !shot.keyframeImage) {
              await handleGenerateSpecificKeyframe(shot.id);
              await delay(API_CALL_DELAY_MS);
          }
      }
      setIsProcessing(false);
      addLogEntry("Bulk keyframe generation complete.", LogType.SUCCESS);
  };

  const handleRefineShot = async (shotId: string, feedback: string) => {
      const shotIndex = shotBook?.findIndex(s => s.id === shotId) ?? -1;
      if (shotIndex === -1 || !shotBook) return;
      const shot = shotBook[shotIndex];
      if (!shot.veoJson) return;
      setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, status: ShotStatus.GENERATING_JSON } : s) : null);
      try {
          const refinedData = await refineVeoJson(shot.veoJson, feedback);
          updateApiSummary(refinedData.tokens, 'pro');
          const newJson = refinedData.result;
          const promptData = await generateKeyframePromptText(newJson.veo_shot);
          const newPrompt = promptData.result;
          const ingredients: IngredientImage[] = [];
          (shot.selectedAssetIds || []).forEach(id => { const asset = assets.find(a => a.id === id); if (asset && asset.image) ingredients.push(asset.image); });
          (shot.guidanceFrameIds || []).forEach(id => { const frame = guidanceFrames.find(f => f.id === id); if (frame) ingredients.push(frame.image); });

          const imageData = await generateKeyframeImage(newPrompt, ingredients, newJson.veo_shot?.scene?.aspect_ratio || "16:9");
          updateApiSummary({input: 0, output: 0}, 'image');
          setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoJson: newJson, keyframePromptText: newPrompt, keyframeImage: imageData.result, status: ShotStatus.NEEDS_REVIEW } : s) : null);
      } catch (e) { setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, status: ShotStatus.GENERATION_FAILED } : s) : null); }
  };

  const handleGenerateVeoVideo = async (shotId: string) => {
      if (!veoApiKey) return;
      const shotIndex = shotBook?.findIndex(s => s.id === shotId) ?? -1;
      if (shotIndex === -1 || !shotBook) return;
      const shot = shotBook[shotIndex];
      setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.QUEUED } : s) : null);
      try {
          const resp = await generateVeoVideo(veoApiKey, { prompt: shot.keyframePromptText!, model: 'veo3_fast', aspectRatio: shot.veoJson?.veo_shot?.scene?.aspect_ratio || '16:9' });
          setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.GENERATING, veoTaskId: resp.data.taskId } : s) : null);
      } catch (e) { setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.FAILED, veoError: (e as Error).message } : s) : null); }
  };

  const handleExtendVeoVideo = async (originalShotId: string, prompt: string) => {
      if (!veoApiKey || !shotBook) return;
      const originalShotIndex = shotBook.findIndex(s => s.id === originalShotId);
      if (originalShotIndex === -1) return;
      const originalShot = shotBook[originalShotIndex];
      const newShotId = `${originalShot.id}_ext_${Date.now().toString().slice(-4)}`;
      const newShot: Shot = {
          id: newShotId, status: ShotStatus.NEEDS_REVIEW, pitch: `Extension: ${prompt}`,
          sceneName: originalShot.sceneName, selectedAssetIds: originalShot.selectedAssetIds, guidanceFrameIds: originalShot.guidanceFrameIds,
          keyframePromptText: prompt, veoStatus: VeoStatus.QUEUED,
          veoJson: { ...originalShot.veoJson!, unit_type: 'extend', directorNotes: prompt, veo_shot: { ...originalShot.veoJson!.veo_shot, shot_id: newShotId } }
      };
      const newShotBook = [...shotBook];
      newShotBook.splice(originalShotIndex + 1, 0, newShot);
      setShotBook(newShotBook);
      try {
          const resp = await extendVeoVideo(veoApiKey, { taskId: originalShot.veoTaskId!, prompt: prompt });
          setShotBook(prev => prev ? prev.map(s => s.id === newShotId ? { ...s, veoStatus: VeoStatus.GENERATING, veoTaskId: resp.data.taskId } : s) : null);
      } catch (e) { setShotBook(prev => prev ? prev.map(s => s.id === newShotId ? { ...s, veoStatus: VeoStatus.FAILED, veoError: (e as Error).message } : s) : null); }
  };

  const handleLoadProject = (json: string) => { try { const p = JSON.parse(json); if (p.shotBook) setShotBook(p.shotBook); if (p.projectName) setProjectName(p.projectName); setAssets(p.assets || []); setGuidanceFrames(p.guidanceFrames || []); setAppState(AppState.SUCCESS); } catch (e) {} };
  const handleSaveProject = () => { const blob = new Blob([JSON.stringify({ shotBook, projectName, logEntries, apiCallSummary, scenePlans, assets, guidanceFrames }, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${projectName || 'veo'}.json`; a.click(); };
  const handleExportPackage = async () => { if (!JSZip) return; const zip = new JSZip(); const root = zip.folder(projectName || "project"); root.file("shot_list.json", JSON.stringify(shotBook, null, 2)); const content = await zip.generateAsync({type: "blob"}); const url = URL.createObjectURL(content); const a = document.createElement('a'); a.href = url; a.download = `${projectName || 'package'}.zip`; a.click(); };

  return (
    <div className="min-h-screen font-sans text-gray-100 bg-[#121212]">
      {appState === AppState.LOADING && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm"><LoadingIndicator /><div className="absolute bottom-10"><button onClick={() => { stopGenerationRef.current = true; setIsProcessing(false); }} className="px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"><StopCircleIcon className="w-5 h-5" /> Stop</button></div></div>}
      {showApiKeyDialog && <ApiKeyDialog onContinue={() => setShowApiKeyDialog(false)} />}
      <ConfirmDialog isOpen={showNewProjectDialog} title="Start New Project?" message="Clear script and shot list? Assets will be kept." onConfirm={() => { setShotBook(null); setProjectName(null); setLogEntries([]); setAppState(AppState.IDLE); setShowNewProjectDialog(false); }} onCancel={() => setShowNewProjectDialog(false)} />
      <StorageInfoDialog isOpen={showStorageInfoDialog} onClose={() => setShowStorageInfoDialog(false)} />
      <main className="flex flex-col items-center p-4 md:p-8 min-h-screen max-w-[1920px] mx-auto">
        {appState === AppState.IDLE && <div className="flex flex-col items-center w-full max-w-4xl animate-in fade-in duration-700"><div className="mb-8 text-center"><h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-4 tracking-tight">VEO Prompt Machine</h1><p className="text-xl text-gray-400 max-w-2xl mx-auto">Transform scripts into VEO 3.1 prompts and DaVinci Resolve timelines.</p></div><ProjectSetupForm onGenerate={handleGenerate} isGenerating={false} onLoadProject={handleLoadProject} assets={assets} onAnalyzeScriptForAssets={handleAnalyzeScriptForAssets} isAnalyzingAssets={isAnalyzingAssets} onAddAsset={handleAddAsset} onRemoveAsset={handleRemoveAsset} onUpdateAssetImage={handleUpdateAssetImage} /></div>}
        {appState !== AppState.IDLE && shotBook && <ShotBookDisplay shotBook={shotBook} logEntries={logEntries} projectName={projectName} scenePlans={scenePlans} apiCallSummary={apiCallSummary} appVersion={PROJECT_VERSION} onNewProject={() => setShowNewProjectDialog(true)} onUpdateShot={handleUpdateShot} onGenerateSpecificKeyframe={handleGenerateSpecificKeyframe} onRefineShot={handleRefineShot} allAssets={assets} onToggleAssetForShot={handleToggleAssetForShot} onExportAllJsons={() => {}} onExportHtmlReport={() => {}} onSaveProject={handleSaveProject} onDownloadKeyframesZip={() => {}} onExportPackage={handleExportPackage} onShowStorageInfo={() => setShowStorageInfoDialog(true)} isProcessing={isProcessing} onStopGeneration={() => { stopGenerationRef.current = true; setIsProcessing(false); }} veoApiKey={veoApiKey} onSetVeoApiKey={setVeoApiKey} onGenerateVideo={handleGenerateVeoVideo} onExtendVeoVideo={handleExtendVeoVideo} mcpConfig={mcpConfig} onSetMcpUrl={(url) => setMcpConfig(prev => ({ ...prev, url }))} onConnectMcp={handleConnectMcp} onSyncToResolve={handleSyncShotToMcp} guidanceFrames={guidanceFrames} onAddGuidanceFrame={handleAddGuidanceFrame} onRemoveGuidanceFrame={handleRemoveGuidanceFrame} onToggleGuidanceForShot={handleToggleGuidanceForShot} onGenerateAllKeyframes={handleGenerateAllKeyframes} />}
        <footer className="mt-auto py-6 text-center text-gray-600 text-sm"><p>Powered by Google Gemini & Veo 3.1 • DaVinci Resolve Integration via MCP</p></footer>
      </main>
    </div>
  );
};

export default App;
