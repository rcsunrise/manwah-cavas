import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowHeader } from '../../components/creative-canvas/WorkflowHeader';
import { CanvasWorkspace } from '../../components/creative-canvas/CanvasWorkspace';
import { AgentPanel } from '../../components/creative-canvas/AgentPanel';
import { BatchConfirmModal } from '../../components/creative-canvas/BatchConfirmModal';
import { SaveVersionModal } from '../../components/creative-canvas/SaveVersionModal';
import { VersionHistoryModal } from '../../components/creative-canvas/VersionHistoryModal';
import { NewCanvasModal } from '../../components/creative-canvas/NewCanvasModal';
import { AssetVersionModal } from '../../components/creative-canvas/AssetVersionModal';
import { GptImagePreviewModal } from '../../components/creative-canvas/GptImagePreviewModal';
import { VideoCreationPanel } from '../../components/creative-canvas/video/VideoCreationPanel';
import { StorageManagerModal } from '../../components/creative-canvas/StorageManagerModal';
import { useCreativeCanvasWorkspace } from '../../hooks/useCreativeCanvasWorkspace';
import { downloadFileWithFallback } from '../../lib/storage/fileDownload';
import { createDefaultNinePlan } from '../../services/posterStudioService';
import { VideoGenerationService } from '../../services/videoGenerationService';

