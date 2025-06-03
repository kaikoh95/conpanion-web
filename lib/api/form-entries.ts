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

  return {
    entry: entryData,
    answers: answersData || [],
  };
}

export async function createFormEntry(request: CreateFormEntryRequest): Promise<FormEntryResponse> {
  // Start a transaction
  const { data: entryData, error: entryError } = await supabase
    .from('form_entries')
    .insert({
      form_id: request.formId,
      submitted_by_user_id: request.userId,
      name: request.name,
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
