import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DeFiAgent } from './core/agent.js';
import { onRequest } from 'firebase-functions/v2/https';
import 'dotenv/config';

// Validate critical environment variables
if (!process.env.WALLET_MNEMONIC) {
  console.warn('  WARNING: WALLET_MNEMONIC not set in environment. A temporary wallet will be generated.');
}
if (!process.env.GROQ_API_KEY) {
  console.error('  CRITICAL: GROQ_API_KEY not set. AI features will fail.');
}
import { createLogger, errorLoggingMiddleware, requestLoggingMiddleware } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Robust CORS configuration for Render / Railway backends communicating with Firebase frontend
const corsOptions = {
  origin: [
    'https://yieldkernel-app.web.app',
    'https://yieldkernel.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5173',
    '*' // Allow all as fallback
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder', 'Origin', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

const log = createLogger({ service: 'yieldkernel-api' });
app.use(requestLoggingMiddleware(log));

let agentInstance = null;
let agentInitializationPromise = null;
let backgroundMonitoringInterval = null;

async function getAgent() {
  if (agentInstance) return agentInstance;

  if (agentInitializationPromise) {
    return agentInitializationPromise;
  }

  agentInitializationPromise = (async () => {
    log.info('agent.init.start');
    try {
      const agent = new DeFiAgent();
      await agent.initialize();
      agentInstance = agent;
      log.info('agent.init.ready');

      // Start background monitoring if not already running
      if (!backgroundMonitoringInterval) {
        startBackgroundMonitoring();
      }

      return agentInstance;
    } catch (error) {
      log.error('agent.init.failed', { error: { name: error?.name, message: error?.message, stack: error?.stack } });
      agentInitializationPromise = null; // Allow retry on next call
      throw error;
    }
  })();

  return agentInitializationPromise;
}

// Background autonomous monitoring - runs every 24 hours regardless of client connections
async function startBackgroundMonitoring() {
  log.info('background.monitor.start', { interval: '86400s (24 hours)' });

  const runMonitoringCycle = async () => {
    try {
      if (!agentInstance || !agentInstance.monitor) {
        log.warn('background.monitor.skip', { reason: 'agent_not_ready' });
        return;
      }

      log.info('background.monitor.cycle.start');
      const snapshot = await agentInstance.monitor.checkPortfolio();

      const yields = snapshot?.yields || [];
      const positions = snapshot?.positions || [];
      const rebalance = snapshot?.rebalanceOpportunity || null;

      log.info('background.monitor.cycle.complete', {
        positions: positions.length,
        opportunities: yields.length,
        shouldRebalance: rebalance?.shouldRebalance || false,
        apyImprovement: rebalance?.apyImprovement || 0
      });

      // If rebalancing is recommended and within risk parameters, log it
      if (rebalance?.shouldRebalance && rebalance?.withinRiskParameters) {
        log.warn('background.monitor.rebalance.opportunity', {
          currentAPY: rebalance.currentAPY,
          optimalAPY: rebalance.optimalAPY,
          improvement: rebalance.apyImprovement
        });
      }
    } catch (error) {
      log.error('background.monitor.cycle.error', {
        error: { name: error?.name, message: error?.message }
      });
    }
  };

  // Run immediately on startup
  await runMonitoringCycle();

  // Then run every 24 hours
  backgroundMonitoringInterval = setInterval(runMonitoringCycle, 86400000); // 24 hours

  log.info('background.monitor.scheduled', { nextRun: new Date(Date.now() + 86400000).toISOString() });
}

function explorerTxUrl(chainId, txHash) {
  const id = Number(chainId);
  const bases = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    5: 'https://goerli.etherscan.io',
    137: 'https://polygonscan.com',
    80001: 'https://mumbai.polygonscan.com',
    10: 'https://optimistic.etherscan.io',
    42161: 'https://arbiscan.io',
    8453: 'https://basescan.org',
    43114: 'https://snowtrace.io'
  };
  const base = bases[id] || bases[1];
  return `${base}/tx/${txHash}`;
}

function strip0x(hex) {
  return String(hex || '').startsWith('0x') ? String(hex).slice(2) : String(hex || '');
}

function pad32(hexNo0x) {
  return String(hexNo0x || '').padStart(64, '0');
}

function encodeAddress(address) {
  const a = String(address || '');
  if (!a.startsWith('0x') || a.length !== 42) throw new Error(`Invalid address: ${address}`);
  return pad32(strip0x(a).toLowerCase());
}

function encodeUint256(value) {
  const v = BigInt(value);
  return pad32(v.toString(16));
}

function toBaseUnits(amount, decimals) {
  const amtStr = String(amount ?? '').trim();
  if (!amtStr) throw new Error('Amount is required');
  const [integer, fractional = ''] = amtStr.split('.');
  const truncatedFractional = fractional.slice(0, decimals).padEnd(decimals, '0');
  const combined = `${integer}${truncatedFractional}`.replace(/^0+/, '') || '0';
  return BigInt(combined);
}

function encodeErc20Approve(spender, amount) {
  const selector = '095ea7b3';
  return `0x${selector}${encodeAddress(spender)}${encodeUint256(amount)}`;
}

function encodeErc20Allowance(owner, spender) {
  const selector = 'dd62ed3e';
  return `0x${selector}${encodeAddress(owner)}${encodeAddress(spender)}`;
}

function encodeAaveSupply(asset, amount, onBehalfOf, referralCode = 0) {
  const selector = '617ba037';
  const assetEnc = encodeAddress(asset);
  const amountEnc = encodeUint256(amount);
  const onBehalfEnc = encodeAddress(onBehalfOf);
  const referralEnc = pad32(BigInt(referralCode).toString(16));
  return `0x${selector}${assetEnc}${amountEnc}${onBehalfEnc}${referralEnc}`;
}

function resolveAavePoolAddress(chainId) {
  const id = Number(chainId);
  const pools = {
    1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  };
  const addr = pools[id];
  if (!addr) throw new Error(`Unsupported chainId for Aave pool: ${chainId}`);
  return addr;
}

// API for network status check
app.get('/api/status', async (req, res) => {
  try {
    const agent = await getAgent();
    const wdk = agent.walletManager.getRuntimeStatus();
    const address = await agent.walletManager.wallet.getAddress();
    const addressPresent = Boolean(address);

    const start = Date.now();
    const rpcRes = await fetch(wdk.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 })
    });
    const rpcJson = await rpcRes.json();
    const blockNumber = rpcJson?.result ? parseInt(rpcJson.result, 16) : null;
    const latencyMs = Date.now() - start;

    const isReady = addressPresent && Number.isFinite(blockNumber);
    req.log.info('status.check', { isReady, addressPresent, chainId: wdk.chainId, blockNumber });
    res.json({
      status: isReady ? 'operational' : 'degraded',
      network: 'Ethereum Mainnet',
      latency: `${latencyMs}ms`,
      recheck_cycle: '86400s',
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
      blockNumber,
      wdk
    });
  } catch (err) {
    req.log.error('status.error', { error: { name: err?.name, message: err?.message } });
    res.status(200).json({ status: 'offline', error: err.message });
  }
});

