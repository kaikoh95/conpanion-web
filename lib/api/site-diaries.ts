import { createClient } from '@/utils/supabase/client';
import {
  SiteDiaryTemplate,
  SiteDiaryTemplateItem,
  SiteDiary,
  SiteDiaryAnswer,
  CreateSiteDiaryTemplateRequest,
  UpdateSiteDiaryTemplateRequest,
  CreateSiteDiaryRequest,
  SiteDiaryTemplateResponse,
  SiteDiaryResponse,
} from '@/lib/types/site-diary';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ApprovalStatus } from '@/lib/api/entries';

const supabase = createClient();

// Templates CRUD operations
export async function getSiteDiaryTemplates(projectId: number): Promise<SiteDiaryTemplate[]> {
  const { data, error } = await supabase
    .from('site_diary_templates')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching site diary templates:', error);
    throw error;
  }

  return data || [];
}

export async function getSiteDiaryTemplateById(
  id: number,
): Promise<SiteDiaryTemplateResponse | null> {
  // Get the template
  const { data: templateData, error: templateError } = await supabase
    .from('site_diary_templates')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (templateError) {
    console.error('Error fetching site diary template:', templateError);
    throw templateError;
  }

  if (!templateData) {
    return null;
  }

  // Get template items
  const { data: itemsData, error: itemsError } = await supabase
    .from('site_diary_template_items')
    .select('*')
    .eq('template_id', id)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching site diary template items:', itemsError);
    throw itemsError;
  }

  return {
    template: templateData,
    items: itemsData || [],
  };
}

export async function createSiteDiaryTemplate(
  request: CreateSiteDiaryTemplateRequest,
): Promise<SiteDiaryTemplateResponse> {
  // Start a transaction
  const { data: templateData, error: templateError } = await supabase
    .from('site_diary_templates')
    .insert({
      name: request.name,
      description: request.description,
      project_id: request.project_id,
      created_by: request.created_by,
      metadata: request.metadata,
    })
    .select()
    .single();

  if (templateError) {
    console.error('Error creating site diary template:', templateError);
    throw templateError;
  }

  if (!templateData) {
    throw new Error('Failed to create site diary template');
  }

  // Insert template items - make sure to remove any ID fields to avoid conflicts
  const templateItems = request.items.map((item, index) => {
    // Create a new object without the id field
    const { id: itemId, ...itemWithoutId } = item as { id?: number; [key: string]: any };

    return {
      ...itemWithoutId,
      template_id: templateData.id,
      display_order: index,
    };
  });

  const { data: itemsData, error: itemsError } = await supabase
    .from('site_diary_template_items')
    .insert(templateItems)
    .select();

  if (itemsError) {
    console.error('Error creating site diary template items:', itemsError);
    throw itemsError;
  }

  return {
    template: templateData,
    items: itemsData || [],
  };
}

export async function updateSiteDiaryTemplate(
  id: number,
  request: UpdateSiteDiaryTemplateRequest,
): Promise<SiteDiaryTemplateResponse> {
  // Update the template
  const { data: templateData, error: templateError } = await supabase
    .from('site_diary_templates')
    .update({
      name: request.name,
      description: request.description,
      metadata: request.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (templateError) {
    console.error('Error updating site diary template:', templateError);
    throw templateError;
  }

  if (!templateData) {
    throw new Error('Failed to update site diary template');
  }

  // If items are provided, update them
  if (request.items && request.items.length > 0) {
    // Delete existing items
    const { error: deleteError } = await supabase
      .from('site_diary_template_items')
      .delete()
      .eq('template_id', id);

    if (deleteError) {
      console.error('Error deleting site diary template items:', deleteError);
      throw deleteError;
    }

    // Insert new items - remove any ID fields to avoid identity column conflicts
    const templateItems = request.items.map((item, index) => {
      // Create a new object without the id field
      // Using object destructuring with a default empty object to prevent errors
      const { id: itemId, ...itemWithoutId } = item as { id?: number; [key: string]: any };

      return {
        ...itemWithoutId,
        template_id: id,
        display_order: index,
      };
    });

    const { data: itemsData, error: itemsError } = await supabase
      .from('site_diary_template_items')
      .insert(templateItems)
      .select();

    if (itemsError) {
      console.error('Error updating site diary template items:', itemsError);
      throw itemsError;
    }

    return {
      template: templateData,
      items: itemsData || [],
    };
  }

  // If no items provided, fetch the existing ones
  const { data: itemsData, error: itemsError } = await supabase
    .from('site_diary_template_items')
    .select('*')
    .eq('template_id', id)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('Error fetching site diary template items:', itemsError);
    throw itemsError;
  }

  return {
    template: templateData,
    items: itemsData || [],
  };
}

export async function deleteSiteDiaryTemplate(id: number): Promise<void> {
  const { error } = await supabase
    .from('site_diary_templates')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error deleting site diary template:', error);
    throw error;
  }
}

// Site Diaries CRUD operations
export async function getSiteDiaries(projectId: number): Promise<SiteDiary[]> {
  const { data, error } = await supabase
    .from('site_diaries')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching site diaries:', error);
    throw error;
  }

  return data || [];
}

