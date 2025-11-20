# Chartmetric Support Email

---

**To:** Chartmetric Support  
**Subject:** API Access Question - 401 Errors on Analytics/Stats Endpoints  
**Priority:** Normal

---

## Issue Summary

We're experiencing **401 Unauthorized** errors on specific Chartmetric API endpoints that our application relies on for music analytics data. Our authentication succeeds, but requests to analytics/stats endpoints consistently fail with a message indicating these are "internal API endpoints."

---

## What's Working ✅

The following endpoints work correctly with our API key:

- **`POST /api/token`** - Authentication (returns 200, valid JWT token)
- **`GET /api/track/{id}`** - Track metadata retrieval
- **`GET /api/track/isrc/{isrc}/get-ids`** - ISRC to track ID conversion
- **`GET /api/search`** - Playlist and artist search

---

## What's Failing ❌

The following endpoints return **401 Unauthorized** with identical error messages:

### Analytics Endpoints:
1. **`GET /api/track/{id}/spotify/stats`** - Spotify streaming statistics
2. **`GET /api/track/{id}/youtube/stats`** - YouTube view counts

### Playlist Endpoints:
3. **`GET /api/playlist/spotify/{id}/tracks`** - Playlist track listings
4. **`GET /api/playlist/{id}`** - Playlist metadata and follower counts
5. **`POST /api/playlist/spotify/url`** - Playlist URL to ID conversion

### Exact Error Message:
```
"Session token not found or was expired. User is not authorized to access this Chartmetric internal API endpoint."
```

---

## Diagnostic Tests Performed

We ran comprehensive diagnostics to eliminate configuration issues:

### ✅ Authentication Validation
- Token generation succeeds (200 OK)
- Token is valid JWT format
- Token contains `scope: "api"`
- Token includes `expires_in: 3600` seconds
- Response includes `refresh_token` field

### ✅ Header Variations Tested
All variations tested with analytics endpoints - **all returned 401**:
- Standard: `Authorization: Bearer {token}`
- With `x-chartmetric-client: web`
- With `x-client-version: 1.0.0`
- With custom `User-Agent`
- Authorization-only (no Content-Type)

### ✅ Path Validation
- Confirmed endpoint paths match documented API patterns
- Tested both `/api/` prefixed and root-level paths
- Verified proper HTTP methods (GET/POST)

---

## Technical Evidence

**Our API Key:**
- Length: 64 characters
- Successfully authenticates to `/api/token`
- Returns valid JWT with `scope: "api"`

**Token Scope:**
```json
{
  "id": 4082,
  "timestamp": 1763654603607,
  "iat": 1763654603,
  "exp": 1763658203
}
```

**Full Diagnostic Report:**
We have a complete JSON diagnostic report (attached) containing:
- All 13 endpoint test results
- Full request/response headers
- Exact error messages
- Response status codes

---

## Questions

We need clarification on the following:

1. **Are the failing endpoints available to our API tier?**
   - We were told there is only one tier, so we're confused about the "internal API endpoint" restriction

2. **If these endpoints should be accessible:**
   - What additional authentication method is required?
   - Do we need different scopes or permissions?
   - Is there a secondary session token flow we're missing?

3. **If these endpoints are not available to our tier:**
   - Which alternative endpoints should we use for:
     - Spotify/YouTube streaming statistics?
     - Playlist track listings?
     - Playlist follower counts and analytics?

4. **Regarding the `scope` field:**
   - Our token contains `scope: "api"` - are there other scopes like "analytics" or "stats"?
   - Can our API key be upgraded to include these scopes?

---

## Use Case Context

We're building a music industry A&R discovery platform that helps publishers identify unsigned songwriters. The Chartmetric data we need includes:

- **Streaming stats** - To identify trending tracks early
- **Playlist analytics** - To track playlist momentum and reach
- **Track metadata** - To cross-reference with publishing databases

We currently use fallback systems (Spotify API + web scraping), but would prefer to use Chartmetric's official API for:
- Better rate limits
- More reliable data
- Reduced infrastructure complexity

---

## Request

Please advise on:
1. Whether these endpoints should be accessible to our account
2. What steps (if any) we need to take to gain access
3. Alternative approaches if these endpoints are restricted

We're happy to provide additional diagnostic information or schedule a call if that would be helpful.

---

## Attachments

- `chartmetric-diagnostic-report.json` - Complete test results (13 endpoints, full request/response data)

---

**Account Information:**
- API Key ID: [First 10 characters: `${process.env.CHARTMETRIC_API_KEY?.substring(0, 10)}...`]
- Contact: [Your email]
- Company: [Your company name]

---

Thank you for your assistance.

Best regards,  
[Your name]  
[Your title]  
[Your company]