app.get('/api/version', (req, res) => {
  res.json({
    ok: true,
    service: 'yieldkernel-api',
    node: process.version,
    deployedAt: new Date().toISOString(),
    commit: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null
  });
});

// API to get current yields
app.get('/api/yields', async (req, res) => {
  try {
    const agent = await getAgent();
    const yields = await agent.defiManager.getAvailableYields();
    const enriched = (Array.isArray(yields) ? yields : []).map((y) => {
      // Safely assess risk, fallback to null if riskManager not available
      let risk = null;
      try {
        if (agent.riskManager && typeof agent.riskManager.assessYieldOpportunity === 'function') {
          risk = agent.riskManager.assessYieldOpportunity(y);
        }
      } catch (riskErr) {
        req.log.warn('risk.assessment.failed', { asset: y.asset, error: riskErr.message });
      }

      return {
        ...y,
        riskScore: risk?.score?.total ?? null,
        riskRecommendation: risk?.recommendation ?? null
      };
    });
    req.log.info('yields.get', { count: enriched.length });
    res.json(enriched);
  } catch (err) {
    req.log.error('yields.error', { error: { name: err?.name, message: err?.message, stack: err?.stack } });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const agent = await getAgent();
    const portfolio = await agent.defiManager.getPortfolio();
    req.log.info('portfolio.get', { positions: Array.isArray(portfolio?.positions) ? portfolio.positions.length : 0 });
    res.json(portfolio);
  } catch (err) {
    req.log.error('portfolio.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invest/prepare', async (req, res) => {
  try {
    const agent = await getAgent();

    const asset = String(req.body?.asset || 'USDT').toUpperCase();
    const amount = String(req.body?.amount || process.env.MAX_POSITION_SIZE_USDT || '1000');
    const from = String(req.body?.from || '');
    if (!from) return res.status(400).json({ ok: false, error: 'Missing from address' });

    const yields = await agent.defiManager.getAvailableYields();
    const best = (Array.isArray(yields) ? yields : [])
      .filter(y => String(y.asset || '').toUpperCase() === asset)
      .sort((a, b) => Number(b.supplyAPY || 0) - Number(a.supplyAPY || 0))[0];

    if (!best) return res.json({ ok: false, error: `No yield opportunities found for ${asset}` });

    const risk = agent.riskManager.assessYieldOpportunity(best);
    if (risk.recommendation === 'REJECT') return res.json({ ok: false, error: `Risk assessment failed: ${risk.reason}`, risk });

    const chainId = Number(process.env.CHAIN_ID || 1);
    const poolAddress = resolveAavePoolAddress(chainId);
    const tokenAddress = best.assetAddress;
    if (!tokenAddress) throw new Error(`Token address not found for ${asset}`);

    const decimals = asset === 'USDT' || asset === 'USDC' ? 6 : 18;
    const amountBaseUnits = toBaseUnits(amount, decimals);

    const approveData = encodeErc20Approve(poolAddress, amountBaseUnits);
    const allowanceData = encodeErc20Allowance(from, poolAddress);
    const supplyData = encodeAaveSupply(tokenAddress, amountBaseUnits, from, 0);

    res.json({
      ok: true,
      chainId,
      asset,
      amount,
      amountBaseUnits: amountBaseUnits.toString(),
      tokenAddress,
      poolAddress,
      bestOpportunity: best,
      risk,
      approveTx: { from, to: tokenAddress, data: approveData, value: '0x0' },
      allowanceCall: { to: tokenAddress, data: allowanceData },
      supplyTx: { from, to: poolAddress, data: supplyData, value: '0x0' }
    });
  } catch (err) {
    req.log.error('invest.prepare.error', { error: { name: err?.name, message: err?.message, stack: err?.stack } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// SSE: Live autonomous agent monitor stream — demonstrates zero-human-input operation
app.get('/api/monitor/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const agent = await getAgent();
  let cycle = 0;
  req.log.info('monitor.stream.open');

  const sendEvent = async () => {
    try {
      cycle++;
      const snapshot = await agent.monitor.checkPortfolio();
      const yields = snapshot?.yields || [];
      const positions = snapshot?.positions || [];
      const riskReport = snapshot?.riskReport || null;
      const rebalance = snapshot?.rebalanceOpportunity || null;
      const varAnalysis = snapshot?.varAnalysis || null;

      const best = (Array.isArray(yields) ? yields : []).sort((a, b) => Number(b.supplyAPY || b.totalAPY || 0) - Number(a.supplyAPY || a.totalAPY || 0))[0] || null;
      const bestRisk = best ? agent.riskManager.assessYieldOpportunity(best) : null;

      const amount = String(process.env.MAX_POSITION_SIZE_USDT || 1000);
      const gasEst = best ? await agent.defiManager.estimateGas('supply', { protocol: best.protocol, asset: best.asset, amount }).catch(() => null) : null;

      const decisions = [
        `[OBSERVE] Cycle #${cycle}: positions=${positions.length} opportunities=${yields.length}`,
        best ? `[ANALYZE] Best opportunity: ${best.protocol} ${best.asset} at ${best.supplyAPY}% APY | Risk: ${bestRisk?.recommendation} (${bestRisk?.score?.total}/100)` : `[ANALYZE] No opportunities available`,
        gasEst ? `[ECONOMICS] Gas estimate: ${gasEst.estimatedCostUSD ? `$${gasEst.estimatedCostUSD}` : `${gasEst.estimatedCostETH} ETH`}` : `[ECONOMICS] Gas estimate: unavailable`,
        rebalance?.shouldRebalance ? `[DECIDE] REBALANCE suggested | ΔAPY=${rebalance.apyImprovement}% | withinRisk=${rebalance.withinRiskParameters}` : `[DECIDE] HOLD`,
        varAnalysis ? `[RISK] VaR95=${Number(varAnalysis.varPercentage).toFixed(2)}% | level=${varAnalysis.riskLevel}` : `[RISK] VaR unavailable`,
        riskReport?.recommendations?.length ? `[REPORT] ${riskReport.recommendations.join(' | ')}` : `[REPORT] Portfolio nominal`
      ];

      const event = {
        cycle,
        timestamp: new Date().toISOString(),
        decisions,
        bestOpportunity: best,
        gasEstimate: gasEst,
        riskReport,
        rebalance,
        varAnalysis
      };

      res.write(`data: ${JSON.stringify(event)}\n\n`);
      req.log.info('monitor.stream.tick', { cycle, bestAsset: best?.asset, bestApy: best?.supplyAPY });
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      req.log.error('monitor.stream.error', { cycle, error: { name: err?.name, message: err?.message } });
    }
  };

  // Send immediately then every 24 hours (86400 seconds)
  await sendEvent();
  const interval = setInterval(sendEvent, 86400000); // 24 hours in milliseconds

  req.on('close', () => {
    clearInterval(interval);
    res.end();
    req.log.info('monitor.stream.close', { cyclesSent: cycle });
  });
});

app.use(express.static(join(__dirname, '..', 'public')));


// API to execute investment via AI chat
app.post('/api/invest', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'This endpoint is deprecated. Use wallet-signed flow.',
    ai_response: 'This deployment requires the user wallet to sign transactions. Use POST /api/invest/prepare then send approve+supply via MetaMask.',
    details: {
      replacement: '/api/invest/prepare',
      requiredClientMethods: ['eth_call', 'eth_sendTransaction'],
      note: 'Server-side signing is disabled in production.'
    }
  });

  try {
    const agent = await getAgent();

    const asset = String(req.body?.asset || 'USDT').toUpperCase();
    const amount = String(req.body?.amount || process.env.MAX_POSITION_SIZE_USDT || '1000');

    req.log.info('invest.request', { asset, amount });

    // Get yields and assess risk first
    const yields = await agent.defiManager.getAvailableYields();
    const best = (Array.isArray(yields) ? yields : [])
      .filter(y => String(y.asset || '').toUpperCase() === asset)
      .sort((a, b) => Number(b.supplyAPY || 0) - Number(a.supplyAPY || 0))[0];

    if (!best) {
      return res.json({
        ok: false,
        error: `No yield opportunities found for ${asset}`,
        ai_response: `I couldn't find any yield opportunities for ${asset} on available protocols.`
      });
    }

    // Assess risk
    const risk = agent.riskManager.assessYieldOpportunity(best);

    if (risk.recommendation === 'REJECT') {
      return res.json({
        ok: false,
        error: `Risk assessment failed: ${risk.reason}`,
        ai_response: `I cannot recommend this investment due to risk concerns: ${risk.reason}`
      });
    }

    // Get gas estimate
    const gasEst = await agent.defiManager.estimateGas('supply', { asset, amount }).catch(() => null);

    // Execute the supply transaction using WDK
    req.log.info('invest.execute', { asset, amount, protocol: best.protocol, gasEstimate: gasEst });
    const result = await agent.defiManager.supplyToAave(asset, amount);

    req.log.info('invest.success', { asset, amount, hash: result.hash, fee: result.fee.toString() });
    res.json({
      ok: true,
      ai_response: `Successfully supplied ${amount} ${asset} to Aave V3. Transaction: ${result.hash}`,
      result: {
        hash: result.hash,
        fee: result.fee.toString(),
        asset,
        amount,
        protocol: 'aave-v3',
        apy: best.supplyAPY,
        riskScore: risk.score.total
      },
      blockExplorer: `https://etherscan.io/tx/${result.hash}`,
      economics: {
        asset,
        amount,
        apy: best.supplyAPY,
        gasFeesETH: (Number(result.fee) / 1e18).toFixed(6),
        gasFeesUSD: ((Number(result.fee) / 1e18) * 3000).toFixed(2),
        projectedYearlyYield: (Number(amount) * best.supplyAPY / 100).toFixed(2)
      }
    });
  } catch (err) {
    req.log.error('invest.error', { error: { name: err?.name, message: err?.message, stack: err?.stack } });
    res.status(500).json({
      ok: false,
      error: err.message,
      ai_response: `Error executing investment: ${err.message}`,
      details: err.message
    });
  }
});

app.use(errorLoggingMiddleware(log));

export const api = onRequest({
  region: 'us-central1'
}, app);

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  app.listen(port, async () => {
    log.info('server.listen', { port: Number(port) });

    // Initialize agent and start background monitoring on server startup
    try {
      await getAgent();
      log.info('server.startup.complete', { backgroundMonitoring: 'active' });
    } catch (error) {
      log.error('server.startup.agent_init_failed', {
        error: { name: error?.name, message: error?.message }
      });
    }
  });
}
