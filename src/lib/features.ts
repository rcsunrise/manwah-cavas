/**
 * Client-Side Feature Flags
 * Controls feature flags and database table dependencies.
 */
export const features = {
  /**
   * DB table detail_render_jobs support.
   * Default: false (prevents PostgREST 404 / PGRST205 requests when table is not deployed)
   */
  detailRenderJobs: (import.meta as any).env?.VITE_ENABLE_DETAIL_RENDER_JOBS === 'true' || false,
};
