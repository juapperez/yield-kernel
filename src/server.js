import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DeFiAgent } from './core/agent.js';
import { onRequest } from 'firebase-functions/v2/https';
import 'dotenv/config';
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
async function getAgent() {
  if (!agentInstance) {
    log.info('agent.init.start');
    agentInstance = new DeFiAgent();
    await agentInstance.initialize();
    log.info('agent.init.ready');
  }
  return agentInstance;
}

const intentStore = new Map();

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function createIntent({ action, asset, amount, protocol }, ttlMs = 5 * 60 * 1000) {
  const intentId = randomUUID();
  const approvalToken = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + ttlMs;
  intentStore.set(intentId, {
    intentId,
    action,
    asset,
    amount,
    protocol,
    tokenHash: sha256Hex(approvalToken),
    approvedAt: null,
    executedAt: null,
    expiresAt
  });
  return { intentId, approvalToken, expiresAt };
}

function getIntentOrThrow(intentId) {
  const intent = intentStore.get(intentId);
  if (!intent) throw new Error('Intent not found');
  if (Date.now() > intent.expiresAt) throw new Error('Intent expired');
  return intent;
}

function requireValidToken(intent, approvalToken) {
  if (!approvalToken) throw new Error('approvalToken required');
  const provided = sha256Hex(approvalToken);
  if (provided !== intent.tokenHash) throw new Error('Invalid approvalToken');
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

async function tryProofTransaction(agent, req) {
  const status = agent.walletManager.getRuntimeStatus();
  if (status.walletMode !== 'wdk') {
    return { ok: false, mode: status.walletMode, reason: 'wdk_required', chainId: status.chainId };
  }
  const wallet = agent.walletManager.wallet;
  if (!wallet || typeof wallet.sendTransaction !== 'function') {
    return { ok: false, mode: status.walletMode, reason: 'wallet_sendTransaction_unavailable', chainId: status.chainId };
  }

  const from = await wallet.getAddress();
  const to = from;

  const txRequest = { to, value: '0x0' };
  req.log.info('proof.tx.send', { chainId: status.chainId, to });

  const tx = await wallet.sendTransaction(txRequest);
  const txHash = tx?.hash || tx?.txHash;
  if (!txHash) return { ok: false, mode: status.walletMode, reason: 'tx_hash_missing', chainId: status.chainId };

  return {
    ok: true,
    mode: status.walletMode,
    chainId: status.chainId,
    txHash,
    blockExplorer: explorerTxUrl(status.chainId, txHash)
  };
}

async function tryProofMessage(agent, req) {
  const status = agent.walletManager.getRuntimeStatus();
  if (status.walletMode !== 'wdk') {
    return { ok: false, mode: status.walletMode, reason: 'wdk_required', chainId: status.chainId };
  }
  const wallet = agent.walletManager.wallet;
  if (!wallet || typeof wallet.signMessage !== 'function') {
    return { ok: false, mode: status.walletMode, reason: 'wallet_signMessage_unavailable', chainId: status.chainId };
  }

  const address = await wallet.getAddress();
  const nonce = randomBytes(16).toString('hex');
  const message = `YieldKernel WDK Proof\naddress=${address}\nchainId=${status.chainId}\nnonce=${nonce}\nts=${new Date().toISOString()}`;
  req.log.info('proof.message.sign', { chainId: status.chainId, address });
  const signature = await wallet.signMessage(message);

  return { ok: true, mode: status.walletMode, chainId: status.chainId, address, message, signature };
}

// API for network status check
app.get('/api/status', async (req, res) => {
  try {
    const agent = await getAgent();
    const wdk = agent.walletManager.getRuntimeStatus();
    const address = await agent.walletManager.wallet.getAddress();
    const addressPresent = Boolean(address);

    const provider = new ethers.JsonRpcProvider(wdk.rpcUrl, wdk.chainId);
    const start = Date.now();
    const blockNumber = await provider.getBlockNumber();
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

app.post('/api/proof/tx', async (req, res) => {
  try {
    const agent = await getAgent();
    const proof = await tryProofTransaction(agent, req);
    if (!proof.ok) {
      req.log.warn('proof.tx.unavailable', proof);
      res.status(400).json({
        ok: false,
        ...proof,
        required: {
          wdkInstalled: true,
          walletMode: 'wdk',
          chainId: 'Set CHAIN_ID to a testnet (e.g. 11155111)',
          rpcUrl: 'Set RPC_URL to a testnet RPC',
          mnemonic: 'Set WALLET_MNEMONIC or allow WDK wallet generation and fund with testnet ETH'
        }
      });
      return;
    }

    req.log.info('proof.tx.sent', { chainId: proof.chainId, txHash: proof.txHash });
    res.json(proof);
  } catch (err) {
    req.log.error('proof.tx.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/proof/message', async (req, res) => {
  try {
    const agent = await getAgent();
    const proof = await tryProofMessage(agent, req);
    if (!proof.ok) {
      req.log.warn('proof.message.unavailable', proof);
      res.status(400).json({ ok: false, ...proof });
      return;
    }
    res.json(proof);
  } catch (err) {
    req.log.error('proof.message.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/intent/create', async (req, res) => {
  try {
    const action = String(req.body?.action || 'supply').toLowerCase();
    const asset = String(req.body?.asset || 'USDC').toUpperCase();
    const amount = String(req.body?.amount || process.env.MAX_POSITION_SIZE_USDT || '1000');
    const protocol = String(req.body?.protocol || 'aave-v3').toLowerCase();

    if (action !== 'supply') {
      res.status(400).json({ ok: false, error: `Unsupported action: ${action}` });
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ ok: false, error: 'Invalid amount' });
      return;
    }

    const created = createIntent({ action, asset, amount, protocol });
    req.log.info('intent.create', { intentId: created.intentId, action, asset, amount, protocol });
    res.json({ ok: true, ...created, instructions: 'Call /api/intent/approve with intentId + approvalToken, then /api/intent/execute.' });
  } catch (err) {
    req.log.error('intent.create.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/intent/approve', async (req, res) => {
  try {
    const intentId = String(req.body?.intentId || '');
    const approvalToken = String(req.body?.approvalToken || '');
    const intent = getIntentOrThrow(intentId);
    requireValidToken(intent, approvalToken);
    if (intent.executedAt) {
      res.status(400).json({ ok: false, error: 'Intent already executed' });
      return;
    }
    intent.approvedAt = Date.now();
    intentStore.set(intentId, intent);
    req.log.info('intent.approve', { intentId });
    res.json({ ok: true, intentId, approvedAt: new Date(intent.approvedAt).toISOString(), expiresAt: new Date(intent.expiresAt).toISOString() });
  } catch (err) {
    req.log.warn('intent.approve.error', { error: { name: err?.name, message: err?.message } });
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/intent/execute', async (req, res) => {
  try {
    const agent = await getAgent();
    const intentId = String(req.body?.intentId || '');
    const approvalToken = String(req.body?.approvalToken || '');
    const intent = getIntentOrThrow(intentId);
    requireValidToken(intent, approvalToken);

    if (!intent.approvedAt) {
      res.status(400).json({ ok: false, error: 'Intent not approved' });
      return;
    }
    if (intent.executedAt) {
      res.status(400).json({ ok: false, error: 'Intent already executed' });
      return;
    }

    intent.executedAt = Date.now();
    intentStore.set(intentId, intent);

    req.log.info('intent.execute', { intentId, action: intent.action, protocol: intent.protocol, asset: intent.asset, amount: intent.amount });
    const result = await agent.defiManager.supplyToProtocol(intent.protocol, intent.asset, intent.amount);
    res.json({ ok: true, intentId, executedAt: new Date(intent.executedAt).toISOString(), result });
  } catch (err) {
    req.log.error('intent.execute.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/judge/run', async (req, res) => {
  try {
    const agent = await getAgent();

    const asset = String(req.body?.asset || 'USDC').toUpperCase();
    const amount = String(req.body?.amount || process.env.MAX_POSITION_SIZE_USDT || '1000');
    const execute = Boolean(req.body?.execute);
    const requireOnchainProof = Boolean(req.body?.requireOnchainProof);

    const transcript = [];
    const push = (stage, message, data) => {
      transcript.push({ stage, message, data, ts: new Date().toISOString() });
      req.log.info('judge.transcript', { stage, message });
    };

    push('OBSERVE', 'Fetching yield landscape', { asset });
    const yields = await agent.defiManager.getAvailableYields();
    push('OBSERVE', `Discovered ${yields.length} opportunities`, { count: yields.length });

    const best = (Array.isArray(yields) ? yields : []).sort((a, b) => Number(b.supplyAPY || 0) - Number(a.supplyAPY || 0))[0];
    if (!best) {
      res.status(200).json({ ok: false, error: 'No yield opportunities available', transcript });
      return;
    }
    push('ANALYZE', `Best opportunity selected: ${best.protocol} ${best.asset}`, best);

    const risk = agent.riskManager.assessYieldOpportunity(best);
    push('ANALYZE', `Risk assessment: ${risk.recommendation} (${risk.score.total}/100)`, { recommendation: risk.recommendation, score: risk.score });

    const gas = await agent.defiManager.estimateGas('supply', { protocol: best.protocol, asset: best.asset, amount });
    const apy = Number(best.supplyAPY);
    const amountNum = Number(amount);
    const expectedYearly = (amountNum * apy / 100);
    const expected30d = expectedYearly * (30 / 365);
    const gasUsd = Number(gas.estimatedCostUSD);
    const netYearly = expectedYearly - gasUsd;
    const net30d = expected30d - gasUsd;

    const economics = {
      asset,
      amount,
      apyPercent: apy,
      gasCostUSD: gasUsd,
      expectedYieldUSD_30d: Number(expected30d.toFixed(2)),
      expectedYieldUSD_1y: Number(expectedYearly.toFixed(2)),
      netGainUSD_30d: Number(net30d.toFixed(2)),
      netGainUSD_1y: Number(netYearly.toFixed(2)),
      rule: 'Reject if gas > 30 days of yield OR netGain_1y <= 0'
    };
    push('ECONOMICS', 'Gas vs yield economics computed', economics);

    const maxSize = Number(process.env.MAX_POSITION_SIZE_USDT || 1000);
    const minApy = Number(process.env.MIN_APY_THRESHOLD || 3.0);
    const pass =
      amountNum <= maxSize &&
      apy >= minApy &&
      risk.recommendation !== 'REJECTED' &&
      gasUsd <= economics.expectedYieldUSD_30d &&
      economics.netGainUSD_1y > 0;

    push('DECIDE', pass ? 'APPROVED' : 'REJECTED', { pass, maxSize, minApy });

    let execution = { executed: false };
    if (execute && pass) {
      if (requireOnchainProof) {
        const proof = await tryProofTransaction(agent, req);
        if (!proof.ok) {
          execution = { executed: false, mode: 'proof_required', proof };
          push('REPORT', 'Execution skipped: on-chain proof required but not available', proof);
        } else {
          execution = { executed: true, mode: 'onchain_proof', proof };
          push('EXECUTE', 'On-chain proof transaction submitted', proof);
          push('REPORT', 'Execution complete with verifiable explorer link', { txHash: proof.txHash, blockExplorer: proof.blockExplorer });
        }
      } else {
        const result = await agent.defiManager.supplyToProtocol(best.protocol, best.asset, amount);
        execution = { executed: true, mode: 'defi_supply', result };
        push('EXECUTE', 'Supply executed', { txHash: result.txHash, blockExplorer: result.blockExplorer });
        push('REPORT', 'Execution complete', { txHash: result.txHash, blockExplorer: result.blockExplorer });
      }
    } else {
      push('REPORT', execute ? 'Execution skipped due to failed checks' : 'Execution not requested (dry run)', { execute, pass });
    }

    res.json({
      ok: true,
      input: { asset, amount, execute, requireOnchainProof },
      bestOpportunity: best,
      risk,
      economics,
      decision: { pass },
      execution,
      transcript
    });
  } catch (err) {
    req.log.error('judge.run.error', { error: { name: err?.name, message: err?.message } });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API to get current yields
app.get('/api/yields', async (req, res) => {
  try {
    const agent = await getAgent();
    const yields = await agent.defiManager.getAvailableYields();
    const enriched = (Array.isArray(yields) ? yields : []).map((y) => {
      const risk = agent.riskManager.assessYieldOpportunity(y);
      return {
        ...y,
        riskScore: risk?.score?.total ?? null,
        riskRecommendation: risk?.recommendation ?? null
      };
    });
    req.log.info('yields.get', { count: enriched.length });
    res.json(enriched);
  } catch (err) {
    req.log.error('yields.error', { error: { name: err?.name, message: err?.message } });
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

  // Send immediately then every 30s
  await sendEvent();
  const interval = setInterval(sendEvent, 30000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
    req.log.info('monitor.stream.close', { cyclesSent: cycle });
  });
});

app.use(express.static(join(__dirname, '..', 'public')));


// API to execute investment via AI
app.post('/api/invest', async (req, res) => {
  try {
    const intentId = String(req.body?.intentId || '');
    const approvalToken = String(req.body?.approvalToken || '');
    if (!intentId || !approvalToken) {
      res.status(400).json({
        ok: false,
        error: 'Use explicit intent flow. Call /api/intent/create, then /api/intent/approve, then /api/intent/execute (or POST /api/invest with intentId+approvalToken).'
      });
      return;
    }
    const agent = await getAgent();
    const intent = getIntentOrThrow(intentId);
    requireValidToken(intent, approvalToken);

    if (!intent.approvedAt) {
      res.status(400).json({ ok: false, error: 'Intent not approved' });
      return;
    }
    if (intent.executedAt) {
      res.status(400).json({ ok: false, error: 'Intent already executed' });
      return;
    }

    intent.executedAt = Date.now();
    intentStore.set(intentId, intent);

    req.log.info('invest.execute', { intentId, protocol: intent.protocol, asset: intent.asset, amount: intent.amount });
    const result = await agent.defiManager.supplyToProtocol(intent.protocol, intent.asset, intent.amount);
    res.json({ ok: true, intentId, executedAt: new Date(intent.executedAt).toISOString(), result });
  } catch (err) {
    req.log.error('invest.error', { error: { name: err?.name, message: err?.message, stack: err?.stack } });
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

app.use(errorLoggingMiddleware(log));

export const api = onRequest({ region: 'us-central1' }, app);

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    log.info('server.listen', { port: Number(port) });
  });
}
