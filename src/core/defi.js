import { ethers } from 'ethers';
import { createLogger } from '../utils/logger.js';
import { ProtocolRegistry } from '../adapters/protocol-registry.js';
import { AaveV3Adapter } from '../adapters/aave-v3-adapter.js';
import { CompoundV3Adapter } from '../adapters/compound-v3-adapter.js';
import { SparkAdapter } from '../adapters/spark-adapter.js';

export class DeFiManager {
  constructor(wallet, config = {}) {
    this.wallet = wallet;
    this.log = createLogger({ service: 'yieldkernel-defi' });
    this.chainId = Number(config.chainId || process.env.CHAIN_ID || 1);
    this.rpcUrl = String(config.rpcUrl || process.env.RPC_URL || 'https://eth.llamarpc.com');

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl, this.chainId);
    this.registry = new ProtocolRegistry();
    this.initialized = false;

    this.adapters = {
      'aave-v3': new AaveV3Adapter(this.wallet, { chainId: this.chainId, rpcUrl: this.rpcUrl }),
      'compound-v3': new CompoundV3Adapter(this.wallet, { chainId: this.chainId, rpcUrl: this.rpcUrl }),
      'spark': new SparkAdapter(this.wallet, { chainId: this.chainId, rpcUrl: this.rpcUrl })
    };

