// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import type { NetworkEntry, RawAXNode } from "./types.ts";

interface CDPTargetInfo {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export async function fetchLiveCDPAXTree(
  cdpEndpoint = "http://127.0.0.1:9222",
  navigateUrl?: string,
): Promise<{
  pageUrl: string;
  nodes: RawAXNode[];
  network: NetworkEntry[];
  selectors: Record<number, string>;
}> {
  const baseUrl = cdpEndpoint.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/json/list`);
  if (!res.ok) {
    throw new Error(`Failed to query CDP target list at ${baseUrl}/json/list (HTTP ${res.status})`);
  }

  const targets = (await res.json()) as CDPTargetInfo[];
  const pageCandidates = targets.filter(
    (t) => t.type === "page" && t.webSocketDebuggerUrl && !t.url.startsWith("devtools://"),
  );
  const pageTarget =
    pageCandidates.find((t) => !t.url.startsWith("chrome://") && t.url !== "about:blank") ??
    pageCandidates[0];

  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error(`No inspectable page target with webSocketDebuggerUrl found on ${baseUrl}`);
  }

  const wsUrl = pageTarget.webSocketDebuggerUrl;
  return await new Promise<{
    pageUrl: string;
    nodes: RawAXNode[];
    network: NetworkEntry[];
    selectors: Record<number, string>;
  }>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const networkMap = new Map<string, NetworkEntry>();
    const selectors: Record<number, string> = {};
    let resolvedNodes: RawAXNode[] = [];
    let pendingDesc = 0;
    let treeReceived = false;

    const timer = setTimeout(() => {
      ws.close();
      if (treeReceived) {
        resolve({
          pageUrl: navigateUrl ?? pageTarget.url,
          nodes: resolvedNodes,
          network: Array.from(networkMap.values()),
          selectors,
        });
      } else {
        reject(new Error(`CDP WebSocket timeout after 22000ms (${wsUrl})`));
      }
    }, 22000);

    function finish() {
      clearTimeout(timer);
      ws.close();
      resolve({
        pageUrl: navigateUrl ?? pageTarget.url,
        nodes: resolvedNodes,
        network: Array.from(networkMap.values()),
        selectors,
      });
    }

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Accessibility.enable", params: {} }));
      ws.send(JSON.stringify({ id: 3, method: "Network.enable", params: {} }));
      ws.send(JSON.stringify({ id: 4, method: "DOM.enable", params: {} }));
      if (navigateUrl) {
        ws.send(JSON.stringify({ id: 10, method: "Page.enable", params: {} }));
        ws.send(JSON.stringify({ id: 11, method: "Page.navigate", params: { url: navigateUrl } }));
      } else {
        ws.send(JSON.stringify({ id: 2, method: "Accessibility.getFullAXTree", params: {} }));
      }
    });

    let requestedTree = !navigateUrl;
    let navCleared = !navigateUrl;

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          method?: string;
          params?: Record<string, unknown>;
          result?: {
            nodes?: RawAXNode[];
            node?: {
              nodeName?: string;
              localName?: string;
              attributes?: string[];
            };
          };
          error?: { message?: string };
        };

        if (msg.method === "Page.frameNavigated" && msg.params) {
          const frame = msg.params.frame as { parentId?: string } | undefined;
          if (!frame?.parentId && !navCleared) {
            navCleared = true;
          }
          return;
        }

        if (msg.method === "Network.requestWillBeSent" && msg.params) {
          const reqId = String(msg.params.requestId ?? "");
          const req = msg.params.request as { url?: string; method?: string } | undefined;
          const resType = String(msg.params.type ?? "Other");
          if (resType === "Document" && !navCleared && navigateUrl && req?.url?.startsWith("http")) {
            networkMap.clear();
            navCleared = true;
          }
          if (req?.url) {
            networkMap.set(reqId, {
              url: req.url,
              method: req.method ?? "GET",
              resourceType: resType,
            });
          }
          return;
        }

        if (msg.method === "Network.responseReceived" && msg.params) {
          const reqId = String(msg.params.requestId ?? "");
          const resp = msg.params.response as
            | { url?: string; headers?: Record<string, string> }
            | undefined;
          const resType = String(msg.params.type ?? "Other");
          const existing = networkMap.get(reqId);
          if (existing && resp?.headers) {
            existing.responseHeaders = resp.headers;
          } else if (resp?.url) {
            networkMap.set(reqId, {
              url: resp.url,
              resourceType: resType,
              responseHeaders: resp.headers,
            });
          }
          return;
        }

        if (navigateUrl && !requestedTree && msg.method === "Page.loadEventFired") {
          requestedTree = true;
          setTimeout(() => {
            ws.send(JSON.stringify({ id: 2, method: "Accessibility.getFullAXTree", params: {} }));
          }, 2200);
          return;
        }

        if (msg.id === 2) {
          if (msg.error) {
            clearTimeout(timer);
            ws.close();
            reject(new Error(`CDP Accessibility.getFullAXTree error: ${msg.error.message}`));
            return;
          }
          treeReceived = true;
          resolvedNodes = msg.result?.nodes ?? [];

          // Collect unique backendDOMNodeIds for interactive / image / ignored-focusable candidates
          const candidateIds = new Set<number>();
          for (const n of resolvedNodes) {
            if (n.backendDOMNodeId) {
              const r = String(n.role?.value ?? "").toLowerCase();
              const name = String(n.name?.value ?? "").trim();
              if (
                (!name && (r === "button" || r === "link" || r === "textbox" || r === "searchbox" || r === "combobox" || r === "checkbox" || r === "radio" || r === "switch" || r === "slider" || r === "menuitem" || r === "tab" || r === "image" || r === "img")) ||
                (n.ignored && r !== "generic" && r !== "none" && r !== "inlinetextbox") ||
                (r === "link" && (name.toLowerCase() === "click here" || name.toLowerCase() === "here" || name.toLowerCase() === "read more" || name.toLowerCase() === "more" || name.toLowerCase() === "link" || name.toLowerCase() === "learn more")) ||
                r === "heading"
              ) {
                if (candidateIds.size < 200) {
                  candidateIds.add(n.backendDOMNodeId);
                }
              }
            }
          }

          if (candidateIds.size === 0) {
            finish();
            return;
          }

          pendingDesc = candidateIds.size;
          for (const bid of candidateIds) {
            ws.send(
              JSON.stringify({
                id: 100000 + bid,
                method: "DOM.describeNode",
                params: { backendNodeId: bid, depth: 0 },
              }),
            );
          }
          return;
        }

        if (msg.id && msg.id >= 100000) {
          const bid = msg.id - 100000;
          const nodeInfo = msg.result?.node;
          if (nodeInfo) {
            const tag = (nodeInfo.localName || nodeInfo.nodeName || "element").toLowerCase();
            const attrs = nodeInfo.attributes ?? [];
            let idVal = "";
            let clsVal = "";
            let hrefVal = "";
            let srcVal = "";
            let ariaLabel = "";
            for (let i = 0; i < attrs.length; i += 2) {
              const k = attrs[i];
              const v = attrs[i + 1] ?? "";
              if (k === "id") idVal = v;
              else if (k === "class") clsVal = v.trim().split(/\s+/).slice(0, 2).join(".");
              else if (k === "href") hrefVal = v.slice(0, 45);
              else if (k === "src") srcVal = v.slice(0, 45);
              else if (k === "aria-label") ariaLabel = v.slice(0, 30);
            }
            let sel = tag;
            if (idVal) sel += `#${idVal}`;
            else if (clsVal) sel += `.${clsVal}`;
            if (hrefVal && !idVal) sel += `[href="${hrefVal}"]`;
            else if (srcVal && !idVal && !clsVal) sel += `[src="${srcVal}"]`;
            else if (ariaLabel) sel += `[aria-label="${ariaLabel}"]`;
            selectors[bid] = sel;
          }
          pendingDesc--;
          if (pendingDesc <= 0) {
            finish();
          }
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
