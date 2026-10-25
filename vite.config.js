import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

function pitchRoute(server) {
  server.middlewares.use((req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (["/pitch-demo", "/pitch-demo/"].includes(url.pathname))
      req.url = `/pitch-demo.html${url.search}`;
    next();
  });
}

export default defineConfig({
  plugins: [
    {
      name: "scripted-pitch-route",
      configureServer: pitchRoute,
      configurePreviewServer: pitchRoute,
    },
  ],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        pitchDemo: fileURLToPath(new URL("./pitch-demo.html", import.meta.url)),
      },
    },
  },
});
