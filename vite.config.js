import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        terms: resolve(__dirname, "terms.html"),
        products: resolve(__dirname, "products.html"),
        checkout: resolve(__dirname, "checkout.html"),
      },
    },
  },
});
