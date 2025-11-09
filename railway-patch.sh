#!/bin/bash
set -e
echo "========================================"
echo "🔧 Railway Scraper Auto-Patch"
echo "========================================"
echo ""
SCRAPER_FILE="scraper-microservice/scraper.js"
if [ ! -f "$SCRAPER_FILE" ]; then
    echo "❌ Error: $SCRAPER_FILE not found!"
    exit 1
fi
BACKUP_FILE="${SCRAPER_FILE}.backup.$(date +%s)"
echo "📦 Creating backup: $BACKUP_FILE"
cp "$SCRAPER_FILE" "$BACKUP_FILE"
LINE_NUM=$(grep -n "await page\.goto(" "$SCRAPER_FILE" | head -1 | cut -d: -f1)
if [ -z "$LINE_NUM" ]; then
    echo "❌ Error: Could not find 'await page.goto(' in $SCRAPER_FILE"
    exit 1
fi
echo "✅ Found page.goto at line $LINE_NUM"
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
      } catch (error) {}
    }
    if (!consentHandled) {
      console.log('\''[Scraper] ℹ️ No cookie consent banner detected'\'');
    }
    await page.waitForTimeout(2000);
'
echo "🔧 Inserting consent handling code..."
awk -v line="$LINE_NUM" -v code="$CONSENT_CODE" 'NR == line {print; print code; next} {print}' "$SCRAPER_FILE" > "${SCRAPER_FILE}.tmp"
mv "${SCRAPER_FILE}.tmp" "$SCRAPER_FILE"
echo ""
echo "✅ Patch Applied Successfully!"
echo "📝 Backup: $BACKUP_FILE"
echo ""
