const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function extractCookies() {
  console.log('\n🍪 Spotify Cookie Extractor\n');
  console.log('This script will help you extract Spotify cookies for the scraper microservice.');
  console.log('You\'ll need to log in to your Spotify account in the browser that opens.\n');

  let browser;
  
  try {
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    const page = await browser.newPage();
    
    console.log('🌐 Navigating to Spotify...');
    await page.goto('https://open.spotify.com', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    console.log('\n✅ Browser opened!');
    console.log('👉 Please log in to your Spotify account in the browser window.');
    console.log('👉 Once you\'re logged in and see the Spotify web player, come back here.\n');
    
    await askQuestion('Press ENTER when you\'re logged in and ready to extract cookies...');
    
    console.log('\n📥 Extracting cookies...');
    const cookies = await page.cookies();
    
    // Filter for important Spotify cookies
    const spotifyCookies = cookies.filter(cookie => 
      cookie.domain.includes('spotify.com')
    );
    
    if (spotifyCookies.length === 0) {
      console.error('❌ No Spotify cookies found. Make sure you\'re logged in.');
      await browser.close();
      rl.close();
      process.exit(1);
    }
    
    // Save cookies to file
    const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
    fs.writeFileSync(cookiesPath, JSON.stringify(spotifyCookies, null, 2));
    
    console.log(`\n✅ Success! Saved ${spotifyCookies.length} cookies to: spotify-cookies.json`);
    
    // Show important cookies
    const importantCookies = spotifyCookies.filter(c => 
      ['sp_dc', 'sp_key', 'sp_t'].includes(c.name)
    );
    
    if (importantCookies.length > 0) {
      console.log('\n🔑 Important cookies found:');
      importantCookies.forEach(cookie => {
        console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
      });
    }
    
    console.log('\n📝 Next steps:');
    console.log('   1. The cookies have been saved to spotify-cookies.json');
    console.log('   2. Try fetching a playlist (like Fresh Finds) again');
    console.log('   3. The system will automatically use these cookies\n');
    
    await browser.close();
    rl.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (browser) {
      await browser.close();
    }
    rl.close();
    process.exit(1);
  }
}

console.log('Starting cookie extraction...');
extractCookies();
