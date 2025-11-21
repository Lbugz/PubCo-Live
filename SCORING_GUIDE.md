# Contact Scoring System Guide

## Overview
The AI Pub Feed uses a **category-based scoring system** to identify unsigned songwriters and unpublished talent. Each contact receives a score from **0-10 points** based on 6 weighted categories.

---

## Scoring Categories

### 1. Publishing Status (4 pts max)
**What it measures:** Publisher representation across all tracks

| Score | Signal | Description |
|-------|--------|-------------|
| **4 pts** | No Publisher | No publishing metadata found across ANY tracks |
| **0 pts** | Has Publisher | At least one track shows publisher representation |

**Why it matters:** Missing publisher metadata is the strongest signal of an unsigned songwriter. If a songwriter had a publishing deal, their publisher would be credited.

---

### 2. Release Pathway (3 pts max)
**What it measures:** Distribution/label type indicating independence level

| Score | Signal | Examples | Description |
|-------|--------|----------|-------------|
| **3 pts** | DIY Distribution | DistroKid, TuneCore, CD Baby, Ditto, Amuse, RouteNote, Soundrop, Spinnup, Bandcamp | Self-service platforms indicating true independent artist |
| **2 pts** | Independent Distributor | EMPIRE, AWAL, The Orchard, Believe, Stem, United Masters, Ingrooves, Symphonic, Level, Create Music Group, Repost Network | Professional indie distributors serving unsigned artists |
| **1 pt** | Independent Label | Any label containing "independent", "indie", or "records" | Small independent labels |
| **0 pts** | Major Label | Sony, Warner, Universal, Atlantic, Capitol, Republic, RCA, Columbia, Interscope, Def Jam, Island, Virgin, EMI, Parlophone, Geffen, Motown, Epic, Arista, Elektra, Asylum | Major label deals unlikely to be unsigned |
| **0 pts** | Unknown | Label cannot be categorized | Unable to determine from label metadata |

**Why it matters:** DIY distribution suggests an unsigned artist releasing independently. Independent distributors like EMPIRE serve emerging talent. Major labels indicate established representation.

**Common Questions:**
- **Q: Why does EMPIRE score 2pts instead of 0pts?**  
  A: EMPIRE is a major independent distributor that serves unsigned artists. It's not a traditional label deal, making it a strong unsigned signal.
  
- **Q: Track has a label but scores 0pts?**  
  A: The label name doesn't match our known keywords. This could mean: (1) it's a small unknown label, (2) it's misspelled, or (3) it needs to be added to our keyword lists.

---

### 3. Early Career Signals (2 pts max)
**What it measures:** Editorial validation of emerging talent

| Score | Signal | Description |
|-------|--------|-------------|
| **2 pts** | Fresh Finds | Appears on any Fresh Finds playlist |
| **0 pts** | No Fresh Finds | Not on Fresh Finds playlists |

**Why it matters:** Spotify's Fresh Finds playlists specifically highlight unsigned, emerging artists. Editorial inclusion is a strong signal of unsigned status.

---

### 4. Metadata Quality (1 pt max)
**What it measures:** Average data completeness across tracks (inverse scoring)

| Score | Completeness | Description |
|-------|-------------|-------------|
| **1 pt** | < 25% | Very sparse metadata (strong unsigned signal) |
| **0.75 pts** | 25-50% | Low metadata (medium unsigned signal) |
| **0.5 pts** | 50-75% | Moderate metadata (low unsigned signal) |
| **0 pts** | > 75% | Complete metadata (no unsigned signal) |

**Why it matters:** Unsigned artists often have incomplete metadata (missing publisher, ISRC, administrators, etc.). Well-represented artists have comprehensive credits.

---

### 5. Catalog Patterns (0.5 pts max)
**What it measures:** Consistency of independent releases

| Score | Signal | Description |
|-------|--------|-------------|
| **0.5 pts** | Consistent DIY/Indie | >50% of tracks via DIY or indie distributors |
| **0 pts** | Mixed/Major | Catalog shows major label or mixed distribution |

**Why it matters:** Artists consistently releasing through DIY/indie channels likely lack traditional representation.

---

### 6. Profile Verification (0.5 pts max)
**What it measures:** External identity records

| Score | Signal | Description |
|-------|--------|-------------|
| **0.5 pts** | No MusicBrainz | No external identity records found |
| **0 pts** | Has MusicBrainz | MusicBrainz profile exists |

**Why it matters:** Lack of external database presence can indicate early-career or unsigned status.

