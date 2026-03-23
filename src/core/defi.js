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
    this.rpcUrl = String(config.rpcUrl || process.env.RPC_URL || 'https://ethereum.publicnode.com');

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
    return await this.supplyToProtocol('aave-v3', asset, amount);
  }

  async supplyToProtocol(protocol, asset, amount) {
    await this.initialize();
    const protocolName = String(protocol || '').toLowerCase();
    const adapter = this.registry.getProtocol(protocolName);
    const assetAddress = this._resolveAssetAddress(adapter, asset);
    const amountUnits = await this._amountToUnits(assetAddress, amount);

    this.log.info('tx.supply.request', { protocol: protocolName, chainId: this.chainId, asset, amount });
    const receipt = await adapter.supply(assetAddress, amountUnits);
    const txHash = receipt?.txHash || receipt?.hash || receipt?.transactionHash;
    if (!txHash) throw new Error('Transaction hash not found in receipt');

    const gas = await this.estimateGas('supply', { protocol: protocolName, asset, amount }).catch(() => null);
    const yields = await this.getAvailableYields().catch(() => []);
    const best = yields.find((y) =>
      String(y.asset).toUpperCase() === String(asset).toUpperCase() &&
      String(y.protocol || '').toLowerCase() === protocolName
    ) || null;

    const apy = best ? Number(best.supplyAPY || best.totalAPY || 0) : null;
    const expectedYearlyYield = apy ? (Number(amount) * apy / 100) : null;
    const gasUsd = gas ? Number(gas.estimatedCostUSD) : null;

    const existingPosIndex = this.simulatedPositions.findIndex((p) => p.asset === String(asset).toUpperCase() && String(p.protocol || '').toLowerCase() === protocolName);
    if (existingPosIndex >= 0) {
      const newTotal = parseFloat(this.simulatedPositions[existingPosIndex].amount) + parseFloat(amount);
      this.simulatedPositions[existingPosIndex].amount = newTotal.toString();
      this.simulatedPositions[existingPosIndex].apy = apy ? apy.toString() : this.simulatedPositions[existingPosIndex].apy;
    } else {
      this.simulatedPositions.push({
        protocol: protocolName,
        asset: String(asset).toUpperCase(),
        amount: amount.toString(),
        apy: apy ? apy.toString() : '0',
        address: assetAddress || 'UNKNOWN'
      });
    }

    return {
      success: true,
      protocol: protocolName,
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

  _resolveAssetAddress(adapter, asset) {
    if (typeof asset === 'string' && asset.startsWith('0x') && asset.length === 42) return asset;
    if (adapter && typeof adapter._resolveAssetAddress === 'function') {
      return adapter._resolveAssetAddress(asset);
    }
    return String(asset);
  }

  async _amountToUnits(assetAddress, amount) {
    const token = new ethers.Contract(assetAddress, ['function decimals() view returns (uint8)'], this.provider);
    const decimals = Number(await token.decimals());
    return ethers.parseUnits(String(amount), decimals);
  }

  async estimateGas(operation, params = {}) {
    await this.initialize();
    const fee = await this.provider.getFeeData();
    const maxFeePerGas = fee.maxFeePerGas || fee.gasPrice;
    const maxPriorityFeePerGas = fee.maxPriorityFeePerGas || 0n;

    const gasPriceGwei = maxFeePerGas ? Number(ethers.formatUnits(maxFeePerGas, 'gwei')) : null;
    const gasLimit = await this._estimateGasForOperation(operation, params);

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

      let data;
      let to;

      const protocolName = String(params.protocol || '').toLowerCase();
      if (protocolName === 'compound-v3') {
        to = adapter.getContractAddress('comet');
        switch (operation) {
          case 'supply': {
            const supplyIface = new ethers.Interface(['function supply(address asset,uint256 amount)']);
            data = supplyIface.encodeFunctionData('supply', [assetAddress, amountUnits]);
            break;
          }
          case 'withdraw': {
            const withdrawIface = new ethers.Interface(['function withdraw(address asset,uint256 amount)']);
            data = withdrawIface.encodeFunctionData('withdraw', [assetAddress, amountUnits]);
            break;
          }
          default:
            throw new Error(`Unsupported operation for compound-v3: ${operation}`);
        }
      } else {
        to = adapter.getContractAddress('pool');
        switch (operation) {
          case 'supply': {
            const supplyIface = new ethers.Interface(['function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)']);
            data = supplyIface.encodeFunctionData('supply', [assetAddress, amountUnits, userAddress, 0]);
            break;
          }
          case 'withdraw': {
            const withdrawIface = new ethers.Interface(['function withdraw(address asset,uint256 amount,address to)']);
            data = withdrawIface.encodeFunctionData('withdraw', [assetAddress, amountUnits, userAddress]);
            break;
          }
          case 'borrow': {
            const borrowIface = new ethers.Interface(['function borrow(address asset,uint256 amount,uint256 interestRateMode,uint16 referralCode,address onBehalfOf)']);
            data = borrowIface.encodeFunctionData('borrow', [assetAddress, amountUnits, 2, 0, userAddress]);
            break;
          }
          case 'repay': {
            const repayIface = new ethers.Interface(['function repay(address asset,uint256 amount,uint256 interestRateMode,address onBehalfOf)']);
            data = repayIface.encodeFunctionData('repay', [assetAddress, amountUnits, 2, userAddress]);
            break;
          }
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }
      }

      try {
        return await this.provider.estimateGas({ from: userAddress, to, data });
      } catch (e) {
        const msg = String(e?.shortMessage || e?.reason || e?.message || '');
        if (operation === 'supply' && msg.toLowerCase().includes('exceeds allowance')) {
          const approveIface = new ethers.Interface(['function approve(address spender,uint256 amount)']);
          const approveData = approveIface.encodeFunctionData('approve', [to, ethers.MaxUint256]);
          const approveGas = await this.provider.estimateGas({ from: userAddress, to: assetAddress, data: approveData });
          return approveGas + 250000n;
        }
        throw e;
      }
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
