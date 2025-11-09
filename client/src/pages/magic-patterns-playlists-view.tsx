import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Music, CheckCircle2, PauseCircle, AlertCircle, MoreVertical, Search, ExternalLink, RefreshCw, Eye, Filter } from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { StatusBadge } from '@/components/StatusBadge';
import { type TrackedPlaylist } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function MagicPatternsPlaylistsView() {
  const [selectedPlaylist, setSelectedPlaylist] = useState<TrackedPlaylist | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: playlists = [], isLoading } = useQuery<TrackedPlaylist[]>({
    queryKey: ['/api/tracked-playlists'],
  });

  const fetchPlaylistDataMutation = useMutation({
    mutationFn: async (spotifyPlaylistId: string) => {
      const response = await apiRequest('POST', '/api/fetch-playlists', {
        mode: 'specific',
        playlistId: spotifyPlaylistId
      });
      return await response.json();
    },
    onSuccess: (data: any, spotifyPlaylistId: string) => {
      const playlist = playlists.find(p => p.playlistId === spotifyPlaylistId);
      const totalSkipped = data.completenessResults?.reduce((sum: number, r: any) => sum + (r.skipped || 0), 0) || 0;
      const totalNew = data.tracksAdded || 0;

      toast({
        title: 'Playlist data fetched successfully',
        description: `${playlist?.name || 'Playlist'}: ${totalNew} new tracks added, ${totalSkipped} duplicates skipped`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/playlist-snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-playlists'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to fetch playlist data',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const normalizeSource = (source: string | null) => source || 'unknown';

  const filteredPlaylists = useMemo(() => {
    let filtered = [...playlists];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p => p.name.toLowerCase().includes(query) ||
          p.curator?.toLowerCase().includes(query) ||
          p.genre?.toLowerCase().includes(query)
      );
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(p => normalizeSource(p.source) === sourceFilter);
    }

    return filtered;
  }, [playlists, searchQuery, sourceFilter]);

  const stats = useMemo(() => {
    const total = playlists.length;
    const active = playlists.filter(p => p.status === 'active').length;
    const paused = playlists.filter(p => p.status === 'paused').length;
    const error = playlists.filter(p => p.status === 'error').length;
    return { total, active, paused, error };
  }, [playlists]);

  const sources = useMemo(() => {
    const uniqueSources = new Set(playlists.map(p => normalizeSource(p.source)));
    return Array.from(uniqueSources).sort();
  }, [playlists]);

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatNumber = (num: number | null) => {
    if (!num) return '—';
    return num.toLocaleString();
  };

  const getStatusBadgeType = (status: string | null): string => {
    if (!status) return 'unknown';
    switch (status) {
      case 'active': return 'accessible';
      case 'paused': return 'restricted';
      case 'error': return 'error';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-slide-up p-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Playlists"
          value={stats.total}
          icon={<Music className="h-6 w-6 text-primary" />}
          color="bg-primary/20"
        />
        <StatsCard
          title="Active"
          value={stats.active}
          icon={<CheckCircle2 className="h-6 w-6 text-success" />}
          color="bg-success/20"
        />
        <StatsCard
          title="Paused"
          value={stats.paused}
          icon={<PauseCircle className="h-6 w-6 text-warning" />}
          color="bg-warning/20"
        />
        <StatsCard
          title="Errors"
          value={stats.error}
          icon={<AlertCircle className="h-6 w-6 text-error" />}
          color="bg-error/20"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-textSecondary" />
          <input
            type="text"
            placeholder="Search playlists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-4 py-3 w-full bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl text-sm text-textPrimary placeholder-textSecondary focus:border-primary/50 focus:bg-white/10 transition-all duration-200"
            data-testid="input-search-playlists"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 focus:outline-none focus:border-primary/50 transition-all duration-200"
          data-testid="select-source-filter"
        >
          <option value="all">All Sources</option>
          {sources.map(source => (
            <option key={source} value={source}>{source.charAt(0).toUpperCase() + source.slice(1)}</option>
          ))}
        </select>
        <button className="inline-flex items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200 whitespace-nowrap">
          <Filter className="h-4 w-4 mr-2" />
          More Filters
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-lg font-semibold text-textPrimary">
          {filteredPlaylists.length} Playlist{filteredPlaylists.length !== 1 ? 's' : ''}
        </h3>
        <button 
          className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl text-sm font-medium text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/50 focus:outline-none transition-all duration-200 hover:scale-105"
          data-testid="button-fetch-all"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Fetch All
        </button>
      </div>

      {/* Table */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Source
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Tracks
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Curator
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Followers
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Last Updated
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="relative px-6 py-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredPlaylists.map(playlist => (
              <tr
                key={playlist.id}
                className="hover:bg-white/5 cursor-pointer transition-all duration-200"
                onClick={() => setSelectedPlaylist(playlist)}
                data-testid={`row-playlist-${playlist.playlistId}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Music className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-textPrimary">
                        {playlist.name}
                      </div>
                      {playlist.isEditorial === 1 && (
                        <StatusBadge status="Editorial" size="sm" />
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-textSecondary">
                    {normalizeSource(playlist.source).charAt(0).toUpperCase() + normalizeSource(playlist.source).slice(1)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-textSecondary">
                    {formatNumber(playlist.totalTracks)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-textSecondary">
                    {playlist.curator || '—'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-textSecondary">
                    {formatNumber(playlist.followers)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-textSecondary">
                    {formatDate(playlist.lastChecked)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={getStatusBadgeType(playlist.status)} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    className="text-textSecondary hover:text-textPrimary transition-colors p-2 rounded-lg hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    data-testid={`button-actions-${playlist.playlistId}`}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sidebar Detail Panel */}
      {selectedPlaylist && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex justify-end animate-fade-in">
          <div className="bg-white/5 backdrop-blur-xl w-full max-w-md border-l border-white/10 overflow-y-auto animate-slide-in-right">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl flex-shrink-0">
                    <Music className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold font-display text-textPrimary break-words">
                      {selectedPlaylist.name}
                    </h2>
                  </div>
                </div>
                <button
                  className="text-textSecondary hover:text-textPrimary transition-colors p-2 rounded-xl hover:bg-white/10 flex-shrink-0 ml-2"
                  onClick={() => setSelectedPlaylist(null)}
                  data-testid="button-close-drawer"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Status Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-3">
                  Status
                </h3>
                <StatusBadge status={getStatusBadgeType(selectedPlaylist.status)} />
              </div>

              {/* Metadata Section */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-3">
                  Metadata
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Total Tracks</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {formatNumber(selectedPlaylist.totalTracks)}
                    </p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Last Fetch Count</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {formatNumber(selectedPlaylist.lastFetchCount)}
                    </p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Followers</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {formatNumber(selectedPlaylist.followers)}
                    </p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Source</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {normalizeSource(selectedPlaylist.source).charAt(0).toUpperCase() + normalizeSource(selectedPlaylist.source).slice(1)}
                    </p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Last Checked</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {formatDate(selectedPlaylist.lastChecked)}
                    </p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-lg p-3 rounded-xl border border-white/10">
                    <p className="text-xs text-textSecondary mb-1">Fetch Method</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {selectedPlaylist.fetchMethod || 'API'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    fetchPlaylistDataMutation.mutate(selectedPlaylist.playlistId);
                    setSelectedPlaylist(null);
                  }}
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent rounded-xl text-sm font-medium text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/50 focus:outline-none transition-all duration-200 hover:scale-105"
                  data-testid="button-fetch-playlist"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Fetch Playlist Data
                </button>
                <button
                  onClick={() => {
                    navigate(`/?playlist=${selectedPlaylist.playlistId}`);
                    setSelectedPlaylist(null);
                  }}
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200"
                  data-testid="button-view-tracks"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Tracks
                </button>
                <a
                  href={selectedPlaylist.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200"
                  data-testid="link-spotify"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Spotify
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
