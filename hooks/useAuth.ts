'use client'

import { useEffect, useState } from 'react'
import { Database } from '@/lib/supabase/types.generated'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'

export type UserData = User & {
  activeProjectId: number
}

export function useAuth() {
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()
    
    const getUser = async () => {
      setLoading(true)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setUser(null)
          setLoading(false)
          return
        }

        // use this for testing only
        if (!session?.user?.user_metadata?.avatar_url) {
          const avatars = ['https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?&w=128&h=128&dpr=2&q=80', 'https://github.com/shadcn.png', 'https://images.unsplash.com/photo-1511485977113-f34c92461ad9?ixlib=rb-1.2.1&w=128&h=128&dpr=2&q=80']
          const avatarUrl = avatars[Math.floor(Math.random() * avatars.length)]

          await supabase.auth.updateUser({
            data: {
              name: session?.user?.email, // use email for now as we dont ask for first and last names yet
              avatar_url: avatarUrl,
            }
          })
        }

        // use this for testing, use 1 by default
        let projectId: number = 1;
        // const { data: projects } = await supabase.from('projects').select('id').eq('owner_id', session?.user?.id)
        const { data: projects } = await supabase.from('projects').select('id').eq('id', projectId)
        if (!projects?.length) {
          
          // Create project first
          const { data: newProject, error: projectError } = await supabase.from('projects').insert({
            id: 1,
            owner_id: session?.user?.id,
            name: `${session?.user?.email}'s Project`,
            description: `${session?.user?.email}'s Project Description`,
            created_by: session?.user?.id
          }).select('id').single();

          if (projectError || !newProject) {
            console.error('Error creating project:', projectError)
            setUser(null)
            setLoading(false)
            return
          }

          projectId = newProject.id;
        }

        const { data: projectUser } = await supabase.from('projects_users').select('id').eq('project_id', projectId).eq('user_id', session?.user?.id).single()

        if (!projectUser) {
          // Create project-user relationship
          const { error: relationError } = await supabase.from('projects_users').insert({
            project_id: projectId,
            user_id: session?.user?.id,
            role: 'owner',
            created_by: session?.user?.id
          });

          if (relationError) {
            console.error('Error creating project-user relationship:', relationError)
            setUser(null)
            setLoading(false)
            return
          }
        }
        
        setUser({
          ...session?.user,
          activeProjectId: projectId
        })
      } catch (error) {
        console.error('Error getting auth session:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      getUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
} 