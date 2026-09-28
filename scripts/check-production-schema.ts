// scripts/check-production-schema.ts
import { supabaseAdmin } from '../src/lib/supabase';

const REQUIRED_TABLES = [
  'profiles',
  'department_configs',
  'usage_logs',
  'financial_records',
  'creative_projects',
  'creative_canvases',
  'canvas_revisions',
  'agent_conversations',
  'agent_messages',
  'product_dnas',
  'product_dna_versions',
  'asset_skus',
  'asset_versions',
  'copy_skus',
  'copy_versions',
  'typography_specs',
  'canvas_layout_manifests',
  'detail_compositions',
  'detail_composition_versions',
  'detail_exports',
  'detail_export_slices',
  'generation_history',
  'system_prompts',
  'system_settings'
];

const REQUIRED_VIEWS = [
  'finance_summary',
  'department_billing_records'
];

const FORBIDDEN_TABLES = [
  'projects',
  'project_dna',
  'product_visual_dna',
  'model_assets',
  'pose_assets',
  'scene_assets',
  'scene_styles',
  'project_assets',
  'detailed_usage_records',
  'site_usage_summary',
  'detail_render_jobs'
];

export async function runSchemaContractCheck(): Promise<{
  passed: boolean;
  missingTables: string[];
  foundForbidden: string[];
  schemaCheckResult?: any;
}> {
  console.log('\n========================================');
  console.log('MANWAH Production Schema Contract Check');
  console.log('========================================\n');

  const missingTables: string[] = [];
  const foundForbidden: string[] = [];

  // 1. Try RPC check_schema_contract if available
  try {
    const { data, error } = await supabaseAdmin.rpc('check_schema_contract');
    if (!error && data) {
      console.log('Postgres RPC check_schema_contract output:', JSON.stringify(data, null, 2));
      return {
        passed: Boolean(data.passed),
        missingTables: (data.missing_tables || []).concat(data.missing_columns || []),
        foundForbidden: (data.forbidden_tables || []).concat(data.forbidden_columns || []),
        schemaCheckResult: data
      };
    }
  } catch (e) {
    // Fall back to table queries
  }

  // 2. Client-side query check on tables
  console.log('Checking required canonical tables:');
  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await supabaseAdmin.from(table).select('*').limit(0);
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        console.error(`  ❌ Missing table: ${table}`);
        missingTables.push(table);
      } else {
        console.log(`  ✅ Table verified: ${table}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Error querying ${table}:`, err?.message || err);
      missingTables.push(table);
    }
  }

  console.log('\nChecking required views:');
  for (const view of REQUIRED_VIEWS) {
    try {
      const { error } = await supabaseAdmin.from(view).select('*').limit(0);
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        console.error(`  ❌ Missing view: ${view}`);
        missingTables.push(view);
      } else {
        console.log(`  ✅ View verified: ${view}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Error querying ${view}:`, err?.message || err);
      missingTables.push(view);
    }
  }

  console.log('\nChecking forbidden legacy tables (must NOT exist):');
  for (const table of FORBIDDEN_TABLES) {
    try {
      const { error } = await supabaseAdmin.from(table).select('*').limit(0);
      if (!error) {
        console.error(`  🚨 Found forbidden legacy table: ${table}`);
        foundForbidden.push(table);
      } else {
        console.log(`  ✅ Confirmed removed: ${table}`);
      }
    } catch (err) {
      console.log(`  ✅ Confirmed removed: ${table}`);
    }
  }

  const passed = missingTables.length === 0 && foundForbidden.length === 0;
  return {
    passed,
    missingTables,
    foundForbidden
  };
}

if (process.argv[1]?.includes('check-production-schema')) {
  runSchemaContractCheck().then(result => {
    console.log('\n========================================');
    if (result.passed) {
      console.log('🎉 SCHEMA CONTRACT PASSED: All canonical tables valid, no legacy tables found.');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error('❌ SCHEMA CONTRACT FAILED:');
      if (result.missingTables.length > 0) {
        console.error('Missing objects:', result.missingTables);
      }
      if (result.foundForbidden.length > 0) {
        console.error('Forbidden objects found:', result.foundForbidden);
      }
      console.log('========================================\n');
      process.exit(1);
    }
  }).catch(err => {
    console.error('Unexpected error during schema contract check:', err);
    process.exit(1);
  });
}
