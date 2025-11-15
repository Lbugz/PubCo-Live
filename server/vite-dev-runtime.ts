import { type Express } from "express";
import { type Server } from "http";
import { pathToFileURL } from "url";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  // Dynamic imports prevent esbuild from bundling vite into production
  const { createServer: createViteServer, createLogger } = await import("vite");
  
  // Load vite config dynamically using file URL to prevent static analysis
  const configPath = path.resolve(import.meta.dirname, "..", "vite.config.ts");
  const viteConfigModule = await import(pathToFileURL(configPath).href);
  const viteConfig = viteConfigModule.default;
  
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true as const,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg: string, options: any) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  
  // Import nanoid dynamically as well
  const { nanoid } = await import("nanoid");
  const fs = await import("fs");
  
  app.use("*", async (req, res, next) => {
    // Skip API routes - they should be handled by Express routes
    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }
    
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
