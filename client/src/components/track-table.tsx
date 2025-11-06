import { ExternalLink, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type PlaylistSnapshot } from "@shared/schema";
import { cn } from "@/lib/utils";

interface TrackTableProps {
  tracks: PlaylistSnapshot[];
  isLoading?: boolean;
}

function getScoreBadgeVariant(score: number): "default" | "secondary" | "outline" {
  if (score >= 7) return "default";
  if (score >= 4) return "secondary";
  return "outline";
}

function getScoreLabel(score: number): string {
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

export function TrackTable({ tracks, isLoading }: TrackTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Music className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-state-title">No tracks found</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Try adjusting your filters or select a different week to view publishing leads.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-3 text-sm font-medium text-muted-foreground uppercase tracking-wide border-b">
        <div className="col-span-3">Track</div>
        <div className="col-span-2">Artist</div>
        <div className="col-span-2">Playlist</div>
        <div className="col-span-2">Label</div>
        <div className="col-span-1">ISRC</div>
        <div className="col-span-1">Score</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>

      <div className="space-y-2">
        {tracks.map((track) => (
          <Card
            key={track.id}
            className="hover-elevate"
            data-testid={`card-track-${track.id}`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 items-center">
              <div className="col-span-1 lg:col-span-3">
                <div className="font-medium" data-testid={`text-track-name-${track.id}`}>{track.trackName}</div>
              </div>
              
              <div className="col-span-1 lg:col-span-2">
                <div className="text-sm text-muted-foreground" data-testid={`text-artist-${track.id}`}>
                  {track.artistName}
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-2">
                <Badge variant="outline" className="font-normal" data-testid={`badge-playlist-${track.id}`}>
                  {track.playlistName}
                </Badge>
              </div>
              
              <div className="col-span-1 lg:col-span-2">
                <div className="text-sm" data-testid={`text-label-${track.id}`}>
                  {track.label || <span className="text-muted-foreground italic">Unknown</span>}
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="text-xs font-mono text-muted-foreground" data-testid={`text-isrc-${track.id}`}>
                  {track.isrc || <span className="italic">N/A</span>}
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={getScoreBadgeVariant(track.unsignedScore)}
                    className={cn(
                      "font-semibold min-w-[4rem] justify-center",
                      track.unsignedScore >= 7 && "bg-chart-2 text-white border-chart-2",
                      track.unsignedScore >= 4 && track.unsignedScore < 7 && "bg-chart-4 text-white border-chart-4"
                    )}
                    data-testid={`badge-score-${track.id}`}
                  >
                    {getScoreLabel(track.unsignedScore)} {track.unsignedScore}
                  </Badge>
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1 flex justify-start lg:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="gap-2"
                  data-testid={`button-spotify-link-${track.id}`}
                >
                  <a href={track.spotifyUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">Spotify</span>
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 px-4 text-sm text-muted-foreground">
        <div data-testid="text-results-count">
          Showing {tracks.length} {tracks.length === 1 ? "result" : "results"}
        </div>
      </div>
    </div>
  );
}