---

## Score Interpretation

### High Priority (7-10 points)
- **Strong unsigned signals** across multiple categories
- No publisher + DIY distribution + Fresh Finds presence
- **Action:** Priority outreach targets

### Medium Priority (4-6 points)
- **Moderate unsigned signals** with some gaps
- May have independent distributor or sparse metadata
- **Action:** Watch list for growth tracking

### Low Priority (0-3 points)
- **Weak or no unsigned signals**
- Likely has representation or major label deal
- **Action:** Discovery pool / research further

---

## Confidence Levels

| Confidence | Criteria | Interpretation |
|-----------|----------|----------------|
| **High** | ≥7 points | Strong unsigned signals, high-priority lead |
| **Medium** | 4-6 points | Moderate signals, watch for growth |
| **Low** | 0-3 points | Weak signals, likely represented |

---

## How Scores Are Calculated

1. **Per-Contact Basis:** Each songwriter/contact is scored individually
2. **All-Track Analysis:** Categories analyze ALL tracks linked to that contact
3. **Priority Scoring:** Within each category, the highest qualifying signal is used
4. **Additive:** Final score = sum of all category scores
5. **Post-Enrichment:** Scores are recalculated after enrichment completes

---

## Examples

### Example 1: High-Priority Lead (9/10 points)
```
Andrew De - 9/10 points
├─ Publishing Status: 4/4 pts (No publisher across all tracks)
├─ Release Pathway: 3/3 pts (DIY - DistroKid detected)
├─ Early Career Signals: 2/2 pts (Fresh Finds presence)
├─ Metadata Quality: 0/1 pts (High completeness 78%)
├─ Catalog Patterns: 0/0.5 pts (Mixed distribution)
└─ Profile Verification: 0/0.5 pts (MusicBrainz exists)
```
**Interpretation:** Strong unsigned signal! No publisher, DIY distribution, Fresh Finds validated.

---

### Example 2: Medium-Priority Lead (6/10 points)
```
Sarah Chen - 6/10 points
├─ Publishing Status: 4/4 pts (No publisher)
├─ Release Pathway: 2/3 pts (EMPIRE - Indie distributor)
├─ Early Career Signals: 0/2 pts (No Fresh Finds)
├─ Metadata Quality: 0/1 pts (Complete metadata)
├─ Catalog Patterns: 0/0.5 pts (Consistent indie releases)
└─ Profile Verification: 0/0.5 pts (Has MusicBrainz)
```
**Interpretation:** Moderate signal. No publisher + EMPIRE distribution = likely unsigned but more established.

---

### Example 3: Low-Priority (2/10 points)
```
Major Label Artist - 2/10 points
├─ Publishing Status: 0/4 pts (Has publisher: Sony/ATV)
├─ Release Pathway: 0/3 pts (Major label: Columbia Records)
├─ Early Career Signals: 2/2 pts (Fresh Finds presence)
├─ Metadata Quality: 0/1 pts (Complete metadata)
├─ Catalog Patterns: 0/0.5 pts (Major label releases)
└─ Profile Verification: 0/0.5 pts (Has MusicBrainz)
```
**Interpretation:** Weak signal. Has publisher + major label = likely fully represented.

---

## Troubleshooting

### "Release Pathway shows 0 pts but track has a label"

**Possible reasons:**
1. **Label not in keyword lists:** Label name doesn't match our known distributors/labels
2. **Small/regional label:** Unknown indie label not yet in our database
3. **Misspelled label:** Spotify metadata may have typos
4. **Needs expansion:** We should add this label to our keyword lists

**What to do:**
- Check the label name in the track details
- If it's a known indie distributor (like EMPIRE), report it for keyword expansion
- If it's truly unknown, the 0pt score is correct

### "Contact has high score but seems represented"

**Check for:**
- Outdated metadata (enrichment may not have captured latest deals)
- Publishing deals signed after tracks were released
- Administrator vs. Publisher confusion (administrators may be listed differently)

**Action:** Manually verify before outreach

---

## Updating Keyword Lists

As the platform discovers new distributors/labels, update the keyword lists in:
`server/scoring/contactScoring.ts`

**Functions to update:**
- `isDIYDistribution()` - DIY platforms
- `isIndependentDistributor()` - Indie distributors
- `isMajorLabel()` - Major labels
- `isIndependentLabel()` - Indie labels (currently uses generic patterns)

After updates, scores are automatically recalculated during the next enrichment run.
