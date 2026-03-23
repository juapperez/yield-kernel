import { createLogger } from '../utils/logger.js';
import { createRequire } from 'module';

let AaveProtocolEvm;
try {
  const require = createRequire(import.meta.url);
  const aave = require('@tetherto/wdk-protocol-lending-aave-evm');
  AaveProtocolEvm = aave.default || aave.AaveProtocolEvm;
} catch (error) {
  createLogger({ service: 'yieldkernel-defi-wdk' }).warn('aave.wdk.unavailable', { reason: 'module_not_installed' });
}

export class DeFiManagerWDK {
  constructor(wallet, config = {}) {
    this.wallet = wallet;
    this.log = createLogger({ service: 'yieldkernel-defi-wdk' });
    this.chainId = Number(config.chainId || process.env.CHAIN_ID || 1);
    this.rpcUrl = String(config.rpcUrl || process.env.RPC_URL || 'https://ethereum.publicnode.com');
    this.initialized = false;
    this.aaveProtocol = null;
    this.account = null;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.log.info('defi.wdk.init.start');
      if (!this.wallet) throw new Error('Wallet not initialized');
      if (!AaveProtocolEvm) throw new Error('WDK Aave module not available');

      // Get the first account from wallet
      this.account = await this.wallet.getAccount(0);
      if (!this.account) throw new Error('Failed to get account from wallet');

      // Initialize Aave protocol with WDK account
      this.aaveProtocol = new AaveProtocolEvm(this.account);
      if (!this.aaveProtocol) throw new Error('Failed to create AaveProtocolEvm instance');

      this.log.info('defi.wdk.initialized', { chainId: this.chainId, rpcUrl: this.rpcUrl });
      this.initialized = true;
    } catch (error) {
      this.log.error('defi.wdk.init.error', { error: { name: error?.name, message: error?.message, stack: error?.stack } });
      throw error;
    }
  }

  async getPortfolio() {
    await this.initialize();
    // Return empty portfolio if not initialized
    if (!this.aaveProtocol) {
      return {
        positions: [],
        totalValue: '0',
        totalCollateral: '0',
        totalDebt: '0',
        availableBorrows: '0',
        liquidationThreshold: '0',
        ltv: '0',
        healthFactor: '0'
      };
    }

    try {
      const data = await this.aaveProtocol.getAccountData();
      return {
        totalCollateral: data.totalCollateralBase.toString(),
        totalDebt: data.totalDebtBase.toString(),
        availableBorrows: data.availableBorrowsBase.toString(),
        liquidationThreshold: data.currentLiquidationThreshold.toString(),
        ltv: data.ltv.toString(),
        healthFactor: data.healthFactor.toString()
      };
    } catch (error) {
      this.log.error('portfolio.fetch.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async getAvailableYields() {
    await this.initialize();
    if (!this.aaveProtocol) {
      throw new Error('Aave protocol not initialized - cannot fetch yields');
    }

    try {
      const usdtAddress = this._resolveAssetAddress('USDT');
      
      try {
        const reserve = await this.aaveProtocol._getTokenReserve(usdtAddress);
        
        const supplyAPY = Number(reserve.liquidityRate) / 1e25;
        const borrowAPY = Number(reserve.variableBorrowRate) / 1e25;
        
        const yield = {
          protocol: 'aave-v3',
          asset: 'USDT',
          assetAddress: usdtAddress,
          supplyAPY,
          borrowAPY,
          incentiveAPY: 0,
          totalAPY: supplyAPY,
          liquidity: reserve.availableLiquidity.toString(),
          utilizationRate: 0,
          risk: 'low',
          chainId: this.chainId
        };

        this.log.info('yields.discovered.real', { count: 1, asset: 'USDT', apy: supplyAPY, source: 'on-chain' });
        return [yield];
      } catch (error) {
        this.log.error('yields.fetch.error', { asset: 'USDT', error: error.message });
        throw new Error('Failed to fetch USDT yield data from Aave');
      }
    } catch (error) {
      this.log.error('yields.fetch.error', { error: error.message });
      throw error;
    }
  }

  async supplyToProtocol(protocol, asset, amount) {
    const protocolName = String(protocol || '').toLowerCase();
    if (protocolName !== 'aave-v3' && protocolName !== 'aave') {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }
    return await this.supplyToAave(asset, amount);
  }

  async supplyToAave(asset, amount) {
    await this.initialize();
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');

    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const decimals = this._getAssetDecimals(asset);
      const amountBigInt = this._toBaseUnits(amount, decimals);

      this.log.info('supply.prepare', { asset, amount, amountBigInt: amountBigInt.toString() });

      // Step 1: Check and handle allowance
      try {
        const poolAddress = await this.aaveProtocol.getPoolAddress();
        this.log.info('supply.check_allowance', { asset, poolAddress });

        // Use WDK's internal account to check allowance
        const currentAllowance = await this.account.getAllowance(assetAddress, poolAddress);

        if (currentAllowance < amountBigInt) {
          this.log.info('supply.approve_needed', {
            current: currentAllowance.toString(),
            required: amountBigInt.toString()
          });

          // Request approval via WDK
          const approveResult = await this.account.approve(assetAddress, poolAddress, amountBigInt);
          this.log.info('supply.approve_executed', { hash: approveResult.hash });

          // Wait for a few seconds for the network to reflect the approval
          // In production, we'd wait for confirmation, but WDK's approve might already handle this or return a promise that resolves on inclusion
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          this.log.info('supply.allowance_sufficient', { current: currentAllowance.toString() });
        }
      } catch (allowanceError) {
        this.log.warn('supply.allowance_check_failed', { error: allowanceError.message });
        // We continue anyway, as the supply step might still work or give a better error
      }

      // Step 2: Get quote
      const quote = await this.aaveProtocol.quoteSupply({
        token: assetAddress,
        amount: amountBigInt
      });

      this.log.info('supply.quote', { asset, amount, fee: quote.fee.toString() });

      // Step 3: Execute supply
      const result = await this.aaveProtocol.supply({
        token: assetAddress,
        amount: amountBigInt
      });

      this.log.info('supply.executed', { asset, amount, hash: result.hash, fee: result.fee.toString() });
      return result;
    } catch (error) {
      this.log.error('supply.error', { asset, amount, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async withdrawFromAave(asset, amount) {
    await this.initialize();
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');

    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const decimals = this._getAssetDecimals(asset);
      const amountBigInt = this._toBaseUnits(amount, decimals);

      // Get quote first
      const quote = await this.aaveProtocol.quoteWithdraw({
        token: assetAddress,
        amount: amountBigInt
      });

      this.log.info('withdraw.quote', { asset, amount, fee: quote.fee.toString() });

      // Execute withdraw
      const result = await this.aaveProtocol.withdraw({
        token: assetAddress,
        amount: amountBigInt
      });

      this.log.info('withdraw.executed', { asset, amount, hash: result.hash, fee: result.fee.toString() });
      return result;
    } catch (error) {
      this.log.error('withdraw.error', { asset, amount, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async estimateGas(operation, params = {}) {
    await this.initialize();
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');

    try {
      const asset = params.asset || 'USDT';
      const decimals = this._getAssetDecimals(asset);
      const amount = this._toBaseUnits(params.amount || '1000', decimals);

      let quote;
      switch (operation) {
        case 'supply':
          quote = await this.aaveProtocol.quoteSupply({
            token: this._resolveAssetAddress(asset),
            amount
          });
          break;
        case 'withdraw':
          quote = await this.aaveProtocol.quoteWithdraw({
            token: this._resolveAssetAddress(asset),
            amount
          });
          break;
        case 'borrow':
          quote = await this.aaveProtocol.quoteBorrow({
            token: this._resolveAssetAddress(asset),
            amount
          });
          break;
        case 'repay':
          quote = await this.aaveProtocol.quoteRepay({
            token: this._resolveAssetAddress(asset),
            amount
          });
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      // Get current fee rates with fallback
      let feeRates;
      try {
        feeRates = await this.wallet.getFeeRates();
      } catch (e) {
        this.log.warn('gas.fee_rates.failed', { error: e.message });
        feeRates = { normal: 50000000000n, fast: 100000000000n }; // 50/100 gwei fallback
      }

      const ethPrice = 3000; // Assume $3000/ETH fallback

      return {
        operation,
        chainId: this.chainId,
        gasLimit: quote.fee.toString(),
        gasPriceGwei: (Number(feeRates.normal) / 1e9).toFixed(2),
        maxFeePerGasWei: feeRates.normal.toString(),
        maxPriorityFeePerGasWei: '0',
        estimatedCostETH: (Number(quote.fee) / 1e18).toFixed(6),
        estimatedCostUSD: ((Number(quote.fee) / 1e18) * ethPrice).toFixed(2)
      };
    } catch (error) {
      this.log.error('gas.estimate.error', { operation, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  _resolveAssetAddress(asset) {
    if (!asset) throw new Error('Asset symbol or address is required');

    const addresses = {
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    };

    if (asset.startsWith('0x') && asset.length === 42) {
      return asset;
    }

    const address = addresses[asset.toUpperCase()];
    if (!address) {
      throw new Error(`Unknown asset: ${asset}`);
    }

    return address;
  }

  _getAssetDecimals(asset) {
    const decimalsMap = {
      'USDT': 6,
      'USDC': 6,
      'DAI': 18,
      'WETH': 18,
      'ETH': 18
    };

    if (asset.startsWith('0x')) {
      // For addresses, we'd ideally query the contract, 
      // but for now return 18 as a safe default for most tokens
      return 18;
    }

    return decimalsMap[asset.toUpperCase()] || 18;
  }

  _toBaseUnits(amount, decimals) {
    if (!amount) return 0n;

    // Handle string or number
    const amtStr = String(amount);

    // Split into integer and fractional parts
    const [integer, fractional = ''] = amtStr.split('.');

    // Truncate fractional part to decimals
    const truncatedFractional = fractional.slice(0, decimals).padEnd(decimals, '0');

    // Combine and convert to BigInt
    return BigInt(integer + truncatedFractional);
  }
}
