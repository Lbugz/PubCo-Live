import { type PlaylistSnapshot } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ExternalLink, Sparkles, Tag as TagIcon, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardViewProps {
  tracks: PlaylistSnapshot[];
  isLoading?: boolean;
  onTrackClick?: (track: PlaylistSnapshot) => void;
  onEnrichMB?: (trackId: string) => void;
  onEnrichCredits?: (trackId: string) => void;
}

export function CardView({
  tracks,
  isLoading,
  onTrackClick,
  onEnrichMB,
  onEnrichCredits,
}: CardViewProps) {
  const getScoreBadgeVariant = (score: number) => {
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 7) return "High";
    if (score >= 4) return "Medium";
    return "Low";
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="glass-panel p-6 animate-pulse">
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-12 bg-muted rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No tracks found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {tracks.map((track) => (
        <Card
          key={track.id}
          className={cn(
            "glass-panel p-6 interactive-scale cursor-pointer hover-gradient",
            "transition-all duration-200"
          )}
          onClick={() => onTrackClick?.(track)}
          data-testid={`card-track-${track.id}`}
        >
          <div className="space-y-4">
            {/* Header with Score Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3
                  className="font-semibold truncate"
                  data-testid={`text-track-name-${track.id}`}
                >
                  {track.trackName}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {track.artistName}
                </p>
              </div>
              <Badge
                variant={getScoreBadgeVariant(track.unsignedScore)}
                className="shrink-0"
                data-testid={`badge-score-${track.id}`}
              >
                {getScoreLabel(track.unsignedScore)} {track.unsignedScore}
              </Badge>
            </div>

            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-2">
              {track.isrc ? (
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  ISRC
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20 text-xs"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  No ISRC
                </Badge>
              )}
              
              {track.dataSource === "scraped" ? (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs"
                >
                  Scraped
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs"
                >
                  API
                </Badge>
              )}
            </div>

            {/* Info Section */}
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Playlist:</span>{" "}
                <span className="font-medium">{track.playlistName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Label:</span>{" "}
                <span className="font-medium">
                  {track.label || <span className="italic">Unknown</span>}
                </span>
              </div>
              {track.publisher && (
                <div>
                  <span className="text-muted-foreground">Publisher:</span>{" "}
                  <span className="font-medium">{track.publisher}</span>
                </div>
              )}
              {track.songwriter && (
                <div>
                  <span className="text-muted-foreground">Songwriter:</span>{" "}
                  <span className="font-medium">{track.songwriter}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
              {(!track.publisher || !track.songwriter) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnrichMB?.(track.id);
                  }}
                  className="flex-1 gap-1"
                  data-testid={`button-enrich-${track.id}`}
                >
                  <Sparkles className="h-3 w-3" />
                  Enrich
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="gap-1"
                data-testid={`button-spotify-${track.id}`}
              >
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  Spotify
                </a>
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
