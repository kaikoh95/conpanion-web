import { useState } from 'react';
import { UserPlus2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../app/components/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjectMembers, type ProjectMember } from '@/hooks/useProjectMembers';

export interface AssigneeSelectorProps {
  assignees: { id: string; name: string; avatar_url?: string }[];
  onAssign: (assignee: ProjectMember) => void;
  onUnassign: (assigneeId: string) => void;
  triggerClassName?: string;
  disabled?: boolean;
  error?: string | null;
}

export function AssigneeSelector({
  assignees,
  onAssign,
  onUnassign,
  triggerClassName = 'rounded-full p-1 text-muted-foreground opacity-50 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100',
  disabled = false,
  error = null,
}: AssigneeSelectorProps) {
  const [showPopup, setShowPopup] = useState(false);
  const { members, loading, error: membersError } = useProjectMembers();

  const handleSelect = (member: ProjectMember, isAssigned: boolean) => {
    if (isAssigned) {
      onUnassign(member.id);
    } else {
      onAssign(member);
      setShowPopup(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Assignees</h3>
        <Popover modal open={showPopup} onOpenChange={setShowPopup}>
          <PopoverTrigger asChild>
            <button className={triggerClassName} aria-label="Add assignee" disabled={disabled}>
              <UserPlus2 size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[200px] p-0"
            side="right"
            align="start"
            sideOffset={5}
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target?.closest('[cmdk-list]')) {
                e.preventDefault();
              }
            }}
          >
            <Command className="overflow-visible">
              <CommandInput placeholder="Search members..." />
              <CommandEmpty>
                {loading
                  ? 'Loading...'
                  : membersError
                    ? 'Error loading members'
                    : 'No members found.'}
              </CommandEmpty>
              <CommandGroup>
                {members.map((member: ProjectMember) => {
                  const isAssigned = assignees.some((a) => a.id === member.id);
                  return (
                    <CommandItem
                      key={member.id}
                      value={member.name}
                      onSelect={() => handleSelect(member, isAssigned)}
                      className="flex cursor-pointer items-center justify-between gap-2 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                            {member.name
                              .split(' ')
                              .map((n: string) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{member.name}</span>
                      </div>
                      {isAssigned && (
                        <X
                          size={14}
                          className="text-muted-foreground transition-colors hover:text-red-500"
                        />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {assignees.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {assignees.map((assignee) => (
            <div
              key={assignee.id}
              className="group flex items-center gap-2 rounded-md border border-muted-foreground/20 bg-muted/50 px-3 py-2"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={assignee.avatar_url} />
                <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                  {assignee.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground">{assignee.name}</span>
              <button
                onClick={() => onUnassign(assignee.id)}
                className="ml-1 hidden rounded-full p-1 text-muted-foreground opacity-50 transition-colors hover:bg-muted hover:text-red-500 hover:opacity-100 group-hover:block"
                aria-label={`Remove ${assignee.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">No assignees</div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
