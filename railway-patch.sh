#!/bin/bash
#
# Railway Scraper Auto-Patch Script
# This script updates your Railway scraper with consent handling and improved selectors
#

set -e  # Exit on error

echo "========================================"
echo "🔧 Railway Scraper Auto-Patch"
echo "========================================"
echo ""

# Define the scraper file path
SCRAPER_FILE="scraper-microservice/scraper.js"

# Check if file exists
if [ ! -f "$SCRAPER_FILE" ]; then
    echo "❌ Error: $SCRAPER_FILE not found!"
    echo "   Make sure you're in the Railway shell and the file exists"
    exit 1
fi

# Create backup
BACKUP_FILE="${SCRAPER_FILE}.backup.$(date +%s)"
echo "📦 Creating backup: $BACKUP_FILE"
cp "$SCRAPER_FILE" "$BACKUP_FILE"

# Find the line number with "await page.goto("
LINE_NUM=$(grep -n "await page\.goto(" "$SCRAPER_FILE" | head -1 | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
    echo "❌ Error: Could not find 'await page.goto(' in $SCRAPER_FILE"
    echo "   Backup preserved at: $BACKUP_FILE"
    exit 1
fi

echo "✅ Found page.goto at line $LINE_NUM"
echo ""

# Create the consent handling code to insert
CONSENT_CODE='
    // Handle cookie consent banner
    console.log('\''[Scraper] Checking for cookie consent banner...'\'');
    const consentSelectors = [
      '\''button[data-testid="auth-accept-all-cookies"]'\'',
      '\''button[id="onetrust-accept-btn-handler"]'\'',
      '\''button:has-text("Accept all cookies")'\'',
      '\''button:has-text("Accept All")'\'',
      '\''.css-1nwiw4g'\'',
      '\''[data-testid="cookie-accept-all"]'\''
    ];

    let consentHandled = false;
    for (const selector of consentSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(2000);
          console.log(`[Scraper] ✅ Accepted cookie consent using: ${selector}`);
          consentHandled = true;
          break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!consentHandled) {
      console.log('\''[Scraper] ℹ️ No cookie consent banner detected'\'');
    }

    // Wait for content to load after consent
    await page.waitForTimeout(2000);
'

# Insert the consent code after the page.goto line
echo "🔧 Inserting consent handling code..."

# Use awk to insert the code after the specific line
awk -v line="$LINE_NUM" -v code="$CONSENT_CODE" '
NR == line {print; print code; next}
{print}
' "$SCRAPER_FILE" > "${SCRAPER_FILE}.tmp"

# Replace original with modified version
mv "${SCRAPER_FILE}.tmp" "$SCRAPER_FILE"

echo ""
echo "========================================"
echo "✅ Patch Applied Successfully!"
echo "========================================"
echo ""
echo "📝 Summary:"
echo "   - Backup created: $BACKUP_FILE"
echo "   - Consent handling added after line $LINE_NUM"
echo "   - Updated: $SCRAPER_FILE"
echo ""
echo "🚀 Next Steps:"
echo "   1. Exit Railway shell: exit"
echo "   2. Redeploy: railway up"
echo "   3. Watch logs: railway logs --follow"
echo ""
echo "Expected results:"
echo "   ✅ [Scraper] ✅ Accepted cookie consent using: [selector]"
echo "   ✅ Success! Returning 160+ tracks"
echo ""
