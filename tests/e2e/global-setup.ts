import { createServer } from "node:http";

// Loopback stand-in for graph.facebook.com so outbound sends can be observed in E2E.
export default async function globalSetup() {
  const sent: unknown[] = [];
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/__sent") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(sent));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { sent.push(JSON.parse(body)); } catch { /* ignore */ }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messages: [{ id: `wamid.E2E.${sent.length}` }] }));
    });
  });
  await new Promise<void>((r) => server.listen(4545, "127.0.0.1", r));
  return async () => new Promise<void>((r) => server.close(() => r()));
}
