import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveRenderSession } from '../collab/useLiveRenderSession';
import { 
  Sparkles, 
  Play, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Download, 
  Star,
  Users,
  Camera,
  Sun,
  Sliders,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Edit3,
  RotateCcw,
  Save,
  FolderOpen,
  Share2
} from 'lucide-react';
import { WORKFLOWS, Workflow } from '../../services/aiRender/workflowRegistry';
import { PromptEnhancerEngine } from '../../services/aiRender/promptEnhancer';
import { MODELS, WorkflowCostEstimator, isControlNetSupported, CONTROLNET_MODELS } from '../../services/aiRender/modelPricingRegistry';
import { RasterCanvasView } from '../../src/features/raster-canvas/components/RasterCanvasView';
import { useGraphStore } from '../../src/features/ai-rendering-canvas/state/useGraphStore';
import { AiRenderingCanvas } from '../../src/features/ai-rendering-canvas/components/AiRenderingCanvas';
import { HubType as GraphHubType, CanvasNodeData } from '../../src/features/ai-rendering-canvas/types/graph';
import { RasterCanvasOverlay } from '../../src/features/ai-rendering-canvas/components/RasterCanvasOverlay';
import { ImageFullscreenModal } from '../../src/features/ai-rendering-canvas/components/ImageFullscreenModal';
import { useAccount } from '../account/AccountProvider';
import RenderSessionsPanel from '../RenderSessionsPanel';
import { loadRenderSessionWithRole, saveRenderSession, StorageLimitError, type CloudRenderSessionSummary } from '../../services/firebase/renderSessionsService';
import { canEdit, type ProjectRole } from '../../services/firebase/shareAccess';
import { usePresence } from '../collab/usePresence';
import { renderSessionThumbnail } from '../../services/firebase/renderSessionThumbnail';
import { defaultSessionName } from '../../services/firebase/renderSessionSerialize';

import { ArchElement } from '../../types';

// Saved sessions hold Storage URLs; generation needs the bytes back as a data URL.
const toDataUrl = async (value?: string): Promise<string | undefined> => {
  if (!value || value.startsWith('data:')) return value;
  if (!/^https?:/i.test(value)) return value;
  const blob = await fetch(value).then(r => {
    if (!r.ok) throw new Error(`Image download failed (HTTP ${r.status}).`);
    return r.blob();
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Image could not be read.'));
    reader.readAsDataURL(blob);
  });
};

interface AiRenderingPanelProps {
  onClose: () => void;
  initialHub?: GraphHubType;
  initialSnapshots?: {url: string, name: string}[];
  onSnapshotsConsumed?: () => void;
  onApplyToCanvas?: (elements: ArchElement[], options?: { viewMode?: '2D' | '3D' }) => void;
}

interface OutputItem {
  type: 'image' | 'video' | '3d';
  signed_url: string;
  mime_type: string;
}

export type DrawingType = 
  | 'Floor Plan' 
  | 'Elevation' 
  | 'Sketch / Line Drawing' 
  | '3D Model / Massing Screenshot' 
  | 'Section Drawing' 
  | 'Custom';

export type ReferenceAspect = 
  | 'All (Complete Theme & Mood)'
  | 'Lighting & Atmosphere' 
  | 'Visual Style & Theme' 
  | 'Materials & Textures' 
  | 'Furniture & Decor' 
  | 'Environment & Landscape';

export interface UploadedImageItem {
  id: string;
  name: string;
  base64: string;
  category?: 'drawing' | 'reference';
  drawingType?: DrawingType;
  customDrawingType?: string;
  referenceAspects?: ReferenceAspect[];
  label?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
}

interface Job {
  jobId: string;
  workflowId: number;
  status: 'queued' | 'normalizing' | 'preprocessing' | 'generating' | 'postprocessing' | 'completed' | 'failed' | 'cancelled';
  userPrompt: string;
  compiledPrompt: string;
  model: string;
  outputs: OutputItem[];
  processingTimeMs: number;
  actualCostUsdEstimate: number;
  error?: string;
  userRating?: number;
}

type HubType = 'image_studio' | 'raster_canvas' | 'video_studio' | 'gen_3d';

