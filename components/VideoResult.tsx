
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useEffect, useRef, useState} from 'react';
import {
  ApiCallSummary,
  IngredientImage,
  LogEntry,
  ProjectAsset,
  ScenePlan,
  Shot,
  ShotBook,
  ShotStatus,
  VeoShotWrapper,
  VeoStatus,
  McpServerConfig,
  GuidanceFrame,
} from '../types';
import ActivityLog from './ActivityLog';
import {
  ArrowPathIcon,
  BracesIcon,
  CheckCircle2Icon,
  ClipboardDocumentIcon,
  ClockIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileJsonIcon,
  FilePenLineIcon,
  FileTextIcon,
  FilmIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  XMarkIcon,
  RectangleStackIcon,
  InfoIcon,
  StopCircleIcon,
  ClapperboardIcon,
  MessageSquarePlusIcon,
  TerminalIcon,
  VideoIcon,
  SettingsIcon,
  FastForwardIcon,
  ArrowRightIcon,
  UploadCloudIcon,
  FramesModeIcon,
  ChevronDownIcon,
} from './icons';

interface ShotCardProps {
  shot: Shot;
  onUpdateShot: (shot: Shot) => void;
  onGenerateSpecificKeyframe: (shotId: string) => void; 
  onRefineShot: (shotId: string, feedback: string) => void; 
  allAssets: ProjectAsset[];
  onToggleAssetForShot: (shotId: string, assetId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  onExtendVeoVideo: (originalShotId: string, prompt: string) => void;
  mcpEnabled: boolean;
  onSyncToResolve: (shotId: string) => void;
  guidanceFrames: GuidanceFrame[];
  onToggleGuidanceForShot: (shotId: string, frameId: string) => void;
}

const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  onUpdateShot,
  onGenerateSpecificKeyframe,
  onRefineShot,
  allAssets,
  onToggleAssetForShot,
  onGenerateVideo,
  onExtendVeoVideo,
  mcpEnabled,
  onSyncToResolve,
  guidanceFrames,
  onToggleGuidanceForShot,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [isDirectorMode, setIsDirectorMode] = useState(false);
  const [directorFeedback, setDirectorFeedback] = useState('');
  const [isExtendMode, setIsExtendMode] = useState(false);
  const [extendPrompt, setExtendPrompt] = useState('');
  const [showGuidancePicker, setShowGuidancePicker] = useState(false);

  useEffect(() => {
    setEditedJson(shot.veoJson ? JSON.stringify(shot.veoJson, null, 2) : '');
  }, [shot.veoJson]);

  const handleSaveEdit = () => {
    try {
      const updatedVeoJson: VeoShotWrapper = JSON.parse(editedJson);
      onUpdateShot({...shot, veoJson: updatedVeoJson});
      setIsEditing(false);
    } catch (error) { alert('Invalid JSON format.'); }
  };

  const selectedGuidanceIds = shot.guidanceFrameIds || [];

