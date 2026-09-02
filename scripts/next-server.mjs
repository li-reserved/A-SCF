#!/usr/bin/env node
import http from 'node:http';
import next from 'next';
import { handleRequest as handleFundFlowRequest } from './fund-flow-proxy.mjs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '127.0.0.1';
const port = Number(process.env.PORT || process.env.FUND_FLOW_PORT || 5177);
process.env.NEXT_DIST_DIR = dev ? `.next-dev/${port}` : '.next';
const app = next({ dev, hostname, port });
const handleNextRequest = app.getRequestHandler();

await app.prepare();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || hostname}`);
  if (url.pathname.startsWith('/api/')) {
    await handleFundFlowRequest(req, res);
    return;
  }
  await handleNextRequest(req, res);
});

server.listen(port, hostname, () => {
  console.log(`A股资金流向 Next.js 工作台已启动：http://${hostname}:${port}`);
});
