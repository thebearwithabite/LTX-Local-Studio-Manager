
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
declare const JSZip: any;
declare global {
    interface Window {
        aistudio: any;
    }
}
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
  generateAgnosticShotJson,
  selectWinningKeyframe,
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
  GEMINI_PRO_INPUT_COST_PER_MILLION_TOKENS,
  GEMINI_PRO_OUTPUT_COST_PER_MILLION_TOKENS,
  GEMINI_FLASH_INPUT_COST_PER_MILLION_TOKENS,
  GEMINI_FLASH_OUTPUT_COST_PER_MILLION_TOKENS,
  IMAGEN_COST_PER_IMAGE,
  VEO_COST_PER_SECOND,
} from './types';
import { metadata } from './metadata';
import { auth, db, storage } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot,
  query,
  where,
  getDocFromServer,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  ref, 
  uploadString, 
  getDownloadURL 
} from 'firebase/storage';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut 
} from 'firebase/auth';

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

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [shotBook, setShotBook] = useState<ShotBook | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [scenePlans, setScenePlans] = useState<ScenePlan[] | null>(null);
  
  // MCP State
  const [mcpConfig, setMcpConfig] = useState<McpServerConfig>({
      url: 'http://localhost:3000',
      connected: false,
      tools: []
  });

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showStorageInfoDialog, setShowStorageInfoDialog] = useState(false);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [guidanceFrames, setGuidanceFrames] = useState<GuidanceFrame[]>([]);
  const [isAnalyzingAssets, setIsAnalyzingAssets] = useState(false);
  const [showVeoApproval, setShowVeoApproval] = useState<{shotId: string; cost: number} | null>(null);
  const stopGenerationRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<{script: string; createKeyframes: boolean;} | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [apiCallSummary, setApiCallSummary] = useState<ApiCallSummary>({
    pro: 0, flash: 0, image: 0, veo: 0, veoSeconds: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0}
  });
  const hasWarnedLargeProject = useRef(false);
  const [currentThoughts, setCurrentThoughts] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Try to load the most recent project for this user
        loadLastProjectForUser(u.uid);
      }
    });

    // Connection test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      addLogEntry('Signed in successfully.', LogType.SUCCESS);
    } catch (e) {
      console.error('Login error:', e);
      addLogEntry('Failed to sign in. Please check your browser settings.', LogType.ERROR);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      addLogEntry('Signed out.', LogType.INFO);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const uploadImageToStorage = async (base64: string, path: string) => {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64, 'base64');
    return await getDownloadURL(storageRef);
  };

  const loadLastProjectForUser = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', uid),
        orderBy('updatedAt', 'desc'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const projectDoc = querySnapshot.docs[0];
        const data = projectDoc.data();
        
        // Load shots
        const shotsCol = collection(db, 'projects', projectDoc.id, 'shots');
        const shotsSnapshot = await getDocs(shotsCol);
        const shots = shotsSnapshot.docs.map(d => d.data() as Shot);
        
        setProjectName(data.projectName);
        setShotBook(shots);
        setAssets(data.assets || []);
        setGuidanceFrames(data.guidanceFrames || []);
        setLogEntries(data.logEntries || []);
        setApiCallSummary(data.apiCallSummary || {
          pro: 0, flash: 0, image: 0, veo: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0}
        });
        setScenePlans(data.scenePlans || []);
        setAppState(AppState.SUCCESS);
        addLogEntry(`Restored project: ${data.projectName}`, LogType.SUCCESS);
      }
    } catch (e) {
      console.error('Error loading last project:', e);
    }
  };

  const saveProjectToFirebase = async (force: boolean = false) => {
    if (!user || !projectName) return;
    if (!force && appState !== AppState.SUCCESS && assets.length === 0) return;

    try {
      const projectRef = doc(db, 'projects', projectName);
      
      // Upload Assets
      const updatedAssets = await Promise.all(assets.map(async (asset) => {
        if (asset.image && asset.image.base64.length > 1000) { // Only upload if it's base64, not a URL already
          const url = await uploadImageToStorage(asset.image.base64, `projects/${projectName}/assets/${asset.id}`);
          return { ...asset, image: { ...asset.image, base64: url } }; // We'll store the URL in the base64 field for simplicity or rename it
        }
        return asset;
      }));

      // Upload Guidance Frames
      const updatedGuidance = await Promise.all(guidanceFrames.map(async (gf) => {
        if (gf.image && gf.image.base64.length > 1000) {
          const url = await uploadImageToStorage(gf.image.base64, `projects/${projectName}/guidance/${gf.id}`);
          return { ...gf, image: { ...gf.image, base64: url } };
        }
        return gf;
      }));

      // Upload Shots & Keyframes
      let updatedShotBook = shotBook;
      if (shotBook) {
        updatedShotBook = await Promise.all(shotBook.map(async (shot) => {
          let keyframeUrl = shot.keyframeImage;
          if (shot.keyframeImage && shot.keyframeImage.length > 1000) {
            keyframeUrl = await uploadImageToStorage(shot.keyframeImage, `projects/${projectName}/shots/${shot.id}/keyframe`);
          }
          
          let historyUrls = shot.keyframeHistory;
          if (shot.keyframeHistory) {
            historyUrls = await Promise.all(shot.keyframeHistory.map(async (img, idx) => {
              if (img.length > 1000) {
                return await uploadImageToStorage(img, `projects/${projectName}/shots/${shot.id}/history_${idx}`);
              }
              return img;
            }));
          }

          return { ...shot, keyframeImage: keyframeUrl, keyframeHistory: historyUrls };
        }));
      }

      const stateToSave = {
        projectName,
        logEntries: logEntries.slice(-50), // Keep last 50 logs
        apiCallSummary,
        scenePlans,
        lastPrompt,
        updatedAt: new Date().toISOString(),
        userId: user.uid,
        assets: updatedAssets,
        guidanceFrames: updatedGuidance
      };

      try {
        await setDoc(projectRef, stateToSave, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `projects/${projectName}`);
      }
      
      if (updatedShotBook) {
        const shotsCol = collection(projectRef, 'shots');
        for (const shot of updatedShotBook) {
          try {
            await setDoc(doc(shotsCol, shot.id), shot, { merge: true });
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `projects/${projectName}/shots/${shot.id}`);
          }
        }
      }

      addLogEntry('Project synced to cloud storage.', LogType.SUCCESS);
    } catch (e) {
      console.error('Firebase save error:', e);
      if (e instanceof Error && !e.message.startsWith('{')) {
        addLogEntry('Failed to sync to cloud.', LogType.ERROR);
      }
    }
  };

  // Auto-save to Firebase
  useEffect(() => {
    const timer = setTimeout(() => {
      if (appState === AppState.SUCCESS) saveProjectToFirebase();
    }, 5000);
    return () => clearTimeout(timer);
  }, [shotBook, projectName, assets]);

  const calculateTotalCost = () => {
    const proInputCost = (apiCallSummary.proTokens.input / 1000000) * GEMINI_PRO_INPUT_COST_PER_MILLION_TOKENS;
    const proOutputCost = (apiCallSummary.proTokens.output / 1000000) * GEMINI_PRO_OUTPUT_COST_PER_MILLION_TOKENS;
    const flashInputCost = (apiCallSummary.flashTokens.input / 1000000) * GEMINI_FLASH_INPUT_COST_PER_MILLION_TOKENS;
    const flashOutputCost = (apiCallSummary.flashTokens.output / 1000000) * GEMINI_FLASH_OUTPUT_COST_PER_MILLION_TOKENS;
    const imageCost = apiCallSummary.image * IMAGEN_COST_PER_IMAGE;
    const veoCost = (apiCallSummary.veoSeconds || 0) * VEO_COST_PER_SECOND;
    return (proInputCost + proOutputCost + flashInputCost + flashOutputCost + imageCost + veoCost).toFixed(4);
  };

  // Load from Local Storage
  useEffect(() => {
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
    localStorage.setItem(MCP_CONFIG_STORAGE, JSON.stringify(mcpConfig));
  }, [mcpConfig]);

  useEffect(() => {
    if (appState === AppState.SUCCESS || assets.length > 0) {
      try {
        const stateToSave = { 
            shotBook, 
            projectName, 
            logEntries, 
            apiCallSummary, 
            scenePlans, 
            assets,
            guidanceFrames
        };
        const json = JSON.stringify(stateToSave);
        // Local storage limit is usually 5MB. If we exceed it, we strip images.
        if (json.length > 4500000) {
             const lightweightShotBook = shotBook?.map(shot => ({ ...shot, keyframeImage: undefined, keyframeHistory: undefined }));
             const lightweightAssets = assets.map(asset => ({ ...asset, image: undefined }));
             const lightweightGuidance = guidanceFrames.map(gf => ({ ...gf, image: undefined }));
             const lightweightState = { ...stateToSave, shotBook: lightweightShotBook, assets: lightweightAssets, guidanceFrames: lightweightGuidance };
             localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lightweightState));
             
             if (!hasWarnedLargeProject.current) {
                const hasKeyframes = shotBook?.some(s => s.keyframeImage);
                const hasAssets = assets.some(a => a.image);
                const hasGuidance = guidanceFrames.some(g => g.image);
                
                let message = "Project too large for local storage. ";
                if (hasAssets || hasGuidance) message += "Assets and ";
                if (hasKeyframes) message += "Keyframes ";
                message += "stripped from persistent cache. Please export ZIP to save work.";
                
                addLogEntry(message, LogType.INFO);
                hasWarnedLargeProject.current = true;
             }
        } else {
             localStorage.setItem(LOCAL_STORAGE_KEY, json);
             hasWarnedLargeProject.current = false;
        }
      } catch (e) {
          console.error("Storage error:", e);
      }
    }
  }, [shotBook, appState, projectName, logEntries, apiCallSummary, scenePlans, assets, guidanceFrames]);

  // VEO Polling
  useEffect(() => {
    if (!shotBook) return;
    const activeShots = shotBook.filter(s => s.veoStatus === VeoStatus.GENERATING || s.veoStatus === VeoStatus.QUEUED);
    if (activeShots.length === 0) return;
    const pollInterval = setInterval(async () => {
        let updated = false;
        const newShotBook = await Promise.all(shotBook.map(async (shot) => {
             if ((shot.veoStatus === VeoStatus.GENERATING || shot.veoStatus === VeoStatus.QUEUED) && shot.veoOperation) {
                 try {
                     const operation = await getVeoTaskDetails(shot.veoOperation);
                     if (operation.done) {
                         let newStatus: VeoStatus = VeoStatus.COMPLETED;
                         let newUrl = operation.response?.generatedVideos?.[0]?.video?.uri;
                         let error = undefined;
                         
                         if (!newUrl) {
                             newStatus = VeoStatus.FAILED;
                             error = "No video URL returned";
                         }

                         updated = true;
                         if (newStatus === VeoStatus.COMPLETED) addLogEntry(`Video ready for ${shot.id}`, LogType.SUCCESS);
                         else addLogEntry(`Video failed for ${shot.id}: ${error}`, LogType.ERROR);
                         
                         return { ...shot, veoStatus: newStatus, veoVideoUrl: newUrl, veoError: error, veoOperation: operation };
                     }
                 } catch (e) {
                     console.error("Polling error:", e);
                 }
             }
             return shot;
        }));
        if (updated) setShotBook(newShotBook as ShotBook);
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [shotBook]);

  const addLogEntry = (message: string, type: LogType = LogType.INFO) => {
    setLogEntries((prev) => [...prev, {timestamp: new Date().toLocaleTimeString(), message, type}]);
  };

  const updateApiSummary = (tokens: {input: number; output: number}, model: 'pro' | 'flash' | 'image' | 'veo', seconds: number = 0) => {
    setApiCallSummary((prev) => ({
      ...prev,
      [model]: prev[model] + 1,
      veoSeconds: model === 'veo' ? prev.veoSeconds + seconds : prev.veoSeconds,
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
      if (asset.image) {
          const newGuidance: GuidanceFrame = {
              id: asset.id,
              name: asset.name,
              image: asset.image
          };
          setGuidanceFrames(prev => {
              if (prev.some(f => f.id === asset.id)) return prev;
              return [...prev, newGuidance];
          });
      }
      addLogEntry(`Added asset: ${asset.name}`, LogType.INFO);
  };

  const handleRemoveAsset = (id: string) => setAssets(prev => prev.filter(a => a.id !== id));

  const handleUpdateAssetImage = async (id: string, file: File) => {
      try {
          const base64 = await fileToBase64(file);
          const mimeType = file.type;
          setAssets(prev => prev.map(a => a.id === id ? { ...a, image: { base64, mimeType } } : a));
          setGuidanceFrames(prev => prev.map(f => f.id === id ? { ...f, image: { base64, mimeType } } : f));
          addLogEntry("Updated asset image.", LogType.SUCCESS);
      } catch (e) { addLogEntry("Failed to process image.", LogType.ERROR); }
  };

  // GENERATION LOGIC
  const handleGenerate = async (scriptInput: string, createKeyframes: boolean) => {
    // Check for API key selection according to skill
    if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            setShowApiKeyDialog(true);
            return;
        }
    } else if (!process.env.API_KEY && !showApiKeyDialog) {
        // Fallback for environments without window.aistudio
        setShowApiKeyDialog(true);
        return;
    }

    stopGenerationRef.current = false;
    setIsProcessing(true);
    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLogEntries([]);
    setShotBook([]);
    setApiCallSummary({pro: 0, flash: 0, image: 0, veo: 0, veoSeconds: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0}});
    setLastPrompt({script: scriptInput, createKeyframes});

    try {
      addLogEntry('Starting generation process...', LogType.INFO);
      const nameData = await generateProjectName(scriptInput);
      setProjectName(nameData.result);
      if (nameData.thoughts) setCurrentThoughts(nameData.thoughts);
      updateApiSummary(nameData.tokens, 'flash');
      if (stopGenerationRef.current) throw new Error("Stopped.");

      addLogEntry('Generating shot list with visual inference...', LogType.INFO);
      const shotListData = await generateShotList(scriptInput, assets);
      const rawShots = shotListData.result;
      if (shotListData.thoughts) setCurrentThoughts(shotListData.thoughts);
      updateApiSummary(shotListData.tokens, 'pro');
      
      const initialShots: Shot[] = rawShots.map((s: any) => ({
        id: s.id, status: ShotStatus.PENDING_JSON, pitch: s.pitch, selectedAssetIds: [], guidanceFrameIds: [],
      }));
      setShotBook(initialShots);

      addLogEntry('Generating scene names...', LogType.INFO);
      const sceneNamesData = await generateSceneNames(rawShots, scriptInput);
      const sceneNameMap = sceneNamesData.result.names;
      if (sceneNamesData.thoughts) setCurrentThoughts(sceneNamesData.thoughts);
      updateApiSummary(sceneNamesData.tokens, 'flash');

      const shotsWithScenes = initialShots.map(shot => {
         const lastUnderscore = (shot.id || '').lastIndexOf('_');
         const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
         return { ...shot, sceneName: sceneNameMap.get(sceneId) || sceneId };
      });
      setShotBook(shotsWithScenes);
      saveProjectToFirebase(true); // Save initial shot list

      const sceneGroups = new Map<string, Shot[]>();
      shotsWithScenes.forEach(shot => {
          const lastUnderscore = (shot.id || '').lastIndexOf('_');
          const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
          if (!sceneGroups.has(sceneId)) sceneGroups.set(sceneId, []);
          sceneGroups.get(sceneId)?.push(shot);
      });

      addLogEntry(`Planning ${sceneGroups.size} scenes in parallel...`, LogType.INFO);
      const planPromises = Array.from(sceneGroups.entries()).map(async ([sceneId, shots]) => {
          if (stopGenerationRef.current) return null;
          addLogEntry(`Planning scene: ${sceneId}...`, LogType.STEP);
          const pitches = shots.map(s => `${s.id}: ${s.pitch}`).join('\n');
          const planData = await generateScenePlan(sceneId, pitches, scriptInput);
          updateApiSummary(planData.tokens, 'pro');
          if (planData.thoughts) setCurrentThoughts(planData.thoughts);
          return planData.result;
      });

      const planResults = await Promise.all(planPromises);
      const plans = planResults.filter((p): p is ScenePlan => p !== null);
      setScenePlans(plans);

      const finalShots = [...shotsWithScenes];
      addLogEntry(`Generating production data for ${finalShots.length} shots in parallel...`, LogType.INFO);
      
      const shotPromises = finalShots.map(async (shot, i) => {
        if (stopGenerationRef.current) return;
        
        addLogEntry(`Processing shot ${shot.id}...`, LogType.STEP);
        
        const matchedAssetIds: string[] = [];
        assets.forEach(asset => { 
            if ((shot.pitch || '').toLowerCase().includes((asset.name || '').toLowerCase())) matchedAssetIds.push(asset.id); 
        });
        
        setShotBook((prev) => prev ? prev.map((s) => s.id === shot.id ? { ...s, status: ShotStatus.GENERATING_JSON, selectedAssetIds: matchedAssetIds } : s) : null);
        
        const lastUnderscore = (shot.id || '').lastIndexOf('_');
        const sceneId = lastUnderscore !== -1 ? shot.id.substring(0, lastUnderscore) : shot.id;
        const relevantPlan = plans.find(p => p.scene_id === sceneId) || null;

        try {
          const jsonData = await generateAgnosticShotJson(shot.pitch, shot.id, scriptInput, relevantPlan, assets);
          if (jsonData.thoughts) setCurrentThoughts(jsonData.thoughts);
          updateApiSummary(jsonData.tokens, 'pro');
          
          let updatedShot: Shot = {
              ...shot,
              veoJson: jsonData.result,
              status: ShotStatus.PENDING_KEYFRAME_PROMPT,
              selectedAssetIds: matchedAssetIds
          };

          const charName = jsonData.result.veo_shot?.character?.name;
          if (charName && charName !== 'N/A') {
              const matchedChar = assets.find(a => a.type === 'character' && (a.name.toLowerCase().includes(charName.toLowerCase()) || charName.toLowerCase().includes(a.name.toLowerCase())));
              if (matchedChar && !updatedShot.selectedAssetIds.includes(matchedChar.id)) {
                  updatedShot.selectedAssetIds.push(matchedChar.id);
              }
          }

          setShotBook((prev) => prev ? prev.map((s) => s.id === shot.id ? updatedShot : s) : null);

          if (createKeyframes && updatedShot.veoJson) {
             addLogEntry(`Generating keyframe for ${shot.id}...`, LogType.STEP);
             setShotBook((prev) => prev ? prev.map((s) => s.id === shot.id ? { ...s, status: ShotStatus.GENERATING_KEYFRAME_PROMPT } : s) : null);
             
             const promptData = await generateKeyframePromptText(updatedShot.veoJson!.veo_shot);
             if (promptData.thoughts) setCurrentThoughts(promptData.thoughts);
             updateApiSummary(promptData.tokens, 'pro');
             
             setShotBook((prev) => prev ? prev.map((s) => s.id === shot.id ? { ...s, keyframePromptText: promptData.result, status: ShotStatus.GENERATING_IMAGE } : s) : null);
             
             const ingredients: IngredientImage[] = [];
             updatedShot.selectedAssetIds.forEach((id: string) => { const asset = assets.find(a => a.id === id); if (asset && asset.image) ingredients.push(asset.image); });
             updatedShot.guidanceFrameIds.forEach((id: string) => { const frame = guidanceFrames.find(f => f.id === id); if (frame) ingredients.push(frame.image); });

             const imageData = await generateKeyframeImage(promptData.result, ingredients, updatedShot.veoJson?.veo_shot?.scene?.aspect_ratio || "16:9");
             updateApiSummary({input: 0, output: 0}, 'image');
             
             setShotBook((prev: ShotBook | null) => prev ? prev.map((s) => s.id === shot.id ? { ...s, keyframeImage: imageData.result, keyframeHistory: [imageData.result], status: ShotStatus.NEEDS_REVIEW } : s) : null);
          } else {
             setShotBook((prev: ShotBook | null) => prev ? prev.map((s) => s.id === shot.id ? { ...s, status: ShotStatus.NEEDS_KEYFRAME_GENERATION } : s) : null);
          }
        } catch (e) {
          addLogEntry(`Failed to generate for ${shot.id}: ${(e as Error).message}`, LogType.ERROR);
          setShotBook((prev) => prev ? prev.map((s) => s.id === shot.id ? { ...s, status: ShotStatus.GENERATION_FAILED } : s) : null);
        }
      });

      await Promise.all(shotPromises);
      addLogEntry('Generation completed!', LogType.SUCCESS);
      setAppState(AppState.SUCCESS);
      saveProjectToFirebase(true); // Final save
    } catch (e) {
      setErrorMessage((e as Error).message || 'Error occurred.');
      setAppState(AppState.ERROR);
      addLogEntry(`Critical Error: ${(e as Error).message}`, LogType.ERROR);
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
      const updateShotStatus = (status: ShotStatus, extra?: Partial<Shot>) => setShotBook(prev => prev ? prev.map((s, i) => {
          if (i === shotIndex) {
              const newHistory = extra?.keyframeImage ? [...(s.keyframeHistory || []), extra.keyframeImage] : s.keyframeHistory;
              return { ...s, status, ...extra, keyframeHistory: newHistory };
          }
          return s;
      }) : null);
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
          setShotBook(prev => prev ? prev.map((s, i) => {
              if (i === shotIndex) {
                  const newHistory = [...(s.keyframeHistory || []), imageData.result];
                  return { ...s, veoJson: newJson, keyframePromptText: newPrompt, keyframeImage: imageData.result, keyframeHistory: newHistory, status: ShotStatus.NEEDS_REVIEW };
              }
              return s;
          }) : null);
      } catch (e) { setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, status: ShotStatus.GENERATION_FAILED } : s) : null); }
  };

  const handleGenerateVeoVideo = async (shotId: string) => {
      const shotIndex = shotBook?.findIndex(s => s.id === shotId) ?? -1;
      if (shotIndex === -1 || !shotBook) return;
      const shot = shotBook[shotIndex];
      
      // Calculate cost: $0.08 per second for Veo 3.1 Lite
      const duration = shot.veoJson?.veo_shot?.scene?.duration_s || 5;
      const cost = duration * VEO_COST_PER_SECOND;
      setShowVeoApproval({ shotId, cost });
  };

  const confirmGenerateVeoVideo = async () => {
      if (!showVeoApproval || !shotBook) return;
      const { shotId } = showVeoApproval;
      setShowVeoApproval(null);

      // Platform requirement: Ensure API key is selected
      if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
          await window.aistudio.openSelectKey();
      }

      const shotIndex = shotBook.findIndex(s => s.id === shotId);
      if (shotIndex === -1) return;
      const shot = shotBook[shotIndex];

      setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.QUEUED } : s) : null);
      try {
          const operation = await generateVeoVideo({ 
              prompt: shot.keyframePromptText!, 
              model: 'veo-3.1-lite-generate-preview', 
              aspectRatio: shot.veoJson?.veo_shot?.scene?.aspect_ratio as any || '16:9',
              imageBytes: shot.keyframeImage || undefined,
              mimeType: 'image/png'
          });
          const duration = shot.veoJson?.veo_shot?.scene?.duration_s || 5;
          updateApiSummary({input: 0, output: 0}, 'veo', duration);
          setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.GENERATING, veoOperation: operation } : s) : null);
          addLogEntry(`Veo 3.1 Lite generation started for ${shotId}`, LogType.INFO);
      } catch (e) { 
          const errorMsg = (e as Error).message;
          if (errorMsg.includes("Requested entity was not found")) {
              addLogEntry("API Key error. Please re-select your API key.", LogType.ERROR);
              if (window.aistudio) await window.aistudio.openSelectKey();
          }
          setShotBook(prev => prev ? prev.map((s, i) => i === shotIndex ? { ...s, veoStatus: VeoStatus.FAILED, veoError: errorMsg } : s) : null); 
          addLogEntry(`Veo generation failed: ${errorMsg}`, LogType.ERROR);
      }
  };

  const handleExtendVeoVideo = async (originalShotId: string, prompt: string) => {
      if (!shotBook) return;
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
          const operation = await extendVeoVideo({ 
              videoUri: originalShot.veoVideoUrl!, 
              prompt: prompt,
              aspectRatio: originalShot.veoJson?.veo_shot?.scene?.aspect_ratio as any || '16:9'
          });
          setShotBook(prev => prev ? prev.map(s => s.id === newShotId ? { ...s, veoStatus: VeoStatus.GENERATING, veoOperation: operation } : s) : null);
      } catch (e) { setShotBook(prev => prev ? prev.map(s => s.id === newShotId ? { ...s, veoStatus: VeoStatus.FAILED, veoError: (e as Error).message } : s) : null); }
  };

  const handleLoadProject = (json: string) => { try { const p = JSON.parse(json); if (p.shotBook) setShotBook(p.shotBook); if (p.projectName) setProjectName(p.projectName); setAssets(p.assets || []); setGuidanceFrames(p.guidanceFrames || []); setAppState(AppState.SUCCESS); } catch (e) {} };
  const handleSaveProject = () => { const blob = new Blob([JSON.stringify({ shotBook, projectName, logEntries, apiCallSummary, scenePlans, assets, guidanceFrames }, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${projectName || 'veo'}.json`; a.click(); };
  const handleDownloadKeyframesZip = async () => {
      if (!JSZip || !shotBook) return;
      const zip = new JSZip();
      
      const fetchImageAsBase64 = async (url: string) => {
          if (!url) return null;
          if (url.startsWith('data:')) {
              return url.split(',')[1];
          }
          try {
              const response = await fetch(url);
              const blob = await response.blob();
              return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                  reader.readAsDataURL(blob);
              });
          } catch (e) {
              console.error('Error fetching image for ZIP:', e);
              return null;
          }
      };

      // Keyframes
      const kfFolder = zip.folder("keyframes");
      let kfCount = 0;
      for (const shot of shotBook) {
          if (shot.keyframeHistory && shot.keyframeHistory.length > 0) {
              for (let idx = 0; idx < shot.keyframeHistory.length; idx++) {
                  const img = shot.keyframeHistory[idx];
                  const b64 = await fetchImageAsBase64(img);
                  if (b64) {
                      kfFolder?.file(`${shot.id}_v${idx + 1}.png`, b64, { base64: true });
                      kfCount++;
                  }
              }
          } else if (shot.keyframeImage) {
              const b64 = await fetchImageAsBase64(shot.keyframeImage);
              if (b64) {
                  kfFolder?.file(`${shot.id}.png`, b64, { base64: true });
                  kfCount++;
              }
          }
      }

      // Assets
      const assetFolder = zip.folder("assets");
      let assetCount = 0;
      for (const asset of assets) {
          if (asset.image) {
              const b64 = await fetchImageAsBase64(asset.image.base64);
              if (b64) {
                  assetFolder?.file(`${asset.name.replace(/\s+/g, '_')}_${asset.id}.png`, b64, { base64: true });
                  assetCount++;
              }
          }
      }

      // Guidance
      const guidanceFolder = zip.folder("guidance_frames");
      let guidanceCount = 0;
      for (const gf of guidanceFrames) {
          if (gf.image) {
              const b64 = await fetchImageAsBase64(gf.image.base64);
              if (b64) {
                  guidanceFolder?.file(`guidance_${gf.id}.png`, b64, { base64: true });
                  guidanceCount++;
              }
          }
      }

      if (kfCount === 0 && assetCount === 0 && guidanceCount === 0) {
          addLogEntry("No images found to download.", LogType.INFO);
          return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'project'}_images.zip`;
      a.click();
      addLogEntry(`Downloaded ${kfCount} keyframes, ${assetCount} assets, and ${guidanceCount} guidance frames.`, LogType.SUCCESS);
  };
  const handleExportPackage = async () => { 
      if (!JSZip || !shotBook) return; 
      const zip = new JSZip(); 
      const root = zip.folder(projectName || "project"); 
      root.file("shot_list.json", JSON.stringify(shotBook, null, 2)); 
      root.file("assets.json", JSON.stringify(assets, null, 2));
      root.file("guidance_frames.json", JSON.stringify(guidanceFrames, null, 2));

      const kfFolder = root.folder("keyframes");
      shotBook.forEach(shot => {
          if (shot.keyframeHistory && shot.keyframeHistory.length > 0) {
              shot.keyframeHistory.forEach((img, idx) => {
                  kfFolder.file(`${shot.id}_v${idx + 1}.png`, img, { base64: true });
              });
          } else if (shot.keyframeImage) {
              kfFolder.file(`${shot.id}.png`, shot.keyframeImage, { base64: true });
          }
      });

      const assetFolder = root.folder("assets");
      assets.forEach(asset => {
          if (asset.image) {
              assetFolder.file(`${asset.name.replace(/\s+/g, '_')}_${asset.id}.png`, asset.image.base64, { base64: true });
          }
      });

      const guidanceFolder = root.folder("guidance_frames");
      guidanceFrames.forEach(gf => {
          if (gf.image) {
              guidanceFolder.file(`guidance_${gf.id}.png`, gf.image.base64, { base64: true });
          }
      });

      const content = await zip.generateAsync({type: "blob"}); 
      const url = URL.createObjectURL(content); 
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `${projectName || 'package'}.zip`; 
      a.click(); 
      addLogEntry("Full project package exported successfully.", LogType.SUCCESS);
  };

  return (
    <div className="min-h-screen font-sans text-gray-100 bg-[#121212]">
      {appState === AppState.LOADING && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-6 max-w-4xl w-full px-4">
              <LoadingIndicator 
                status={logEntries.length > 0 ? logEntries[logEntries.length - 1].message : undefined} 
              />
              
              {currentThoughts && (
                <div className="bg-gray-900/90 border border-indigo-500/30 rounded-xl p-6 w-full max-h-[40vh] overflow-y-auto shadow-2xl">
                  <h3 className="text-indigo-400 font-semibold mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                    Model Reasoning
                  </h3>
                  <p className="text-gray-300 text-sm font-mono leading-relaxed whitespace-pre-wrap">
                    {currentThoughts}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 text-sm">
                  <span className="text-gray-400">Estimated Cost:</span>
                  <span className="ml-2 text-green-400 font-mono">${calculateTotalCost()}</span>
                </div>
                <button 
                  onClick={() => { stopGenerationRef.current = true; setIsProcessing(false); setAppState(AppState.IDLE); }} 
                  className="px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <StopCircleIcon className="w-5 h-5" /> Stop
                </button>
              </div>
            </div>
          </div>
      )}
      {showApiKeyDialog && (
          <ApiKeyDialog 
            onContinue={async () => {
                if (window.aistudio) {
                    await window.aistudio.openSelectKey();
                }
                setShowApiKeyDialog(false);
            }} 
          />
      )}
      <ConfirmDialog isOpen={showNewProjectDialog} title="Start New Project?" message="Clear script and shot list? Assets will be kept." onConfirm={() => { setShotBook(null); setProjectName(null); setLogEntries([]); setAppState(AppState.IDLE); setShowNewProjectDialog(false); }} onCancel={() => setShowNewProjectDialog(false)} />
      <ConfirmDialog 
          isOpen={!!showVeoApproval} 
          title="Approve Veo Generation Cost" 
          message={`Generating this video with Veo 3.1 Lite will cost approximately $${showVeoApproval?.cost.toFixed(2)}. Do you want to proceed?`} 
          onConfirm={confirmGenerateVeoVideo} 
          onCancel={() => setShowVeoApproval(null)} 
      />
      <ConfirmDialog isOpen={showResetDialog} title="Reset Application?" message="This will clear ALL data including assets and guidance frames. This cannot be undone." onConfirm={() => { setShotBook(null); setProjectName(null); setLogEntries([]); setAppState(AppState.IDLE); setAssets([]); setGuidanceFrames([]); setApiCallSummary({ pro: 0, flash: 0, image: 0, veo: 0, veoSeconds: 0, proTokens: {input: 0, output: 0}, flashTokens: {input: 0, output: 0} }); localStorage.removeItem(LOCAL_STORAGE_KEY); setShowResetDialog(false); }} onCancel={() => setShowResetDialog(false)} />
      <StorageInfoDialog isOpen={showStorageInfoDialog} onClose={() => setShowStorageInfoDialog(false)} />
      <main className="flex flex-col items-center p-4 md:p-8 min-h-screen max-w-[1920px] mx-auto">
        {appState === AppState.IDLE && (
          <div className="flex flex-col items-center w-full max-w-4xl animate-in fade-in duration-700">
            <div className="mb-8 text-center relative w-full">
              <div className="absolute top-0 right-0">
                <button 
                  onClick={() => setShowResetDialog(true)}
                  className="px-3 py-1 text-xs bg-red-900/30 hover:bg-red-800/50 text-red-300 border border-red-800/50 rounded transition-colors"
                >
                  Reset App
                </button>
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-4 tracking-tight">VEO Prompt Machine</h1>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">Transform scripts into VEO 3.1 prompts and DaVinci Resolve timelines.</p>
            </div>
            <ProjectSetupForm onGenerate={handleGenerate} isGenerating={false} onLoadProject={handleLoadProject} assets={assets} onAnalyzeScriptForAssets={handleAnalyzeScriptForAssets} isAnalyzingAssets={isAnalyzingAssets} onAddAsset={handleAddAsset} onRemoveAsset={handleRemoveAsset} onUpdateAssetImage={handleUpdateAssetImage} />
          </div>
        )}
        {appState !== AppState.IDLE && shotBook && (
          <ShotBookDisplay 
            shotBook={shotBook} 
            logEntries={logEntries} 
            projectName={projectName} 
            scenePlans={scenePlans} 
            apiCallSummary={apiCallSummary} 
            appVersion={PROJECT_VERSION} 
            onNewProject={() => setShowNewProjectDialog(true)} 
            onReset={() => setShowResetDialog(true)} 
            onUpdateShot={handleUpdateShot} 
            onGenerateSpecificKeyframe={handleGenerateSpecificKeyframe} 
            onRefineShot={handleRefineShot} 
            allAssets={assets} 
            onToggleAssetForShot={handleToggleAssetForShot} 
            onExportAllJsons={() => {}} 
            onExportHtmlReport={() => {}} 
            onSaveProject={handleSaveProject} 
            onLoadProject={handleLoadProject}
            onDownloadKeyframesZip={handleDownloadKeyframesZip} 
            onExportPackage={handleExportPackage} 
            onShowStorageInfo={() => setShowStorageInfoDialog(true)} 
            isProcessing={isProcessing} 
            onStopGeneration={() => { stopGenerationRef.current = true; setIsProcessing(false); }} 
            onGenerateVideo={handleGenerateVeoVideo} 
            onExtendVeoVideo={handleExtendVeoVideo} 
            mcpConfig={mcpConfig} 
            onSetMcpUrl={(url) => setMcpConfig(prev => ({ ...prev, url }))} 
            onConnectMcp={handleConnectMcp} 
            onSyncToResolve={handleSyncShotToMcp} 
            guidanceFrames={guidanceFrames} 
            onAddGuidanceFrame={handleAddGuidanceFrame} 
            onRemoveGuidanceFrame={handleRemoveGuidanceFrame} 
            onToggleGuidanceForShot={handleToggleGuidanceForShot} 
            onGenerateAllKeyframes={handleGenerateAllKeyframes} 
            user={user}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
        )}
        <footer className="mt-auto py-6 text-center text-gray-600 text-sm"><p>Powered by Google Gemini & Veo 3.1 • DaVinci Resolve Integration via MCP</p></footer>
      </main>
    </div>
  );
};

export default App;