    this.ethPriceCache = { value: null, fetchedAt: 0 };
    this.simulatedPositions = [];
  }

  async initialize() {
    if (this.initialized) return;
    const entries = Object.entries(this.adapters);

    for (const [name, adapter] of entries) {
      try {
        await adapter.initialize();
        this.registry.registerProtocol(name, adapter, {
          displayName: name,
          chainId: this.chainId,
          riskRating: name === 'aave-v3' ? 'low' : 'medium',
          isActive: true
        });
      } catch (e) {
        this.log.warn('protocol.init.failed', { protocol: name, error: { name: e?.name, message: e?.message } });
      }
    }

    this.initialized = true;
  }

  _explorerBase() {
    const id = Number(this.chainId);
    const map = {
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
    return map[id] || map[1];
  }

  _txUrl(txHash) {
    return `${this._explorerBase()}/tx/${txHash}`;
  }

  async _getEthUsdPrice() {
    const now = Date.now();
    if (this.ethPriceCache.value && now - this.ethPriceCache.fetchedAt < 5 * 60 * 1000) return this.ethPriceCache.value;

    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const price = Number(data?.ethereum?.usd);
      if (!Number.isFinite(price) || price <= 0) return null;
      this.ethPriceCache = { value: price, fetchedAt: now };
      return price;
    } catch {
      return null;
    }
  }

  async getPortfolio() {
    await this.initialize();
    const address = await this.wallet.getAddress();
    const positions = await this.registry.queryAllPositions(address, { chainId: this.chainId });
    return { walletAddress: address, chainId: this.chainId, positions: [...positions, ...this.simulatedPositions] };
  }

  async getAvailableYields() {
    await this.initialize();
    const result = await this.registry.queryAllYields({ chainId: this.chainId, includeMetadata: true });
    const yields = result.yields || [];

    const gas = await this.estimateGas('supply', { protocol: 'aave-v3', asset: 'USDT', amount: '1000' }).catch(() => null);
    return yields.map((y) => {
      const supplyAPY = Number(y.supplyAPY || y.totalAPY || 0);
      const gasUsd = gas ? Number(gas.estimatedCostUSD) : null;
      const netAPYAfterGas = gasUsd && supplyAPY > 0 ? (supplyAPY - (gasUsd / (1000 * (supplyAPY / 100)))).toFixed(3) : null;
      return {
        ...y,
        chain: this.chainId,
        gasEstimateUSD: gasUsd,
        netAPYAfterGas
      };
    });
  }

  async supplyToAave(asset, amount) {
    await this.initialize();
    const adapter = this.registry.getProtocol('aave-v3');

    const assetAddress = adapter._resolveAssetAddress(asset);
    const token = new ethers.Contract(assetAddress, ['function decimals() view returns (uint8)'], this.provider);
    const decimals = Number(await token.decimals());
    const amountUnits = ethers.parseUnits(String(amount), decimals);

    this.log.info('tx.supply.request', { protocol: 'aave-v3', chainId: this.chainId, asset, amount });
    const receipt = await adapter.supply(assetAddress, amountUnits);
    const txHash = receipt?.hash || receipt?.transactionHash;
    if (!txHash) throw new Error('Transaction hash not found in receipt');

    const gas = await this.estimateGas('supply', { protocol: 'aave-v3', asset, amount }).catch(() => null);
    const yields = await this.getAvailableYields().catch(() => []);
    const best = yields.find((y) => String(y.asset).toUpperCase() === String(asset).toUpperCase() && String(y.protocol).includes('aave-v3')) || null;
    const apy = best ? Number(best.supplyAPY || 0) : null;
    const expectedYearlyYield = apy ? (Number(amount) * apy / 100) : null;
    const gasUsd = gas ? Number(gas.estimatedCostUSD) : null;

    this.log.info('tx.supply.submitted', {
      txHash,
      // Assuming 'contracts' and 'aavePool' are defined elsewhere, or this is a placeholder.
      // For now, I'll comment out contractAddress as it's not in the current class definition.
      // contractAddress: this.contracts.aavePool,
      economics: {
        supplyAPY: apy,
        expectedYearlyYieldUSD: expectedYearlyYield,
        gasCostUSD: gasUsd // Using gasUsd from current scope
      }
    });

    // Update our simulated dashboard state
    const existingPosIndex = this.simulatedPositions.findIndex(p => p.asset === asset.toUpperCase());
    if (existingPosIndex >= 0) {
      const newTotal = parseFloat(this.simulatedPositions[existingPosIndex].amount) + parseFloat(amount);
      this.simulatedPositions[existingPosIndex].amount = newTotal.toString();
    } else {
      this.simulatedPositions.push({
        asset: asset.toUpperCase(),
        amount: amount.toString(),
        apy: apy ? apy.toString() : '0', // Ensure apy is a string
        // Assuming 'contracts' is defined elsewhere, or this is a placeholder.
        // For now, I'll use a generic placeholder for address.
        address: assetAddress || 'UNKNOWN' // Use resolved assetAddress
      });
    }

    return {
      success: true,
      protocol: 'aave-v3',
      chainId: this.chainId,
      asset,
      amount,
      txHash,
      blockExplorer: this._txUrl(txHash),
      economics: {
        supplyAPY: apy !== null ? `${apy}%` : null,
        expectedYearlyYield: expectedYearlyYield !== null ? `$${expectedYearlyYield.toFixed(4)}` : null,
        gasCostUSD: gasUsd !== null ? `$${gasUsd.toFixed(2)}` : null,
        netGain: expectedYearlyYield !== null && gasUsd !== null ? `$${(expectedYearlyYield - gasUsd).toFixed(4)} / year` : null
      }
    };
  }

  async estimateGas(operation, params = {}) {
    await this.initialize();
    const fee = await this.provider.getFeeData();
    const maxFeePerGas = fee.maxFeePerGas || fee.gasPrice;
    const maxPriorityFeePerGas = fee.maxPriorityFeePerGas || 0n;

    const gasPriceGwei = maxFeePerGas ? Number(ethers.formatUnits(maxFeePerGas, 'gwei')) : null;
    let gasLimit = null;

    // Try to get real gas estimate from the blockchain
    try {
      gasLimit = await this._estimateGasForOperation(operation, params);
    } catch (e) {
      this.log.warn('gas.estimate.failed', { operation, params: { protocol: params.protocol, asset: params.asset }, error: { name: e?.name, message: e?.message } });
    }

    if (!gasLimit) {
      // Fallback to chain-specific base estimates only if actual estimation fails
      const baseGasEstimates = {
        supply: { mainnet: 220000n, l2: 150000n },
        withdraw: { mainnet: 180000n, l2: 120000n },
        borrow: { mainnet: 250000n, l2: 180000n },
        repay: { mainnet: 200000n, l2: 140000n },
        approve: { mainnet: 50000n, l2: 45000n },
        swap: { mainnet: 150000n, l2: 100000n },
        default: { mainnet: 150000n, l2: 100000n }
      };

      const isL2 = [10, 42161, 8453, 137].includes(this.chainId);
      const opType = operation || 'default';
      const estimates = baseGasEstimates[opType] || baseGasEstimates.default;
      gasLimit = isL2 ? estimates.l2 : estimates.mainnet;
      this.log.info('gas.estimate.fallback', { operation, gasLimit: gasLimit.toString(), isL2 });
    }

    const costWei = maxFeePerGas ? (gasLimit * maxFeePerGas) : null;
    const estimatedCostETH = costWei ? Number(ethers.formatEther(costWei)) : null;
    const ethUsd = await this._getEthUsdPrice();
    const estimatedCostUSD = estimatedCostETH !== null && ethUsd ? Number((estimatedCostETH * ethUsd).toFixed(2)) : null;

    return {
      operation,
      chainId: this.chainId,
      gasLimit: gasLimit.toString(),
      gasPriceGwei: gasPriceGwei !== null ? gasPriceGwei.toFixed(2) : null,
      maxFeePerGasWei: maxFeePerGas ? maxFeePerGas.toString() : null,
      maxPriorityFeePerGasWei: maxPriorityFeePerGas ? maxPriorityFeePerGas.toString() : null,
      estimatedCostETH: estimatedCostETH !== null ? estimatedCostETH.toFixed(6) : null,
      estimatedCostUSD: estimatedCostUSD !== null ? estimatedCostUSD.toFixed(2) : null
    };
  }

  async _estimateGasForOperation(operation, params) {
    const userAddress = await this.wallet.getAddress();

    // Handle different operation types
    if (params.protocol && params.asset) {
      const adapter = this.registry.getProtocol(params.protocol);
      if (!adapter) {
        throw new Error(`Protocol ${params.protocol} not found`);
      }

      const assetAddress = adapter._resolveAssetAddress(params.asset);
      const token = new ethers.Contract(assetAddress, ['function decimals() view returns (uint8)'], this.provider);
      const decimals = Number(await token.decimals());
      const amountUnits = params.amount ? ethers.parseUnits(String(params.amount), decimals) : ethers.parseUnits('1', decimals);

      const poolAddress = adapter.getContractAddress('pool');
      let data;

      switch (operation) {
        case 'supply':
          const supplyIface = new ethers.Interface(['function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)']);
          data = supplyIface.encodeFunctionData('supply', [assetAddress, amountUnits, userAddress, 0]);
          break;

        case 'withdraw':
          const withdrawIface = new ethers.Interface(['function withdraw(address asset,uint256 amount,address to)']);
          data = withdrawIface.encodeFunctionData('withdraw', [assetAddress, amountUnits, userAddress]);
          break;

        case 'borrow':
          const borrowIface = new ethers.Interface(['function borrow(address asset,uint256 amount,uint256 interestRateMode,uint16 referralCode,address onBehalfOf)']);
          data = borrowIface.encodeFunctionData('borrow', [assetAddress, amountUnits, 2, 0, userAddress]); // 2 = variable rate
          break;

        case 'repay':
          const repayIface = new ethers.Interface(['function repay(address asset,uint256 amount,uint256 interestRateMode,address onBehalfOf)']);
          data = repayIface.encodeFunctionData('repay', [assetAddress, amountUnits, 2, userAddress]);
          break;

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return await this.provider.estimateGas({ from: userAddress, to: poolAddress, data });
    }

    // Handle approve operations
    if (operation === 'approve' && params.token && params.spender) {
      const approveIface = new ethers.Interface(['function approve(address spender,uint256 amount)']);
      const data = approveIface.encodeFunctionData('approve', [params.spender, ethers.MaxUint256]);
      return await this.provider.estimateGas({ from: userAddress, to: params.token, data });
    }

    throw new Error(`Cannot estimate gas: insufficient parameters for operation ${operation}`);
  }
}
