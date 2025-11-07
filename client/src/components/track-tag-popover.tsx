import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tag, Plus, X } from "lucide-react";
import type { Tag as TagType } from "@shared/schema";
import { getTagColorClass } from "./tag-manager";

interface TrackTagPopoverProps {
  trackId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TrackTagPopover({ trackId, open: controlledOpen, onOpenChange }: TrackTagPopoverProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const { data: allTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/tags"],
  });

  const { data: trackTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/tracks", trackId, "tags"],
    queryFn: async () => {
      const response = await fetch(`/api/tracks/${trackId}/tags`);
      if (!response.ok) throw new Error("Failed to fetch track tags");
      return response.json();
    },
    enabled: open,
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/tracks/${trackId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracks", trackId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"], exact: false });
      toast({
        title: "Tag added",
        description: "Tag has been added to track",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add tag",
        variant: "destructive",
      });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/tracks/${trackId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracks", trackId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"], exact: false });
      toast({
        title: "Tag removed",
        description: "Tag has been removed from track",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove tag",
        variant: "destructive",
      });
    },
  });

  const trackTagIds = new Set(trackTags.map((t) => t.id));
  const availableTags = allTags.filter((tag) => !trackTagIds.has(tag.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          data-testid={`button-tag-track-${trackId}`}
        >
          <Tag className="h-4 w-4" />
          Tag
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" data-testid={`popover-tags-${trackId}`}>
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Track Tags</h4>

          {trackTags.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Current tags:</p>
              <div className="flex flex-wrap gap-2">
                {trackTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className={`${getTagColorClass(tag.color)} gap-1`}
                    data-testid={`badge-current-tag-${tag.id}`}
                  >
                    {tag.name}
                    <button
                      onClick={() => removeTagMutation.mutate(tag.id)}
                      className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                      data-testid={`button-remove-tag-${tag.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tags added yet</p>
          )}

          {availableTags.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Add tag:</p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className={`${getTagColorClass(tag.color)} gap-1 cursor-pointer hover-elevate`}
                    onClick={() => addTagMutation.mutate(tag.id)}
                    data-testid={`badge-available-tag-${tag.id}`}
                  >
                    <Plus className="h-3 w-3" />
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : allTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tags available. Create tags in Tag Manager first.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
