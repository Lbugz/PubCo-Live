import { useState } from "react";
import { MoreVertical, Sparkles, FileText, Tag as TagIcon, MessageCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TrackTagPopover } from "./track-tag-popover";
import { TrackContactDialog } from "./track-contact-dialog";
import { TrackAIInsights } from "./track-ai-insights";
import { type PlaylistSnapshot } from "@shared/schema";

interface TrackActionsDropdownProps {
  track: PlaylistSnapshot;
  onEnrich?: (trackId: string) => void;
}

export function TrackActionsDropdown({ track, onEnrich }: TrackActionsDropdownProps) {
  const [tagOpen, setTagOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [aiInsightsOpen, setAIInsightsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const canEnrich = !track.publisher || !track.songwriter;

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid={`button-actions-${track.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canEnrich && onEnrich && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  onEnrich(track.id);
                  setDropdownOpen(false);
                }}
                data-testid={`menu-enrich-${track.id}`}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich Data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem
            onClick={() => {
              setAIInsightsOpen(true);
              setDropdownOpen(false);
            }}
            data-testid={`menu-ai-insights-${track.id}`}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Insights
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => {
              setTagOpen(true);
              setDropdownOpen(false);
            }}
            data-testid={`menu-tag-${track.id}`}
          >
            <TagIcon className="h-4 w-4 mr-2" />
            Tag
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => {
              setContactOpen(true);
              setDropdownOpen(false);
            }}
            data-testid={`menu-contact-${track.id}`}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Contact
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem
            onClick={() => {
              window.open(track.spotifyUrl, "_blank", "noopener,noreferrer");
              setDropdownOpen(false);
            }}
            data-testid={`menu-spotify-${track.id}`}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Spotify
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden dialogs/popovers controlled by menu items */}
      <div className="hidden">
        <TrackTagPopover trackId={track.id} open={tagOpen} onOpenChange={setTagOpen} />
        <TrackContactDialog track={track} open={contactOpen} onOpenChange={setContactOpen} />
        <TrackAIInsights track={track} open={aiInsightsOpen} onOpenChange={setAIInsightsOpen} />
      </div>
    </>
  );
}
