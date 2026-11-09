import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';

export interface FieldGapInput {
  label: string;
  canonicalField?: string;
  inputType?: string;
  host?: string;
  reason: 'no_answer' | 'fill_failed' | 'profile_missing';
}

/** Lowercased, whitespace-collapsed form label used to group the same question across sites and users. */
export function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[*✱✲]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:?.!]+$/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * Remembers which form fields could not be filled, so the user can answer them once
 * and developers can see which fields are most often missing. Stores labels only, never answers.
 */
@Injectable()
export class FieldGapsService {
  private readonly logger = new Logger(FieldGapsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async record(userId: string, accessToken: string, gaps: FieldGapInput[]): Promise<{ recorded: number }> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    // One row per (label, host) even if the same field was listed twice.
    const byKey = new Map<string, FieldGapInput & { key: string; host: string }>();
    for (const gap of gaps) {
      const key = labelKey(gap.label);
      if (!key) continue;
      const host = (gap.host ?? '').toLowerCase().slice(0, 200);
      byKey.set(`${key}|${host}`, { ...gap, key, host });
    }
    const items = [...byKey.values()];
    if (items.length === 0) return { recorded: 0 };

    const { data: existing, error: readErr } = await client
      .from('field_gaps')
      .select('id, label_key, host, times_seen')
      .eq('user_id', userId)
      .in('label_key', [...new Set(items.map((i) => i.key))]);

    if (readErr) {
      this.logger.error(`Failed to read field gaps: ${readErr.message}`);
      throw readErr;
    }

    const known = new Map((existing ?? []).map((r) => [`${r.label_key}|${r.host}`, r]));
    const now = new Date().toISOString();
    const inserts: Record<string, unknown>[] = [];

    for (const item of items) {
      const row = known.get(`${item.key}|${item.host}`);
      if (row) {
        const { error } = await client
          .from('field_gaps')
          .update({
            times_seen: row.times_seen + 1,
            last_seen_at: now,
            reason: item.reason,
            canonical_field: item.canonicalField ?? null,
            input_type: item.inputType ?? null,
            resolved_at: null,
          })
          .eq('id', row.id)
          .eq('user_id', userId);
        if (error) this.logger.warn(`Could not update field gap: ${error.message}`);
      } else {
        inserts.push({
          user_id: userId,
          label: item.label.slice(0, 300),
          label_key: item.key,
          canonical_field: item.canonicalField ?? null,
          input_type: item.inputType ?? null,
          host: item.host,
          reason: item.reason,
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await client.from('field_gaps').insert(inserts);
      if (error) {
        this.logger.error(`Failed to insert field gaps: ${error.message}`);
        throw error;
      }
    }

    return { recorded: items.length };
  }

  /** The user supplied an answer for this question; mark it resolved on every site. */
  async resolve(userId: string, accessToken: string, label: string): Promise<void> {
    const key = labelKey(label);
    if (!key) return;

    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('field_gaps')
      .update({ resolved_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('label_key', key)
      .is('resolved_at', null);

    if (error) {
      this.logger.error(`Failed to resolve field gap: ${error.message}`);
      throw error;
    }
  }
}
