import { Router } from "express";

/**
 * WhatsApp webhook routes (Phase 2+).
 * Mounted with raw body capture in index.js for signature verification.
 */
export const webhookRouter = Router();

webhookRouter.get("/", (_req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Webhook verification will be added in Phase 2",
  });
});

webhookRouter.post("/", (_req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Webhook message handling will be added in Phase 2",
  });
});
