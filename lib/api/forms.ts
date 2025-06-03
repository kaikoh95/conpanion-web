import { createClient } from '@/utils/supabase/client';
import {
  Form,
  FormItem,
  CreateFormRequest,
  UpdateFormRequest,
  FormResponse,
} from '@/lib/types/form';
import { Database } from '../supabase/types.generated';

const supabase = createClient();

interface DbFormResponse {
  id: number;
  name: string;
  owner_id: string;
  team_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  is_synced: boolean;
  last_synced_at: string | null;
  assignees: AssigneeResponse[];
}

interface AssigneeResponse {
  id: string;
  raw_user_meta_data: {
    name: string;
    avatar_url?: string;
  };
  global_avatar_url: string;
  global_display_name: string;
}

export async function getForms(): Promise<Form[]> {
  // First, fetch all forms
  const { data: forms, error: formsError } = await supabase
    .from('forms')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (formsError) {
    console.error('Error fetching forms:', formsError);
    throw formsError;
  }

  if (!forms || forms.length === 0) {
    return [];
  }

  // Then, fetch assignees for these forms
  const formIds = forms.map((form) => form.id);
  const { data: assignees, error: assigneesError } = await supabase
    .from('entity_assignees')
    .select('entity_id, user_id')
    .eq('entity_type', 'form')
    .in('entity_id', formIds);

  if (assigneesError) {
    console.error('Error fetching assignees:', assigneesError);
  }

  if (assigneesError) {
    console.error('Error fetching assignees:', assigneesError);
    throw assigneesError;
  }

  // Get unique user IDs from assignees for user info
  const getUserIds = (formId: number) =>
    Array.from(
      new Set(
        (assignees || [])
          .filter((a: { entity_id: number }) => a.entity_id === formId)
          .map((a: { user_id: string }) => a.user_id),
      ),
    );

  // Transform the data to match the expected format
  const transformedForms = (forms as DbFormResponse[]).map(async (form) => {
    // Fetch user details if we have any assignees
    let usersData: Database['public']['Functions']['get_user_details']['Returns'] = [];
    const userIds = getUserIds(form.id);
    if (userIds.length > 0) {
      try {
        const { data: users, error: usersError } = await supabase.rpc('get_user_details', {
          user_ids: userIds,
        });

        if (usersError && usersError.code !== 'PGRST116') {
          // Ignore if RPC doesn't exist yet
          console.error('Error fetching users:', usersError);
        }

        // If the RPC function doesn't exist yet, create a fallback
        usersData =
          users ||
          userIds.map((id) => ({
            id,
            raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
          }));
      } catch (err) {
        console.error('Exception fetching user details:', err);
        // Provide fallback user data
        usersData = userIds.map((id) => ({
          id,
          raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
          global_avatar_url: '',
          global_display_name: 'User ' + id.substring(0, 6),
        }));
      }
    }

    return {
      ...form,
      deleted_at: form.deleted_at || undefined,
      last_synced_at: form.last_synced_at || undefined,
      assignees: usersData as AssigneeResponse[],
    };
  });

  return Promise.all(transformedForms);
}

export async function getFormById(id: number): Promise<FormResponse | null> {
  // Fetch the form
  const { data: formData, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (formError) {
    console.error('Error fetching form:', formError);
    throw formError;
  }

  if (!formData) {
    return null;
  }

  // Fetch the form items
  const { data: itemsData, error: itemsError } = await supabase
    .from('form_items')
    .select('*')
    .eq('form_id', id)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching form items:', itemsError);
    throw itemsError;
  }

  return {
    form: formData,
    items: itemsData || [],
  };
}

export async function createForm(request: CreateFormRequest): Promise<FormResponse> {
  // Start a transaction
  const { data: formData, error: formError } = await supabase
    .from('forms')
    .insert({
      name: request.name,
      owner_id: request.userId,
      project_id: request.projectId,
    })
    .select()
    .single();

  if (formError) {
    console.error('Error creating form:', formError);
    throw formError;
  }

  if (!formData) {
    throw new Error('Failed to create form');
  }

  // Insert form items
  const formItems = request.items.map((item, index) => ({
    ...item,
    form_id: formData.id,
    display_order: index,
  }));

  const { data: itemsData, error: itemsError } = await supabase
    .from('form_items')
    .insert(formItems)
    .select();

  if (itemsError) {
    console.error('Error creating form items:', itemsError);
    throw itemsError;
  }

  return {
    form: formData,
    items: itemsData || [],
  };
}

export async function updateForm(id: number, request: UpdateFormRequest): Promise<FormResponse> {
  // Update the form
  const { data: formData, error: formError } = await supabase
    .from('forms')
    .update({
      name: request.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (formError) {
    console.error('Error updating form:', formError);
    throw formError;
  }

  if (!formData) {
    throw new Error('Failed to update form');
  }

  // If items are provided, update them
  if (request.items && request.items.length > 0) {
    // Delete existing items
    const { error: deleteError } = await supabase.from('form_items').delete().eq('form_id', id);

    if (deleteError) {
      console.error('Error deleting form items:', deleteError);
      throw deleteError;
    }

    // Insert new items
    const formItems = request.items.map((item, index) => ({
      ...item,
      form_id: id,
      display_order: index,
    }));

    const { data: itemsData, error: itemsError } = await supabase
      .from('form_items')
      .insert(formItems)
      .select();

    if (itemsError) {
      console.error('Error updating form items:', itemsError);
      throw itemsError;
    }

    return {
      form: formData,
      items: itemsData || [],
    };
  }

  // If no items provided, just return the updated form
  const { data: itemsData, error: itemsError } = await supabase
    .from('form_items')
    .select('*')
    .eq('form_id', id)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching form items:', itemsError);
    throw itemsError;
  }

  return {
    form: formData,
    items: itemsData || [],
  };
}

export async function deleteForm(id: number): Promise<void> {
  const { error } = await supabase
    .from('forms')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting form:', error);
    throw error;
  }
}
