import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/supabase/types.generated';

// Define the enum type based on the migration
export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'declined' | 'revision_requested';

// Define a more specific type combining form_entries and forms data
// This type will be returned by our API function
export type FormEntry = Database['public']['Tables']['form_entries']['Row'] & {
  forms: Pick<Database['public']['Tables']['forms']['Row'], 'name'> | null;
  approval_status: ApprovalStatus | null; // Status fetched from the latest approval record
  form_name: string; // Derived from forms.name
  name: string | null; // Explicitly added - regenerate types to have this included automatically
};

// Intermediate type for the second query
type ApprovalInfo = {
  entity_id: number;
  status: ApprovalStatus;
};

/**
 * Fetches form entries along with their associated form name and latest approval status.
 * Uses a two-step query process to manually correlate approvals.
 *
 * @param supabase The Supabase client instance.
 * @returns A promise that resolves to an array of FormEntry objects.
 */
export async function fetchFormEntriesWithStatus(supabase: SupabaseClient): Promise<FormEntry[]> {
  // 1. Fetch form entries and related form data
  const { data: entriesData, error: entriesError } = await supabase
    .from('form_entries')
    .select(
      `
      *,
      forms ( name )
    `,
    )
    .order('created_at', { ascending: false });

  if (entriesError) {
    console.error('Error fetching form entries:', entriesError);
    throw entriesError;
  }
  if (!entriesData) {
    return []; // No entries found
  }

  // 2. Get Entry IDs
  const entryIds = entriesData.map((entry) => entry.id);
  if (entryIds.length === 0) {
    // No entries, so no need to fetch approvals
    return entriesData.map((entry) => ({
      ...entry,
      forms: entry.forms,
      approval_status: null, // No approvals fetched
      form_name: entry.forms?.name ?? 'Unknown Form',
    }));
  }

  // 3. Fetch Relevant Approvals
  const { data: approvalsData, error: approvalsError } = await supabase
    .from('approvals')
    .select<string, ApprovalInfo>('entity_id, status') // Select specific columns
    .eq('entity_type', 'entries')
    .in('entity_id', entryIds)
    .order('created_at', { ascending: false }); // Order by date to find the latest

  if (approvalsError) {
    console.error('Error fetching approvals:', approvalsError);
    // Decide how to handle: throw error or return entries without status?
    // Let's return entries without status for now, logging the error.
    // throw approvalsError;
  }

  // 4. Map Statuses (finding the latest for each entry_id)
  const latestStatusMap = new Map<number, ApprovalStatus>();
  if (approvalsData) {
    for (const approval of approvalsData) {
      // Since ordered by created_at desc, the first one we see for an entity_id is the latest
      if (!latestStatusMap.has(approval.entity_id)) {
        latestStatusMap.set(approval.entity_id, approval.status);
      }
    }
  }

  // 5. Combine Data
  const processedEntries: FormEntry[] = entriesData.map((entry): FormEntry => {
    const status = latestStatusMap.get(entry.id) || null;
    return {
      ...entry,
      forms: entry.forms,
      approval_status: status,
      form_name: entry.forms?.name ?? 'Unknown Form',
    };
  });

  return processedEntries;
}