export const AiRenderingPanel: React.FC<AiRenderingPanelProps> = ({ initialHub = 'image_studio', onClose, initialSnapshots, onSnapshotsConsumed, onApplyToCanvas }) => {
  const initialAllWorkflows = Object.values(WORKFLOWS);
  const initialHubWfs = initialAllWorkflows.filter(w => w.hubCategory === 'image_studio');
  const [activeHub, setActiveHub] = useState<HubType>(initialHub);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(initialHubWfs[0] || initialAllWorkflows[0] || null);
  
  // Selected configuration options
  const [selectedModel, setSelectedModel] = useState('');
  const [userInput, setUserInput] = useState('');
  const [resolution, setResolution] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [customImageAspectRatio, setCustomImageAspectRatio] = useState<string | null>(null);
  const [inputImageDimensions, setInputImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(4);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [cameraMotion, setCameraMotion] = useState('slow horizontal pan');

  // ControlNet conditioning states (for image-required workflows like Sketch to Render)
  const [controlNetEnabled, setControlNetEnabled] = useState(true);
  const [controlNetStrength, setControlNetStrength] = useState(80); // 0% to 100%
  
  // Multi-Image Upload states
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [rasterCanvasInitialImage, setRasterCanvasInitialImage] = useState<string | undefined>(undefined);

  // AI Rendering Canvas Node Graph State
  const graphStore = useGraphStore();
  const graphStoreRef = useRef(graphStore);
  graphStoreRef.current = graphStore;
  const [activeBranchParentId, setActiveBranchParentId] = useState<string | null>(null);
  const activeRunningNodeIdRef = useRef<string | null>(null);

  // Saved render sessions (see services/firebase/renderSessionsService.ts)
  const { user, openAuth, openShare, pendingSharedSessionId, consumePendingSharedSession, announceSharedArrival } = useAccount();
  const [sessionMeta, setSessionMeta] = useState<{ id: string; name: string; role: ProjectRole; ownerId: string } | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isSessionsPanelOpen, setIsSessionsPanelOpen] = useState(false);
  const [isSessionDirty, setIsSessionDirty] = useState(false);

  // Live co-editing of the graph itself: node moves, new nodes, prompts and finished renders.
  const liveSessionStatus = useLiveRenderSession({
    sessionId: sessionMeta?.id || null,
    ownerId: sessionMeta?.ownerId || null,
    user,
    store: graphStore,
  });

  // Live presence for a saved session: everyone with it open shares one room.
  const presenceRoom = sessionMeta ? `rs_${sessionMeta.id}` : null;
  const presence = usePresence(presenceRoom, user);
  useEffect(() => {
    if (presenceRoom) presence.setView({ viewMode: 'render', drawingView: 'render', activeLevelId: 'render' });
  }, [presenceRoom, presence]);
  // Share which node is selected, so collaborators see it outlined in this user's colour.
  const selectedGraphNodeId = graphStore.selectedNodeId;
  useEffect(() => {
    if (presenceRoom) presence.setSelection(selectedGraphNodeId ? [selectedGraphNodeId] : []);
  }, [presenceRoom, presence, selectedGraphNodeId]);
  const publishGraphPointer = useCallback(
    (point: { x: number; y: number } | null) => presence.setCursor(point),
    [presence],
  );

  // Active Job states
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobIntervalId, setJobIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [variants, setVariants] = useState(1);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);

  // Load workflows
  useEffect(() => {
    const allWfs = Object.values(WORKFLOWS);
    const initialHubWfs = allWfs.filter(w => w.hubCategory === 'image_studio');
    if (initialHubWfs.length > 0) {
      setSelectedWorkflow(initialHubWfs[0]);
    }
  }, []);

  useEffect(() => {
    setActiveHub(initialHub);
  }, [initialHub]);

  useEffect(() => {
    if (initialSnapshots && initialSnapshots.length > 0) {
      initialSnapshots.forEach(snap => {
        graphStore.addCompletedImageNode(undefined, snap.url, [], snap.name, 'image_studio');
      });
      if (onSnapshotsConsumed) {
        onSnapshotsConsumed();
      }
    }
  }, [initialSnapshots, onSnapshotsConsumed]);

  // Mark the session dirty whenever the canvas changes, so the header can show unsaved work.
  useEffect(() => {
    setIsSessionDirty(true);
  }, [graphStore.nodes, graphStore.edges]);

  const handleSaveSession = useCallback(async () => {
    if (!user) {
      openAuth();
      return;
    }
    const snapshot = graphStoreRef.current.getSnapshot();
    if (snapshot.nodes.length === 0) return;
    setIsSavingSession(true);
    setSessionError(null);
    setSaveProgress('');
    try {
      const thumbnailDataUrl = await renderSessionThumbnail(snapshot.nodes);
      const canOverwrite = !sessionMeta || canEdit(sessionMeta.role);
      const { sessionId } = await saveRenderSession(
        user.uid,
        snapshot,
        activeHub as GraphHubType,
        {
          sessionId: canOverwrite ? sessionMeta?.id || null : null,
          name: sessionMeta?.name || defaultSessionName(),
          thumbnailDataUrl,
          ownerEmail: user.email,
          onProgress: (done, total) => setSaveProgress(total > 1 ? `${done}/${total}` : ''),
        },
      );
      setSessionMeta(prev => ({
        id: sessionId,
        name: canOverwrite ? prev?.name || defaultSessionName() : `${prev?.name || 'Render session'} (copy)`,
        role: canOverwrite ? prev?.role || 'owner' : 'owner',
        ownerId: canOverwrite ? prev?.ownerId || user.uid : user.uid,
      }));
      setIsSessionDirty(false);
    } catch (error: any) {
      setSessionError(error instanceof StorageLimitError ? error.message : (error?.message || 'This session could not be saved.'));
    } finally {
      setIsSavingSession(false);
      setSaveProgress('');
    }
  }, [user, openAuth, activeHub, sessionMeta]);

  const openSessionById = useCallback(async (sessionId: string, fallbackName?: string) => {
    if (!user) return null;
    const loaded = await loadRenderSessionWithRole(user.uid, sessionId);
    graphStoreRef.current.hydrate({
      nodes: loaded.doc.nodes,
      edges: loaded.doc.edges,
      viewport: loaded.doc.viewport,
      selectedNodeId: loaded.doc.selectedNodeId,
    });
    setActiveHub(loaded.doc.activeHub as HubType);
    setActiveBranchParentId(null);
    setSessionMeta({ id: sessionId, name: fallbackName || loaded.name, role: loaded.role, ownerId: loaded.ownerId });
    setIsSessionsPanelOpen(false);
    setSessionError(null);
    // hydrate() triggers the dirty effect above; this session is freshly loaded, not edited.
    requestAnimationFrame(() => setIsSessionDirty(false));
    return loaded;
  }, [user]);

  const handleOpenSession = useCallback(
    async (summary: CloudRenderSessionSummary) => { await openSessionById(summary.id, summary.name); },
    [openSessionById],
  );

  // Someone opened a "share render session" link: load it as soon as the canvas is up.
  useEffect(() => {
    if (!pendingSharedSessionId || !user) return;
    const sessionId = pendingSharedSessionId;
    consumePendingSharedSession();
    openSessionById(sessionId)
      .then(loaded => {
        if (loaded && loaded.role !== 'owner') {
          announceSharedArrival({ kind: 'session', name: loaded.name, ownerEmail: loaded.ownerEmail, role: loaded.role });
        }
      })
      .catch(error => {
        setSessionError(error?.message || 'That shared session could not be opened.');
      });
  }, [pendingSharedSessionId, user, consumePendingSharedSession, openSessionById, announceSharedArrival]);

  // Developmental prompt inspection states
  const [compiledPromptText, setCompiledPromptText] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [imageStyle, setImageStyle] = useState('realistic');
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [isAiEnhanced, setIsAiEnhanced] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  // Advanced Architectural Directives States
  const [showAdvancedDirectives, setShowAdvancedDirectives] = useState(false);
  const [peopleOption, setPeopleOption] = useState('none');
  const [cameraOption, setCameraOption] = useState('auto');
  const [customCameraInput, setCustomCameraInput] = useState('');
  const [lightingOption, setLightingOption] = useState('auto');
  const [customLightingInput, setCustomLightingInput] = useState('');
  const [materialsOption, setMaterialsOption] = useState('auto');
  const [customMaterialsInput, setCustomMaterialsInput] = useState('');
  const [environmentOption, setEnvironmentOption] = useState('auto');
  const [customEnvironmentInput, setCustomEnvironmentInput] = useState('');
  const [moodOption, setMoodOption] = useState('auto');
  const [customMoodInput, setCustomMoodInput] = useState('');

  // Count active non-default overrides
  const activeOverridesCount = [
    peopleOption !== 'none',
    cameraOption !== 'auto',
    lightingOption !== 'auto',
    materialsOption !== 'auto',
    environmentOption !== 'auto',
    moodOption !== 'auto'
  ].filter(Boolean).length;

  // Instant local script compiler (0ms execution, $0 API cost)
  // Instant local script compiler (0ms execution, $0 API cost)
  const compileLocalPrompt = () => {
    if (selectedWorkflow) {
      const prompt = PromptEnhancerEngine.enhanceOffline({
        user_input: userInput || selectedWorkflow.name,
        workflow_id: selectedWorkflow.id,
        image_style: imageStyle,
        model: selectedModel,
        people: peopleOption,
        camera_angle: cameraOption,
        custom_camera: customCameraInput,
        lighting: lightingOption,
        custom_lighting: customLightingInput,
        materials: materialsOption,
        custom_materials: customMaterialsInput,
        environment: environmentOption,
        custom_environment: customEnvironmentInput,
        mood: moodOption,
        custom_mood: customMoodInput,
        has_reference_image: uploadedImages.length > 0,
        reference_images_count: uploadedImages.length,
        reference_images_metadata: uploadedImages.map((img, idx) => ({
          id: String(idx + 1),
          name: img.name,
          category: img.category,
          drawingType: img.drawingType,
          customDrawingType: img.customDrawingType,
          referenceAspects: img.referenceAspects,
          label: img.label
        })),
        controlnet_enabled: controlNetEnabled,
        controlnet_strength: controlNetStrength
      });
      setCompiledPromptText(prompt);
    }
  };

  // Explicit Google Cloud Vertex AI prompt enhancement on demand
  const handleEnhanceWithAi = async () => {
    if (!selectedWorkflow) return;
    setIsEnhancingPrompt(true);
    try {
      const res = await fetch('/api/ai-render/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: userInput || selectedWorkflow.name,
          workflow_id: selectedWorkflow.id,
          image_style: imageStyle,
          model: selectedModel,
          people: peopleOption,
          camera_angle: cameraOption,
          custom_camera: customCameraInput,
          lighting: lightingOption,
          custom_lighting: customLightingInput,
          materials: materialsOption,
          custom_materials: customMaterialsInput,
          environment: environmentOption,
          custom_environment: customEnvironmentInput,
          mood: moodOption,
          custom_mood: customMoodInput,
          has_reference_image: uploadedImages.length > 0,
          reference_images_count: uploadedImages.length,
          reference_images_metadata: uploadedImages.map((img, idx) => ({
            id: String(idx + 1),
            name: img.name,
            category: img.category,
            drawingType: img.drawingType,
            customDrawingType: img.customDrawingType,
            referenceAspects: img.referenceAspects,
            label: img.label
          })),
          controlnet_enabled: controlNetEnabled,
          controlnet_strength: controlNetStrength
        })
      });
      const data = await res.json();
      if (data.enhanced_prompt) {
        setCompiledPromptText(data.enhanced_prompt);
        setIsAiEnhanced(true);
        setIsPromptExpanded(true);
      }
    } catch (err) {
      console.warn('Enhance prompt fetch error:', err);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Auto-compile structured prompt instantly whenever inputs change
  useEffect(() => {
    if (selectedWorkflow && !isEditingPrompt && !isAiEnhanced) {
      compileLocalPrompt();
    }
  }, [
    selectedWorkflow, userInput, imageStyle, selectedModel, isEditingPrompt, isAiEnhanced, uploadedImages,
    controlNetEnabled, controlNetStrength,
    peopleOption, cameraOption, customCameraInput, lightingOption, customLightingInput,
    materialsOption, customMaterialsInput, environmentOption, customEnvironmentInput,
    moodOption, customMoodInput
  ]);

  // Update defaults when workflow changes
  useEffect(() => {
    if (selectedWorkflow) {
      const isImgReq = Boolean(
        selectedWorkflow.required_fields?.includes('source_image') || 
        (selectedWorkflow.input_types?.some(t => t.startsWith('image/')) && 
         !selectedWorkflow.input_types.includes('text') && 
         !selectedWorkflow.input_types.includes('text/plain'))
      );
      const hasCnDefault = selectedWorkflow.default_values?.controlnet_conditioning_scale !== undefined;
      setControlNetEnabled(isImgReq || hasCnDefault);
      setControlNetStrength(Math.round(((selectedWorkflow.default_values?.controlnet_conditioning_scale ?? 0.8) as number) * 100));
      
      let initialModel = selectedWorkflow.default_model;
      if ((isImgReq || hasCnDefault) && !isControlNetSupported(initialModel)) {
        initialModel = 'flux-2-pro';
      }
      setSelectedModel(initialModel);

      setUserInput('');
      setIsEditingPrompt(false);
      setImageStyle('realistic');
      setPeopleOption('none');
      setCameraOption('auto');
      setCustomCameraInput('');
      setLightingOption('auto');
      setCustomLightingInput('');
      setMaterialsOption('auto');
      setCustomMaterialsInput('');
      setEnvironmentOption('auto');
      setCustomEnvironmentInput('');
      setMoodOption('auto');
      setCustomMoodInput('');
      setUploadedImages([]);
      setCustomImageAspectRatio(null);
      setInputImageDimensions(null);
      setAspectRatio('16:9');
      setCurrentJob(null);
      setRating(null);
      setActiveVariantIndex(0);
      setIsAiEnhanced(false);
      setIsPromptExpanded(false);
      if (jobIntervalId) {
        clearInterval(jobIntervalId);
        setJobIntervalId(null);
      }
    }
  }, [selectedWorkflow]);

  // Multiple File upload handler with category support (e.g. 'drawing' vs 'reference')
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, defaultCategory: 'drawing' | 'reference' = 'reference') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsConverting(true);
    setUploadProgress(`Processing ${files.length} file${files.length > 1 ? 's' : ''}...`);

    const fileList = Array.from(files) as File[];
    let loadedCount = 0;
    const newItems: UploadedImageItem[] = [];

    fileList.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          let ratioStr = '16:9';
          if (w > 0 && h > 0) {
            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
            const divisor = gcd(w, h);
            const simplifiedW = Math.round(w / divisor);
            const simplifiedH = Math.round(h / divisor);
            ratioStr = (simplifiedW > 30 || simplifiedH > 30) ? `${(w / h).toFixed(2)}:1` : `${simplifiedW}:${simplifiedH}`;
          }

          let label = '';
          let drawingType: DrawingType | undefined = undefined;
          let referenceAspects: ReferenceAspect[] | undefined = undefined;

          if (defaultCategory === 'drawing') {
            const fileNameLower = file.name.toLowerCase();
            if (fileNameLower.includes('elevation') || fileNameLower.includes('facade')) {
              drawingType = 'Elevation';
            } else if (fileNameLower.includes('sketch') || fileNameLower.includes('line')) {
              drawingType = 'Sketch / Line Drawing';
            } else if (fileNameLower.includes('3d') || fileNameLower.includes('model') || fileNameLower.includes('massing')) {
              drawingType = '3D Model / Massing Screenshot';
            } else if (fileNameLower.includes('section')) {
              drawingType = 'Section Drawing';
            } else {
              drawingType = 'Floor Plan';
            }
          } else {
            referenceAspects = ['All (Complete Theme & Mood)'];
            if (uploadedImages.length + newItems.length === 0) {
              label = 'Base Scene Reference';
            }
          }

          newItems.push({
            id: `img_${Date.now()}_${index}`,
            name: file.name,
            base64: base64Data,
            category: defaultCategory,
            drawingType,
            referenceAspects,
            width: w,
            height: h,
            aspectRatio: ratioStr,
            label
          });

          loadedCount++;
          if (loadedCount === fileList.length) {
            setUploadedImages(prev => {
              const merged = [...prev, ...newItems];
              if (merged.length > 0 && (!customImageAspectRatio || prev.length === 0)) {
                setCustomImageAspectRatio(merged[0].aspectRatio || '16:9');
                setInputImageDimensions({ width: merged[0].width || 1920, height: merged[0].height || 1080 });
                setAspectRatio('custom');
              }
              return merged;
            });
            setIsConverting(false);
            setUploadProgress('');
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === fileList.length) {
            setIsConverting(false);
            setUploadProgress('');
          }
        };
        img.src = base64Data;
      };
      reader.onerror = () => {
        loadedCount++;
        if (loadedCount === fileList.length) {
          setIsConverting(false);
          setUploadProgress('');
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveImage = (target: number | string) => {
    setUploadedImages(prev => {
      const filtered = prev.filter((img, idx) => typeof target === 'number' ? idx !== target : img.id !== target);
      if (filtered.length === 0) {
        setCustomImageAspectRatio(null);
        setInputImageDimensions(null);
        setAspectRatio('16:9');
      } else if ((typeof target === 'number' && target === 0) || (typeof target === 'string' && prev[0]?.id === target)) {
        setCustomImageAspectRatio(filtered[0].aspectRatio || '16:9');
        setInputImageDimensions({ width: filtered[0].width || 1920, height: filtered[0].height || 1080 });
      }
      return filtered;
    });
  };

  const handleUpdateImageCategory = (idOrIndex: string | number, category: 'drawing' | 'reference') => {
    setUploadedImages(prev => prev.map((img, idx) => {
      if (img.id === idOrIndex || idx === idOrIndex) {
        return { ...img, category };
      }
      return img;
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const fakeEvent = {
        target: { files, value: '' }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(fakeEvent, isReferenceGuided ? 'drawing' : 'reference');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e, isReferenceGuided ? 'drawing' : 'reference');
  };

  const handleUpdateImageLabel = (index: number, newLabel: string) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], label: newLabel };
      }
      return updated;
    });
  };

  const handleUpdateDrawingType = (index: number, type: DrawingType) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], drawingType: type };
      }
      return updated;
    });
  };

  const handleUpdateCustomDrawingType = (index: number, customVal: string) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], customDrawingType: customVal };
      }
      return updated;
    });
  };

  const handleToggleReferenceAspect = (index: number, aspect: ReferenceAspect) => {
    setUploadedImages(prev => {
      const updated = [...prev];
      if (updated[index]) {
        const current = updated[index].referenceAspects || ['All (Complete Theme & Mood)'];
        let next: ReferenceAspect[] = [];
        if (aspect === 'All (Complete Theme & Mood)') {
          next = current.includes('All (Complete Theme & Mood)') ? ['Visual Style & Theme'] : ['All (Complete Theme & Mood)'];
        } else {
          const withoutAll = current.filter(a => a !== 'All (Complete Theme & Mood)');
          if (withoutAll.includes(aspect)) {
            next = withoutAll.filter(a => a !== aspect);
            if (next.length === 0) next = ['All (Complete Theme & Mood)'];
          } else {
            next = [...withoutAll, aspect];
          }
        }
        updated[index] = { ...updated[index], referenceAspects: next };
      }
      return updated;
    });
  };

  const handleInsertImageMention = (imgIndex: number) => {
    const mention = `[Image ${imgIndex + 1}]`;
    setUserInput(prev => (prev ? `${prev} ${mention}` : mention));
  };

  // Generate dispatch handler
  const handleGenerate = async () => {
    if (!selectedWorkflow) return;
    setCurrentJob(null);
    setActiveVariantIndex(0);

    let finalPromptToSend = compiledPromptText;

    // If user has not manually edited the prompt and prompt has not been AI-enhanced yet:
    // First enhance prompt in background via Vertex AI, update text field, then produce render!
    if (!isEditingPrompt && !isAiEnhanced) {
      setIsEnhancingPrompt(true);
      try {
        const res = await fetch('/api/ai-render/enhance-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_input: userInput || selectedWorkflow.name,
            workflow_id: selectedWorkflow.id,
            image_style: imageStyle,
            model: selectedModel || selectedWorkflow.default_model,
            people: peopleOption,
            camera_angle: cameraOption,
            custom_camera: customCameraInput,
            lighting: lightingOption,
            custom_lighting: customLightingInput,
            materials: materialsOption,
            custom_materials: customMaterialsInput,
            environment: environmentOption,
            custom_environment: customEnvironmentInput,
            mood: moodOption,
            custom_mood: customMoodInput,
            has_reference_image: uploadedImages.length > 0,
            reference_images_count: uploadedImages.length,
            reference_images_metadata: uploadedImages.map((img, idx) => ({
              id: String(idx + 1),
              name: img.name,
              category: img.category,
              drawingType: img.drawingType,
              customDrawingType: img.customDrawingType,
              referenceAspects: img.referenceAspects,
              label: img.label
            })),
            controlnet_enabled: controlNetEnabled,
            controlnet_strength: controlNetStrength
          })
        });
        const data = await res.json();
        if (data.enhanced_prompt) {
          finalPromptToSend = data.enhanced_prompt;
          setCompiledPromptText(data.enhanced_prompt);
          setIsAiEnhanced(true);
        }
      } catch (err) {
        console.warn('Auto prompt enhance before generate error:', err);
      } finally {
        setIsEnhancingPrompt(false);
      }
    }

    const resolvedAspect = aspectRatio === 'custom' ? (customImageAspectRatio || '16:9') : aspectRatio;

    const payload = {
      workflow_id: selectedWorkflow.id,
      user_input: userInput || selectedWorkflow.name,
      model: selectedModel || selectedWorkflow.default_model,
      image_style: imageStyle,
      people: peopleOption,
      camera_angle: cameraOption,
      custom_camera: customCameraInput,
      lighting: lightingOption,
      custom_lighting: customLightingInput,
      materials: materialsOption,
      custom_materials: customMaterialsInput,
      environment: environmentOption,
      custom_environment: customEnvironmentInput,
      mood: moodOption,
      custom_mood: customMoodInput,
      uploaded_image: uploadedImages[0]?.base64 || null,
      uploaded_images: uploadedImages.map((img, i) => ({
        id: String(i + 1),
        name: img.name,
        category: img.category,
        drawingType: img.drawingType,
        customDrawingType: img.customDrawingType,
        referenceAspects: img.referenceAspects,
        label: img.label,
        base64: img.base64
      })),
      override_prompt: finalPromptToSend,
      is_custom_edited: isEditingPrompt,
      parameters: {
        resolution,
        aspect_ratio: resolvedAspect,
        custom_aspect_ratio: customImageAspectRatio,
        is_custom_aspect: aspectRatio === 'custom',
        source_dimensions: inputImageDimensions,
        duration_seconds: durationSeconds,
        audio: audioEnabled,
        camera_motion: cameraMotion,
        variants: variants,
        controlnet_enabled: controlNetEnabled,
        controlnet_strength_percent: controlNetStrength,
        controlnet_conditioning_scale: controlNetStrength / 100
      }
    };

    try {
      const activeNodeId = 'job_' + Date.now();
      activeRunningNodeIdRef.current = activeNodeId;

      // Add running node on the graph canvas
      const sourceNode = activeBranchParentId ? graphStore.nodes.find(n => n.id === activeBranchParentId) : undefined;
      graphStore.addNode({
        id: activeNodeId,
        type: 'action',
        title: selectedWorkflow.name,
        subtitle: `${selectedModel || selectedWorkflow.default_model} • ${selectedWorkflow.hubCategory.replace('_', ' ')}`,
        status: 'running',
        hubType: selectedWorkflow.hubCategory as GraphHubType,
        workflowId: selectedWorkflow.id,
        model: selectedModel || selectedWorkflow.default_model,
        style: imageStyle,
        prompt: userInput || compiledPromptText,
        compiledPrompt: finalPromptToSend,
        parentId: activeBranchParentId || undefined,
        imageUrl: sourceNode?.imageUrl || uploadedImages[0]?.base64,
      });

      if (activeBranchParentId) {
        graphStore.addEdge(activeBranchParentId, activeNodeId);
      }

      const response = await fetch('/api/ai-render/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const job: Job = await response.json();
      setCurrentJob(job);
      
      const interval = setInterval(async () => {
        const statusRes = await fetch(`/api/ai-render/jobs/${job.jobId}`);
        const updatedJob: Job = await statusRes.json();
        setCurrentJob(updatedJob);

        if (updatedJob.status === 'completed') {
          if (activeRunningNodeIdRef.current) {
            graphStore.updateNode(activeRunningNodeIdRef.current, {
              type: 'image',
              status: 'completed',
              imageUrl: updatedJob.outputs[0]?.signed_url,
              outputs: updatedJob.outputs.map((out, idx) => ({
                id: `out_${idx}`,
                url: out.signed_url,
                type: out.type,
                mimeType: out.mime_type
              })),
              processingTimeMs: updatedJob.processingTimeMs,
              costEstimateUsd: updatedJob.actualCostUsdEstimate,
            });
          }
          clearInterval(interval);
          setJobIntervalId(null);
        } else if (updatedJob.status === 'failed' || updatedJob.status === 'cancelled') {
          if (activeRunningNodeIdRef.current) {
            graphStore.updateNode(activeRunningNodeIdRef.current, {
              status: 'failed',
              error: updatedJob.error || 'AI generation failed',
            });
          }
          clearInterval(interval);
          setJobIntervalId(null);
        }
      }, 1000);

      setJobIntervalId(interval);

    } catch (error: any) {
      console.error('Failed to dispatch rendering job', error);
      if (activeRunningNodeIdRef.current) {
        graphStore.updateNode(activeRunningNodeIdRef.current, {
          status: 'failed',
          error: error.message || 'Failed to dispatch rendering job',
        });
      }
    }
  };

  const handleCancel = async () => {
    if (!currentJob) return;
    try {
      const response = await fetch(`/api/ai-render/jobs/${currentJob.jobId}/cancel`, { method: 'POST' });
      const updated: Job = await response.json();
      setCurrentJob(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetry = async () => {
    if (!currentJob) return;
    try {
      const response = await fetch(`/api/ai-render/jobs/${currentJob.jobId}/retry`, { method: 'POST' });
      const updated: Job = await response.json();
      setCurrentJob(updated);
      
      const interval = setInterval(async () => {
        const statusRes = await fetch(`/api/ai-render/jobs/${currentJob.jobId}`);
        const updatedJob: Job = await statusRes.json();
        setCurrentJob(updatedJob);

        if (updatedJob.status === 'completed' || updatedJob.status === 'failed' || updatedJob.status === 'cancelled') {
          clearInterval(interval);
          setJobIntervalId(null);
        }
      }, 1000);
      setJobIntervalId(interval);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRate = async (stars: number) => {
    if (!currentJob) return;
    setRating(stars);
    try {
      await fetch(`/api/ai-render/jobs/${currentJob.jobId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadAll = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentJob || currentJob.outputs.length === 0) return;
    currentJob.outputs.forEach((output, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = output.signed_url;
        link.setAttribute('target', '_blank');
        const ext = output.mime_type === 'image/png' ? 'png' : output.mime_type === 'video/mp4' ? 'mp4' : 'glb';
        link.setAttribute('download', `render-${currentJob.jobId}-v${index + 1}.${ext}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 250);
    });
  };

  // Dynamic estimate engine values
  const costEstimation = selectedWorkflow
    ? WorkflowCostEstimator.calculate(selectedWorkflow.id, selectedModel || selectedWorkflow.default_model, {
        resolution,
        duration_seconds: durationSeconds,
        audio: audioEnabled,
        prompt_tokens_estimate: 1000,
        input_images_count: uploadedImages.length
      })
    : null;

  const isPromptRequired = selectedWorkflow?.slug === 'text-to-render' || selectedWorkflow?.slug === 'conversational-edit';
  const isImageRequired = Boolean(
    selectedWorkflow?.required_fields?.includes('source_image') || 
    (selectedWorkflow?.input_types?.some(t => t.startsWith('image/')) && 
     !selectedWorkflow.input_types.includes('text') && 
     !selectedWorkflow.input_types.includes('text/plain'))
  );

  const modelsList = selectedWorkflow
    ? activeHub === 'image_studio'
      ? (() => {
          const ALL_IMAGE_MODELS = [
            'gemini-3-pro-image',
            'gemini-3.1-flash-image',
            'gemini-3.1-flash-lite-image',
            'flux-2-pro',
            'stable-diffusion-xl'
          ];
          const allowed = selectedWorkflow.allowed_models;
          const remaining = ALL_IMAGE_MODELS.filter(m => !allowed.includes(m));
          let fullList = [...allowed, ...remaining];

          // If Image upload workflow and ControlNet is ON: restrict to ControlNet supported models!
          if (isImageRequired && controlNetEnabled) {
            const cnOnly = fullList.filter(m => isControlNetSupported(m));
            return cnOnly.length > 0 ? cnOnly : CONTROLNET_MODELS;
          }
          return fullList;
        })()
      : selectedWorkflow.allowed_models
    : [];

  const isReferenceGuided = selectedWorkflow?.slug === 'reference-guided';
  const drawingImagesCount = uploadedImages.filter(img => img.category === 'drawing').length;
  const referenceImagesCount = uploadedImages.filter(img => img.category !== 'drawing').length;

  const isGenerateDisabled = isConverting || 
    (isPromptRequired && !userInput.trim()) ||
    (isReferenceGuided && drawingImagesCount === 0) ||
    (!isReferenceGuided && isImageRequired && uploadedImages.length === 0) ||
    (isImageRequired && controlNetEnabled && !isControlNetSupported(selectedModel));

  // Model Icon Helper: Returns model-family specific icon
  const getModelIcon = (modelKey: string) => {
    if (!modelKey) return '🍌';
    const key = modelKey.toLowerCase();
    if (key.includes('flux')) return '⚡';
    if (key.includes('stable-diffusion') || key.includes('sdxl')) return '🎨';
    if (key.includes('veo') || key.includes('video')) return '🎥';
    if (key.includes('trellis') || key.includes('gsplat') || key.includes('3d')) return '🧊';
    return '🍌'; // Nano Banana / Gemini models
  };

  const handleCanvasImageUpload = useCallback((file: File, position?: { x: number; y: number }) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target?.result as string;
      const sketchWf = Object.values(WORKFLOWS).find(
        w => w.hubCategory === 'image_studio' && w.required_fields?.includes('source_image')
      ) || Object.values(WORKFLOWS).find(w => w.hubCategory === 'image_studio');

      graphStoreRef.current.addNode({
        type: 'action',
        title: file.name,
        subtitle: 'Configure rendering for this image',
        inputImageUrl: b64,
        position: position || { x: 100 + Math.random() * 80, y: 100 + Math.random() * 80 },
        status: 'idle',
        isInitialBlank: false,
        isConfiguring: true,
        hubType: 'image_studio',
        workflowId: sketchWf?.id,
        model: sketchWf?.default_model || 'gemini-3-pro-image',
        style: 'realistic',
        controlNetEnabled: true,
        controlNetStrength: 80,
        createdAt: Date.now(),
        uploadedImages: [{
          id: `upload_${Date.now()}`,
          name: file.name,
          base64: b64,
          category: 'drawing',
          drawingType: 'Floor Plan',
          referenceAspects: ['All (Complete Theme & Mood)'],
          label: file.name,
        }],
      });
    };
    reader.readAsDataURL(file);
  }, []);

  // Overlay states
  const [rasterOverlayOpen, setRasterOverlayOpen] = useState(false);
  const [fullscreenModalOpen, setFullscreenModalOpen] = useState(false);
  const [fullscreenModalImages, setFullscreenModalImages] = useState<string[]>([]);
  const [fullscreenModalIndex, setFullscreenModalIndex] = useState(0);

  const handleNodeGenerate = useCallback(async (node: CanvasNodeData) => {
    const currentGraphStore = graphStoreRef.current;
    const wfId = node.workflowId || (node.hubType === 'gen_3d' ? 29 : 1);
    const wf = WORKFLOWS[wfId] || Object.values(WORKFLOWS)[0];
    if (node.hubType === 'video_studio' || wf?.hubCategory === 'video_studio') {
      currentGraphStore.updateNode(node.id, {
        status: 'failed',
        error: 'Video generation is coming soon.',
      });
      return;
    }
    if (!wf) return;

    currentGraphStore.updateNode(node.id, {
      status: 'running',
      isConfiguring: false,
      isInitialBlank: false,
      error: undefined,
    });

    const nodePrompt = node.compiledPrompt || node.prompt || wf.name;
    const nodeModel = node.model || wf.default_model;
    const nodeStyle = node.style || 'realistic';
    const incomingEdges = currentGraphStore.edges.filter(e => e.targetNodeId === node.id);
    const incomingNodes = incomingEdges.map(e => currentGraphStore.nodes.find(n => n.id === e.sourceNodeId)).filter(Boolean) as CanvasNodeData[];
    
    const incomingImages = incomingNodes.map(inNode => {
      const imgUrl = inNode.imageUrl || inNode.outputs?.[0]?.url || inNode.inputImageUrl;
      const tag = node.incomingEdgeTags?.[inNode.id] || 'drawing';
      return {
        id: `incoming_${inNode.id}`,
        name: `From: ${inNode.title}`,
        category: tag,
        drawingType: 'sketch',
        referenceAspects: ['style', 'composition'],
        label: tag === 'drawing' ? 'Input Drawing' : 'Input Reference',
        base64: imgUrl
      };
    }).filter(img => img.base64);

    let nodeUploadedImages = [...incomingImages];

    if (node.uploadedImages && node.uploadedImages.length > 0) {
      nodeUploadedImages = [...nodeUploadedImages, ...node.uploadedImages];
    } else if (nodeUploadedImages.length === 0 && node.inputImageUrl) {
      nodeUploadedImages.push({
        id: '1',
        name: 'Input Reference',
        category: 'drawing',
        drawingType: 'sketch',
        referenceAspects: ['style', 'composition'],
        label: 'Input Drawing',
        base64: node.inputImageUrl
      });
    }
    const nodeInputImg = nodeUploadedImages[0]?.base64;

    const isMultiInputAllowed = Boolean(
      wf.optional_fields?.includes('reference_images') || 
      wf.required_fields?.includes('style_reference_image') || 
      wf.slug === 'reference-guided' ||
      wf.slug === 'style-transfer'
    );

    if (!isMultiInputAllowed && nodeUploadedImages.length > 1) {
      const drawingImg = nodeUploadedImages.find(img => img.category === 'drawing');
      nodeUploadedImages = drawingImg ? [drawingImg] : [nodeUploadedImages[0]];
    }

    // A restored session holds Storage URLs; the backend only accepts data URLs or raw base64.
    try {
      nodeUploadedImages = await Promise.all(nodeUploadedImages.map(async img => ({
        ...img,
        base64: await toDataUrl(img.base64),
      })));
    } catch (conversionError) {
      currentGraphStore.updateNode(node.id, {
        status: 'failed',
        error: 'Could not load the saved images for this node. Check your connection and try again.',
      });
      return;
    }
    const nodeInputImgResolved = nodeUploadedImages[0]?.base64 || nodeInputImg;

    const payload = {
      workflow_id: wf.id,
      user_input: nodePrompt,
      model: nodeModel,
      image_style: nodeStyle,
      uploaded_image: nodeInputImgResolved || null,
      uploaded_images: nodeUploadedImages,
      parameters: {
        resolution: node.resolution || '2K',
        aspect_ratio: node.aspectRatio || '16:9',
        variants: node.variants || 1,
        controlnet_enabled: node.controlNetEnabled !== false,
        controlnet_strength_percent: node.controlNetStrength ?? 80,
        controlnet_conditioning_scale: (node.controlNetStrength ?? 80) / 100,
        advanced_directives: {
          camera_angle: node.cameraOption || 'auto',
          lighting: node.lightingOption || 'auto',
          people: node.peopleOption || 'none',
        }
      }
    };

    try {
      const response = await fetch('/api/ai-render/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const job: Job = await response.json();

      const interval = setInterval(async () => {
        const statusRes = await fetch(`/api/ai-render/jobs/${job.jobId}`);
        const updatedJob: Job = await statusRes.json();

        if (updatedJob.status === 'completed') {
          // Restore parent to configurator
          currentGraphStore.updateNode(node.id, {
            status: 'completed',
            isConfiguring: true, // leave the prompt open for re-running
          });
          
          // Add child nodes for each output
          updatedJob.outputs.forEach((out, idx) => {
            const childId = `job_${job.jobId}_v${idx + 1}`;
            // Position children below the parent
            const childX = node.position.x + (idx * 320) - ((updatedJob.outputs.length - 1) * 160);
            const childY = node.position.y + 360;
            const is3D = out.type === '3d' || out.signed_url.endsWith('.glb') || out.signed_url.endsWith('.gltf') || (out.mime_type && (out.mime_type.includes('gltf') || out.mime_type.includes('glb'))) || wf.id === 29 || wf.id === 30 || node.hubType === 'gen_3d';
            
            currentGraphStore.addNode({
              id: childId,
              type: is3D ? 'action' : 'image',
              title: is3D ? `3D Model ${idx + 1}` : `Variant ${idx + 1}`,
              subtitle: wf.name,
              position: { x: childX, y: childY },
              imageUrl: out.signed_url,
              inputImageUrl: nodeInputImg,
              outputs: [{ id: `out_${idx}`, url: out.signed_url, type: is3D ? '3d' : (out.type || 'image'), mimeType: out.mime_type }],
              hubType: node.hubType,
              workflowId: wf.id,
              status: 'completed',
              costEstimateUsd: updatedJob.actualCostUsdEstimate / updatedJob.outputs.length,
              processingTimeMs: updatedJob.processingTimeMs,
              prompt: nodePrompt,
              model: nodeModel,
              style: nodeStyle,
            });
            currentGraphStore.addEdge(node.id, childId);
          });
          
          clearInterval(interval);
        } else if (updatedJob.status === 'failed' || updatedJob.status === 'cancelled') {
          currentGraphStore.updateNode(node.id, {
            status: 'failed',
            error: updatedJob.error || 'AI generation failed',
            isConfiguring: true, // let user fix and retry
          });
          clearInterval(interval);
        }
      }, 1000);
    } catch (err: any) {
      currentGraphStore.updateNode(node.id, {
        status: 'failed',
        error: err?.message || 'Generation request failed',
        isConfiguring: true,
      });
    }
  }, []);

  const handleEditInRasterCanvasOverlay = useCallback((id: string, url: string) => {
    setRasterCanvasInitialImage(url);
    setActiveBranchParentId(id);
    setRasterOverlayOpen(true);
  }, []);

  const handleConfigureNode = useCallback((id: string, updates: Partial<CanvasNodeData>) => {
    graphStoreRef.current.updateNode(id, updates);
  }, []);

  return (
    <div className="render-canvas-theme flex-1 flex flex-col overflow-hidden h-full bg-slate-900 text-slate-100 font-sans">
      {/* Top Header Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-400" size={20} />
          <h2 className="font-bold text-sm text-slate-100 tracking-wide">{initialHub === 'gen_3d' ? '3D Generator' : 'Render Canvas'}</h2>
        </div>

        {/* Saved sessions */}
        <div className="flex items-center gap-2">
          {sessionError && (
            <span className="text-[10px] font-medium text-red-400 max-w-[260px] truncate" title={sessionError}>{sessionError}</span>
          )}
          {sessionMeta && !sessionError && (
            <span className="text-[10px] font-medium text-slate-500 max-w-[180px] truncate" title={sessionMeta.name}>
              {sessionMeta.name}{isSessionDirty ? ' •' : ''}
            </span>
          )}
          <button
            onClick={handleSaveSession}
            disabled={isSavingSession || graphStore.nodes.length === 0}
            title={user ? 'Save this render canvas as a session you can reopen later' : 'Sign in to save this session'}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSavingSession ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{isSavingSession ? (saveProgress ? `Saving ${saveProgress}` : 'Saving…') : 'Save session'}</span>
          </button>
          {sessionMeta && sessionMeta.role === 'owner' && (
            <button
              onClick={() => openShare({ kind: 'session', id: sessionMeta.id })}
              title="Share this render session"
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors"
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>
          )}
          <button
            onClick={() => (user ? setIsSessionsPanelOpen(true) : openAuth())}
            title="Open a saved session"
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors"
          >
            <FolderOpen size={14} />
            <span>Sessions</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-w-0 overflow-hidden relative">
        <AiRenderingCanvas
          store={graphStore}
          onGraphPointerMove={presenceRoom ? publishGraphPointer : undefined}
          isDrawerOpen={false}
          isOverlayOpen={rasterOverlayOpen || fullscreenModalOpen}
          onOpenDrawer={() => {}}
          onCloseDrawer={() => {}}
          activeHub={activeHub as GraphHubType}
          onEditInRasterCanvas={handleEditInRasterCanvasOverlay}
          onImageUploaded={handleCanvasImageUpload}
          onConfigureNode={handleConfigureNode}
          onGenerateNode={handleNodeGenerate}
          onImportToCanvas={onApplyToCanvas}
          drawerChildren={null}
        />
        
        <RasterCanvasOverlay
          isOpen={rasterOverlayOpen}
          onClose={(editedB64) => {
            if (editedB64) {
              graphStore.addCompletedImageNode(
                activeBranchParentId || undefined,
                editedB64,
                [{ id: 'out_raster', url: editedB64, type: 'image' }],
                'Image Edit',
                'raster_canvas',
                undefined,
                'Raster Editor',
                undefined,
                0
              );
            }
            setRasterOverlayOpen(false);
          }}
          initialImageBase64={rasterCanvasInitialImage}
          availableStudioImages={[
            ...uploadedImages.map((img, idx) => ({
              id: `upload_${img.id || idx}`,
              name: img.name || `Studio Upload ${idx + 1}`,
              url: img.base64,
              category: img.category === 'drawing' ? 'Drawing' : 'Reference',
            })),
          ]}
        />
        
        <ImageFullscreenModal
          isOpen={fullscreenModalOpen}
          onClose={() => setFullscreenModalOpen(false)}
          images={fullscreenModalImages}
          currentIndex={fullscreenModalIndex}
          onChangeIndex={setFullscreenModalIndex}
          onEditInRasterCanvas={(url) => {
            setFullscreenModalOpen(false);
            handleEditInRasterCanvasOverlay(activeBranchParentId || '', url);
          }}
        />

        <RenderSessionsPanel
          isOpen={isSessionsPanelOpen}
          onClose={() => setIsSessionsPanelOpen(false)}
          uid={user?.uid || null}
          currentSessionId={sessionMeta?.id || null}
          onOpenSession={handleOpenSession}
        />
      </div>
    </div>
  );
};

export default AiRenderingPanel;
