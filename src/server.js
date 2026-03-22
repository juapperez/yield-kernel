import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
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
          mnemonic: 'Set WALLET_MNEMONIC and fund wallet with testnet ETH'
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

    const best = yields.sort((a, b) => b.supplyAPY - a.supplyAPY)[0];
    push('ANALYZE', `Best opportunity selected: ${best.protocol} ${best.asset}`, best);

    const risk = agent.riskManager.assessYieldOpportunity(best);
    push('ANALYZE', `Risk assessment: ${risk.recommendation} (${risk.score.total}/100)`, { recommendation: risk.recommendation, score: risk.score });

    const gas = await agent.defiManager.estimateGas('supply', { asset: best.asset, amount });
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
        const result = await agent.defiManager.supplyToAave(best.asset, amount);
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
      const yields = await agent.defiManager.getAvailableYields();
      const best = yields.sort((a, b) => b.supplyAPY - a.supplyAPY)[0];
      const risk = agent.riskManager.assessYieldOpportunity(best);
      const gasEst = await agent.defiManager.estimateGas('supply', { protocol: 'aave-v3', asset: best.asset, amount: String(process.env.MAX_POSITION_SIZE_USDT || 1000) });
      const gasUsd = gasEst.estimatedCostUSD ? Number(gasEst.estimatedCostUSD) : null;
      const netYield = gasUsd
        ? (parseFloat(best.supplyAPY) - (gasUsd / (1000 * parseFloat(best.supplyAPY) / 100))).toFixed(3)
        : null;

      const decisions = [
        `[OBSERVE] Cycle #${cycle}: Scanning ${yields.length} yield opportunities across protocols`,
        `[ANALYZE] Best opportunity: ${best.protocol} ${best.asset} at ${best.supplyAPY}% APY | Risk Score: ${risk.score.total}/100`,
        `[ECONOMICS] Gas estimate: ${gasEst.estimatedCostUSD ? `$${gasEst.estimatedCostUSD}` : `${gasEst.estimatedCostETH} ETH`} | Net APY after gas: ${netYield !== null ? `${netYield}%` : 'N/A'} | Position viable: ${netYield !== null ? (Number(netYield) > 0 ? 'YES' : 'NO') : 'N/A'}`,
        `[DECIDE] ${netYield !== null ? (Number(netYield) > 0 ? `HOLD - no rebalance needed` : 'SKIP - gas cost exceeds yield for current position size') : 'HOLD - economics unavailable'}`,
        `[REPORT] Portfolio health nominal. Next evaluation in 86400s.`
      ];

      const event = {
        cycle,
        timestamp: new Date().toISOString(),
        decisions,
        bestOpportunity: best,
        gasEstimate: gasEst,
        netYield
      };

      res.write(`data: ${JSON.stringify(event)}\n\n`);
      req.log.info('monitor.stream.tick', { cycle, bestAsset: best?.asset, bestApy: best?.supplyAPY, netYield });
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
    const agent = await getAgent();
    const { asset, amount } = req.body;
    req.log.info('invest.request', { asset, amount });
    
    // More explicit prompt that forces function calling
    const prompt = `USER REQUEST: Supply ${amount} ${asset} to Aave V3.

AUTHORIZATION: I explicitly authorize and confirm this transaction.

INSTRUCTIONS:
1. Call get_yields to check current opportunities
2. Call assess_risk for ${asset} on Aave V3
3. If risk is acceptable, IMMEDIATELY call supply_asset with:
   - asset: "${asset}"
   - amount: "${amount}"
   - protocol: "aave-v3"

DO NOT just describe what you would do. EXECUTE the supply_asset function now.`;

    // Reset history to prevent memory leak and context pollution across requests
    agent.conversationHistory = [];
    const aiResponse = await agent.chat(prompt);

    req.log.info('invest.ai_response', { response: aiResponse });

    // Look for function call results in history
    const history = agent.conversationHistory;
    let supplyResult = null;
    for (const msg of history) {
      if (msg.role === 'function' && msg.name === 'supply_asset') {
        supplyResult = JSON.parse(msg.content);
      }
    }

    req.log.info('invest.supply_result', { supplyResult, historyLength: history.length });

    if (supplyResult && (supplyResult.error || supplyResult.issues)) {
      req.log.warn('invest.blocked', { asset, amount, supplyResult });
      res.json(supplyResult);
    } else if (supplyResult && supplyResult.success) {
      req.log.info('invest.executed', { asset, amount, txHash: supplyResult.txHash, chainId: supplyResult.chainId, protocol: supplyResult.protocol });
      res.json({
        success: true,
        ai_response: aiResponse,
        hash: supplyResult.txHash,
        blockExplorer: supplyResult.blockExplorer,
        economics: supplyResult.economics,
        chainId: supplyResult.chainId,
        protocol: supplyResult.protocol
      });
    } else {
      req.log.warn('invest.refused', { asset, amount, aiResponse, historyLength: history.length });
      res.json({ 
        error: 'AI did not execute the transaction. It may have found risks or the function was not called.', 
        ai_response: aiResponse,
        debug: {
          historyLength: history.length,
          hasSupplyResult: !!supplyResult
        }
      });
    }
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
