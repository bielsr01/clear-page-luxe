import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch(request: Request, env: unknown, ctx: unknown) {
    return fetch(request, env, ctx);
  },
};