export default function CreativeCanvasPage() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [showNewCanvasModal, setShowNewCanvasModal] = React.useState(false);
  const [showStorageModal, setShowStorageModal] = React.useState(false);
  const [showAssetModal, setShowAssetModal] = React.useState(false);
  const [assetModalTarget, setAssetModalTarget] = React.useState<{
    nodeId: string;
    sceneKey: string;
    imageUrl: string;
  }>({
    nodeId: 'gen-img-node-1',
    sceneKey: 'scene-01',
    imageUrl: ''
  });

  const handleOpenPosterStudioRef = React.useRef<(idx?: number) => void>(() => {});

  const {
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,
    uploadState,
    errorMessage,
    messages,
    activeDna,
    showFullDnaDrawer,
    setShowFullDnaDrawer,
    handleUploadFile,
    addUserMessage,
    agentRun,
    isPlanGenerating,
    planError,
    selectedNodeId,
    selectedSceneIndex,
    handleGenerateNineGridPlan,
    handleReplanSingleScene,
    handleNodeClick,
    generatingScenes,
    uploadedBase64,
    setUploadedBase64,
    selectedModel,
    setSelectedModel,
    planAgentModel,
    setPlanAgentModel,
    planReasoningEffort,
    setPlanReasoningEffort,
    selectedResolution,
    setSelectedResolution,
    handleGenerateSceneImage,
    handleApproveSceneImage,
    handleRejectSceneImage,

    // C3B Batch Queue Hooks
    batchState,
    queueItems,
    showBatchConfirmModal,
    setShowBatchConfirmModal,
    batchConfirmInfo,
    batchWithText,
    setBatchWithText,
    handleTriggerBatchMissingModal,
    handleStartBatchGeneration,
    handlePauseBatch,
    handleResumeBatch,
    handleCancelBatch,
    handleRetryFailedBatch,
    handleAutoLayoutNodes,
    handleGrid3x3Layout,
    handleSeamlessLayout,

    // C4-Edit Selection & Node Manipulation Hooks
    selectAllNodes,
    clearSelection,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    addCustomNode,

    // C4A-1 Persistence & Versioning Hooks
    saveStatus,
    lastSavedAt,
    currentRevisionNumber,
    showSaveVersionModal,
    setShowSaveVersionModal,
    showHistoryModal,
    setShowHistoryModal,
    handleSaveDraftNow,
    handleSaveVersion,
    handleRestoreRevision,
    exportCanvasJson,
    importCanvasJson,
    restoreNodeWorkflow,
    clearCanvasWorkspace,
    canvasId,

    // C4B-1 DNA Version & Linkage Hooks
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    dnaVersions,
    onSelectDnaVersion,
    onSelectSceneIndex,

    // G0-1 Agent Conversation Hooks
    currentConversation,
    conversationsList,
    isStreaming,
    streamError,
    handleSendMessageStream,
    handleStopGenerating,
    handleRetryMessage,
    handleCreateNewConversation,
    handleSelectConversation,
    activeProject,
    planTargetAudience,
    setPlanTargetAudience,
    planScreenCount,
    setPlanScreenCount,
    planAspectRatio,
    setPlanAspectRatio,
    styleRefImages,
    setStyleRefImages,
    refDocName,
    setRefDocName,
    refDocText,
    setRefDocText,
    planEnableSearch,
    setPlanEnableSearch,
    planSearchKeywords,
    setPlanSearchKeywords,
    marketSearchLoading,
    marketSearchResult,
    setMarketSearchResult,
    handleSearchMarketReference
  } = useCreativeCanvasWorkspace(workspaceId, {
    onOpenPosterStudio: (idx) => handleOpenPosterStudioRef.current(idx)
  });

  React.useEffect(() => {
    if (workspaceId === 'new' && activeProject?.id && activeProject.id !== 'new') {
      navigate(`/creative-canvas/${activeProject.id}`, { replace: true });
    }
  }, [workspaceId, activeProject?.id, navigate]);

  // GPT Image 2 Preview Modal state & handlers
  const [showGptPreviewModal, setShowGptPreviewModal] = React.useState(false);
  const [gptPreviewParams, setGptPreviewParams] = React.useState<{
    screenIndex: number;
    reviewFeedback?: string;
    overrideModel?: string;
    overrideResolution?: '1K' | '2K' | '4K';
    withText?: boolean;
    screenTitle?: string;
    promptSuggestion?: string;
  }>({
    screenIndex: 1
  });

  const effectiveUploadedImageUrl = React.useMemo(() => {
    if (uploadedBase64) return uploadedBase64;
    const imgNode = nodes.find(
      n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage'
    );
    return (imgNode?.data?.imageUrl as string) || null;
  }, [uploadedBase64, nodes]);

  const handleTriggerGenerateSceneImage = React.useCallback(
    (
      screenIndex: number,
      reviewFeedback?: string,
      overrideModel?: string,
      overrideResolution?: '1K' | '2K' | '4K',
      withText?: boolean
    ) => {
      const modelToUse = overrideModel || selectedModel || 'gemini-3.1-flash-image';
      if (modelToUse.includes('gpt-image')) {
        const screen = agentRun?.plan?.screens?.find(s => s.screenIndex === screenIndex);
        const sceneNode = nodes.find(
          n => n.id === `scene-plan-node-${screenIndex}` || n.data?.screenIndex === screenIndex
        );
        setGptPreviewParams({
          screenIndex,
          reviewFeedback,
          overrideModel,
          overrideResolution,
          withText,
          screenTitle: screen?.screenTitle || (sceneNode?.data?.screenTitle as string) || `第 ${screenIndex} 屏`,
          promptSuggestion:
            screen?.promptSuggestion ||
            (sceneNode?.data?.promptSuggestion as string) ||
            (sceneNode?.data?.prompt as string) ||
            ''
        });
        setShowGptPreviewModal(true);
      } else {
        handleGenerateSceneImage(screenIndex, reviewFeedback, overrideModel, overrideResolution, withText);
      }
    },
    [selectedModel, agentRun, nodes, handleGenerateSceneImage]
  );

  const handleOpenGptPreviewManual = React.useCallback(() => {
    const idx = selectedSceneIndex || 1;
    const screen = agentRun?.plan?.screens?.find(s => s.screenIndex === idx);
    const sceneNode = nodes.find(
      n => n.id === `scene-plan-node-${idx}` || n.data?.screenIndex === idx
    );
    setGptPreviewParams({
      screenIndex: idx,
      screenTitle: screen?.screenTitle || (sceneNode?.data?.screenTitle as string) || `第 ${idx} 屏`,
      promptSuggestion:
        screen?.promptSuggestion ||
        (sceneNode?.data?.promptSuggestion as string) ||
        (sceneNode?.data?.prompt as string) ||
        ''
    });
    setShowGptPreviewModal(true);
  }, [selectedSceneIndex, agentRun, nodes]);

  const handleConfirmGptPreview = React.useCallback(() => {
    setShowGptPreviewModal(false);
    if (gptPreviewParams.screenIndex) {
      handleGenerateSceneImage(
        gptPreviewParams.screenIndex,
        gptPreviewParams.reviewFeedback,
        gptPreviewParams.overrideModel,
        gptPreviewParams.overrideResolution,
        gptPreviewParams.withText
      );
    }
  }, [gptPreviewParams, handleGenerateSceneImage]);

  const handleCreateNewCanvas = () => {
    setShowNewCanvasModal(true);
  };

  const handleConfirmNewCanvas = async () => {
    const newId = await clearCanvasWorkspace();
    if (newId) {
      navigate(`/creative-canvas/${newId}`);
    }
  };

  // Video Generation Panel & Workflow Integration
  const [isVideoPanelOpen, setIsVideoPanelOpen] = React.useState(false);
  const [videoSelectedNode, setVideoSelectedNode] = React.useState<{
    id: string;
    type: string;
    title: string;
    imageUrl?: string;
    assetVersionId?: string | null;
  } | null>(null);

  const handleOpenVideoPanel = React.useCallback((targetNode?: any) => {
    let nodeToUse = targetNode;
    if (!nodeToUse && selectedNodeId) {
      nodeToUse = nodes.find(n => n.id === selectedNodeId);
    }
    if (!nodeToUse) {
      // Find the first available image node
      nodeToUse = nodes.find(n =>
        n.type === 'productImageNode' ||
        n.type === 'generatedImageNode' ||
        (n.data as any)?.imageUrl
      );
    }

    if (nodeToUse) {
      const d = (nodeToUse.data || {}) as any;
      const imgUrl = d.imageUrl || d.originalImageUrl || d.previewUrl || d.rendered_image_url || '';
      setVideoSelectedNode({
        id: nodeToUse.id,
        type: nodeToUse.type || 'productImageNode',
        title: d.title || d.label || d.screenTitle || nodeToUse.id,
        imageUrl: imgUrl,
        assetVersionId: d.assetVersionId || d.asset_version_id || null
      });
    } else {
      setVideoSelectedNode(null);
    }
    setIsVideoPanelOpen(true);
  }, [selectedNodeId, nodes]);

  const handlePlanCreated = React.useCallback((plan: any, sourceNodeId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    const posX = (sourceNode?.position?.x ?? 200) + 380;
    const posY = sourceNode?.position?.y ?? 200;

    const creationNodeId = `node-video-plan-${Date.now()}`;
    const newPlanNode: any = {
      id: creationNodeId,
      type: 'videoCreationNode',
      position: { x: posX, y: posY },
      data: {
        title: '产品展示分镜方案',
        plan,
        sourceNodeId,
        sourceImageUrl: (sourceNode?.data as any)?.imageUrl || ''
      }
    };

    const newEdge: any = {
      id: `edge-${sourceNodeId}-${creationNodeId}`,
      source: sourceNodeId,
      target: creationNodeId,
      animated: true,
      style: { stroke: '#10B981', strokeWidth: 2 }
    };

    onNodesChange([{ type: 'add', item: newPlanNode }]);
    onEdgesChange([{ type: 'add', item: newEdge }]);
  }, [nodes, onNodesChange, onEdgesChange]);

  const handleJobSubmitted = React.useCallback((job: any, sourceNodeId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    const posX = (sourceNode?.position?.x ?? 200) + 420;
    const posY = (sourceNode?.position?.y ?? 200) + 120;

    const genNodeId = `node-video-gen-${job.id}`;
    const edgeId = `edge-${sourceNodeId}-${genNodeId}`;

    setNodes((prevNodes: any[]) => {
      if (prevNodes.some(n => n.id === genNodeId)) return prevNodes;
      const newGenNode: any = {
        id: genNodeId,
        type: 'videoGenerationNode',
        position: { x: posX, y: posY },
        data: {
          job
        }
      };
      return [...prevNodes, newGenNode];
    });

    setEdges((prevEdges: any[]) => {
      if (prevEdges.some(e => e.id === edgeId)) return prevEdges;
      return [
        ...prevEdges,
        {
          id: edgeId,
          source: sourceNodeId,
          target: genNodeId,
          animated: true,
          style: { stroke: '#6366F1', strokeWidth: 2 }
        }
      ];
    });
  }, [nodes, setNodes, setEdges]);

  const effectiveCanvasId = canvasId || workspaceId || 'canvas-default';

  // Real-time synchronization of video generation jobs to canvas nodes
  React.useEffect(() => {
    if (!effectiveCanvasId) return;

    const unsubscribe = VideoGenerationService.subscribeVideoEvents(effectiveCanvasId, (updatedJob: any) => {
      setNodes((currentNodes: any[]) => {
        const targetIndex = currentNodes.findIndex(
          n => n.id === `node-video-gen-${updatedJob.id}` || n.data?.job?.id === updatedJob.id
        );
        if (targetIndex === -1) return currentNodes;

        const next = [...currentNodes];
        const existingNode = next[targetIndex];
        next[targetIndex] = {
          ...existingNode,
          data: {
            ...existingNode.data,
            job: {
              ...(existingNode.data?.job || {}),
              ...updatedJob
            }
          }
        };

        // When ready, also automatically produce the videoResultNode if not yet created
        if (updatedJob.status === 'ready') {
          const resultNodeId = `node-video-res-${updatedJob.id}`;
          const hasResultNode = next.some(n => n.id === resultNodeId);
          if (!hasResultNode) {
            const posX = (existingNode.position?.x ?? 400) + 360;
            const posY = existingNode.position?.y ?? 200;
            const resultNode: any = {
              id: resultNodeId,
              type: 'videoResultNode',
              position: { x: posX, y: posY },
              data: {
                title: `${updatedJob.shotId || '镜头'} 成果`,
                assetVersionId: updatedJob.assetVersionId || updatedJob.id,
                posterUrl: updatedJob.posterUrl,
                modelKey: updatedJob.modelKey
              }
            };
            next.push(resultNode);
          }
        }

        return next;
      });

      // Synchronize edge outside setNodes with strict ID check
      if (updatedJob.status === 'ready') {
        const genNodeId = `node-video-gen-${updatedJob.id}`;
        const resultNodeId = `node-video-res-${updatedJob.id}`;
        const resultEdgeId = `edge-${genNodeId}-${resultNodeId}`;

        setEdges((currentEdges: any[]) => {
          if (currentEdges.some(e => e.id === resultEdgeId)) {
            return currentEdges;
          }
          return [
            ...currentEdges,
            {
              id: resultEdgeId,
              source: genNodeId,
              target: resultNodeId,
              style: { stroke: '#10B981', strokeWidth: 2 }
            }
          ];
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [effectiveCanvasId, setNodes, setEdges]);

  const augmentedNodes = React.useMemo(() => {
    return nodes.map(node => {
      if (node.type === 'videoGenerationNode') {
        return {
          ...node,
          data: {
            ...node.data,
            onCancel: async (jobId: string) => {
              try {
                await VideoGenerationService.cancelJob(jobId);
              } catch (e) {
                console.error('Cancel job failed:', e);
              }
            },
            onRetryTransfer: async (jobId: string) => {
              try {
                await VideoGenerationService.retryTransfer(jobId);
              } catch (e) {
                console.error('Retry transfer failed:', e);
              }
            }
          }
        };
      }
      if (node.type === 'generatedImageNode' || node.type === 'generatedImage' || node.id.startsWith('gen-img-node-')) {
        const sceneIdx = Number(node.data?.sceneIndex) || 1;
        const sceneKey = `scene-${String(sceneIdx).padStart(2, '0')}`;
        return {
          ...node,
          data: {
            canvasId: effectiveCanvasId,
            projectId: effectiveCanvasId,
            workspaceId: workspaceId || 'default_workspace',
            productDnaVersionId: productDnaVersionId || undefined,
            copySkuId: `copy_sku_${effectiveCanvasId}_${sceneKey}`,
            screenId: `screen-${String(sceneIdx).padStart(2, '0')}`,
            screenRole: sceneIdx === 1 ? 'PRODUCT_HERO' : 'LIFESTYLE_SCENE',
            ...node.data,
            onUpdate: (updated: any) => {
              setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, ...updated } } : n));
            },
            onGeneratePoster: () => handleTriggerGenerateSceneImage(sceneIdx, undefined, selectedModel, selectedResolution, true),
            onRegenerate: () => handleTriggerGenerateSceneImage(sceneIdx, undefined, selectedModel, selectedResolution, false),
            onOpenAssetVersions: () => {
              const idx = node.data?.sceneIndex || 1;
              const key = `scene-${String(idx).padStart(2, '0')}`;
              setAssetModalTarget({
                nodeId: node.id,
                sceneKey: key,
                imageUrl: (node.data?.imageUrl as string) || ''
              });
              setShowAssetModal(true);
            }
          }
        };
      }
      if (node.type === 'scenePlanNode' || node.id.startsWith('scene-plan-node-')) {
        const sceneIdx = Number(node.data?.screenIndex || node.data?.sceneIndex) || 1;
        return {
          ...node,
          data: {
            ...node.data,
            onUpdate: (updated: any) => {
              setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, ...updated } } : n));
            },
            onGenerateImage: () => handleTriggerGenerateSceneImage(sceneIdx, undefined, selectedModel, selectedResolution, false),
            onGeneratePoster: () => handleTriggerGenerateSceneImage(sceneIdx, undefined, selectedModel, selectedResolution, true),
          }
        };
      }
      return node;
    });
  }, [nodes, effectiveCanvasId, workspaceId, productDnaVersionId, handleTriggerGenerateSceneImage, selectedModel, selectedResolution]);

  const productionImagesMap = React.useMemo(() => {
    const map: Record<string, {
      imageUrl: string;
      width: number;
      height: number;
      aspectRatio?: string;
      assetVersionId?: string;
      subjectBounds?: any;
    }> = {};

    nodes.forEach(node => {
      if (node.type === 'generatedImage' || node.type === 'generatedImageNode' || node.id.startsWith('gen-img-node-')) {
        const d = node.data as any;
        if (d) {
          const sIdx = Number(d.sceneIndex) || 1;
          const sceneKey = `scene-${String(sIdx).padStart(2, '0')}`;
          const dims = typeof d.dimensions === 'string' ? d.dimensions.split('x') : [];
          const w = d.sourceWidth || (dims.length === 2 ? parseInt(dims[0], 10) : 1920);
          const h = d.sourceHeight || (dims.length === 2 ? parseInt(dims[1], 10) : 1080);
          map[sceneKey] = {
            imageUrl: d.imageUrl || '',
            width: w,
            height: h,
            aspectRatio: d.sourceAspectRatio || d.aspectRatio,
            assetVersionId: d.assetVersionId,
            subjectBounds: d.subjectBounds || null
          };
        }
      }
    });
    return map;
  }, [nodes]);

  const handleOpenPosterStudio = React.useCallback((targetScreenIndex?: number) => {
    const defaultScreens = createDefaultNinePlan({
      productName: activeDna?.subcategory || activeDna?.category || 'MANWAH 智能家居',
      category: activeDna?.category,
      materials: Array.isArray(activeDna?.materials) ? activeDna.materials : undefined
    });
    const plannedScreens = agentRun?.plan?.screens || [];
    
    // Use actual generated screens if available, otherwise fallback to default 9 screens
    const baseScreens = plannedScreens.length > 0 ? plannedScreens : defaultScreens;

    const screens = baseScreens.map((baseItem, i) => {
      const fallback = defaultScreens.find(d => d.screenIndex === baseItem.screenIndex) || defaultScreens[i % 9];
      const planned = plannedScreens.length > 0 ? (baseItem as any) : null;
      const sceneKey = `scene-${String(baseItem.screenIndex).padStart(2, '0')}`;
      const asset = productionImagesMap[sceneKey];
      return {
        ...fallback,
        screenIndex: baseItem.screenIndex,
        screenTitle: planned?.screenTitle || fallback.screenTitle,
        headline: planned?.coreSellingPoint || fallback.headline,
        prompt: planned?.promptSuggestion || fallback.prompt,
        sourceImageUrl: asset?.imageUrl || fallback.sourceImageUrl,
        sourceAssetVersionId: asset?.assetVersionId,
        sourceWidth: asset?.width || fallback.sourceWidth,
        sourceHeight: asset?.height || fallback.sourceHeight,
        sourceAspectRatio:
          asset?.width && asset?.height ? asset.width / asset.height : fallback.sourceAspectRatio,
        status: asset?.imageUrl ? ('review' as const) : fallback.status
      };
    });

    navigate(`/poster-studio/${effectiveCanvasId}`, {
      state: {
        posterStudioHandoff: {
          schemaVersion: 'poster-studio-handoff/v1',
          canvasId: effectiveCanvasId,
          initialScreenIndex: typeof targetScreenIndex === 'number' ? targetScreenIndex : 1,
          screens
        }
      }
    });
  }, [activeDna, agentRun, effectiveCanvasId, navigate, productionImagesMap]);

  React.useEffect(() => {
    handleOpenPosterStudioRef.current = handleOpenPosterStudio;
  }, [handleOpenPosterStudio]);

  React.useEffect(() => {
    const handleCustomRestore = (e: any) => {
      if (e.detail) {
        restoreNodeWorkflow(e.detail);
        alert(`已成功复现节点工作流参数！\n模型：${e.detail.model || 'Gemini 3 Pro'}\n分辨率：${e.detail.dimensions || '1024x1365'}\n画面比例：${e.detail.aspectRatio || '3:4'}`);
      }
    };
    window.addEventListener('restore_node_workflow', handleCustomRestore);
    return () => {
      window.removeEventListener('restore_node_workflow', handleCustomRestore);
    };
  }, [restoreNodeWorkflow]);

  const handleExportJson = React.useCallback(async () => {
    try {
      if (exportCanvasJson) {
        await exportCanvasJson();
        return;
      }
    } catch (e) {
      console.warn('Frontend exportCanvasJson failed, fallbacking to server API export...', e);
    }
    const cid = canvasId || workspaceId || 'default-canvas';
    const url = `/api/canvases/${cid}/export-json`;
    const fileName = `canvas_${cid}_backup.json`;
    await downloadFileWithFallback([url], fileName);
  }, [exportCanvasJson, canvasId, workspaceId]);

  const handleImportJson = React.useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importCanvasJson(parsed);
      alert(`成功导入工作流 JSON，已载入 ${res.count} 个节点！`);
    } catch (e: any) {
      alert(`导入 JSON 失败: ${e?.message || '文件格式错误'}`);
    }
  }, [importCanvasJson]);

  return (
    <div className="w-screen h-screen h-[100dvh] flex flex-col bg-[#FAF8F5] overflow-hidden fixed inset-0 z-50">
      <WorkflowHeader
        workspaceName={workspaceId ? `企划空间 #${workspaceId}` : '新建立体视觉企划案'}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        currentRevisionNumber={currentRevisionNumber}
        dnaCode={dnaCode}
        productDnaVersionCode={productDnaVersionCode}
        productDnaVersionId={productDnaVersionId}
        onSaveDraftNow={handleSaveDraftNow}
        onViewDnaVersion={() => setShowFullDnaDrawer(true)}
        onOpenSaveModal={() => setShowSaveVersionModal(true)}
        onOpenHistoryModal={() => setShowHistoryModal(true)}
        onOpenStorageManager={() => setShowStorageModal(true)}
        onOpenLayoutEditor={handleOpenPosterStudio}
        onOpenVideoPanel={() => handleOpenVideoPanel()}
        onNewCanvas={handleCreateNewCanvas}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      />
      <div className="flex-1 flex w-full h-[calc(100dvh-3.5rem)] overflow-hidden relative">
        <ReactFlowProvider>
          <div className="flex-1 relative h-full overflow-hidden">
            <CanvasWorkspace
              workspaceId={workspaceId}
              nodes={augmentedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
              onSelectAll={selectAllNodes}
              onClearSelection={clearSelection}
              onDeleteSelected={deleteSelectedNodes}
              onDuplicateSelected={duplicateSelectedNodes}
              onAddCustomNode={addCustomNode}
              onUploadFile={handleUploadFile}
              onAutoLayoutNodes={handleAutoLayoutNodes}
              onGrid3x3Layout={handleGrid3x3Layout}
              onSeamlessLayout={handleSeamlessLayout}
              onGenerateSceneImage={handleTriggerGenerateSceneImage}
              onOpenVideoPanel={handleOpenVideoPanel}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              selectedResolution={selectedResolution}
              setSelectedResolution={setSelectedResolution}
            />
          </div>
          <AgentPanel
            messages={messages}
            uploadState={uploadState}
            errorMessage={errorMessage}
            activeDna={activeDna}
            dnaCode={dnaCode}
            productDnaVersionCode={productDnaVersionCode}
            productDnaVersionId={productDnaVersionId}
            dnaVersions={dnaVersions}
            onSelectDnaVersion={onSelectDnaVersion}
            showFullDnaDrawer={showFullDnaDrawer}
            setShowFullDnaDrawer={setShowFullDnaDrawer}
            onUploadFile={handleUploadFile}
            onSendMessage={handleSendMessageStream}
            currentConversation={currentConversation}
            conversationsList={conversationsList}
            isStreaming={isStreaming}
            streamError={streamError}
            onStopGenerating={handleStopGenerating}
            onRetryMessage={handleRetryMessage}
            onCreateNewConversation={handleCreateNewConversation}
            onSelectConversation={handleSelectConversation}
            agentRun={agentRun}
            isPlanGenerating={isPlanGenerating}
            planError={planError}
            selectedNodeId={selectedNodeId}
            selectedSceneIndex={selectedSceneIndex}
            onSelectSceneIndex={onSelectSceneIndex}
            onGenerateNineGridPlan={handleGenerateNineGridPlan}
            onReplanSingleScene={handleReplanSingleScene}
            planAgentModel={planAgentModel}
            setPlanAgentModel={setPlanAgentModel}
            planReasoningEffort={planReasoningEffort}
            setPlanReasoningEffort={setPlanReasoningEffort}
            planTargetAudience={planTargetAudience}
            setPlanTargetAudience={setPlanTargetAudience}
            planScreenCount={planScreenCount}
            setPlanScreenCount={setPlanScreenCount}
            planAspectRatio={planAspectRatio}
            setPlanAspectRatio={setPlanAspectRatio}
            styleRefImages={styleRefImages}
            setStyleRefImages={setStyleRefImages}
            refDocName={refDocName}
            setRefDocName={setRefDocName}
            refDocText={refDocText}
            setRefDocText={setRefDocText}
            planEnableSearch={planEnableSearch}
            setPlanEnableSearch={setPlanEnableSearch}
            planSearchKeywords={planSearchKeywords}
            setPlanSearchKeywords={setPlanSearchKeywords}
            marketSearchLoading={marketSearchLoading}
            marketSearchResult={marketSearchResult}
            onSearchMarketReference={handleSearchMarketReference}
            onClearMarketSearchResult={() => setMarketSearchResult(null)}
            generatingScenes={generatingScenes}
            nodes={nodes}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            selectedResolution={selectedResolution}
            setSelectedResolution={setSelectedResolution}
            onGenerateSceneImage={handleTriggerGenerateSceneImage}
            onOpenPosterStudio={handleOpenPosterStudio}
            onPreviewGptImage={handleOpenGptPreviewManual}
            onApproveSceneImage={handleApproveSceneImage}
            onRejectSceneImage={handleRejectSceneImage}

            // C3B Batch Queue Props
            batchState={batchState}
            queueItems={queueItems}
            onTriggerBatchMissingModal={handleTriggerBatchMissingModal}
            onPauseBatch={handlePauseBatch}
            onResumeBatch={handleResumeBatch}
            onCancelBatch={handleCancelBatch}
            onRetryFailedBatch={handleRetryFailedBatch}

            // C4B Copy Workspace Props
            canvasId={canvasId || workspaceId || 'default-canvas'}
            projectId={workspaceId || 'default-project'}
          />
        </ReactFlowProvider>

        {/* C3B Batch Generation Confirmation Modal */}
        <BatchConfirmModal
          isOpen={showBatchConfirmModal}
          onClose={() => setShowBatchConfirmModal(false)}
          onConfirm={handleStartBatchGeneration}
          info={batchConfirmInfo}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          selectedResolution={selectedResolution}
          setSelectedResolution={setSelectedResolution}
          withText={batchWithText}
          setWithText={setBatchWithText}
        />

        {/* New Canvas Confirmation Modal */}
        <NewCanvasModal
          isOpen={showNewCanvasModal}
          onClose={() => setShowNewCanvasModal(false)}
          onConfirm={handleConfirmNewCanvas}
        />

        {/* C4A-1 Save Version Snapshot Modal */}
        <SaveVersionModal
          isOpen={showSaveVersionModal}
          onClose={() => setShowSaveVersionModal(false)}
          onSave={handleSaveVersion}
          currentRevisionNumber={currentRevisionNumber}
        />

        {/* C4A-1 Revision History Modal */}
        <VersionHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          canvasId={canvasId}
          onRestoreRevision={handleRestoreRevision}
        />

        {/* C4A-2 Scene Asset SKU & Version Modal */}
        <AssetVersionModal
          isOpen={showAssetModal}
          onClose={() => setShowAssetModal(false)}
          canvasId={canvasId}
          projectId="proj_c4a2_default"
          sceneKey={assetModalTarget.sceneKey}
          nodeId={assetModalTarget.nodeId}
          currentImageUrl={assetModalTarget.imageUrl}
          onVersionSwitched={(skuId, versionId, previewUrl, versionCode) => {
            // Update local node state
            const targetIndex = nodes.findIndex(n => n.id === assetModalTarget.nodeId);
            if (targetIndex !== -1) {
              const updated = [...nodes];
              updated[targetIndex] = {
                ...updated[targetIndex],
                data: {
                  ...updated[targetIndex].data,
                  assetSkuId: skuId,
                  assetVersionId: versionId,
                  assetVersionCode: versionCode,
                  imageUrl: previewUrl
                }
              };
            }
          }}
        />

        {/* GPT-Image-2 Uploaded Reference Preview & Confirmation Modal */}
        <GptImagePreviewModal
          isOpen={showGptPreviewModal}
          onClose={() => setShowGptPreviewModal(false)}
          onConfirm={handleConfirmGptPreview}
          uploadedImageUrl={effectiveUploadedImageUrl}
          onUploadNewImage={(b64) => setUploadedBase64(b64)}
          screenIndex={gptPreviewParams.screenIndex}
          screenTitle={gptPreviewParams.screenTitle}
          promptSuggestion={gptPreviewParams.promptSuggestion}
          selectedModel={selectedModel}
          selectedResolution={selectedResolution}
        />

        {/* Video Generation Right Panel (Creative Canvas Video V1) */}
        <VideoCreationPanel
          canvasId={effectiveCanvasId}
          isOpen={isVideoPanelOpen}
          onClose={() => setIsVideoPanelOpen(false)}
          selectedNode={videoSelectedNode}
          allNodes={nodes}
          onPlanCreated={handlePlanCreated}
          onJobSubmitted={handleJobSubmitted}
        />

        {/* Supabase Storage & History Manager Modal */}
        <StorageManagerModal
          isOpen={showStorageModal}
          onClose={() => setShowStorageModal(false)}
          currentCanvasId={canvasId}
          onCanvasDeleted={(deletedId) => {
            if (deletedId === canvasId) {
              handleCreateNewCanvas();
            }
          }}
        />

      </div>
    </div>
  );
}