  return (
    <div className={`bg-gray-800/50 border rounded-xl p-4 md:p-6 transition-all duration-300 ${shot.mcpSynced ? 'border-indigo-500/50' : 'border-gray-700'}`}>
      <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
        <div className="w-full md:w-1/3 flex-shrink-0">
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-600 mb-3 flex items-center justify-center relative group">
            {shot.status === ShotStatus.GENERATING_IMAGE || shot.status === ShotStatus.GENERATING_KEYFRAME_PROMPT ? (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
            ) : null}
            {shot.veoStatus === VeoStatus.COMPLETED && shot.veoVideoUrl ? (
                <video src={shot.veoVideoUrl} controls className="w-full h-full object-cover" />
            ) : shot.keyframeImage ? (
              <img src={`data:image/png;base64,${shot.keyframeImage}`} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-gray-500"><FilmIcon className="w-12 h-12 mb-2" /><span className="text-sm">No Preview</span></div>
            )}
            {shot.mcpSynced && (
                <div className="absolute top-2 right-2 bg-indigo-600 text-white p-1 rounded-full shadow-lg">
                    <CheckCircle2Icon className="w-4 h-4" />
                </div>
            )}
          </div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-indigo-400">{shot.id}</h3>
          </div>
          <p className="text-sm text-gray-300 bg-gray-900/70 p-3 rounded-md mb-3">{shot.pitch}</p>
          
          {/* Guidance Picker UI */}
          <div className="relative">
              <button 
                onClick={() => setShowGuidancePicker(!showGuidancePicker)}
                className="w-full py-1.5 px-3 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-white flex justify-between items-center transition-colors"
              >
                  <span className="flex items-center gap-2">
                      <FramesModeIcon className="w-3 h-3 text-indigo-400" />
                      {selectedGuidanceIds.length > 0 ? `${selectedGuidanceIds.length} Guidance Frames` : 'Add Guidance Frames'}
                  </span>
                  <ChevronDownIcon className={`w-3 h-3 transition-transform ${showGuidancePicker ? 'rotate-180' : ''}`} />
              </button>
              
              {showGuidancePicker && (
                  <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-3 z-20 animate-in slide-in-from-bottom-2">
                      <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Reference Media Bin</h5>
                      {guidanceFrames.length === 0 ? (
                          <p className="text-[10px] text-gray-600 text-center py-2 italic">Upload images to the Media Bin first.</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {guidanceFrames.map(f => (
                                <button 
                                    key={f.id}
                                    onClick={() => onToggleGuidanceForShot(shot.id, f.id)}
                                    className={`aspect-square rounded border-2 overflow-hidden transition-all ${selectedGuidanceIds.includes(f.id) ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                >
                                    <img src={`data:image/png;base64,${f.image.base64}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                      )}
                  </div>
              )}
          </div>
        </div>

        <div className="w-full md:w-2/3 flex-grow">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-semibold text-gray-400 uppercase text-xs tracking-widest">VEO Production Data</h4>
            {mcpEnabled && (
                <button 
                    onClick={() => onSyncToResolve(shot.id)}
                    className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold transition-all ${shot.mcpSynced ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                >
                    <ArrowRightIcon className="w-3 h-3" />
                    {shot.mcpSynced ? 'Resync to Resolve' : 'Sync to Resolve'}
                </button>
            )}
          </div>

          {isDirectorMode ? (
              <div className="bg-indigo-900/30 border border-indigo-500 rounded-lg p-4 mb-4">
                  <textarea value={directorFeedback} onChange={(e) => setDirectorFeedback(e.target.value)} placeholder="Director's notes..." className="w-full h-24 bg-black/50 border border-indigo-700 rounded-md p-3 text-sm text-white focus:outline-none" />
                  <div className="flex justify-end gap-2 mt-3">
                      <button onClick={() => setIsDirectorMode(false)} className="px-3 py-1.5 text-xs text-gray-300">Cancel</button>
                      <button onClick={() => { onRefineShot(shot.id, directorFeedback); setIsDirectorMode(false); }} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded">Apply Refinement</button>
                  </div>
              </div>
          ) : isExtendMode ? (
              <div className="bg-green-900/30 border border-green-500 rounded-lg p-4 mb-4">
                  <textarea value={extendPrompt} onChange={(e) => setExtendPrompt(e.target.value)} placeholder="Extension details..." className="w-full h-24 bg-black/50 border border-green-700 rounded-md p-3 text-sm text-white focus:outline-none" />
                  <div className="flex justify-end gap-2 mt-3">
                      <button onClick={() => setIsExtendMode(false)} className="px-3 py-1.5 text-xs text-gray-300">Cancel</button>
                      <button onClick={() => { onExtendVeoVideo(shot.id, extendPrompt); setIsExtendMode(false); }} className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded">Generate Extend</button>
                  </div>
              </div>
          ) : isEditing ? (
            <div className="flex flex-col gap-2">
                <textarea value={editedJson} onChange={(e) => setEditedJson(e.target.value)} className="w-full h-64 overflow-auto font-mono text-xs bg-black/50 border border-indigo-500 rounded-md p-3 text-indigo-100 focus:outline-none" />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Discard</button>
                    <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded">Save Changes</button>
                </div>
            </div>
          ) : (
            <pre className="w-full h-64 overflow-auto font-mono text-xs bg-black/50 border border-gray-700 rounded-md p-3 group relative">
              <code>{shot.veoJson ? JSON.stringify(shot.veoJson, null, 2) : 'Awaiting generation...'}</code>
              <button 
                onClick={() => navigator.clipboard.writeText(JSON.stringify(shot.veoJson, null, 2))}
                className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </pre>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {!isDirectorMode && !isExtendMode && !isEditing && (
                <>
                    <button onClick={() => setIsDirectorMode(true)} className="px-3 py-1.5 bg-indigo-700/50 border border-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors hover:bg-indigo-600">Director Mode</button>
                    <button onClick={() => onGenerateSpecificKeyframe(shot.id)} className="px-3 py-1.5 bg-purple-700/50 border border-purple-500 text-white text-xs font-semibold rounded-lg hover:bg-purple-600">Regen Keyframe</button>
                    {shot.veoStatus !== VeoStatus.COMPLETED && <button onClick={() => onGenerateVideo(shot.id)} className="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg">Generate Video</button>}
                    {shot.veoStatus === VeoStatus.COMPLETED && <button onClick={() => setIsExtendMode(true)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg">Extend Video</button>}
                    <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 bg-gray-700 text-white text-xs font-semibold rounded-lg">Edit JSON</button>
                </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShotBookDisplayProps {
  shotBook: ShotBook;
  logEntries: LogEntry[];
  projectName: string | null;
  scenePlans: ScenePlan[] | null;
  apiCallSummary: ApiCallSummary;
  appVersion: string;
  onNewProject: () => void;
  onUpdateShot: (shot: Shot) => void;
  onGenerateSpecificKeyframe: (shotId: string) => void; 
  onRefineShot: (shotId: string, feedback: string) => void;
  allAssets: ProjectAsset[];
  onToggleAssetForShot: (shotId: string, assetId: string) => void;
  onSaveProject: () => void;
  onExportPackage: () => void;
  onShowStorageInfo: () => void;
  isProcessing: boolean;
  onStopGeneration: () => void;
  veoApiKey: string;
  onSetVeoApiKey: (key: string) => void;
  onGenerateVideo: (shotId: string) => void;
  onExtendVeoVideo: (originalShotId: string, prompt: string) => void;
  mcpConfig: McpServerConfig;
  onSetMcpUrl: (url: string) => void;
  onConnectMcp: () => void;
  onSyncToResolve: (shotId: string) => void;
  // Guidance media
  guidanceFrames: GuidanceFrame[];
  onAddGuidanceFrame: (file: File) => void;
  onRemoveGuidanceFrame: (id: string) => void;
  onToggleGuidanceForShot: (shotId: string, frameId: string) => void;
  onGenerateAllKeyframes: () => void;
  onExportAllJsons: () => void;
  onExportHtmlReport: () => void;
  onDownloadKeyframesZip: () => void;
}

const ShotBookDisplay: React.FC<ShotBookDisplayProps> = ({
  shotBook,
  logEntries,
  projectName,
  onNewProject,
  onUpdateShot,
  onGenerateSpecificKeyframe, 
  onRefineShot,
  allAssets,
  onToggleAssetForShot,
  onSaveProject,
  onExportPackage,
  onShowStorageInfo,
  isProcessing,
  onStopGeneration,
  veoApiKey,
  onSetVeoApiKey,
  onGenerateVideo,
  onExtendVeoVideo,
  mcpConfig,
  onSetMcpUrl,
  onConnectMcp,
  onSyncToResolve,
  guidanceFrames,
  onAddGuidanceFrame,
  onRemoveGuidanceFrame,
  onToggleGuidanceForShot,
  onGenerateAllKeyframes,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const groupedShots = shotBook.reduce((acc, shot) => {
      const sceneId = shot.id.substring(0, shot.id.lastIndexOf('_'));
      if (!acc[sceneId]) acc[sceneId] = [];
      acc[sceneId].push(shot);
      return acc;
    }, {} as Record<string, Shot[]>);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onAddGuidanceFrame(file);
      if (e.target) e.target.value = '';
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 p-1">
      <header className="flex-shrink-0 bg-[#1f1f1f] border border-gray-700 rounded-2xl shadow-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white">{projectName || 'Untitled Project'}</h2>
          <span className="px-2 py-0.5 bg-indigo-900/50 text-indigo-400 text-[10px] font-bold rounded uppercase border border-indigo-700">Production Mode</span>
        </div>
        <div className="flex flex-wrap gap-3 justify-center items-center">
          <div className="relative">
              <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg border transition-all ${showSettings ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  <SettingsIcon className="w-5 h-5" />
              </button>
              {showSettings && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95">
                      <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                             <VideoIcon className="w-4 h-4 text-indigo-400" />
                             <h4 className="font-bold text-white text-sm">VEO API Settings</h4>
                          </div>
                          <input type="password" value={veoApiKey} onChange={(e) => onSetVeoApiKey(e.target.value)} placeholder="Enter Veo Bearer Token" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                          <p className="text-[10px] text-gray-500 mt-1 italic">Required for video generation and extensions.</p>
                      </div>
                      <div className="border-t border-gray-700 pt-4">
                          <div className="flex items-center gap-2 mb-2">
                             <TerminalIcon className="w-4 h-4 text-indigo-400" />
                             <h4 className="font-bold text-white text-sm">Resolve MCP Bridge</h4>
                          </div>
                          <input type="text" value={mcpConfig.url} onChange={(e) => onSetMcpUrl(e.target.value)} placeholder="http://localhost:3000" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white mb-2 focus:outline-none focus:border-indigo-500" />
                          <button onClick={onConnectMcp} className={`w-full py-2 rounded text-xs font-bold transition-colors ${mcpConfig.connected ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                              {mcpConfig.connected ? 'Connected to Resolve' : 'Connect to MCP Server'}
                          </button>
                          {mcpConfig.connected && <p className="text-[10px] text-green-400 mt-2 text-center">✓ {mcpConfig.tools.length} Tools Discovered</p>}
                      </div>
                      <div className="border-t border-gray-700 pt-4 mt-4">
                          <button onClick={onNewProject} className="w-full py-2 rounded text-xs font-bold bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60">Destroy Project & Reset</button>
                      </div>
                  </div>
              )}
          </div>
          <button onClick={onGenerateAllKeyframes} disabled={isProcessing} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm shadow-lg shadow-purple-600/20 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4" />
              Generate All Keyframes
          </button>
          <button onClick={onSaveProject} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg text-sm">Save Backup</button>
          <button onClick={onExportPackage} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg text-sm border border-green-500">Export ZIP Package</button>
        </div>
      </header>

      <div className="flex-grow w-full flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* Sidebar Left: Media Bin & Logs */}
        <div className="w-full md:w-1/4 flex flex-col gap-4 overflow-hidden">
            {/* Media Guidance Bin */}
            <div className="bg-[#1f1f1f] border border-gray-700 rounded-2xl p-4 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                        <FramesModeIcon className="w-4 h-4 text-indigo-400" />
                        Media Guidance Bin
                    </h3>
                    <button 
                        onClick={() => mediaInputRef.current?.click()}
                        className="p-1 hover:bg-gray-700 rounded text-indigo-400 transition-colors"
                        title="Add Reference Media"
                    >
                        <PlusIcon className="w-5 h-5" />
                    </button>
                    <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} className="hidden" accept="image/*" />
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {guidanceFrames.map(f => (
                        <div key={f.id} className="relative aspect-square bg-black rounded border border-gray-600 group overflow-hidden">
                            <img src={`data:image/png;base64,${f.image.base64}`} className="w-full h-full object-cover" />
                            <button 
                                onClick={() => onRemoveGuidanceFrame(f.id)}
                                className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <XMarkIcon className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    {guidanceFrames.length === 0 && (
                        <div className="col-span-3 py-6 text-center text-[10px] text-gray-600 italic border border-dashed border-gray-700 rounded-lg">
                            Upload reference images to guide visual continuity.
                        </div>
                    )}
                </div>
            </div>

            <ActivityLog entries={logEntries} />
        </div>

        {/* Main Content: Shot List */}
        <div className="w-full md:w-3/4 h-full flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-10">
          {Object.entries(groupedShots).map(([sceneId, shotsInScene]) => (
            <div key={sceneId} className="space-y-4">
              <div className="bg-gray-900/50 p-3 rounded-xl border-l-4 border-indigo-500 backdrop-blur-sm sticky top-0 z-10 shadow-lg">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">{sceneId.replace(/_/g, ' ')}</h3>
                    <span className="text-[10px] text-gray-500 font-mono">{shotsInScene.length} SHOTS</span>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {shotsInScene.map((shot) => (
                  <ShotCard 
                    key={shot.id} 
                    shot={shot} 
                    onUpdateShot={onUpdateShot} 
                    onGenerateSpecificKeyframe={onGenerateSpecificKeyframe} 
                    onRefineShot={onRefineShot} 
                    allAssets={allAssets} 
                    onToggleAssetForShot={onToggleAssetForShot} 
                    onGenerateVideo={onGenerateVideo} 
                    onExtendVeoVideo={onExtendVeoVideo} 
                    mcpEnabled={mcpConfig.connected} 
                    onSyncToResolve={onSyncToResolve} 
                    guidanceFrames={guidanceFrames}
                    onToggleGuidanceForShot={onToggleGuidanceForShot}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShotBookDisplay;
