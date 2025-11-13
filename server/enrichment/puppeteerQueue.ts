import puppeteer, { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const COOKIES_FILE = path.join(process.cwd(), "spotify_cookies.json");

interface QueueTask {
  id: string;
  execute: (browser: Browser) => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
}

interface QueueConfig {
  maxConcurrency: number;
  minDelay: number; // Minimum delay between task starts (ms)
  browserPoolSize: number;
}

interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

class PuppeteerQueue {
  private queue: QueueTask[] = [];
  private activeTasks: number = 0;
  private browsers: Browser[] = [];
  private config: QueueConfig;
  private stats: QueueStats = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
    totalProcessed: 0,
  };
  private lastTaskStartTime: number = 0;
  private isProcessing: boolean = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency || 2,
      minDelay: config.minDelay || 500,
      browserPoolSize: config.browserPoolSize || 2,
    };
  }

  /**
   * Add a task to the queue
   */
  public async addTask<T>(
    id: string,
    execute: (browser: Browser) => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: QueueTask = {
        id,
        execute,
        resolve,
        reject,
        priority,
      };

      // Insert task in priority order (higher priority first)
      const insertIndex = this.queue.findIndex(t => t.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertIndex, 0, task);
      }

      this.stats.pending = this.queue.length;
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Get current queue statistics
   */
  public getStats(): QueueStats {
    return {
      ...this.stats,
      pending: this.queue.length,
      active: this.activeTasks,
    };
  }

  /**
   * Wait for queue to become idle (no pending or active tasks)
   */
  public async waitForIdle(): Promise<void> {
    while (this.queue.length > 0 || this.activeTasks > 0) {
      await this.wait(100);
    }
  }

  /**
   * Get or create a browser instance from the pool
   */
  private async getBrowser(): Promise<Browser> {
    // Return existing browser if available
    if (this.browsers.length > 0) {
      const browser = this.browsers[0];
      if (browser.isConnected()) {
        return browser;
      } else {
        // Remove disconnected browser
        this.browsers.shift();
      }
    }

    // Create new browser if pool not full
    if (this.browsers.length < this.config.browserPoolSize) {
      const browser = await this.launchBrowser();
      this.browsers.push(browser);
      return browser;
    }

    // Wait and retry if pool is full
    await this.wait(100);
    return this.getBrowser();
  }

  /**
   * Launch a new browser instance with proper configuration
   */
  private async launchBrowser(): Promise<Browser> {
    const chromiumPath = this.getChromiumPath();
    
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--window-size=1440,900",
      ],
      defaultViewport: { width: 1440, height: 900 },
    });

    return browser;
  }

  /**
   * Create a new page with cookies loaded
   */
  public async createPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Load cookies from secret or file
    try {
      let cookies;
      
      if (process.env.SPOTIFY_COOKIES_JSON) {
        cookies = JSON.parse(process.env.SPOTIFY_COOKIES_JSON);
      } else if (fs.existsSync(COOKIES_FILE)) {
        const cookiesString = fs.readFileSync(COOKIES_FILE, "utf8");
        cookies = JSON.parse(cookiesString);
      }

      if (cookies) {
        await page.setCookie(...cookies);
      }
    } catch (error) {
      console.warn("[PuppeteerQueue] Failed to load cookies:", error);
    }

    return page;
  }

  /**
   * Process tasks from the queue
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.queue.length > 0 || this.activeTasks > 0) {
      // Wait if at max concurrency
      if (this.activeTasks >= this.config.maxConcurrency) {
        await this.wait(100);
        continue;
      }

      // Check if we need to wait before starting next task
      const timeSinceLastStart = Date.now() - this.lastTaskStartTime;
      if (timeSinceLastStart < this.config.minDelay) {
        await this.wait(this.config.minDelay - timeSinceLastStart);
      }

      // Get next task
      const task = this.queue.shift();
      if (!task) {
        // No more tasks but some are still active
        if (this.activeTasks > 0) {
          await this.wait(100);
          continue;
        }
        break;
      }

      this.stats.pending = this.queue.length;
      this.lastTaskStartTime = Date.now();
      
      // Execute task (don't await - run concurrently)
      this.executeTask(task);
    }

    this.isProcessing = false;
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: QueueTask): Promise<void> {
    this.activeTasks++;
    this.stats.active = this.activeTasks;

    let browser: Browser | null = null;
    
    try {
      browser = await this.getBrowser();
      const result = await task.execute(browser);
      
      task.resolve(result);
      this.stats.completed++;
      this.stats.totalProcessed++;
    } catch (error) {
      task.reject(error);
      this.stats.failed++;
      this.stats.totalProcessed++;
    } finally {
      this.activeTasks--;
      this.stats.active = this.activeTasks;
    }
  }

  /**
   * Cleanup all browsers in the pool
   */
  public async cleanup(): Promise<void> {
    console.log(`[PuppeteerQueue] Cleaning up ${this.browsers.length} browser instances...`);
    
    await Promise.all(
      this.browsers.map(async (browser) => {
        try {
          if (browser.isConnected()) {
            await browser.close();
          }
        } catch (error) {
          console.warn("[PuppeteerQueue] Error closing browser:", error);
        }
      })
    );
    
    this.browsers = [];
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get system chromium path
   */
  private getChromiumPath(): string | undefined {
    try {
      const chromiumPath = execSync(
        "which chromium || which chromium-browser || which google-chrome",
        { encoding: "utf8" }
      ).trim();
      return chromiumPath || undefined;
    } catch (error) {
      return undefined;
    }
  }
}

// Global queue instance
let queueInstance: PuppeteerQueue | null = null;

/**
 * Get the global queue instance
 */
export function getQueue(config?: Partial<QueueConfig>): PuppeteerQueue {
  if (!queueInstance) {
    queueInstance = new PuppeteerQueue(config);
  }
  return queueInstance;
}

/**
 * Add a task to the global queue
 */
export async function addToQueue<T>(
  id: string,
  execute: (browser: Browser) => Promise<T>,
  priority: number = 0
): Promise<T> {
  const queue = getQueue();
  return queue.addTask(id, execute, priority);
}

/**
 * Get queue status
 */
export function getQueueStatus(): QueueStats {
  const queue = getQueue();
  return queue.getStats();
}

/**
 * Wait for queue to drain (all tasks complete)
 */
export async function waitForQueueIdle(): Promise<void> {
  if (queueInstance) {
    await queueInstance.waitForIdle();
  }
}

/**
 * Cleanup queue resources
 */
export async function cleanupQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.cleanup();
    queueInstance = null;
  }
}
