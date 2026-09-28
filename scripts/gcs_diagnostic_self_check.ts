// scripts/gcs_diagnostic_self_check.ts
/**
 * Independent GCS Storage Self-Check Script
 * 
 * STRICT COMPLIANCE RULES:
 * 1. Target bucket: 'manwah-canvas-video-0557963301'.
 * 2. When using GCS_CREDENTIALS_JSON:
 *    - Explicitly pass parsed credentials to @google-cloud/storage.
 *    - If present but parsing/validation fails, return error immediately; DO NOT fallback to ADC.
 *    - Separately report runtimeMetadataIdentity (from metadata server) and effectiveStorageIdentity.
 * 3. storage.buckets.get IS NOT a mandatory prerequisite blocker for object operations.
 *    Bucket metadata check is isolated; even if it returns 403, proceed to test:
 *    Upload -> Object Metadata -> Readback Integrity -> V4 Signed URL -> GET Playback -> Range 206 -> Object Cleanup.
 * 4. Compatible with Storage Object User (roles/storage.objectUser) permissions.
 * 5. GCS_KEY_FILE / GOOGLE_APPLICATION_CREDENTIALS are fully optional; not required when GCS_CREDENTIALS_JSON is used.
 * 6. Never output private keys, full credentials, or full signed URLs.
 * 7. Do not submit new video generation tasks.
 */

import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import crypto from 'crypto';

export interface GcsDiagnosticStepResult {
  status: 'success' | 'failed' | 'skipped';
  details?: Record<string, any>;
  error?: string;
}

export interface GcsDiagnosticResult {
  projectId: string;
  bucket: string;
  objectKey: string;
  authMethod: string;
  runtimeMetadataIdentity: string;
  effectiveStorageIdentity: string;
  targetServiceAccount: string;
  signedUrlProvider: 'gcs' | 'local_fallback' | 'none';
  steps: {
    identityCheck: GcsDiagnosticStepResult;
    bucketMetadataCheck: GcsDiagnosticStepResult;
    objectUpload: GcsDiagnosticStepResult;
    objectMetadata: GcsDiagnosticStepResult;
    readbackIntegrity: GcsDiagnosticStepResult;
    v4SignedUrl: GcsDiagnosticStepResult;
    playbackGet: GcsDiagnosticStepResult;
    rangeStream206: GcsDiagnosticStepResult;
    objectCleanup: GcsDiagnosticStepResult;
  };
  overallPassed: boolean;
  failureReason: string | null;
  timestamp: string;
}

