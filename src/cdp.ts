// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import type { RawAXNode } from "./types.ts";

interface CDPTargetInfo {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export async function fetchLiveCDPAXTree(
  cdpEndpoint = "http://127.0.0.1:9222",
): Promise<{ pageUrl: string; nodes: RawAXNode[] }> {
  const baseUrl = cdpEndpoint.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/json/list`);
  if (!res.ok) {
    throw new Error(`Failed to query CDP target list at ${baseUrl}/json/list (HTTP ${res.status})`);
  }

  const targets = (await res.json()) as CDPTargetInfo[];
  const pageTarget = targets.find(
    (t) => t.type === "page" && t.webSocketDebuggerUrl && !t.url.startsWith("devtools://"),
  );

  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error(`No inspectable page target with webSocketDebuggerUrl found on ${baseUrl}`);
  }

  const wsUrl = pageTarget.webSocketDebuggerUrl;
  return await new Promise<{ pageUrl: string; nodes: RawAXNode[] }>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`CDP WebSocket timeout after 8000ms (${wsUrl})`));
    }, 8000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Accessibility.enable", params: {} }));
      ws.send(JSON.stringify({ id: 2, method: "Accessibility.getFullAXTree", params: {} }));
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: { nodes?: RawAXNode[] };
          error?: { message?: string };
        };
        if (msg.id === 2) {
          clearTimeout(timer);
          ws.close();
          if (msg.error) {
            reject(new Error(`CDP Accessibility.getFullAXTree error: ${msg.error.message}`));
            return;
          }
          resolve({
            pageUrl: pageTarget.url,
            nodes: msg.result?.nodes ?? [],
          });
        }
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });

    ws.addEventListener("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`CDP WebSocket connection error: ${String(err)}`));
    });
  });
}