export async function getSiteDiaryById(id: number): Promise<SiteDiaryResponse | null> {
  // Fetch the diary
  const { data: diaryData, error: diaryError } = await supabase
    .from('site_diaries')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (diaryError) {
    console.error('Error fetching site diary:', diaryError);
    throw diaryError;
  }

  if (!diaryData) {
    return null;
  }

  // Fetch the diary answers
  const { data: answersData, error: answersError } = await supabase
    .from('site_diary_answers')
    .select('*')
    .eq('diary_id', id);

  if (answersError) {
    console.error('Error fetching site diary answers:', answersError);
    throw answersError;
  }

  // Fetch the template and its items
  const templateId = diaryData.template_id;
  const { data: templateData, error: templateError } = await supabase
    .from('site_diary_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError) {
    console.error('Error fetching site diary template:', templateError);
    throw templateError;
  }

  const { data: templateItemsData, error: templateItemsError } = await supabase
    .from('site_diary_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order', { ascending: true });

  if (templateItemsError) {
    console.error('Error fetching site diary template items:', templateItemsError);
    throw templateItemsError;
  }

  return {
    diary: diaryData,
    answers: answersData || [],
    template: templateData,
    template_items: templateItemsData || [],
  };
}

export async function createSiteDiary(request: CreateSiteDiaryRequest): Promise<SiteDiaryResponse> {
  // Start a transaction
  const { data: diaryData, error: diaryError } = await supabase
    .from('site_diaries')
    .insert({
      template_id: request.template_id,
      project_id: request.project_id,
      name: request.name,
      date: request.date,
      submitted_by_user_id: request.submitted_by_user_id,
      metadata: request.metadata || {},
    })
    .select()
    .single();

  if (diaryError) {
    console.error('Error creating site diary:', diaryError);
    throw diaryError;
  }

  if (!diaryData) {
    throw new Error('Failed to create site diary');
  }

  // Insert diary answers
  if (request.answers && request.answers.length > 0) {
    const diaryAnswers = request.answers.map((answer) => ({
      diary_id: diaryData.id,
      item_id: answer.item_id,
      answer_value: answer.value,
    }));

    const { data: answersData, error: answersError } = await supabase
      .from('site_diary_answers')
      .insert(diaryAnswers)
      .select();

    if (answersError) {
      console.error('Error creating site diary answers:', answersError);
      throw answersError;
    }

    return {
      diary: diaryData,
      answers: answersData || [],
    };
  }

  return {
    diary: diaryData,
    answers: [],
  };
}

export async function updateSiteDiary(id: number, request: Partial<SiteDiary>): Promise<SiteDiary> {
  const { data, error } = await supabase
    .from('site_diaries')
    .update({
      ...request,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating site diary:', error);
    throw error;
  }

  return data;
}

export interface UpdateSiteDiaryAnswersRequest {
  answers: {
    item_id: number;
    value: any;
  }[];
  metadata?: Record<string, any>;
}

export async function updateSiteDiaryAnswers(
  id: number,
  request: UpdateSiteDiaryAnswersRequest,
): Promise<SiteDiaryResponse> {
  // Update metadata if provided
  if (request.metadata) {
    const { error: metadataError } = await supabase
      .from('site_diaries')
      .update({
        metadata: request.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (metadataError) {
      console.error('Error updating site diary metadata:', metadataError);
      throw metadataError;
    }
  }

  // Update or insert answers
  if (request.answers && request.answers.length > 0) {
    for (const answer of request.answers) {
      // Try to update existing answer, insert if none exists
      const { data: updated } = await supabase
        .from('site_diary_answers')
        .update({ answer_value: answer.value })
        .eq('diary_id', id)
        .eq('item_id', answer.item_id)
        .select();

      // If no rows were updated, insert new answer
      if (!updated || updated.length === 0) {
        await supabase.from('site_diary_answers').insert({
          diary_id: id,
          item_id: answer.item_id,
          answer_value: answer.value,
        });
      }
    }
  }

  // Return the updated diary with all its data
  const updatedDiary = await getSiteDiaryById(id);
  if (!updatedDiary) {
    throw new Error('Failed to fetch updated site diary');
  }

  return updatedDiary;
}

export async function deleteSiteDiary(id: number): Promise<void> {
  const { error } = await supabase
    .from('site_diaries')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error deleting site diary:', error);
    throw error;
  }
}

// Function to get site diaries with approval status
export async function getSiteDiariesWithStatus(
  projectId: number,
): Promise<(SiteDiary & { approval_status: ApprovalStatus | null })[]> {
  const supabase = createClient();

  // Get all site diaries for the project
  const { data: diaries, error: diariesError } = await supabase
    .from('site_diaries')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (diariesError) {
    console.error('Error fetching site diaries:', diariesError);
    throw diariesError;
  }

  if (!diaries || diaries.length === 0) {
    return [];
  }

  // Get diary IDs
  const diaryIds = diaries.map((diary) => diary.id);

  // Fetch approval statuses
  const { data: approvals, error: approvalsError } = await supabase
    .from('approvals')
    .select('entity_id, status')
    .eq('entity_type', 'site_diary')
    .in('entity_id', diaryIds)
    .order('created_at', { ascending: false });

  if (approvalsError) {
    console.error('Error fetching approvals:', approvalsError);
    throw approvalsError;
  }

  // Create a map of the latest approval status for each diary
  const latestStatusMap: Record<number, ApprovalStatus> = {};
  if (approvals) {
    approvals.forEach((approval: { entity_id: number; status: string }) => {
      if (!latestStatusMap[approval.entity_id]) {
        latestStatusMap[approval.entity_id] = approval.status as ApprovalStatus;
      }
    });
  }

  // Combine diaries with their approval status
  return diaries.map((diary: SiteDiary) => ({
    ...diary,
    approval_status: latestStatusMap[diary.id as number] || null,
  }));
}
