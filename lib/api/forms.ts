import { createClient } from '@/utils/supabase/client';
import { Form, FormItem, CreateFormRequest, UpdateFormRequest, FormResponse } from '@/lib/types/form';

const supabase = createClient();

export async function getForms(): Promise<Form[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching forms:', error);
    throw error;
  }

  return data || [];
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
      owner_id: (await supabase.auth.getUser()).data.user?.id,
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
    const { error: deleteError } = await supabase
      .from('form_items')
      .delete()
      .eq('form_id', id);

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