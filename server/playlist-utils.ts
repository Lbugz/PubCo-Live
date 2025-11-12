export function isEditorialPlaylist(playlistId: string): boolean {
  return playlistId.startsWith('37i9dQZ');
}

export function extractPlaylistIdFromUrl(url: string): string | null {
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  if (url.match(/^[a-zA-Z0-9]+$/)) {
    return url;
  }
  
  return null;
}
