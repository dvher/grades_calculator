import type { FastifyPluginAsync } from "fastify";
import { getUser, toUser } from "../users.js";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => toUser(await getUser(app.pool, req.user.sub)));
};
