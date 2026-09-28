import { supabaseAdmin } from '../../src/lib/supabase';
import { isValidUuid } from '../lib/uuid';

export type ProviderName = 'routerhub' | 'vectorengine' | 'tiantoken';

export interface ApiProviderConfig {
  apiKey?: string;
  baseUrl: string;
  deptId: string | null;
  provider: ProviderName;
  routingMode?: number | null;
  method1Key?: string | null;
  source: 'department' | 'global' | 'none';
}

export const isProviderKeyValid = (key: string | null | undefined): key is string =>
  Boolean(
    key &&
    !key.includes('在这里填入') &&
    !key.toLowerCase().includes('placeholder') &&
    !key.toLowerCase().startsWith('dummy') &&
    key.trim() !== ''
  );

export function detectProvider(baseUrl: string | null | undefined): ProviderName {
  const normalized = (baseUrl || '').toLowerCase();
  if (normalized.includes('tiantoken')) return 'tiantoken';
  if (normalized.includes('routerhub')) return 'routerhub';
  return 'vectorengine';
}

function normalizeConfig(
  row: any,
  deptId: string | null,
  source: ApiProviderConfig['source']
): ApiProviderConfig | null {
  if (!row) return null;
  const configuredBaseUrl = String(row.api_base_url || '').trim();
  const method1Key = isProviderKeyValid(row.method1_key) ? row.method1_key : null;
  let apiKey = isProviderKeyValid(row.api_key) ? row.api_key : undefined;

  // 如果主 api_key 为空但存在有效 method1Key，则直接以 method1Key 作为主 key
  if (!apiKey && method1Key) {
    apiKey = method1Key;
  }
  if (!apiKey) return null;

  let provider = detectProvider(configuredBaseUrl);
  // 若 apiKey 明确是 RouterHub 专属 key (sk-rh-*)，校准 provider 为 routerhub
  if (apiKey.startsWith('sk-rh-') || (configuredBaseUrl && configuredBaseUrl.includes('routerhub'))) {
    provider = 'routerhub';
  }

  let defaultBaseUrl = 'https://api.vectorengine.ai/v1beta';
  if (provider === 'tiantoken') defaultBaseUrl = 'https://api.tiantoken.com/v1';
  else if (provider === 'routerhub') defaultBaseUrl = 'https://api.routerhub.ai/v1';

  const baseUrl = (provider === 'routerhub' && (!configuredBaseUrl || !configuredBaseUrl.includes('routerhub')))
    ? 'https://api.routerhub.ai/v1'
    : (configuredBaseUrl || defaultBaseUrl);

  return {
    apiKey,
    baseUrl,
    deptId,
    provider,
    routingMode: row.routing_mode,
    method1Key,
    source
  };
}

export async function getUserApiConfig(userId: string) {
  if (!userId || userId === 'system') return null;

  try {
    // 1. First attempt flexible profile lookup by ID, employee_id, or username
    const isUuid = isValidUuid(userId);
    let profileQuery = supabaseAdmin.from('profiles').select('id, dept_id, employee_id, username');
    if (isUuid) {
      profileQuery = profileQuery.eq('id', userId);
    } else {
      profileQuery = profileQuery.or(`employee_id.eq.${userId},username.eq.${userId}`);
    }

    const { data: profile } = await profileQuery.maybeSingle();
    if (!profile?.dept_id) return null;

    // 2. Resiliently fetch department config directly by dept_id
    const { data: deptConfig, error: deptError } = await supabaseAdmin
      .from('department_configs')
      .select('api_key, api_base_url, dept_name, routing_mode, method1_key')
      .eq('id', profile.dept_id)
      .maybeSingle();

    if (deptError || !deptConfig) return null;

    return {
      id: profile.id,
      dept_id: profile.dept_id,
      department_configs: deptConfig
    };
  } catch (err) {
    console.warn(`[providerConfig] getUserApiConfig error for ${userId}:`, err);
    return null;
  }
}

async function getGlobalApiConfig(): Promise<ApiProviderConfig | null> {
  if (isProviderKeyValid(process.env.TIANTOKEN_API_KEY)) {
    return {
      apiKey: process.env.TIANTOKEN_API_KEY,
      baseUrl: process.env.TIANTOKEN_BASE_URL || 'https://api.tiantoken.com/v1',
      deptId: null,
      provider: 'tiantoken',
      source: 'global'
    };
  }

  if (isProviderKeyValid(process.env.VECTORENGINE_API_KEY)) {
    return {
      apiKey: process.env.VECTORENGINE_API_KEY,
      baseUrl: 'https://api.vectorengine.ai/v1beta',
      deptId: null,
      provider: 'vectorengine',
      source: 'global'
    };
  }

  try {
    const { data } = await supabaseAdmin
      .from('department_configs')
      .select('api_base_url, api_key, routing_mode, method1_key')
      .eq('dept_name', '全站系统')
      .maybeSingle();
    const config = normalizeConfig(data, null, 'global');
    if (config) return config;
  } catch (error) {
    console.warn('Failed to fetch global provider config:', error);
  }

  if (isProviderKeyValid(process.env.ROUTERHUB_API_KEY)) {
    return {
      apiKey: process.env.ROUTERHUB_API_KEY,
      baseUrl: 'https://api.routerhub.ai/v1beta',
      deptId: null,
      provider: 'routerhub',
      source: 'global'
    };
  }
  return null;
}

export async function resolveApiConfig(userUuid: string = 'system'): Promise<ApiProviderConfig> {
  if (userUuid !== 'system') {
    try {
      const userConfig = await getUserApiConfig(userUuid);
      const departmentConfig = normalizeConfig(
        userConfig?.department_configs,
        userConfig?.dept_id || null,
        'department'
      );
      if (departmentConfig) return departmentConfig;
    } catch (error) {
      console.warn('Failed to fetch department provider config:', error);
    }
  }

  const globalConfig = await getGlobalApiConfig();
  if (globalConfig) return globalConfig;

  return {
    apiKey: undefined,
    baseUrl: '',
    deptId: null,
    provider: 'routerhub',
    source: 'none'
  };
}

export async function getFallbackConfig(
  deptId?: string | null,
  method1Key?: string | null
): Promise<ApiProviderConfig | null> {
  if (isProviderKeyValid(method1Key)) {
    return {
      apiKey: method1Key,
      provider: 'routerhub',
      baseUrl: 'https://api.routerhub.ai/v1beta',
      deptId: deptId || null,
      source: deptId ? 'department' : 'global'
    };
  }

  if (deptId) {
    try {
      const { data } = await supabaseAdmin
        .from('department_configs')
        .select('method1_key, api_key, api_base_url')
        .eq('id', deptId)
        .maybeSingle();

      if (isProviderKeyValid(data?.method1_key)) {
        return {
          apiKey: data.method1_key,
          provider: 'routerhub',
          baseUrl: 'https://api.routerhub.ai/v1beta',
          deptId,
          source: 'department'
        };
      }
      const config = normalizeConfig(data, deptId, 'department');
      if (config && config.provider !== 'vectorengine') return config;
    } catch (error) {
      console.warn('Failed to fetch department fallback config:', error);
    }
  }

  const globalConfig = await getGlobalApiConfig();
  if (globalConfig?.method1Key && isProviderKeyValid(globalConfig.method1Key)) {
    return {
      apiKey: globalConfig.method1Key,
      provider: 'routerhub',
      baseUrl: 'https://api.routerhub.ai/v1beta',
      deptId: null,
      source: 'global'
    };
  }
  if (globalConfig && globalConfig.provider !== 'vectorengine') return globalConfig;
  return null;
}
