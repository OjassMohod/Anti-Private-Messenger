// Runs the same API handlers used by Vercel alongside Vite. No account linking needed.
import { createServer, loadEnv } from "vite";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const routes = {
  "/api/challenge": (await import("../api/challenge.js")).default,
  "/api/send": (await import("../api/send.js")).default,
};
const server = await createServer({
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 5173),
    strictPort: true,
  },
  plugins: [
    {
      name: "local-vercel-functions",
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          const handler = routes[new URL(req.url, "http://localhost").pathname];
          if (!handler) return next();
          handler(req, res).catch(() => {
            if (!res.headersSent)
              res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unexpected server error." }));
          });
        });
      },
    },
  ],
});
await server.listen();
server.printUrls();
