// server/repositories/usageRepository.ts
import { supabaseAdmin } from '../../src/lib/supabase';

export interface UsageLogRecord {
  id?: string;
  user_id?: string | null;
  dept_id?: string | null;
  model: string;
  model_res?: string | null;
  tokens_used: number;
  cost_usd: number;
  type: string;
  created_at?: string;
}

export interface FinancialRecord {
  id?: string;
  user_id?: string | null;
  dept_id?: string | null;
  amount: number;
  type: string;
  description?: string;
  created_at?: string;
}

export class UsageRepository {
  /**
   * Insert a usage log entry
   */
  static async logUsage(entry: UsageLogRecord): Promise<UsageLogRecord> {
    const record = {
      ...entry,
      created_at: entry.created_at || new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('usage_logs')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      console.error('[UsageRepository] logUsage error:', error);
      throw error;
    }
    return data as UsageLogRecord;
  }

  /**
   * Get unified finance summary (view: finance_summary)
   */
  static async getFinanceSummary(): Promise<{ total_deposited: number; total_consumed: number; current_balance: number }> {
    const { data, error } = await supabaseAdmin
      .from('finance_summary')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[UsageRepository] getFinanceSummary error:', error);
      // Fallback calculation directly if view is not present yet
      const [depRes, useRes] = await Promise.all([
        supabaseAdmin.from('financial_records').select('amount'),
        supabaseAdmin.from('usage_logs').select('cost_usd')
      ]);
      const total_deposited = (depRes.data || []).reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0);
      const total_consumed = (useRes.data || []).reduce((acc: number, r: any) => acc + Number(r.cost_usd || 0), 0);
      return {
        total_deposited,
        total_consumed,
        current_balance: total_deposited - total_consumed
      };
    }

    return {
      total_deposited: Number(data?.total_deposited || 0),
      total_consumed: Number(data?.total_consumed || 0),
      current_balance: Number(data?.current_balance || 0)
    };
  }

  /**
   * Get department billing records (view: department_billing_records)
   */
  static async getDepartmentBillingRecords(limit: number = 100, offset: number = 0): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('department_billing_records')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[UsageRepository] getDepartmentBillingRecords error:', error);
      throw error;
    }
    return data || [];
  }
}
