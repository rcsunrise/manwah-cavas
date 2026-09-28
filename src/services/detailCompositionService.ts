import { CompositionAssembleInput, ScreenCompositionV2, CompositionRenderJob } from '../types/detailCompositionSchema';
import { supabase } from '../lib/supabase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || localStorage.getItem('token') || '';
    const user = data?.session?.user;
    const storedUser = localStorage.getItem('manwah_user');
    let userUuid = user?.id || '';

    if (!userUuid && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        userUuid = parsed.id || '';
      } catch (e) {}
    }

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (userUuid) headers['x-user-uuid'] = userUuid;
  } catch (e) {}
  return headers;
}

function parseErrorMessage(data: any, res: Response): string {
  if (data?.error) {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.error === 'object') {
      return data.error.message || data.error.details || JSON.stringify(data.error);
    }
  }
  if (typeof data?.message === 'string') return data.message;
  return `排版装配请求未成功响应 (HTTP ${res.status})`;
}

export async function assembleComposition(
  input: Omit<CompositionAssembleInput, 'requestedBy'>
): Promise<ScreenCompositionV2> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`/api/canvases/${input.canvasId}/detail-compositions/assemble`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(input)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(parseErrorMessage(data, res));
  }

  return data.composition;
}

export async function requestCompositionPreview(
  input: Omit<CompositionAssembleInput, 'requestedBy'>
): Promise<{ jobId: string; compositionId: string; composition?: ScreenCompositionV2 }> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`/api/canvases/${input.canvasId}/detail-compositions/preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(input)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(parseErrorMessage(data, res));
  }

  return { jobId: data.jobId, compositionId: data.compositionId, composition: data.composition };
}

export async function requestCompositionRender(
  input: Omit<CompositionAssembleInput, 'requestedBy'>
): Promise<{ jobId: string; compositionId: string; composition?: ScreenCompositionV2 }> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`/api/canvases/${input.canvasId}/detail-compositions/render`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(input)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(parseErrorMessage(data, res));
  }

  return { jobId: data.jobId, compositionId: data.compositionId, composition: data.composition };
}

export async function pollCompositionRenderJob(
  canvasId: string,
  jobId: string
): Promise<CompositionRenderJob> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`/api/canvases/${canvasId}/detail-compositions/jobs/${jobId}`, {
    headers: authHeaders
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(parseErrorMessage(data, res));
  }

  return data.job;
}

export async function fetchScreenComposition(
  canvasId: string,
  compositionId: string
): Promise<ScreenCompositionV2> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`/api/canvases/${canvasId}/detail-compositions/${compositionId}`, {
    headers: authHeaders
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(parseErrorMessage(data, res));
  }

  return data.composition;
}


