import { useMemo } from "react";
import { Music, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type PlaylistSnapshot, type Tag } from "@shared/schema";
import { TrackActionsDropdown } from "./track-actions-dropdown";
import { SongwriterDisplay } from "./songwriter-display";
import { useQuery } from "@tanstack/react-query";
import { getTagColorClass } from "./tag-manager";
import { apiRequest } from "@/lib/queryClient";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

interface TrackTableProps {
  tracks: PlaylistSnapshot[];
  isLoading?: boolean;
  selectedTrackIds?: Set<string>;
  onToggleSelection?: (trackId: string) => void;
  onToggleSelectAll?: () => void;
  onEnrich?: (trackId: string) => void;
  onRowClick?: (track: PlaylistSnapshot) => void;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (field: string) => void;
}

function TrackTags({ trackId, tags }: { trackId: string; tags?: Tag[] }) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={`${getTagColorClass(tag.color)} text-xs`}
          data-testid={`badge-track-tag-${trackId}-${tag.id}`}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}

export function TrackTable({ 
  tracks, 
  isLoading, 
  selectedTrackIds = new Set(), 
  onToggleSelection, 
  onToggleSelectAll,
  onEnrich, 
  onRowClick,
  sortField,
  sortDirection,
  onSort
}: TrackTableProps) {
  // Batch fetch tags for all tracks
  const trackIds = useMemo(() => tracks.map(t => t.id), [tracks]);
  
  const { data: tagsMap = {} } = useQuery<Record<string, Tag[]>>({
    queryKey: ["/api/tracks/tags/batch", trackIds],
    queryFn: async () => {
      if (trackIds.length === 0) return {};
      const response = await apiRequest("POST", "/api/tracks/tags/batch", { trackIds });
      return response;
    },
    enabled: trackIds.length > 0,
    staleTime: 60000,
  });

  const columns: DataTableColumn<PlaylistSnapshot>[] = [
    {
      id: "trackInfo",
      header: "Track Info",
      sortField: "trackName",
      cell: (track) => (
        <div className="flex items-start gap-3">
          {/* Album Art */}
          {track.albumArt ? (
            <img 
              src={track.albumArt} 
              alt={`${track.trackName} album art`}
              className="h-8 w-8 rounded object-cover flex-shrink-0"
              loading="lazy"
              decoding="async"
              width="32"
              height="32"
            />
          ) : (
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
              <Music className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          
          {/* Stacked Info */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Track Name - Primary */}
            <div className="font-medium text-sm leading-tight" data-testid={`text-track-name-${track.id}`}>
              {track.trackName}
            </div>
            
            {/* Artist Name - Secondary */}
            <div className="text-sm text-muted-foreground leading-tight" data-testid={`text-artist-${track.id}`}>
              {track.artistName}
            </div>
            
            {/* Tags */}
            <TrackTags trackId={track.id} tags={tagsMap[track.id]} />
          </div>
        </div>
      ),
      className: "min-w-[300px]",
    },
    {
      id: "playlist",
      header: "Playlist",
      sortField: "playlistName",
      cell: (track) => (
        <>
          {(track as any).playlist_count > 1 ? (
            <Badge 
              variant="outline" 
              className="bg-primary/10 text-primary border-primary/20 text-xs"
              data-testid={`badge-playlists-${track.id}`}
            >
              {(track as any).playlist_count} playlists
            </Badge>
          ) : (
            <div className="text-sm" data-testid={`text-playlist-${track.id}`}>
              {track.playlistName}
            </div>
          )}
        </>
      ),
      className: "min-w-[150px]",
    },
    {
      id: "streams",
      header: "Streams",
      sortField: "spotifyStreams",
      cell: (track) => (
        <div className="text-sm font-medium" data-testid={`text-streams-${track.id}`}>
          {track.spotifyStreams ? track.spotifyStreams.toLocaleString() : '—'}
        </div>
      ),
      className: "min-w-[100px]",
    },
    {
      id: "songwriter",
      header: "Songwriter",
      sortField: "songwriter",
      cell: (track) => (
        <div className="text-sm">
          <SongwriterDisplay
            songwriters={track.songwriter}
            testId={`text-songwriter-${track.id}`}
          />
        </div>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "isrc",
      header: "ISRC",
      cell: (track) => (
        <div className="flex justify-center">
          {track.isrc ? (
            <Badge 
              variant="outline" 
              className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs"
              data-testid={`badge-has-isrc-${track.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              ISRC
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs" data-testid={`text-no-isrc-${track.id}`}>—</span>
          )}
        </div>
      ),
      className: "w-24",
      headerClassName: "text-center",
    },
    {
      id: "actions",
      header: "Actions",
      cell: (track) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <TrackActionsDropdown
            track={track}
            onEnrich={onEnrich}
          />
        </div>
      ),
      className: "w-20",
      headerClassName: "text-right",
    },
  ];

  const emptyState = (
    <div className="flex flex-col items-center justify-center text-center p-12">
      <Music className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold font-heading mb-2" data-testid="text-empty-state-title">No tracks found</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Try adjusting your filters or select a different week to view publishing leads.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <DataTable
        data={tracks}
        columns={columns}
        getRowId={(track) => track.id}
        isLoading={isLoading}
        emptyState={emptyState}
        selectedIds={selectedTrackIds}
        onToggleSelection={onToggleSelection}
        onToggleSelectAll={onToggleSelectAll}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={onSort}
        onRowClick={onRowClick}
        virtualized={true}
        estimateRowSize={96}
        containerHeight="calc(100vh - 300px)"
        bordered={true}
        striped={true}
        hoverable={true}
        stickyHeader={true}
        testIdPrefix="track"
      />
      
      <div className="flex items-center justify-between px-4 text-sm text-muted-foreground">
        <div data-testid="text-results-count">
          Showing {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
        </div>
      </div>
    </div>
  );
}
