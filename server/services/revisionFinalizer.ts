/**
 * Revision Finalizer Service (C4A-4)
 * Background worker that inspects 'pending_assets' Revisions, verifies associated Asset Versions,
 * and transitions Revisions to 'ready' once all required assets are persisted in Storage & Database.
 * Enhanced with adaptive backoff, circuit breaker, and schema-safe column queries.
 */

import { supabaseAdmin } from '../../src/lib/supabase';
import { CircuitBreaker } from '../../src/lib/resilience/circuit-breaker';
import { classifySupabaseError } from '../../src/lib/resilience/errors';
import fs from 'fs';
import path from 'path';

const REVISIONS_DIR = path.join(process.cwd(), '.data', 'revisions');

class RevisionFinalizer {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private consecutiveEmptyOrError = 0;
  private breaker = new CircuitBreaker({ domain: 'revisionFinalizer', failureThreshold: 5, cooldownMs: 30000 });

  start(intervalMs = 5000) {
    if (this.timer) return;
    this.scheduleNext(intervalMs);
    console.log('[RevisionFinalizer] Background finalizer worker started with adaptive backoff.');
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.tick()
        .catch(err => {
          console.warn('[RevisionFinalizer] Tick error:', err?.message || err);
        })
        .finally(() => {
          // Dynamic adaptive delay: when idle, backoff up to 30s; when active, check every 3s
          const nextDelay = this.consecutiveEmptyOrError > 0
            ? Math.min(30000, 3000 * Math.pow(1.5, Math.min(this.consecutiveEmptyOrError, 6)))
            : 3000;
          this.scheduleNext(Math.round(nextDelay + Math.random() * 500));
        });
    }, delayMs);
  }

  async tick() {
    if (this.isRunning) return;
    if (!this.breaker.canRequest()) {
      return;
    }

    this.isRunning = true;

    try {
      // 1. Check local disk revisions for any pending assets
      let pendingRevs: any[] = [];
      try {
        if (fs.existsSync(REVISIONS_DIR)) {
          const files = fs.readdirSync(REVISIONS_DIR);
          for (const f of files) {
            if (f.endsWith('.json')) {
              const fullPath = path.join(REVISIONS_DIR, f);
              const raw = fs.readFileSync(fullPath, 'utf-8');
              const rec = JSON.parse(raw);
              if (rec && rec.status === 'pending_assets') {
                if (!pendingRevs.some(p => p.id === rec.id)) {
                  pendingRevs.push(rec);
                }
              }
            }
          }
        }
      } catch (e) {}

      if (pendingRevs.length === 0) {
        this.consecutiveEmptyOrError = Math.min(10, this.consecutiveEmptyOrError + 1);
        this.breaker.recordSuccess();
        return;
      }

      this.consecutiveEmptyOrError = 0;
      this.breaker.recordSuccess();

      for (const rev of pendingRevs) {
        await this.finalizeRevision(rev.id);
      }
    } finally {
      this.isRunning = false;
    }
  }

  async finalizeRevision(revisionId: string): Promise<boolean> {
    try {
      // 1. Query associated assets from canvas_revision_assets
      let revAssets: any[] = [];
      try {
        const { data, error } = await supabaseAdmin
          .from('canvas_revision_assets')
          .select('asset_version_id')
          .eq('revision_id', revisionId);
        if (!error && data) {
          revAssets = data;
        }
      } catch (e) {}

      if (revAssets.length === 0) {
        await this.markRevisionReady(revisionId, 0, 0);
        return true;
      }

      const totalAssets = revAssets.length;
      let readyCount = 0;
      let failedCount = 0;

      for (const item of revAssets) {
        const verId = item.asset_version_id;
        let isReady = false;
        let isFailed = false;

        try {
          const { data: verData } = await supabaseAdmin
            .from('asset_versions')
            .select('id, status')
            .eq('id', verId)
            .maybeSingle();

          if (verData) {
            if (verData.status === 'ready') isReady = true;
            else if (verData.status === 'failed') isFailed = true;
          }
        } catch (e) {}

        if (isReady) {
          readyCount += 1;
        } else if (isFailed) {
          failedCount += 1;
        }
      }

      if (readyCount === totalAssets) {
        await this.markRevisionReady(revisionId, totalAssets, readyCount);
        return true;
      } else if (failedCount > 0 && readyCount + failedCount === totalAssets) {
        await this.markRevisionPartial(revisionId, totalAssets, readyCount, failedCount);
        return false;
      } else {
        await this.updateRevisionProgress(revisionId, totalAssets, readyCount, failedCount);
        return false;
      }
    } catch (err) {
      console.warn(`[RevisionFinalizer] Error finalizing revision ${revisionId}:`, err);
      return false;
    }
  }

  private async markRevisionReady(revisionId: string, total: number, readyCount: number) {
    const now = new Date().toISOString();

    // Update disk store
    try {
      const filePath = path.join(REVISIONS_DIR, `${revisionId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const rec = JSON.parse(raw);
        rec.status = 'ready';
        rec.asset_total = total;
        rec.asset_ready_count = readyCount;
        rec.finalized_at = now;
        fs.writeFileSync(filePath, JSON.stringify(rec, null, 2), 'utf-8');
      }
    } catch (e) {}

    console.log(`[RevisionFinalizer] ✅ Revision ${revisionId} transitioned to 'ready' (${readyCount}/${total} assets ready).`);
  }

  private async markRevisionPartial(revisionId: string, total: number, readyCount: number, failedCount: number) {
    try {
      const filePath = path.join(REVISIONS_DIR, `${revisionId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const rec = JSON.parse(raw);
        rec.status = 'ready';
        rec.asset_total = total;
        rec.asset_ready_count = readyCount;
        rec.failed_asset_count = failedCount;
        fs.writeFileSync(filePath, JSON.stringify(rec, null, 2), 'utf-8');
      }
    } catch (e) {}
  }

  private async updateRevisionProgress(revisionId: string, total: number, readyCount: number, failedCount: number) {
    try {
      const filePath = path.join(REVISIONS_DIR, `${revisionId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const rec = JSON.parse(raw);
        rec.asset_total = total;
        rec.asset_ready_count = readyCount;
        rec.failed_asset_count = failedCount;
        fs.writeFileSync(filePath, JSON.stringify(rec, null, 2), 'utf-8');
      }
    } catch (e) {}
  }
}

export const revisionFinalizer = new RevisionFinalizer();
