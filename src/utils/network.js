/**
 * WSL / dual-stack: prefer IPv4 for Telegram and other outbound HTTPS.
 */
import dns from "node:dns";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
