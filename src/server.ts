import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch(request: Request) {
    return fetch(request);
  },
};
