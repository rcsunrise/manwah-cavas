// src/services/detailExportService.ts
export interface DetailExportRecord {
  id: string;
  workspace_id: string;
  canvas_id: string;
  export_version_number: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  asset_version_id?: string;
  object_key?: string;
  public_url?: string;
  width: number;
  height: number;
  file_size_bytes?: number;
  checksum?: string;
  revision_id?: string;
  error_message?: string;
}

export interface PosterItemExport {
  sceneKey: string;
  posterIndex: number;
  filename: string;
  width: 2100;
  height: 2800;
  assetVersionId: string;
  objectKey: string;
  publicUrl: string;
  fileSizeBytes: number;
  checksum: string;
}

export interface NinePostersExportResponse {
  success: boolean;
  exportId: string;
  exportVersionNumber: number;
  status: string;
  zipUrl?: string;
  posters: PosterItemExport[];
  export?: any;
  message?: string;
}

export async function requestNinePostersExport(
  canvasId: string,
  workspaceId = 'default_workspace'
): Promise<NinePostersExportResponse> {
  const token = localStorage.getItem('token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`/api/canvases/${canvasId}/detail-exports/nine-posters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspaceId })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || data.error || '九屏海报批量导出失败');
  }

  return data;
}

export async function requestFullCanvasExport(
  canvasId: string,
  workspaceId = 'default_workspace',
  mode: 'async' | 'sync' = 'async'
): Promise<{ success: boolean; jobId: string; exportId: string; status: string; export?: DetailExportRecord }> {
  const token = localStorage.getItem('token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`/api/canvases/${canvasId}/detail-exports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspaceId, mode })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || data.error || '导出任务提交失败');
  }

  return data;
}

export async function pollExportJobStatus(canvasId: string, jobId: string): Promise<any> {
  const token = localStorage.getItem('token') || '';
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`/api/canvases/${canvasId}/detail-exports/jobs/${jobId}`, {
    method: 'GET',
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '查询渲染进度失败');
  }

  return data;
}
