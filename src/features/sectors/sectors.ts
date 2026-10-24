// Sectors: which tools each field of work cares about. The tools screen leads with your sector's tools (connectable
// ones first, then the ones still coming), and everything else sits under "More tools". Picked in Saree3's setup
// guide or in Settings (profiles.sector via set_my_sector).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk, useMyProfile } from '@/lib/api';
import type { ProviderId } from '@/features/sources/connections';

export const SECTORS = ['sales', 'tech', 'product', 'operations', 'hr'] as const;
export type Sector = (typeof SECTORS)[number];

/** tools Muntej doesn't connect to yet: shown as "Coming soon" in the sectors that care about them */
export const SOON_TOOLS = ['odoo', 'zoho', 'hubspot', 'salesforce', 'github', 'teams'] as const;
export type SoonTool = (typeof SOON_TOOLS)[number];
export type ToolId = ProviderId | 'whatsapp' | SoonTool;

/** each sector's tools, most important first (email + WhatsApp matter to everyone) */
export const SECTOR_TOOLS: Record<Sector, ToolId[]> = {
  sales: ['google', 'microsoft', 'whatsapp', 'hubspot', 'zoho', 'odoo', 'salesforce', 'slack'],
  tech: ['jira', 'azure_devops', 'github', 'slack', 'teams', 'google', 'microsoft', 'whatsapp', 'clickup', 'trello'],
  product: ['google', 'microsoft', 'teams', 'jira', 'azure_devops', 'notion', 'slack', 'whatsapp'],
  operations: ['google', 'microsoft', 'whatsapp', 'trello', 'clickup', 'notion', 'odoo'],
  hr: ['google', 'microsoft', 'whatsapp', 'zoho', 'odoo', 'notion'],
};

export function useMySector(): Sector | null {
  const me = useMyProfile();
  const s = (me.data as { sector?: string | null } | undefined)?.sector;
  return s && (SECTORS as readonly string[]).includes(s) ? (s as Sector) : null;
}

export function useSetSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sector, everyone }: { sector: Sector; everyone?: boolean }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await rpc('set_my_sector', { p_sector: sector, p_everyone: !!everyone });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
