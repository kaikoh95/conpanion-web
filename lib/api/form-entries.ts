import { createClient } from '@/utils/supabase/client';
import { Database } from '../supabase/types.generated';
import { FormEntry, FormEntryResponse, CreateFormEntryRequest } from '@/lib/types/form-entry';

const supabase = createClient();

export async function getFormEntries(formId: number): Promise<FormEntry[]> {
  const { data, error } = await supabase
    .from('form_entries')
    .select('*, form_entry_answers(*)')
    .eq('form_id', formId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching form entries:', error);
    throw error;
  }

  return data || [];
}

export async function getFormEntryById(id: number): Promise<FormEntryResponse | null> {
  // Fetch the entry
  const { data: entryData, error: entryError } = await supabase
    .from('form_entries')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (entryError) {
    console.error('Error fetching form entry:', entryError);
    throw entryError;
  }

  if (!entryData) {
    return null;
  }

  // Fetch the entry answers
  const { data: answersData, error: answersError } = await supabase
    .from('form_entry_answers')
    .select('*')
    .eq('entry_id', id);

  if (answersError) {
    console.error('Error fetching form entry answers:', answersError);
    throw answersError;
  }

  // Process the answers to load any photo attachments
  const processedAnswers = answersData || [];

  // Get all form items with type 'photo'
  const { data: photoItems, error: photoItemsError } = await supabase
    .from('form_items')
    .select('id, item_type')
    .eq('item_type', 'photo')
    .eq('form_id', entryData.form_id);

  if (photoItemsError) {
    console.error('Error fetching photo form items:', photoItemsError);
  }

  // Map of photo item IDs for quick lookup
  const photoItemIds = new Set((photoItems || []).map((item) => item.id));

  // Check if any answers are for photo questions
  for (const answer of processedAnswers) {
    // If this answer belongs to a photo item
    if (photoItemIds.has(answer.item_id)) {
      // The photo answer should already contain attachment IDs as stored in the database
      // We don't need to do any additional processing here
      // The ImageViewer component will handle fetching the URLs
    }
  }

  return {
    entry: entryData,
    answers: processedAnswers,
  };
}

export async function createFormEntry(request: CreateFormEntryRequest): Promise<FormEntryResponse> {
  // Get the form to get its project_id
  const { data: formData, error: formError } = await supabase
    .from('forms')
    .select('project_id')
    .eq('id', request.formId)
    .single();

  if (formError) {
    console.error('Error fetching form:', formError);
    throw formError;
  }

  // Start a transaction
  const { data: entryData, error: entryError } = await supabase
    .from('form_entries')
    .insert({
      form_id: request.formId,
      submitted_by_user_id: request.userId,
      name: request.name,
      project_id: formData.project_id, // Explicitly set project_id
    })
    .select()
    .single();

  if (entryError) {
    console.error('Error creating form entry:', entryError);
    throw entryError;
  }

  if (!entryData) {
    throw new Error('Failed to create form entry');
  }

  // Insert form entry answers
  if (request.answers && request.answers.length > 0) {
    const entryAnswers = request.answers.map((answer: { itemId: number; value: any }) => ({
      entry_id: entryData.id,
      item_id: answer.itemId,
      answer_value: answer.value,
    }));

    const { data: answersData, error: answersError } = await supabase
      .from('form_entry_answers')
      .insert(entryAnswers)
      .select();

    if (answersError) {
      console.error('Error creating form entry answers:', answersError);
      throw answersError;
    }

    return {
      entry: entryData,
      answers: answersData || [],
    };
  }

  return {
    entry: entryData,
    answers: [],
  };
}

export async function updateFormEntry(id: number, request: Partial<FormEntry>): Promise<FormEntry> {
  const { data, error } = await supabase
    .from('form_entries')
    .update({
      ...request,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating form entry:', error);
    throw error;
  }

  return data;
}

export async function deleteFormEntry(id: number): Promise<void> {
  const { error } = await supabase
    .from('form_entries')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error deleting form entry:', error);
    throw error;
  }
}

// Add a new interface for updating form entry answers
export interface UpdateFormEntryAnswersRequest {
  answers: {
    itemId: number;
    value: any;
  }[];
}

// Add a new function to update form entry answers
export async function updateFormEntryAnswers(
  id: number,
  request: UpdateFormEntryAnswersRequest,
): Promise<FormEntryResponse> {
  // Insert or update form entry answers
  const entryAnswers = request.answers.map((answer) => ({
    entry_id: id,
    item_id: answer.itemId,
    answer_value: answer.value,
  }));

  // First, delete any existing answers for these item IDs to avoid duplicates
  const itemIds = request.answers.map((a) => a.itemId);

  const { error: deleteError } = await supabase
    .from('form_entry_answers')
    .delete()
    .eq('entry_id', id)
    .in('item_id', itemIds);

  if (deleteError) {
    console.error('Error deleting existing form entry answers:', deleteError);
    throw deleteError;
  }

  // Then insert the new answers
  const { data: answersData, error: answersError } = await supabase
    .from('form_entry_answers')
    .insert(entryAnswers)
    .select();

  if (answersError) {
    console.error('Error updating form entry answers:', answersError);
    throw answersError;
  }

  // Get the updated entry
  const { data: entryData, error: entryError } = await supabase
    .from('form_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (entryError) {
    console.error('Error fetching updated form entry:', entryError);
    throw entryError;
  }

  return {
    entry: entryData,
    answers: answersData || [],
  };
}
