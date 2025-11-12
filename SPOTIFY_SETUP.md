# Spotify OAuth Setup Guide

This application uses **custom OAuth 2.0** authentication for Spotify integration following 2024-2025 security best practices.

## Why Custom OAuth?

We attempted to use Replit's managed Spotify integration, but encountered an issue where the integration showed as "Active" in the UI but was not accessible via the Connectors API. We've documented this issue for Replit support and will migrate back once it's resolved.

## Setup Instructions

### Step 1: Create Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create app"**
4. Fill in the details:
   - **App name**: `PubCo Live` (or your preferred name)
   - **App description**: `A&R playlist management and publishing lead discovery`
   - **Redirect URI**: See Step 2 below
   - **Which API/SDKs are you planning to use?**: Select "Web API"
5. Accept the terms and click **"Save"**

### Step 2: Configure Redirect URI

#### For Development (Local Testing)
Add this redirect URI in your Spotify App settings:
```
http://localhost:5000/api/spotify/callback
```

#### For Replit Deployment
1. Find your Replit deployment domain (usually shown at the top of the Replit interface)
2. Add this redirect URI:
```
https://YOUR-REPL-NAME.YOUR-USERNAME.repl.co/api/spotify/callback
```

**Example:**
```
https://pubco-live.myusername.repl.co/api/spotify/callback
```

**IMPORTANT:** The redirect URI must match EXACTLY (including trailing slash or lack thereof). Save your changes in the Spotify Dashboard.

### Step 3: Get Your Credentials

1. In your Spotify App dashboard, find the **Settings** page
2. Copy your **Client ID** (visible by default)
3. Click **"View client secret"** and copy your **Client Secret**

⚠️ **SECURITY WARNING**: Never commit your Client Secret to version control or expose it in frontend code.

### Step 4: Add Credentials to Replit Secrets

1. In your Replit project, open the **Secrets** tool (in the left sidebar under "Tools")
2. Add these two secrets:

   | Key | Value |
   |-----|-------|
   | `SPOTIFY_CLIENT_ID` | Your Client ID from Step 3 |
   | `SPOTIFY_CLIENT_SECRET` | Your Client Secret from Step 3 |

3. The application will automatically detect these secrets on restart (no manual restart needed)

### Step 5: Authenticate

1. Navigate to **Settings → Spotify** in the application
2. Click **"Connect Spotify"**
3. A popup will open with Spotify's authorization page
4. Log in and authorize the app
5. The popup will close automatically and you'll be connected

✅ **Success!** You should see a green checkmark indicating the connection is active.

## Security Features

This implementation follows OAuth 2.0 best practices:

- ✅ **CSRF Protection**: State parameter validation prevents cross-site request forgery
- ✅ **Secure Token Storage**: Access and refresh tokens stored server-side (never in URLs or frontend)
- ✅ **Automatic Token Refresh**: Tokens are automatically refreshed before expiration (1-hour lifetime)
- ✅ **HTTPS in Production**: Redirect URIs use HTTPS except for localhost development
- ✅ **Secret Management**: Client credentials stored in Replit Secrets, never hardcoded

## Scopes Requested

The app requests these Spotify permissions:
- `playlist-read-private` - Access your private playlists
- `playlist-read-collaborative` - Access collaborative playlists you're in
- `user-read-email` - Read your email address
- `user-read-private` - Access your subscription details

## Troubleshooting

### "Invalid redirect URI" Error
- Ensure the redirect URI in Spotify Dashboard matches exactly
- Check for trailing slashes: `https://domain.com/callback` vs `https://domain.com/callback/`
- Verify you're using HTTPS for production domains (HTTP only works for localhost)

### "Not authenticated" Error
1. Check that both secrets are added in Replit Secrets
2. Verify the secret keys are spelled correctly (case-sensitive)
3. Try clicking "Connect Spotify" again

### Token Expired Issues
The app automatically refreshes tokens before they expire. If you see authentication errors:
1. Go to Settings → Spotify
2. Click "Re-authenticate Spotify"
3. Authorize again

### App Shows "Setup Required"
1. Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are in Replit Secrets
2. Check the server logs for startup errors
3. Restart the application if needed

## Migration Path

Once Replit fixes the Connectors API issue (where integrations show "Active" but return empty items via API), we can migrate back to the managed integration for improved reliability and automatic credential rotation.

## References

- [Spotify Authorization Code Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- [Spotify Redirect URI Requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [2025 Security Updates](https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify)
