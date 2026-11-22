const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database');

// Utility to process Spintax text format: {Word1|Word2|Word3}
function parseSpintax(text) {
  if (!text) return '';
  const regex = /\{([^{}]+)\}/g;
  let matches;
  while ((matches = regex.exec(text)) !== null) {
    const options = matches[1].split('|');
    const selected = options[Math.floor(Math.random() * options.length)];
    text = text.replace(matches[0], selected);
    regex.lastIndex = 0;
  }
  return text;
}

// Random delay promise
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class FacebookAutomation {
  constructor() {
    this.browser = null;
    this.isLoggingIn = false;
  }

  getLaunchOptions(headless = false) {
    const settings = db.getSettings();
    const chromePath = settings.chromePath || config.DEFAULT_CHROME_PATH;

    return {
      executablePath: chromePath,
      headless: headless ? 'new' : false,
      userDataDir: config.CHROME_PROFILE_DIR,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-notifications',
        '--disable-infobars',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    };
  }

  // Opens an interactive browser window for the user to log into Facebook
  async openLoginBrowser(onStatusUpdate) {
    if (this.isLoggingIn && this.browser) {
      if (onStatusUpdate) onStatusUpdate('Login browser is already running.');
      return { success: true, message: 'Browser already open' };
    }

    try {
      this.isLoggingIn = true;
      if (onStatusUpdate) onStatusUpdate('Launching browser for Facebook login...');

      const options = this.getLaunchOptions(false); // Visible window
      this.browser = await puppeteer.launch(options);

      const pages = await this.browser.pages();
      const page = pages.length > 0 ? pages[0] : await this.browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      );

      await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });

      if (onStatusUpdate) onStatusUpdate('Facebook opened. Please log into your account in the browser window.');

      // Check periodically if logged in
      const checkInterval = setInterval(async () => {
        try {
          if (!this.browser || !this.browser.isConnected()) {
            clearInterval(checkInterval);
            this.isLoggingIn = false;
            return;
          }

          const loggedIn = await this.isPageLoggedIn(page);
          if (loggedIn) {
            clearInterval(checkInterval);
            if (onStatusUpdate) onStatusUpdate('Facebook login detected successfully!');
            this.isLoggingIn = false;
          }
        } catch (e) {
          // ignore navigation errors during login
        }
      }, 3000);

      this.browser.on('disconnected', () => {
        this.browser = null;
        this.isLoggingIn = false;
        clearInterval(checkInterval);
        if (onStatusUpdate) onStatusUpdate('Login browser window closed.');
      });

      return { success: true, message: 'Login browser opened successfully' };
    } catch (err) {
      this.isLoggingIn = false;
      if (this.browser) {
        try { await this.browser.close(); } catch (_) {}
        this.browser = null;
      }
      throw new Error(`Failed to open login browser: ${err.message}`);
    }
  }

  // Checks if Facebook is logged in using stored Chrome profile
  async isPageLoggedIn(page) {
    try {
      return await page.evaluate(() => {
        // Look for common logged-in indicators
        const hasAriaNav = !!document.querySelector('[role="navigation"]');
        const hasFeed = !!document.querySelector('[role="feed"]') || !!document.querySelector('[aria-label="Facebook"][role="main"]') || !!document.querySelector('[aria-label*="Account Controls and Settings"]');
        const hasLoginInputs = !!document.querySelector('input#email') || !!document.querySelector('input#pass') || !!document.querySelector('button[name="login"]');
        return (hasAriaNav || hasFeed) && !hasLoginInputs;
      });
    } catch (e) {
      return false;
    }
  }

  async checkLoginStatus() {
    let testBrowser = null;
    try {
      const options = this.getLaunchOptions(true); // Headless for silent check
      testBrowser = await puppeteer.launch(options);
      const page = await testBrowser.newPage();
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);

      const loggedIn = await this.isPageLoggedIn(page);
      await testBrowser.close();
      return { loggedIn };
    } catch (err) {
      if (testBrowser) {
        try { await testBrowser.close(); } catch (_) {}
      }
      return { loggedIn: false, error: err.message };
    }
  }

  // Composes text using spintax and formatting
  preparePostContent(post, customMessage = '') {
    const settings = db.getSettings();
    let text = '';

    if (customMessage) {
      text += parseSpintax(customMessage) + '\n\n';
    } else if (settings.spintaxEnabled && settings.spintaxPrefix) {
      text += parseSpintax(settings.spintaxPrefix) + '\n';
    }

    if (post.title) {
      text += `📌 ${post.title}\n\n`;
    }

    if (post.excerpt) {
      text += `${post.excerpt}\n\n`;
    }

    if (post.url) {
      text += `🔗 ${post.url}\n`;
    }

    if (settings.spintaxEnabled && settings.spintaxSuffix) {
      text += '\n' + parseSpintax(settings.spintaxSuffix);
    }

    if (post.tags && post.tags.length > 0) {
      const hashtagStr = post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
      text += `\n${hashtagStr}`;
    }

    return text.trim();
  }

  // Core poster: Posts to a specific Facebook group or page
  async postToTarget(targetUrl, postData, options = {}) {
    const { onProgress = () => {}, customMessage = '' } = options;
    const settings = db.getSettings();
    const headless = settings.headless !== false; // can be configured in settings

    let browser = null;
    try {
      onProgress(`Launching Chrome browser (${headless ? 'Headless' : 'Visible mode'})...`);
      const launchOpts = this.getLaunchOptions(headless);
      browser = await puppeteer.launch(launchOpts);

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      );

      // Block unnecessary heavy media to speed up navigation
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['media', 'font'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      onProgress(`Navigating to target URL: ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);

      // Verify login state
      const isLoggedIn = await this.isPageLoggedIn(page);
      if (!isLoggedIn) {
        throw new Error('Not logged into Facebook. Please click "Connect Facebook" in the dashboard first.');
      }

      onProgress('Locating post composer on the page...');

      // Multiple selector heuristics for Facebook Group / Page composers
      const composerSelectors = [
        // Modern Facebook group "Write something..." composer button
        'div[role="button"][tabindex="0"] span:has-text("Write something")',
        'div[role="button"] span:has-text("Create a public post")',
        'div[role="button"] span:has-text("What\'s on your mind")',
        'div[role="button"] span:has-text("Write something to the group")',
        // Fallback generic aria-labels
        'div[aria-label*="Create a post"]',
        'div[aria-label*="Write something"]',
        'div[aria-label*="What\'s on your mind"]',
        // Clickable composer container
        'div[data-pagelet="GroupInlineComposer"] div[role="button"]',
        'div[data-pagelet="ProfileComposer"] div[role="button"]'
      ];

      let composerFound = false;
      for (const sel of composerSelectors) {
        try {
          // If selector has text matching pseudo
          if (sel.includes(':has-text(')) {
            const textMatch = sel.match(/:has-text\("([^"]+)"\)/)[1];
            const clicked = await page.evaluate((text) => {
              const elements = Array.from(document.querySelectorAll('div[role="button"], span'));
              for (const el of elements) {
                if (el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())) {
                  const btn = el.closest('div[role="button"]') || el;
                  btn.click();
                  return true;
                }
              }
              return false;
            }, textMatch);

            if (clicked) {
              composerFound = true;
              break;
            }
          } else {
            const btn = await page.$(sel);
            if (btn) {
              await btn.click();
              composerFound = true;
              break;
            }
          }
        } catch (_) {}
      }

      if (!composerFound) {
        // Try fallback: look for any element with "Write something" text
        const clickedFallback = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('span, div'));
          for (const s of spans) {
            const t = (s.textContent || '').trim().toLowerCase();
            if (t === 'write something...' || t === "what's on your mind?" || t === 'create a post' || t.includes('write something')) {
              const clickable = s.closest('div[role="button"]') || s;
              clickable.click();
              return true;
            }
          }
          return false;
        });
        if (clickedFallback) {
          composerFound = true;
        }
      }

      if (!composerFound) {
        throw new Error('Could not find post composer. Ensure you have permission to post in this group or page.');
      }

      onProgress('Composer dialog opened. Preparing blog content with Spintax...');
      await sleep(2500);

      // Find the dialog and its active editable textbox
      const finalContent = this.preparePostContent(postData, customMessage);

      // Focus modal editor
      const editorSelector = 'div[role="dialog"] div[role="textbox"][contenteditable="true"], div[role="textbox"][contenteditable="true"]';
      await page.waitForSelector(editorSelector, { timeout: 15000 });
      const editor = await page.$(editorSelector);

      if (!editor) {
        throw new Error('Composer text editor box was not found inside the popup.');
      }

      await editor.click();
      await sleep(1000);

      onProgress('Writing post content into composer...');

      // Type text simulating human input, handling linebreaks cleanly
      const lines = finalContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          await page.keyboard.type(lines[i], { delay: randomBetween(15, 35) });
        }
        if (i < lines.length - 1) {
          await page.keyboard.down('Shift');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Shift');
        }
        await sleep(randomBetween(100, 250));
      }

      onProgress('Content typed. Waiting for Facebook link preview / attachments...');
      await sleep(5000); // Give Facebook time to scrape URL preview

      // Handle custom local video or image upload
      const mediaPath = postData.localVideoPath || postData.localImagePath;
      const isVideo = !!(postData.localVideoPath && fs.existsSync(postData.localVideoPath));

      if (mediaPath && fs.existsSync(mediaPath)) {
        try {
          onProgress(isVideo ? 'Uploading video to Facebook...' : 'Uploading blog image...');
          
          // Facebook file inputs accept both video and image (or either)
          let fileInput = await page.$('input[type="file"][accept*="video"], input[type="file"][accept*="image"], input[type="file"]');
          
          // If hidden file input is not open yet, click the "Photo/video" button in composer
          if (!fileInput) {
            await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('div[role="button"], div[aria-label*="Photo/video"], div[aria-label*="photo/video"]'));
              for (const b of buttons) {
                if ((b.getAttribute('aria-label') || '').toLowerCase().includes('photo/video') || (b.textContent || '').toLowerCase().includes('photo/video')) {
                  b.click();
                  return;
                }
              }
            });
            await sleep(2000);
            fileInput = await page.$('input[type="file"][accept*="video"], input[type="file"][accept*="image"], input[type="file"]');
          }

          if (fileInput) {
            await fileInput.uploadFile(mediaPath);
            onProgress(isVideo ? 'Video attached! Waiting for Facebook to process video...' : 'Image attached successfully!');
            
            // For video, wait for upload bar/processing to complete (up to 90s)
            if (isVideo) {
              let videoReady = false;
              for (let v = 0; v < 30; v++) {
                await sleep(3000);
                const isReady = await page.evaluate(() => {
                  // Check if post button is enabled or if uploading progress is gone
                  const btns = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[aria-label="Post"]'));
                  for (const b of btns) {
                    if ((b.textContent || '').trim().toLowerCase() === 'post' || (b.getAttribute('aria-label') || '').trim().toLowerCase() === 'post') {
                      return b.getAttribute('aria-disabled') !== 'true';
                    }
                  }
                  return false;
                });
                if (isReady) {
                  videoReady = true;
                  break;
                }
                onProgress(`Processing video (${(v + 1) * 3}s elapsed)...`);
              }
            } else {
              await sleep(4000);
            }
          }
        } catch (mediaErr) {
          console.warn('Media upload warning:', mediaErr.message);
          onProgress(`Media upload notice: ${mediaErr.message}`);
        }
      }

      onProgress('Submitting post to Facebook...');
      await sleep(2000);

      // Click "Post" button
      const postSubmitted = await page.evaluate(() => {
        // Look within dialog or active page for Post button
        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[aria-label="Post"], div[role="button"]'));
        for (const btn of buttons) {
          const txt = (btn.textContent || '').trim().toLowerCase();
          const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
          if (txt === 'post' || aria === 'post' || txt === 'publish') {
            // Check if disabled
            if (btn.getAttribute('aria-disabled') === 'true') {
              return { error: 'Post button is currently disabled by Facebook (e.g. pending admin review or empty content).' };
            }
            btn.click();
            return { clicked: true };
          }
        }
        return { error: 'Post submit button could not be located in composer.' };
      });

      if (postSubmitted.error) {
        throw new Error(postSubmitted.error);
      }

      onProgress('Post submitted! Verifying publishing confirmation...');
      // Wait for dialog to close or progress completion
      await sleep(6000);

      onProgress('Post published successfully!');
      await browser.close();
      browser = null;

      return {
        success: true,
        timestamp: new Date().toISOString(),
        groupUrl: targetUrl,
        postTitle: postData.title,
        postContent: finalContent
      };
    } catch (err) {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
      throw err;
    }
  }
}

const fbAutomation = new FacebookAutomation();
module.exports = {
  FacebookAutomation,
  fbAutomation,
  parseSpintax,
  sleep,
  randomBetween
};
