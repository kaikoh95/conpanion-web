'use client'

import { useState, useRef, useEffect } from 'react'
import { Badge } from '../ui/badge'
import { Check, ChevronDown } from 'lucide-react'
import { Database } from '@/lib/supabase/types.generated'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Status = Database['public']['Tables']['statuses']['Row']

interface StatusPillProps {
  status: Status
  taskId: number
  allStatuses: Status[]
  onStatusChange?: (newStatus: Status) => void
  className?: string
  disabled?: boolean
  refreshTasks?: () => void
}

export default function StatusPill({ 
  status, 
  taskId, 
  allStatuses,
  onStatusChange,
  className = '',
  disabled = false,
  refreshTasks
}: StatusPillProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<'left' | 'right'>('left')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  
  // Determine if dropdown should open to the left or right based on available space
  useEffect(() => {
    if (isOpen && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const rightSpace = window.innerWidth - rect.right;
      
      // If not enough space on the right (less than 200px), position from the right
      setPosition(rightSpace < 200 ? 'right' : 'left');
    }
  }, [isOpen]);
  
  const handleStatusChange = async (newStatus: Status) => {
    if (disabled || newStatus.id === status.id) {
      setIsOpen(false)
      return
    }
    
    setUpdating(true)
    setError(null)
    
    try {
      const supabase = getSupabaseClient()
      
      const { error } = await supabase
        .from('tasks')
        .update({ status_id: newStatus.id, updated_at: new Date().toISOString() })
        .eq('id', taskId)
      
      if (error) {
        console.error('Error updating status:', error)
        setError('Failed to update status')
      } else {
        // Call the onStatusChange callback if provided
        if (onStatusChange) {
          onStatusChange(newStatus)
        }
        
        // Refresh tasks list if a refresh function is provided
        if (refreshTasks) {
          refreshTasks()
        }
      }
    } catch (err) {
      console.error('Exception updating status:', err)
      setError('An unexpected error occurred')
    } finally {
      setUpdating(false)
      setIsOpen(false)
    }
  }
  
  // If user or current status isn't available, just show a non-interactive badge
  if (!user || !status) {
    return (
      <Badge 
        style={{ backgroundColor: status?.color || '#E2E8F0' }}
        className={`text-xs whitespace-nowrap ${className}`}
      >
        {status?.name || 'No Status'}
      </Badge>
    )
  }
  
  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <div ref={badgeRef}>
        <Badge 
          onClick={() => !disabled && setIsOpen(!isOpen)}
          style={{ backgroundColor: status.color || '#E2E8F0' }}
          className={`text-xs whitespace-nowrap flex items-center gap-1 cursor-pointer ${className} ${disabled ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {status.name}
          {!disabled && <ChevronDown size={12} className={`transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />}
        </Badge>
      </div>
      
      {isOpen && (
        <div className={`absolute z-10 mt-1 w-48 bg-card rounded-md shadow-lg border border-border py-1 overflow-hidden ${position === 'right' ? 'right-0' : 'left-0'}`}>
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 border-b border-border">
              {error}
            </div>
          )}
          
          <div className="max-h-60 overflow-y-auto">
            {allStatuses.map((s) => (
              <div
                key={s.id}
                onClick={() => handleStatusChange(s)}
                className="px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted cursor-pointer"
              >
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color || '#E2E8F0' }}
                />
                <span className="flex-grow">{s.name}</span>
                {s.id === status.id && <Check size={14} className="text-green-500" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 