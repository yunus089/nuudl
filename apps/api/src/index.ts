import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

const start = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port, host });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

void start();
