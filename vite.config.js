import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Standalone experiment entry. Existing messenger routes keep their SPA behavior.
function labRoute(server) {
  server.middlewares.use((req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (["/motion-lab", "/motion-lab/"].includes(url.pathname))
      req.url = `/motion-lab.html${url.search}`;
    next();
  });
}

export default defineConfig({
  plugins: [
    {
      name: "standalone-motion-lab",
      configureServer: labRoute,
      configurePreviewServer: labRoute,
    },
  ],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        motionLab: fileURLToPath(new URL("./motion-lab.html", import.meta.url)),
      },
    },
  },
});
