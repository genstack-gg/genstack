import {
  type Client,
  type ConnectRouter,
  type ConnectRouterOptions,
  type Transport,
  createClient,
  createConnectRouter,
  createRouterTransport,
} from "@connectrpc/connect";
import { type ConnectTransportOptions, createConnectTransport } from "@connectrpc/connect-web";
import type { CommonTransportOptions } from "@connectrpc/connect/protocol";
import { DatabaseService } from "@genstack.js/protocol/model/api/v1/db";

// Default target for API calls.
export const apiTargetDefault = "http://localhost:8000";

/**
 * Create a `fetch`-based transport for RPC client use.
 *
 * @param baseUrl Base URL to use for this transport; if none is provided, a default is used.
 * @returns Web-style (`fetch`) transport which uses the provided base URL.
 */
export function createWebTransport(baseUrl?: string, opts?: Partial<ConnectTransportOptions>): Transport {
  if (baseUrl) {
    // parse as a URL
    new URL(baseUrl);
  }
  return createConnectTransport({
    ...(opts || {}),
    baseUrl: baseUrl || apiTargetDefault,
  });
}

/**
 * Create an in-memory dispatcher for RPC client use.
 *
 * When dispatching in-memory, a router factory is required, as an implementation is needed to route
 * RPCs to.
 *
 * @param routes Router implementation
 * @param opts Options to apply at the transport layer
 * @param router Options to apply at the router layer
 * @returns In-memory transport
 */
export function createInMemoryTransport(
  routes: (router: ConnectRouter) => void,
  opts?: Partial<CommonTransportOptions>,
  router?: Partial<ConnectRouterOptions>,
): Transport {
  return createRouterTransport(routes, {
    transport: opts || {},
    router: router || {},
  });
}

/**
 * Create a Connect router, which routes RPCs to services.
 *
 * @returns Connect router instance
 */
export function createRouter(): ConnectRouter {
  return createConnectRouter({});
}

/**
 * Create a client for use with the Genstack `DatabaseService`; the database service provides
 * generic data storage facilities.
 *
 * @param transport Transport to use for RPC calls
 * @returns Client for the `DatabaseService`
 */
export function databaseClient(transport: Transport): Client<typeof DatabaseService> {
  return createClient(DatabaseService, transport);
}
