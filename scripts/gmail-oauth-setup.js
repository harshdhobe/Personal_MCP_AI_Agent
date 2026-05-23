/**
 * One-time OAuth 2.0 setup for Gmail API.
 * Starts a local HTTP server on GMAIL_OAUTH_REDIRECT_URI, opens the auth URL,
 * exchanges the code for tokens, and prints GMAIL_REFRESH_TOKEN for .env
 *
 * Usage: node scripts/gmail-oauth-setup.js
 *
 * Prerequisites:
 * - Google Cloud OAuth client (Web) with redirect URI matching GMAIL_OAUTH_REDIRECT_URI
 * - Recommended redirect: http://127.0.0.1:8844/oauth/callback (avoids clashing with PORT=3000)
 */

import dotenv from "dotenv";
import http from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

dotenv.config();

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    throw new Error(`Missing ${name} in .env`);
  }
  return v.trim();
}

function parseListenTarget(redirectUri) {
  const u = new URL(redirectUri);
  const pathname = u.pathname || "/";
  let port = u.port ? Number.parseInt(u.port, 10) : NaN;
  if (!Number.isFinite(port)) {
    port = u.protocol === "https:" ? 443 : 80;
  }
  const host = u.hostname === "localhost" ? "127.0.0.1" : u.hostname;
  return { host, port, pathname };
}

async function main() {
  const clientId = requireEnv("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_OAUTH_CLIENT_SECRET");
  const redirectUri = requireEnv("GMAIL_OAUTH_REDIRECT_URI");

  const { host, port, pathname } = parseListenTarget(redirectUri);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1. Add this redirect URI to your Google OAuth client (if not already):");
  console.log(`   ${redirectUri}\n`);
  console.log("2. Open this URL in your browser and sign in:\n");
  console.log(authUrl);
  console.log("\nWaiting for redirect (Ctrl+C to cancel)…\n");

  const tokens = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.method !== "GET") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
        if (reqUrl.pathname !== pathname) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const err = reqUrl.searchParams.get("error");

        if (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<p>Authorization error: ${err}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${err}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<p>No authorization code received.</p>");
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<p>Success. You can close this tab and return to the terminal.</p>"
        );

        server.close();
        resolve(tokens);
      } catch (e) {
        try {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Server error");
        } catch {
          /* ignore */
        }
        server.close();
        reject(e);
      }
    });

    server.on("error", reject);
    server.listen(port, host, () => {
      console.log(`Listening at http://${host}:${port}${pathname}`);
    });
  });

  const refresh = tokens.refresh_token;
  if (!refresh) {
    console.error(
      "\nNo refresh_token returned. Revoke app access in Google Account settings and run again with prompt=consent (already set), or use a different Google account.\n"
    );
    process.exit(1);
  }
  console.log("\n--- Add to your .env ---\n");
  console.log(`GMAIL_REFRESH_TOKEN=${refresh}`);
  console.log("\n--- End ---\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
