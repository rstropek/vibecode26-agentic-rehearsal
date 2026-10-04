// Sindi's model, its own module so tests can mock it: the same OpenRouter model as Lissie, from the web app's .env
// (see the dev script in package.json).
export const sindiModel = `openrouter/${process.env.OPENROUTER_MODEL || "z-ai/glm-5.3-flash"}`;