export async function runGcsDiagnosticCheck(
  customBucket?: string,
  customProject?: string
): Promise<GcsDiagnosticResult> {
  const projectId = customProject || process.env.GCP_PROJECT_ID || 'gen-lang-client-0557963301';
  const bucketName = customBucket || process.env.GCS_VIDEO_BUCKET || 'manwah-canvas-video-0557963301';
  const targetServiceAccount = 'canvas-video-storage@gen-lang-client-0557963301.iam.gserviceaccount.com';
  const objectKey = `creative-canvas/videos/self-check/diagnostic-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`;

  const results: GcsDiagnosticResult = {
    projectId,
    bucket: bucketName,
    objectKey,
    authMethod: 'ADC (Application Default Credentials)',
    runtimeMetadataIdentity: 'unknown',
    effectiveStorageIdentity: 'unknown',
    targetServiceAccount,
    signedUrlProvider: 'none',
    steps: {
      identityCheck: { status: 'skipped' },
      bucketMetadataCheck: { status: 'skipped' },
      objectUpload: { status: 'skipped' },
      objectMetadata: { status: 'skipped' },
      readbackIntegrity: { status: 'skipped' },
      v4SignedUrl: { status: 'skipped' },
      playbackGet: { status: 'skipped' },
      rangeStream206: { status: 'skipped' },
      objectCleanup: { status: 'skipped' }
    },
    overallPassed: false,
    failureReason: null,
    timestamp: new Date().toISOString()
  };

  // -------------------------------------------------------------
  // Step 1: Detect Runtime Metadata Identity (Container Infrastructure)
  // -------------------------------------------------------------
  try {
    const metaRes = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000)
    });
    if (metaRes.ok) {
      results.runtimeMetadataIdentity = (await metaRes.text()).trim();
    } else {
      results.runtimeMetadataIdentity = `unavailable (HTTP ${metaRes.status})`;
    }
  } catch (err: any) {
    results.runtimeMetadataIdentity = `unavailable (${err.message})`;
  }

  // -------------------------------------------------------------
  // Step 2: Determine Effective Storage Identity and Storage Options
  // RULE: If GCS_CREDENTIALS_JSON is set, parse strictly. DO NOT fallback to ADC on error!
  // -------------------------------------------------------------
  let storageOptions: any = { projectId };

  if (process.env.GCS_CREDENTIALS_JSON) {
    results.authMethod = 'GCS_CREDENTIALS_JSON';
    try {
      const raw = process.env.GCS_CREDENTIALS_JSON.trim();
      const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
      const parsed = JSON.parse(jsonStr);

      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Parsed credentials JSON missing client_email or private_key fields.');
      }

      storageOptions.credentials = {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
        project_id: parsed.project_id || projectId
      };
      results.effectiveStorageIdentity = parsed.client_email;

      results.steps.identityCheck = {
        status: 'success',
        details: {
          runtimeMetadataIdentity: results.runtimeMetadataIdentity,
          effectiveStorageIdentity: results.effectiveStorageIdentity,
          targetServiceAccount,
          identityMatchesTarget: results.effectiveStorageIdentity === targetServiceAccount,
          authSource: 'GCS_CREDENTIALS_JSON',
          note: 'Explicit service account credentials parsed and passed directly to Storage SDK.'
        }
      };
    } catch (parseErr: any) {
      results.effectiveStorageIdentity = 'parsing_failed';
      results.steps.identityCheck = {
        status: 'failed',
        error: `GCS_CREDENTIALS_JSON parsing error: ${parseErr.message}`,
        details: {
          runtimeMetadataIdentity: results.runtimeMetadataIdentity,
          effectiveStorageIdentity: 'failed_to_parse',
          targetServiceAccount,
          fatalNote: 'Strict rule: GCS_CREDENTIALS_JSON is provided but invalid. Silent ADC fallback is prohibited.'
        }
      };
      results.failureReason = `GCS_CREDENTIALS_JSON is configured but invalid: ${parseErr.message}`;
      return results;
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    results.authMethod = `GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`;
    try {
      const content = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8');
      const parsed = JSON.parse(content);
      results.effectiveStorageIdentity = parsed.client_email || 'from-key-file';
    } catch {
      results.effectiveStorageIdentity = 'key-file-unreadable';
    }
    results.steps.identityCheck = {
      status: 'success',
      details: {
        runtimeMetadataIdentity: results.runtimeMetadataIdentity,
        effectiveStorageIdentity: results.effectiveStorageIdentity,
        targetServiceAccount,
        authSource: 'GOOGLE_APPLICATION_CREDENTIALS'
      }
    };
  } else if (process.env.GCS_KEY_FILE) {
    results.authMethod = `GCS_KEY_FILE (${process.env.GCS_KEY_FILE})`;
    storageOptions.keyFilename = process.env.GCS_KEY_FILE;
    try {
      const content = fs.readFileSync(process.env.GCS_KEY_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      results.effectiveStorageIdentity = parsed.client_email || 'from-key-file';
    } catch {
      results.effectiveStorageIdentity = 'key-file-unreadable';
    }
    results.steps.identityCheck = {
      status: 'success',
      details: {
        runtimeMetadataIdentity: results.runtimeMetadataIdentity,
        effectiveStorageIdentity: results.effectiveStorageIdentity,
        targetServiceAccount,
        authSource: 'GCS_KEY_FILE'
      }
    };
  } else {
    // Default ADC
    results.authMethod = 'ADC (Application Default Credentials)';
    results.effectiveStorageIdentity = results.runtimeMetadataIdentity;
    const isTarget = results.effectiveStorageIdentity === targetServiceAccount;
    results.steps.identityCheck = {
      status: 'success',
      details: {
        runtimeMetadataIdentity: results.runtimeMetadataIdentity,
        effectiveStorageIdentity: results.effectiveStorageIdentity,
        targetServiceAccount,
        identityMatchesTarget: isTarget,
        authSource: 'ADC',
        note: isTarget
          ? 'ADC matches target service account'
          : `Running under container ADC (${results.runtimeMetadataIdentity}). GCS_CREDENTIALS_JSON not provided.`
      }
    };
  }

  // Initialize Storage SDK with resolved options
  let storage: Storage;
  try {
    storage = new Storage(storageOptions);
  } catch (initErr: any) {
    results.failureReason = `Storage SDK client instantiation failed: ${initErr.message}`;
    return results;
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectKey);

  // -------------------------------------------------------------
  // Step 3: Bucket Metadata Check (Informational, NOT a blocking gate!)
  // RULE: storage.buckets.get returning 403 must NOT block object tests.
  // Many least-privilege roles (like Storage Object User) only have object permissions.
  // -------------------------------------------------------------
  try {
    const [metadata] = await bucket.getMetadata();
    results.steps.bucketMetadataCheck = {
      status: 'success',
      details: {
        bucket: bucketName,
        location: metadata.location,
        storageClass: metadata.storageClass,
        note: 'Bucket metadata retrieved (caller has storage.buckets.get permission).'
      }
    };
  } catch (bucketErr: any) {
    results.steps.bucketMetadataCheck = {
      status: 'failed',
      details: {
        errorCode: bucketErr.code || 403,
        message: bucketErr.message,
        note: 'storage.buckets.get returned error. This is expected if the caller has Storage Object User (roles/storage.objectUser) instead of Storage Admin. Proceeding to object operations.'
      }
    };
  }

  // Prepare a small, real MP4 sample payload
  const samplePath = '.data/videos/ws-default/test-canvas-003/vjob-1789096395593-bb7914a6/av-vid-1789096405682-ee9181/original.mp4';
  let sampleBuffer: Buffer;
  if (fs.existsSync(samplePath)) {
    sampleBuffer = fs.readFileSync(samplePath).subarray(0, 32768); // 32KB valid MP4 slice
  } else {
    sampleBuffer = Buffer.from('TEST_DIAGNOSTIC_MP4_PAYLOAD_' + Date.now());
  }
  const originalSha256 = crypto.createHash('sha256').update(sampleBuffer).digest('hex');

  // -------------------------------------------------------------
  // Step 4: Object Upload
  // -------------------------------------------------------------
  try {
    await file.save(sampleBuffer, {
      contentType: 'video/mp4',
      resumable: false,
      validation: 'crc32c',
      metadata: {
        cacheControl: 'private, max-age=0'
      }
    });
    results.steps.objectUpload = {
      status: 'success',
      details: {
        objectKey,
        bytes: sampleBuffer.length,
        contentType: 'video/mp4'
      }
    };
  } catch (uploadErr: any) {
    results.steps.objectUpload = {
      status: 'failed',
      details: {
        errorCode: uploadErr.code,
        message: uploadErr.message,
        objectKey
      }
    };
    results.failureReason = `Upload step failed: ${uploadErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 5: Object Metadata Query
  // -------------------------------------------------------------
  try {
    const [meta] = await file.getMetadata();
    results.steps.objectMetadata = {
      status: 'success',
      details: {
        size: meta.size,
        contentType: meta.contentType,
        crc32c: meta.crc32c,
        generation: meta.generation
      }
    };
  } catch (metaErr: any) {
    results.steps.objectMetadata = {
      status: 'failed',
      details: {
        errorCode: metaErr.code,
        message: metaErr.message
      }
    };
    results.failureReason = `Object metadata query failed: ${metaErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 6: Readback & SHA-256 Integrity Verification
  // -------------------------------------------------------------
  try {
    const [downloadedBuffer] = await file.download();
    const downloadSha256 = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

    if (originalSha256 === downloadSha256) {
      results.steps.readbackIntegrity = {
        status: 'success',
        details: {
          downloadedBytes: downloadedBuffer.length,
          sha256Matched: true
        }
      };
    } else {
      results.steps.readbackIntegrity = {
        status: 'failed',
        details: {
          error: 'SHA-256 integrity mismatch between original upload and downloaded buffer'
        }
      };
      results.failureReason = 'Readback validation failed: SHA-256 mismatch.';
      return results;
    }
  } catch (readErr: any) {
    results.steps.readbackIntegrity = {
      status: 'failed',
      details: {
        errorCode: readErr.code,
        message: readErr.message
      }
    };
    results.failureReason = `Readback validation failed: ${readErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 7: Real GCS V4 Signed URL Generation
  // Note: NEVER output raw private_key or full signed URL. Mask host & path.
  // -------------------------------------------------------------
  let signedUrl: string;
  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000
    });
    signedUrl = url;
    results.signedUrlProvider = 'gcs';

    const urlObj = new URL(url);
    results.steps.v4SignedUrl = {
      status: 'success',
      details: {
        host: urlObj.host,
        path: urlObj.pathname,
        signatureParamPresent: urlObj.searchParams.has('X-Goog-Signature'),
        algorithm: urlObj.searchParams.get('X-Goog-Algorithm'),
        credentialHeader: urlObj.searchParams.get('X-Goog-Credential')?.split('/')[0] || 'present',
        expiresInSeconds: 900
      }
    };
  } catch (signErr: any) {
    results.steps.v4SignedUrl = {
      status: 'failed',
      details: {
        errorCode: signErr.code,
        message: signErr.message,
        note: 'V4 signed URL generation requires either explicit private_key (via GCS_CREDENTIALS_JSON) or iam.serviceAccounts.signBlob permission.'
      }
    };
    results.failureReason = `GCS V4 signed URL generation failed: ${signErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 8: HTTP GET Playback Test
  // -------------------------------------------------------------
  try {
    const playbackRes = await fetch(signedUrl);
    if (playbackRes.ok) {
      results.steps.playbackGet = {
        status: 'success',
        details: {
          httpStatus: playbackRes.status,
          contentType: playbackRes.headers.get('content-type'),
          contentLength: playbackRes.headers.get('content-length'),
          acceptRanges: playbackRes.headers.get('accept-ranges')
        }
      };
    } else {
      results.steps.playbackGet = {
        status: 'failed',
        details: {
          httpStatus: playbackRes.status,
          statusText: playbackRes.statusText
        }
      };
      results.failureReason = `HTTP GET playback test returned status ${playbackRes.status}`;
      return results;
    }
  } catch (playbackErr: any) {
    results.steps.playbackGet = {
      status: 'failed',
      details: { error: playbackErr.message }
    };
    results.failureReason = `HTTP GET playback request failed: ${playbackErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 9: HTTP Range 206 Partial Content Test
  // -------------------------------------------------------------
  try {
    const rangeRes = await fetch(signedUrl, {
      headers: { Range: 'bytes=0-1024' }
    });
    if (rangeRes.status === 206) {
      results.steps.rangeStream206 = {
        status: 'success',
        details: {
          httpStatus: rangeRes.status,
          contentRange: rangeRes.headers.get('content-range'),
          contentLength: rangeRes.headers.get('content-length')
        }
      };
      results.overallPassed = true;
    } else {
      results.steps.rangeStream206 = {
        status: 'failed',
        details: {
          httpStatus: rangeRes.status,
          expectedStatus: 206
        }
      };
      results.failureReason = `Range streaming test returned HTTP ${rangeRes.status}, expected 206 Partial Content.`;
      return results;
    }
  } catch (rangeErr: any) {
    results.steps.rangeStream206 = {
      status: 'failed',
      details: { error: rangeErr.message }
    };
    results.failureReason = `Range streaming test failed: ${rangeErr.message}`;
    return results;
  }

  // -------------------------------------------------------------
  // Step 10: Cleanup Diagnostic Object (Non-fatal)
  // Supported under Storage Object User (storage.objects.delete)
  // -------------------------------------------------------------
  try {
    await file.delete({ ignoreNotFound: true });
    results.steps.objectCleanup = {
      status: 'success',
      details: { deletedObjectKey: objectKey }
    };
  } catch (delErr: any) {
    results.steps.objectCleanup = {
      status: 'failed',
      details: {
        errorCode: delErr.code,
        message: delErr.message,
        note: 'Diagnostic object was created but cleanup encountered an issue; does not invalidate upload/readback/V4/206 success.'
      }
    };
  }

  return results;
}

// Direct CLI Execution
if (process.argv[1]?.endsWith('gcs_diagnostic_self_check.ts')) {
  runGcsDiagnosticCheck()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      if (!res.overallPassed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
}
